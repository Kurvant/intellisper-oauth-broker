import { createHash, randomInt } from 'crypto'

// License key format (spec §1.2 / §2.3): `ilk_` + 43 base62 chars from a CSPRNG (≥256 bits
// of entropy: 62^43 ≈ 2^256). Only the sha256 hash is ever stored; the raw key is the bearer
// credential, returned exactly once at issue/rotate.

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const RAW_LENGTH = 43
const PREFIX = 'ilk_'
const DISPLAY_PREFIX_LENGTH = 12

function randomBase62(length: number): string {
    let out = ''
    for (let i = 0; i < length; i++) {
        // crypto.randomInt is a CSPRNG with rejection sampling → no modulo bias.
        out += BASE62[randomInt(0, BASE62.length)]
    }
    return out
}

function generateRawKey(): string {
    return PREFIX + randomBase62(RAW_LENGTH)
}

function hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex')
}

function keyPrefix(rawKey: string): string {
    return rawKey.slice(0, DISPLAY_PREFIX_LENGTH)
}

export const licenseKeys = {
    generateRawKey,
    hashKey,
    keyPrefix,
    PREFIX,
    RAW_LENGTH,
}
