import { z } from 'zod'

/**
 * Entitlement wire contract. This MUST stay byte-compatible with the blockunits
 * `LicenseKeyEntity` (packages/shared/src/lib/core/license-keys): the product instance parses
 * `GET /license-keys/{key}` as `response.data as LicenseKeyEntity`, so the entity fields are at
 * the TOP LEVEL and `signature` is an ADDITIONAL SIBLING property — never a nested wrapper.
 *
 * 19 required booleans + chatEnabled + dataManipulationEnabled (optional). aiProvidersEnabled
 * defaults TRUE when absent from a stored matrix (matches the client's readFlag default).
 */

export const EntitlementMatrix = z.object({
    ssoEnabled: z.boolean(),
    scimEnabled: z.boolean(),
    environmentsEnabled: z.boolean(),
    showPoweredBy: z.boolean(),
    embeddingEnabled: z.boolean(),
    auditLogEnabled: z.boolean(),
    customAppearanceEnabled: z.boolean(),
    manageProjectsEnabled: z.boolean(),
    manageBlocksEnabled: z.boolean(),
    manageTemplatesEnabled: z.boolean(),
    apiKeysEnabled: z.boolean(),
    projectRolesEnabled: z.boolean(),
    analyticsEnabled: z.boolean(),
    globalConnectionsEnabled: z.boolean(),
    customRolesEnabled: z.boolean(),
    eventStreamingEnabled: z.boolean(),
    secretManagersEnabled: z.boolean(),
    agentsEnabled: z.boolean(),
    aiProvidersEnabled: z.boolean(),
    chatEnabled: z.boolean().optional(),
    dataManipulationEnabled: z.boolean().optional(),
})
export type EntitlementMatrix = z.infer<typeof EntitlementMatrix>

export const NumericLimits = z.object({
    userSeats: z.number().int().nonnegative().nullable().optional(),
    activeFlowsLimit: z.number().int().nonnegative().nullable().optional(),
    projectsLimit: z.number().int().nonnegative().nullable().optional(),
    dailyRunsSoftCap: z.number().int().nonnegative().nullable().optional(),
})
export type NumericLimits = z.infer<typeof NumericLimits>

// Normalize a stored matrix into a complete entitlement object with the aiProvidersEnabled
// default applied, so what we sign is exactly what the client would resolve.
function normalizeEntitlements(stored: Record<string, unknown>): EntitlementMatrix {
    const withDefault = { aiProvidersEnabled: true, ...stored }
    return EntitlementMatrix.parse(withDefault)
}

export type LicenseRow = {
    id: string
    key_prefix: string
    status: string
    key_type: string
    email: string
    company_name: string | null
    goal: string | null
    issued_at: Date | string
    first_activated_at: Date | string | null
    expires_at: Date | string | null
    grace_days: number
    entitlements: Record<string, unknown>
    numeric_limits: Record<string, unknown> | null
    notes: string | null
    created_by: string | null
    created: Date | string
    updated: Date | string
}

function toIso(value: Date | string | null): string | null {
    if (value === null) {
        return null
    }
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// The `LicenseKeyEntity`-shaped body returned by GET /license-keys/{key}. Dates are strings;
// `key` (the raw key) is echoed back (the broker has it from the path). numericLimits/graceDays
// are additive siblings the legacy client ignores but the hardened client consumes.
function toEntity(row: LicenseRow, rawKey: string): Record<string, unknown> {
    const entitlements = normalizeEntitlements(row.entitlements)
    return {
        id: row.id,
        email: row.email,
        key: rawKey,
        createdAt: toIso(row.created) ?? '',
        activatedAt: toIso(row.first_activated_at) ?? '',
        expiresAt: toIso(row.expires_at) ?? '',
        ...entitlements,
        // Additive (spec §1.4) — safe siblings that never break the legacy zod parse.
        numericLimits: row.numeric_limits ?? null,
        graceDays: row.grace_days,
    }
}

export const entitlements = {
    EntitlementMatrix,
    NumericLimits,
    normalizeEntitlements,
    toEntity,
    toIso,
}
