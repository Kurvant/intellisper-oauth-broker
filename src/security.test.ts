import { describe, expect, it } from 'vitest'
import { buildSecretStore } from './secret-store'
import { assertPublicHttpsUrl } from './ssrf-guard'

/**
 * The broker holds provider client secrets and POSTs them to a caller-supplied URL, so its two
 * highest-risk behaviours are: (1) it must not send a secret to a non-public / attacker-chosen
 * address, and (2) it must never hand back the wrong provider's secret. Both are pinned here.
 */

describe('SSRF guard — never POST a client secret to a non-public address', () => {
    it('accepts a normal public HTTPS provider URL', () => {
        expect(assertPublicHttpsUrl('https://slack.com/api/oauth.v2.access')).toBeNull()
    })

    it('rejects non-HTTPS', () => {
        expect(assertPublicHttpsUrl('http://slack.com/token')).toBe('not-https')
    })

    it('rejects embedded credentials', () => {
        expect(assertPublicHttpsUrl('https://user:pass@slack.com/token')).toBe('embedded-credentials')
    })

    it('rejects localhost and loopback', () => {
        expect(assertPublicHttpsUrl('https://localhost/token')).toBe('blocked-hostname')
        expect(assertPublicHttpsUrl('https://127.0.0.1/token')).toBe('private-ip')
        expect(assertPublicHttpsUrl('https://[::1]/token')).toBe('private-ip')
    })

    it('rejects private ranges and the cloud metadata IP', () => {
        expect(assertPublicHttpsUrl('https://10.0.0.5/token')).toBe('private-ip')
        expect(assertPublicHttpsUrl('https://192.168.1.1/token')).toBe('private-ip')
        expect(assertPublicHttpsUrl('https://172.16.0.1/token')).toBe('private-ip')
        expect(assertPublicHttpsUrl('https://169.254.169.254/latest/meta-data')).toBe('private-ip')
    })

    it('when an allowlist is set, only allowlisted hosts pass', () => {
        process.env.PROVIDER_HOST_ALLOWLIST = 'slack.com,oauth2.googleapis.com'
        expect(assertPublicHttpsUrl('https://slack.com/token')).toBeNull()
        expect(assertPublicHttpsUrl('https://api.slack.com/token')).toBeNull() // subdomain ok
        expect(assertPublicHttpsUrl('https://evil.com/token')).toBe('host-not-allowlisted')
        delete process.env.PROVIDER_HOST_ALLOWLIST
    })
})

describe('secret store — a caller can only ever get the secret for its exact provider', () => {
    const store = buildSecretStore(JSON.stringify([
        { blockName: '@intelblocks/block-slack', clientId: 'slack-1', clientSecret: 'slack-secret' },
        { blockName: '@intelblocks/block-google', clientId: 'google-1', clientSecret: 'google-secret' },
    ]))

    it('returns the right secret for an exact (blockName, clientId) match', () => {
        expect(store.lookup({ blockName: '@intelblocks/block-slack', clientId: 'slack-1' })).toBe('slack-secret')
    })

    it('does NOT return provider A\'s secret when clientId belongs to B', () => {
        expect(store.lookup({ blockName: '@intelblocks/block-slack', clientId: 'google-1' })).toBeNull()
    })

    it('returns null for an unregistered provider (never a fallback secret)', () => {
        expect(store.lookup({ blockName: '@intelblocks/block-unknown', clientId: 'x' })).toBeNull()
    })

    it('refuses to start with no providers configured', () => {
        expect(() => buildSecretStore(undefined)).toThrow()
        expect(() => buildSecretStore('')).toThrow()
        expect(() => buildSecretStore('not json')).toThrow()
    })
})
