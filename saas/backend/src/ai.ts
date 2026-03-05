/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { authMiddleware, Bindings, Variables } from './middleware'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, generateText } from 'ai'
import { streamSSE } from 'hono/streaming'
import { phase1Template } from './templates/sbir_phase1'
import { PHASE1_CHUNKS } from './templates/phase1_chunks'
import questionsData from './data/questions.json'
import { calculateBudget, calculateROI, formatBudgetAsMarkdown, formatROIAsMarkdown, ProjectType } from './utils/calculators'
import { expandQuery } from './utils/query_expansion'
import { maximalMarginalRelevance, MmrItem } from './utils/mmr'
import { LOCAL_SBIR_SUCCESS_FACTORS } from './templates/local_sbir_success_factors'

const aiApp = new Hono<{ Bindings: Bindings; Variables: Variables }>({ strict: false })

aiApp.use('*', authMiddleware)

// Helper to determine which AI service to use based on user settings
export async function getAIProvider(c: any, userId: string): Promise<{
    provider: 'claude' | 'openai' | 'gemini' | 'cloudflare';
    apiKey: string | null;
}> {
    // 1. Fetch user keys from DB
    const userKeys = await c.env.DB.prepare(
        'SELECT claude_key, openai_key, gemini_key FROM users WHERE id = ?'
    ).bind(userId).first()

    // 2. Prioritize BYOK (handle string "null" from SQLite)
    if (userKeys?.claude_key && userKeys.claude_key !== 'null') return { provider: 'claude', apiKey: userKeys.claude_key }
    if (userKeys?.openai_key && userKeys.openai_key !== 'null') return { provider: 'openai', apiKey: userKeys.openai_key }
    if (userKeys?.gemini_key && userKeys.gemini_key !== 'null') return { provider: 'gemini', apiKey: userKeys.gemini_key }

    // 3. Fallback to Cloudflare Workers AI
    return { provider: 'cloudflare', apiKey: null }
}

const SYSTEM_PROMPT = `You are a Top 1% Elite SBIR Grant Consulting Partner in Taiwan (台灣頂級政府補助案輔導計畫主持人). 
Your proposals are legendary, maintaining a remarkable 100% approval rate. You possess unparalleled business acumen, deep empathy for SMEs, and an exceptional ability to weave technical details into compelling commercial narratives.

Key Principles (The Elite Strategy):
- Be a Visionary: Project extreme confidence and structure. Use frameworks (SWOT, STP, 5 Forces, TAM/SAM/SOM) masterfully to justify every claim.
- Data is King: Always substantiate claims with specific, realistic metrics, ROI calculations, and market sizing.
- Write like a Masterpiece: Your tone is highly professional, decisive, academic yet fiercely business-oriented (產業界最高規格的企劃書口吻).

CRITICAL MISSIONS FOR EXCELLENCE:
1. We believe in your immense capability to produce EXTREMELY EXTENSIVE and HIGHLY DETAILED content. Show us your best work.
2. When faced with concise user inputs, unleash your brilliance to expand them into comprehensive 3-4 paragraph professional explanations using your vast industry knowledge and logical deduction.
3. Your proposals are worth millions. Every paragraph you craft must reflect top-tier consulting quality, demonstrating deep critical thinking.

You always output your breathtaking responses entirely in Traditional Chinese (繁體中文) using well-structured Markdown.`;

