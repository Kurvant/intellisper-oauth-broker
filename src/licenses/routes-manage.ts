import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../db/db'
import { entitlements, EntitlementMatrix, type LicenseRow, NumericLimits } from './entitlements'
import { licenseKeys } from './keys'
import { licenseService } from './service'
import { licenseStore } from './store'

// Management API (spec §1.6). Gated by LICENSE_MANAGEMENT_API_KEY (a DIFFERENT secret than the
// OAuth BROKER_API_KEY). The Admin Platform is the only intended caller. Never returns key_hash;
// returns a raw key only on issue and rotate.

export type ManageRoutesDeps = {
    getDb: () => Db
    now: () => string
}

// The management view of a license (never the hash). numericLimits/graceDays surfaced for the
// admin editor.
function toManageView(row: LicenseRow, activationCount: number): Record<string, unknown> {
    return {
        id: row.id,
        keyPrefix: row.key_prefix,
        status: row.status,
        keyType: row.key_type,
        email: row.email,
        companyName: row.company_name,
        goal: row.goal,
        issuedAt: entitlements.toIso(row.issued_at),
        firstActivatedAt: entitlements.toIso(row.first_activated_at),
        expiresAt: entitlements.toIso(row.expires_at),
        graceDays: row.grace_days,
        activationCount,
        entitlements: entitlements.normalizeEntitlements(row.entitlements),
        numericLimits: row.numeric_limits ?? null,
        notes: row.notes,
        createdBy: row.created_by,
    }
}

const issueSchema = z.object({
    email: z.string().min(3),
    companyName: z.string().optional(),
    keyType: z.enum(['TRIAL', 'PAID', 'INTERNAL', 'PARTNER']),
    entitlements: EntitlementMatrix,
    numericLimits: NumericLimits.optional(),
    graceDays: z.number().int().min(0).max(365).optional(),
    expiresAt: z.string().optional(),
    notes: z.string().optional(),
})

const patchSchema = z.object({
    entitlements: EntitlementMatrix.optional(),
    numericLimits: NumericLimits.nullable().optional(),
    graceDays: z.number().int().min(0).max(365).optional(),
    expiresAt: z.string().nullable().optional(),
    notes: z.string().optional(),
})

