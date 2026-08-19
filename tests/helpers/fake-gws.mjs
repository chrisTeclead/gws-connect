// A stand-in for the real gws. Behaviour comes from the JSON file named by
// GWSC_FAKE_STATE; every call is appended to GWSC_FAKE_LOG so tests can assert
// not just what happened but in which order.
import fs from 'node:fs'

const args = process.argv.slice(2)
const statePath = process.env.GWSC_FAKE_STATE
const logPath = process.env.GWSC_FAKE_LOG

const state = statePath && fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : {}

if (logPath) {
  fs.appendFileSync(logPath, JSON.stringify({
    args,
    configDir: process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR || null,
    clientId: process.env.GOOGLE_WORKSPACE_CLI_CLIENT_ID || null,
    hasSecret: Boolean(process.env.GOOGLE_WORKSPACE_CLI_CLIENT_SECRET)
  }) + '\n')
}

const join = args.join(' ')

function out (obj) {
  process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}
function fail (msg) {
  process.stderr.write(String(msg || 'fake gws failure'))
  process.exit(1)
}

if (args[0] === '--version') out({ version: state.version || '1.2.3' })
if (join.startsWith('auth login')) {
  if (state.loginFails) fail('access_denied')
  process.exit(0)
}
if (join.startsWith('auth logout')) {
  if (state.logoutFails) fail('logout refused')
  process.exit(0)
}
if (join.startsWith('gmail users getProfile')) {
  if (state.gmailFails) fail('Gmail API has not been used')
  out({ emailAddress: state.identity ?? 'tony@terra-one.de' })
}
if (join.startsWith('calendar calendarList list')) {
  if (state.calendarFails) fail('Calendar API has not been used')
  out({ items: [{ id: state.identity ?? 'tony@terra-one.de', primary: true }] })
}
if (join.startsWith('drive about get')) {
  if (state.driveFails) fail('Drive API has not been used')
  out({ user: { emailAddress: state.identity ?? 'tony@terra-one.de' } })
}
if (join.startsWith('drive files list')) {
  if (state.driveFails) fail('Drive API has not been used')
  out({ files: [] })
}
fail(`fake gws: unhandled call: ${join}`)