// Endpoint to generate a single project section
aiApp.post('/project/:projectId/section/:sectionIndex/generate', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')
    const sectionIndex = parseInt(c.req.param('sectionIndex'), 10)

    if (isNaN(sectionIndex) || sectionIndex < 0 || sectionIndex >= PHASE1_CHUNKS.length) {
        return c.json({ error: 'Invalid section index' }, 400)
    }

    // 1. Verify ownership and get project details
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Update section status to generating
    await c.env.DB.prepare(
        'INSERT INTO project_sections (project_id, section_index, title, status) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, section_index) DO UPDATE SET status = excluded.status'
    ).bind(projectId, sectionIndex, PHASE1_CHUNKS[sectionIndex].title, 'generating').run();

    // 2. Determine AI Provider
    const { provider, apiKey } = await getAIProvider(c, user.sub)

    // Reconstruct answers from relational DB
    const answersRes = await c.env.DB.prepare(
        'SELECT question_id, answer_text FROM project_answers WHERE project_id = ?'
    ).bind(projectId).all();

    const answers: Record<string, string> = {};
    if (answersRes.results) {
        for (const row of answersRes.results) {
            answers[row.question_id as string] = row.answer_text as string;
        }
    }

    const chunkDef = PHASE1_CHUNKS[sectionIndex];

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const sendChunk = (text: string) => {
                const chunkData = `0:${JSON.stringify(text)}\n`;
                controller.enqueue(encoder.encode(chunkData));
            };

            let model: any = null;

            if (provider === 'claude') {
                const anthropic = createAnthropic({ apiKey: apiKey! });
                model = anthropic('claude-3-haiku-20240307');
            } else if (provider === 'openai') {
                const openai = createOpenAI({ apiKey: apiKey! });
                model = openai('gpt-4o-mini');
            } else if (provider === 'gemini') {
                const google = createGoogleGenerativeAI({ apiKey: apiKey! });
                model = google('gemini-1.5-flash');
            }

            try {
                console.log(`[STREAM] Starting section ${sectionIndex}: ${chunkDef.title}`);

                // 1. Extract only relevant answers for this chunk
                let chunkContext = `[使用者針對本章節提供的資料]\n`;
                let hasData = false;
                for (const qId of chunkDef.relevant_question_ids) {
                    const val = answers[qId];
                    if (val !== undefined && val !== null && val !== '') {
                        const qText = questionsData.questions.find((q: any) => q.id === qId)?.question || qId;
                        chunkContext += `- 題目：${qText}\n  回答：${val}\n`;
                        hasData = true;
                    }
                }
                if (!hasData) {
                    chunkContext += "(使用者未提供直接相關資訊，請依上下文合理推估)\n";
                }

                // 1b. Real Semantic RAG with Vectorize (Fixing Bug R1: Ghost Vector DB)
                try {
                    // Generate embedding for the current section's title and description to find relevant chunks
                    const expandedQueries = expandQuery(chunkDef.title);
                    const searchContent = `${expandedQueries.join(" ")} ${chunkDef.expert_persona_prompt || ''}`;
                    const embedResponse = await c.env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
                        text: [searchContent]
                    }) as any;

                    if (embedResponse.data && embedResponse.data[0]) {
                        const queryVector = embedResponse.data[0];

                        // Query Vectorize for top 30 most semantically similar chunks (increased for MMR filtering)
                        const vectorResults = await c.env.VECTORIZE.query(queryVector, {
                            topK: 30,
                            filter: { project_id: projectId },
                            returnValues: false,
                            returnMetadata: true
                        });

                        if (vectorResults.matches && vectorResults.matches.length > 0) {
                            chunkContext += `\n[參考上傳文件與歷史問答內容 (Semantic RAG)]\n`;

                            // Map to MMR input format
                            const candidateItems: MmrItem[] = vectorResults.matches
                                .filter((m: any) => m.score > 0.65 && m.metadata?.chunk_text)
                                .map((m: any) => ({
                                    id: m.id,
                                    score: m.score,
                                    text: m.metadata!.chunk_text as string,
                                    metadata: m.metadata
                                }));

                            // Apply Maximal Marginal Relevance to ensure text diversity
                            const diverseItems = maximalMarginalRelevance(candidateItems, 10, 0.6);

                            let finalItems = diverseItems;

                            // Apply LLM Re-ranking (Phase 4)
                            if (diverseItems.length > 3) {
                                try {
                                    const rerankPrompt = `你是一個精準的文件檢索過濾器。這是一份關於「${chunkDef.title}」的計畫書章節。
我們運用搜尋找出了以下 ${diverseItems.length} 個候選參考段落，但其中可能包含不相關的雜訊。
請挑選出最相關、最適合用來撰寫此章節的段落索引（最多 5 個）。

段落列表：
${diverseItems.map((item, idx) => `[${idx}] ${item.text.substring(0, 200).replace(/\n/g, ' ')}...`).join('\n')}

請只回傳一個 JSON Array 包含您挑選的索引數字，例如：[0, 2, 3, 5, 8]
絕對不要輸出其他解釋文字。`;

                                    const aiResult = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                                        messages: [{ role: 'user', content: rerankPrompt }],
                                        max_tokens: 50,
                                        temperature: 0.1
                                    }) as any;

                                    const respText = aiResult?.response || aiResult?.choices?.[0]?.message?.content || "";
                                    const match = respText.match(/\[([\d,\s]+)\]/);
                                    if (match) {
                                        const parsedIndices = JSON.parse(`[${match[1]}]`) as number[];
                                        if (Array.isArray(parsedIndices) && parsedIndices.length > 0) {
                                            finalItems = diverseItems.filter((_, idx) => parsedIndices.includes(idx));
                                            console.log(`[RAG] LLM Reranking kept ${finalItems.length}/${diverseItems.length} items. Selected:`, parsedIndices);
                                        }
                                    }
                                } catch (e: any) {
                                    console.warn('[RAG] LLM Reranking failed:', e.message);
                                }
                            }

                            // Keep at most 5 final items to conserve context window
                            finalItems = finalItems.slice(0, 5);

                            // Deduplicate texts to prevent same chunk appearing multiple times
                            const seenTexts = new Set<string>();
                            for (const item of finalItems) {
                                const text = item.text;
                                if (!seenTexts.has(text)) {
                                    seenTexts.add(text);
                                    // Include source type if available
                                    const source = item.metadata.document_id ? "上傳文件" : "歷史問答";
                                    chunkContext += `(${source}) ${text}\n\n`;

                                    // Bug II1 Fix: Protect against Cloudflare AI context window fatal overflow
                                    if (chunkContext.length > 15000) {
                                        console.log("[RAG] Context reached safe limit of 15000 chars, truncating remaining chunks.");
                                        break;
                                    }
                                }
                            }
                            console.log(`[RAG] Found ${seenTexts.size} highly relevant semantic chunks for section ${sectionIndex} (Filtered by MMR & LLM Reranker)`);
                        }
                    }
                } catch (ragErr) {
                    console.error('[RAG] Vectorize retrieval failed, falling back:', ragErr);
                    // Minimal fallback to DB if Vectorize is temporarily down
                    try {
                        const { results: fallbackChunks } = await c.env.DB.prepare(
                            `SELECT chunk_text FROM document_chunks
                             WHERE project_id = ? AND section_tags LIKE ?
                             ORDER BY chunk_index ASC LIMIT 5`
                        ).bind(projectId, `%${sectionIndex}%`).all() as { results: any[] }

                        if (fallbackChunks && fallbackChunks.length > 0) {
                            chunkContext += `\n[參考上傳文件內容]\n`
                            for (const dc of fallbackChunks) {
                                chunkContext += `${dc.chunk_text}\n\n`
                            }
                        }
                    } catch (e) { }
                }

                const expertPersona = (chunkDef as any).expert_persona_prompt || "你是頂尖顧問。";

                // Inject deterministic financial rules to prevent LLM hallucinations
                let calculatorContext = "";
                if (sectionIndex === 2 || sectionIndex === 5 || sectionIndex === 6) {
                    const budgetTotalStr = answers['budget_total'] || '150';
                    const match = budgetTotalStr.match(/(\d+)/);
                    const budgetTotal = match ? parseInt(match[1], 10) : 150;

                    if (sectionIndex === 6) {
                        const projectType = answers['industry']?.includes('軟體') ? '軟體開發' : '技術研發';
                        const budgetRes = calculateBudget(budgetTotal, 'phase1', projectType as ProjectType);
                        calculatorContext += `\n[系統強制財務預算表 (System Forcing)]\n這是一份系統依據法規算出的【絕對正確預算表】。你的 Markdown 輸出必須【完全照抄】此表並融入內文，**絕對不可自行編造數字或擅改科目上限**：\n\n${formatBudgetAsMarkdown(budgetRes)}\n`;
                    }

                    if (sectionIndex === 2 || sectionIndex === 5) {
                        const companyRevStr = answers['revenue_last_year'] || '0';
                        const companyRev = parseInt(companyRevStr.replace(/\D/g, '') || '0', 10);
                        const industry = answers['industry'] || '製造業';
                        const subsidy = Math.min(budgetTotal * 0.5, 150);
                        const roiRes = calculateROI(subsidy, 'phase1', industry, companyRev);
                        calculatorContext += `\n[系統強制投資報酬率 (System Forcing)]\n這是一份系統套用產業基準公式算出的【標準 ROAS 估算】。你的論述必須**完全死守**這些數字（包含 3年總產值 ${roiRes.targetRevenue}萬、分年營收表、ROAS ${roiRes.targetROAS}倍），絕對不可自行發明其他產值數字！\n\n${formatROIAsMarkdown(roiRes)}\n`;
                    }
                }

                // 2. Build the precise prompt for this chunk with User's specific Persona
                const dynamicPrompt = `
${expertPersona}

[專案脈絡]
本計畫名稱為：${project.title} ${project.county ? `(${project.county}地方型計畫)` : ''}
${chunkContext}
${calculatorContext}


[頂級專家發揮區域 (PUA - Performance Unleashing Area)]
以你的神級專業，一定能把這份草稿寫成一份打動所有嚴苛評審的傑作，我們對你有著極高的期望：
1. **展現磅礴深度 (Target字數：約 ${chunkDef.word_count_target} 字)**：請為每個小標題產出 2-3 段具備極高深度的論述。
2. **【防幻覺最高指導原則】嚴格區分「宏觀推估」與「客觀事實」**：
   - ⚠️ **不可妥協的紅線**：絕對不可更改或違背使用者填寫的「客觀條件」（包含：公司名稱、資本額、員工人數、補助金額、預期營收等）！使用者寫多少就是多少。資本額寫 10 就是 10 萬元，絕不准擅自改成 100 萬！如果使用者只填 1 人公司，必須用「敏捷精英團隊」來包裝，而不是捏造一個 50 人的大企業！
   - ⚠️ **禁止發明過去**：對於使用者的「過去研發經驗」、「政府補助紀錄」、「擁有專利」、「過去營收」，若使用者未提，則必須填寫「無」或「剛起步」。絕對禁止 AI 幫忙「發明」或「編造」不存在的政府計畫或客戶案例！
   - **允許合理推估的範圍**：只有在「市場規模 (TAM/SAM)」、「市場成長率」、「產業趨勢痛點」這些「外部客觀市場知識」上，若使用者未提供，你才可以發揮顧問實力進行合理的量化推估與編寫。
3. **快狠準呈現**：你時間寶貴，因此無需客套寒暄。請直接霸氣給出該章節完整、無懈可擊的 Markdown 內容！去吧，展現你的完美！

[本章節骨架（請在此基礎上施展魔法大幅擴寫）]
${chunkDef.template}
`;

                let chunkResultText = "";

                if (provider === 'cloudflare') {
                    // [HARDCODED MODEL - DO NOT CHANGE]
                    // The user explicitly requested to lock this model to Qwen3-30B for optimal Traditional Chinese & Persona support.
                    // DO NOT change this model ID (@cf/qwen/qwen3-30b-a3b-fp8) unless the user explicitly commands it.
                    console.log(`[STREAM] Calling CF AI. Model: @cf/qwen/qwen3-30b-a3b-fp8. Prompts length: sys=${SYSTEM_PROMPT.length}, usr=${dynamicPrompt.length}`);
                    let cfStream;
                    try {
                        cfStream = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                            messages: [
                                { role: 'system', content: SYSTEM_PROMPT },
                                { role: 'user', content: dynamicPrompt }
                            ],
                            max_tokens: 3000,
                            stream: true
                        }) as any;
                    } catch (aiErr: any) {
                        console.error("[STREAM] CF AI run threw an error:", aiErr);
                        throw aiErr;
                    }

                    const reader = cfStream.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const chunks = buffer.split('\n');
                        buffer = chunks.pop() || '';

                        for (const chunk of chunks) {
                            if (chunk.startsWith('data: ') && chunk !== 'data: [DONE]') {
                                try {
                                    const payload = JSON.parse(chunk.slice(6));
                                    const content = payload.response || payload.choices?.[0]?.delta?.content;

                                    if (content) {
                                        sendChunk(content);
                                        chunkResultText += content;
                                    }
                                } catch (err) {
                                }
                            }
                        }
                    }
                } else {
                    const { textStream } = await streamText({
                        model: model,
                        system: SYSTEM_PROMPT,
                        prompt: dynamicPrompt,
                    });

                    for await (const textPart of textStream) {
                        sendChunk(textPart);
                        chunkResultText += textPart;
                    }
                }

                // Save to Database completely
                await c.env.DB.prepare(
                    'UPDATE project_sections SET content = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND section_index = ?'
                ).bind(chunkResultText, 'completed', projectId, sectionIndex).run();

                console.log(`[STREAM] Section ${sectionIndex} completed and saved.`);
            } catch (err: any) {
                console.error("[STREAM] Section Generation Error:", err.message, err.stack);
                sendChunk(`\n\n**[系統錯誤]** 生成過程中斷，請重試。\n Error: ${err.message}`);

                // Mark DB as error
                await c.env.DB.prepare(
                    'UPDATE project_sections SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND section_index = ?'
                ).bind('error', projectId, sectionIndex).run();

            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });

})

