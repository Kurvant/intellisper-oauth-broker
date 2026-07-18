# Intellisper OAuth Broker

A tiny, stateless service that holds OAuth2 **provider client secrets** and performs the
code/refresh token exchange on behalf of the Intellisper platform (cloud today, self-hosted
instances later). The client secrets live only here — never in the main app, never in any customer's
database.

## Why it exists
"Cloud OAuth2" connections let a user click "Connect Slack" without you registering a provider app
inside the product. That convenience requires the provider **client secret** to be held centrally.
Isolating those secrets in this one small service is the whole point: if the main app is
compromised, the provider secrets are not in it. Every self-hosted Intellisper instance can point at
the same broker.

Previously this role was played by `secrets.activepieces.com`. This service replaces it so nothing
routes through third-party infrastructure.

## How the platform talks to it (this is "how do we write to it")
The platform is the ONLY caller. It authenticates with a shared secret and POSTs JSON — you do not
call this service by hand in normal operation. Two endpoints:

**`POST /claim`** — exchange an authorization code for tokens.
```
Authorization: Bearer <BROKER_API_KEY>
Content-Type: application/json

{ "blockName": "@intelblocks/block-slack", "clientId": "123.abc",
  "tokenUrl": "https://slack.com/api/oauth.v2.access",
  "code": "...", "codeVerifier": "...", "authorizationMethod": "BODY", "edition": "CLOUD" }
```

**`POST /refresh`** — exchange a refresh token for a fresh access token.
```
Authorization: Bearer <BROKER_API_KEY>
Content-Type: application/json

{ "blockName": "@intelblocks/block-slack", "clientId": "123.abc",
  "tokenUrl": "https://slack.com/api/oauth.v2.access",
  "refreshToken": "...", "authorizationMethod": "BODY", "edition": "CLOUD" }
```

Both return the normalised token value (`access_token`, `refresh_token`, `expires_in`, `scope`,
`token_type`, `claimed_at`, `client_id`). The **client secret is never in the request or the
response** — the broker looks it up internally from `(blockName, clientId)`.

`GET /health` → `{ "status": "ok", "providers": <n> }` (no auth; safe for load-balancer checks).

### From the platform code
The main app already calls this automatically (see
`cloud-oauth2-service.ts`). It just needs two env vars set on the PLATFORM:
- `IB_CLOUD_OAUTH_URL` → the broker's base URL (e.g. `https://oauth.yourdomain.com`).
- `IB_CLOUD_OAUTH_API_KEY` → the same value as the broker's `BROKER_API_KEY`.

To register a NEW provider, you do NOT call the broker — you add an entry to its `OAUTH_PROVIDERS`
secret (below) and redeploy the broker. That is the only "write" an operator performs.

## Configuration
See `.env.example`. The important ones:
- **`BROKER_API_KEY`** — shared secret the platform presents. `openssl rand -hex 32`.
- **`OAUTH_PROVIDERS`** — JSON array of `{ blockName, clientId, clientSecret }`. Store it in a
  secret manager (Railway secret / AWS Secrets Manager), never in the image.
- **`PROVIDER_HOST_ALLOWLIST`** — comma-separated provider token hosts. **Set this in production.**
  It is the strong SSRF control: the broker will only ever send a client secret to these hosts.

## Security controls (built in)
- Bearer-token auth on every endpoint, compared in **constant time**.
- **Rate limiting** on the token endpoints.
- **SSRF guard** on the caller-supplied `tokenUrl` (HTTPS-only, no embedded creds, no private/loopback
  IPs; plus the optional host allowlist).
- **No secret disclosure**: client secrets are never returned or logged; logger redaction covers
  token/secret fields; errors to the caller are generic.
- **Stateless**: no database, no disk. Secrets exist only in memory, from the environment.
- Runs as a **non-root** user in the container.

## Run it

**Locally**
```
cp .env.example .env   # fill in real values
npm install
npm run dev
```

**Deploy (Railway — recommended for this service)**
1. New Railway service from this directory (it has a `Dockerfile`).
2. Set `BROKER_API_KEY`, `OAUTH_PROVIDERS`, `PROVIDER_HOST_ALLOWLIST` as Railway variables/secrets.
3. Note the public URL Railway assigns.
4. On the PLATFORM, set `IB_CLOUD_OAUTH_URL` to that URL and `IB_CLOUD_OAUTH_API_KEY` to the same
   `BROKER_API_KEY`.

**Deploy (AWS)** — same image as a small Fargate task behind your ALB, or any container host. It is
tiny and has no dependencies beyond outbound HTTPS to the providers.
