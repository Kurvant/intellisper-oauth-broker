import { generateKeyPairSync, verify as edVerify } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { newDb } from 'pg-mem'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/db'
import { runMigrations } from '../db/migrate'
import { licenseSigning } from './signing'
import { build } from '../index'

// pg-mem gives us a real in-process Postgres, so the full licensing surface is tested with no
// external database. A fixed clock makes signing / expiry deterministic.

const FIXED_NOW = '2026-08-03T12:00:00.000Z'
let publicKeyPem: string

function makeDb(): Db {
    const mem = newDb()
    const pg = mem.adapters.createPg()
    const pool = new pg.Pool()
    return { query: (text: string, params?: unknown[]) => pool.query(text, params) }
}

const MATRIX = {
    ssoEnabled: true, scimEnabled: false, environmentsEnabled: true, showPoweredBy: false,
    embeddingEnabled: true, auditLogEnabled: true, customAppearanceEnabled: true,
    manageProjectsEnabled: true, manageBlocksEnabled: true, manageTemplatesEnabled: true,
    apiKeysEnabled: true, projectRolesEnabled: true, analyticsEnabled: true,
    globalConnectionsEnabled: true, customRolesEnabled: true, eventStreamingEnabled: true,
    secretManagersEnabled: true, agentsEnabled: true, aiProvidersEnabled: true,
    chatEnabled: true, dataManipulationEnabled: true,
}

async function buildApp(db: Db, now = FIXED_NOW): Promise<FastifyInstance> {
    return build({ db, now: () => now })
}

const MGMT = { 'api-key': 'mgmt-secret' }

beforeAll(() => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    process.env.LICENSE_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    process.env.LICENSE_SIGNING_KEY_ID = 'ilk-sign-test'
    process.env.BROKER_API_KEY = 'oauth-secret'
    process.env.OAUTH_PROVIDERS = '[]'
    process.env.LICENSE_MANAGEMENT_API_KEY = 'mgmt-secret'
})

beforeEach(() => licenseSigning._resetCache())

describe('management API — auth scope isolation', () => {
    let app: FastifyInstance
    let db: Db
    beforeEach(async () => { db = makeDb(); await runMigrations(db); app = await buildApp(db) })
    afterEach(async () => { await app.close() })

    it('rejects management calls without the management key', async () => {
        const res = await app.inject({ method: 'GET', url: '/manage/license-keys' })
        expect(res.statusCode).toBe(401)
    })

    it('rejects management calls presenting the OAuth key instead', async () => {
        const res = await app.inject({ method: 'GET', url: '/manage/license-keys', headers: { authorization: 'Bearer oauth-secret' } })
        expect(res.statusCode).toBe(401)
    })

    it('accepts management calls with the management key', async () => {
        const res = await app.inject({ method: 'GET', url: '/manage/license-keys', headers: MGMT })
        expect(res.statusCode).toBe(200)
    })

    it('public license routes require NO key', async () => {
        const res = await app.inject({ method: 'GET', url: '/license-keys/ilk_unknown' })
        expect(res.statusCode).toBe(404) // reached the handler, uniform not-found
    })
})