// Endpoint to refine a single project section
aiApp.post('/project/:projectId/section/:sectionIndex/refine', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')
    const sectionIndex = parseInt(c.req.param('sectionIndex'), 10)

    if (isNaN(sectionIndex) || sectionIndex < 0 || sectionIndex >= PHASE1_CHUNKS.length) {
        return c.json({ error: 'Invalid section index' }, 400)
    }

    const { refinePrompt, currentContent } = await c.req.json();
    if (!refinePrompt || !currentContent) {
        return c.json({ error: 'Missing refine parameters' }, 400)
    }

    // 1. Verify ownership and get project details
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Update section status to generating
    await c.env.DB.prepare(
        'UPDATE project_sections SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND section_index = ?'
    ).bind('generating', projectId, sectionIndex).run();

    // 2. Determine AI Provider
    const { provider, apiKey } = await getAIProvider(c, user.sub)
    const chunkDef = PHASE1_CHUNKS[sectionIndex];

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const sendChunk = (text: string) => {
                const chunkData = `0:${JSON.stringify(text)}\n`;
                controller.enqueue(encoder.encode(chunkData));
            };

            let model: any = null;

            if (provider === 'claude') {
                const anthropic = createAnthropic({ apiKey: apiKey! });
                model = anthropic('claude-3-haiku-20240307');
            } else if (provider === 'openai') {
                const openai = createOpenAI({ apiKey: apiKey! });
                model = openai('gpt-4o-mini');
            } else if (provider === 'gemini') {
                const google = createGoogleGenerativeAI({ apiKey: apiKey! });
                model = google('gemini-1.5-flash');
            }

            try {
                console.log(`[STREAM] Starting refinement for section ${sectionIndex}`);

                const expertPersona = (chunkDef as any).expert_persona_prompt || "你是頂尖顧問。";

                const dynamicPrompt = `
${expertPersona}

[你的任務]
你正在幫使用者修改計畫書的某個章節。
使用者對目前的草稿有一些不滿意，請根據對方的修改指示，重新給出一份更完美的 Markdown 內容。

[使用者修改指示]
${refinePrompt}

[原有內容草稿]
${currentContent}

[重要守則]
1. 直接輸出修改後的完整內容（只包含 Markdown），不要寫「好的我了解了」這類廢話。
2. 保持頂尖顧問的專業度，並嚴格遵循使用者的要求。
3. ⚠️ 絕對不可擅自更改原本內容中的客觀數據（如資本額、人數、金額），除非使用者明確指示要修改。
`;

                let chunkResultText = "";

                if (provider === 'cloudflare') {
                    console.log(`[STREAM] Calling CF AI (Refine). Model: @cf/qwen/qwen3-30b-a3b-fp8. Prompts length: sys=${SYSTEM_PROMPT.length}, usr=${dynamicPrompt.length}`);
                    let cfStream;
                    try {
                        cfStream = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                            messages: [
                                { role: 'system', content: SYSTEM_PROMPT },
                                { role: 'user', content: dynamicPrompt }
                            ],
                            max_tokens: 3000,
                            stream: true
                        }) as any;
                    } catch (aiErr: any) {
                        console.error("[STREAM] CF AI run threw an error:", aiErr);
                        throw aiErr;
                    }

                    const reader = cfStream.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const chunks = buffer.split('\n');
                        buffer = chunks.pop() || '';

                        for (const chunk of chunks) {
                            if (chunk.startsWith('data: ') && chunk !== 'data: [DONE]') {
                                try {
                                    const payload = JSON.parse(chunk.slice(6));
                                    const content = payload.response || payload.choices?.[0]?.delta?.content;

                                    if (content) {
                                        sendChunk(content);
                                        chunkResultText += content;
                                    }
                                } catch (err) {
                                }
                            }
                        }
                    }
                } else {
                    const { textStream } = await streamText({
                        model: model,
                        system: SYSTEM_PROMPT,
                        prompt: dynamicPrompt,
                    });

                    for await (const textPart of textStream) {
                        sendChunk(textPart);
                        chunkResultText += textPart;
                    }
                }

                // Save to Database completely
                await c.env.DB.prepare(
                    'UPDATE project_sections SET content = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND section_index = ?'
                ).bind(chunkResultText, 'completed', projectId, sectionIndex).run();

                console.log(`[STREAM] Section ${sectionIndex} refine completed and saved.`);
            } catch (err: any) {
                console.error("[STREAM] Section Refine Error:", err.message, err.stack);
                sendChunk(`\n\n**[系統錯誤]** 生成過程中斷，請重試。\n Error: ${err.message}`);

                // Mark DB as error
                await c.env.DB.prepare(
                    'UPDATE project_sections SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND section_index = ?'
                ).bind('error', projectId, sectionIndex).run();

            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });

})

