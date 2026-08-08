import { createPrivateKey, KeyObject, sign as edSign } from 'crypto'

/**
 * Ed25519 signing of entitlement documents (spec §1.5).
 *
 * The product instance ships the PUBLIC key and verifies the signature; it caches the last
 * good signed document and keeps entitlements active until `validUntil` (plus graceDays past
 * expiry) when the License Service is unreachable — so revocation propagates within ~72h.
 *
 * The signature is computed over CANONICAL JSON of the license object concatenated with
 * signedAt + validUntil, so re-serialization on the wire cannot change what was signed.
 */

const VALIDITY_HOURS = 72

let cachedKey: KeyObject | undefined
let cachedKeyId: string | undefined

function loadPrivateKey(): { key: KeyObject, keyId: string } {
    if (cachedKey !== undefined && cachedKeyId !== undefined) {
        return { key: cachedKey, keyId: cachedKeyId }
    }
    const pem = process.env.LICENSE_SIGNING_KEY
    if (pem === undefined || pem.trim() === '') {
        throw new Error('LICENSE_SIGNING_KEY is not configured')
    }
    // Support both a literal PEM and one with escaped newlines (env-var friendly).
    const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
    cachedKey = createPrivateKey(normalized)
    cachedKeyId = process.env.LICENSE_SIGNING_KEY_ID ?? 'ilk-sign-default'
    return { key: cachedKey, keyId: cachedKeyId }
}

// Deterministic, recursively key-sorted JSON so the signed bytes are stable regardless of
// property insertion order on either side.
function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        return '[' + value.map(canonicalJson).join(',') + ']'
    }
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(record[k])).join(',') + '}'
}

export type Signature = {
    alg: 'Ed25519'
    keyId: string
    signedAt: string
    validUntil: string
    value: string
}

// signedAt/validUntil are injected (never Date.now() here) so callers control the clock and
// tests are deterministic.
function signLicense(license: Record<string, unknown>, nowIso: string): Signature {
    const { key, keyId } = loadPrivateKey()
    const signedAt = nowIso
    const validUntil = new Date(new Date(nowIso).getTime() + VALIDITY_HOURS * 3600 * 1000).toISOString()
    const message = Buffer.from(canonicalJson(license) + signedAt + validUntil, 'utf8')
    const value = edSign(null, message, key).toString('base64')
    return { alg: 'Ed25519', keyId, signedAt, validUntil, value }
}

function isConfigured(): boolean {
    const pem = process.env.LICENSE_SIGNING_KEY
    return pem !== undefined && pem.trim() !== ''
}

export const licenseSigning = {
    signLicense,
    canonicalJson,
    isConfigured,
    VALIDITY_HOURS,
    // Exposed for tests to reset the memoized key when the env changes.
    _resetCache: (): void => {
        cachedKey = undefined
        cachedKeyId = undefined
    },
}
