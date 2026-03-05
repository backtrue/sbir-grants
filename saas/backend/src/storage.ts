import { Hono } from 'hono'
import { authMiddleware, Bindings, Variables } from './middleware'

const storageApp = new Hono<{ Bindings: Bindings; Variables: Variables }>({ strict: false })

storageApp.use('*', authMiddleware)

// List all documents for a project
storageApp.get('/project/:projectId', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')

    // Verify project ownership
    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    const { results } = await c.env.DB.prepare(
        'SELECT * FROM documents WHERE project_id = ? ORDER BY uploaded_at DESC'
    )
        .bind(projectId)
        .all()

    return c.json(results)
})

// Allowed file types for upload
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
])

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

function validateMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
    const b = bytes
    // PDF: starts with %PDF
    if (mimeType === 'application/pdf') {
        return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46
    }
    // DOCX / XLSX: ZIP container (PK header)
    if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
        return b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04
    }
    // DOC / XLS: OLE2 compound file (D0 CF 11 E0)
    if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') {
        return b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0
    }
    return false
}

// Upload a file to a project (PDF, Word, Excel only — max 20MB)
storageApp.post('/project/:projectId/upload', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')

    // Verify project ownership
    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub)
        .first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    const formData = await c.req.parseBody()
    const file = formData['file']

    if (!(file instanceof File)) {
        return c.json({ error: 'Invalid file upload' }, 400)
    }

    // 1. Size check
    if (file.size > MAX_FILE_SIZE) {
        return c.json({ error: `檔案大小超過限制（最大 20MB），目前為 ${(file.size / 1024 / 1024).toFixed(1)}MB` }, 400)
    }

    // 2. MIME type whitelist
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return c.json({ error: `不支援的檔案格式「${file.type || '未知'}」。僅接受 PDF、Word (.docx/.doc)、Excel (.xlsx/.xls)。` }, 400)
    }

    // 3. Magic bytes validation (prevent spoofed extension)
    const arrayBuffer = await file.arrayBuffer()
    const header = new Uint8Array(arrayBuffer.slice(0, 8))
    if (!validateMagicBytes(header, file.type)) {
        return c.json({ error: '檔案內容與副檔名不符，上傳失敗。' }, 400)
    }

    // Generate unique object key
    const ext = file.name.split('.').pop() || 'bin'
    const fileId = crypto.randomUUID()
    const r2Key = `projects/${user.sub}/${projectId}/${fileId}.${ext}`

    // Upload to R2
    await c.env.sbir_saas_bucket.put(r2Key, arrayBuffer, {
        httpMetadata: { contentType: file.type }
    })

    // Insert DB record
    await c.env.DB.prepare(
        'INSERT INTO documents (id, project_id, file_name, r2_object_key, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
    )
        .bind(fileId, projectId, file.name, r2Key, file.type, file.size)
        .run()

    // Enqueue background processing job
    await c.env.DOC_QUEUE.send({
        documentId: fileId,
        projectId,
        r2Key,
        fileName: file.name,
        contentType: file.type,
    })

    const docRecord = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(fileId).first()
    return c.json(docRecord, 201)
})

