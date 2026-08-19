import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsProof, isProven, staleAccounts, PROOF_DAYS } from '../src/core/staleness.mjs'

const day = 86400000
const iso = (ms) => new Date(ms).toISOString()
const NOW = new Date('2026-09-01T12:00:00.000Z')
const now = NOW.getTime()

test('a fresh account needs no proof yet', () => {
  const meta = { connectedAt: iso(now - 2 * day), verifiedAt: null }
  assert.equal(needsProof(meta, NOW), false)
  assert.equal(isProven(meta), false)
})

test('an account connected 8 days ago with no check needs proof', () => {
  const meta = { connectedAt: iso(now - 8 * day), verifiedAt: null }
  assert.equal(needsProof(meta, NOW), true)
})

test('a check on the day of connecting proves nothing', () => {
  const connected = now - 30 * day
  const meta = { connectedAt: iso(connected), verifiedAt: iso(connected + 60000) }
  assert.equal(isProven(meta), false)
  assert.equal(needsProof(meta, NOW), true)
})

test('a check 7 days after connecting is still not proof', () => {
  const connected = now - 30 * day
  const meta = { connectedAt: iso(connected), verifiedAt: iso(connected + 7 * day) }
  assert.equal(isProven(meta), false)
})

test('a check 8 days after connecting is proof and silences the nag', () => {
  const connected = now - 30 * day
  const meta = { connectedAt: iso(connected), verifiedAt: iso(connected + PROOF_DAYS * day) }
  assert.equal(isProven(meta), true)
  assert.equal(needsProof(meta, NOW), false)
})

test('staleAccounts filters the list', () => {
  const connected = now - 30 * day
  const list = [
    { email: 'proven@a.de', connectedAt: iso(connected), verifiedAt: iso(connected + 9 * day) },
    { email: 'stale@a.de', connectedAt: iso(connected), verifiedAt: null },
    { email: 'fresh@a.de', connectedAt: iso(now - day), verifiedAt: null }
  ]
  assert.deepEqual(staleAccounts(list, NOW).map(a => a.email), ['stale@a.de'])
})

test('a missing connectedAt is treated as needing proof', () => {
  assert.equal(needsProof({ connectedAt: null, verifiedAt: null }, NOW), true)
})
