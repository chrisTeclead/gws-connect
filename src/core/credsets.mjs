// A credential set is one Cloud project's OAuth client. Metadata is a plain
// file; the client_id and client_secret live in the platform secret store.
// Splitting them is the point: the metadata file is safe to read, copy and
// attach to a support ticket, the secrets never leave the store.
import fs from 'node:fs/promises'
import path from 'node:path'
import { credentialsDir, credSetFile, ensureDir } from './paths.mjs'
import { backend } from './secrets/index.mjs'
import { decode } from './setupcode.mjs'

async function writeMeta (meta) {
  await ensureDir(credentialsDir())
  await fs.writeFile(credSetFile(meta.id), JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 })
  return meta
}

export async function get (id) {
  try {
    return JSON.parse(await fs.readFile(credSetFile(id), 'utf8'))
  } catch {
    return null
  }
}

export async function exists (id) {
  return (await get(id)) !== null
}

export async function list () {
  let names = []
  try {
    names = await fs.readdir(credentialsDir())
  } catch {
    return []
  }
  const sets = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const set = await get(path.basename(name, '.json'))
    if (set) sets.push(set)
  }
  return sets.sort((a, b) => {
    if (a.id === 'default') return -1
    if (b.id === 'default') return 1
    return String(a.label).localeCompare(String(b.label))
  })
}

async function store (id, clientId, clientSecret) {
  const b = await backend()
  await b.set(id, 'client_id', clientId)
  await b.set(id, 'client_secret', clientSecret)
}

export async function importCode (code) {
  const payload = decode(code)
  await store(payload.id, payload.client_id, payload.client_secret)
  return writeMeta({
    id: payload.id,
    label: payload.label,
    audience: payload.audience,
    source: 'setup-code',
    createdAt: new Date().toISOString()
  })
}

export async function saveManual ({ id, label, audience, client_id: clientId, client_secret: clientSecret }) {
  await store(id, clientId, clientSecret)
  return writeMeta({
    id,
    label,
    audience,
    source: 'manual',
    createdAt: new Date().toISOString()
  })
}

export async function credentials (id) {
  const b = await backend()
  const clientId = await b.get(id, 'client_id')
  const clientSecret = await b.get(id, 'client_secret')
  if (!clientId || !clientSecret) {
    throw new Error(`credential set "${id}" is incomplete`)
  }
  return { client_id: clientId, client_secret: clientSecret }
}

export async function remove (id) {
  await (await backend()).removeSet(id)
  await fs.rm(credSetFile(id), { force: true })
}
