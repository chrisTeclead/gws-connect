// Turning a verified pile of bytes into the exact list of entries a bundle
// contains. Pure with respect to the network - it reads the repository and
// takes the two binaries as arguments, so what a bundle holds can be asserted
// without downloading 40 MB first.
import fs from 'node:fs/promises'
import path from 'node:path'
import { starter, starterName, claudeMd, readmeTxt, EXCLUDE } from './files.mjs'

// Nothing here belongs in a bundle, and a stray one would be noticed only by
// whoever finds it on the recipient's disk.
const SKIP = new Set(['node_modules', '.git', '.DS_Store', 'secrets.dat'])

export function bundleName (platform) {
  return `gws-connect-${platform}`
}

async function walk (root, relative, out) {
  const posix = relative.split(path.sep).join('/')
  if (EXCLUDE.includes(posix)) return

  const full = path.join(root, relative)
  const stat = await fs.stat(full)

  if (stat.isFile()) {
    out.push({ name: relative.split(path.sep).join('/'), data: await fs.readFile(full), mode: 0o644 })
    return
  }
  for (const entry of (await fs.readdir(full)).sort()) {
    if (SKIP.has(entry) || entry.endsWith('.setupcode')) continue
    await walk(root, path.join(relative, entry), out)
  }
}

export async function collectPayload (root, items) {
  const out = []
  for (const item of items) {
    try {
      await fs.stat(path.join(root, item))
    } catch {
      throw new Error(`payload item missing from the repository: ${item}`)
    }
    await walk(root, item, out)
  }
  return out
}

export function bundleEntries ({ target, nodeBin, gwsBin, payload }) {
  const root = bundleName(target.platform)
  const exec = target.mode
  const at = (name, data, mode = 0o644) => ({ name: `${root}/${name}`, data, mode })

  return [
    at(starterName(target.platform), Buffer.from(starter(target.platform)), exec),
    at('CLAUDE.md', Buffer.from(claudeMd(target.platform))),
    at('LIESMICH.txt', Buffer.from(readmeTxt(target.platform))),
    at(target.node.dest, nodeBin, exec),
    at(target.gws.dest, gwsBin, exec),
    ...payload.map(e => at(e.name, e.data, e.mode))
  ]
}