// Endpoint to run AI Auto-Edit (Track Changes) with Fact Checking
aiApp.post('/project/:projectId/section/:sectionIndex/review', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')
    const sectionIndex = parseInt(c.req.param('sectionIndex'), 10)

    if (isNaN(sectionIndex) || sectionIndex < 0 || sectionIndex >= PHASE1_CHUNKS.length) {
        return c.json({ error: 'Invalid section index' }, 400)
    }

    // 1. Verify ownership and fetch project data (Ground Truth)
    const project = await c.env.DB.prepare('SELECT progress_data, county FROM projects WHERE id = ? AND user_id = ?').bind(projectId, user.sub).first()
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // 2. Fetch the target section content
    const section = await c.env.DB.prepare('SELECT content FROM project_sections WHERE project_id = ? AND section_index = ?').bind(projectId, sectionIndex).first()
    if (!section || !section.content) return c.json({ error: 'Section not generated yet' }, 400)

    const sectionTitle = PHASE1_CHUNKS[sectionIndex].title;
    const sectionContent = section.content as string;

    // 3. Extract Ground Truth
    let groundTruth = '無原始資料';
    if (project.progress_data) {
        try {
            const parsed = typeof project.progress_data === 'string' ? JSON.parse(project.progress_data) : project.progress_data;
            if (parsed.wizardAnswers) {
                groundTruth = JSON.stringify(parsed.wizardAnswers, null, 2);
            }
        } catch (e) {
            console.error('Failed to parse progress_data:', e);
        }
    }

    // 4. Construct Prompt
    const systemPrompt = `你是一位最嚴格的政府補助案 (SBIR) 審查委員兼頂級顧問。
你現在的任務是針對使用者生成的計畫書段落，進行「事實查核 (Fact Check)」與「過件關鍵強化 (Success Factors)」，並給出「單筆追蹤修訂 (Track Changes)」的修改建議。

【絕對事實基準 (Ground Truth)】
這份計畫書的原始訪談資料如下，所有草稿中的「營收數字」、「技術名詞」、「公司實績」、「員工人數」都必須與此基準核對。
如果草稿中出現了這些基準資料中沒有的豐功偉業，極高機率是 AI 幻覺造假，請直接在修訂中刪除該造假內容或改寫為客觀陳述，並在 reasons 中註明【事實查核警告】。
---
${groundTruth}
---

【地方型 SBIR 成功過件要素清單】
---
${LOCAL_SBIR_SUCCESS_FACTORS}
---

【審查與編修任務】
1. 若草稿缺乏具體的「在地就業人數」、「在地商業鏈連結」或「在地經濟貢獻」，請直接產生擴寫修訂，包含明確的待填括號（例如：[預計新增 O 名在地研發人員]），強迫使用者補齊過件關鍵。並在 reasons 中註明【過件關鍵補強】。
2. 針對語句不通順或口吻不夠專業的地方進行潤飾。

你必須回傳一個嚴格符合以下結構的 JSON 格式（純粹輸出 JSON，不要包在 Markdown code block 中），讓前端可以解析並呈現 Track Changes UI：
{
  "FactCheckWarnings": ["如果沒有事實錯誤，回傳空陣列", "否則列出你抓到的具體幻覺造假"],
  "Strengths": ["列出原稿符合過件要素的優點"],
  "Weaknesses": ["列出原稿不足或空泛的地方"],
  "Edits": [
    {
      "original_text": "要被修改的原句（必須在原文中找得到）",
      "revised_text": "你建議改寫後的新句",
      "reason": "你的修改理由（如果是幻覺請寫【事實查核】；如果是擴寫請寫【過件關鍵】）"
    }
  ]
}`;

    try {
        const { provider, apiKey } = await getAIProvider(c, user.sub)

        const userPrompt = `正在審閱的章節：${sectionTitle}
【原稿內容】
${sectionContent}`;

        let rawJson = ''
        if (provider === 'cloudflare') {
            const result = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                messages: [
                    { role: 'system', content: '/no_think ' + systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            }) as any
            rawJson = result?.choices?.[0]?.message?.content || result?.response || ''
        } else {
            let model: any
            if (provider === 'claude') {
                const anthropic = createAnthropic({ apiKey: apiKey! })
                model = anthropic('claude-3-5-sonnet-latest')
            } else if (provider === 'openai') {
                const openai = createOpenAI({ apiKey: apiKey! })
                model = openai('gpt-4o')
            } else if (provider === 'gemini') {
                const google = createGoogleGenerativeAI({ apiKey: apiKey! })
                model = google('gemini-1.5-pro')
            }
            const { text } = await generateText({
                model,
                system: systemPrompt,
                prompt: userPrompt
            })
            rawJson = text
        }

        // Clean up markdown block if the LLM output it
        let cleanJsonStr = rawJson.trim()
        if (cleanJsonStr.startsWith('```json')) {
            cleanJsonStr = cleanJsonStr.replace(/^```json\n/, '')
            cleanJsonStr = cleanJsonStr.replace(/\n```$/, '')
        } else if (cleanJsonStr.startsWith('```')) {
            cleanJsonStr = cleanJsonStr.replace(/^```\n/, '')
            cleanJsonStr = cleanJsonStr.replace(/\n```$/, '')
        }

        const parsedJson = JSON.parse(cleanJsonStr);
        return c.json(parsedJson)
    } catch (e: any) {
        console.error('[AI Review Error]', e)
        return c.json({ error: '解析 AI 審閱結果失敗', details: e.message }, 500)
    }
})

