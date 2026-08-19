// A misconfigured Cloud project cuts access after exactly 7 days, silently.
// The predecessor relied on a hand-written calendar reminder to catch that.
// This encodes it instead: only a successful check AFTER the deadline is proof.
export const GRACE_DAYS = 7
export const PROOF_DAYS = 8

const DAY = 86400000

function ms (value) {
  const t = Date.parse(value ?? '')
  return Number.isNaN(t) ? null : t
}

export function isProven (meta) {
  const connected = ms(meta?.connectedAt)
  const verified = ms(meta?.verifiedAt)
  if (connected === null || verified === null) return false
  return verified - connected >= PROOF_DAYS * DAY
}

export function needsProof (meta, now = new Date()) {
  if (isProven(meta)) return false
  const connected = ms(meta?.connectedAt)
  if (connected === null) return true
  return now.getTime() - connected > GRACE_DAYS * DAY
}

export function staleAccounts (list, now = new Date()) {
  return list.filter(meta => needsProof(meta, now))
}
