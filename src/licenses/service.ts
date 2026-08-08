import type { Db } from '../db/db'
import { entitlements, type LicenseRow } from './entitlements'
import { licenseKeys } from './keys'
import { licenseSigning, type Signature } from './signing'
import { licenseStore } from './store'

// Business logic shared by the public and management route groups. Every method takes an
// injected `nowIso` clock so behaviour is deterministic under test.

export type IssueParams = {
    email: string
    companyName: string | null
    goal: string | null
    keyType: string
    entitlements: Record<string, unknown>
    numericLimits: Record<string, unknown> | null
    expiresAt: string | null
    graceDays: number
    notes: string | null
    createdBy: string
    nowIso: string
}

// Issue a license, returning the raw key ONCE alongside the stored row.
async function issue(db: Db, params: IssueParams): Promise<{ row: LicenseRow, rawKey: string }> {
    const rawKey = licenseKeys.generateRawKey()
    const row = await licenseStore.insertLicense(db, {
        keyHash: licenseKeys.hashKey(rawKey),
        keyPrefix: licenseKeys.keyPrefix(rawKey),
        keyType: params.keyType,
        email: params.email,
        companyName: params.companyName,
        goal: params.goal,
        expiresAt: params.expiresAt,
        graceDays: params.graceDays,
        entitlements: params.entitlements,
        numericLimits: params.numericLimits,
        notes: params.notes,
        createdBy: params.createdBy,
        nowIso: params.nowIso,
    })
    await licenseStore.appendEvent(db, {
        licenseKeyId: row.id,
        eventType: 'ISSUED',
        actor: params.createdBy,
        detail: { keyType: params.keyType },
        nowIso: params.nowIso,
    })
    return { row, rawKey }
}

// The signed entitlement document body. Entity fields at top level + `signature` sibling
// (never nested) so the legacy client's `response.data as LicenseKeyEntity` parse still works.
function toSignedEntity(row: LicenseRow, rawKey: string, nowIso: string): Record<string, unknown> {
    const entity = entitlements.toEntity(row, rawKey)
    const signature: Signature = licenseSigning.signLicense(entity, nowIso)
    return { ...entity, signature }
}

// Route 2: fetch by raw key. Expired keys are STILL returned with 200 (the client judges
// expiry itself). Returns null when unknown → the route maps to a uniform 404.
async function getByRawKey(db: Db, rawKey: string, nowIso: string): Promise<Record<string, unknown> | null> {
    const row = await licenseStore.findByHash(db, licenseKeys.hashKey(rawKey))
    if (row === null) {
        return null
    }
    return toSignedEntity(row, rawKey, nowIso)
}

// Route 3: idempotent activation. 404 unknown / already-fine are benign to the client.
async function activate(
    db: Db,
    params: { rawKey: string, platformId: string | null, instanceHint: string | null, productVersion: string | null, nowIso: string },
): Promise<'ok' | 'not_found'> {
    const row = await licenseStore.findByHash(db, licenseKeys.hashKey(params.rawKey))
    if (row === null) {
        return 'not_found'
    }
    if (params.platformId !== null) {
        await licenseStore.upsertActivation(db, {
            licenseKeyId: row.id,
            platformId: params.platformId,
            instanceHint: params.instanceHint,
            productVersion: params.productVersion,
            nowIso: params.nowIso,
        })
        await licenseStore.appendEvent(db, {
            licenseKeyId: row.id,
            eventType: 'ACTIVATED',
            actor: 'instance',
            detail: { platformId: params.platformId, productVersion: params.productVersion },
            nowIso: params.nowIso,
        })
    }
    return 'ok'
}

export type VerifyResult =
    | { kind: 'ok', body: Record<string, unknown> }
    | { kind: 'not_found' }
    | { kind: 'revoked' }
    | { kind: 'expired' }

// Route 5: authoritative signed verification. Distinguishes REVOKED / EXPIRED so the client can
// downgrade immediately, vs a cached-grace path when the service is simply unreachable.
async function verify(
    db: Db,
    params: { rawKey: string, platformId: string | null, productVersion: string | null, nowIso: string },
): Promise<VerifyResult> {
    const row = await licenseStore.findByHash(db, licenseKeys.hashKey(params.rawKey))
    if (row === null) {
        return { kind: 'not_found' }
    }
    if (row.status === 'REVOKED') {
        return { kind: 'revoked' }
    }
    const expiresAt = entitlements.toIso(row.expires_at)
    if (expiresAt !== null && new Date(expiresAt).getTime() < new Date(params.nowIso).getTime()) {
        return { kind: 'expired' }
    }
    // Record the verify as an activation touch (keeps last_seen / product_version fresh).
    if (params.platformId !== null) {
        await licenseStore.upsertActivation(db, {
            licenseKeyId: row.id,
            platformId: params.platformId,
            instanceHint: null,
            productVersion: params.productVersion,
            nowIso: params.nowIso,
        })
    }
    await licenseStore.appendEvent(db, {
        licenseKeyId: row.id,
        eventType: 'VERIFIED',
        actor: 'instance',
        detail: { platformId: params.platformId },
        nowIso: params.nowIso,
    })
    return { kind: 'ok', body: toSignedEntity(row, params.rawKey, params.nowIso) }
}

export const licenseService = {
    issue,
    getByRawKey,
    activate,
    verify,
    toSignedEntity,
}
