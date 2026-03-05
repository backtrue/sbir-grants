import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'

export type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  JWT_SECRET: string
  FRONTEND_URL: string
  sbir_saas_bucket: R2Bucket
  AI: any
  VECTORIZE: any
  DOC_QUEUE: Queue
  TAVILY_API_KEY?: string
}

export type Variables = {
  user: {
    sub: string;
    email: string;
    name: string;
    exp: number;
  }
}

export const authMiddleware = async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
  const token = getCookie(c, 'auth_session')
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256') as Variables['user']
    c.set('user', payload)
    await next()
  } catch (e) {
    return c.json({ error: 'Invalid or expired session' }, 401)
  }
}
