import { Bindings } from './middleware';

interface ChunkingJob {
    projectId: string;
    answers: Record<string, any>;
}

/**
 * Background processor that fragments raw text answers into semantic chunks using Llama 4 Scout
 * and stores their vector embeddings in Vectorize using Qwen3.
 */
export async function processSemanticChunking(env: Bindings, job: ChunkingJob) {
    const { projectId, answers } = job;
    console.log(`[Chunking] Starting process for project: ${projectId}`);

    try {
        // --- Mark as syncing ---
        await env.DB.prepare('UPDATE projects SET chunking_status = ? WHERE id = ?')
            .bind('syncing', projectId)
            .run();

        // --- Step 2: Delete existing vectors for this project (Bug D fix) ---
        // Fetch old vector IDs stored in D1, then delete from Vectorize by ID
        const oldVectorRows = await env.DB.prepare(
            'SELECT vector_id FROM project_answer_vectors WHERE project_id = ?'
        ).bind(projectId).all() as { results: { vector_id: string }[] }

        if (oldVectorRows.results && oldVectorRows.results.length > 0) {
            const oldIds = oldVectorRows.results.map(r => r.vector_id)
            try {
                await env.VECTORIZE.deleteByIds(oldIds)
                console.log(`[Chunking] Deleted ${oldIds.length} old vectors for project ${projectId}`)
            } catch (e) {
                console.warn(`[Chunking] Failed to delete old vectors (non-fatal):`, e)
            }
            await env.DB.prepare(
                'DELETE FROM project_answer_vectors WHERE project_id = ?'
            ).bind(projectId).run()
        }

        const chunksToInsert = [];

        // 3. Process each answer field
        for (const [questionId, rawText] of Object.entries(answers)) {
            if (!rawText || typeof rawText !== 'string' || rawText.length < 50) {
                // Skip empty or very short answers that don't need chunking
                continue;
            }

            console.log(`[Chunking] Analyzing question: ${questionId}, text length: ${rawText.length}`);

            // A. Ask LLM to chunk the text semantically
            const prompt = `You are a professional editor. Analyze the following text and break it down into a JSON array of distinct, semantically complete paragraphs or concepts. DO NOT change the original wording, just split it. ONLY output a valid JSON array of strings, nothing else.

Text to analyze:
${rawText}`;

            let semanticChunks: string[] = [];
            try {
                const aiResponse = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
                    messages: [
                        { role: 'system', content: 'You are a JSON chunking assistant. Only output valid JSON array format.' },
                        { role: 'user', content: prompt }
                    ]
                }) as any;

                // Bug E fix: Llama 4 Scout 回傳格式是 choices[0].message.content
                // 部分 CF AI 模型回傳 { response: "..." }，加入雙重 fallback
                const aiRawContent: string =
                    aiResponse?.choices?.[0]?.message?.content ||
                    aiResponse?.response ||
                    '';

                // Extract JSON array
                const jsonStr = aiRawContent.match(/\[[\s\S]*\]/)?.[0] || '[]';
                semanticChunks = JSON.parse(jsonStr);

                if (semanticChunks.length === 0) {
                    // Fallback if LLM fails: just use the raw text as one chunk
                    semanticChunks = [rawText];
                }
            } catch (err) {
                console.warn(`[Chunking] LLM cutting failed for ${questionId}, falling back to paragraph split.`, err);
                semanticChunks = rawText.split('\n\n').filter(c => c.trim().length > 0);
            }

            // B. Generate Embeddings for each chunk
            for (let i = 0; i < semanticChunks.length; i++) {
                const chunkText = semanticChunks[i];
                if (chunkText.trim().length === 0) continue;

                const vectorId = `${projectId}_${questionId}_${i}`;

                try {
                    const embedResponse = await env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
                        text: [chunkText]
                    });

                    if (embedResponse.data && embedResponse.data[0]) {
                        chunksToInsert.push({
                            id: vectorId,
                            values: embedResponse.data[0],
                            metadata: {
                                project_id: projectId,
                                question_id: questionId,
                                chunk_index: i,
                                // Cap at 2000 chars to stay well within Vectorize's ~4KB metadata limit per key (Bug W2 fix)
                                chunk_text: chunkText.substring(0, 2000)
                            }
                        });
                    }
                } catch (e) {
                    console.error(`[Chunking] Embedding failed for chunk ${vectorId}`, e);
                }
            }
        }

        // 4. Batch upsert to Vectorize + 記錄 vector IDs 至 D1（Bug D fix）
        if (chunksToInsert.length > 0) {
            console.log(`[Chunking] Inserting ${chunksToInsert.length} vectors into Vectorize`);
            await env.VECTORIZE.insert(chunksToInsert);

            // 記錄新的 vector IDs，供下次同步時刪除
            for (const vec of chunksToInsert) {
                await env.DB.prepare(
                    `INSERT INTO project_answer_vectors (project_id, vector_id) VALUES (?, ?)
                     ON CONFLICT(project_id, vector_id) DO NOTHING`
                ).bind(projectId, vec.id).run()
            }
        }

        // 5. Mark as completed
        await env.DB.prepare('UPDATE projects SET chunking_status = ? WHERE id = ?')
            .bind('completed', projectId)
            .run();

        console.log(`[Chunking] Finished successfully for ${projectId}`);

    } catch (error) {
        console.error(`[Chunking] Fatal Error for ${projectId}:`, error);
        await env.DB.prepare('UPDATE projects SET chunking_status = ? WHERE id = ?')
            .bind('failed', projectId)
            .run();
    }
}