describe('issue → get → activate → verify (happy path + wire-compat)', () => {
    let app: FastifyInstance
    let db: Db
    beforeEach(async () => { db = makeDb(); await runMigrations(db); app = await buildApp(db) })
    afterEach(async () => { await app.close() })

    async function issue(): Promise<{ id: string, key: string }> {
        const res = await app.inject({
            method: 'POST', url: '/manage/license-keys', headers: MGMT,
            payload: { email: 'ops@customer.com', companyName: 'Cust', keyType: 'PAID', entitlements: MATRIX, expiresAt: '2027-01-01T00:00:00.000Z' },
        })
        expect(res.statusCode).toBe(201)
        const body = res.json()
        return { id: body.license.id, key: body.key }
    }

    it('issues a raw ilk_ key exactly once and stores only its hash', async () => {
        const { key } = await issue()
        expect(key.startsWith('ilk_')).toBe(true)
        expect(key.length).toBe(4 + 43)
        // The management list never carries the raw key or hash.
        const list = await app.inject({ method: 'GET', url: '/manage/license-keys', headers: MGMT })
        const first = list.json().data[0]
        expect(first.key).toBeUndefined()
        expect(first.keyPrefix).toBe(key.slice(0, 12))
    })

    it('GET /license-keys/{key} returns entity fields at top level with a sibling signature', async () => {
        const { key } = await issue()
        const res = await app.inject({ method: 'GET', url: `/license-keys/${key}` })
        expect(res.statusCode).toBe(200)
        const body = res.json()
        // Entity fields are TOP LEVEL (legacy client parses body as LicenseKeyEntity).
        expect(body.ssoEnabled).toBe(true)
        expect(body.key).toBe(key)
        expect(typeof body.expiresAt).toBe('string')
        // signature is a SIBLING property, not a wrapper.
        expect(body.signature.alg).toBe('Ed25519')
        expect(body.signature.keyId).toBe('ilk-sign-test')
    })

    it('the signature verifies against the public key over canonical(entity)+signedAt+validUntil', async () => {
        const { key } = await issue()
        const body = (await app.inject({ method: 'GET', url: `/license-keys/${key}` })).json()
        const { signature, ...entity } = body
        const message = Buffer.from(licenseSigning.canonicalJson(entity) + signature.signedAt + signature.validUntil, 'utf8')
        const ok = edVerify(null, message, publicKeyPem, Buffer.from(signature.value, 'base64'))
        expect(ok).toBe(true)
        // validUntil is signedAt + 72h.
        expect(new Date(signature.validUntil).getTime() - new Date(signature.signedAt).getTime()).toBe(72 * 3600 * 1000)
    })

    it('activation is idempotent and stamps first_activated_at once', async () => {
        const { id, key } = await issue()
        const a1 = await app.inject({ method: 'POST', url: '/license-keys/activate', payload: { key, platformId: 'plat_1', productVersion: '1.2.3' } })
        expect(a1.statusCode).toBe(204)
        const a2 = await app.inject({ method: 'POST', url: '/license-keys/activate', payload: { key, platformId: 'plat_1' } })
        expect(a2.statusCode).toBe(204)
        const detail = (await app.inject({ method: 'GET', url: `/manage/license-keys/${id}`, headers: MGMT })).json()
        expect(detail.activations).toHaveLength(1)
        expect(detail.firstActivatedAt).toBe(FIXED_NOW)
        expect(detail.activations[0].productVersion).toBe('1.2.3')
    })

    it('verify returns a signed OK for an active, unexpired key', async () => {
        const { key } = await issue()
        const res = await app.inject({ method: 'POST', url: '/license-keys/verify', payload: { key, platformId: 'plat_1' } })
        expect(res.statusCode).toBe(200)
        expect(res.json().signature.alg).toBe('Ed25519')
    })
})

describe('negative + lifecycle', () => {
    let app: FastifyInstance
    let db: Db
    beforeEach(async () => { db = makeDb(); await runMigrations(db); app = await buildApp(db) })
    afterEach(async () => { await app.close() })

    async function issue(expiresAt: string | undefined = '2027-01-01T00:00:00.000Z'): Promise<{ id: string, key: string }> {
        const body = (await app.inject({ method: 'POST', url: '/manage/license-keys', headers: MGMT, payload: { email: 'a@b.com', keyType: 'PAID', entitlements: MATRIX, expiresAt } })).json()
        return { id: body.license.id, key: body.key }
    }

    it('unknown key yields a uniform 404 on get and verify (no enumeration oracle)', async () => {
        expect((await app.inject({ method: 'GET', url: '/license-keys/ilk_nope' })).statusCode).toBe(404)
        expect((await app.inject({ method: 'POST', url: '/license-keys/verify', payload: { key: 'ilk_nope' } })).statusCode).toBe(404)
    })

    it('expired key: GET still 200, verify returns 403 EXPIRED', async () => {
        const { key } = await issue('2020-01-01T00:00:00.000Z')
        expect((await app.inject({ method: 'GET', url: `/license-keys/${key}` })).statusCode).toBe(200)
        const v = await app.inject({ method: 'POST', url: '/license-keys/verify', payload: { key } })
        expect(v.statusCode).toBe(403)
        expect(v.json().reason).toBe('EXPIRED')
    })

    it('revoked key: verify returns 403 REVOKED', async () => {
        const { id, key } = await issue()
        await app.inject({ method: 'POST', url: `/manage/license-keys/${id}/revoke`, headers: MGMT })
        const v = await app.inject({ method: 'POST', url: '/license-keys/verify', payload: { key } })
        expect(v.statusCode).toBe(403)
        expect(v.json().reason).toBe('REVOKED')
    })

    it('rotate invalidates the old key atomically and issues a new working one', async () => {
        const { id, key: oldKey } = await issue()
        const rot = await app.inject({ method: 'POST', url: `/manage/license-keys/${id}/rotate`, headers: MGMT })
        expect(rot.statusCode).toBe(200)
        const newKey = rot.json().key
        expect(newKey).not.toBe(oldKey)
        expect((await app.inject({ method: 'GET', url: `/license-keys/${oldKey}` })).statusCode).toBe(404)
        expect((await app.inject({ method: 'GET', url: `/license-keys/${newKey}` })).statusCode).toBe(200)
    })

    it('patch updates entitlements and appends an ENTITLEMENTS_CHANGED event', async () => {
        const { id, key } = await issue()
        await app.inject({ method: 'POST', url: `/manage/license-keys/${id}`, headers: MGMT, payload: { entitlements: { ...MATRIX, ssoEnabled: false } } })
        const body = (await app.inject({ method: 'GET', url: `/license-keys/${key}` })).json()
        expect(body.ssoEnabled).toBe(false)
        const detail = (await app.inject({ method: 'GET', url: `/manage/license-keys/${id}`, headers: MGMT })).json()
        expect(detail.events.some((e: { eventType: string }) => e.eventType === 'ENTITLEMENTS_CHANGED')).toBe(true)
    })
})

