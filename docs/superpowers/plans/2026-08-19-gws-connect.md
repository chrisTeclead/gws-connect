# gws-connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-dependency Node CLI that connects any number of Google accounts to the Google Workspace CLI (`gws`) read-only, one isolated credential store per account, usable by non-technical people on macOS and Windows.

**Architecture:** Filesystem is the source of truth — the account list is a directory listing under `~/.gws-connect/accounts/`. Pure-logic core modules (`src/core/`) are unit-tested with no I/O beyond a temp HOME; every `gws` invocation goes through one module (`src/core/gws.mjs`) whose binary is overridable by env var so tests substitute a fake. Commands compose core modules; the interactive menu composes commands.

**Tech Stack:** Node.js ≥ 20 ESM, `node:test`, zero runtime dependencies. macOS Keychain via `security(1)`; Windows DPAPI via `powershell` + `System.Security.Cryptography.ProtectedData`.

**Spec:** `docs/superpowers/specs/2026-08-19-gws-connect-design.md`

## Global Constraints

- **Node ≥ 20**, ESM only (`.mjs`), `"type": "module"`.
- **Zero runtime dependencies.** `package.json` has no `dependencies` key. Dev-time uses only `node:test`.
- **No secrets in the repo.** Never commit a client_id, client_secret, or setup code. `.gitignore` covers `*.setupcode`, `secrets.dat`.
- **Every user-facing string goes through `t()`** from the first line written. No literal user-facing text in `src/` or `bin/`.
- **Locale files must have identical key sets.** A test enforces this.
- **All state lives under `homeDir()`**, which is `process.env.GWS_CONNECT_HOME || path.join(os.homedir(), '.gws-connect')`. Nothing is written into the repo directory at runtime.
- **Directories created with mode `0o700`** on POSIX.
- **Read-only scopes only**: `gws auth login --readonly --services <list>`. Services are drawn from `['gmail','drive','calendar']`.
- **Never mark an account connected without an identity cross-check** against the address Google actually answers for.
- **Test env overrides** (all read through `src/core/paths.mjs` or the module that owns them):
  - `GWS_CONNECT_HOME` — state root
  - `GWS_CONNECT_SECRETS=memory` — in-memory secrets backend
  - `GWS_CONNECT_GWS_BIN` — path to the `gws` executable (tests point this at a fake)
  - `GWS_CONNECT_PLATFORM` — override `process.platform` for wrapper/secret backend selection
  - `GWS_CONNECT_NO_COLOR=1` — disable ANSI
- **Commit message trailer** on every commit:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | name, `bin`, `engines`, `scripts.test`, no deps |
| `bin/gws-connect.mjs` | argv parsing, dispatch to command or menu |
| `bin/gws-run.mjs` | wrapper target: run `gws` as one account |
| `src/core/paths.mjs` | every path under the state root; `ensureDir` |
| `src/core/i18n.mjs` | `t()`, language detection, locale loading |
| `src/core/ui.mjs` | ANSI colours, `ok/warn/fail/info/title`, prompts |
| `src/core/secrets/index.mjs` | backend selection |
| `src/core/secrets/macos.mjs` | Keychain backend |
| `src/core/secrets/windows.mjs` | DPAPI-encrypted-file backend |
| `src/core/secrets/memory.mjs` | test backend |
| `src/core/setupcode.mjs` | encode/decode/validate the setup code |
| `src/core/credsets.mjs` | credential-set metadata + secret storage |
| `src/core/accounts.mjs` | account store, filesystem as truth |
| `src/core/accounttype.mjs` | email → private / workspace / unknown |
| `src/core/gws.mjs` | run `gws` per account; identity check; service probes |
| `src/core/wrappers.mjs` | generate/remove per-account wrappers |
| `src/core/staleness.mjs` | the 8-day proof rule |
| `src/core/env.mjs` | Node/`gws` detection, install offer |
| `src/commands/setup.mjs` | import a setup code |
| `src/commands/add.mjs` | add + connect one account |
| `src/commands/list.mjs` | overview |
| `src/commands/verify.mjs` | real API check per account |
| `src/commands/remove.mjs` | revoke then delete |
| `src/commands/doctor.mjs` | environment check, no login |
| `src/commands/credsets.mjs` | add an own Cloud project |
| `src/menu.mjs` | interactive menu |
| `locales/de.json`, `locales/en.json` | message catalogues |
| `tools/make-setup-code.mjs` | operator-only code generator |
| `tests/helpers/sandbox.mjs` | temp HOME, env setup, fake-gws wiring |
| `tests/helpers/fake-gws.mjs` | fake `gws` executable |
| `tests/*.test.mjs` | one file per core module + integration |

---

## Task 1: Scaffold and test harness

**Files:**
- Create: `package.json`, `.gitignore`, `src/core/paths.mjs`
- Test: `tests/paths.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `homeDir(): string`
  - `accountsDir(): string`
  - `accountDir(id: string): string`
  - `accountMetaFile(id: string): string`
  - `accountGwsDir(id: string): string`
  - `credentialsDir(): string`
  - `credSetFile(id: string): string`
  - `binDir(): string`
  - `configFile(): string`
  - `secretsFile(): string`
  - `async ensureDir(p: string): Promise<void>` — recursive, mode `0o700`
  - `platform(): 'darwin' | 'win32' | string` — honours `GWS_CONNECT_PLATFORM`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/paths.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

test('homeDir honours GWS_CONNECT_HOME', async () => {
  process.env.GWS_CONNECT_HOME = path.join(os.tmpdir(), 'gwsc-test-home')
  const paths = await import('../src/core/paths.mjs?1')
  assert.equal(paths.homeDir(), path.join(os.tmpdir(), 'gwsc-test-home'))
})

test('paths derive from the state root', async () => {
  const root = path.join(os.tmpdir(), 'gwsc-test-home')
  process.env.GWS_CONNECT_HOME = root
  const p = await import('../src/core/paths.mjs?2')
  assert.equal(p.accountsDir(), path.join(root, 'accounts'))
  assert.equal(p.accountDir('a-b-de'), path.join(root, 'accounts', 'a-b-de'))
  assert.equal(p.accountMetaFile('a-b-de'), path.join(root, 'accounts', 'a-b-de', 'meta.json'))
  assert.equal(p.accountGwsDir('a-b-de'), path.join(root, 'accounts', 'a-b-de', 'gws'))
  assert.equal(p.credentialsDir(), path.join(root, 'credentials'))
  assert.equal(p.credSetFile('default'), path.join(root, 'credentials', 'default.json'))
  assert.equal(p.binDir(), path.join(root, 'bin'))
  assert.equal(p.configFile(), path.join(root, 'config.json'))
  assert.equal(p.secretsFile(), path.join(root, 'secrets.dat'))
})

test('platform honours GWS_CONNECT_PLATFORM', async () => {
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  const p = await import('../src/core/paths.mjs?3')
  assert.equal(p.platform(), 'win32')
  delete process.env.GWS_CONNECT_PLATFORM
})

test('ensureDir creates recursively and is idempotent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-ensure-'))
  process.env.GWS_CONNECT_HOME = root
  const p = await import('../src/core/paths.mjs?4')
  const target = path.join(root, 'a', 'b', 'c')
  await p.ensureDir(target)
  await p.ensureDir(target)
  const st = await fs.stat(target)
  assert.ok(st.isDirectory())
  await fs.rm(root, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/paths.test.mjs`
Expected: FAIL — `Cannot find module '../src/core/paths.mjs'`

- [ ] **Step 3: Write `package.json` and `.gitignore`**

```json
{
  "name": "gws-connect",
  "version": "0.1.0",
  "description": "Connect any number of Google accounts to the Google Workspace CLI, read-only, one isolated store per account.",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "bin": {
    "gws-connect": "./bin/gws-connect.mjs"
  },
  "files": ["bin", "src", "locales", "skills", "docs"],
  "scripts": {
    "test": "node --test tests/"
  }
}
```

```gitignore
node_modules/
*.setupcode
secrets.dat
.DS_Store
```

- [ ] **Step 4: Write `src/core/paths.mjs`**

```javascript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/paths.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore src/core/paths.mjs tests/paths.test.mjs
git commit -m "$(printf 'feat: scaffold and path resolution\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: i18n and locale catalogues

**Files:**
- Create: `src/core/i18n.mjs`, `locales/de.json`, `locales/en.json`
- Test: `tests/i18n.test.mjs`

**Interfaces:**
- Consumes: `paths.configFile()`
- Produces:
  - `detectLang(): 'de' | 'en'` — from `GWS_CONNECT_LANG`, then stored config, then `LC_ALL`/`LANG`/`LANGUAGE`, else `'en'`
  - `async setLang(lang: string): Promise<void>` — persists to `config.json`
  - `async initI18n(lang?: string): Promise<void>` — loads catalogues, must run before `t()`
  - `t(key: string, vars?: Record<string, string|number>): string` — dotted key, `{name}` interpolation, falls back to English, returns the key itself if absent in both
  - `LANGS: readonly ['de','en']`
  - `catalogue(lang: string): object` — for the completeness test

Keys are dotted and grouped by area: `common.*`, `menu.*`, `setup.*`, `add.*`, `list.*`, `verify.*`, `remove.*`, `doctor.*`, `credsets.*`, `stale.*`, `err.*`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/i18n.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

function flatten (obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.add(key)
  }
  return out
}

test('de and en have identical key sets', async () => {
  const de = JSON.parse(await fs.readFile(new URL('../locales/de.json', import.meta.url), 'utf8'))
  const en = JSON.parse(await fs.readFile(new URL('../locales/en.json', import.meta.url), 'utf8'))
  const dk = flatten(de); const ek = flatten(en)
  const missingInEn = [...dk].filter(k => !ek.has(k))
  const missingInDe = [...ek].filter(k => !dk.has(k))
  assert.deepEqual(missingInEn, [], `missing in en: ${missingInEn}`)
  assert.deepEqual(missingInDe, [], `missing in de: ${missingInDe}`)
})

test('t resolves dotted keys and interpolates', async () => {
  const i18n = await import('../src/core/i18n.mjs?1')
  await i18n.initI18n('de')
  assert.equal(typeof i18n.t('common.yes'), 'string')
  assert.ok(i18n.t('common.yes').length > 0)
  assert.equal(i18n.t('test.interpolate', { name: 'Tony' }), 'Hallo Tony')
})

test('t falls back to English for a key missing in de', async () => {
  const i18n = await import('../src/core/i18n.mjs?2')
  await i18n.initI18n('de')
  assert.equal(i18n.t('test.enOnly'), 'English only')
})

test('t returns the key when absent everywhere', async () => {
  const i18n = await import('../src/core/i18n.mjs?3')
  await i18n.initI18n('de')
  assert.equal(i18n.t('nope.nothing.here'), 'nope.nothing.here')
})

test('detectLang prefers GWS_CONNECT_LANG, then LANG', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-lang-'))
  process.env.GWS_CONNECT_HOME = root
  process.env.GWS_CONNECT_LANG = 'en'
  let i18n = await import('../src/core/i18n.mjs?4')
  assert.equal(i18n.detectLang(), 'en')
  delete process.env.GWS_CONNECT_LANG
  process.env.LANG = 'de_DE.UTF-8'
  i18n = await import('../src/core/i18n.mjs?5')
  assert.equal(i18n.detectLang(), 'de')
  await fs.rm(root, { recursive: true, force: true })
})

test('setLang persists and detectLang reads it back', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-lang2-'))
  process.env.GWS_CONNECT_HOME = root
  delete process.env.GWS_CONNECT_LANG
  process.env.LANG = 'en_US.UTF-8'
  const i18n = await import('../src/core/i18n.mjs?6')
  await i18n.setLang('de')
  assert.equal(i18n.detectLang(), 'de')
  await fs.rm(root, { recursive: true, force: true })
})
```

The test asserts two fixture keys — `test.interpolate` and `test.enOnly`. These are real
catalogue entries, deliberately kept: `test.interpolate` exists in both languages,
`test.enOnly` exists only in English. They are excluded from the key-parity check by
living under a `test` group that the parity test skips. Adjust `flatten` calls to drop
the `test` group:

```javascript
// in the parity test, after parsing:
delete de.test; delete en.test
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/i18n.test.mjs`
Expected: FAIL — cannot find `../locales/de.json`

- [ ] **Step 3: Write the locale catalogues**

`locales/de.json`:

