// All user-facing text resolves through t(). Nothing in src/ or bin/ prints
// a literal sentence.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { configFile, homeDir, ensureDir } from './paths.mjs'

export const LANGS = Object.freeze(['de', 'en'])
const FALLBACK = 'en'

const cache = new Map()
let active = FALLBACK

function localeUrl (lang) {
  return new URL(`../../locales/${lang}.json`, import.meta.url)
}

export function catalogue (lang) {
  if (!cache.has(lang)) {
    cache.set(lang, JSON.parse(fs.readFileSync(localeUrl(lang), 'utf8')))
  }
  return cache.get(lang)
}

function readConfig () {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'))
  } catch {
    return {}
  }
}

function fromEnvLocale () {
  const raw = process.env.LC_ALL || process.env.LANG || process.env.LANGUAGE || ''
  const tag = raw.toLowerCase().slice(0, 2)
  return LANGS.includes(tag) ? tag : null
}

export function detectLang () {
  const explicit = (process.env.GWS_CONNECT_LANG || '').toLowerCase()
  if (LANGS.includes(explicit)) return explicit
  const stored = readConfig().lang
  if (LANGS.includes(stored)) return stored
  return fromEnvLocale() || FALLBACK
}

export async function setLang (lang) {
  if (!LANGS.includes(lang)) throw new Error(`unsupported language: ${lang}`)
  await ensureDir(homeDir())
  const cfg = readConfig()
  cfg.lang = lang
  await fsp.writeFile(configFile(), JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
  active = lang
}

export async function initI18n (lang) {
  active = LANGS.includes(lang) ? lang : detectLang()
  catalogue(active)
  catalogue(FALLBACK)
}

export function currentLang () { return active }

function lookup (cat, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), cat)
}

export function t (key, vars) {
  let value = lookup(catalogue(active), key)
  if (typeof value !== 'string') value = lookup(catalogue(FALLBACK), key)
  if (typeof value !== 'string') return key
  if (!vars) return value
  return value.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m)
}
