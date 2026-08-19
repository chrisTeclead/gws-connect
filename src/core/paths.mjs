// Every path the tool touches at runtime. Nothing here points into the repo.
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

export function homeDir () {
  return process.env.GWS_CONNECT_HOME || path.join(os.homedir(), '.gws-connect')
}

export function platform () {
  return process.env.GWS_CONNECT_PLATFORM || process.platform
}

export function accountsDir () { return path.join(homeDir(), 'accounts') }
export function accountDir (id) { return path.join(accountsDir(), id) }
export function accountMetaFile (id) { return path.join(accountDir(id), 'meta.json') }
export function accountGwsDir (id) { return path.join(accountDir(id), 'gws') }
export function credentialsDir () { return path.join(homeDir(), 'credentials') }
export function credSetFile (id) { return path.join(credentialsDir(), `${id}.json`) }
export function binDir () { return path.join(homeDir(), 'bin') }
export function configFile () { return path.join(homeDir(), 'config.json') }
export function secretsFile () { return path.join(homeDir(), 'secrets.dat') }

// mode 0o700 matters on POSIX; Windows ignores it and relies on profile ACLs.
export async function ensureDir (p) {
  await fs.mkdir(p, { recursive: true, mode: 0o700 })
}
