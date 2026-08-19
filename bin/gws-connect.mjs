#!/usr/bin/env node
// Entry point. The Node version gate runs before any other import, so an old
// interpreter gets a sentence it can parse instead of a syntax error.
const major = Number.parseInt(process.versions.node.split('.')[0], 10)
if (!Number.isInteger(major) || major < 20) {
  process.stderr.write(
    `gws-connect needs Node.js 20 or newer. Found ${process.version}.\n` +
    'Install the LTS version from https://nodejs.org and try again.\n'
  )
  process.exit(1)
}

const { main } = await import('../src/menu.mjs')
process.exit(await main(process.argv.slice(2)))
