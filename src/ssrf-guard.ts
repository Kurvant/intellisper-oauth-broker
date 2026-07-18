import net from 'net'

/**
 * SSRF guard for the caller-supplied `tokenUrl`.
 *
 * The broker POSTs a CLIENT SECRET to `tokenUrl`, so an attacker who could set it to an internal or
 * attacker-controlled address would exfiltrate the secret. This rejects anything that is not a
 * plainly public HTTPS endpoint BEFORE any request is made.
 *
 * Returns null when the URL is acceptable, or a short reason string when it is rejected.
 *
 * Note: a hostname still resolves to an IP at request time, so this is defence-in-depth, not a
 * complete DNS-rebinding cure. For that, front the broker's egress with an allowlist of provider
 * hosts (recommended in production via PROVIDER_HOST_ALLOWLIST — see README). This function blocks
 * the obvious and common cases: non-HTTPS, credentials in the URL, and literal private/loopback IPs.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal'])

export function assertPublicHttpsUrl(rawUrl: string): string | null {
    let url: URL
    try {
        url = new URL(rawUrl)
    }
    catch {
        return 'unparseable'
    }

    if (url.protocol !== 'https:') {
        return 'not-https'
    }
    if (url.username !== '' || url.password !== '') {
        return 'embedded-credentials'
    }

    // `URL` wraps IPv6 hosts in brackets (`[::1]`). Strip them so `net.isIP` recognises the address —
    // without this, EVERY IPv6 literal (loopback, link-local, unique-local) slips past the private-IP
    // check below, which is a real SSRF bypass.
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (BLOCKED_HOSTNAMES.has(host)) {
        return 'blocked-hostname'
    }

    // Optional strict allowlist. When set, ONLY these hosts (or their subdomains) are permitted —
    // the strongest control, and what a production deployment should use.
    const allowlist = parseAllowlist(process.env.PROVIDER_HOST_ALLOWLIST)
    if (allowlist.length > 0 && !allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
        return 'host-not-allowlisted'
    }

    // If the host is a literal IP, it must be a public one. (Hostnames are covered by the allowlist
    // above and by egress controls; we cannot fully resolve them here without a TOCTOU window.)
    if (net.isIP(host) !== 0 && isPrivateIp(host)) {
        return 'private-ip'
    }

    return null
}

function parseAllowlist(raw: string | undefined): string[] {
    if (raw === undefined || raw.trim() === '') {
        return []
    }
    return raw.split(',').map((h) => h.trim().toLowerCase()).filter((h) => h !== '')
}

function isPrivateIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number)
        if (a === 10) return true
        if (a === 127) return true
        if (a === 0) return true
        if (a === 169 && b === 254) return true // link-local / cloud metadata
        if (a === 172 && b >= 16 && b <= 31) return true
        if (a === 192 && b === 168) return true
        return false
    }
    // IPv6: loopback, unique-local (fc00::/7), link-local (fe80::/10), and IPv4-mapped private.
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (lower.startsWith('fe80')) return true
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice('::ffff:'.length))
    return false
}
