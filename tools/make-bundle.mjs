#!/usr/bin/env node
// Operator-only. Builds the shareable, self-contained bundle: the tool plus a
// Node runtime plus the gws binary, so a recipient installs nothing.
//
// Every downloaded byte is checked against the publisher's own checksum before
// it is allowed into a bundle. A mismatch ends the build.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveTarget, platforms, NODE_VERSION, GWS_VERSION } from './bundle/targets.mjs'
import { download, downloadText, shaFromListing, verify } from './bundle/fetch.mjs'
import { extractOne } from './bundle/extract.mjs'
import { collectPayload, bundleEntries, bundleName } from './bundle/assemble.mjs'
import { PAYLOAD } from './bundle/files.mjs'
import { zip } from './bundle/zip.mjs'
import { sha256Listing } from './bundle/checksums.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

function flag (name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const value = process.argv[i + 1]
  return value && !value.startsWith('--') ? value : true
}

const say = (msg) => process.stderr.write(`${msg}\n`)
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`

// Re-downloading 40 MB to change one line of CLAUDE.md is a good way to stop
// rebuilding at all.
async function cached (cacheDir, name, produce) {
  const file = path.join(cacheDir, name)
  try {
    return await fs.readFile(file)
  } catch {
    const data = await produce()
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(file, data)
    return data
  }
}

async function fetchVerified (cacheDir, { url, archive, sumUrl, sumFor }) {
  return cached(cacheDir, archive, async () => {
    say(`  downloading ${archive}`)
    const data = await download(url)
    const listing = await downloadText(sumUrl)
    verify(data, shaFromListing(listing, sumFor), archive)
    say(`  checksum ok   ${archive} (${mb(data.length)})`)
    return data
  })
}

async function build (platform, options) {
  const target = resolveTarget(platform, options)
  say(`\n${bundleName(platform)}  (node ${options.nodeVersion}, gws ${options.gwsVersion})`)

  const cacheDir = path.join(root, '.bundle-cache')
  await fs.mkdir(cacheDir, { recursive: true })
  const work = await fs.mkdtemp(path.join(cacheDir, 'work-'))

  try {
    const nodeArchive = await fetchVerified(cacheDir, {
      url: target.node.url,
      archive: target.node.archive,
      sumUrl: target.node.shasums,
      sumFor: target.node.archive
    })
    const gwsArchive = await fetchVerified(cacheDir, {
      url: target.gws.url,
      archive: target.gws.archive,
      sumUrl: target.gws.sha,
      sumFor: target.gws.archive
    })

    const nodeArchivePath = path.join(work, target.node.archive)
    const gwsArchivePath = path.join(work, target.gws.archive)
    await fs.writeFile(nodeArchivePath, nodeArchive)
    await fs.writeFile(gwsArchivePath, gwsArchive)

    const nodeBin = await extractOne(nodeArchivePath, target.node.entry, work)
    const gwsBin = await extractOne(gwsArchivePath, target.gws.entry, work)
    say(`  node ${mb(nodeBin.length)}, gws ${mb(gwsBin.length)}`)

    const payload = await collectPayload(root, PAYLOAD)
    const archive = zip(bundleEntries({ target, nodeBin, gwsBin, payload }))

    // Written beside the target and moved into place, so a failed build never
    // leaves a half-written zip that looks finished.
    const outDir = path.resolve(root, options.out)
    await fs.mkdir(outDir, { recursive: true })
    const final = path.join(outDir, `${bundleName(platform)}.zip`)
    const staged = `${final}.partial`
    await fs.writeFile(staged, archive)
    await fs.rename(staged, final)

    say(`  ${final}  ${mb(archive.length)}`)
    return final
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
}

async function main () {
  if (flag('help', false)) {
    process.stderr.write(
      'usage: make-bundle.mjs --platform <name> | --all\n' +
      `  platforms:        ${platforms().join(', ')}\n` +
      `  --node-version    default ${NODE_VERSION}\n` +
      `  --gws-version     default ${GWS_VERSION}\n` +
      '  --out <dir>       default dist\n'
    )
    return 0
  }

  const options = {
    nodeVersion: flag('node-version', NODE_VERSION),
    gwsVersion: flag('gws-version', GWS_VERSION),
    out: flag('out', 'dist')
  }

  const wanted = flag('all', false) ? platforms() : [flag('platform', null)].filter(Boolean)
  if (wanted.length === 0) {
    say('nothing to build: pass --platform <name> or --all, --help for the list')
    return 2
  }

  const built = []
  for (const platform of wanted) built.push(await build(platform, options))

  // Covers every bundle in the output folder, not only this run's, so building
  // one platform at a time still ends with a complete listing.
  const outDir = path.resolve(root, options.out)
  const zips = (await fs.readdir(outDir)).filter(n => /^gws-connect-.*\.zip$/.test(n))
  const files = await Promise.all(zips.map(async name => ({ name, data: await fs.readFile(path.join(outDir, name)) })))
  await fs.writeFile(path.join(outDir, 'SHA256SUMS'), sha256Listing(files))
  say(`  ${path.join(outDir, 'SHA256SUMS')}`)

  say(`\ndone: ${built.length} bundle(s)`)
  say('The setup code travels separately, through a password manager.')
  return 0
}

process.exit(await main().catch((error) => {
  say(`\nbuild failed: ${error.message}`)
  return 1
}))