```json
{
  "test": { "interpolate": "Hallo {name}" },
  "common": {
    "yes": "ja",
    "no": "nein",
    "ok": "OK",
    "cancel": "abbrechen",
    "back": "zurueck",
    "quit": "beenden",
    "press_enter": "Enter druecken zum Fortfahren",
    "choice": "Auswahl:",
    "email_prompt": "E-Mail-Adresse:",
    "yes_no": "[j/n]:",
    "none": "keine",
    "account": "Konto",
    "accounts": "Konten",
    "never": "nie",
    "unknown": "unbekannt"
  },
  "menu": {
    "title": "Google-Konten verbinden",
    "add": "Konto hinzufuegen",
    "list": "Uebersicht",
    "verify": "Zugang pruefen",
    "remove": "Konto entfernen",
    "doctor": "Umgebung pruefen",
    "credsets": "Eigenes Cloud-Projekt hinzufuegen",
    "credsets_hint": "Sonderfall - nur wenn ein Administrator die App sperrt",
    "guide": "Anleitung",
    "lang": "Sprache / language",
    "unknown_choice": "Unbekannte Auswahl."
  },
  "setup": {
    "title": "Einrichtung",
    "need_code": "Bitte den Einrichtungs-Code einfuegen, den du bekommen hast.",
    "code_is_secret": "Der Code ist wie ein Passwort. Nicht per Mail weitergeben.",
    "code_prompt": "Einrichtungs-Code:",
    "imported": "Zugangsdaten gespeichert als \"{label}\".",
    "already": "Zugangsdaten \"{label}\" liegen schon vor.",
    "code_discarded": "Der Code wird nicht gespeichert und ist jetzt verbraucht.",
    "next": "Naechster Schritt: Konto hinzufuegen."
  },
  "add": {
    "title": "Konto hinzufuegen",
    "which_email": "Welches Google-Konto soll verbunden werden?",
    "duplicate": "{email} ist bereits verbunden. Nichts zu tun.",
    "pick_credset": "Mit welchen Zugangsdaten?",
    "pick_services": "Welche Bereiche sollen gelesen werden duerfen?",
    "services_default": "Vorgabe: Gmail, Drive und Kalender - alle nur lesend.",
    "type_private": "Privates Google-Konto ({domain}).",
    "type_workspace": "Google-Workspace-Domain ({domain}).",
    "type_unknown": "Die Domain {domain} scheint nicht bei Google zu liegen. Bitte pruefen.",
    "logout_first": "Wichtig: vorher im Browser bei Google ABMELDEN.",
    "logout_why": "Sonst nimmt das Zustimmungsfenster stillschweigend das Konto, das gerade angemeldet ist.",
    "browser_opens": "Der Browser oeffnet sich jetzt.",
    "choose_account": "Bitte {email} waehlen - notfalls \"Anderes Konto verwenden\".",
    "readonly_note": "Der Zugriff ist ausschliesslich lesend.",
    "unverified_warning": "Es erscheint \"Google hat diese App nicht verifiziert\".",
    "unverified_normal": "Das ist hier normal und eingeplant: ueber \"Erweitert\" -> \"Weiter zu ...\" fortfahren.",
    "login_failed": "Anmeldung fehlgeschlagen.",
    "checking": "Pruefe, welches Konto tatsaechlich verbunden ist ...",
    "wrong_account": "FALSCHES Konto verbunden: {actual} - erwartet war {expected}.",
    "wrong_account_fix": "Im Browser bei Google abmelden und erneut versuchen.",
    "no_identity": "Die Anmeldung lief durch, aber keine API antwortet.",
    "connected": "Verbunden als {email}",
    "service_ok": "{service} antwortet",
    "service_fail": "{service} antwortet nicht - ist die {api} im Cloud-Projekt aktiviert?",
    "done": "{email} ist eingerichtet. Befehl: {wrapper}",
    "retry": "Nochmal versuchen?"
  },
  "list": {
    "title": "Uebersicht",
    "empty": "Noch kein Konto verbunden.",
    "empty_next": "Menuepunkt \"Konto hinzufuegen\" waehlen.",
    "connected_at": "verbunden am {date}",
    "verified_at": "geprueft am {date}",
    "not_verified": "noch nicht nach Ablauf der Frist geprueft",
    "services": "Bereiche: {services}",
    "credset": "Zugangsdaten: {label}",
    "summary": "{usable} von {total} Konten nutzbar."
  },
  "verify": {
    "title": "Zugang pruefen",
    "checking": "Pruefe {email} ...",
    "ok": "{email}: alles in Ordnung",
    "no_access": "{email}: kein Zugriff.",
    "no_access_why": "Entweder noch nicht verbunden, oder die Zustimmung ist abgelaufen.",
    "publishing_hint": "Beim Betreiber pruefen lassen: steht das Cloud-Projekt auf \"In production\"?",
    "admin_hint": "Oder ein Workspace-Administrator hat die App gesperrt.",
    "summary": "{ok} von {total} Konten vollstaendig nutzbar.",
    "none": "Kein Konto zu pruefen."
  },
  "remove": {
    "title": "Konto entfernen",
    "which": "Welches Konto entfernen?",
    "confirm": "{email} wirklich entfernen?",
    "revoking": "Zustimmung bei Google zurueckziehen ...",
    "revoked": "Zustimmung zurueckgezogen.",
    "revoke_failed": "Die Zustimmung konnte nicht automatisch zurueckgezogen werden.",
    "revoke_manual": "Bitte von Hand entziehen: https://myaccount.google.com/permissions",
    "deleted": "{email} entfernt.",
    "aborted": "Nichts entfernt."
  },
  "doctor": {
    "title": "Umgebung pruefen",
    "node_ok": "Node.js {version}",
    "node_old": "Node.js {version} ist zu alt. Mindestens Version 20 wird gebraucht.",
    "node_missing": "Node.js ist nicht installiert.",
    "node_install": "Installieren: https://nodejs.org (LTS-Version waehlen)",
    "gws_ok": "Google Workspace CLI vorhanden ({version})",
    "gws_missing": "Google Workspace CLI (gws) fehlt.",
    "gws_install_offer": "Jetzt installieren?",
    "gws_installing": "Wird installiert ...",
    "gws_install_failed": "Die Installation hat nicht geklappt.",
    "gws_install_manual": "Bitte von Hand: npm install -g @googleworkspace/cli",
    "secrets_ok": "Sicherer Speicher funktioniert ({backend})",
    "secrets_fail": "Der sichere Speicher funktioniert nicht ({backend}).",
    "state_ok": "Datenverzeichnis beschreibbar: {dir}",
    "state_fail": "Kein Schreibrecht in {dir}",
    "creds_ok": "Zugangsdaten \"{label}\" vorhanden",
    "creds_missing": "Noch keine Zugangsdaten. Zuerst den Einrichtungs-Code eingeben.",
    "net_ok": "accounts.google.com erreichbar",
    "net_fail": "accounts.google.com nicht erreichbar - Proxy oder VPN?",
    "problems": "{count} Problem(e), die geloest werden muessen.",
    "warnings": "{count} offene(r) Punkt(e).",
    "all_good": "Alles in Ordnung."
  },
  "credsets": {
    "title": "Eigenes Cloud-Projekt hinzufuegen",
    "when": "Nur nötig, wenn ein Administrator die vorbereitete App sperrt oder die Nutzergrenze erreicht ist.",
    "guide": "Anleitung: docs/{lang}/EIGENES-PROJEKT.md",
    "how": "Wie sollen die Zugangsdaten eingegeben werden?",
    "by_code": "als Einrichtungs-Code",
    "by_hand": "Client-ID und Secret einzeln",
    "label_prompt": "Name fuer diese Zugangsdaten:",
    "client_id_prompt": "Client-ID:",
    "client_secret_prompt": "Client-Secret (wird nicht angezeigt):",
    "audience_prompt": "Ist das Projekt Internal oder External?",
    "saved": "Zugangsdaten \"{label}\" gespeichert.",
    "exists": "Es gibt schon Zugangsdaten mit dieser Kennung."
  },
  "stale": {
    "heading": "Wichtig: Zugang noch nicht bestaetigt",
    "body": "{count} Konto/Konten ist/sind vor mehr als 7 Tagen verbunden worden und wurde(n) seither nicht geprueft.",
    "why": "Ein falsch eingestelltes Cloud-Projekt kappt den Zugang genau nach 7 Tagen - lautlos. Erst eine Pruefung danach beweist, dass er haelt.",
    "offer": "Jetzt pruefen?",
    "proven": "Zugang bestaetigt haltbar."
  },
  "err": {
    "node_too_old": "Node.js 20 oder neuer wird gebraucht. Gefunden: {version}.",
    "no_gws": "Die Google Workspace CLI (gws) fehlt. Bitte \"Umgebung pruefen\" ausfuehren.",
    "no_credsets": "Noch keine Zugangsdaten hinterlegt. Bitte zuerst den Einrichtungs-Code eingeben.",
    "no_such_account": "Kein Konto mit der Adresse {email}.",
    "bad_email": "\"{value}\" sieht nicht wie eine E-Mail-Adresse aus.",
    "code_format": "Der Code hat nicht das erwartete Format. Er beginnt mit \"GWSC1.\".",
    "code_checksum": "Der Code ist unvollstaendig oder verandert - die Pruefsumme passt nicht. Bitte vollstaendig neu einfuegen.",
    "code_json": "Der Code laesst sich nicht lesen.",
    "code_version": "Dieser Code ist fuer eine andere Version des Werkzeugs.",
    "code_fields": "Im Code fehlen Angaben.",
    "code_client_id": "Die Client-ID im Code ist unplausibel - sie muss auf .apps.googleusercontent.com enden.",
    "aborted": "Abgebrochen."
  },
  "service": {
    "gmail": "Gmail",
    "drive": "Drive",
    "calendar": "Kalender",
    "gmail_api": "Gmail API",
    "drive_api": "Google Drive API",
    "calendar_api": "Google Calendar API"
  }
}
```

`locales/en.json` — identical structure, English text, plus the `test.enOnly` fixture key:

```json
{
  "test": { "interpolate": "Hello {name}", "enOnly": "English only" },
  "common": {
    "yes": "yes",
    "no": "no",
    "ok": "OK",
    "cancel": "cancel",
    "back": "back",
    "quit": "quit",
    "press_enter": "Press Enter to continue",
    "choice": "Choice:",
    "email_prompt": "Email address:",
    "yes_no": "[y/n]:",
    "none": "none",
    "account": "account",
    "accounts": "accounts",
    "never": "never",
    "unknown": "unknown"
  },
  "menu": {
    "title": "Connect Google accounts",
    "add": "Add an account",
    "list": "Overview",
    "verify": "Check access",
    "remove": "Remove an account",
    "doctor": "Check environment",
    "credsets": "Add your own Cloud project",
    "credsets_hint": "Special case - only if an administrator blocks the app",
    "guide": "Guide",
    "lang": "Sprache / language",
    "unknown_choice": "Unknown choice."
  },
  "setup": {
    "title": "Setup",
    "need_code": "Please paste the setup code you were given.",
    "code_is_secret": "The code is like a password. Do not forward it by email.",
    "code_prompt": "Setup code:",
    "imported": "Credentials stored as \"{label}\".",
    "already": "Credentials \"{label}\" are already present.",
    "code_discarded": "The code is not stored and is now used up.",
    "next": "Next step: add an account."
  },
  "add": {
    "title": "Add an account",
    "which_email": "Which Google account should be connected?",
    "duplicate": "{email} is already connected. Nothing to do.",
    "pick_credset": "Which credentials?",
    "pick_services": "Which areas may be read?",
    "services_default": "Default: Gmail, Drive and Calendar - all read-only.",
    "type_private": "Personal Google account ({domain}).",
    "type_workspace": "Google Workspace domain ({domain}).",
    "type_unknown": "The domain {domain} does not appear to be hosted at Google. Please check.",
    "logout_first": "Important: SIGN OUT of Google in your browser first.",
    "logout_why": "Otherwise the consent screen silently takes whichever account is currently signed in.",
    "browser_opens": "The browser will open now.",
    "choose_account": "Please pick {email} - use \"Use another account\" if needed.",
    "readonly_note": "Access is strictly read-only.",
    "unverified_warning": "You will see \"Google hasn't verified this app\".",
    "unverified_normal": "That is expected here: continue via \"Advanced\" -> \"Go to ...\".",
    "login_failed": "Sign-in failed.",
    "checking": "Checking which account is actually connected ...",
    "wrong_account": "WRONG account connected: {actual} - expected {expected}.",
    "wrong_account_fix": "Sign out of Google in the browser and try again.",
    "no_identity": "Sign-in completed, but no API responds.",
    "connected": "Connected as {email}",
    "service_ok": "{service} responds",
    "service_fail": "{service} does not respond - is the {api} enabled in the Cloud project?",
    "done": "{email} is set up. Command: {wrapper}",
    "retry": "Try again?"
  },
  "list": {
    "title": "Overview",
    "empty": "No account connected yet.",
    "empty_next": "Choose \"Add an account\".",
    "connected_at": "connected on {date}",
    "verified_at": "checked on {date}",
    "not_verified": "not yet checked after the deadline",
    "services": "Areas: {services}",
    "credset": "Credentials: {label}",
    "summary": "{usable} of {total} accounts usable."
  },
  "verify": {
    "title": "Check access",
    "checking": "Checking {email} ...",
    "ok": "{email}: all good",
    "no_access": "{email}: no access.",
    "no_access_why": "Either not connected yet, or consent has expired.",
    "publishing_hint": "Have the operator check: is the Cloud project set to \"In production\"?",
    "admin_hint": "Or a Workspace administrator has blocked the app.",
    "summary": "{ok} of {total} accounts fully usable.",
    "none": "No account to check."
  },
  "remove": {
    "title": "Remove an account",
    "which": "Which account should be removed?",
    "confirm": "Really remove {email}?",
    "revoking": "Revoking consent at Google ...",
    "revoked": "Consent revoked.",
    "revoke_failed": "Consent could not be revoked automatically.",
    "revoke_manual": "Please revoke it by hand: https://myaccount.google.com/permissions",
    "deleted": "{email} removed.",
    "aborted": "Nothing removed."
  },
  "doctor": {
    "title": "Check environment",
    "node_ok": "Node.js {version}",
    "node_old": "Node.js {version} is too old. Version 20 or newer is required.",
    "node_missing": "Node.js is not installed.",
    "node_install": "Install: https://nodejs.org (pick the LTS version)",
    "gws_ok": "Google Workspace CLI present ({version})",
    "gws_missing": "Google Workspace CLI (gws) is missing.",
    "gws_install_offer": "Install it now?",
    "gws_installing": "Installing ...",
    "gws_install_failed": "The installation did not work.",
    "gws_install_manual": "Please do it by hand: npm install -g @googleworkspace/cli",
    "secrets_ok": "Secure storage works ({backend})",
    "secrets_fail": "Secure storage does not work ({backend}).",
    "state_ok": "Data directory writable: {dir}",
    "state_fail": "No write permission in {dir}",
    "creds_ok": "Credentials \"{label}\" present",
    "creds_missing": "No credentials yet. Enter the setup code first.",
    "net_ok": "accounts.google.com reachable",
    "net_fail": "accounts.google.com unreachable - proxy or VPN?",
    "problems": "{count} problem(s) that must be solved.",
    "warnings": "{count} open point(s).",
    "all_good": "Everything is fine."
  },
  "credsets": {
    "title": "Add your own Cloud project",
    "when": "Only needed if an administrator blocks the prepared app, or the user limit is reached.",
    "guide": "Guide: docs/{lang}/EIGENES-PROJEKT.md",
    "how": "How would you like to enter the credentials?",
    "by_code": "as a setup code",
    "by_hand": "client ID and secret separately",
    "label_prompt": "Name for these credentials:",
    "client_id_prompt": "Client ID:",
    "client_secret_prompt": "Client secret (not shown):",
    "audience_prompt": "Is the project Internal or External?",
    "saved": "Credentials \"{label}\" stored.",
    "exists": "Credentials with that identifier already exist."
  },
  "stale": {
    "heading": "Important: access not yet confirmed",
    "body": "{count} account(s) were connected more than 7 days ago and have not been checked since.",
    "why": "A misconfigured Cloud project cuts access off after exactly 7 days - silently. Only a check after that proves it holds.",
    "offer": "Check now?",
    "proven": "Access confirmed durable."
  },
  "err": {
    "node_too_old": "Node.js 20 or newer is required. Found: {version}.",
    "no_gws": "The Google Workspace CLI (gws) is missing. Please run \"Check environment\".",
    "no_credsets": "No credentials stored yet. Please enter the setup code first.",
    "no_such_account": "No account with the address {email}.",
    "bad_email": "\"{value}\" does not look like an email address.",
    "code_format": "The code is not in the expected format. It starts with \"GWSC1.\".",
    "code_checksum": "The code is incomplete or altered - the checksum does not match. Please paste it again in full.",
    "code_json": "The code cannot be read.",
    "code_version": "This code is for a different version of the tool.",
    "code_fields": "The code is missing information.",
    "code_client_id": "The client ID in the code is implausible - it must end in .apps.googleusercontent.com.",
    "aborted": "Aborted."
  },
  "service": {
    "gmail": "Gmail",
    "drive": "Drive",
    "calendar": "Calendar",
    "gmail_api": "Gmail API",
    "drive_api": "Google Drive API",
    "calendar_api": "Google Calendar API"
  }
}
```

- [ ] **Step 5: Write `src/core/i18n.mjs`**

```javascript
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/i18n.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 7: Commit**

```bash
git add src/core/i18n.mjs locales tests/i18n.test.mjs
git commit -m "$(printf 'feat: bilingual message catalogues with English fallback\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: Setup code encode/decode

**Files:**
- Create: `src/core/setupcode.mjs`
- Test: `tests/setupcode.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PREFIX = 'GWSC1'`
  - `encode(payload: {id, label, audience, client_id, client_secret}): string`
  - `decode(code: string): payload` — throws `CodeError`
  - `class CodeError extends Error` with `.reason: 'format'|'checksum'|'json'|'version'|'fields'|'client_id'` and `.messageKey: string` (an `err.code_*` i18n key)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/setupcode.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encode, decode, CodeError, PREFIX } from '../src/core/setupcode.mjs'

const payload = {
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'GOCSPX-secret'
}

test('encode produces a three-part code with the version prefix', () => {
  const code = encode(payload)
  const parts = code.split('.')
  assert.equal(parts.length, 3)
  assert.equal(parts[0], PREFIX)
  assert.equal(parts[1].length, 8)
})

test('round trip preserves every field', () => {
  assert.deepEqual(decode(encode(payload)), { v: 1, ...payload })
})

test('whitespace around a pasted code is tolerated', () => {
  const code = `  ${encode(payload)}\n`
  assert.equal(decode(code).client_id, payload.client_id)
})

test('a truncated code fails on the checksum, not later', () => {
  const code = encode(payload)
  const truncated = code.slice(0, code.length - 6)
  assert.throws(() => decode(truncated), (e) => {
    assert.ok(e instanceof CodeError)
    assert.equal(e.reason, 'checksum')
    assert.equal(e.messageKey, 'err.code_checksum')
    return true
  })
})

test('a wrong prefix fails on format', () => {
  assert.throws(() => decode('NOPE.aaaaaaaa.eyJ2IjoxfQ'), (e) => e.reason === 'format')
})

test('a two-part code fails on format', () => {
  assert.throws(() => decode('GWSC1.deadbeef'), (e) => e.reason === 'format')
})