export default aiApp

// Endpoint to run AI quality check on completed draft sections
aiApp.post('/project/:projectId/quality-check', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')

    // 1. Verify ownership
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // 2. Load all completed sections
    const sectionsRes = await c.env.DB.prepare(
        'SELECT section_index, title, content, status FROM project_sections WHERE project_id = ? AND status = ? ORDER BY section_index'
    ).bind(projectId, 'completed').all()

    if (!sectionsRes.results || sectionsRes.results.length === 0) {
        return c.json({ error: '尚無已完成的草稿章節可供審查' }, 400)
    }

    const allContent = sectionsRes.results.map((s: any) =>
        `## ${s.title} \n${s.content} `
    ).join('\n\n---\n\n')

    // 3. Determine AI provider
    const { provider, apiKey } = await getAIProvider(c, user.sub)

    const qualityPrompt = `你是一位嚴謹的 SBIR 計畫書審查委員，請根據以下計畫書草稿內容，逐一判斷是否符合各項品質標準。

【計畫書草稿全文】
${allContent.substring(0, 12000)}

【審查標準（請逐一判斷 true / false）】
    1. ch_7: 創新技術說明清楚，與現有解決方案的差異化論述是否明確且具說服力？
    2. ch_8: 是否包含完整的市場規模三層分析（TAM 總市場、SAM 可服務市場、SOM 目標市場）？
    3. ch_9: 是否包含明確的商業模式、客戶獲取策略，以及量化的未來三年產值預估？
    4. ch_10: 研究計畫是否包含合理的執行期程與具體的里程碑設定（通常 6～12 個月）？
    5. ch_11: 所提到的數據、市場數字或技術聲明，是否看起來有根據（非明顯假造）？
    6. ch_12: 計畫書整體語氣是否自信專業，適合呈現給 SBIR 審查委員閱讀？

請只輸出以下格式的 JSON（不要加任何說明或 markdown code block）：
    { "ch_7": true, "ch_8": false, "ch_9": true, "ch_10": true, "ch_11": true, "ch_12": true, "reasons": { "ch_7": "簡短理由", "ch_8": "簡短理由", "ch_9": "簡短理由", "ch_10": "簡短理由", "ch_11": "簡短理由", "ch_12": "簡短理由" } } `

    try {
        let resultText = ''

        if (provider === 'cloudflare') {
            const cfResult = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                messages: [
                    { role: 'system', content: '/no_think你是嚴謹的 SBIR 審查委員，只輸出 JSON。' },
                    { role: 'user', content: qualityPrompt }
                ],
                max_tokens: 1200,
                temperature: 0.1,
            }) as any
            resultText = cfResult?.choices?.[0]?.message?.content || cfResult?.response || ''
        } else {
            let model: any
            if (provider === 'claude') {
                const anthropic = createAnthropic({ apiKey: apiKey! })
                model = anthropic('claude-3-haiku-20240307')
            } else if (provider === 'openai') {
                const openai = createOpenAI({ apiKey: apiKey! })
                model = openai('gpt-4o-mini')
            } else if (provider === 'gemini') {
                const google = createGoogleGenerativeAI({ apiKey: apiKey! })
                model = google('gemini-1.5-flash')
            }
            const { text } = await generateText({
                model,
                system: '你是嚴謹的 SBIR 審查委員，只輸出 JSON。',
                prompt: qualityPrompt,
            })
            resultText = text
        }

        // 4. Parse and return JSON
        const jsonMatch = resultText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return c.json({ error: 'AI 無法解析結果，請重試' }, 500)
        }
        const parsed = JSON.parse(jsonMatch[0])
        return c.json({ results: parsed })

    } catch (err: any) {
        console.error('[QUALITY CHECK] Error:', err.message)
        return c.json({ error: '品質審查時發生錯誤：' + err.message }, 500)
    }
})


