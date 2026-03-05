import { Bindings } from './middleware'

export interface DocProcessingMessage {
    documentId: string
    projectId: string
    r2Key: string
    fileName: string
    contentType: string
}

const SECTIONS = [
    { index: 1, name: '公司簡介' },
    { index: 2, name: '問題陳述' },
    { index: 3, name: '創新構想' },
    { index: 4, name: '可行性評估規劃' },
    { index: 5, name: '市場初步分析' },
    { index: 6, name: '預期營收與產值' },
    { index: 7, name: '團隊介紹與經費規劃' },
    { index: 8, name: '結語與附件清單' },
]

/**
 * Queue consumer: process a single uploaded document
 * 1. Fetch from R2
 * 2. AI.toMarkdown → Markdown text
 * 3. Semantic chunk (LLM)
 * 4. AI classify → which sections
 * 5. Embed → Vectorize
 * 6. INSERT INTO document_chunks
 * 7. UPDATE documents SET extraction_status = 'done'
 */
export async function processDocumentQueue(
    batch: MessageBatch<DocProcessingMessage>,
    env: Bindings
): Promise<void> {
    for (const msg of batch.messages) {
        const { documentId, projectId, r2Key, fileName, contentType } = msg.body
        console.log(`[DocQueue] Processing document ${documentId} (${fileName})`)

        try {
            // --- Mark as processing ---
            await env.DB.prepare(
                "UPDATE documents SET extraction_status = 'processing' WHERE id = ?"
            ).bind(documentId).run()

            // --- 1. Fetch binary from R2 ---
            const r2Object = await env.sbir_saas_bucket.get(r2Key)
            if (!r2Object) throw new Error(`R2 object not found: ${r2Key}`)
            const arrayBuffer = await r2Object.arrayBuffer()

            // --- 2. Convert to Markdown via Gemini 1.5 Flash (BYOK) ---
            // Bug EE1 fix: env.AI.toMarkdown() was completely hallucinated. Cloudflare AI has no file parsing API.
            // Using the user's Gemini key to perform multimodal extraction.
            const userKeys = await env.DB.prepare(
                'SELECT u.gemini_key FROM documents d JOIN projects p ON d.project_id = p.id JOIN users u ON p.user_id = u.id WHERE d.id = ?'
            ).bind(documentId).first<{ gemini_key: string | null }>()

            let markdown = ''

            if (userKeys && userKeys.gemini_key) {
                // Convert arrayBuffer to base64 safely in chunks to avoid call stack overflow
                let binary = '';
                const bytes = new Uint8Array(arrayBuffer);
                const len = bytes.byteLength;
                const chunkSize = 8192;
                for (let i = 0; i < len; i += chunkSize) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]);
                }
                const base64Data = btoa(binary);

                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userKeys.gemini_key}`;
                const apiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: "請精確地將這份文件的文字內容擷取出來，並格式化為乾淨的 Markdown 格式。請保留原始的層級結構。不要加入任何對話、問候或說明文字，只輸出文件的內容。" },
                                { inlineData: { mimeType: contentType, data: base64Data } }
                            ]
                        }]
                    })
                });

                if (!apiRes.ok) {
                    const errText = await apiRes.text();
                    throw new Error(`Gemini API 檔案解析失敗: ${errText}`);
                }
                const data = await apiRes.json() as any;
                markdown = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } else {
                throw new Error('解析文件需要 Gemini API 金鑰 (BYOK)。請至「設定」頁面綁定您的 Gemini 參數，因 Cloudflare 本機 AI 不支援直接解析 PDF/Word。');
            }

            if (!markdown || markdown.trim().length < 30) {
                throw new Error('Gemini 回傳的內容過短或無法解析文本。')
            }
            console.log(`[DocQueue] Markdown extracted, length=${markdown.length}`)

            // --- 3. Semantic chunking via LLM ---
            let semanticChunks: string[] = []
            try {
                const chunkPrompt = `You are a professional editor. Analyze the following document text and break it into a JSON array of distinct, semantically complete paragraphs or concepts. DO NOT change the original wording, just split it. Output ONLY a valid JSON array of strings, nothing else.

