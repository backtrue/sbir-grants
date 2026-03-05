import { Hono } from 'hono'
import { authMiddleware, Bindings, Variables } from './middleware'
import { processSemanticChunking } from './chunking';

const projectsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>({ strict: false })

// Apply auth middleware to all routes in this app
projectsApp.use('*', authMiddleware)

// Get all projects for the current user
projectsApp.get('/', async (c) => {
    const user = c.get('user')
    const { results } = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
    )
        .bind(user.sub)
        .all()

    return c.json(results)
})

// Get a specific project
projectsApp.get('/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')

    console.log(`[projects/:id] Request for project ${id} by user ${user?.sub}`);

    const project = await c.env.DB.prepare(
        'SELECT * FROM projects WHERE id = ? AND user_id = ?'
    )
        .bind(id, user.sub)
        .first()

    if (!project) {
        console.log(`[projects/:id] Project ${id} NOT FOUND for user ${user?.sub}`);
        return c.json({ error: 'Project not found' }, 404)
    }

    // Reconstruct progress_data.wizardAnswers from the relational project_answers table
    const answers = await c.env.DB.prepare(
        'SELECT question_id, answer_text FROM project_answers WHERE project_id = ?'
    ).bind(id).all();

    const wizardAnswers: Record<string, string> = {};
    if (answers.results) {
        for (const row of answers.results) {
            wizardAnswers[row.question_id as string] = row.answer_text as string;
        }
    }

    // Embed them back into the project's payload for backwards compatibility with the frontend
    const parsedData = typeof project.progress_data === 'string'
        ? JSON.parse(project.progress_data)
        : (project.progress_data || {});

    parsedData.wizardAnswers = wizardAnswers;
    project.progress_data = JSON.stringify(parsedData);

    return c.json(project)
})

// Create a new project
projectsApp.post('/', async (c) => {
    const user = c.get('user')
    const body = await c.req.json()

    if (!body.title) {
        return c.json({ error: 'Title is required' }, 400)
    }

    const id = crypto.randomUUID()
    const defaultProgress = JSON.stringify({
        setupPhase: false,
        draftingPhase: false,
        reviewPhase: false,
    })

    await c.env.DB.prepare(
        'INSERT INTO projects (id, user_id, title, county, status, progress_data) VALUES (?, ?, ?, ?, ?, ?)'
    )
        .bind(id, user.sub, body.title, body.county || null, 'Draft', defaultProgress)
        .run()

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first()
    return c.json(project, 201)
})



// Update project progress/status
projectsApp.put('/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = await c.req.json()

    console.log(`[PUT /projects/${id}] User:`, user.sub)
    // Fetch existing details for merging progress_data
    const existing = await c.env.DB.prepare('SELECT id, progress_data FROM projects WHERE id = ? AND user_id = ?')
        .bind(id, user.sub)
        .first()

    if (!existing) {
        console.warn(`[PUT /projects/${id}] Project not found`)
        return c.json({ error: 'Project not found' }, 404)
    }

    console.log(`[PUT /projects/${id}] Existing data found, parsing body...`)
    let updateQuery = 'UPDATE projects SET updated_at = CURRENT_TIMESTAMP'
    const params: any[] = []

    if (body.title !== undefined) {
        updateQuery += ', title = ?'
        params.push(body.title)
    }
    if (body.county !== undefined) {
        updateQuery += ', county = ?'
        params.push(body.county)
    }
    if (body.status !== undefined) {
        updateQuery += ', status = ?'
        params.push(body.status)
    }
    let hasProgressDataToUpdate = false;
    let newProgressData: any = {};
    let wizardAnswers: Record<string, any> = {};
    let shouldFetchG0v = false;

    if (body.progress_data !== undefined) {
        let incomingProgressData: any = {};
        try {
            incomingProgressData = typeof body.progress_data === 'string'
                ? JSON.parse(body.progress_data)
                : body.progress_data;
        } catch (e) {
            console.error('Failed to parse incoming progress_data', e);
            incomingProgressData = {};
        }

        if (!incomingProgressData || typeof incomingProgressData !== 'object') {
            incomingProgressData = {};
        }

        // Extract wizardAnswers to push to the relational table
        wizardAnswers = incomingProgressData.wizardAnswers || {};

        // Isolate the remaining progress data (phases)
        newProgressData = { ...incomingProgressData };
        delete newProgressData.wizardAnswers;

        if (Object.keys(newProgressData).length > 0) {
            hasProgressDataToUpdate = true;
        }

        const incomingCompany = wizardAnswers['company_name'];
        if (incomingCompany) {
            const existingCompany = await c.env.DB.prepare('SELECT answer_text FROM project_answers WHERE project_id = ? AND question_id = ?').bind(id, 'company_name').first<{ answer_text: string }>();
            if (!existingCompany || existingCompany.answer_text !== String(incomingCompany)) {
                shouldFetchG0v = true;
            }
        }

        console.log(`[PUT /projects/${id}] Saving ${Object.keys(wizardAnswers).length} answers to relational table...`);
        // Save answers relationally
        const stmts = [];
        for (const [key, value] of Object.entries(wizardAnswers)) {
            // SQLite UPSERT
            stmts.push(c.env.DB.prepare(`
                INSERT INTO project_answers (project_id, question_id, answer_text, chunking_status, updated_at)
                VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
                ON CONFLICT(project_id, question_id) DO UPDATE SET
                answer_text = excluded.answer_text,
                chunking_status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            `).bind(id, key, String(value)));
        }

        if (stmts.length > 0) {
            try {
                await c.env.DB.batch(stmts);
                console.log(`[PUT /projects/${id}] Successfully saved answers to project_answers table.`);
            } catch (err) {
                console.error(`[PUT /projects/${id}] Failed to batch insert project_answers:`, err);
                throw err;
            }
        }
    }

    if (hasProgressDataToUpdate) {
        // Atomic Deep Merge for remaining progress_data (like setupPhase, etc)
        const existingData: Record<string, any> = typeof existing.progress_data === 'string'
            ? JSON.parse(existing.progress_data)
            : (existing.progress_data || {});

        // Delete wizardAnswers from legacy existingData just in case to clean it up
        delete existingData.wizardAnswers;

        const mergedData = { ...existingData, ...newProgressData };
        updateQuery += ', progress_data = ?';
        params.push(JSON.stringify(mergedData));
    }

    updateQuery += ' WHERE id = ? AND user_id = ?'
    params.push(id, user.sub)

    console.log(`[PUT /projects/${id}] Executing DB update for project metadata...`)
    try {
        await c.env.DB.prepare(updateQuery).bind(...params).run()
        console.log(`[PUT /projects/${id}] DB metadata update successful`)
    } catch (dbErr) {
        console.error(`[PUT /projects/${id}] DB metadata update FAILED:`, dbErr)
        throw dbErr;
    }

    const updatedProject = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first()

    // Background: if company_name was saved AND changed, pre-fetch g0v data and cache it
    if (shouldFetchG0v && wizardAnswers?.company_name) {
        const savedCompanyName = String(wizardAnswers.company_name);
        const dbRef = c.env.DB
        const projectId = id
        const fetchPromise = (async () => {
            try {
                const g0vUrl = `https://company.g0v.ronny.tw/api/search?q=${encodeURIComponent(savedCompanyName)}&page=0`
                const g0vResponse = await fetch(g0vUrl, {
                    headers: { 'Accept': 'application/json', 'User-Agent': 'SBIR-Assistant/1.0' }
                })
                if (g0vResponse.ok) {
                    const g0vData = await g0vResponse.json() as any
                    await dbRef.prepare(`
                        INSERT INTO project_answers (project_id, question_id, answer_text, chunking_status, updated_at)
                        VALUES (?, 'g0v_company_data', ?, 'done', CURRENT_TIMESTAMP)
                        ON CONFLICT(project_id, question_id) DO UPDATE SET
                        answer_text = excluded.answer_text,
                        updated_at = CURRENT_TIMESTAMP
                    `).bind(projectId, JSON.stringify(g0vData)).run()
                    console.log(`[PUT /projects/${projectId}] g0v data cached for "${savedCompanyName}"`)
                }
            } catch (e: any) {
                console.error(`[PUT /projects/${id}] g0v pre-fetch failed:`, e.message)
            }
        })()
        c.executionCtx.waitUntil(fetchPromise)
    }

    return c.json(updatedProject)
})

