import { createHash, timingSafeEqual } from 'crypto'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { z } from 'zod'
import { claimCode, refreshToken } from './oauth-exchange'
import { buildSecretStore } from './secret-store'
import { assertPublicHttpsUrl } from './ssrf-guard'

/**
 * Intellisper OAuth Broker.
 *
 * Holds provider CLIENT SECRETS and performs the OAuth2 code/refresh exchange on behalf of the
 * platform (cloud today, self-hosted instances later). Provider secrets never leave this service.
 *
 * SECURITY POSTURE (why each control exists):
 *  - Shared-secret auth: only callers holding BROKER_API_KEY can reach the exchange endpoints. The
 *    key is compared in constant time to avoid a timing oracle.
 *  - Rate limiting: blunts brute-force / abuse against the token endpoints.
 *  - SSRF guard: `tokenUrl` comes from the caller, so it is validated to be a public HTTPS URL
 *    before we ever POST credentials to it — a broker must never be tricked into sending a client
 *    secret to an attacker-chosen or internal address.
 *  - Least disclosure: the client secret is never returned or logged; errors are generic to the
 *    caller and detailed only in server logs.
 *  - Stateless: no database, no disk — secrets live only in memory, loaded from the environment.
 */

const claimSchema = z.object({
    blockName: z.string().min(1),
    clientId: z.string().min(1),
    tokenUrl: z.string().url(),
    code: z.string().min(1),
    codeVerifier: z.string().optional(),
    authorizationMethod: z.enum(['HEADER', 'BODY']).optional(),
    redirectUrl: z.string().url().optional(),
    edition: z.string().optional(),
})

const refreshSchema = z.object({
    blockName: z.string().min(1),
    clientId: z.string().min(1),
    tokenUrl: z.string().url(),
    refreshToken: z.string().min(1),
    authorizationMethod: z.enum(['HEADER', 'BODY']).optional(),
    edition: z.string().optional(),
})

async function build(): Promise<ReturnType<typeof Fastify>> {
    const apiKey = requireEnv('BROKER_API_KEY')
    const apiKeyHash = sha256(apiKey)
    const store = buildSecretStore(process.env.OAUTH_PROVIDERS)

    const app = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? 'info',
            // Belt-and-braces: redact anything secret-shaped that ever reaches a log line.
            redact: ['req.headers.authorization', '*.clientSecret', '*.client_secret', '*.access_token', '*.refresh_token'],
        },
        // We never render caller-supplied URLs into error pages; keep bodies small.
        bodyLimit: 64 * 1024,
    })

    await app.register(rateLimit, {
        max: Number(process.env.RATE_LIMIT_MAX ?? 60),
        timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    })

    // Auth gate on every route except health. Constant-time compare of a hash of the presented key.
    app.addHook('onRequest', async (request, reply) => {
        if (request.url === '/health') {
            return
        }
        const presented = (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
        if (presented === '' || !constantTimeEqual(sha256(presented), apiKeyHash)) {
            await reply.code(401).send({ error: 'unauthorized' })
        }
    })

    app.get('/health', async () => ({ status: 'ok', providers: store.size }))

    // Discovery: the authenticated platform asks which providers are broker-managed so its connection
    // dialog can offer a one-click Connect (CLOUD_OAUTH2) instead of prompting for the user's own
    // client id/secret. Returns PUBLIC identity only — (blockName, clientId) — never the secret. This
    // route is behind the same API-key gate as /claim and /refresh (the onRequest hook above).
    app.get('/providers', async () => ({ providers: store.list() }))

    app.post('/claim', async (request, reply) => {
        const parsed = claimSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request' })
        }
        const { blockName, clientId, tokenUrl, code, codeVerifier, authorizationMethod, redirectUrl } = parsed.data

        const guardError = assertPublicHttpsUrl(tokenUrl)
        if (guardError !== null) {
            request.log.warn({ tokenUrl, reason: guardError }, 'rejected tokenUrl (SSRF guard)')
            return reply.code(400).send({ error: 'invalid_token_url' })
        }

        const clientSecret = store.lookup({ blockName, clientId })
        if (clientSecret === null) {
            request.log.warn({ blockName, clientId }, 'no registered provider for (blockName, clientId)')
            return reply.code(404).send({ error: 'provider_not_registered' })
        }

        try {
            const value = await claimCode({ tokenUrl, clientId, clientSecret, authorizationMethod, code, codeVerifier, redirectUrl })
            return reply.send(value)
        }
        catch (err) {
            request.log.error({ err: errMessage(err), blockName }, 'claim exchange failed')
            return reply.code(502).send({ error: 'exchange_failed' })
        }
    })

    app.post('/refresh', async (request, reply) => {
        const parsed = refreshSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request' })
        }
        const { blockName, clientId, tokenUrl, refreshToken: token, authorizationMethod } = parsed.data

        const guardError = assertPublicHttpsUrl(tokenUrl)
        if (guardError !== null) {
            request.log.warn({ tokenUrl, reason: guardError }, 'rejected tokenUrl (SSRF guard)')
            return reply.code(400).send({ error: 'invalid_token_url' })
        }

        const clientSecret = store.lookup({ blockName, clientId })
        if (clientSecret === null) {
            request.log.warn({ blockName, clientId }, 'no registered provider for (blockName, clientId)')
            return reply.code(404).send({ error: 'provider_not_registered' })
        }

        try {
            const value = await refreshToken({ tokenUrl, clientId, clientSecret, authorizationMethod, refreshToken: token })
            return reply.send(value)
        }
        catch (err) {
            request.log.error({ err: errMessage(err), blockName }, 'refresh exchange failed')
            return reply.code(502).send({ error: 'exchange_failed' })
        }
    })

    return app
}

async function start(): Promise<void> {
    const app = await build()
    const port = Number(process.env.PORT ?? 8080)
    await app.listen({ port, host: '0.0.0.0' })
}

function requireEnv(name: string): string {
    const value = process.env[name]
    if (value === undefined || value.trim() === '') {
        throw new Error(`${name} is required`)
    }
    return value
}

function sha256(input: string): Buffer {
    return createHash('sha256').update(input).digest()
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
    return a.length === b.length && timingSafeEqual(a, b)
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

void start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[oauth-broker] failed to start:', err)
    process.exit(1)
})

export { build }
