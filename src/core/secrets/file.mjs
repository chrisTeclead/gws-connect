// TEST-ONLY backend. Stores secrets as PLAINTEXT JSON under the state root.
//
// It exists because the per-account wrapper runs in a separate process, and a
// process-local in-memory double cannot be observed across that boundary - so
// without this there would be no way to test the wrapper path without touching
// the real Keychain or DPAPI store.
//
// It is never selected automatically. Only an explicit GWS_CONNECT_SECRETS=file
// reaches it, and `doctor` prints the active backend name so an accidental
// production use is visible.
import fs from 'node:fs/promises'
import path from 'node:path'
import { homeDir, ensureDir } from '../paths.mjs'

function storeFile () { return path.join(homeDir(), 'secrets-plaintext-test.json') }

async function readAll () {
  try {
    return JSON.parse(await fs.readFile(storeFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function writeAll (data) {
  await ensureDir(homeDir())
  await fs.writeFile(storeFile(), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
}

export default {
  name: 'file-plaintext-test',
  async get (setId, field) {
    const all = await readAll()
    const value = all?.[setId]?.[field]
    return typeof value === 'string' ? value : null
  },
  async set (setId, field, value) {
    const all = await readAll()
    all[setId] = { ...(all[setId] || {}), [field]: value }
    await writeAll(all)
  },
  async has (setId, field) { return (await this.get(setId, field)) !== null },
  async removeSet (setId) {
    const all = await readAll()
    if (!(setId in all)) return
    delete all[setId]
    await writeAll(all)
  },
  async selfTest () {
    await this.set('__selftest__', 'client_id', 'probe')
    const back = await this.get('__selftest__', 'client_id')
    await this.removeSet('__selftest__')
    return back === 'probe'
  }
}