test('a client_id that is not a Google client fails', () => {
  const bad = { ...payload, client_id: 'not-a-client' }
  assert.throws(() => decode(encode(bad)), (e) => {
    assert.equal(e.reason, 'client_id')
    return true
  })
})

test('a missing field fails on fields', () => {
  const { client_secret, ...rest } = payload
  assert.throws(() => decode(encode(rest)), (e) => e.reason === 'fields')
})

test('an unknown version fails on version', () => {
  const body = Buffer.from(JSON.stringify({ v: 99, ...payload }), 'utf8').toString('base64url')
  const { createHash } = await import('node:crypto')
  const sum = createHash('sha256').update(body).digest('hex').slice(0, 8)
  assert.throws(() => decode(`GWSC1.${sum}.${body}`), (e) => e.reason === 'version')
})
```

Note: the last test needs `test('...', async () => {...})` because of the dynamic import — write it as an async test function.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/setupcode.test.mjs`
Expected: FAIL — cannot find `../src/core/setupcode.mjs`

- [ ] **Step 3: Write `src/core/setupcode.mjs`**

```javascript
// The setup code is transport packaging, not encryption. It IS the secret.
// The checksum exists so a truncated paste fails here, loudly, instead of
// surfacing later as an opaque OAuth error - the most expensive failure mode
// for a non-technical user.
import { createHash } from 'node:crypto'

export const PREFIX = 'GWSC1'
export const VERSION = 1

const REQUIRED = ['id', 'label', 'audience', 'client_id', 'client_secret']

export class CodeError extends Error {
  constructor (reason) {
    super(`setup code rejected: ${reason}`)
    this.name = 'CodeError'
    this.reason = reason
    this.messageKey = `err.code_${reason}`
  }
}

function checksum (body) {
  return createHash('sha256').update(body).digest('hex').slice(0, 8)
}

export function encode (payload) {
  const body = Buffer.from(JSON.stringify({ v: VERSION, ...payload }), 'utf8')
    .toString('base64url')
  return `${PREFIX}.${checksum(body)}.${body}`
}

export function decode (code) {
  const parts = String(code ?? '').trim().split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX || parts[1].length !== 8 || !parts[2]) {
    throw new CodeError('format')
  }
  const [, sum, body] = parts
  if (checksum(body) !== sum.toLowerCase()) throw new CodeError('checksum')

  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    throw new CodeError('json')
  }
  if (payload?.v !== VERSION) throw new CodeError('version')
  for (const field of REQUIRED) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new CodeError('fields')
    }
  }
  if (!payload.client_id.endsWith('.apps.googleusercontent.com')) {
    throw new CodeError('client_id')
  }
  return payload
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/setupcode.test.mjs`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/setupcode.mjs tests/setupcode.test.mjs
git commit -m "$(printf 'feat: setup code with checksum so truncated pastes fail loudly\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Secrets backends

**Files:**
- Create: `src/core/secrets/index.mjs`, `src/core/secrets/memory.mjs`, `src/core/secrets/macos.mjs`, `src/core/secrets/windows.mjs`
- Test: `tests/secrets.test.mjs`

**Interfaces:**
- Consumes: `paths.platform()`, `paths.secretsFile()`, `paths.ensureDir()`, `paths.homeDir()`
- Produces, from `index.mjs`:
  - `async backend(): Promise<Backend>` — chooses by `GWS_CONNECT_SECRETS`, else `platform()`
  - `Backend = { name: string, get(setId, field): Promise<string|null>, set(setId, field, value): Promise<void>, has(setId, field): Promise<boolean>, removeSet(setId): Promise<void>, selfTest(): Promise<boolean> }`
  - Field names used by the rest of the codebase: `'client_id'`, `'client_secret'`

The service string for the Keychain is `gws-connect:<setId>:<field>`, account `<setId>` — the
same shape the predecessor used, so a Mac that already has predecessor entries is not
disturbed (different prefix).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/secrets.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