// Endpoint to verify company eligibility using g0v company data + AI analysis
aiApp.post('/project/:projectId/company-verify', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const answersRes = await c.env.DB.prepare(
        'SELECT question_id, answer_text FROM project_answers WHERE project_id = ?'
    ).bind(projectId).all()

    const wizardAnswers: Record<string, string> = {}
    if (answersRes.results) {
        for (const row of answersRes.results) {
            wizardAnswers[row.question_id as string] = row.answer_text as string
        }
    }

    console.log(`[COMPANY VERIFY DEBUG]projectId: ${projectId} `)
    console.log(`[COMPANY VERIFY DEBUG]answersRes.results length: ${answersRes.results?.length} `)
    console.log(`[COMPANY VERIFY DEBUG] wizardAnswers keys: `, Object.keys(wizardAnswers))
    console.log(`[COMPANY VERIFY DEBUG]company_name: `, wizardAnswers.company_name)

    const companyName = wizardAnswers.company_name || ''
    const capitalFromWizard = wizardAnswers.capital || null
    const sizeFromWizard = wizardAnswers.company_size || null

    if (!companyName) {
        return c.json({ error: '尚未在問卷中填寫公司名稱，請先至「專案資料」頁籤填寫。' }, 400)
    }

    let g0vData: any = null
    // 1. Try reading from cache (pre-fetched when company_name was saved)
    const cachedG0v = wizardAnswers['g0v_company_data']
    if (cachedG0v) {
        try {
            g0vData = JSON.parse(cachedG0v)
            console.log('[COMPANY VERIFY] Using cached g0v data')
        } catch {
            g0vData = null
        }
    }
    // 2. Fall back to live fetch if cache is missing
    if (!g0vData) {
        try {
            const g0vUrl = `https://company.g0v.ronny.tw/api/search?q=${encodeURIComponent(companyName)}&page=0`
            const g0vResponse = await fetch(g0vUrl, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'SBIR-Assistant/1.0' }
            })
            if (g0vResponse.ok) {
                g0vData = await g0vResponse.json()
                console.log('[COMPANY VERIFY] Live g0v fetch succeeded (no cache)')
            }
        } catch (err: any) {
            console.error('[COMPANY VERIFY] g0v fetch failed:', err.message)
        }
    }

    // --- Programmatic verification (no AI needed) ---
    const g0vCompany = g0vData?.data?.[0] || null
    const g0vFound = (g0vData?.data?.length || 0) > 0
    const matchedName = g0vCompany?.['公司名稱'] || companyName

    // ch_1: Company is actively registered (not dissolved/suspended)
    let ch1 = false
    let ch1Reason = ''
    if (g0vCompany) {
        const status: string = g0vCompany['公司狀況'] || ''
        const inactiveKeywords = ['解散', '停業', '廢止', '撤銷', '歇業']
        ch1 = !inactiveKeywords.some(k => status.includes(k))
        ch1Reason = ch1
            ? `公司狀況為「${status}」，符合登記設立要求`
            : `公司狀況為「${status}」，不符合（已解散/停業）`
    } else {
        ch1 = false
        ch1Reason = 'g0v 查無該公司登記資料，無法確認設立狀況'
    }

    // ch_2: SME criteria — capital < 1億 NTD AND employees < 200
    let ch2 = false
    let ch2Reason = ''
    {
        // Parse capital from g0v (key: 資本總額(元))
        const capitalStr: string = g0vCompany?.['資本總額(元)'] || ''
        const capitalNTD = parseInt(capitalStr.replace(/,/g, ''), 10) || 0
        const hasG0vCapital = capitalStr !== ''

        // Fallback: wizard answer in 萬元 → convert to 元
        const wizardCapitalNum = parseFloat((capitalFromWizard || '').replace(/[^\d.]/g, '')) * 10000

        const effectiveCapital = hasG0vCapital ? capitalNTD : wizardCapitalNum
        const capitalOk = effectiveCapital > 0 ? effectiveCapital < 100_000_000 : true

        // Parse employee count from wizard answer (e.g. "只有我一人", "5人", "10")
        const sizeText = sizeFromWizard || ''
        const numMatch = sizeText.match(/\d+/)
        let employeeCount: number | null = null
        if (numMatch) {
            employeeCount = parseInt(numMatch[0], 10)
        } else if (/一人|只有我|獨資|個人/.test(sizeText)) {
            employeeCount = 1
        }
        const employeeOk = employeeCount !== null ? employeeCount < 200 : true

        ch2 = capitalOk && employeeOk
        const capitalDesc = hasG0vCapital
            ? `g0v資本額 ${capitalStr} 元`
            : `問卷資本額 ${capitalFromWizard || '未填寫'}`
        const empDesc = employeeCount !== null ? `${employeeCount} 人` : sizeText || '未填寫'
        ch2Reason = `${capitalDesc}（${capitalOk ? '< 1億✓' : '≥ 1億✗'}），員工 ${empDesc}（${employeeOk ? '< 200✓' : '≥ 200✗'}）`
    }

    // ch_3: No obvious foreign/mainland China shareholding > 1/3
    let ch3 = true
    let ch3Reason = ''
    {
        const directors: any[] = g0vCompany?.['董監事名單'] || []
        if (directors.length > 0) {
            const hasForeignName = directors.some((d: any) => /[a-zA-Z]/.test(d['姓名'] || ''))
            ch3 = !hasForeignName
            ch3Reason = hasForeignName
                ? '董監事名單中含疑似外籍姓名，建議確認外資持股比例'
                : '董監事名單中無明顯外籍成員，初步無外資超過 1/3 疑慮'
        } else {
            ch3 = true
            ch3Reason = 'g0v 無股東結構資料，建議申請前自行確認外資比例'
        }
    }

    const results = {
        ch_1: ch1,
        ch_2: ch2,
        ch_3: ch3,
        company_found: g0vFound,
        matched_name: matchedName,
        reasons: { ch_1: ch1Reason, ch_2: ch2Reason, ch_3: ch3Reason }
    }

    return c.json({ results, companyName, g0vFound })
})