// Download a specific file
storageApp.get('/download/:fileId', async (c) => {
    const user = c.get('user')
    const fileId = c.req.param('fileId')

    // Get document record and verify implicitly via project join
    const doc = await c.env.DB.prepare(
        'SELECT d.r2_object_key, d.file_name, d.content_type FROM documents d JOIN projects p ON d.project_id = p.id WHERE d.id = ? AND p.user_id = ?'
    )
        .bind(fileId, user.sub)
        .first<{ r2_object_key: string, file_name: string, content_type: string }>()

    if (!doc) return c.json({ error: 'File not found or unauthorized' }, 404)

    // Fetch from R2
    const object = await c.env.sbir_saas_bucket.get(doc.r2_object_key)

    if (object === null) {
        return c.json({ error: 'Object not found in storage' }, 404)
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    // Ensure the browser downloads the file with its original name
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`)

    return new Response(object.body, { headers })
})

// Delete a document
storageApp.delete('/:fileId', async (c) => {
    const user = c.get('user')
    const fileId = c.req.param('fileId')

    // Get document record and verify
    const doc = await c.env.DB.prepare(
        'SELECT d.id, d.r2_object_key FROM documents d JOIN projects p ON d.project_id = p.id WHERE d.id = ? AND p.user_id = ?'
    )
        .bind(fileId, user.sub)
        .first<{ id: string, r2_object_key: string }>()

    if (!doc) return c.json({ error: 'File not found or unauthorized' }, 404)

    // Delete from R2 first
    await c.env.sbir_saas_bucket.delete(doc.r2_object_key)

    // Delete chunks from Vectorize
    const chunks = await c.env.DB.prepare('SELECT id FROM document_chunks WHERE document_id = ?').bind(fileId).all()
    if (chunks.results && chunks.results.length > 0) {
        const chunkIds = chunks.results.map(r => r.id as string)
        try {
            await c.env.VECTORIZE.deleteByIds(chunkIds)
            console.log(`[storage] Deleted ${chunkIds.length} vectors from Vectorize for document ${fileId}`)
        } catch (e) {
            console.error(`[storage] Failed to delete document vectors:`, e)
        }
    }

    // Delete from DB
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM document_chunks WHERE document_id = ?').bind(fileId),
        c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(fileId)
    ])

    return c.json({ success: true })
})

// GET processing status for all documents in a project (includes chunk count)
storageApp.get('/project/:projectId/status', async (c) => {
    const user = c.get('user')
    const projectId = c.req.param('projectId')

    const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
        .bind(projectId, user.sub).first()
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const { results } = await c.env.DB.prepare(
        `SELECT d.id, d.file_name, d.content_type, d.size_bytes, d.uploaded_at,
                d.extraction_status, d.extraction_error,
                COUNT(dc.id) AS chunk_count
         FROM documents d
         LEFT JOIN document_chunks dc ON dc.document_id = d.id
         WHERE d.project_id = ?
                GROUP BY d.id
         ORDER BY d.uploaded_at DESC`
    ).bind(projectId).all()

    return c.json(results || [])
})

// GET all chunks for a specific document (with section_tags)
storageApp.get('/document/:docId/chunks', async (c) => {
    const user = c.get('user')
    const docId = c.req.param('docId')

    // Verify ownership via project join
    const doc = await c.env.DB.prepare(
        'SELECT d.id FROM documents d JOIN projects p ON d.project_id = p.id WHERE d.id = ? AND p.user_id = ?'
    ).bind(docId, user.sub).first()
    if (!doc) return c.json({ error: 'Document not found or unauthorized' }, 404)

    const { results } = await c.env.DB.prepare(
        'SELECT id, chunk_index, chunk_text, section_tags FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC'
    ).bind(docId).all()

    return c.json(results || [])
})

// PATCH section_tags for a specific chunk (user manual adjustment)
storageApp.patch('/chunk/:chunkId/sections', async (c) => {
    const user = c.get('user')
    const chunkId = c.req.param('chunkId')
    const { section_tags } = await c.req.json<{ section_tags: number[] }>()

    if (!Array.isArray(section_tags)) return c.json({ error: 'section_tags must be an array' }, 400)

    // Verify ownership via joins
    const chunk = await c.env.DB.prepare(
        `SELECT dc.id FROM document_chunks dc
         JOIN documents d ON dc.document_id = d.id
         JOIN projects p ON d.project_id = p.id
         WHERE dc.id = ? AND p.user_id = ? `
    ).bind(chunkId, user.sub).first()
    if (!chunk) return c.json({ error: 'Chunk not found or unauthorized' }, 404)

    await c.env.DB.prepare(
        'UPDATE document_chunks SET section_tags = ? WHERE id = ?'
    ).bind(JSON.stringify(section_tags), chunkId).run()

    return c.json({ success: true })
})

export default storageApp
