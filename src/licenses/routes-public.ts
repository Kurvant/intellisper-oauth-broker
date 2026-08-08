import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/db'
import { EntitlementMatrix, NumericLimits } from './entitlements'
import { licenseService } from './service'
import { licenseStore } from './store'

// Public, instance-facing license routes (spec §1.3). The license key is the credential; there
// is no other auth on routes 1/2/3/5. Uniform 404s so keys cannot be enumerated. These routes
// are registered OUTSIDE the BROKER_API_KEY gate.

const createTrialSchema = z.object({
    email: z.string().min(3),
    companyName: z.string().optional(),
    goal: z.string().optional(),
    keyType: z.string().optional(),
}).and(EntitlementMatrix.partial())

const activateSchema = z.object({
    key: z.string().min(1),
    platformId: z.string().optional(),
    instanceHint: z.string().optional(),
    productVersion: z.string().optional(),
})

const verifySchema = z.object({
    key: z.string().min(1),
    platformId: z.string().optional(),
    productVersion: z.string().optional(),
})

export type PublicRoutesDeps = {
    getDb: () => Db
    now: () => string
    autoIssueTrials: boolean
    trialDays: number
}

export async function registerPublicLicenseRoutes(app: FastifyInstance, deps: PublicRoutesDeps): Promise<void> {
    // Route 1 — trial / license request (public). In manual mode returns 202 PENDING; in
    // auto-issue mode returns the signed entitlement doc. 409 when the email already holds a key.
    app.post('/license-keys', async (request, reply) => {
        const parsed = createTrialSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request' })
        }
        const db = deps.getDb()
        const nowIso = deps.now()
        const email = parsed.data.email.trim().toLowerCase()

        const existing = await licenseStore.findActiveByEmail(db, email)
        if (existing !== null) {
            return reply.code(409).send({ error: 'email_already_has_key' })
        }

        // Requested entitlement matrix (partial → default-off booleans, aiProvidersEnabled true).
        const requested = EntitlementMatrix.parse({
            ssoEnabled: false, scimEnabled: false, environmentsEnabled: false, showPoweredBy: true,
            embeddingEnabled: false, auditLogEnabled: false, customAppearanceEnabled: false,
            manageProjectsEnabled: false, manageBlocksEnabled: false, manageTemplatesEnabled: false,
            apiKeysEnabled: false, projectRolesEnabled: false, analyticsEnabled: false,
            globalConnectionsEnabled: false, customRolesEnabled: false, eventStreamingEnabled: false,
            secretManagersEnabled: false, agentsEnabled: false, aiProvidersEnabled: true,
            ...request.body as Record<string, unknown>,
        })

        if (!deps.autoIssueTrials) {
            // Insert a pending trial request unless one already exists for this email. The
            // partial unique index (email WHERE status='PENDING') is the race-safe backstop in
            // real Postgres; the pre-check keeps behaviour identical and portable.
            const pending = await db.query<{ id: string }>(
                `SELECT id FROM trial_request WHERE email = $1 AND status = 'PENDING' LIMIT 1`,
                [email],
            )
            if (pending.rows.length === 0) {
                await db.query(
                    `INSERT INTO trial_request (id, email, company_name, goal, requested_entitlements, status, created, updated)
                     VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$6)`,
                    [licenseStore.newId(), email, parsed.data.companyName ?? null, parsed.data.goal ?? null, JSON.stringify(requested), nowIso],
                )
            }
            return reply.code(202).send({ status: 'PENDING' })
        }

        const expiresAt = new Date(new Date(nowIso).getTime() + deps.trialDays * 86400 * 1000).toISOString()
        const { row, rawKey } = await licenseService.issue(db, {
            email, companyName: parsed.data.companyName ?? null, goal: parsed.data.goal ?? null,
            keyType: 'TRIAL', entitlements: requested, numericLimits: null, expiresAt, graceDays: 3,
            notes: null, createdBy: 'system', nowIso,
        })
        return reply.code(201).send(licenseService.toSignedEntity(row, rawKey, nowIso))
    })

    // Route 2 — fetch by raw key (public). Signed entity body; expired keys STILL 200; uniform
    // 404 for unknown so keys can't be probed.
    app.get<{ Params: { key: string } }>('/license-keys/:key', async (request, reply) => {
        const db = deps.getDb()
        const body = await licenseService.getByRawKey(db, request.params.key, deps.now())
        if (body === null) {
            return reply.code(404).send({ error: 'not_found' })
        }
        return reply.send(body)
    })

    // Route 3 — activation (public, idempotent). 404/409 are benign to the client.
    app.post('/license-keys/activate', async (request, reply) => {
        const parsed = activateSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request' })
        }
        const db = deps.getDb()
        const result = await licenseService.activate(db, {
            rawKey: parsed.data.key,
            platformId: parsed.data.platformId ?? null,
            instanceHint: parsed.data.instanceHint ?? null,
            productVersion: parsed.data.productVersion ?? null,
            nowIso: deps.now(),
        })
        if (result === 'not_found') {
            return reply.code(404).send({ error: 'not_found' })
        }
        return reply.code(204).send()
    })

    // Route 5 — signed verification (public). 403 with an explicit reason for revoked/expired so
    // the client downgrades immediately; 404 for unknown.
    app.post('/license-keys/verify', async (request, reply) => {
        const parsed = verifySchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request' })
        }
        const db = deps.getDb()
        const result = await licenseService.verify(db, {
            rawKey: parsed.data.key,
            platformId: parsed.data.platformId ?? null,
            productVersion: parsed.data.productVersion ?? null,
            nowIso: deps.now(),
        })
        switch (result.kind) {
            case 'not_found':
                return reply.code(404).send({ error: 'not_found' })
            case 'revoked':
                return reply.code(403).send({ reason: 'REVOKED' })
            case 'expired':
                return reply.code(403).send({ reason: 'EXPIRED' })
            case 'ok':
                return reply.send(result.body)
        }
    })
}

// Route 4 — extend-trial. Gated by the MANAGEMENT secret (the platform sends it as `api-key`),
// so it is registered inside the management-guarded scope, not the public one.
export async function registerExtendTrialRoute(app: FastifyInstance, deps: PublicRoutesDeps): Promise<void> {
    const extendSchema = z.object({ email: z.string().min(3), days: z.number().int().min(1).max(365) })
    app.post('/license-keys/extend-trial', async (request, reply) => {
        const parsed = extendSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request' })
        }
        const db = deps.getDb()
        const nowIso = deps.now()
        const email = parsed.data.email.trim().toLowerCase()
        const row = await licenseStore.findActiveByEmail(db, email)
        if (row === null) {
            return reply.code(404).send({ error: 'not_found' })
        }
        const base = row.expires_at === null ? new Date(nowIso) : new Date(row.expires_at as string)
        const newExpiry = new Date(base.getTime() + parsed.data.days * 86400 * 1000).toISOString()
        await db.query('UPDATE license_key SET expires_at = $2, updated = $3 WHERE id = $1', [row.id, newExpiry, nowIso])
        await licenseStore.appendEvent(db, {
            licenseKeyId: row.id, eventType: 'EXTENDED', actor: 'admin-api',
            detail: { days: parsed.data.days, newExpiry }, nowIso,
        })
        return reply.send({ status: 'ok', expiresAt: newExpiry })
    })
}

export const publicLicenseSchemas = { createTrialSchema, activateSchema, verifySchema, NumericLimits }
