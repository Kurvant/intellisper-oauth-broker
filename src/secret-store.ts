import { z } from 'zod'

/**
 * The broker's secret store.
 *
 * It maps an OAuth provider (identified by the block name and the public client id the platform
 * sends) to that provider's CLIENT SECRET. The client secret is the sensitive value — it never
 * leaves this service, is never returned to the platform, and is never logged.
 *
 * Secrets are supplied via ONE environment variable, `OAUTH_PROVIDERS`, holding JSON:
 *
 *   [
 *     { "blockName": "@intelblocks/block-slack", "clientId": "123.abc", "clientSecret": "s3cr3t" },
 *     { "blockName": "@intelblocks/block-google-sheets", "clientId": "xyz.apps...", "clientSecret": "..." }
 *   ]
 *
 * In production this JSON comes from a secret manager (AWS Secrets Manager / Railway secret), never
 * from a file in the image. Keeping it in env keeps the service stateless — no database, nothing at
 * rest on disk — which is the smallest possible attack surface for a credential-holding service.
 *
 * Lookup requires BOTH blockName AND clientId to match. That means a caller cannot coax the broker
 * into using provider A's secret with provider B's flow: it can only ever obtain the secret that
 * belongs to the exact (blockName, clientId) pair the operator registered.
 */

const providerSchema = z.object({
    blockName: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
})

export type OAuthProvider = z.infer<typeof providerSchema>

const providersSchema = z.array(providerSchema)

export type SecretStore = {
    /** Return the client secret for an exact (blockName, clientId) pair, or null if not registered. */
    lookup: (params: { blockName: string, clientId: string }) => string | null
    /**
     * The PUBLIC identity of every registered provider — (blockName, clientId) only, NEVER the
     * secret. This is what the platform uses to discover which blocks are broker-managed so it can
     * show a one-click Connect button instead of asking the user for their own credentials. The
     * clientId is a public value (it is sent to the provider's authorize URL in the browser), so
     * exposing it to the authenticated platform is safe; the clientSecret is deliberately absent.
     */
    list: () => { blockName: string, clientId: string }[]
    /** Count of registered providers — for a safe startup log (never logs the secrets themselves). */
    size: number
}

export function buildSecretStore(rawEnv: string | undefined): SecretStore {
    if (rawEnv === undefined || rawEnv.trim() === '') {
        throw new Error('OAUTH_PROVIDERS is not set — the broker cannot start without at least one registered provider.')
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(rawEnv)
    }
    catch {
        throw new Error('OAUTH_PROVIDERS is not valid JSON.')
    }

    const providers = providersSchema.parse(parsed)

    // Index by a composite key so lookup is O(1) and cannot cross providers.
    const byKey = new Map<string, string>()
    // Keep the public (blockName, clientId) pairs for discovery — never the secret.
    const publicPairs: { blockName: string, clientId: string }[] = []
    for (const provider of providers) {
        byKey.set(compositeKey(provider.blockName, provider.clientId), provider.clientSecret)
        publicPairs.push({ blockName: provider.blockName, clientId: provider.clientId })
    }

    return {
        lookup: ({ blockName, clientId }) => byKey.get(compositeKey(blockName, clientId)) ?? null,
        list: () => publicPairs.map((pair) => ({ ...pair })),
        size: byKey.size,
    }
}

function compositeKey(blockName: string, clientId: string): string {
    return `${blockName}::${clientId}`
}