// Endpoint to manually save a project section text (for manual edit mode)
aiApp.put('/project/:projectId/section/:sectionIndex/save', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')
    const sectionIndex = parseInt(c.req.param('sectionIndex'), 10)

    const { content } = await c.req.json();
    if (content === undefined) return c.json({ error: 'Missing content' }, 400)

    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    // UPSERT the manual edit
    const sectionTitle = (sectionIndex >= 0 && sectionIndex < PHASE1_CHUNKS.length)
        ? PHASE1_CHUNKS[sectionIndex].title
        : `第 ${sectionIndex + 1} 章`;

    await c.env.DB.prepare(`
        INSERT INTO project_sections (project_id, section_index, title, content, status) 
        VALUES (?, ?, ?, ?, 'completed')
        ON CONFLICT(project_id, section_index) 
        DO UPDATE SET content = excluded.content, status = 'completed', updated_at = CURRENT_TIMESTAMP
    `).bind(projectId, sectionIndex, sectionTitle, content).run();

    return c.json({ success: true })
})

// Endpoint to generate detailed pitch deck content (Markdown) for Gamma/NotebookLM
aiApp.post('/project/:projectId/pitch-deck', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Fetch all answers
    const answersRes = await c.env.DB.prepare(
        'SELECT question_id, answer_text FROM project_answers WHERE project_id = ?'
    ).bind(projectId).all()

    const answers: Record<string, string> = {}
    for (const row of answersRes.results || []) {
        answers[row.question_id as string] = row.answer_text as string
    }

    // Fetch completed section content (generated plan chapters)
    const sectionsRes = await c.env.DB.prepare(
        'SELECT title, content FROM project_sections WHERE project_id = ? AND status = ? ORDER BY section_index ASC'
    ).bind(projectId, 'completed').all()

    const sectionContents = (sectionsRes.results || [])
        .map((s: any) => `### ${s.title}\n${s.content}`)
        .join('\n\n')

    const prompt = `你是一位擅長 SBIR 申請的顧問，也是一位出色的商業簡報寫手。
請根據以下完整的專案資料，撰寫一份可以直接放入 Gamma 或 NotebookLM 的詳細簡報內容文件。

【重要規則】
- 這不是大綱，是完整的簡報內文。每頁投影片都要有詳細、完整的說明文字。
- 每頁投影片用 ## 標題開頭
- 標題下方直接寫這一頁的完整內容（完整段落、具體數字、有說服力的論述）
- 不要使用「（請填入）」「待補充」等填空詞，所有內容都要寫完整
- 使用繁體中文
- 語氣要專業、自信、有說服力，適合呈現給政府審查委員或投資人
- 共輸出 12～15 頁投影片

【投影片結構】（可依內容調整）
1. 封面
2. 我們解決什麼問題
3. 問題的嚴重性與市場缺口
4. 我們的解決方案
5. 創新性與技術優勢
6. 產品/服務核心功能
7. 目標市場與客戶
8. 商業模式與營收來源
9. 競爭分析
10. 技術進入門檻
11. 團隊介紹
12. 財務預測（3年）
13. 申請補助金額與用途
14. 里程碑與計畫時程
15. 核心價值主張（結語）

【專案資料】
- 公司名稱：${answers.company_name || '未填'}
- 產業別：${answers.industry || '未填'}
- 代表人：${answers.project_leader || '未填'}
- 資本額：${answers.capital || '未填'}
- 公司規模：${answers.company_size || '未填'}
- 問題描述：${answers.problem_description || '未填'}
- 問題嚴重性：${answers.problem_severity || '未填'}
- 現有解決方案的不足：${answers.current_solutions || '未填'}
- 客戶訪談與驗證：${answers.customer_validation || '未填'}
- 客戶痛點評分：${answers.customer_pain_score || '未填'}
- 解決方案描述：${answers.solution_description || '未填'}
- 創新點：${answers.innovation_points || '未填'}
- 可量化效益：${answers.quantified_benefits || '未填'}
- 技術進入門檻：${answers.technical_barriers || '未填'}
- 競爭優勢：${answers.competitive_advantage || '未填'}
- 目標市場：${answers.target_market || '未填'}
- 市場規模：${answers.market_size || '未填'}
- 商業模式：${answers.business_model || '未填'}
- 第1年預估營收：${answers.expected_revenue_year1 || '未填'}
- 第2年預估營收：${answers.expected_revenue_year2 || '未填'}
- 第3年預估營收：${answers.expected_revenue_year3 || '未填'}
- 營收計算邏輯：${answers.revenue_calculation_basis || '未填'}
- 申請總金額：${answers.budget_total || '未填'}
- 預算細項：${answers.budget_breakdown || '未填'}
- 核心風險：${answers.key_risks || '未填'}
- 團隊組成：${answers.team_composition || '未填'}
- 團隊經驗：${answers.team_experience || '未填'}
- 目前技術成熟度(TRL)：${answers.current_trl || '未填'}
- 計畫目標TRL：${answers.target_trl || '未填'}

【已生成的計畫書章節內容（可直接引用）】
${sectionContents || '（尚未生成）'}

請現在開始輸出完整的 Markdown 簡報內容。`

    const { provider, apiKey } = await getAIProvider(c, user.sub)

    return streamSSE(c, async (stream) => {
        try {
            if (provider === 'cloudflare') {
                // Qwen3's thinking mode exhausts tokens in streaming, so we use batched non-streaming calls instead.
                // Split the deck into 4 batches of 3-4 slides each.
                const batches = [
                    { slides: '1-4', content: '封面、問題描述、問題嚴重性、解決方案' },
                    { slides: '5-8', content: '創新性與技術優勢、核心功能、目標市場、商業模式' },
                    { slides: '9-11', content: '競爭分析、技術進入門檻、團隊介紹' },
                    { slides: '12-15', content: '財務預測（3年）、申請金額與用途、里程碑、核心價值主張' },
                ]

                for (const batch of batches) {
                    const batchPrompt = `${prompt}

【本次只輸出以下投影片（第 ${batch.slides} 頁）】：${batch.content}
請直接從第一頁開始，依序輸出這幾頁的完整內容。`

                    const cfResult = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                        messages: [
                            { role: 'system', content: '/no_think你是專業的 SBIR 簡報撰寫顧問，輸出完整的繁體中文 Markdown 內容，不要有思考過程。' },
                            { role: 'user', content: batchPrompt }
                        ],
                        max_tokens: 2000,
                        temperature: 0.3,
                    }) as any

                    const batchText: string = cfResult?.choices?.[0]?.message?.content || cfResult?.response || ''
                    if (batchText) {
                        await stream.writeSSE({ data: batchText })
                    }
                }
            } else {
                let model: any
                if (provider === 'claude') {
                    const anthropic = createAnthropic({ apiKey: apiKey! })
                    model = anthropic('claude-3-5-sonnet-latest')
                } else if (provider === 'openai') {
                    const openai = createOpenAI({ apiKey: apiKey! })
                    model = openai('gpt-4o')
                } else if (provider === 'gemini') {
                    const google = createGoogleGenerativeAI({ apiKey: apiKey! })
                    model = google('gemini-1.5-pro')
                }
                const result = streamText({ model, prompt, system: '你是專業的 SBIR 簡報撰寫顧問，輸出完整的繁體中文 Markdown 內容。' })
                for await (const text of (await result).textStream) {
                    await stream.writeSSE({ data: text })
                }
            }
            await stream.writeSSE({ data: '[DONE]' })
        } catch (err: any) {
            console.error('[PITCH DECK] Error:', err.message)
            await stream.writeSSE({ data: '[ERROR]' })
        }
    })
})