describe('trial queue (manual approval)', () => {
    let app: FastifyInstance
    let db: Db
    beforeEach(async () => { db = makeDb(); await runMigrations(db); app = await buildApp(db) })
    afterEach(async () => { await app.close() })

    it('request → 202 PENDING, appears in queue, approve issues a key', async () => {
        const req = await app.inject({ method: 'POST', url: '/license-keys', payload: { email: 'trial@co.com', companyName: 'Co', goal: 'evaluate' } })
        expect(req.statusCode).toBe(202)
        expect(req.json().status).toBe('PENDING')
        const queue = (await app.inject({ method: 'GET', url: '/manage/trial-requests', headers: MGMT })).json()
        expect(queue.data).toHaveLength(1)
        const trialId = queue.data[0].id
        const approve = await app.inject({ method: 'POST', url: `/manage/trial-requests/${trialId}/approve`, headers: MGMT, payload: { durationDays: 14 } })
        expect(approve.statusCode).toBe(200)
        expect(approve.json().key.startsWith('ilk_')).toBe(true)
    })

    it('duplicate active email is rejected 409 on request', async () => {
        await app.inject({ method: 'POST', url: '/manage/license-keys', headers: MGMT, payload: { email: 'dup@co.com', keyType: 'PAID', entitlements: MATRIX } })
        const req = await app.inject({ method: 'POST', url: '/license-keys', payload: { email: 'dup@co.com', companyName: 'Co', goal: 'x' } })
        expect(req.statusCode).toBe(409)
    })
})

describe('extend-trial requires the management key', () => {
    let app: FastifyInstance
    let db: Db
    beforeEach(async () => { db = makeDb(); await runMigrations(db); app = await buildApp(db) })
    afterEach(async () => { await app.close() })

    it('401 without key, 404 for unknown email, extends when present', async () => {
        expect((await app.inject({ method: 'POST', url: '/license-keys/extend-trial', payload: { email: 'x@y.com', days: 7 } })).statusCode).toBe(401)
        expect((await app.inject({ method: 'POST', url: '/license-keys/extend-trial', headers: MGMT, payload: { email: 'nobody@y.com', days: 7 } })).statusCode).toBe(404)
        await app.inject({ method: 'POST', url: '/manage/license-keys', headers: MGMT, payload: { email: 'has@y.com', keyType: 'TRIAL', entitlements: MATRIX, expiresAt: '2026-09-01T00:00:00.000Z' } })
        const ext = await app.inject({ method: 'POST', url: '/license-keys/extend-trial', headers: MGMT, payload: { email: 'has@y.com', days: 10 } })
        expect(ext.statusCode).toBe(200)
        expect(ext.json().expiresAt).toBe('2026-09-11T00:00:00.000Z')
    })
})
