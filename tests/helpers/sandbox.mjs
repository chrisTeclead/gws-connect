// A temp HOME, a fake gws, an in-memory secrets backend. No real account,
// no sign-in, no network.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const FAKE = fileURLToPath(new URL('./fake-gws.mjs', import.meta.url))

// `secrets: 'file'` uses the disk-backed test double, which is what a child
// process (the per-account wrapper) can also see. Default stays in-memory.
export async function sandbox (state = {}, { secrets = 'memory' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-box-'))
  const statePath = path.join(dir, 'fake-state.json')
  const logPath = path.join(dir, 'fake-log.jsonl')
  await fs.writeFile(statePath, JSON.stringify(state))
  await fs.writeFile(logPath, '')

  process.env.GWS_CONNECT_HOME = path.join(dir, 'home')
  process.env.GWS_CONNECT_SECRETS = secrets
  process.env.GWS_CONNECT_GWS_BIN = FAKE
  process.env.GWS_CONNECT_NO_COLOR = '1'
  process.env.GWSC_FAKE_STATE = statePath
  process.env.GWSC_FAKE_LOG = logPath

  return {
    dir,
    async setState (next) { await fs.writeFile(statePath, JSON.stringify(next)) },
    async calls () {
      const raw = await fs.readFile(logPath, 'utf8')
      return raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
    },
    async cleanup () { await fs.rm(dir, { recursive: true, force: true }) }
  }
}

export async function seedCredSet (id = 'default', label = 'Terra One') {
  const credsets = await import(`../../src/core/credsets.mjs?${Math.random()}`)
  return credsets.saveManual({
    id,
    label,
    audience: 'external',
    client_id: '123-abc.apps.googleusercontent.com',
    client_secret: 'test-secret-value'
  })
}
