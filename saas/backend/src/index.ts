import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authApp from './auth'
import projectsApp from './projects'
import storageApp from './storage'
import aiApp from './ai'
import extractApp from './extract'
import enrichApp from './enrich'
import regenerateApp from './regenerate'
import qualityApp from './quality'
import { authMiddleware, Bindings, Variables } from './middleware'
import { processDocumentQueue, DocProcessingMessage } from './queue'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>({ strict: false })

// Global middleware
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.FRONTEND_URL || 'https://sbir.thinkwithblack.com',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
  return await corsMiddleware(c, next)
})

// Auth routes
app.route('/auth', authApp)

// App routes - projects
app.route('/api/projects', projectsApp)
app.route('/api/storage', storageApp)
app.route('/api/ai', aiApp)
app.route('/api/extract', extractApp)
app.route('/api/enrich', enrichApp)
app.route('/api/regenerate', regenerateApp)
app.route('/api/quality', qualityApp)

// Protected routes demo
app.get('/api/me', authMiddleware, (c) => {
  const user = c.get('user')
  return c.json({ user })
})

// User API key management (BYOK — Bring Your Own Key)
app.get('/api/me/keys', authMiddleware, async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    'SELECT claude_key, openai_key, gemini_key FROM users WHERE id = ?'
  ).bind(user.sub).first<{ claude_key: string | null, openai_key: string | null, gemini_key: string | null }>()
  // Only expose whether a key is set, not the actual key value (security: keys visible only server-side)
  return c.json({
    claude_key_set: !!(row?.claude_key && row.claude_key !== 'null'),
    openai_key_set: !!(row?.openai_key && row.openai_key !== 'null'),
    gemini_key_set: !!(row?.gemini_key && row.gemini_key !== 'null'),
  })
})

app.put('/api/me/keys', authMiddleware, async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{
    claude_key?: string | null,
    openai_key?: string | null,
    gemini_key?: string | null
  }>()

  // Build dynamic update — only update fields that were explicitly provided
  const updates: string[] = []
  const params: (string | null)[] = []

  if ('claude_key' in body) { updates.push('claude_key = ?'); params.push(body.claude_key || null) }
  if ('openai_key' in body) { updates.push('openai_key = ?'); params.push(body.openai_key || null) }
  if ('gemini_key' in body) { updates.push('gemini_key = ?'); params.push(body.gemini_key || null) }

  if (updates.length === 0) return c.json({ error: 'No keys provided' }, 400)

  params.push(user.sub)
  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()

  return c.json({ success: true })
})

// Allow user to delete a specific key
app.delete('/api/me/keys/:keyType', authMiddleware, async (c) => {
  const user = c.get('user')
  const keyType = c.req.param('keyType')
  const allowed = ['claude_key', 'openai_key', 'gemini_key']
  if (!allowed.includes(keyType)) return c.json({ error: 'Invalid key type' }, 400)
  await c.env.DB.prepare(`UPDATE users SET ${keyType} = NULL WHERE id = ?`).bind(user.sub).run()
  return c.json({ success: true })
})

app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'SBIR SaaS Backend' })
})

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<DocProcessingMessage>, env: Bindings): Promise<void> {
    await processDocumentQueue(batch, env)
  }
}
