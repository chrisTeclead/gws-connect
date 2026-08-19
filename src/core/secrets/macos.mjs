// macOS Keychain via security(1). One entry per (set, field).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PREFIX = 'gws-connect'
const service = (setId, field) => `${PREFIX}:${setId}:${field}`
const FIELDS = ['client_id', 'client_secret']

export default {
  name: 'macos',
  async get (setId, field) {
    try {
      const { stdout } = await run('security',
        ['find-generic-password', '-a', setId, '-s', service(setId, field), '-w'])
      const value = stdout.replace(/\n$/, '')
      return value === '' ? null : value
    } catch {
      return null
    }
  },
  async set (setId, field, value) {
    await run('security', [
      'add-generic-password',
      '-a', setId,
      '-s', service(setId, field),
      '-w', value,
      '-T', '/usr/bin/security',
      '-U'
    ])
  },
  async has (setId, field) { return (await this.get(setId, field)) !== null },
  async removeSet (setId) {
    for (const field of FIELDS) {
      try {
        await run('security', ['delete-generic-password', '-s', service(setId, field)])
      } catch { /* absent is fine */ }
    }
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
