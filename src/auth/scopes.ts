import { createHash, timingSafeEqual } from 'crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

// The broker now serves three credential scopes, each with its own secret. Previously a single
// global hook gated everything with BROKER_API_KEY; that is refactored into per-scope guards so
// public license routes (the product instance calls them with only the license key) are exempt,
// and license management uses a DIFFERENT secret than OAuth brokering — the platform's OAuth
// credential must never be able to mint or revoke licenses.

function sha256(input: string): Buffer {
    return createHash('sha256').update(input).digest()
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
    return a.length === b.length && timingSafeEqual(a, b)
}

// Bearer-token guard used by the OAuth scope (Authorization: Bearer <BROKER_API_KEY>).
function makeBearerGuard(expectedKeyHash: Buffer) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> => {
        const presented = (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
        if (presented === '' || !constantTimeEqual(sha256(presented), expectedKeyHash)) {
            // MUST return the reply so Fastify halts the lifecycle here. Without returning (or
            // throwing) the request continues to the route handler, which sends a second response
            // and crashes with ERR_HTTP_HEADERS_SENT.
            return reply.code(401).send({ error: 'unauthorized' })
        }
    }
}

// Header-key guard used by the management scope (api-key: <LICENSE_MANAGEMENT_API_KEY>) and by
// route 4 (extend-trial), which the spec gates with the management secret.
function makeManagementGuard(expectedKeyHash: Buffer) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> => {
        const presented = (request.headers['api-key'] as string | undefined) ?? ''
        if (presented === '' || !constantTimeEqual(sha256(presented), expectedKeyHash)) {
            // Return the reply to halt the lifecycle (see makeBearerGuard) — otherwise the route
            // handler runs and double-sends, causing ERR_HTTP_HEADERS_SENT.
            return reply.code(401).send({ error: 'unauthorized' })
        }
    }
}

export const brokerAuth = {
    sha256,
    makeBearerGuard,
    makeManagementGuard,
}