async function freshBackend (dir) {
  process.env.GWS_CONNECT_HOME = dir
  process.env.GWS_CONNECT_SECRETS = 'memory'
  const { backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`)
  return backend()
}

test('memory backend stores, reads, reports and removes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec-'))
  const b = await freshBackend(dir)
  assert.equal(b.name, 'memory')
  assert.equal(await b.has('default', 'client_id'), false)
  assert.equal(await b.get('default', 'client_id'), null)
  await b.set('default', 'client_id', 'abc.apps.googleusercontent.com')
  await b.set('default', 'client_secret', 'GOCSPX-x')
  assert.equal(await b.has('default', 'client_id'), true)
  assert.equal(await b.get('default', 'client_secret'), 'GOCSPX-x')
  await b.removeSet('default')
  assert.equal(await b.has('default', 'client_id'), false)
  assert.equal(await b.has('default', 'client_secret'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('sets are isolated from each other', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec2-'))
  const b = await freshBackend(dir)
  await b.set('default', 'client_id', 'one')
  await b.set('own', 'client_id', 'two')
  assert.equal(await b.get('default', 'client_id'), 'one')
  assert.equal(await b.get('own', 'client_id'), 'two')
  await b.removeSet('default')
  assert.equal(await b.get('own', 'client_id'), 'two')
  await fs.rm(dir, { recursive: true, force: true })
})

test('selfTest succeeds and leaves nothing behind', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec3-'))
  const b = await freshBackend(dir)
  assert.equal(await b.selfTest(), true)
  assert.equal(await b.has('__selftest__', 'probe'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('backend selection follows the platform when not overridden', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec4-'))
  process.env.GWS_CONNECT_HOME = dir
  delete process.env.GWS_CONNECT_SECRETS
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  let { backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`)
  assert.equal((await backend()).name, 'macos')
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  ;({ backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`))
  assert.equal((await backend()).name, 'windows')
  delete process.env.GWS_CONNECT_PLATFORM
  process.env.GWS_CONNECT_SECRETS = 'memory'
  await fs.rm(dir, { recursive: true, force: true })
})

test('windows backend round-trips through its own file format', async (t) => {
  if (process.platform !== 'win32') return t.skip('DPAPI is Windows-only')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec5-'))
  process.env.GWS_CONNECT_HOME = dir
  delete process.env.GWS_CONNECT_SECRETS
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  const { backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`)
  const b = await backend()
  await b.set('default', 'client_secret', 'GOCSPX-roundtrip')
  assert.equal(await b.get('default', 'client_secret'), 'GOCSPX-roundtrip')
  await b.removeSet('default')
  assert.equal(await b.has('default', 'client_secret'), false)
  process.env.GWS_CONNECT_SECRETS = 'memory'
  await fs.rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/secrets.test.mjs`
Expected: FAIL — cannot find `../src/core/secrets/index.mjs`

- [ ] **Step 3: Write `src/core/secrets/memory.mjs`**

```javascript
// Test backend. Also the fallback the doctor reports as insecure if it is
// ever selected on a real machine.
const store = new Map()

const key = (setId, field) => `${setId} ${field}`

export default {
  name: 'memory',
  async get (setId, field) { return store.has(key(setId, field)) ? store.get(key(setId, field)) : null },
  async set (setId, field, value) { store.set(key(setId, field), value) },
  async has (setId, field) { return store.has(key(setId, field)) },
  async removeSet (setId) {
    for (const k of [...store.keys()]) {
      if (k.startsWith(`${setId} `)) store.delete(k)
    }
  },
  async selfTest () {
    await this.set('__selftest__', 'probe', 'x')
    const back = await this.get('__selftest__', 'probe')
    await this.removeSet('__selftest__')
    return back === 'x'
  }
}
```

- [ ] **Step 4: Write `src/core/secrets/macos.mjs`**

```javascript
// macOS Keychain via security(1). One entry per (set, field).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PREFIX = 'gws-connect'
const service = (setId, field) => `${PREFIX}:${setId}:${field}`
const FIELDS = ['client_id', 'client_secret']

export default {
  name: 'macos',
  async get (setId, field) {
    try {
      const { stdout } = await run('security',
        ['find-generic-password', '-a', setId, '-s', service(setId, field), '-w'])
      const value = stdout.replace(/\n$/, '')
      return value === '' ? null : value
    } catch {
      return null
    }
  },
  async set (setId, field, value) {
    await run('security', [
      'add-generic-password',
      '-a', setId,
      '-s', service(setId, field),
      '-w', value,
      '-T', '/usr/bin/security',
      '-U'
    ])
  },
  async has (setId, field) { return (await this.get(setId, field)) !== null },
  async removeSet (setId) {
    for (const field of FIELDS) {
      try {
        await run('security', ['delete-generic-password', '-s', service(setId, field)])
      } catch { /* absent is fine */ }
    }
  },
  async selfTest () {
    try {
      await this.set('__selftest__', 'client_id', 'probe')
      const back = await this.get('__selftest__', 'client_id')
      await this.removeSet('__selftest__')
      return back === 'probe'
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 5: Write `src/core/secrets/windows.mjs`**

```javascript
// Windows: one DPAPI-encrypted JSON blob, scoped to the current user.
// Batch and cmd are the wrong place for cryptography, so all of it happens
// here and the generated wrappers never touch a secret (see wrappers.mjs).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import { secretsFile, homeDir, ensureDir } from '../paths.mjs'

const run = promisify(execFile)

const PROTECT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String($env:GWSC_IN)
$out = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
[Convert]::ToBase64String($out)
`

const UNPROTECT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String($env:GWSC_IN)
$out = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
[Convert]::ToBase64String($out)
`

async function powershell (script, inputB64) {
  const { stdout } = await run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { env: { ...process.env, GWSC_IN: inputB64 }, maxBuffer: 8 * 1024 * 1024 }
  )
  return stdout.trim()
}

async function readAll () {
  let cipher
  try {
    cipher = (await fs.readFile(secretsFile(), 'utf8')).trim()
  } catch {
    return {}
  }
  if (!cipher) return {}
  const plainB64 = await powershell(UNPROTECT, cipher)
  return JSON.parse(Buffer.from(plainB64, 'base64').toString('utf8'))
}

async function writeAll (data) {
  await ensureDir(homeDir())
  const plainB64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
  const cipher = await powershell(PROTECT, plainB64)
  await fs.writeFile(secretsFile(), cipher + '\n', { mode: 0o600 })
}

export default {
  name: 'windows',
  async get (setId, field) {
    const all = await readAll()
    const value = all?.[setId]?.[field]
    return typeof value === 'string' ? value : null
  },
  async set (setId, field, value) {
    const all = await readAll()
    all[setId] = { ...(all[setId] || {}), [field]: value }
    await writeAll(all)
  },
  async has (setId, field) { return (await this.get(setId, field)) !== null },
  async removeSet (setId) {
    const all = await readAll()
    if (!(setId in all)) return
    delete all[setId]
    await writeAll(all)
  },
  async selfTest () {
    try {
      await this.set('__selftest__', 'client_id', 'probe')
      const back = await this.get('__selftest__', 'client_id')
      await this.removeSet('__selftest__')
      return back === 'probe'
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 6: Write `src/core/secrets/index.mjs`**

```javascript
import { platform } from '../paths.mjs'

export async function backend () {
  const forced = (process.env.GWS_CONNECT_SECRETS || '').toLowerCase()
  if (forced === 'memory') return (await import('./memory.mjs')).default
  if (forced === 'macos') return (await import('./macos.mjs')).default
  if (forced === 'windows') return (await import('./windows.mjs')).default

  switch (platform()) {
    case 'darwin': return (await import('./macos.mjs')).default
    case 'win32': return (await import('./windows.mjs')).default
    default: return (await import('./memory.mjs')).default
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test tests/secrets.test.mjs`
Expected: PASS — 4 tests, 1 skipped off Windows

- [ ] **Step 8: Commit**

```bash
git add src/core/secrets tests/secrets.test.mjs
git commit -m "$(printf 'feat: secrets backends for Keychain, DPAPI and tests\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: Credential sets

**Files:**
- Create: `src/core/credsets.mjs`
- Test: `tests/credsets.test.mjs`

**Interfaces:**
- Consumes: `paths.credentialsDir/credSetFile/ensureDir`, `secrets.backend()`, `setupcode.decode()`
- Produces:
  - `async list(): Promise<CredSet[]>` where `CredSet = {id, label, audience, source, createdAt}` — sorted with `default` first, then by label
  - `async get(id): Promise<CredSet|null>`
  - `async importCode(code: string): Promise<CredSet>` — decodes, stores secrets, writes metadata; throws `CodeError`
  - `async saveManual({id, label, audience, client_id, client_secret}): Promise<CredSet>`
  - `async credentials(id): Promise<{client_id, client_secret}>` — throws if incomplete
  - `async exists(id): Promise<boolean>`
  - `async remove(id): Promise<void>`

Metadata files never contain a secret. That invariant has its own test.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/credsets.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { encode } from '../src/core/setupcode.mjs'

const payload = {
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'GOCSPX-secret'
}

async function fresh () {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-cs-'))
  process.env.GWS_CONNECT_HOME = dir
  process.env.GWS_CONNECT_SECRETS = 'memory'
  const mod = await import(`../src/core/credsets.mjs?${Math.random()}`)
  return { dir, mod }
}

test('importCode stores metadata and secrets separately', async () => {
  const { dir, mod } = await fresh()
  const set = await mod.importCode(encode(payload))
  assert.equal(set.id, 'default')
  assert.equal(set.label, 'Terra One')
  assert.equal(set.audience, 'external')
  assert.equal(set.source, 'setup-code')
  assert.ok(set.createdAt)

  const onDisk = await fs.readFile(path.join(dir, 'credentials', 'default.json'), 'utf8')
  assert.ok(!onDisk.includes('GOCSPX-secret'), 'metadata must not contain the secret')
  assert.ok(!onDisk.includes('123-abc'), 'metadata must not contain the client id')

  const creds = await mod.credentials('default')
  assert.deepEqual(creds, { client_id: payload.client_id, client_secret: payload.client_secret })
  await fs.rm(dir, { recursive: true, force: true })
})

test('list returns default first', async () => {
  const { dir, mod } = await fresh()
  await mod.importCode(encode(payload))
  await mod.saveManual({
    id: 'own', label: 'Aaa own', audience: 'internal',
    client_id: 'zzz.apps.googleusercontent.com', client_secret: 's'
  })
  const ids = (await mod.list()).map(s => s.id)
  assert.deepEqual(ids, ['default', 'own'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('list is empty on a fresh machine', async () => {
  const { dir, mod } = await fresh()
  assert.deepEqual(await mod.list(), [])
  assert.equal(await mod.get('default'), null)
  assert.equal(await mod.exists('default'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('credentials throws when the secret is missing', async () => {
  const { dir, mod } = await fresh()
  await mod.saveManual({
    id: 'half', label: 'Half', audience: 'external',
    client_id: 'x.apps.googleusercontent.com', client_secret: 'y'
  })
  const { backend } = await import('../src/core/secrets/index.mjs')
  const b = await backend()
  await b.removeSet('half')
  await assert.rejects(() => mod.credentials('half'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('remove drops both metadata and secrets', async () => {
  const { dir, mod } = await fresh()
  await mod.importCode(encode(payload))
  await mod.remove('default')
  assert.equal(await mod.exists('default'), false)
  const { backend } = await import('../src/core/secrets/index.mjs')
  assert.equal(await (await backend()).has('default', 'client_secret'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('a bad code propagates CodeError and stores nothing', async () => {
  const { dir, mod } = await fresh()
  await assert.rejects(() => mod.importCode('GWSC1.deadbeef.bm9wZQ'), (e) => e.name === 'CodeError')
  assert.deepEqual(await mod.list(), [])
  await fs.rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/credsets.test.mjs`
Expected: FAIL — cannot find `../src/core/credsets.mjs`

- [ ] **Step 3: Write `src/core/credsets.mjs`**

```javascript
// A credential set is one Cloud project's OAuth client. Metadata is a plain
// file; the client_id and client_secret live in the platform secret store.
// Splitting them is the point: the metadata file is safe to read, copy and
// support-ticket, the secrets never leave the store.
import fs from 'node:fs/promises'
import path from 'node:path'
import { credentialsDir, credSetFile, ensureDir } from './paths.mjs'
import { backend } from './secrets/index.mjs'
import { decode } from './setupcode.mjs'

async function writeMeta (meta) {
  await ensureDir(credentialsDir())
  await fs.writeFile(credSetFile(meta.id), JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 })
  return meta
}

export async function get (id) {
  try {
    return JSON.parse(await fs.readFile(credSetFile(id), 'utf8'))
  } catch {
    return null
  }
}

export async function exists (id) {
  return (await get(id)) !== null
}

export async function list () {
  let names = []
  try {
    names = await fs.readdir(credentialsDir())
  } catch {
    return []
  }
  const sets = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const set = await get(path.basename(name, '.json'))
    if (set) sets.push(set)
  }
  return sets.sort((a, b) => {
    if (a.id === 'default') return -1
    if (b.id === 'default') return 1
    return String(a.label).localeCompare(String(b.label))
  })
}

async function store (id, client_id, client_secret) {
  const b = await backend()
  await b.set(id, 'client_id', client_id)
  await b.set(id, 'client_secret', client_secret)
}

export async function importCode (code) {
  const payload = decode(code)
  await store(payload.id, payload.client_id, payload.client_secret)
  return writeMeta({
    id: payload.id,
    label: payload.label,
    audience: payload.audience,
    source: 'setup-code',
    createdAt: new Date().toISOString()
  })
}

export async function saveManual ({ id, label, audience, client_id, client_secret }) {
  await store(id, client_id, client_secret)
  return writeMeta({
    id,
    label,
    audience,
    source: 'manual',
    createdAt: new Date().toISOString()
  })
}

export async function credentials (id) {
  const b = await backend()
  const client_id = await b.get(id, 'client_id')
  const client_secret = await b.get(id, 'client_secret')
  if (!client_id || !client_secret) {
    throw new Error(`credential set "${id}" is incomplete`)
  }
  return { client_id, client_secret }
}

export async function remove (id) {
  await (await backend()).removeSet(id)
  await fs.rm(credSetFile(id), { force: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/credsets.test.mjs`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/credsets.mjs tests/credsets.test.mjs
git commit -m "$(printf 'feat: credential sets with metadata and secrets kept apart\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: Account store

**Files:**
- Create: `src/core/accounts.mjs`
- Test: `tests/accounts.test.mjs`

**Interfaces:**
- Consumes: `paths.*`
- Produces:
  - `SERVICES = ['gmail','drive','calendar']`
  - `idFromEmail(email: string): string`
  - `isEmail(value: string): boolean`
  - `async list(): Promise<Meta[]>` where `Meta = {id, email, credSet, services, accountType, connectedAt, verifiedAt|null}` — sorted by email
  - `async get(id): Promise<Meta|null>`
  - `async findByEmail(email): Promise<Meta|null>`
  - `async create({email, credSet, services, accountType}): Promise<Meta>` — creates the account dir and its `gws/` subdir, sets `connectedAt` to now, `verifiedAt` to `null`
  - `async markVerified(id, when = new Date()): Promise<Meta>`
  - `async remove(id): Promise<void>`
  - `async gwsDirFor(id): Promise<string>` — ensures it exists, returns the path

`list()` reads the directory, not a central index. A directory whose `meta.json` is
missing or unparseable is skipped rather than crashing the tool — a half-written
account must never make `list` throw.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/accounts.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

async function fresh () {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-acc-'))
  process.env.GWS_CONNECT_HOME = dir
  const mod = await import(`../src/core/accounts.mjs?${Math.random()}`)
  return { dir, mod }
}

test('idFromEmail slugifies', async () => {
  const { dir, mod } = await fresh()
  assert.equal(mod.idFromEmail('tony@terra-one.de'), 'tony-terra-one-de')
  assert.equal(mod.idFromEmail('Tony.Test+x@Gmail.com'), 'tony-test-x-gmail-com')
  assert.equal(mod.idFromEmail('--a--@b.de--'), 'a-b-de')
  await fs.rm(dir, { recursive: true, force: true })
})

test('isEmail accepts plausible addresses and rejects junk', async () => {
  const { dir, mod } = await fresh()
  assert.equal(mod.isEmail('a@b.de'), true)
  assert.equal(mod.isEmail('tony@terra-one.de'), true)
  assert.equal(mod.isEmail('nope'), false)
  assert.equal(mod.isEmail('a@b'), false)
  assert.equal(mod.isEmail('a b@c.de'), false)
  assert.equal(mod.isEmail(''), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('create writes meta.json and the gws directory', async () => {
  const { dir, mod } = await fresh()
  const meta = await mod.create({
    email: 'tony@terra-one.de',
    credSet: 'default',
    services: ['gmail', 'calendar'],
    accountType: 'workspace'
  })
  assert.equal(meta.id, 'tony-terra-one-de')
  assert.equal(meta.verifiedAt, null)
  assert.ok(meta.connectedAt)
  const st = await fs.stat(path.join(dir, 'accounts', 'tony-terra-one-de', 'gws'))
  assert.ok(st.isDirectory())
  const back = await mod.get('tony-terra-one-de')
  assert.deepEqual(back.services, ['gmail', 'calendar'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('the account list is the directory listing, sorted by email', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'zoe@b.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  await mod.create({ email: 'anna@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  assert.deepEqual((await mod.list()).map(a => a.email), ['anna@a.de', 'zoe@b.de'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('a directory without meta.json is skipped, not fatal', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'ok@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  await fs.mkdir(path.join(dir, 'accounts', 'broken'), { recursive: true })
  await fs.writeFile(path.join(dir, 'accounts', 'broken', 'meta.json'), '{ not json')
  const list = await mod.list()
  assert.deepEqual(list.map(a => a.email), ['ok@a.de'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('findByEmail is case-insensitive', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  assert.ok(await mod.findByEmail('TONY@Terra-One.de'))
  assert.equal(await mod.findByEmail('other@x.de'), null)
  await fs.rm(dir, { recursive: true, force: true })
})

test('markVerified records the timestamp', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'a@b.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  const when = new Date('2026-09-01T10:00:00.000Z')
  const meta = await mod.markVerified('a-b-de', when)
  assert.equal(meta.verifiedAt, when.toISOString())
  assert.equal((await mod.get('a-b-de')).verifiedAt, when.toISOString())
  await fs.rm(dir, { recursive: true, force: true })
})

test('remove deletes the whole account directory', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'a@b.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  await mod.remove('a-b-de')
  assert.equal(await mod.get('a-b-de'), null)
  await assert.rejects(() => fs.stat(path.join(dir, 'accounts', 'a-b-de')))
  await fs.rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/accounts.test.mjs`
Expected: FAIL — cannot find `../src/core/accounts.mjs`

- [ ] **Step 3: Write `src/core/accounts.mjs`**

```javascript
// The account list IS the directory listing. There is no central index, so
// there is nothing that can disagree with what is actually on disk.
import fs from 'node:fs/promises'
import {
  accountsDir, accountDir, accountMetaFile, accountGwsDir, ensureDir
} from './paths.mjs'

export const SERVICES = Object.freeze(['gmail', 'drive', 'calendar'])

export function idFromEmail (email) {
  return String(email).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isEmail (value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim())
}

async function readMeta (id) {
  try {
    const raw = JSON.parse(await fs.readFile(accountMetaFile(id), 'utf8'))
    if (!raw || typeof raw.email !== 'string') return null
    return { id, verifiedAt: null, ...raw }
  } catch {
    return null
  }
}

async function writeMeta (id, meta) {
  await ensureDir(accountDir(id))
  const { id: _drop, ...body } = meta
  await fs.writeFile(accountMetaFile(id), JSON.stringify(body, null, 2) + '\n', { mode: 0o600 })
  return { id, ...body }
}

export async function get (id) { return readMeta(id) }

export async function list () {
  let names = []
  try {
    names = await fs.readdir(accountsDir(), { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of names) {
    if (!entry.isDirectory()) continue
    // A half-written account must not make the whole overview throw.
    const meta = await readMeta(entry.name)
    if (meta) out.push(meta)
  }
  return out.sort((a, b) => a.email.localeCompare(b.email))
}

export async function findByEmail (email) {
  const wanted = String(email ?? '').trim().toLowerCase()
  return (await list()).find(a => a.email.toLowerCase() === wanted) || null
}

export async function create ({ email, credSet, services, accountType }) {
  const id = idFromEmail(email)
  await ensureDir(accountGwsDir(id))
  return writeMeta(id, {
    email,
    credSet,
    services: [...services],
    accountType,
    connectedAt: new Date().toISOString(),
    verifiedAt: null
  })
}

export async function markVerified (id, when = new Date()) {
  const meta = await readMeta(id)
  if (!meta) throw new Error(`unknown account: ${id}`)
  meta.verifiedAt = when.toISOString()
  return writeMeta(id, meta)
}

export async function remove (id) {
  await fs.rm(accountDir(id), { recursive: true, force: true })
}

export async function gwsDirFor (id) {
  const dir = accountGwsDir(id)
  await ensureDir(dir)
  return dir
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/accounts.test.mjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/accounts.mjs tests/accounts.test.mjs
git commit -m "$(printf 'feat: account store with the filesystem as source of truth\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: Account type and staleness rule

**Files:**
- Create: `src/core/accounttype.mjs`, `src/core/staleness.mjs`
- Test: `tests/accounttype.test.mjs`, `tests/staleness.test.mjs`

**Interfaces:**
- Consumes: `node:dns/promises`
- Produces from `accounttype.mjs`:
  - `async detect(email): Promise<{type: 'privat'|'workspace'|'unklar', domain: string}>`
  - `domainOf(email): string`
- Produces from `staleness.mjs`:
  - `PROOF_DAYS = 8`, `GRACE_DAYS = 7`
  - `needsProof(meta, now = new Date()): boolean`
  - `isProven(meta): boolean`
  - `staleAccounts(list, now = new Date()): Meta[]`

The rule, stated once so both functions agree: an account is **proven** when
`verifiedAt - connectedAt >= 8 days`. It **needs proof** when it is not proven and
was connected more than 7 days ago. A check on the day of connecting proves nothing —
the cutoff only bites afterwards.

DNS failure yields `'unklar'` and never throws. Networks without working MX lookups
exist, and refusing to continue there would be worse than a soft warning.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/staleness.test.mjs
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
```

```javascript
// tests/accounttype.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domainOf, detect } from '../src/core/accounttype.mjs'

test('domainOf lowercases and strips the local part', () => {
  assert.equal(domainOf('Tony@Terra-One.DE'), 'terra-one.de')
})

test('gmail addresses are private without any DNS lookup', async () => {
  const r = await detect('tony@gmail.com')
  assert.deepEqual(r, { type: 'privat', domain: 'gmail.com' })
  const r2 = await detect('tony@googlemail.com')
  assert.equal(r2.type, 'privat')
})

test('a domain whose MX is Google is a workspace domain', async () => {
  const resolver = async () => [{ exchange: 'aspmx.l.google.com', priority: 1 }]
  const r = await detect('a@example.org', { resolveMx: resolver })
  assert.deepEqual(r, { type: 'workspace', domain: 'example.org' })
})

test('a domain whose MX is elsewhere is unclear', async () => {
  const resolver = async () => [{ exchange: 'mx.mailbox.org', priority: 10 }]
  const r = await detect('a@example.org', { resolveMx: resolver })
  assert.equal(r.type, 'unklar')
})

test('a DNS failure yields unclear and does not throw', async () => {
  const resolver = async () => { throw new Error('ENOTFOUND') }
  const r = await detect('a@example.org', { resolveMx: resolver })
  assert.equal(r.type, 'unklar')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/staleness.test.mjs tests/accounttype.test.mjs`
Expected: FAIL — modules not found

- [ ] **Step 3: Write `src/core/staleness.mjs`**

```javascript
// A misconfigured Cloud project cuts access after exactly 7 days, silently.
// The predecessor relied on a hand-written calendar reminder to catch that.
// This encodes it instead: only a successful check AFTER the deadline is proof.
export const GRACE_DAYS = 7
export const PROOF_DAYS = 8

const DAY = 86400000

function ms (value) {
  const t = Date.parse(value ?? '')
  return Number.isNaN(t) ? null : t
}

export function isProven (meta) {
  const connected = ms(meta?.connectedAt)
  const verified = ms(meta?.verifiedAt)
  if (connected === null || verified === null) return false
  return verified - connected >= PROOF_DAYS * DAY
}

export function needsProof (meta, now = new Date()) {
  if (isProven(meta)) return false
  const connected = ms(meta?.connectedAt)
  if (connected === null) return true
  return now.getTime() - connected > GRACE_DAYS * DAY
}

export function staleAccounts (list, now = new Date()) {
  return list.filter(meta => needsProof(meta, now))
}
```

- [ ] **Step 4: Write `src/core/accounttype.mjs`**

```javascript
// The type only steers the explanatory text. Both types connect the same way,
// because the shared Cloud project is External.
import dns from 'node:dns/promises'

const PRIVATE_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

export function domainOf (email) {
  return String(email ?? '').trim().toLowerCase().split('@').pop() || ''
}

export async function detect (email, { resolveMx = dns.resolveMx } = {}) {
  const domain = domainOf(email)
  if (PRIVATE_DOMAINS.has(domain)) return { type: 'privat', domain }

  try {
    const records = await resolveMx(domain)
    const google = records.some(r =>
      /(^|\.)google\.com$|(^|\.)googlemail\.com$/.test(String(r.exchange).toLowerCase()))
    return { type: google ? 'workspace' : 'unklar', domain }
  } catch {
    // No DNS here, or the domain does not resolve. A soft warning beats
    // refusing to continue.
    return { type: 'unklar', domain }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/staleness.test.mjs tests/accounttype.test.mjs`
Expected: PASS, 12 tests total

- [ ] **Step 6: Commit**

```bash
git add src/core/staleness.mjs src/core/accounttype.mjs tests/staleness.test.mjs tests/accounttype.test.mjs
git commit -m "$(printf 'feat: account type detection and the 8-day proof rule\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 8: gws runner, identity cross-check and service probes

**Files:**
- Create: `src/core/gws.mjs`, `tests/helpers/fake-gws.mjs`, `tests/helpers/sandbox.mjs`
- Test: `tests/gws.test.mjs`

**Interfaces:**
- Consumes: `accounts.gwsDirFor()`, `credsets.credentials()`, `paths.platform()`
- Produces:
  - `gwsBin(): string` — `process.env.GWS_CONNECT_GWS_BIN || 'gws'`
  - `async installed(): Promise<{ok: boolean, version: string|null}>`
  - `async run(id, credSet, args, {inherit = false}): Promise<{code: number, stdout: string, stderr: string}>`
  - `async login(id, credSet, services): Promise<boolean>` — inherits stdio so the browser flow is visible
  - `async logout(id, credSet): Promise<boolean>`
  - `async probe(id, credSet, service): Promise<boolean>` — one service
  - `async identity(id, credSet, services): Promise<string|null>` — the address Google actually answers for
  - `IDENTITY_ORDER = ['gmail','calendar','drive']`
  - `PROBES: Record<service, {args: string[]}>`

`identity()` picks the first service present in `services` following
`IDENTITY_ORDER`, so every possible selection has a cross-check:

| service | call | field compared |
|---|---|---|
| gmail | `gmail users getProfile --params {"userId":"me"}` | `emailAddress` |
| calendar | `calendar calendarList list --params {"maxResults":250}` | `id` of the entry with `primary: true` |
| drive | `drive about get --params {"fields":"user/emailAddress"}` | `user.emailAddress` |

If `services` is empty, `identity()` returns `null` and the caller must treat the
account as not connected. No account is ever recorded without an identity match.

The fake `gws` is a real executable script driven by a JSON state file, so it exercises
the actual spawn path. It appends every invocation to a log file, which is how the
"logout before delete" ordering gets asserted in Task 12.

- [ ] **Step 1: Write the test helpers**

```javascript
// tests/helpers/fake-gws.mjs
#!/usr/bin/env node
// A stand-in for the real gws. Behaviour comes from the JSON file named by
// GWSC_FAKE_STATE; every call is appended to GWSC_FAKE_LOG.
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
```

```javascript
// tests/helpers/sandbox.mjs
// A temp HOME, a fake gws, an in-memory secrets backend. No real account,
// no sign-in, no network.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const FAKE = fileURLToPath(new URL('./fake-gws.mjs', import.meta.url))

export async function sandbox (state = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-box-'))
  const statePath = path.join(dir, 'fake-state.json')
  const logPath = path.join(dir, 'fake-log.jsonl')
  await fs.writeFile(statePath, JSON.stringify(state))
  await fs.writeFile(logPath, '')

  process.env.GWS_CONNECT_HOME = path.join(dir, 'home')
  process.env.GWS_CONNECT_SECRETS = 'memory'
  process.env.GWS_CONNECT_GWS_BIN = FAKE
  process.env.GWS_CONNECT_NO_COLOR = '1'
  process.env.GWSC_FAKE_STATE = statePath
  process.env.GWSC_FAKE_LOG = logPath

  return {
    dir,
    async setState (next) { await fs.writeFile(statePath, JSON.stringify(next)) },
    async calls () {
      const raw = await fs.readFile(logPath, 'utf8')
      return raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
    },
    async cleanup () { await fs.rm(dir, { recursive: true, force: true }) }
  }
}

export async function seedCredSet (id = 'default', label = 'Terra One') {
  const credsets = await import(`../../src/core/credsets.mjs?${Math.random()}`)
  return credsets.saveManual({
    id,
    label,
    audience: 'external',
    client_id: '123-abc.apps.googleusercontent.com',
    client_secret: 'GOCSPX-secret'
  })
}
```

Because `fake-gws.mjs` is spawned as an executable, `gwsBin()` must be invoked through
`process.execPath` when it ends in `.mjs`. `gws.mjs` handles that (see Step 3) so the
helper needs no shebang trickery on Windows.

- [ ] **Step 2: Write the failing test**

```javascript
// tests/gws.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

async function load () {
  return import(`../src/core/gws.mjs?${Math.random()}`)
}

test('installed reports the fake version', async () => {
  const box = await sandbox({ version: '9.9.9' })
  const gws = await load()
  const r = await gws.installed()
  assert.equal(r.ok, true)
  assert.ok(r.version.includes('9.9.9'))
  await box.cleanup()
})

test('run passes the account config dir and the credentials through the environment', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const accounts = await import(`../src/core/accounts.mjs?${Math.random()}`)
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  const gws = await load()
  await gws.run('tony-terra-one-de', 'default', ['gmail', 'users', 'getProfile', '--params', '{"userId":"me"}'])
  const [call] = await box.calls()
  assert.match(call.configDir, /tony-terra-one-de/)
  assert.equal(call.clientId, '123-abc.apps.googleusercontent.com')
  assert.equal(call.hasSecret, true)
  await box.cleanup()
})

test('identity uses Gmail when Gmail is among the services', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const gws = await load()
  const who = await gws.identity('x', 'default', ['gmail', 'drive', 'calendar'])
  assert.equal(who, 'tony@terra-one.de')
  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 3), ['gmail', 'users', 'getProfile'])
  await box.cleanup()
})

test('identity falls back to the primary calendar when Gmail is not selected', async () => {
  const box = await sandbox({ identity: 'anna@a.de' })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', ['calendar']), 'anna@a.de')
  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 2), ['calendar', 'calendarList'])
  await box.cleanup()
})

test('identity falls back to Drive when only Drive is selected', async () => {
  const box = await sandbox({ identity: 'zoe@z.de' })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', ['drive']), 'zoe@z.de')
  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 2), ['drive', 'about'])
  await box.cleanup()
})

test('identity is null when no service is selected', async () => {
  const box = await sandbox({})
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', []), null)
  await box.cleanup()
})

test('identity is null when the chosen API refuses', async () => {
  const box = await sandbox({ gmailFails: true })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', ['gmail']), null)
  await box.cleanup()
})

test('probe reports each service separately', async () => {
  const box = await sandbox({ driveFails: true })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.probe('x', 'default', 'gmail'), true)
  assert.equal(await gws.probe('x', 'default', 'calendar'), true)
  assert.equal(await gws.probe('x', 'default', 'drive'), false)
  await box.cleanup()
})

test('login returns false when consent fails', async () => {
  const box = await sandbox({ loginFails: true })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.login('x', 'default', ['gmail']), false)
  await box.cleanup()
})

test('login passes --readonly and the service list', async () => {
  const box = await sandbox({})
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.login('x', 'default', ['gmail', 'calendar']), true)
  const [call] = await box.calls()
  assert.deepEqual(call.args, ['auth', 'login', '--readonly', '--services', 'gmail,calendar'])
  await box.cleanup()
})
```

- [ ] **Step 3: Write `src/core/gws.mjs`**

```javascript
// Every gws invocation in the codebase goes through here. That is what makes
// the fake in tests possible, and it is the only place that knows how a
// credential set becomes environment variables.
import { spawn } from 'node:child_process'
import { gwsDirFor } from './accounts.mjs'
import { credentials } from './credsets.mjs'

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
// spawn path without needing a shebang that works on Windows too.
function launch (args, options) {
  const bin = gwsBin()
  if (bin.endsWith('.mjs') || bin.endsWith('.js')) {
    return spawn(process.execPath, [bin, ...args], options)
  }
  return spawn(bin, args, { ...options, shell: process.platform === 'win32' })
}

async function env (id, credSet) {
  const { client_id, client_secret } = await credentials(credSet)
  return {
    ...process.env,
    GOOGLE_WORKSPACE_CLI_CONFIG_DIR: await gwsDirFor(id),
    GOOGLE_WORKSPACE_CLI_CLIENT_ID: client_id,
    GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: client_secret
  }
}

export async function run (id, credSet, args, { inherit = false } = {}) {
  const child = launch(args, {
    env: await env(id, credSet),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gws.test.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/gws.mjs tests/gws.test.mjs tests/helpers
git commit -m "$(printf 'feat: gws runner with identity cross-check for every service selection\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 9: Per-account wrappers and the shared runner

**Files:**
- Create: `src/core/wrappers.mjs`, `bin/gws-run.mjs`
- Test: `tests/wrappers.test.mjs`

**Interfaces:**
- Consumes: `paths.binDir/ensureDir/platform`, `accounts.get()`, `gws.run()`
- Produces from `wrappers.mjs`:
  - `wrapperPath(id): string` — `bin/gws-<id>` on POSIX, `bin/gws-<id>.cmd` on Windows
  - `async write(id): Promise<string>` — returns the path written
  - `async removeFor(id): Promise<void>` — removes both spellings
  - `runnerPath(): string` — absolute path to `bin/gws-run.mjs`

The wrapper does **not** read the secret. It is one line that calls
`bin/gws-run.mjs <id> -- <args>`; the runner resolves the credential set through the
same abstraction the wizard uses. The predecessor inlined the `security` call into the
generated wrapper, which was tolerable on macOS but would force a `.cmd` file to do
DPAPI decryption in batch script. Cryptography does not belong in batch.

`bin/gws-run.mjs` reads the account id from `argv[2]`, drops a literal `--` separator if
present, and forwards the rest with inherited stdio so output and exit codes pass
straight through.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/wrappers.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
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
  const st = await fs.stat(file)
  assert.ok((st.mode & 0o100) !== 0, 'must be executable')
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
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const accounts = await import(`../src/core/accounts.mjs?${Math.random()}`)
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })

  const { spawnSync } = await import('node:child_process')
  const runner = (await load()).runnerPath()
  const r = spawnSync(process.execPath,
    [runner, 'tony-terra-one-de', '--', 'gmail', 'users', 'getProfile', '--params', '{"userId":"me"}'],
    { env: process.env, encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /tony@terra-one\.de/)
  const calls = await box.calls()
  assert.deepEqual(calls.at(-1).args.slice(0, 3), ['gmail', 'users', 'getProfile'])
  assert.match(calls.at(-1).configDir, /tony-terra-one-de/)
  await box.cleanup()
})

test('the runner exits non-zero for an unknown account', async () => {
  const box = await sandbox({})
  const { spawnSync } = await import('node:child_process')
  const runner = (await load()).runnerPath()
  const r = spawnSync(process.execPath, [runner, 'nope', '--', 'gmail', 'users', 'getProfile'],
    { env: process.env, encoding: 'utf8' })
  assert.notEqual(r.status, 0)
  await box.cleanup()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wrappers.test.mjs`
Expected: FAIL — cannot find `../src/core/wrappers.mjs`

- [ ] **Step 3: Write `src/core/wrappers.mjs`**

```javascript
// One launcher per account. The launcher holds no secret and no logic - it
// hands off to bin/gws-run.mjs, which is the single place that turns a
// credential set into environment variables.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { binDir, ensureDir, platform } from './paths.mjs'

export function runnerPath () {
  return fileURLToPath(new URL('../../bin/gws-run.mjs', import.meta.url))
}

export function wrapperPath (id) {
  const suffix = platform() === 'win32' ? '.cmd' : ''
  return path.join(binDir(), `gws-${id}${suffix}`)
}

function posixBody (id, runner) {
  return `#!/usr/bin/env bash
# Generated by gws-connect. Do not edit.
# Runs the Google Workspace CLI as exactly one account: ${id}
exec "${process.execPath}" "${runner}" "${id}" -- "$@"
`
}

function windowsBody (id, runner) {
  return `@echo off
rem Generated by gws-connect. Do not edit.
rem Runs the Google Workspace CLI as exactly one account: ${id}
"${process.execPath}" "${runner}" "${id}" -- %*
`
}

export async function write (id) {
  await ensureDir(binDir())
  const file = wrapperPath(id)
  const runner = runnerPath()
  const win = platform() === 'win32'
  await fs.writeFile(file, win ? windowsBody(id, runner) : posixBody(id, runner), {
    mode: win ? 0o600 : 0o700
  })
  if (!win) await fs.chmod(file, 0o700)
  return file
}

export async function removeFor (id) {
  await fs.rm(path.join(binDir(), `gws-${id}`), { force: true })
  await fs.rm(path.join(binDir(), `gws-${id}.cmd`), { force: true })
}
```

- [ ] **Step 4: Write `bin/gws-run.mjs`**

```javascript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/wrappers.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/core/wrappers.mjs bin/gws-run.mjs tests/wrappers.test.mjs
git commit -m "$(printf 'feat: per-account wrappers delegating to one shared runner\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 10: Terminal UI and environment checks

**Files:**
- Create: `src/core/ui.mjs`, `src/core/env.mjs`
- Test: `tests/env.test.mjs`

**Interfaces:**
- Produces from `ui.mjs`:
  - `title(text)`, `ok(text)`, `warn(text)`, `fail(text)`, `info(text)`, `blank()`, `line(text)`
  - `async ask(question, {default: d} = {}): Promise<string>`
  - `async askSecret(question): Promise<string>` — no echo
  - `async confirm(question, {default: d = true} = {}): Promise<boolean>` — accepts `j/y/ja/yes` and `n/nein/no`, empty means the default
  - `async choose(question, options: {value, label, hint?}[]): Promise<value>` — numbered list, re-asks on junk
  - `async pause(): Promise<void>`
  - `async multiChoose(question, options, {preselected}): Promise<value[]>` — comma-separated numbers, empty means preselected
  - `clear()`
- Produces from `env.mjs`:
  - `NODE_MIN = 20`
  - `nodeVersion(): string`
  - `nodeOk(): boolean`
  - `packageManager(): Promise<'brew'|'winget'|'npm'|null>`
  - `async installGws(): Promise<boolean>`
  - `async reachable(url, timeoutMs): Promise<boolean>`

`confirm` accepts German and English affirmatives, because the same binary serves both
languages and a German user typing `j` at an English prompt should still work.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/env.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('nodeOk is true on the running interpreter', async () => {
  const env = await import('../src/core/env.mjs')
  assert.equal(env.NODE_MIN, 20)
  assert.match(env.nodeVersion(), /^v?\d+\./)
  assert.equal(env.nodeOk(), true)
})

test('packageManager returns a known value or null', async () => {
  const env = await import('../src/core/env.mjs')
  const pm = await env.packageManager()
  assert.ok(pm === null || ['brew', 'winget', 'npm'].includes(pm))
})

test('reachable is false for an unroutable address and does not throw', async () => {
  const env = await import('../src/core/env.mjs')
  assert.equal(await env.reachable('https://127.0.0.1:1/', 300), false)
})

test('confirm accepts German and English affirmatives', async () => {
  const ui = await import('../src/core/ui.mjs')
  assert.equal(ui.parseConfirm('j', true), true)
  assert.equal(ui.parseConfirm('ja', true), true)
  assert.equal(ui.parseConfirm('y', true), true)
  assert.equal(ui.parseConfirm('yes', true), true)
  assert.equal(ui.parseConfirm('n', true), false)
  assert.equal(ui.parseConfirm('nein', true), false)
  assert.equal(ui.parseConfirm('no', true), false)
  assert.equal(ui.parseConfirm('', true), true)
  assert.equal(ui.parseConfirm('', false), false)
  assert.equal(ui.parseConfirm('nonsense', false), false)
})

test('parseMultiChoice maps numbers to values and ignores junk', async () => {
  const ui = await import('../src/core/ui.mjs')
  const options = [{ value: 'gmail' }, { value: 'drive' }, { value: 'calendar' }]
  assert.deepEqual(ui.parseMultiChoice('1,3', options, ['gmail']), ['gmail', 'calendar'])
  assert.deepEqual(ui.parseMultiChoice(' 2 ', options, ['gmail']), ['drive'])
  assert.deepEqual(ui.parseMultiChoice('', options, ['gmail']), ['gmail'])
  assert.deepEqual(ui.parseMultiChoice('9,abc', options, ['gmail']), [])
})
```

`parseConfirm` and `parseMultiChoice` are exported as pure functions precisely so the
prompt logic is testable without a TTY. The interactive `confirm`/`multiChoose` are thin
wrappers over them.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/env.test.mjs`
Expected: FAIL — modules not found

- [ ] **Step 3: Write `src/core/ui.mjs`**

```javascript
// Everything the user sees. Text arrives already translated - this module
// never contains a sentence, only formatting.
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { t } from './i18n.mjs'

const colour = stdout.isTTY && !process.env.GWS_CONNECT_NO_COLOR && !process.env.NO_COLOR

const C = colour
  ? { reset: '[0m', bold: '[1m', dim: '[2m', red: '[31m', green: '[32m', yellow: '[33m', blue: '[34m' }
  : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '' }

export function clear () { if (stdout.isTTY) stdout.write('[2J[H') }
export function blank () { stdout.write('\n') }
export function line (text) { stdout.write(`${text}\n`) }
export function title (text) { stdout.write(`\n${C.bold}${C.blue}${text}${C.reset}\n\n`) }
export function ok (text) { stdout.write(`${C.green}  OK  ${C.reset} ${text}\n`) }
export function warn (text) { stdout.write(`${C.yellow}  !   ${C.reset} ${text}\n`) }
export function fail (text) { stdout.write(`${C.red} FEHL ${C.reset} ${text}\n`) }
export function info (text) { stdout.write(`       ${text}\n`) }
export function dim (text) { stdout.write(`${C.dim}       ${text}${C.reset}\n`) }

async function withReadline (fn) {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    return await fn(rl)
  } finally {
    rl.close()
  }
}

export async function ask (question, { default: d } = {}) {
  return withReadline(async (rl) => {
    const suffix = d ? ` ${C.dim}[${d}]${C.reset}` : ''
    const answer = (await rl.question(`${C.bold}${question}${C.reset}${suffix} `)).trim()
    return answer || d || ''
  })
}

export async function askSecret (question) {
  return withReadline(async (rl) => {
    const onKeypress = () => {
      readline.moveCursor(stdout, -1, 0)
      stdout.write(' ')
      readline.moveCursor(stdout, -1, 0)
    }
    stdin.on('data', onKeypress)
    try {
      const answer = await rl.question(`${C.bold}${question}${C.reset} `)
      stdout.write('\n')
      return answer.trim()
    } finally {
      stdin.off('data', onKeypress)
    }
  })
}

export function parseConfirm (raw, fallback) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === '') return fallback
  if (['j', 'ja', 'y', 'yes'].includes(value)) return true
  if (['n', 'nein', 'no'].includes(value)) return false
  return false
}

export async function confirm (question, { default: d = true } = {}) {
  const raw = await ask(`${question} ${t('common.yes_no')}`)
  return parseConfirm(raw, d)
}

export async function choose (question, options) {
  blank()
  line(`${C.bold}${question}${C.reset}`)
  options.forEach((o, i) => {
    const hint = o.hint ? `  ${C.dim}${o.hint}${C.reset}` : ''
    line(`  ${i + 1}  ${o.label}${hint}`)
  })
  blank()
  for (;;) {
    const raw = await ask(t('common.choice'))
    const index = Number.parseInt(raw, 10)
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      return options[index - 1].value
    }
    warn(t('menu.unknown_choice'))
  }
}

export function parseMultiChoice (raw, options, preselected) {
  const value = String(raw ?? '').trim()
  if (value === '') return [...preselected]
  const picked = []
  for (const part of value.split(',')) {
    const index = Number.parseInt(part.trim(), 10)
    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      const chosen = options[index - 1].value
      if (!picked.includes(chosen)) picked.push(chosen)
    }
  }
  return picked
}

export async function multiChoose (question, options, { preselected = [] } = {}) {
  blank()
  line(`${C.bold}${question}${C.reset}`)
  options.forEach((o, i) => {
    const mark = preselected.includes(o.value) ? '*' : ' '
    line(`  ${i + 1} ${mark} ${o.label}`)
  })
  blank()
  for (;;) {
    const picked = parseMultiChoice(await ask(t('common.choice')), options, preselected)
    if (picked.length > 0) return picked
    warn(t('menu.unknown_choice'))
  }
}

export async function pause () {
  await ask(t('common.press_enter'))
}
```

- [ ] **Step 4: Write `src/core/env.mjs`**

```javascript
// Environment detection and the one place that offers to install something.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { platform } from './paths.mjs'

const run = promisify(execFile)

export const NODE_MIN = 20

export function nodeVersion () { return process.version }

export function nodeOk () {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10)
  return Number.isInteger(major) && major >= NODE_MIN
}

async function have (bin) {
  try {
    await run(bin, ['--version'], { shell: platform() === 'win32' })
    return true
  } catch {
    return false
  }
}

export async function packageManager () {
  if (platform() === 'darwin' && await have('brew')) return 'brew'
  if (platform() === 'win32' && await have('winget')) return 'winget'
  if (await have('npm')) return 'npm'
  return null
}

export async function installGws () {
  const pm = await packageManager()
  const attempts = []
  if (pm === 'brew') attempts.push(['brew', ['install', 'googleworkspace-cli']])
  attempts.push(['npm', ['install', '-g', '@googleworkspace/cli']])

  for (const [bin, args] of attempts) {
    try {
      await run(bin, args, { shell: platform() === 'win32', maxBuffer: 32 * 1024 * 1024 })
      return true
    } catch { /* try the next one */ }
  }
  return false
}

export async function reachable (url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'manual' })
    return res.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/env.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/core/ui.mjs src/core/env.mjs tests/env.test.mjs
git commit -m "$(printf 'feat: terminal UI and environment detection\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 11: setup and add commands

**Files:**
- Create: `src/commands/setup.mjs`, `src/commands/add.mjs`
- Test: `tests/add.test.mjs`

**Interfaces:**
- Consumes: `credsets.*`, `accounts.*`, `accounttype.detect()`, `gws.*`, `wrappers.write()`, `ui.*`, `i18n.t()`
- Produces:
  - `async setupCommand({code} = {}): Promise<boolean>` — imports a code, prompting if not given
  - `async addCommand({email, credSet, services, interactive = true} = {}): Promise<Meta|null>`

`addCommand` in non-interactive mode (`interactive: false`) takes every value as an
argument, asks nothing, and returns `null` on any failure. That is the mode the tests
drive; the menu uses the interactive path.

The order inside `addCommand` is load-bearing and each early return is a guard the
predecessor learned the hard way:

1. no credential set → error, stop
2. bad email → error, stop
3. **email already connected → stop before any browser opens**
4. detect type, pick credential set, pick services
5. announce the consent screen *before* opening the browser
6. `login`
7. `identity` — **on mismatch, `logout` and do not record the account**
8. probe each service
9. `accounts.create` then `wrappers.write`

An account is only ever written to disk after the identity matches. A failed attempt
leaves nothing behind.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/add.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'
import { encode } from '../src/core/setupcode.mjs'

async function loadAll () {
  const stamp = Math.random()
  const i18n = await import(`../src/core/i18n.mjs?${stamp}`)
  await i18n.initI18n('en')
  return {
    setup: await import(`../src/commands/setup.mjs?${stamp}`),
    add: await import(`../src/commands/add.mjs?${stamp}`),
    accounts: await import(`../src/core/accounts.mjs?${stamp}`),
    credsets: await import(`../src/core/credsets.mjs?${stamp}`)
  }
}

const CODE = encode({
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'GOCSPX-secret'
})

test('setupCommand imports a code non-interactively', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await loadAll()
  assert.equal(await setup.setupCommand({ code: CODE }), true)
  assert.equal((await credsets.get('default')).label, 'Terra One')
  await box.cleanup()
})

test('setupCommand reports a bad code and stores nothing', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await loadAll()
  assert.equal(await setup.setupCommand({ code: 'GWSC1.00000000.bm9wZQ' }), false)
  assert.deepEqual(await credsets.list(), [])
  await box.cleanup()
})

test('add connects an account, verifies identity, writes meta and a wrapper', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  const meta = await add.addCommand({
    email: 'tony@terra-one.de',
    credSet: 'default',
    services: ['gmail', 'drive', 'calendar'],
    interactive: false
  })
  assert.ok(meta)
  assert.equal(meta.email, 'tony@terra-one.de')
  assert.equal((await accounts.list()).length, 1)

  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 2), ['auth', 'login'])
  await box.cleanup()
})

test('add refuses a duplicate before opening a browser', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { add } = await loadAll()
  await add.addCommand({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false })
  const callsBefore = (await box.calls()).length
  const second = await add.addCommand({ email: 'TONY@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false })
  assert.equal(second, null)
  assert.equal((await box.calls()).length, callsBefore, 'no gws call for a duplicate')
  await box.cleanup()
})

test('add rejects a wrong account, logs out and records nothing', async () => {
  const box = await sandbox({ identity: 'someone-else@x.de' })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  const meta = await add.addCommand({
    email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false
  })
  assert.equal(meta, null)
  assert.deepEqual(await accounts.list(), [])
  const calls = await box.calls()
  assert.ok(calls.some(c => c.args.join(' ') === 'auth logout'), 'must log out after a mismatch')
  await box.cleanup()
})

test('add stops when login itself fails', async () => {
  const box = await sandbox({ loginFails: true })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  assert.equal(await add.addCommand({
    email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false
  }), null)
  assert.deepEqual(await accounts.list(), [])
  await box.cleanup()
})

test('add refuses without a credential set', async () => {
  const box = await sandbox({})
  const { add } = await loadAll()
  assert.equal(await add.addCommand({
    email: 'tony@terra-one.de', services: ['gmail'], interactive: false
  }), null)
  await box.cleanup()
})

test('add refuses a malformed address', async () => {
  const box = await sandbox({})
  await seedCredSet()
  const { add } = await loadAll()
  assert.equal(await add.addCommand({ email: 'nonsense', credSet: 'default', services: ['gmail'], interactive: false }), null)
  await box.cleanup()
})

test('add records the account even when one service API is off', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de', driveFails: true })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  const meta = await add.addCommand({
    email: 'tony@terra-one.de', credSet: 'default',
    services: ['gmail', 'drive'], interactive: false
  })
  assert.ok(meta, 'identity matched, so the account is usable for what does work')
  assert.equal((await accounts.list()).length, 1)
  await box.cleanup()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/add.test.mjs`
Expected: FAIL — cannot find `../src/commands/setup.mjs`

- [ ] **Step 3: Write `src/commands/setup.mjs`**

```javascript
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as credsets from '../core/credsets.mjs'

export async function setupCommand ({ code } = {}) {
  ui.title(t('setup.title'))

  let value = code
  if (!value) {
    ui.info(t('setup.need_code'))
    ui.warn(t('setup.code_is_secret'))
    ui.blank()
    value = await ui.ask(t('setup.code_prompt'))
  }
  if (!value) {
    ui.fail(t('err.aborted'))
    return false
  }

  try {
    const set = await credsets.importCode(value)
    ui.ok(t('setup.imported', { label: set.label }))
    ui.dim(t('setup.code_discarded'))
    ui.blank()
    ui.info(t('setup.next'))
    return true
  } catch (error) {
    // CodeError carries the exact i18n key for what was wrong with the paste.
    ui.fail(t(error.messageKey || 'err.code_json'))
    return false
  }
}
```

- [ ] **Step 4: Write `src/commands/add.mjs`**

```javascript
// The order of the guards in here is the whole value of this command.
// Nothing is written to disk until Google confirms the expected address.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as credsets from '../core/credsets.mjs'
import * as gws from '../core/gws.mjs'
import * as wrappers from '../core/wrappers.mjs'
import { detect } from '../core/accounttype.mjs'

const SERVICE_LABEL = { gmail: 'service.gmail', drive: 'service.drive', calendar: 'service.calendar' }
const SERVICE_API = { gmail: 'service.gmail_api', drive: 'service.drive_api', calendar: 'service.calendar_api' }

async function pickCredSet (sets, interactive) {
  if (sets.length === 1) return sets[0].id
  if (!interactive) return sets[0].id
  return ui.choose(t('add.pick_credset'), sets.map(s => ({ value: s.id, label: s.label })))
}

async function pickServices (interactive) {
  if (!interactive) return [...accounts.SERVICES]
  ui.info(t('add.services_default'))
  return ui.multiChoose(
    t('add.pick_services'),
    accounts.SERVICES.map(s => ({ value: s, label: t(SERVICE_LABEL[s]) })),
    { preselected: [...accounts.SERVICES] }
  )
}

export async function addCommand ({ email, credSet, services, interactive = true } = {}) {
  ui.title(t('add.title'))

  const sets = await credsets.list()
  if (sets.length === 0) {
    ui.fail(t('err.no_credsets'))
    return null
  }

  let address = email
  if (!address && interactive) {
    ui.info(t('add.which_email'))
    address = await ui.ask(t('common.email_prompt'))
  }
  if (!accounts.isEmail(address)) {
    ui.fail(t('err.bad_email', { value: address ?? '' }))
    return null
  }
  address = String(address).trim()

  // Before anything opens a browser: is this already connected?
  if (await accounts.findByEmail(address)) {
    ui.warn(t('add.duplicate', { email: address }))
    return null
  }

  const { type, domain } = await detect(address)
  if (type === 'privat') ui.info(t('add.type_private', { domain }))
  else if (type === 'workspace') ui.info(t('add.type_workspace', { domain }))
  else ui.warn(t('add.type_unknown', { domain }))

  const chosenSet = credSet || await pickCredSet(sets, interactive)
  const chosenServices = services && services.length ? [...services] : await pickServices(interactive)

  const id = accounts.idFromEmail(address)

  if (interactive) {
    ui.blank()
    ui.warn(t('add.logout_first'))
    ui.dim(t('add.logout_why'))
    ui.blank()
    ui.info(t('add.browser_opens'))
    ui.info(t('add.choose_account', { email: address }))
    ui.info(t('add.readonly_note'))
    ui.blank()
    ui.warn(t('add.unverified_warning'))
    ui.dim(t('add.unverified_normal'))
    await ui.pause()
  }

  if (!await gws.login(id, chosenSet, chosenServices)) {
    ui.fail(t('add.login_failed'))
    return null
  }

  ui.blank()
  ui.info(t('add.checking'))
  const actual = await gws.identity(id, chosenSet, chosenServices)

  if (!actual) {
    ui.fail(t('add.no_identity'))
    await gws.logout(id, chosenSet)
    return null
  }
  if (actual.toLowerCase() !== address.toLowerCase()) {
    ui.fail(t('add.wrong_account', { actual, expected: address }))
    ui.info(t('add.wrong_account_fix'))
    await gws.logout(id, chosenSet)
    return null
  }
  ui.ok(t('add.connected', { email: actual }))

  for (const service of chosenServices) {
    if (await gws.probe(id, chosenSet, service)) {
      ui.ok(t('add.service_ok', { service: t(SERVICE_LABEL[service]) }))
    } else {
      ui.warn(t('add.service_fail', {
        service: t(SERVICE_LABEL[service]),
        api: t(SERVICE_API[service])
      }))
    }
  }

  const meta = await accounts.create({
    email: address,
    credSet: chosenSet,
    services: chosenServices,
    accountType: type
  })
  const wrapper = await wrappers.write(meta.id)

  ui.blank()
  ui.ok(t('add.done', { email: address, wrapper }))
  return meta
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/add.test.mjs`
Expected: PASS, 9 tests

- [ ] **Step 6: Commit**

```bash
git add src/commands/setup.mjs src/commands/add.mjs tests/add.test.mjs
git commit -m "$(printf 'feat: setup and add commands with guards before the browser opens\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 12: list, verify, remove, doctor and credsets commands

**Files:**
- Create: `src/commands/list.mjs`, `src/commands/verify.mjs`, `src/commands/remove.mjs`, `src/commands/doctor.mjs`, `src/commands/credsets.mjs`
- Test: `tests/verify.test.mjs`, `tests/remove.test.mjs`

**Interfaces:**
- Consumes: `accounts.*`, `credsets.*`, `gws.*`, `wrappers.removeFor()`, `staleness.*`, `env.*`, `secrets.backend()`, `ui.*`, `i18n.t()`
- Produces:
  - `async listCommand(): Promise<{total: number, usable: number}>`
  - `async verifyCommand({email, now = new Date()} = {}): Promise<{ok: number, total: number}>` — on success calls `accounts.markVerified(id, now)`
  - `async removeCommand({email, force = false} = {}): Promise<boolean>`
  - `async doctorCommand(): Promise<{problems: number, warnings: number}>`
  - `async credsetsCommand({code, id, label, audience, client_id, client_secret, interactive = true} = {}): Promise<CredSet|null>`

`verifyCommand` marks an account verified **only** when the identity still matches and
every selected service answers. A partial success is not proof, because the 7-day
cutoff kills the whole grant at once — a half-working account means something else is
wrong and must not silence the nag.

`removeCommand` revokes before deleting, and deletes even if the revoke fails. Deleting
the files alone would leave a live refresh token at Google that nobody can see, check
or withdraw.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/verify.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

async function loadAll () {
  const stamp = Math.random()
  const i18n = await import(`../src/core/i18n.mjs?${stamp}`)
  await i18n.initI18n('en')
  return {
    verify: await import(`../src/commands/verify.mjs?${stamp}`),
    list: await import(`../src/commands/list.mjs?${stamp}`),
    accounts: await import(`../src/core/accounts.mjs?${stamp}`)
  }
}

test('verify marks a healthy account verified', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail', 'drive'], accountType: 'workspace' })

  const when = new Date('2026-09-20T09:00:00.000Z')
  const r = await verify.verifyCommand({ now: when })
  assert.deepEqual(r, { ok: 1, total: 1 })
  assert.equal((await accounts.get('tony-terra-one-de')).verifiedAt, when.toISOString())
  await box.cleanup()
})

test('verify does not mark an account whose identity no longer matches', async () => {
  const box = await sandbox({ identity: 'stranger@x.de' })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  const r = await verify.verifyCommand({})
  assert.equal(r.ok, 0)
  assert.equal((await accounts.get('tony-terra-one-de')).verifiedAt, null)
  await box.cleanup()
})

test('a partial success is not proof', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de', driveFails: true })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail', 'drive'], accountType: 'workspace' })
  const r = await verify.verifyCommand({})
  assert.equal(r.ok, 0)
  assert.equal((await accounts.get('tony-terra-one-de')).verifiedAt, null)
  await box.cleanup()
})

test('verify can target a single address', async () => {
  const box = await sandbox({ identity: 'a@a.de' })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'a@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  await accounts.create({ email: 'b@b.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  const r = await verify.verifyCommand({ email: 'a@a.de' })
  assert.equal(r.total, 1)
  assert.ok((await accounts.get('a-a-de')).verifiedAt)
  assert.equal((await accounts.get('b-b-de')).verifiedAt, null)
  await box.cleanup()
})

test('verify on an empty machine reports nothing to do', async () => {
  const box = await sandbox({})
  const { verify } = await loadAll()
  assert.deepEqual(await verify.verifyCommand({}), { ok: 0, total: 0 })
  await box.cleanup()
})

test('list counts usable accounts', async () => {
  const box = await sandbox({ identity: 'a@a.de' })
  await seedCredSet()
  const { list, accounts } = await loadAll()
  await accounts.create({ email: 'a@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  const r = await list.listCommand()
  assert.equal(r.total, 1)
  await box.cleanup()
})
```

```javascript
// tests/remove.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

async function loadAll () {
  const stamp = Math.random()
  const i18n = await import(`../src/core/i18n.mjs?${stamp}`)
  await i18n.initI18n('en')
  return {
    remove: await import(`../src/commands/remove.mjs?${stamp}`),
    accounts: await import(`../src/core/accounts.mjs?${stamp}`),
    wrappers: await import(`../src/core/wrappers.mjs?${stamp}`)
  }
}

test('remove revokes at Google BEFORE deleting the files', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { remove, accounts, wrappers } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  const wrapper = await wrappers.write('tony-terra-one-de')

  assert.equal(await remove.removeCommand({ email: 'tony@terra-one.de', force: true }), true)

  const calls = await box.calls()
  assert.ok(calls.some(c => c.args.join(' ') === 'auth logout'), 'must revoke')
  assert.equal(await accounts.get('tony-terra-one-de'), null)
  await assert.rejects(() => fs.stat(wrapper))
  await box.cleanup()
})

test('remove still deletes when the revoke fails, and says so', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de', logoutFails: true })
  await seedCredSet()
  const { remove, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  assert.equal(await remove.removeCommand({ email: 'tony@terra-one.de', force: true }), true)
  assert.equal(await accounts.get('tony-terra-one-de'), null)
  await box.cleanup()
})

test('remove reports an unknown address', async () => {
  const box = await sandbox({})
  const { remove } = await loadAll()
  assert.equal(await remove.removeCommand({ email: 'nobody@x.de', force: true }), false)
  await box.cleanup()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/verify.test.mjs tests/remove.test.mjs`
Expected: FAIL — command modules not found

- [ ] **Step 3: Write `src/commands/list.mjs`**

```javascript
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as credsets from '../core/credsets.mjs'
import * as wrappers from '../core/wrappers.mjs'
import { isProven } from '../core/staleness.mjs'

function date (iso) {
  if (!iso) return t('common.never')
  return new Date(iso).toISOString().slice(0, 10)
}

export async function listCommand () {
  ui.title(t('list.title'))

  const all = await accounts.list()
  if (all.length === 0) {
    ui.info(t('list.empty'))
    ui.info(t('list.empty_next'))
    return { total: 0, usable: 0 }
  }

  const sets = await credsets.list()
  const labelOf = (id) => sets.find(s => s.id === id)?.label || id
  let usable = 0

  for (const meta of all) {
    ui.line(meta.email)
    ui.dim(t('list.services', { services: meta.services.join(', ') }))
    ui.dim(t('list.credset', { label: labelOf(meta.credSet) }))
    ui.dim(t('list.connected_at', { date: date(meta.connectedAt) }))
    if (isProven(meta)) {
      ui.ok(t('stale.proven'))
      usable += 1
    } else if (meta.verifiedAt) {
      ui.dim(t('list.verified_at', { date: date(meta.verifiedAt) }))
      ui.warn(t('list.not_verified'))
      usable += 1
    } else {
      ui.warn(t('list.not_verified'))
      usable += 1
    }
    ui.dim(wrappers.wrapperPath(meta.id))
    ui.blank()
  }

  ui.info(t('list.summary', { usable, total: all.length }))
  return { total: all.length, usable }
}
```

- [ ] **Step 4: Write `src/commands/verify.mjs`**

```javascript
// The real check. Nothing here trusts a stored value - every answer comes
// from Google. Only a fully healthy account is marked verified, because the
// 7-day cutoff removes the whole grant at once: a half-working account means
// something else is broken and must not silence the reminder.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as gws from '../core/gws.mjs'

const SERVICE_LABEL = { gmail: 'service.gmail', drive: 'service.drive', calendar: 'service.calendar' }
const SERVICE_API = { gmail: 'service.gmail_api', drive: 'service.drive_api', calendar: 'service.calendar_api' }

export async function verifyCommand ({ email, now = new Date() } = {}) {
  ui.title(t('verify.title'))

  let targets = await accounts.list()
  if (email) targets = targets.filter(a => a.email.toLowerCase() === String(email).toLowerCase())

  if (targets.length === 0) {
    ui.info(t('verify.none'))
    return { ok: 0, total: 0 }
  }

  let ok = 0
  for (const meta of targets) {
    ui.info(t('verify.checking', { email: meta.email }))

    const actual = await gws.identity(meta.id, meta.credSet, meta.services)
    if (!actual) {
      ui.fail(t('verify.no_access', { email: meta.email }))
      ui.info(t('verify.no_access_why'))
      ui.info(t('verify.publishing_hint'))
      ui.info(t('verify.admin_hint'))
      ui.blank()
      continue
    }
    if (actual.toLowerCase() !== meta.email.toLowerCase()) {
      ui.fail(t('add.wrong_account', { actual, expected: meta.email }))
      ui.blank()
      continue
    }

    let allServices = true
    for (const service of meta.services) {
      if (await gws.probe(meta.id, meta.credSet, service)) {
        ui.ok(t('add.service_ok', { service: t(SERVICE_LABEL[service]) }))
      } else {
        allServices = false
        ui.fail(t('add.service_fail', {
          service: t(SERVICE_LABEL[service]),
          api: t(SERVICE_API[service])
        }))
      }
    }

    if (allServices) {
      await accounts.markVerified(meta.id, now)
      ui.ok(t('verify.ok', { email: meta.email }))
      ok += 1
    }
    ui.blank()
  }

  ui.info(t('verify.summary', { ok, total: targets.length }))
  return { ok, total: targets.length }
}
```

- [ ] **Step 5: Write `src/commands/remove.mjs`**

```javascript
// Revoke first, delete second. Deleting only the files would leave a live
// refresh token at Google that nobody can see, check or withdraw.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as gws from '../core/gws.mjs'
import * as wrappers from '../core/wrappers.mjs'

export async function removeCommand ({ email, force = false } = {}) {
  ui.title(t('remove.title'))

  const all = await accounts.list()
  if (all.length === 0) {
    ui.info(t('list.empty'))
    return false
  }

  let target = null
  if (email) {
    target = all.find(a => a.email.toLowerCase() === String(email).toLowerCase()) || null
    if (!target) {
      ui.fail(t('err.no_such_account', { email }))
      return false
    }
  } else {
    const id = await ui.choose(t('remove.which'), all.map(a => ({ value: a.id, label: a.email })))
    target = all.find(a => a.id === id)
  }

  if (!force && !await ui.confirm(t('remove.confirm', { email: target.email }), { default: false })) {
    ui.info(t('remove.aborted'))
    return false
  }

  ui.info(t('remove.revoking'))
  if (await gws.logout(target.id, target.credSet)) {
    ui.ok(t('remove.revoked'))
  } else {
    ui.warn(t('remove.revoke_failed'))
    ui.info(t('remove.revoke_manual'))
  }

  await wrappers.removeFor(target.id)
  await accounts.remove(target.id)
  ui.ok(t('remove.deleted', { email: target.email }))
  return true
}
```

- [ ] **Step 6: Write `src/commands/doctor.mjs`**

```javascript
import fs from 'node:fs/promises'
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as env from '../core/env.mjs'
import * as credsets from '../core/credsets.mjs'
import * as gws from '../core/gws.mjs'
import { backend } from '../core/secrets/index.mjs'
import { homeDir, ensureDir } from '../core/paths.mjs'

export async function doctorCommand () {
  ui.title(t('doctor.title'))

  let problems = 0
  let warnings = 0

  if (env.nodeOk()) {
    ui.ok(t('doctor.node_ok', { version: env.nodeVersion() }))
  } else {
    ui.fail(t('doctor.node_old', { version: env.nodeVersion() }))
    ui.info(t('doctor.node_install'))
    problems += 1
  }

  const cli = await gws.installed()
  if (cli.ok) {
    ui.ok(t('doctor.gws_ok', { version: cli.version }))
  } else {
    ui.warn(t('doctor.gws_missing'))
    if (await ui.confirm(t('doctor.gws_install_offer'))) {
      ui.info(t('doctor.gws_installing'))
      if (await env.installGws() && (await gws.installed()).ok) {
        ui.ok(t('doctor.gws_ok', { version: (await gws.installed()).version }))
      } else {
        ui.fail(t('doctor.gws_install_failed'))
        ui.info(t('doctor.gws_install_manual'))
        problems += 1
      }
    } else {
      problems += 1
    }
  }

  const store = await backend()
  if (await store.selfTest()) {
    ui.ok(t('doctor.secrets_ok', { backend: store.name }))
  } else {
    ui.fail(t('doctor.secrets_fail', { backend: store.name }))
    problems += 1
  }

  try {
    await ensureDir(homeDir())
    await fs.access(homeDir())
    ui.ok(t('doctor.state_ok', { dir: homeDir() }))
  } catch {
    ui.fail(t('doctor.state_fail', { dir: homeDir() }))
    problems += 1
  }

  const sets = await credsets.list()
  if (sets.length === 0) {
    ui.warn(t('doctor.creds_missing'))
    warnings += 1
  } else {
    for (const set of sets) ui.ok(t('doctor.creds_ok', { label: set.label }))
  }

  if (await env.reachable('https://accounts.google.com', 8000)) {
    ui.ok(t('doctor.net_ok'))
  } else {
    ui.warn(t('doctor.net_fail'))
    warnings += 1
  }

  ui.blank()
  if (problems > 0) ui.fail(t('doctor.problems', { count: problems }))
  else if (warnings > 0) ui.warn(t('doctor.warnings', { count: warnings }))
  else ui.ok(t('doctor.all_good'))

  return { problems, warnings }
}
```

- [ ] **Step 7: Write `src/commands/credsets.mjs`**

```javascript
// The escape hatch: a second Cloud project for the case that a foreign
// Workspace administrator blocks the shared unverified app, or the 100-user
// limit is reached.
import { t, currentLang } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as credsets from '../core/credsets.mjs'

export async function credsetsCommand (opts = {}) {
  const { interactive = true } = opts
  ui.title(t('credsets.title'))
  ui.info(t('credsets.when'))
  ui.dim(t('credsets.guide', { lang: currentLang() }))
  ui.blank()

  if (opts.code) {
    try {
      const set = await credsets.importCode(opts.code)
      ui.ok(t('credsets.saved', { label: set.label }))
      return set
    } catch (error) {
      ui.fail(t(error.messageKey || 'err.code_json'))
      return null
    }
  }

  if (opts.client_id && opts.client_secret) {
    const id = opts.id || 'own'
    if (await credsets.exists(id)) {
      ui.fail(t('credsets.exists'))
      return null
    }
    const set = await credsets.saveManual({
      id,
      label: opts.label || id,
      audience: opts.audience || 'internal',
      client_id: opts.client_id,
      client_secret: opts.client_secret
    })
    ui.ok(t('credsets.saved', { label: set.label }))
    return set
  }

  if (!interactive) return null

  const how = await ui.choose(t('credsets.how'), [
    { value: 'code', label: t('credsets.by_code') },
    { value: 'hand', label: t('credsets.by_hand') }
  ])

  if (how === 'code') {
    const code = await ui.ask(t('setup.code_prompt'))
    return credsetsCommand({ code })
  }

  const label = await ui.ask(t('credsets.label_prompt'), { default: 'own' })
  const client_id = await ui.ask(t('credsets.client_id_prompt'))
  if (!client_id.endsWith('.apps.googleusercontent.com')) {
    ui.fail(t('err.code_client_id'))
    return null
  }
  const client_secret = await ui.askSecret(t('credsets.client_secret_prompt'))
  if (!client_secret) {
    ui.fail(t('err.aborted'))
    return null
  }
  const audience = await ui.choose(t('credsets.audience_prompt'), [
    { value: 'internal', label: 'Internal' },
    { value: 'external', label: 'External' }
  ])

  return credsetsCommand({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'own',
    label,
    audience,
    client_id,
    client_secret,
    interactive: false
  })
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test tests/verify.test.mjs tests/remove.test.mjs`
Expected: PASS, 9 tests

- [ ] **Step 9: Commit**

```bash
git add src/commands tests/verify.test.mjs tests/remove.test.mjs
git commit -m "$(printf 'feat: list, verify, remove, doctor and credential-set commands\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 13: Menu, entry point and double-click starters

**Files:**
- Create: `src/menu.mjs`, `bin/gws-connect.mjs`, `Start-Mac.command`, `Start-Windows.cmd`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: every command, `staleness.staleAccounts()`, `i18n.*`, `ui.*`, `env.nodeOk()`
- Produces:
  - `async menu(): Promise<void>` — the loop
  - `parseArgs(argv: string[]): {command: string|null, positional: string[], flags: Record<string,string|true>}`
  - `async main(argv): Promise<number>` — exit code

`main` refuses to run at all on Node below 20, with the version in the message. That
check must not depend on any syntax newer than the floor it is testing for, so
`bin/gws-connect.mjs` does it before importing anything else.

The menu prints the stale-account nag **before** the menu body on every pass, and
offers to run the check straight away.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/cli.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'
import { encode } from '../src/core/setupcode.mjs'

const CLI = fileURLToPath(new URL('../bin/gws-connect.mjs', import.meta.url))

function cli (args) {
  return spawnSync(process.execPath, [CLI, ...args], { env: process.env, encoding: 'utf8' })
}

test('parseArgs splits command, positionals and flags', async () => {
  const { parseArgs } = await import('../src/menu.mjs')
  assert.deepEqual(parseArgs(['add', 'a@b.de']), { command: 'add', positional: ['a@b.de'], flags: {} })
  assert.deepEqual(parseArgs(['setup', '--code', 'X']), { command: 'setup', positional: [], flags: { code: 'X' } })
  assert.deepEqual(parseArgs(['--lang', 'de']), { command: null, positional: [], flags: { lang: 'de' } })
  assert.deepEqual(parseArgs(['list', '--force']), { command: 'list', positional: [], flags: { force: true } })
  assert.deepEqual(parseArgs([]), { command: null, positional: [], flags: {} })
})

test('--help exits zero and names the commands', async () => {
  const box = await sandbox({})
  const r = cli(['--help'])
  assert.equal(r.status, 0)
  for (const word of ['setup', 'add', 'list', 'verify', 'remove', 'doctor']) {
    assert.match(r.stdout, new RegExp(word))
  }
  await box.cleanup()
})

test('list on a fresh machine exits zero and says it is empty', async () => {
  const box = await sandbox({})
  const r = cli(['list', '--lang', 'en'])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /No account connected yet/)
  await box.cleanup()
})

test('setup then add then list works end to end', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  const code = encode({
    id: 'default', label: 'Terra One', audience: 'external',
    client_id: '123-abc.apps.googleusercontent.com', client_secret: 'GOCSPX-secret'
  })
  assert.equal(cli(['setup', '--code', code, '--lang', 'en']).status, 0)
  const add = cli(['add', 'tony@terra-one.de', '--lang', 'en', '--yes'])
  assert.equal(add.status, 0, add.stderr)
  assert.match(add.stdout, /Connected as tony@terra-one\.de/)
  const list = cli(['list', '--lang', 'en'])
  assert.match(list.stdout, /tony@terra-one\.de/)
  await box.cleanup()
})

test('add exits non-zero when the wrong account answers', async () => {
  const box = await sandbox({ identity: 'stranger@x.de' })
  await seedCredSet()
  const r = cli(['add', 'tony@terra-one.de', '--lang', 'en', '--yes'])
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /WRONG account/)
  await box.cleanup()
})

test('an unknown command exits non-zero', async () => {
  const box = await sandbox({})
  const r = cli(['nonsense'])
  assert.notEqual(r.status, 0)
  await box.cleanup()
})

test('remove exits non-zero for an unknown address', async () => {
  const box = await sandbox({})
  const r = cli(['remove', 'nobody@x.de', '--lang', 'en', '--yes'])
  assert.notEqual(r.status, 0)
  await box.cleanup()
})
```

`--yes` is the non-interactive switch: it means "ask nothing, take the defaults". It is
what makes the CLI testable without a TTY, and it maps to `interactive: false` on the
commands.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cli.test.mjs`
Expected: FAIL — cannot find `../src/menu.mjs`

- [ ] **Step 3: Write `src/menu.mjs`**

```javascript
import { t, initI18n, setLang, detectLang, LANGS, currentLang } from './core/i18n.mjs'
import * as ui from './core/ui.mjs'
import * as accounts from './core/accounts.mjs'
import { staleAccounts } from './core/staleness.mjs'
import { setupCommand } from './commands/setup.mjs'
import { addCommand } from './commands/add.mjs'
import { listCommand } from './commands/list.mjs'
import { verifyCommand } from './commands/verify.mjs'
import { removeCommand } from './commands/remove.mjs'
import { doctorCommand } from './commands/doctor.mjs'
import { credsetsCommand } from './commands/credsets.mjs'

export function parseArgs (argv) {
  const flags = {}
  const positional = []
  let command = null

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[name] = next
        i += 1
      } else {
        flags[name] = true
      }
    } else if (command === null) {
      command = arg
    } else {
      positional.push(arg)
    }
  }
  return { command, positional, flags }
}

// The reminder that replaces a hand-written calendar entry. A misconfigured
// Cloud project cuts access after exactly 7 days, and nothing else would
// notice.
async function staleNag () {
  const stale = staleAccounts(await accounts.list())
  if (stale.length === 0) return
  ui.blank()
  ui.warn(t('stale.heading'))
  ui.info(t('stale.body', { count: stale.length }))
  ui.dim(t('stale.why'))
  if (await ui.confirm(t('stale.offer'), { default: true })) {
    await verifyCommand({})
    await ui.pause()
  }
}

export async function menu () {
  for (;;) {
    ui.clear()
    ui.title(t('menu.title'))
    await staleNag()

    ui.line(`  1  ${t('menu.add')}`)
    ui.line(`  2  ${t('menu.list')}`)
    ui.line(`  3  ${t('menu.verify')}`)
    ui.line(`  4  ${t('menu.remove')}`)
    ui.line(`  5  ${t('menu.doctor')}`)
    ui.line(`  6  ${t('menu.credsets')}`)
    ui.dim(`     ${t('menu.credsets_hint')}`)
    ui.line(`  7  ${t('menu.lang')}`)
    ui.line(`  q  ${t('common.quit')}`)
    ui.blank()

    const choice = (await ui.ask(t('common.choice'))).toLowerCase()
    ui.blank()

    switch (choice) {
      case '1': await addCommand({}); await ui.pause(); break
      case '2': await listCommand(); await ui.pause(); break
      case '3': await verifyCommand({}); await ui.pause(); break
      case '4': await removeCommand({}); await ui.pause(); break
      case '5': await doctorCommand(); await ui.pause(); break
      case '6': await credsetsCommand({}); await ui.pause(); break
      case '7': {
        const lang = await ui.choose(t('menu.lang'), LANGS.map(l => ({ value: l, label: l })))
        await setLang(lang)
        await initI18n(lang)
        break
      }
      case 'q': return
      default: ui.warn(t('menu.unknown_choice')); await ui.pause()
    }
  }
}

export async function main (argv) {
  const { command, positional, flags } = parseArgs(argv)

  const lang = typeof flags.lang === 'string' ? flags.lang : detectLang()
  await initI18n(lang)
  if (typeof flags.lang === 'string' && LANGS.includes(flags.lang)) await setLang(flags.lang)

  const interactive = !flags.yes
  const force = Boolean(flags.yes || flags.force)

  if (flags.help || command === 'help') {
    ui.title(t('menu.title'))
    ui.line('  gws-connect                       ' + t('menu.title'))
    ui.line('  gws-connect setup --code <code>   ' + t('setup.title'))
    ui.line('  gws-connect add <email>           ' + t('menu.add'))
    ui.line('  gws-connect list                  ' + t('menu.list'))
    ui.line('  gws-connect verify [<email>]      ' + t('menu.verify'))
    ui.line('  gws-connect remove <email>        ' + t('menu.remove'))
    ui.line('  gws-connect doctor                ' + t('menu.doctor'))
    ui.line('  gws-connect --lang de|en          ' + t('menu.lang'))
    return 0
  }

  switch (command) {
    case null:
      await menu()
      return 0
    case 'setup':
      return await setupCommand({ code: typeof flags.code === 'string' ? flags.code : undefined }) ? 0 : 1
    case 'add': {
      const meta = await addCommand({
        email: positional[0],
        credSet: typeof flags.credset === 'string' ? flags.credset : undefined,
        services: typeof flags.services === 'string' ? flags.services.split(',') : undefined,
        interactive
      })
      return meta ? 0 : 1
    }
    case 'list':
      await listCommand()
      return 0
    case 'verify': {
      const r = await verifyCommand({ email: positional[0] })
      return r.total > 0 && r.ok === r.total ? 0 : (r.total === 0 ? 0 : 1)
    }
    case 'remove':
      return await removeCommand({ email: positional[0], force }) ? 0 : 1
    case 'doctor': {
      const r = await doctorCommand()
      return r.problems > 0 ? 1 : 0
    }
    case 'credentials':
    case 'credset':
      return await credsetsCommand({
        code: typeof flags.code === 'string' ? flags.code : undefined,
        interactive
      }) ? 0 : 1
    default:
      ui.fail(t('menu.unknown_choice'))
      return 2
  }
}
```

- [ ] **Step 4: Write `bin/gws-connect.mjs`**

```javascript
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
```

- [ ] **Step 5: Write the double-click starters**

`Start-Mac.command`:

```bash
#!/usr/bin/env bash
# Double-click starter for macOS. If Gatekeeper complains the first time:
# right-click -> Open -> Open.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt / Node.js is missing."
  echo "Bitte die LTS-Version installieren / please install the LTS version:"
  echo "  https://nodejs.org"
  echo
  read -r -p "Enter zum Beenden / Enter to quit "
  exit 1
fi

node ./bin/gws-connect.mjs "$@"
status=$?
echo
read -r -p "Enter zum Beenden / Enter to quit "
exit $status
```

`Start-Windows.cmd`:

```bat
@echo off
rem Double-click starter for Windows.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt / Node.js is missing.
  echo Bitte die LTS-Version installieren / please install the LTS version:
  echo    https://nodejs.org
  echo.
  pause
  exit /b 1
)

node .\bin\gws-connect.mjs %*
echo.
pause
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/cli.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 7: Make the starters executable and commit**

```bash
chmod +x Start-Mac.command bin/gws-connect.mjs bin/gws-run.mjs
git add src/menu.mjs bin/gws-connect.mjs Start-Mac.command Start-Windows.cmd tests/cli.test.mjs
git commit -m "$(printf 'feat: menu, CLI entry point and double-click starters\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 14: Claude skill, operator tool and documentation

**Files:**
- Create: `skills/gws-konten/SKILL.md`, `skills/examples/belege-finden/SKILL.md`, `skills/examples/termine-finden/SKILL.md`, `tools/make-setup-code.mjs`, `docs/de/*.md`, `docs/en/*.md`, `README.md`
- Test: `tests/docs.test.mjs`

**Interfaces:**
- `tools/make-setup-code.mjs` is a standalone script: reads `--id`, `--label`, `--audience`, `--client-id`, `--client-secret`, prints the code. It imports `src/core/setupcode.mjs` so the format can never drift between generator and consumer.

Documents to write, in both `docs/de/` and `docs/en/`:

| File | Audience | Content |
|---|---|---|
| `ANLEITUNG.md` / `GUIDE.md` | the end user | download, unzip, double-click, paste the code, add accounts, what the consent screen looks like |
| `ADMIN-CLOUD-PROJEKT.md` | the operator | the checklist: three APIs on, Audience External, scopes registered, Publishing "In production", the 100-user limit, how to generate setup codes |
| `EIGENES-PROJEKT.md` | a blocked user | build their own project: Internal for a Workspace domain, External + In production for a personal account |
| `PROBLEME.md` / `TROUBLESHOOTING.md` | everyone | wrong account, unverified warning, access gone after 7 days, admin blocked the app, API not enabled |

- [ ] **Step 1: Write the failing test**

```javascript
// tests/docs.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))

test('both language document sets exist and are non-trivial', async () => {
  const pairs = [
    ['docs/de/ANLEITUNG.md', 'docs/en/GUIDE.md'],
    ['docs/de/ADMIN-CLOUD-PROJEKT.md', 'docs/en/ADMIN-CLOUD-PROJECT.md'],
    ['docs/de/EIGENES-PROJEKT.md', 'docs/en/OWN-PROJECT.md'],
    ['docs/de/PROBLEME.md', 'docs/en/TROUBLESHOOTING.md']
  ]
  for (const group of pairs) {
    for (const file of group) {
      const body = await fs.readFile(path.join(root, file), 'utf8')
      assert.ok(body.length > 400, `${file} is too short to be useful`)
    }
  }
})

test('the admin document states the load-bearing Cloud settings', async () => {
  const body = await fs.readFile(path.join(root, 'docs/de/ADMIN-CLOUD-PROJEKT.md'), 'utf8')
  for (const needle of ['External', 'In production', 'gmail.readonly', 'drive.readonly', 'calendar.readonly', '100']) {
    assert.ok(body.includes(needle), `admin doc must mention ${needle}`)
  }
})

test('no document or skill contains a real-looking client secret', async () => {
  const dirs = ['docs', 'skills', 'tools', 'src', 'bin']
  for (const dir of dirs) {
    const walk = async (p) => {
      for (const entry of await fs.readdir(p, { withFileTypes: true })) {
        const full = path.join(p, entry.name)
        if (entry.isDirectory()) { await walk(full); continue }
        const body = await fs.readFile(full, 'utf8')
        assert.ok(!/GOCSPX-[A-Za-z0-9_-]{10,}/.test(body), `${full} looks like it contains a real secret`)
      }
    }
    await walk(path.join(root, dir))
  }
})

test('the skill tells Claude where the accounts live and not to mix them', async () => {
  const body = await fs.readFile(path.join(root, 'skills/gws-konten/SKILL.md'), 'utf8')
  assert.ok(body.startsWith('---'), 'skill needs frontmatter')
  assert.ok(body.includes('name:'))
  assert.ok(body.includes('description:'))
  assert.ok(body.includes('meta.json'))
  assert.ok(body.includes('gws-'))
})

test('make-setup-code produces a code the decoder accepts', async () => {
  const { spawnSync } = await import('node:child_process')
  const tool = path.join(root, 'tools/make-setup-code.mjs')
  const r = spawnSync(process.execPath, [
    tool,
    '--id', 'default',
    '--label', 'Terra One',
    '--audience', 'external',
    '--client-id', '123-abc.apps.googleusercontent.com',
    '--client-secret', 'test-secret-value'
  ], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const code = r.stdout.trim().split('\n').filter(Boolean).pop()
  const { decode } = await import('../src/core/setupcode.mjs')
  assert.equal(decode(code).label, 'Terra One')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/docs.test.mjs`
Expected: FAIL — documents missing

- [ ] **Step 3: Write `tools/make-setup-code.mjs`**

```javascript
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
```

- [ ] **Step 4: Write the four German documents, the four English documents, the three skills and the README**

Content requirements per document are in the table above. The admin document must
contain, verbatim, the strings the test asserts: `External`, `In production`,
`gmail.readonly`, `drive.readonly`, `calendar.readonly`, `100`.

`skills/gws-konten/SKILL.md` frontmatter and body:

```markdown
---
name: gws-konten
description: Use when reading Gmail, Google Drive or Google Calendar across the Google accounts connected with gws-connect. Triggers on questions about mail, files, appointments, invoices or deadlines that span more than one Google account.
---

# Connected Google accounts

Accounts connected by gws-connect live under `~/.gws-connect/accounts/`. Each
directory holds a `meta.json` with the address, the areas that were granted and
the timestamps.

## Find out which accounts exist

Read every `~/.gws-connect/accounts/*/meta.json`. The `email` field names the
account; `services` lists what may be read (`gmail`, `drive`, `calendar`).

## Query one account

Run the wrapper for that account. It is `~/.gws-connect/bin/gws-<id>` on macOS
and `~/.gws-connect/bin/gws-<id>.cmd` on Windows, where `<id>` is the directory
name.

    ~/.gws-connect/bin/gws-tony-terra-one-de gmail users list --params '{"userId":"me","q":"invoice"}'

## Rules

- **One account per call.** Never combine results from two accounts into one
  list without saying which account each item came from.
- **Read-only.** Every grant is a readonly scope. A write attempt fails; do not
  try to work around it.
- **Only what is connected.** If a question needs an account that is not in the
  directory, say so and point at `gws-connect` rather than guessing.
- An account whose `services` does not include an area cannot answer for it.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/docs.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add skills docs tools README.md tests/docs.test.mjs
git commit -m "$(printf 'docs: bilingual guides, Claude skill and the operator code generator\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Task 15: Full suite and release check

**Files:**
- Modify: `package.json` (scripts), `README.md`
- Test: the whole suite

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests pass, no skips other than the Windows-only DPAPI test off Windows

- [ ] **Step 2: Smoke-test the real entry point on this machine**

```bash
node bin/gws-connect.mjs --help
node bin/gws-connect.mjs list --lang de
node bin/gws-connect.mjs list --lang en
```

Expected: help text in the chosen language, `list` reporting an empty machine, exit 0.

- [ ] **Step 3: Confirm no secret is committed**

```bash
git grep -nE 'GOCSPX-[A-Za-z0-9_-]{10,}' || echo "clean"
git grep -nE '[0-9]{10,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com' || echo "clean"
```

Expected: `clean` twice. The example client id `123-abc.apps.googleusercontent.com`
used in tests is deliberately too short to match.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(printf 'chore: full suite green, release check clean\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

## Errata against the code blocks above

- `src/core/ui.mjs` in Task 10 shows ANSI sequences with the ESC byte elided by this
  document's encoding. Write them as JavaScript escapes: `'[0m'`, `'[1m'`,
  `'[2m'`, `'[31m'`, `'[32m'`, `'[33m'`, `'[34m'`, and
  `'[2J[H'` for `clear()`.
- `tests/helpers/fake-gws.mjs` in Task 8 shows a shebang after the first comment line.
  Node does not need it, because `gws.mjs` runs `.mjs` stand-ins through
  `process.execPath`. Drop the shebang line.
- The `unknown version` test in Task 3 uses `await` inside the test body, so its
  callback must be `async`.