Document text:
${markdown.substring(0, 8000)}`

                const aiResponse = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
                    messages: [
                        { role: 'system', content: 'You are a JSON chunking assistant. Only output a valid JSON array of strings.' },
                        { role: 'user', content: chunkPrompt }
                    ]
                }) as any

                const rawContent: string = aiResponse?.choices?.[0]?.message?.content || (aiResponse?.response as string) || '[]'
                const jsonStr = rawContent.match(/\[[\s\S]*\]/)?.[0] || '[]'
                const parsed: string[] = JSON.parse(jsonStr)
                semanticChunks = parsed.filter(c => c && c.trim().length > 30)
            } catch (err) {
                console.warn(`[DocQueue] LLM chunking failed, falling back to paragraph split`, err)
                semanticChunks = markdown.split(/\n\n+/).filter(c => c.trim().length > 30)
            }

            if (semanticChunks.length === 0) {
                semanticChunks = [markdown.substring(0, 2000)]
            }

            console.log(`[DocQueue] Got ${semanticChunks.length} chunks`)

            // --- 4. For each chunk: AI classify + Embed + store ---
            const sectionList = SECTIONS.map(s => `${s.index}.${s.name}`).join('、')
            const vectorsToInsert: any[] = []

            for (let i = 0; i < semanticChunks.length; i++) {
                const chunkText = semanticChunks[i].trim()
                if (!chunkText) continue

                // AI section classification
                let sectionTags: number[] = []
                try {
                    const classifyResult = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
                        messages: [
                            { role: 'system', content: '/no_think你是 SBIR 文件分類專家，只輸出 JSON 數字陣列。' },
                            { role: 'user', content: `以下是 SBIR 計畫書的八個區塊：${sectionList}\n\n請判斷下面這段文字最適合用在哪些區塊（可多選，最多3個），只輸出數字陣列 JSON，例如 [1,3]：\n\n${chunkText.substring(0, 500)}` }
                        ],
                        max_tokens: 30,
                        temperature: 0.1,
                    }) as any
                    const raw = classifyResult?.choices?.[0]?.message?.content || classifyResult?.response || '[]'
                    const matched = raw.match(/\[[\d,\s]*\]/)
                    if (matched) {
                        sectionTags = JSON.parse(matched[0]).filter((n: number) => n >= 1 && n <= 8)
                    }
                } catch {
                    sectionTags = []
                }

                // Embedding
                const chunkId = crypto.randomUUID()
                try {
                    const embedResponse = await env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
                        text: [chunkText.substring(0, 512)]
                    }) as any

                    if (embedResponse.data?.[0]) {
                        vectorsToInsert.push({
                            id: chunkId,
                            values: embedResponse.data[0],
                            metadata: {
                                project_id: projectId,
                                document_id: documentId,
                                chunk_index: i,
                                // Bug W1 fix: was 300 chars (often mid-sentence). Vectorize metadata cap is ~4KB per key.
                                // 1000 chars is sufficient for full context without hitting limits.
                                chunk_text: chunkText.substring(0, 1000),
                            }
                        })
                    }
                } catch (e) {
                    console.warn(`[DocQueue] Embedding failed for chunk ${i}`, e)
                }

                // INSERT into document_chunks
                await env.DB.prepare(
                    `INSERT INTO document_chunks (id, document_id, project_id, chunk_index, chunk_text, section_tags)
                     VALUES (?, ?, ?, ?, ?, ?)`
                ).bind(chunkId, documentId, projectId, i, chunkText, JSON.stringify(sectionTags)).run()
            }

            // Batch upsert to Vectorize (Max 1000 per request)
            if (vectorsToInsert.length > 0) {
                const BATCH_SIZE = 900;
                for (let i = 0; i < vectorsToInsert.length; i += BATCH_SIZE) {
                    const batch = vectorsToInsert.slice(i, i + BATCH_SIZE);
                    await env.VECTORIZE.insert(batch);
                }
                console.log(`[DocQueue] Inserted ${vectorsToInsert.length} vectors into Vectorize`)
            }

            // --- 5. Mark as done ---
            await env.DB.prepare(
                "UPDATE documents SET extraction_status = 'done' WHERE id = ?"
            ).bind(documentId).run()

            console.log(`[DocQueue] Done: document ${documentId}, ${semanticChunks.length} chunks`)
            msg.ack()

        } catch (err: any) {
            console.error(`[DocQueue] Failed for document ${documentId}:`, err.message)
            await env.DB.prepare(
                "UPDATE documents SET extraction_status = 'failed', extraction_error = ? WHERE id = ?"
            ).bind(err.message, documentId).run()
            msg.ack() // ack to avoid infinite retry on fatal errors
        }
    }
}
