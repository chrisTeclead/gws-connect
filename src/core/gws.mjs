// Every gws invocation in the codebase goes through here. That is what makes
// the fake in tests possible, and it is the only place that knows how a
// credential set becomes environment variables.
import { spawn } from 'node:child_process'
import { gwsDirFor } from './accounts.mjs'
import { credentials } from './credsets.mjs'
import { platform } from './paths.mjs'

export const IDENTITY_ORDER = Object.freeze(['gmail', 'calendar', 'drive'])

export const PROBES = Object.freeze({
  gmail: { args: ['gmail', 'users', 'getProfile', '--params', '{"userId":"me"}'] },
  drive: { args: ['drive', 'files', 'list', '--params', '{"pageSize":1}'] },
  calendar: { args: ['calendar', 'calendarList', 'list', '--params', '{"maxResults":1}'] }
})

const IDENTITY_CALLS = Object.freeze({
  gmail: {
    args: ['gmail', 'users', 'getProfile', '--params', '{"userId":"me"}'],
    pick: (json) => json?.emailAddress
  },
  calendar: {
    args: ['calendar', 'calendarList', 'list', '--params', '{"maxResults":250}'],
    pick: (json) => (json?.items || []).find(i => i.primary)?.id
  },
  drive: {
    args: ['drive', 'about', 'get', '--params', '{"fields":"user/emailAddress"}'],
    pick: (json) => json?.user?.emailAddress
  }
})

export function gwsBin () {
  return process.env.GWS_CONNECT_GWS_BIN || 'gws'
}

// A .mjs stand-in is run through this Node, so the tests exercise the real
// spawn path without needing a shebang that also works on Windows.
function launch (args, options) {
  const bin = gwsBin()
  if (bin.endsWith('.mjs') || bin.endsWith('.js')) {
    return spawn(process.execPath, [bin, ...args], options)
  }
  return spawn(bin, args, { ...options, shell: platform() === 'win32' })
}

async function envFor (id, credSet) {
  const { client_id: clientId, client_secret: clientSecret } = await credentials(credSet)
  return {
    ...process.env,
    GOOGLE_WORKSPACE_CLI_CONFIG_DIR: await gwsDirFor(id),
    GOOGLE_WORKSPACE_CLI_CLIENT_ID: clientId,
    GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: clientSecret
  }
}

export async function run (id, credSet, args, { inherit = false } = {}) {
  const child = launch(args, {
    env: await envFor(id, credSet),
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  if (!inherit) {
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
  }
  const code = await new Promise((resolve) => {
    child.on('error', () => resolve(-1))
    child.on('close', c => resolve(c ?? -1))
  })
  return { code, stdout, stderr }
}

export async function installed () {
  try {
    const child = launch(['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', d => { out += d })
    const code = await new Promise((resolve) => {
      child.on('error', () => resolve(-1))
      child.on('close', c => resolve(c ?? -1))
    })
    return { ok: code === 0, version: code === 0 ? out.trim() : null }
  } catch {
    return { ok: false, version: null }
  }
}

export async function login (id, credSet, services) {
  const { code } = await run(
    id, credSet,
    ['auth', 'login', '--readonly', '--services', services.join(',')],
    { inherit: true }
  )
  return code === 0
}

export async function logout (id, credSet) {
  const { code } = await run(id, credSet, ['auth', 'logout'])
  return code === 0
}

export async function probe (id, credSet, service) {
  const spec = PROBES[service]
  if (!spec) return false
  const { code } = await run(id, credSet, spec.args)
  return code === 0
}

// The address Google actually answers for. No account is ever recorded as
// connected without this matching what the user asked for.
export async function identity (id, credSet, services) {
  const service = IDENTITY_ORDER.find(s => services.includes(s))
  if (!service) return null
  const spec = IDENTITY_CALLS[service]
  const { code, stdout } = await run(id, credSet, spec.args)
  if (code !== 0) return null
  try {
    const value = spec.pick(JSON.parse(stdout))
    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}