// Get all sections for a project
projectsApp.get('/:id/sections', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')

    // Verify ownership
    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(id, user.sub).first()
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const { results } = await c.env.DB.prepare(
        'SELECT * FROM project_sections WHERE project_id = ? ORDER BY section_index ASC'
    ).bind(id).all()

    return c.json(results || [])
})

// Delete project
projectsApp.delete('/:id', async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')

    // First verify ownership
    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
        .bind(id, user.sub).first()

    if (!project) {
        return c.json({ error: 'Project not found or unauthorized' }, 404)
    }

    // Cascade delete vectors from Vectorize (Document Vectors)
    try {
        const docChunks = await c.env.DB.prepare('SELECT id FROM document_chunks WHERE project_id = ?').bind(id).all()
        if (docChunks.results && docChunks.results.length > 0) {
            const docChunkIds = docChunks.results.map(r => r.id as string)
            await c.env.VECTORIZE.deleteByIds(docChunkIds)
            console.log(`[DELETE /projects/${id}] Deleted ${docChunkIds.length} document vectors from Vectorize`)
        }
    } catch (e) {
        console.error(`[DELETE /projects/${id}] Failed to cleanup document vectors:`, e)
    }

    // Cascade delete vectors from Vectorize (Project Answers)
    try {
        const answerVectors = await c.env.DB.prepare('SELECT vector_id FROM project_answer_vectors WHERE project_id = ?').bind(id).all()
        if (answerVectors.results && answerVectors.results.length > 0) {
            const answerVectorIds = answerVectors.results.map(r => r.vector_id as string)
            await c.env.VECTORIZE.deleteByIds(answerVectorIds)
            console.log(`[DELETE /projects/${id}] Deleted ${answerVectorIds.length} answer vectors from Vectorize`)
        }
    } catch (e) {
        console.error(`[DELETE /projects/${id}] Failed to cleanup answer vectors:`, e)
    }

    // Cascade delete all related records
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM project_answers WHERE project_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM project_sections WHERE project_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM project_answer_vectors WHERE project_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM documents WHERE project_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM document_chunks WHERE project_id = ?').bind(id),
        c.env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(id, user.sub),
    ])

    // Delete associated R2 files (uploaded documents)
    try {
        const prefix = 'projects/' + user.sub + '/' + id + '/'
        const listResult = await c.env.sbir_saas_bucket.list({ prefix })
        if (listResult.objects.length > 0) {
            const keysToDelete = listResult.objects.map(obj => obj.key)
            await c.env.sbir_saas_bucket.delete(keysToDelete)
            console.log('[DELETE /projects/' + id + '] Deleted ' + keysToDelete.length + ' files from R2')
        }
    } catch (r2Err) {
        console.error('[DELETE /projects/' + id + '] R2 Cleanup failed:', r2Err)
        // We log but don't fail the request since DB is already wiped
    }

    return c.json({ success: true })
})

export default projectsApp
