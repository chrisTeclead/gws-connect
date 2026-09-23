// The one file the installers trust. Same layout as `shasum -a 256`, so the
// macOS installer can read it with awk and a human can check it by hand.
import { createHash } from 'node:crypto'

export function sha256Listing (files) {
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => `${createHash('sha256').update(f.data).digest('hex')}  ${f.name}\n`)
    .join('')
}
