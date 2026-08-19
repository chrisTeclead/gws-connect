#!/usr/bin/env node
// Operator-only. Turns one Cloud project's OAuth client into a setup code.
// Imports the same encoder the wizard decodes with, so the format cannot drift.
import { encode } from '../src/core/setupcode.mjs'

function flag (name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const value = process.argv[i + 1]
  return value && !value.startsWith('--') ? value : fallback
}

const payload = {
  id: flag('id', 'default'),
  label: flag('label', 'Shared project'),
  audience: flag('audience', 'external'),
  client_id: flag('client-id', ''),
  client_secret: flag('client-secret', '')
}

if (!payload.client_id || !payload.client_secret) {
  process.stderr.write(
    'usage: make-setup-code.mjs --client-id <id> --client-secret <secret>\n' +
    '                          [--id default] [--label "Name"] [--audience external]\n'
  )
  process.exit(2)
}
if (!payload.client_id.endsWith('.apps.googleusercontent.com')) {
  process.stderr.write('The client ID must end in .apps.googleusercontent.com\n')
  process.exit(2)
}

process.stderr.write(
  '\nTreat this code like a password. Share it through a password manager,\n' +
  'never by email or chat. Anyone holding it can act as this OAuth client.\n\n'
)
process.stdout.write(encode(payload) + '\n')
