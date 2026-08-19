// The account list IS the directory listing. There is no central index, so
// there is nothing that can disagree with what is actually on disk.
import fs from 'node:fs/promises'
import {
  accountsDir, accountDir, accountMetaFile, accountGwsDir, ensureDir
} from './paths.mjs'

export const SERVICES = Object.freeze(['gmail', 'drive', 'calendar'])

export function idFromEmail (email) {
  return String(email).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isEmail (value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

async function readMeta (id) {
  try {
    const raw = JSON.parse(await fs.readFile(accountMetaFile(id), 'utf8'))
    if (!raw || typeof raw.email !== 'string') return null
    return { id, verifiedAt: null, ...raw }
  } catch {
    return null
  }
}

async function writeMeta (id, meta) {
  await ensureDir(accountDir(id))
  const { id: _drop, ...body } = meta
  await fs.writeFile(accountMetaFile(id), JSON.stringify(body, null, 2) + '\n', { mode: 0o600 })
  return { id, ...body }
}

export async function get (id) { return readMeta(id) }

export async function list () {
  let entries = []
  try {
    entries = await fs.readdir(accountsDir(), { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // A half-written account must not make the whole overview throw.
    const meta = await readMeta(entry.name)
    if (meta) out.push(meta)
  }
  return out.sort((a, b) => a.email.localeCompare(b.email))
}

export async function findByEmail (email) {
  const wanted = String(email ?? '').trim().toLowerCase()
  return (await list()).find(a => a.email.toLowerCase() === wanted) || null
}

export async function create ({ email, credSet, services, accountType }) {
  const id = idFromEmail(email)
  await ensureDir(accountGwsDir(id))
  return writeMeta(id, {
    email,
    credSet,
    services: [...services],
    accountType,
    connectedAt: new Date().toISOString(),
    verifiedAt: null
  })
}

export async function markVerified (id, when = new Date()) {
  const meta = await readMeta(id)
  if (!meta) throw new Error(`unknown account: ${id}`)
  meta.verifiedAt = when.toISOString()
  return writeMeta(id, meta)
}

export async function remove (id) {
  await fs.rm(accountDir(id), { recursive: true, force: true })
}

export async function gwsDirFor (id) {
  const dir = accountGwsDir(id)
  await ensureDir(dir)
  return dir
}
