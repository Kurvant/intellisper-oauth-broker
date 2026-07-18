import axios from 'axios'

/**
 * The OAuth2 token exchange itself — a standard authorization-code and refresh-token grant against
 * the provider's own token endpoint.
 *
 * `authorizationMethod` decides where the client credentials go, matching the platform's block
 * framework:
 *   - HEADER → HTTP Basic auth (`Authorization: Basic base64(clientId:clientSecret)`).
 *   - BODY   → `client_id` + `client_secret` in the form body.
 *
 * The response is normalised to the shape the platform's connection value expects. `claimed_at` is
 * stamped so the platform can compute expiry; the client secret is NEVER echoed back.
 */

const EXCHANGE_TIMEOUT_MS = 20_000

export type TokenValue = {
    access_token: string
    refresh_token: string
    token_type: string
    scope: string
    expires_in?: number
    claimed_at: number
    client_id: string
    data: Record<string, unknown>
}

type ExchangeParams = {
    tokenUrl: string
    clientId: string
    clientSecret: string
    authorizationMethod: 'HEADER' | 'BODY' | undefined
    /** The grant-specific fields (code+codeVerifier for claim, refresh_token for refresh). */
    grantFields: Record<string, string>
}

async function exchange({ tokenUrl, clientId, clientSecret, authorizationMethod, grantFields }: ExchangeParams): Promise<TokenValue> {
    const body: Record<string, string> = { ...grantFields }
    const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
    }

    if (authorizationMethod === 'HEADER') {
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        headers.authorization = `Basic ${basic}`
    }
    else {
        // Default to BODY when unspecified — the more widely supported of the two.
        body.client_id = clientId
        body.client_secret = clientSecret
    }

    const response = await axios.post(tokenUrl, new URLSearchParams(body).toString(), {
        headers,
        timeout: EXCHANGE_TIMEOUT_MS,
    })

    return normalizeToken(response.data, clientId)
}

export async function claimCode(params: {
    tokenUrl: string
    clientId: string
    clientSecret: string
    authorizationMethod: 'HEADER' | 'BODY' | undefined
    code: string
    codeVerifier: string | undefined
    redirectUrl: string | undefined
}): Promise<TokenValue> {
    const grantFields: Record<string, string> = {
        grant_type: 'authorization_code',
        code: params.code,
    }
    if (params.codeVerifier !== undefined) {
        grantFields.code_verifier = params.codeVerifier
    }
    if (params.redirectUrl !== undefined) {
        grantFields.redirect_uri = params.redirectUrl
    }
    return exchange({ ...params, grantFields })
}

export async function refreshToken(params: {
    tokenUrl: string
    clientId: string
    clientSecret: string
    authorizationMethod: 'HEADER' | 'BODY' | undefined
    refreshToken: string
}): Promise<TokenValue> {
    return exchange({
        ...params,
        grantFields: {
            grant_type: 'refresh_token',
            refresh_token: params.refreshToken,
        },
    })
}

function normalizeToken(raw: unknown, clientId: string): TokenValue {
    const data = (raw ?? {}) as Record<string, unknown>
    const accessToken = typeof data.access_token === 'string' ? data.access_token : ''
    if (accessToken === '') {
        throw new Error('Provider did not return an access_token')
    }
    return {
        access_token: accessToken,
        // Some providers omit refresh_token on refresh; keep the caller's existing one by returning ''.
        refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : '',
        token_type: typeof data.token_type === 'string' ? data.token_type : 'bearer',
        scope: typeof data.scope === 'string' ? data.scope : '',
        ...(typeof data.expires_in === 'number' ? { expires_in: data.expires_in } : {}),
        claimed_at: Math.floor(Date.now() / 1000),
        client_id: clientId,
        data,
    }
}