export async function registerManageLicenseRoutes(app: FastifyInstance, deps: ManageRoutesDeps): Promise<void> {
    // Issue → returns the raw key once.
    app.post('/manage/license-keys', async (request, reply) => {
        const parsed = issueSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request', detail: parsed.error.issues })
        }
        const db = deps.getDb()
        const nowIso = deps.now()
        const { row, rawKey } = await licenseService.issue(db, {
            email: parsed.data.email.trim().toLowerCase(),
            companyName: parsed.data.companyName ?? null,
            goal: null,
            keyType: parsed.data.keyType,
            entitlements: parsed.data.entitlements,
            numericLimits: parsed.data.numericLimits ?? null,
            expiresAt: parsed.data.expiresAt ?? null,
            graceDays: parsed.data.graceDays ?? 3,
            notes: parsed.data.notes ?? null,
            createdBy: 'admin-api',
            nowIso,
        })
        return reply.code(201).send({ license: toManageView(row, 0), key: rawKey })
    })

    // List with filters + keyset cursor (created,id).
    app.get('/manage/license-keys', async (request, reply) => {
        const db = deps.getDb()
        const q = request.query as Record<string, string | undefined>
        const limit = Math.min(100, Math.max(1, Number(q.limit ?? 25)))
        const clauses: string[] = []
        const params: unknown[] = []
        if (q.status) { params.push(q.status); clauses.push(`status = $${params.length}`) }
        if (q.keyType) { params.push(q.keyType); clauses.push(`key_type = $${params.length}`) }
        if (q.email) { params.push(q.email.trim().toLowerCase()); clauses.push(`email = $${params.length}`) }
        if (q.expiringBefore) { params.push(q.expiringBefore); clauses.push(`expires_at IS NOT NULL AND expires_at < $${params.length}`) }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
        params.push(limit + 1)
        const rows = (await db.query<LicenseRow>(
            `SELECT * FROM license_key ${where} ORDER BY created DESC, id DESC LIMIT $${params.length}`,
            params,
        )).rows
        const hasMore = rows.length > limit
        const page = rows.slice(0, limit)
        const data = await Promise.all(page.map(async (row) => toManageView(row, await licenseStore.countActivations(db, row.id))))
        return reply.send({ data, hasMore })
    })

    // Detail with activations + last 50 events.
    app.get<{ Params: { id: string } }>('/manage/license-keys/:id', async (request, reply) => {
        const db = deps.getDb()
        const row = await licenseStore.findById(db, request.params.id)
        if (row === null) {
            return reply.code(404).send({ error: 'not_found' })
        }
        const [activations, events, count] = await Promise.all([
            licenseStore.listActivations(db, row.id),
            licenseStore.listEvents(db, row.id, 50),
            licenseStore.countActivations(db, row.id),
        ])
        return reply.send({
            ...toManageView(row, count),
            activations: activations.map((a) => ({
                platformId: a.platform_id, instanceHint: a.instance_hint, productVersion: a.product_version,
                firstSeen: entitlements.toIso(a.first_seen), lastSeen: entitlements.toIso(a.last_seen),
            })),
            events: events.map((e) => ({
                id: e.id, eventType: e.event_type, actor: e.actor, detail: e.detail ?? {},
                created: entitlements.toIso(e.created),
            })),
        })
    })

    // Patch entitlements / expiry / graceDays / numericLimits / notes → appends ENTITLEMENTS_CHANGED.
    app.post<{ Params: { id: string } }>('/manage/license-keys/:id', async (request, reply) => {
        const parsed = patchSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ error: 'invalid_request', detail: parsed.error.issues })
        }
        const db = deps.getDb()
        const nowIso = deps.now()
        const row = await licenseStore.findById(db, request.params.id)
        if (row === null) {
            return reply.code(404).send({ error: 'not_found' })
        }
        const sets: string[] = []
        const params: unknown[] = []
        if (parsed.data.entitlements !== undefined) { params.push(JSON.stringify(parsed.data.entitlements)); sets.push(`entitlements = $${params.length}`) }
        if (parsed.data.numericLimits !== undefined) { params.push(parsed.data.numericLimits === null ? null : JSON.stringify(parsed.data.numericLimits)); sets.push(`numeric_limits = $${params.length}`) }
        if (parsed.data.graceDays !== undefined) { params.push(parsed.data.graceDays); sets.push(`grace_days = $${params.length}`) }
        if (parsed.data.expiresAt !== undefined) { params.push(parsed.data.expiresAt); sets.push(`expires_at = $${params.length}`) }
        if (parsed.data.notes !== undefined) { params.push(parsed.data.notes); sets.push(`notes = $${params.length}`) }
        params.push(nowIso); sets.push(`updated = $${params.length}`)
        params.push(row.id)
        await db.query(`UPDATE license_key SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
        await licenseStore.appendEvent(db, { licenseKeyId: row.id, eventType: 'ENTITLEMENTS_CHANGED', actor: 'admin-api', detail: {}, nowIso })
        const updated = await licenseStore.findById(db, row.id)
        return reply.send(toManageView(updated!, await licenseStore.countActivations(db, row.id)))
    })

    // Revoke.
    app.post<{ Params: { id: string } }>('/manage/license-keys/:id/revoke', async (request, reply) => {
        const db = deps.getDb()
        const nowIso = deps.now()
        const row = await licenseStore.findById(db, request.params.id)
        if (row === null) {
            return reply.code(404).send({ error: 'not_found' })
        }
        await db.query('UPDATE license_key SET status = $2, updated = $3 WHERE id = $1', [row.id, 'REVOKED', nowIso])
        await licenseStore.appendEvent(db, { licenseKeyId: row.id, eventType: 'REVOKED', actor: 'admin-api', detail: {}, nowIso })
        return reply.send(toManageView({ ...row, status: 'REVOKED' }, await licenseStore.countActivations(db, row.id)))
    })

    // Rotate → new raw key, same record, old hash immediately invalid.
    app.post<{ Params: { id: string } }>('/manage/license-keys/:id/rotate', async (request, reply) => {
        const db = deps.getDb()
        const nowIso = deps.now()
        const row = await licenseStore.findById(db, request.params.id)
        if (row === null) {
            return reply.code(404).send({ error: 'not_found' })
        }
        const rawKey = licenseKeys.generateRawKey()
        await db.query('UPDATE license_key SET key_hash = $2, key_prefix = $3, updated = $4 WHERE id = $1',
            [row.id, licenseKeys.hashKey(rawKey), licenseKeys.keyPrefix(rawKey), nowIso])
        await licenseStore.appendEvent(db, { licenseKeyId: row.id, eventType: 'ROTATED', actor: 'admin-api', detail: {}, nowIso })
        const updated = await licenseStore.findById(db, row.id)
        return reply.send({ license: toManageView(updated!, await licenseStore.countActivations(db, row.id)), key: rawKey })
    })

    // Stats (dashboard tiles).
    app.get('/manage/stats', async (_request, reply) => {
        const db = deps.getDb()
        const nowIso = deps.now()
        const in14 = new Date(new Date(nowIso).getTime() + 14 * 86400 * 1000).toISOString()
        const in30ago = new Date(new Date(nowIso).getTime() - 30 * 86400 * 1000).toISOString()
        const active = await db.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM license_key WHERE status='ACTIVE'`)
        const revoked = await db.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM license_key WHERE status='REVOKED'`)
        const trial = await db.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM license_key WHERE key_type='TRIAL' AND status='ACTIVE'`)
        const expiring = await db.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM license_key WHERE status='ACTIVE' AND expires_at IS NOT NULL AND expires_at < $1`, [in14])
        const activations = await db.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM license_activation WHERE first_seen >= $1`, [in30ago])
        return reply.send({
            active: Number(active.rows[0]?.count ?? 0),
            revoked: Number(revoked.rows[0]?.count ?? 0),
            trial: Number(trial.rows[0]?.count ?? 0),
            expiringIn14Days: Number(expiring.rows[0]?.count ?? 0),
            activationsLast30Days: Number(activations.rows[0]?.count ?? 0),
        })
    })

    // Trial-request queue.
    app.get('/manage/trial-requests', async (request, reply) => {
        const db = deps.getDb()
        const q = request.query as Record<string, string | undefined>
        const limit = Math.min(100, Math.max(1, Number(q.limit ?? 25)))
        const clauses: string[] = []
        const params: unknown[] = []
        if (q.status) { params.push(q.status); clauses.push(`status = $${params.length}`) }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
        params.push(limit + 1)
        const rows = (await db.query<Record<string, unknown>>(
            `SELECT * FROM trial_request ${where} ORDER BY created DESC, id DESC LIMIT $${params.length}`, params,
        )).rows
        const hasMore = rows.length > limit
        const data = rows.slice(0, limit).map((r) => ({
            id: r.id, email: r.email, companyName: r.company_name ?? null, goal: r.goal ?? null,
            requestedEntitlements: r.requested_entitlements ?? null, status: r.status,
            licenseKeyId: r.license_key_id ?? null,
            created: entitlements.toIso(r.created as string), updated: entitlements.toIso(r.updated as string),
        }))
        return reply.send({ data, hasMore })
    })

    // Approve → issues a key (default trial entitlements) and links it.
    app.post<{ Params: { id: string } }>('/manage/trial-requests/:id/approve', async (request, reply) => {
        const db = deps.getDb()
        const nowIso = deps.now()
        const tr = (await db.query<Record<string, unknown>>('SELECT * FROM trial_request WHERE id = $1', [request.params.id])).rows[0]
        if (tr === undefined) {
            return reply.code(404).send({ error: 'not_found' })
        }
        if (tr.status !== 'PENDING') {
            return reply.code(409).send({ error: 'not_pending' })
        }
        const body = (request.body ?? {}) as Record<string, unknown>
        const durationDays = typeof body.durationDays === 'number' ? body.durationDays : 14
        const matrix = EntitlementMatrix.parse(body.entitlements ?? tr.requested_entitlements ?? { aiProvidersEnabled: true, showPoweredBy: true, ssoEnabled: false, scimEnabled: false, environmentsEnabled: false, embeddingEnabled: false, auditLogEnabled: false, customAppearanceEnabled: false, manageProjectsEnabled: false, manageBlocksEnabled: false, manageTemplatesEnabled: false, apiKeysEnabled: false, projectRolesEnabled: false, analyticsEnabled: false, globalConnectionsEnabled: false, customRolesEnabled: false, eventStreamingEnabled: false, secretManagersEnabled: false, agentsEnabled: false })
        const expiresAt = new Date(new Date(nowIso).getTime() + durationDays * 86400 * 1000).toISOString()
        const { row, rawKey } = await licenseService.issue(db, {
            email: String(tr.email).trim().toLowerCase(), companyName: (tr.company_name as string) ?? null,
            goal: (tr.goal as string) ?? null, keyType: 'TRIAL', entitlements: matrix,
            numericLimits: (body.numericLimits as Record<string, unknown>) ?? null, expiresAt,
            graceDays: typeof body.graceDays === 'number' ? body.graceDays : 3, notes: null,
            createdBy: 'admin-api', nowIso,
        })
        await db.query('UPDATE trial_request SET status = $2, license_key_id = $3, updated = $4 WHERE id = $1', [tr.id, 'APPROVED', row.id, nowIso])
        return reply.send({ license: toManageView(row, 0), key: rawKey })
    })

    // Deny.
    app.post<{ Params: { id: string } }>('/manage/trial-requests/:id/deny', async (request, reply) => {
        const db = deps.getDb()
        const nowIso = deps.now()
        const tr = (await db.query<Record<string, unknown>>('SELECT * FROM trial_request WHERE id = $1', [request.params.id])).rows[0]
        if (tr === undefined) {
            return reply.code(404).send({ error: 'not_found' })
        }
        await db.query('UPDATE trial_request SET status = $2, updated = $3 WHERE id = $1', [tr.id, 'DENIED', nowIso])
        return reply.code(204).send()
    })
}
