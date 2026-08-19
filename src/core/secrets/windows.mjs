// Windows: one DPAPI-encrypted JSON blob, scoped to the current user.
// Batch and cmd are the wrong place for cryptography, so all of it happens
// here and the generated wrappers never touch a secret (see wrappers.mjs).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import { secretsFile, homeDir, ensureDir } from '../paths.mjs'

const run = promisify(execFile)

const PROTECT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String($env:GWSC_IN)
$out = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
[Convert]::ToBase64String($out)
`

const UNPROTECT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String($env:GWSC_IN)
$out = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
[Convert]::ToBase64String($out)
`

async function powershell (script, inputB64) {
  const { stdout } = await run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { env: { ...process.env, GWSC_IN: inputB64 }, maxBuffer: 8 * 1024 * 1024 }
  )
  return stdout.trim()
}

async function readAll () {
  let cipher
  try {
    cipher = (await fs.readFile(secretsFile(), 'utf8')).trim()
  } catch {
    return {}
  }
  if (!cipher) return {}
  const plainB64 = await powershell(UNPROTECT, cipher)
  return JSON.parse(Buffer.from(plainB64, 'base64').toString('utf8'))
}

async function writeAll (data) {
  await ensureDir(homeDir())
  const plainB64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
  const cipher = await powershell(PROTECT, plainB64)
  await fs.writeFile(secretsFile(), cipher + '\n', { mode: 0o600 })
}

export default {
  name: 'windows',
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
    try {
      await this.set('__selftest__', 'client_id', 'probe')
      const back = await this.get('__selftest__', 'client_id')
      await this.removeSet('__selftest__')
      return back === 'probe'
    } catch {
      return false
    }
  }
}
