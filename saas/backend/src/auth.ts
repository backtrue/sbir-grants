import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { Bindings } from './middleware'

const authApp = new Hono<{ Bindings: Bindings }>({ strict: false })

// Helper to generate a random string
const generateState = () => crypto.randomUUID()

// Extract the root domain from a URL for cross-subdomain cookies.
// e.g. "https://api.thinkwithblack.com" → ".thinkwithblack.com"
const getRootDomain = (url: string): string | undefined => {
    try {
        const hostname = new URL(url).hostname
        const parts = hostname.split('.')
        if (parts.length >= 2) {
            return '.' + parts.slice(-2).join('.')
        }
    } catch { /* ignore */ }
    return undefined
}

authApp.get('/google/login', (c) => {
    const state = generateState()
    const frontendUrl = c.env.FRONTEND_URL || 'https://sbir.thinkwithblack.com';
    setCookie(c, 'oauth_state', state, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 60 * 10, // 10 minutes
        path: '/',
        domain: getRootDomain(frontendUrl),
    })

    const redirectUri = new URL(c.req.url).origin + '/auth/google/callback';
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid email profile')
    url.searchParams.set('state', state)

    return c.redirect(url.toString())
})

authApp.get('/google/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const storedState = getCookie(c, 'oauth_state')

    if (!code || !state || state !== storedState) {
        return c.text('Invalid request or state mismatch', 400)
    }

    const redirectUri = new URL(c.req.url).origin + '/auth/google/callback';

    // Exchange code for token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: c.env.GOOGLE_CLIENT_ID,
            client_secret: c.env.GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }).toString(),
    })

    if (!tokenResponse.ok) {
        return c.text('Failed to fetch token', 400)
    }

    const tokens = await tokenResponse.json() as { access_token: string, id_token: string }

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
            Authorization: `Bearer ${tokens.access_token}`,
        },
    })

    if (!userInfoResponse.ok) {
        return c.text('Failed to fetch user info', 400)
    }

    const userInfo = await userInfoResponse.json() as { id: string, email: string, name: string }

    // Upsert user to D1
    const userId = crypto.randomUUID()
    const db = c.env.DB

    const existingUser = await db.prepare('SELECT id FROM users WHERE google_id = ?')
        .bind(userInfo.id)
        .first<{ id: string }>()

    let finalUserId = userId
    if (existingUser) {
        finalUserId = existingUser.id
        await db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?')
            .bind(userInfo.name, userInfo.email, finalUserId)
            .run()
    } else {
        await db.prepare('INSERT INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)')
            .bind(finalUserId, userInfo.id, userInfo.email, userInfo.name)
            .run()
    }

    // Generate JWT
    const payload = {
        sub: finalUserId,
        email: userInfo.email,
        name: userInfo.name,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    }
    const token = await sign(payload, c.env.JWT_SECRET)

    const frontendUrl = c.env.FRONTEND_URL || 'https://sbir.thinkwithblack.com';

    // Set auth cookie on the shared root domain (.thinkwithblack.com) so it is
    // accessible by both the frontend (sbir.*) and the backend API (api.*).
    // SameSite=Lax works for same-site subdomains and is fully compatible with
    // iOS Safari / Edge — no more cross-domain blocking.
    setCookie(c, 'auth_session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        domain: getRootDomain(frontendUrl), // e.g. ".thinkwithblack.com"
    })

    return c.redirect(frontendUrl)
})

authApp.get('/logout', (c) => {
    const frontendUrl = c.env.FRONTEND_URL || 'https://sbir.thinkwithblack.com';
    const domain = getRootDomain(frontendUrl)
    deleteCookie(c, 'auth_session', { path: '/', domain })
    deleteCookie(c, 'oauth_state', { path: '/', domain })
    return c.redirect(frontendUrl)
})

export default authApp
