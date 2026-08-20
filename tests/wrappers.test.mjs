import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

async function load () { return import(`../src/core/wrappers.mjs?${Math.random()}`) }

test('a POSIX wrapper calls the runner and never reads a secret', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  const w = await load()
  const file = await w.write('tony-terra-one-de')
  assert.ok(file.endsWith(path.join('bin', 'gws-tony-terra-one-de')))
  const body = await fs.readFile(file, 'utf8')
  assert.ok(body.startsWith('#!/usr/bin/env bash'))
  assert.ok(body.includes('gws-run.mjs'))
  assert.ok(body.includes('tony-terra-one-de'))
  assert.ok(!body.includes('security'), 'the wrapper must not read the keychain itself')
  assert.ok(!body.includes('CLIENT_SECRET'))
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})

test('a Windows wrapper is a .cmd that calls the runner', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  const w = await load()
  const file = await w.write('anna-a-de')
  assert.ok(file.endsWith('gws-anna-a-de.cmd'))
  const body = await fs.readFile(file, 'utf8')
  assert.ok(body.includes('@echo off'))
  assert.ok(body.includes('gws-run.mjs'))
  assert.ok(body.includes('%*'))
  assert.ok(!body.includes('powershell'), 'no cryptography in batch')
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})

test('removeFor deletes both spellings and is idempotent', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  const w = await load()
  const file = await w.write('a-b-de')
  await w.removeFor('a-b-de')
  await assert.rejects(() => fs.stat(file))
  await w.removeFor('a-b-de')
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})

test('the runner forwards arguments to gws for the right account', async () => {
  // Disk-backed secrets: the runner is a separate process and cannot see an
  // in-memory store. This is what makes the cross-process path real.
  const box = await sandbox({ identity: 'tony@terra-one.de' }, { secrets: 'file' })
  await seedCredSet()
  const accounts = await import(`../src/core/accounts.mjs?${Math.random()}`)
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })

  const runner = (await load()).runnerPath()
  const r = spawnSync(process.execPath,
    [runner, 'tony-terra-one-de', '--', 'gmail', 'users', 'getProfile', '--params', '{"userId":"me"}'],
    { env: process.env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /tony@terra-one\.de/)
  const calls = await box.calls()
  assert.deepEqual(calls.at(-1).args.slice(0, 3), ['gmail', 'users', 'getProfile'])
  assert.match(calls.at(-1).configDir, /tony-terra-one-de/)
  await box.cleanup()
})

test('the runner exits non-zero for an unknown account', async () => {
  const box = await sandbox({})
  const runner = (await load()).runnerPath()
  const r = spawnSync(process.execPath, [runner, 'nope', '--', 'gmail', 'users', 'getProfile'],
    { env: process.env, encoding: 'utf8' })
  assert.notEqual(r.status, 0)
  await box.cleanup()
})

test('a wrapper pins the bundled gws when one is in use', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  const bin = String.raw`C:\bundle\runtime\gws\gws.exe`
  process.env.GWS_CONNECT_GWS_BIN = bin
  const w = await load()
  const body = await fs.readFile(await w.write('anna-a-de'), 'utf8')
  assert.ok(body.includes(`set "GWS_CONNECT_GWS_BIN=${bin}"`), body)
  delete process.env.GWS_CONNECT_GWS_BIN
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})

test('a POSIX wrapper exports the bundled gws when one is in use', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  process.env.GWS_CONNECT_GWS_BIN = '/bundle/runtime/gws/gws'
  const w = await load()
  const body = await fs.readFile(await w.write('a-b-de'), 'utf8')
  assert.match(body, /^export GWS_CONNECT_GWS_BIN="\/bundle\/runtime\/gws\/gws"$/m)
  delete process.env.GWS_CONNECT_GWS_BIN
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})

test('a wrapper stays clean when gws comes from the PATH', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  delete process.env.GWS_CONNECT_GWS_BIN
  const w = await load()
  const body = await fs.readFile(await w.write('c-d-de'), 'utf8')
  assert.ok(!body.includes('GWS_CONNECT_GWS_BIN'))
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})
