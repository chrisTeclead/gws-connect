#!/usr/bin/env node
// Target of the generated per-account wrappers. Resolves the account's
// credential set, then runs gws with that account's config directory.
import { get } from '../src/core/accounts.mjs'
import { run } from '../src/core/gws.mjs'

const [, , id, ...rest] = process.argv
const args = rest[0] === '--' ? rest.slice(1) : rest

if (!id) {
  process.stderr.write('gws-run: missing account id\n')
  process.exit(2)
}

const meta = await get(id)
if (!meta) {
  process.stderr.write(`gws-run: unknown account "${id}". Run gws-connect to set it up.\n`)
  process.exit(2)
}

const { code } = await run(id, meta.credSet, args, { inherit: true })
process.exit(code)
