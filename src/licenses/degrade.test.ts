import type { FastifyInstance } from 'fastify'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { build } from '../index'

// When DATABASE_URL is unset and no db is injected, licensing must degrade to 503 while OAuth
// brokering keeps working. This pins that the license database is never a hard dependency of the
// broker's original job.

describe('licensing degrades without a database, OAuth unaffected', () => {
    let app: FastifyInstance | undefined

    beforeAll(() => {
        process.env.BROKER_API_KEY = 'oauth-secret'
        process.env.OAUTH_PROVIDERS = '[]'
        delete process.env.DATABASE_URL
        delete process.env.LICENSE_MANAGEMENT_API_KEY
    })

    afterEach(async () => { if (app) { await app.close(); app = undefined } })

    it('license routes return 503, OAuth discovery still authenticates', async () => {
        app = await build() // no injected db, no DATABASE_URL → licensing disabled
        expect((await app.inject({ method: 'POST', url: '/license-keys/verify', payload: { key: 'ilk_x' } })).statusCode).toBe(503)
        expect((await app.inject({ method: 'GET', url: '/manage/license-keys' })).statusCode).toBe(503)

        // OAuth scope still enforces its own key and functions.
        expect((await app.inject({ method: 'GET', url: '/providers' })).statusCode).toBe(401)
        const providers = await app.inject({ method: 'GET', url: '/providers', headers: { authorization: 'Bearer oauth-secret' } })
        expect(providers.statusCode).toBe(200)

        // Health advertises licensing off.
        const health = await app.inject({ method: 'GET', url: '/health' })
        expect(health.json().licensing).toBe(false)
    })
})
