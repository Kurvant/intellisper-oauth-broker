import { createHash } from 'crypto'
import rateLimit from '@fastify/rate-limit'
import Fastify, { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { brokerAuth } from './auth/scopes'
import { type Db, getDb, isLicensingEnabled } from './db/db'
import { runMigrations } from './db/migrate'
import { registerExtendTrialRoute, registerPublicLicenseRoutes } from './licenses/routes-public'
import { registerManageLicenseRoutes } from './licenses/routes-manage'
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

export type BuildOptions = {
    // Injected in tests so the broker runs against pg-mem with a deterministic clock. In
    // production these default to the real pg pool and the system clock.
    db?: Db
    now?: () => string
}

async function build(options: BuildOptions = {}): Promise<FastifyInstance> {
    const apiKey = requireEnv('BROKER_API_KEY')
    const apiKeyHash = sha256(apiKey)
    const store = buildSecretStore(process.env.OAUTH_PROVIDERS)

    const app = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? 'info',
            // Belt-and-braces: redact anything secret-shaped that ever reaches a log line.
            // `*.key` covers the raw license key that flows through the management responses.
            redact: ['req.headers.authorization', 'req.headers["api-key"]', '*.clientSecret', '*.client_secret', '*.access_token', '*.refresh_token', '*.key'],
        },
        // We never render caller-supplied URLs into error pages; keep bodies small.
        bodyLimit: 64 * 1024,
    })

    await app.register(rateLimit, {
        max: Number(process.env.RATE_LIMIT_MAX ?? 60),
        timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    })

    app.get('/health', async () => ({ status: 'ok', providers: store.size, licensing: isLicensingEnabled() }))

    // ── Scope 1: OAuth brokering (BROKER_API_KEY, Authorization: Bearer). Encapsulated so its
    // auth hook applies ONLY to these routes — the global gate is gone.
    const oauthGuard = brokerAuth.makeBearerGuard(apiKeyHash)
    await app.register(async (oauth) => {
        oauth.addHook('onRequest', oauthGuard)

        // Discovery: PUBLIC identity only — (blockName, clientId) — never the secret.
        oauth.get('/providers', async () => ({ providers: store.list() }))

        registerOAuthExchangeRoutes(oauth, store)
    })

    // ── Scope 2 & 3: licensing. Registered only when DATABASE_URL is configured; when absent
    // the license routes 503 (below) while OAuth keeps working — brokering must never depend on
    // the license database.
    await registerLicensing(app, options)

    return app
}

// Extracted so the OAuth routes register inside the guarded scope above.
function registerOAuthExchangeRoutes(app: FastifyInstance, store: ReturnType<typeof buildSecretStore>): void {
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
}

// Registers the license scopes. When DATABASE_URL is unset (and no db is injected), the public
// and management license routes return 503 with a single warning — OAuth brokering is unaffected.
async function registerLicensing(app: FastifyInstance, options: BuildOptions): Promise<void> {
    const licensingActive = options.db !== undefined || isLicensingEnabled()
    const now = options.now ?? ((): string => new Date().toISOString())
    const resolveDb = (): Db => options.db ?? getDb()

    if (!licensingActive) {
        // Advertise the surface but degrade gracefully so a misconfigured deploy fails loudly at
        // the route, not silently. A single log line avoids noise.
        app.log.warn('DATABASE_URL not set — license routes are disabled (503); OAuth brokering unaffected')
        const degrade = async (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }): Promise<unknown> =>
            reply.code(503).send({ error: 'licensing_unavailable' })
        app.post('/license-keys', degrade)
        app.get('/license-keys/:key', degrade)
        app.post('/license-keys/activate', degrade)
        app.post('/license-keys/verify', degrade)
        app.post('/license-keys/extend-trial', degrade)
        app.all('/manage/*', degrade)
        return
    }

    if (options.db === undefined) {
        // Run migrations against the real database on boot (idempotent).
        await runMigrations(getDb())
    }

    const autoIssueTrials = (process.env.TRIAL_AUTO_ISSUE ?? 'false') === 'true'
    const trialDays = Number(process.env.TRIAL_DAYS ?? 14)
    const publicDeps = { getDb: resolveDb, now, autoIssueTrials, trialDays }

    // Scope 2: public license routes — NO api-key gate, tighter rate limit, uniform 404s.
    await app.register(async (pub) => {
        await pub.register(rateLimit, {
            max: Number(process.env.LICENSE_RATE_LIMIT_MAX ?? 30),
            timeWindow: process.env.LICENSE_RATE_LIMIT_WINDOW ?? '1 minute',
        })
        await registerPublicLicenseRoutes(pub, publicDeps)
    })

    // Scope 3: management routes + extend-trial — LICENSE_MANAGEMENT_API_KEY (api-key header).
    const mgmtKey = requireEnv('LICENSE_MANAGEMENT_API_KEY')
    const mgmtGuard = brokerAuth.makeManagementGuard(brokerAuth.sha256(mgmtKey))
    await app.register(async (mgmt) => {
        mgmt.addHook('onRequest', mgmtGuard)
        await registerExtendTrialRoute(mgmt, publicDeps)
        await registerManageLicenseRoutes(mgmt, { getDb: resolveDb, now })
    })
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

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

// Only auto-start when run as the entrypoint (node dist/index.js), never on import from a test.
if (require.main === module) {
    void start().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[oauth-broker] failed to start:', err)
        process.exit(1)
    })
}

export { build }
