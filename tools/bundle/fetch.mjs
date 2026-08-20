// Downloading and proving what was downloaded. Every byte that ends up in a
// bundle passes through verify() first - the same bar gws's own install.js
// sets for itself, and the only thing standing between a build machine and a
// tampered binary shipped to a colleague.
import { createHash } from 'node:crypto'

export function shaFromListing (text, filename) {
  for (const line of String(text).split('\n')) {
    const [sum, name] = line.trim().split(/\s+/)
    if (!sum || !name) continue
    // The listings prefix binary entries with '*'.
    if (name.replace(/^\*/, '') === filename) return sum.toLowerCase()
  }
  throw new Error(`no checksum listed for ${filename}`)
}

export function verify (data, expected, what) {
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== String(expected).toLowerCase()) {
    throw new Error(
      `checksum mismatch for ${what}\n  expected: ${expected}\n  actual:   ${actual}\n` +
      'Refusing to bundle a file that is not what it claims to be.'
    )
  }
}

export async function download (url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`download failed: ${url}\n  ${res.status} ${res.statusText ?? ''}`.trimEnd())
  }
  return Buffer.from(await res.arrayBuffer())
}

export async function downloadText (url, options) {
  return (await download(url, options)).toString('utf8')
}
