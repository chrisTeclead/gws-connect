// The type only steers the explanatory text. Both types connect the same way,
// because the shared Cloud project is External.
import dns from 'node:dns/promises'

const PRIVATE_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

export function domainOf (email) {
  return String(email ?? '').trim().toLowerCase().split('@').pop() || ''
}

export async function detect (email, { resolveMx = dns.resolveMx } = {}) {
  const domain = domainOf(email)
  if (PRIVATE_DOMAINS.has(domain)) return { type: 'privat', domain }

  try {
    const records = await resolveMx(domain)
    const google = records.some(r =>
      /(^|\.)google\.com$|(^|\.)googlemail\.com$/.test(String(r.exchange).toLowerCase()))
    return { type: google ? 'workspace' : 'unklar', domain }
  } catch {
    // No DNS here, or the domain does not resolve. A soft warning beats
    // refusing to continue.
    return { type: 'unklar', domain }
  }
}
