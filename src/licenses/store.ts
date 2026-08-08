import { nanoid } from 'nanoid'
import type { Db } from '../db/db'
import type { LicenseRow } from './entitlements'

// Data access for the 4 license tables. Pure SQL, parameterized, no ORM. All timestamps are
// supplied by callers (nowIso) so behavior is deterministic and testable.

export type NewLicenseInput = {
    keyHash: string
    keyPrefix: string
    keyType: string
    email: string
    companyName: string | null
    goal: string | null
    expiresAt: string | null
    graceDays: number
    entitlements: Record<string, unknown>
    numericLimits: Record<string, unknown> | null
    notes: string | null
    createdBy: string | null
    nowIso: string
}

export type ActivationRow = {
    platform_id: string
    instance_hint: string | null
    product_version: string | null
    first_seen: Date | string
    last_seen: Date | string
}

export type EventRow = {
    id: string
    license_key_id: string
    event_type: string
    actor: string
    detail: Record<string, unknown> | null
    created: Date | string
}

async function insertLicense(db: Db, input: NewLicenseInput): Promise<LicenseRow> {
    const id = nanoid()
    const result = await db.query<LicenseRow>(
        `INSERT INTO license_key
            (id, key_hash, key_prefix, status, key_type, email, company_name, goal,
             issued_at, first_activated_at, expires_at, grace_days, entitlements, numeric_limits,
             notes, created_by, created, updated)
         VALUES ($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8,NULL,$9,$10,$11,$12,$13,$14,$8,$8)
         RETURNING *`,
        [
            id, input.keyHash, input.keyPrefix, input.keyType, input.email, input.companyName,
            input.goal, input.nowIso, input.expiresAt, input.graceDays,
            JSON.stringify(input.entitlements),
            input.numericLimits === null ? null : JSON.stringify(input.numericLimits),
            input.notes, input.createdBy,
        ],
    )
    return result.rows[0]
}

async function findByHash(db: Db, keyHash: string): Promise<LicenseRow | null> {
    const result = await db.query<LicenseRow>('SELECT * FROM license_key WHERE key_hash = $1', [keyHash])
    return result.rows[0] ?? null
}

async function findById(db: Db, id: string): Promise<LicenseRow | null> {
    const result = await db.query<LicenseRow>('SELECT * FROM license_key WHERE id = $1', [id])
    return result.rows[0] ?? null
}

async function findActiveByEmail(db: Db, email: string): Promise<LicenseRow | null> {
    const result = await db.query<LicenseRow>(
        `SELECT * FROM license_key WHERE email = $1 AND status = 'ACTIVE'
         ORDER BY created DESC LIMIT 1`,
        [email],
    )
    return result.rows[0] ?? null
}

// Upsert an activation and stamp first_activated_at on the license exactly once.
async function upsertActivation(
    db: Db,
    params: { licenseKeyId: string, platformId: string, instanceHint: string | null, productVersion: string | null, nowIso: string },
): Promise<void> {
    await db.query(
        `INSERT INTO license_activation
            (id, license_key_id, platform_id, instance_hint, product_version, first_seen, last_seen)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         ON CONFLICT (license_key_id, platform_id)
         DO UPDATE SET last_seen = $6,
             instance_hint = COALESCE(EXCLUDED.instance_hint, license_activation.instance_hint),
             product_version = COALESCE(EXCLUDED.product_version, license_activation.product_version)`,
        [nanoid(), params.licenseKeyId, params.platformId, params.instanceHint, params.productVersion, params.nowIso],
    )
    await db.query(
        'UPDATE license_key SET first_activated_at = $2 WHERE id = $1 AND first_activated_at IS NULL',
        [params.licenseKeyId, params.nowIso],
    )
}

async function listActivations(db: Db, licenseKeyId: string): Promise<ActivationRow[]> {
    const result = await db.query<ActivationRow>(
        'SELECT platform_id, instance_hint, product_version, first_seen, last_seen FROM license_activation WHERE license_key_id = $1 ORDER BY first_seen',
        [licenseKeyId],
    )
    return result.rows
}

async function countActivations(db: Db, licenseKeyId: string): Promise<number> {
    const result = await db.query<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM license_activation WHERE license_key_id = $1',
        [licenseKeyId],
    )
    return Number(result.rows[0]?.count ?? 0)
}

async function appendEvent(
    db: Db,
    params: { licenseKeyId: string, eventType: string, actor: string, detail: Record<string, unknown> | null, nowIso: string },
): Promise<void> {
    await db.query(
        'INSERT INTO license_event (id, license_key_id, event_type, actor, detail, created) VALUES ($1,$2,$3,$4,$5,$6)',
        [nanoid(), params.licenseKeyId, params.eventType, params.actor, params.detail === null ? null : JSON.stringify(params.detail), params.nowIso],
    )
}

async function listEvents(db: Db, licenseKeyId: string, limit: number): Promise<EventRow[]> {
    const result = await db.query<EventRow>(
        'SELECT id, license_key_id, event_type, actor, detail, created FROM license_event WHERE license_key_id = $1 ORDER BY created DESC LIMIT $2',
        [licenseKeyId, limit],
    )
    return result.rows
}

export const licenseStore = {
    newId: nanoid,
    insertLicense,
    findByHash,
    findById,
    findActiveByEmail,
    upsertActivation,
    listActivations,
    countActivations,
    appendEvent,
    listEvents,
}
