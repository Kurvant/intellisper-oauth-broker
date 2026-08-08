import { Pool } from 'pg'

/**
 * Minimal query interface shared by the production pg Pool and the in-memory test adapter.
 * The store layer depends only on this, so tests run against pg-mem with no real database.
 */
export type Db = {
    query: <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>
}

let pool: Pool | undefined

// Licensing is OPTIONAL for the broker: OAuth brokering must keep working with no database.
// isLicensingEnabled() is false when DATABASE_URL is unset, and the license routes 503 in
// that case (see index.ts) while /claim, /refresh, /providers stay fully functional.
export function isLicensingEnabled(): boolean {
    const url = process.env.DATABASE_URL
    return typeof url === 'string' && url.trim() !== ''
}

export function getDb(): Db {
    if (!isLicensingEnabled()) {
        throw new Error('DATABASE_URL is not configured — licensing is disabled')
    }
    if (pool === undefined) {
        pool = new Pool({ connectionString: process.env.DATABASE_URL })
    }
    return pool
}

export async function closeDb(): Promise<void> {
    if (pool !== undefined) {
        await pool.end()
        pool = undefined
    }
}
