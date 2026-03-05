import { Hono } from 'hono'
import { authMiddleware, Bindings, Variables } from './middleware'
import { expandQuery } from './utils/query_expansion'
import { maximalMarginalRelevance, MmrItem } from './utils/mmr'

const regenerateApp = new Hono<{ Bindings: Bindings; Variables: Variables }>({ strict: false })

regenerateApp.post('/', authMiddleware, async (c) => {
    try {
        const body = await c.req.json<{
            original_question: string
            original_criteria: string
            current_draft: string
            modification_prompt: string
            context?: Record<string, any>
        }>()

        const { original_question, original_criteria, current_draft, modification_prompt, context } = body

        if (!current_draft || !modification_prompt) {
            return c.json({ error: 'Missing required fields' }, 400)
        }

        let contextStr = context
            ? `\n[已知背景資訊]\n請在修改時參考以下使用者先前提過的資訊：\n${Object.entries(context)
                .filter(([_, value]) => value !== undefined && value !== null && value !== '')
                .map(([key, value]) => `- ${key}: ${value}`)
                .join('\n')}\n`
            : ''

        // Real Semantic RAG with Vectorize (Fixing Bug R1: Ghost Vector DB for Regenerate)
        // Extract project_id from context if available to filter vectors
        const projectId = context?.project_id;
        if (projectId) {
            try {
                // Generate embedding using expanded terms
                const expandedQueries = expandQuery(`${original_question} ${modification_prompt}`);
                const searchContent = expandedQueries.join(" ");
                const embedResponse = await c.env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
                    text: [searchContent]
                }) as any;

                if (embedResponse.data && embedResponse.data[0]) {
                    const queryVector = embedResponse.data[0];

                    // Query Vectorize for top 30 most semantically similar chunks (increased for MMR)
                    const vectorResults = await c.env.VECTORIZE.query(queryVector, {
                        topK: 30,
                        filter: { project_id: projectId },
                        returnValues: false,
                        returnMetadata: true
                    });

                    if (vectorResults.matches && vectorResults.matches.length > 0) {
                        contextStr += `\n[參考上傳文件與歷史問答內容 (Semantic RAG)]\n`;

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
                                const rerankPrompt = `你是一個精準的文件檢索過濾器。這是一份關於「${original_question}」的計畫書段落改寫。
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
                                        console.log(`[regenerate] LLM Reranking kept ${finalItems.length}/${diverseItems.length} items. Selected:`, parsedIndices);
                                    }
                                }
                            } catch (e: any) {
                                console.warn('[regenerate] LLM Reranking failed:', e.message);
                            }
                        }

                        // Keep at most 5 final items to conserve context window
                        finalItems = finalItems.slice(0, 5);

                        const seenTexts = new Set<string>();
                        for (const item of finalItems) {
                            const text = item.text;
                            if (!seenTexts.has(text)) {
                                seenTexts.add(text);
                                const source = item.metadata.document_id ? "上傳文件" : "歷史問答";
                                contextStr += `(${source}) ${text}\n\n`;

                                // Bug II1 Fix: Protect against Cloudflare AI context window fatal overflow
                                if (contextStr.length > 15000) {
                                    console.log("[regenerate] Context reached safe limit of 15000 chars, truncating remaining chunks.");
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (ragErr) {
                console.error('[regenerate] Vectorize retrieval failed:', ragErr);
            }
        }

        const systemPrompt = `你是一位熟悉政府 SBIR 審查標準的資深提案顧問，同時也是一位精準的編輯。
你的任務是根據使用者的「修改指令」，重新改寫他們目前的「計畫書草稿片段」。
${contextStr}
[原始題目背景]
題目：${original_question}
審查標準：${original_criteria}

[修改規則]
1. 嚴格遵守使用者的「修改指令」來調整草稿的語氣、長度、結構或內容。若指令包含要求根據「背景資訊」重新計算（如預算、收費、客戶數等），請務必引用上方提供的正確數值進行推算。
2. 確保改寫後的內容依然精準回答了「原始題目」，並符合「審查標準」。
3. 絕對不要捏造不實的假數據，如果使用者要求移除你之前的假範例，請將其改寫為通用但不空泛的專業描述。
4. 【極度重要】你必須直球回傳改寫後的「最終完整段落內容」，絕對不要包含任何如「好的」、「這是為您修改的版本：」等開場白或解釋性廢話。
5. 必須且只能使用「繁體中文（正體中文, zh-TW）」輸出，絕對不能出現簡體字。`

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `[目前的草稿內容]\n${current_draft}\n\n[使用者的修改指令]\n${modification_prompt}` },
        ]

        // Using Qwen 3 30B as requested for precise prompt following
        const response = await c.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
            messages,
            max_tokens: 1536,
            temperature: 0.7, // Slightly higher temp for creative rewriting
        })

        // Parse Qwen JSON format vs string format
        const aiResult = response as any;
        const regeneratedText = typeof aiResult?.choices?.[0]?.message?.content === 'string'
            ? aiResult.choices[0].message.content.trim()
            : typeof aiResult?.response === 'string'
                ? aiResult.response.trim()
                : '';

        if (!regeneratedText) {
            console.error('[regenerate] Empty response from AI model', JSON.stringify(response));
            return c.json({ error: 'Failed to generate content' }, 500)
        }

        return c.json({ regenerated_text: regeneratedText })
    } catch (err) {
        console.error('[regenerate] error:', err)
        return c.json({ error: 'Regeneration failed' }, 500)
    }
})

export default regenerateApp
