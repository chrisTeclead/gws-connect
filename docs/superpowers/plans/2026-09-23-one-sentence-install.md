# One-Sentence Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-technical user pastes one sentence into Claude and ends up with gws-connect installed at a fixed location, the setup code entered through a native popup, and their first account connected — no ZIP, no folder, no security warning.

**Architecture:** GitHub Releases host the existing per-platform bundles plus `SHA256SUMS`, two installer scripts and an `INSTALL.md` written for Claude. Claude downloads with `curl`/`Invoke-WebRequest` (no quarantine flag → no Gatekeeper/SmartScreen), the scripts unpack into `~/.gws-connect/app/`, write a fixed launcher, re-link the account wrappers and install the skill. `setup --dialog` asks for the code in a native OS dialog whose answer travels only through the child process's stdout.

**Tech Stack:** Node ≥ 20 standard library only (no npm dependencies), `node:test`, bash + macOS built-ins (`curl`, `shasum`, `unzip`, `xattr`, `osascript`), Windows PowerShell 5.1 + WinForms, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-23-one-sentence-install-design.md`

## Global Constraints

- No npm dependencies. Node standard library only (existing rule of the repo).
- Release base URL, verbatim: `https://github.com/chrisTeclead/gws-connect/releases/latest/download`, overridable by `GWS_CONNECT_RELEASE_URL`.
- Install location: `~/.gws-connect/app/` (respect `GWS_CONNECT_HOME`), launcher `~/.gws-connect/gws-connect` (macOS) / `~/.gws-connect/gws-connect.cmd` (Windows).
- Skill target: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/gws-konten/`.
- Installers write nothing outside `~/.gws-connect/` and the skills dir; never `sudo`, `npm`, `brew`, `winget`.
- `~/.gws-connect/accounts/`, `credentials/`, `config.json`, `secrets.dat` are never modified by an install.
- The setup code never appears in argv, a file, a log, or gws-connect's own output.
- Pinned versions stay: Node `22.23.2`, gws `0.22.5` (from `tools/bundle/targets.mjs`).
- Platforms: `win-x64`, `mac-arm64`, `mac-x64`. `win-arm64` is refused with a sentence.
- All user-facing strings go through `locales/de.json` and `locales/en.json`; both must keep identical key sets (`tests/i18n.test.mjs` enforces it).
- Code style: match the repo — `standard`-like JS (no semicolons, space before function parens), short "why" comments above non-obvious code.

## Review Focus

1. **User name with spaces or umlauts** (`C:\Users\Anna Müller`): the generated `gws-connect.cmd` must not embed an absolute path (cmd.exe reads batch files in the OEM codepage and mangles UTF-8). Pinned in Task 5 by asserting the launcher body is built from `%~dp0` / `dirname "$0"` only.
2. **Code pasted with a trailing newline or spaces** into the popup: must import fine. Pinned in Task 4 (`'  GWSC1…\n'` case).
3. **User presses Cancel** in the popup: clean abort, exit 1, no second popup. Pinned in Task 4.
4. **Running the installer a second time with accounts present** (the update path): accounts untouched, wrappers point at the new app. Pinned in Task 7's CI check scripts.
5. **Windows PowerShell 5.1 defaulting to TLS 1.0**: GitHub refuses the download. Pinned in Task 5 by asserting `install.ps1` enables `Tls12` before the first request.

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/bundle/targets.mjs` (modify) | add `mac-x64` |
| `tools/bundle/checksums.mjs` (create) | pure: files → `SHA256SUMS` text |
| `tools/make-bundle.mjs` (modify) | write `SHA256SUMS` after building |
| `src/commands/relink.mjs` (create) | rewrite every account wrapper for the current runtime |
| `src/core/dialog.mjs` (create) | build + run the native secret-input dialog |
| `src/commands/setup.mjs` (modify) | `dialog` mode with retry loop |
| `src/menu.mjs` (modify) | wire `relink`, `setup --dialog`, exit code 3, help lines |
| `locales/de.json`, `locales/en.json` (modify) | new strings |
| `install/install.sh` (create) | macOS installer |
| `install/install.ps1` (create) | Windows installer |
| `install/INSTALL.md` (create) | the page Claude reads |
| `tools/ci/install-check.sh`, `tools/ci/install-check.ps1` (create) | real install twice + tamper check, used by CI |
| `.github/workflows/release.yml` (create) | test → build → install-check on real OSes → publish |
| `tests/…` (create) | one file per task, named below |
| docs, skill, bundle `CLAUDE.md` (modify) | Task 8 |

---

### Task 1: `mac-x64` target and `SHA256SUMS`

**Files:**
- Modify: `tools/bundle/targets.mjs` (the `PLATFORMS` object)
- Create: `tools/bundle/checksums.mjs`
- Modify: `tools/make-bundle.mjs` (`main()`, after the build loop)
- Test: `tests/bundle.test.mjs` (append), `tests/bundle-checksums.test.mjs` (create)

**Interfaces:**
- Produces: `platforms()` now returns `['win-x64', 'mac-arm64', 'mac-x64']`; `sha256Listing(files: {name: string, data: Buffer}[]): string` — lines `"<hex>  <name>\n"`, sorted by name; `dist/SHA256SUMS` exists after any build.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bundle.test.mjs`:

```js
test('an Intel Mac target uses the x86_64 darwin builds', () => {
  const t = targets.resolveTarget('mac-x64')
  assert.match(t.node.url, /node-v.*-darwin-x64\.tar\.gz$/)
  assert.equal(t.node.entry, `node-v${targets.NODE_VERSION}-darwin-x64/bin/node`)
  assert.equal(t.node.dest, 'runtime/node/bin/node')
  assert.match(t.gws.url, /google-workspace-cli-x86_64-apple-darwin\.tar\.gz$/)
  assert.equal(t.gws.dest, 'runtime/gws/gws')
  assert.equal(t.mode, 0o755)
})

test('--all builds every Mac, Intel included', () => {
  assert.deepEqual(targets.platforms(), ['win-x64', 'mac-arm64', 'mac-x64'])
})
```

Create `tests/bundle-checksums.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const { sha256Listing } = await import('../tools/bundle/checksums.mjs')

test('the listing has the shasum -a 256 layout the installers parse', () => {
  const data = Buffer.from('hello')
  const hex = createHash('sha256').update(data).digest('hex')
  assert.equal(sha256Listing([{ name: 'a.zip', data }]), `${hex}  a.zip\n`)
})

test('entries are sorted by name so a rebuild produces the same file', () => {
  const out = sha256Listing([
    { name: 'gws-connect-win-x64.zip', data: Buffer.from('w') },
    { name: 'gws-connect-mac-arm64.zip', data: Buffer.from('m') }
  ])
  const names = out.trim().split('\n').map(l => l.split('  ')[1])
  assert.deepEqual(names, ['gws-connect-mac-arm64.zip', 'gws-connect-win-x64.zip'])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bundle.test.mjs tests/bundle-checksums.test.mjs`
Expected: FAIL — `unknown platform "mac-x64"` and `Cannot find module …checksums.mjs`.

- [ ] **Step 3: Implement**

In `tools/bundle/targets.mjs`, add after the `'mac-arm64'` entry:

```js
  // Intel Macs are still common on desks that get a hand-me-down laptop.
  'mac-x64': {
    nodeArch: 'darwin-x64',
    nodeArchive: 'tar.gz',
    nodeEntry: 'bin/node',
    gwsArtifact: 'google-workspace-cli-x86_64-apple-darwin.tar.gz',
    gwsBinary: 'gws',
    mode: 0o755
  }
```

Create `tools/bundle/checksums.mjs`:

```js
// The one file the installers trust. Same layout as `shasum -a 256`, so the
// macOS installer can read it with awk and a human can check it by hand.
import { createHash } from 'node:crypto'

export function sha256Listing (files) {
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => `${createHash('sha256').update(f.data).digest('hex')}  ${f.name}\n`)
    .join('')
}
```

In `tools/make-bundle.mjs`: add `import { sha256Listing } from './bundle/checksums.mjs'`, then in `main()` replace

```js
  say(`\ndone: ${built.length} bundle(s)`)
```

with

```js
  // Covers every bundle in the output folder, not only this run's, so building
  // one platform at a time still ends with a complete listing.
  const outDir = path.resolve(root, options.out)
  const zips = (await fs.readdir(outDir)).filter(n => /^gws-connect-.*\.zip$/.test(n))
  const files = await Promise.all(zips.map(async name => ({ name, data: await fs.readFile(path.join(outDir, name)) })))
  await fs.writeFile(path.join(outDir, 'SHA256SUMS'), sha256Listing(files))
  say(`  ${path.join(outDir, 'SHA256SUMS')}`)

  say(`\ndone: ${built.length} bundle(s)`)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/bundle/targets.mjs tools/bundle/checksums.mjs tools/make-bundle.mjs tests/bundle.test.mjs tests/bundle-checksums.test.mjs
git commit -m "feat: Intel Mac bundle and a SHA256SUMS listing for the installers"
```

---

### Task 2: `relink` command

**Files:**
- Create: `src/commands/relink.mjs`
- Modify: `src/menu.mjs` (import, `help()`, `switch` in `main()`)
- Modify: `locales/de.json`, `locales/en.json`
- Test: `tests/relink.test.mjs`

**Interfaces:**
- Consumes: `accounts.list(): Promise<{id, email, …}[]>`, `wrappers.write(id): Promise<string>` (both existing).
- Produces: `relinkCommand(): Promise<number>` (count re-linked); CLI `gws-connect relink` exits 0.

- [ ] **Step 1: Write the failing test**

Create `tests/relink.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

test('relink points every stale wrapper at the running runtime', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  await seedCredSet()
  const accounts = await import(`../src/core/accounts.mjs?${Math.random()}`)
  const paths = await import(`../src/core/paths.mjs?${Math.random()}`)
  for (const email of ['anna@a.de', 'tony@terra-one.de']) {
    await accounts.create({ email, credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  }
  // What an update or a moved folder leaves behind: launchers into nowhere.
  await fs.mkdir(paths.binDir(), { recursive: true })
  for (const a of await accounts.list()) {
    await fs.writeFile(path.join(paths.binDir(), `gws-${a.id}`), 'exec /gone/node /gone/gws-run.mjs\n')
  }

  const { relinkCommand } = await import(`../src/commands/relink.mjs?${Math.random()}`)
  assert.equal(await relinkCommand(), 2)

  for (const a of await accounts.list()) {
    const body = await fs.readFile(path.join(paths.binDir(), `gws-${a.id}`), 'utf8')
    assert.ok(!body.includes('/gone/'), `${a.id} still points at the old runtime`)
    assert.ok(body.includes(process.execPath))
    assert.ok(body.includes('gws-run.mjs'))
    assert.ok(body.includes(process.env.GWS_CONNECT_GWS_BIN), 'the bundled gws path must be carried')
  }
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})

test('relink on a machine without accounts does nothing and succeeds', async () => {
  const box = await sandbox({})
  const { relinkCommand } = await import(`../src/commands/relink.mjs?${Math.random()}`)
  assert.equal(await relinkCommand(), 0)
  await box.cleanup()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/relink.test.mjs`
Expected: FAIL — `Cannot find module …relink.mjs`.

- [ ] **Step 3: Implement**

Create `src/commands/relink.mjs`:

```js
// Account launchers carry absolute paths to node and the runner. After an
// update, or after someone moved the unzipped folder, those paths lead nowhere
// and every account fails silently. Rewriting them is cheap and touches
// neither tokens nor Google.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as wrappers from '../core/wrappers.mjs'

export async function relinkCommand () {
  const all = await accounts.list()
  for (const account of all) await wrappers.write(account.id)
  ui.ok(t('relink.done', { count: all.length }))
  return all.length
}
```

In both locale files add a top-level group (German first, English second):

```json
  "relink": {
    "done": "{count} Konto-Starter neu geschrieben."
  },
```

```json
  "relink": {
    "done": "{count} account launcher(s) rewritten."
  },
```

and inside the `menu` group:

```json
    "relink": "Konto-Starter nach einem Update reparieren",
```

```json
    "relink": "Repair account launchers after an update",
```

In `src/menu.mjs`: add `import { relinkCommand } from './commands/relink.mjs'`; in `help()` after the `credentials` line add

```js
  ui.line(`  gws-connect relink                ${t('menu.relink')}`)
```

and in the `switch` before `default:`

```js
    case 'relink':
      await relinkCommand()
      return 0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS (including `tests/i18n.test.mjs` key parity).

- [ ] **Step 5: Commit**

```bash
git add src/commands/relink.mjs src/menu.mjs locales/de.json locales/en.json tests/relink.test.mjs
git commit -m "feat: relink rewrites account launchers for the current runtime"
```

---

### Task 3: Native secret-input dialog

**Files:**
- Create: `src/core/dialog.mjs`
- Test: `tests/dialog.test.mjs`

**Interfaces:**
- Consumes: `platform()` from `src/core/paths.mjs`.
- Produces:
  - `dialogCommand(platform: string, texts: {title, prompt, ok, cancel}): {file: string, args: string[]} | null`
  - `classify(platform: string, result: {status?: number, stdout?: string, stderr?: string, error?: Error}): {status: 'ok', value: string} | {status: 'cancel'} | {status: 'unavailable'}`
  - `askDialog(texts, {platform?, run?}): Promise<same as classify>` — `run({file, args})` resolves `{status, stdout, stderr}` or `{error}`.

Note: the spec said the Windows script goes over stdin. It goes as `-EncodedCommand` instead: the script holds only the prompt texts, never the code, and base64 UTF-16 survives umlauts where a piped stdin does not. Task 8 updates the spec line.

- [ ] **Step 1: Write the failing test**

Create `tests/dialog.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

const dialog = await import('../src/core/dialog.mjs')
const TEXTS = { title: 'gws-connect', prompt: 'Einrichtungs-Code einfügen:', ok: 'OK', cancel: 'Abbrechen' }

function decodePs (args) {
  const i = args.indexOf('-EncodedCommand')
  return Buffer.from(args[i + 1], 'base64').toString('utf16le')
}

test('macOS asks through osascript with a hidden answer', () => {
  const cmd = dialog.dialogCommand('darwin', TEXTS)
  assert.equal(cmd.file, 'osascript')
  const script = cmd.args[cmd.args.indexOf('-e') + 1]
  assert.match(script, /display dialog "Einrichtungs-Code einfügen:"/)
  assert.match(script, /with hidden answer/)
  assert.match(script, /cancel button "Abbrechen"/)
})

test('AppleScript strings are escaped so a quote cannot end them', () => {
  const cmd = dialog.dialogCommand('darwin', { ...TEXTS, prompt: 'say "hi" \\ bye' })
  assert.match(cmd.args.join(' '), /"say \\"hi\\" \\\\ bye"/)
})

test('Windows asks through a WinForms box with a password field', () => {
  const cmd = dialog.dialogCommand('win32', TEXTS)
  assert.equal(cmd.file, 'powershell.exe')
  assert.ok(cmd.args.includes('-NoProfile'))
  const script = decodePs(cmd.args)
  assert.match(script, /System\.Windows\.Forms/)
  assert.match(script, /UseSystemPasswordChar = \$true/)
  assert.match(script, /'Einrichtungs-Code einfügen:'/)
})

test('PowerShell strings double their single quotes', () => {
  const script = decodePs(dialog.dialogCommand('win32', { ...TEXTS, prompt: "it's" }).args)
  assert.match(script, /'it''s'/)
})

test('other platforms have no dialog', () => {
  assert.equal(dialog.dialogCommand('linux', TEXTS), null)
})

test('classify: exit 0 is the answer, trimmed', () => {
  assert.deepEqual(dialog.classify('darwin', { status: 0, stdout: '  GWSC1.x\n', stderr: '' }), { status: 'ok', value: 'GWSC1.x' })
})

test('classify: user cancel is recognised on both systems', () => {
  assert.deepEqual(dialog.classify('darwin', { status: 1, stdout: '', stderr: 'execution error: User canceled. (-128)' }), { status: 'cancel' })
  assert.deepEqual(dialog.classify('win32', { status: 1, stdout: '', stderr: '' }), { status: 'cancel' })
})

test('classify: anything else means no dialog could be shown', () => {
  assert.deepEqual(dialog.classify('darwin', { status: 1, stdout: '', stderr: 'no user interaction allowed (-1713)' }), { status: 'unavailable' })
  assert.deepEqual(dialog.classify('win32', { error: new Error('ENOENT') }), { status: 'unavailable' })
})

test('askDialog runs the built command and classifies its result', async () => {
  let seen = null
  const r = await dialog.askDialog(TEXTS, {
    platform: 'darwin',
    run: async (cmd) => { seen = cmd; return { status: 0, stdout: 'GWSC1.abc\n', stderr: '' } }
  })
  assert.equal(seen.file, 'osascript')
  assert.deepEqual(r, { status: 'ok', value: 'GWSC1.abc' })
})

test('askDialog on a platform without a dialog never runs anything', async () => {
  const r = await dialog.askDialog(TEXTS, { platform: 'linux', run: async () => { throw new Error('ran') } })
  assert.deepEqual(r, { status: 'unavailable' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dialog.test.mjs`
Expected: FAIL — `Cannot find module …dialog.mjs`.

- [ ] **Step 3: Implement**

Create `src/core/dialog.mjs`:

```js
// A native input box for the setup code. When Claude runs setup for the user
// it has no keyboard to offer, and the code must not pass through Claude at
// all. The dialog's answer reaches us on the child's stdout - never argv, never
// a file. The scripts below carry only prompt texts.
import { spawn } from 'node:child_process'
import { platform as currentPlatform } from './paths.mjs'

const apple = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const ps = (s) => `'${String(s).replace(/'/g, "''")}'`

function macScript ({ title, prompt, ok, cancel }) {
  return `text returned of (display dialog ${apple(prompt)} with title ${apple(title)} ` +
    `default answer "" with hidden answer buttons {${apple(cancel)}, ${apple(ok)}} ` +
    `default button ${apple(ok)} cancel button ${apple(cancel)})`
}

function windowsScript ({ title, prompt, ok, cancel }) {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '[System.Windows.Forms.Application]::EnableVisualStyles()',
    '$f = New-Object System.Windows.Forms.Form',
    `$f.Text = ${ps(title)}`,
    '$f.ClientSize = New-Object System.Drawing.Size(500, 150)',
    "$f.StartPosition = 'CenterScreen'",
    "$f.FormBorderStyle = 'FixedDialog'",
    '$f.MaximizeBox = $false',
    '$f.MinimizeBox = $false',
    '$f.TopMost = $true',
    '$l = New-Object System.Windows.Forms.Label',
    `$l.Text = ${ps(prompt)}`,
    '$l.SetBounds(12, 12, 476, 48)',
    '$t = New-Object System.Windows.Forms.TextBox',
    '$t.UseSystemPasswordChar = $true',
    '$t.SetBounds(12, 66, 476, 24)',
    '$ok = New-Object System.Windows.Forms.Button',
    `$ok.Text = ${ps(ok)}`,
    "$ok.DialogResult = 'OK'",
    '$ok.SetBounds(312, 106, 84, 30)',
    '$c = New-Object System.Windows.Forms.Button',
    `$c.Text = ${ps(cancel)}`,
    "$c.DialogResult = 'Cancel'",
    '$c.SetBounds(404, 106, 84, 30)',
    '$f.AcceptButton = $ok',
    '$f.CancelButton = $c',
    '$f.Controls.AddRange(@($l, $t, $ok, $c))',
    '$f.Add_Shown({ $f.Activate(); $t.Focus() })',
    "if ($f.ShowDialog() -eq 'OK') { [Console]::Out.Write($t.Text); exit 0 } else { exit 1 }"
  ].join('\n')
}

export function dialogCommand (platform, texts) {
  if (platform === 'darwin') return { file: 'osascript', args: ['-e', macScript(texts)] }
  if (platform === 'win32') {
    const encoded = Buffer.from(windowsScript(texts), 'utf16le').toString('base64')
    return { file: 'powershell.exe', args: ['-NoProfile', '-STA', '-EncodedCommand', encoded] }
  }
  return null
}

// osascript reports a click on the cancel button as error -128 with exit 1.
// Any other failure - no GUI session, blocked by policy - means the user never
// saw a dialog, which the caller must handle differently from a refusal.
export function classify (platform, { status, stdout = '', stderr = '', error } = {}) {
  if (error) return { status: 'unavailable' }
  if (status === 0) return { status: 'ok', value: String(stdout).trim() }
  if (platform === 'darwin' && /\(-128\)/.test(stderr)) return { status: 'cancel' }
  if (platform === 'win32' && status === 1) return { status: 'cancel' }
  return { status: 'unavailable' }
}

function runProcess ({ file, args }) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (error) => resolve({ error }))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

export async function askDialog (texts, { platform = currentPlatform(), run = runProcess } = {}) {
  const cmd = dialogCommand(platform, texts)
  if (!cmd) return { status: 'unavailable' }
  return classify(platform, await run(cmd))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/dialog.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Smoke-test the real dialog on this machine (Windows)**

Run: `node -e "import('./src/core/dialog.mjs').then(d => d.askDialog({title:'gws-connect',prompt:'Test: tippe abc und OK',ok:'OK',cancel:'Abbrechen'})).then(r => console.log(r))"`
Expected: a window appears; typing `abc` + OK prints `{ status: 'ok', value: 'abc' }`; Cancel prints `{ status: 'cancel' }`. Note the result in the task report. (macOS is checked by hand later, see Task 8.)

- [ ] **Step 6: Commit**

```bash
git add src/core/dialog.mjs tests/dialog.test.mjs
git commit -m "feat: native input dialog for secrets, answer only via child stdout"
```

---

### Task 4: `setup --dialog`

**Files:**
- Modify: `src/commands/setup.mjs`
- Modify: `src/menu.mjs` (`case 'setup'`, `help()`)
- Modify: `locales/de.json`, `locales/en.json` (`setup` group)
- Test: `tests/setup-dialog.test.mjs`

**Interfaces:**
- Consumes: `askDialog(texts)` from Task 3; `credsets.importCode(code)` (existing, throws `CodeError` with `.messageKey`).
- Produces: `setupCommand({code?, dialog?: boolean, prompt?: (texts) => Promise<result>}): Promise<true | false | 'unavailable'>`; `DIALOG_TRIES = 3`; CLI `setup --dialog` exits 0 on success, 1 on cancel/bad code, **3** when no dialog could be shown.

- [ ] **Step 1: Write the failing test**

Create `tests/setup-dialog.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox } from './helpers/sandbox.mjs'
import { encode } from '../src/core/setupcode.mjs'

const CODE = encode({
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'test-secret-value'
})

async function load () {
  const i18n = await import('../src/core/i18n.mjs')
  await i18n.initI18n('en')
  const setup = await import(`../src/commands/setup.mjs?${Math.random()}`)
  const credsets = await import(`../src/core/credsets.mjs?${Math.random()}`)
  return { setup, credsets, i18n }
}

// Answers the dialog from a script and records every prompt it was shown.
function scripted (...answers) {
  const seen = []
  const prompt = async (texts) => { seen.push(texts); return answers.shift() }
  return { prompt, seen }
}

function captureStdout () {
  const chunks = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = (c, ...rest) => { chunks.push(String(c)); return true }
  return { text: () => chunks.join(''), restore: () => { process.stdout.write = original } }
}

test('a code pasted with stray whitespace imports, and is never printed', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await load()
  const d = scripted({ status: 'ok', value: `  ${CODE}\n` })
  const out = captureStdout()
  let r
  try { r = await setup.setupCommand({ dialog: true, prompt: d.prompt }) } finally { out.restore() }
  assert.equal(r, true)
  assert.equal(d.seen.length, 1)
  assert.equal((await credsets.list()).length, 1)
  assert.ok(!out.text().includes(CODE), 'the code must not reach our own output')
  assert.ok(!out.text().includes('test-secret-value'))
  await box.cleanup()
})

test('cancel stops at once, imports nothing, asks no second time', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await load()
  const d = scripted({ status: 'cancel' })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), false)
  assert.equal(d.seen.length, 1)
  assert.equal((await credsets.list()).length, 0)
  await box.cleanup()
})

test('an empty OK counts as cancel', async () => {
  const box = await sandbox({})
  const { setup } = await load()
  const d = scripted({ status: 'ok', value: '' })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), false)
  assert.equal(d.seen.length, 1)
  await box.cleanup()
})

test('no dialog available is reported distinctly', async () => {
  const box = await sandbox({})
  const { setup } = await load()
  const d = scripted({ status: 'unavailable' })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), 'unavailable')
  await box.cleanup()
})

test('a truncated code reopens the dialog with the reason, then succeeds', async () => {
  const box = await sandbox({})
  const { setup, credsets, i18n } = await load()
  const cut = CODE.slice(0, -5)
  const d = scripted({ status: 'ok', value: cut }, { status: 'ok', value: cut }, { status: 'ok', value: CODE })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), true)
  assert.equal(d.seen.length, 3)
  assert.ok(d.seen[1].prompt.includes(i18n.t('setup.dialog_retry')), 'second prompt must say what to do')
  assert.equal((await credsets.list()).length, 1)
  await box.cleanup()
})

test('three bad codes end the attempt', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await load()
  const bad = { status: 'ok', value: 'GWSC1.nope.nope' }
  const d = scripted(bad, bad, bad, bad)
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), false)
  assert.equal(d.seen.length, setup.DIALOG_TRIES)
  assert.equal((await credsets.list()).length, 0)
  await box.cleanup()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/setup-dialog.test.mjs`
Expected: FAIL — first test gets `false`/a readline prompt instead of `true` (no dialog mode yet); `DIALOG_TRIES` undefined.

- [ ] **Step 3: Implement**

Replace `src/commands/setup.mjs` with:

```js
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as credsets from '../core/credsets.mjs'
import { askDialog } from '../core/dialog.mjs'

// A truncated paste is the usual failure. Three tries covers "copied it
// again"; beyond that something else is wrong and a human should look.
export const DIALOG_TRIES = 3

function reason (error) {
  // CodeError carries the exact i18n key for what was wrong with the paste.
  return t(error.messageKey || 'err.code_json')
}

function imported (set) {
  ui.ok(t('setup.imported', { label: set.label }))
  ui.dim(t('setup.code_discarded'))
  ui.blank()
  ui.info(t('setup.next'))
}

async function fromDialog (prompt) {
  ui.info(t('setup.dialog_opening'))
  let text = t('setup.dialog_prompt')
  for (let attempt = 1; attempt <= DIALOG_TRIES; attempt += 1) {
    const answer = await prompt({
      title: t('setup.dialog_title'),
      prompt: text,
      ok: t('common.ok'),
      cancel: t('setup.dialog_cancel')
    })
    if (answer.status === 'unavailable') {
      ui.fail(t('setup.dialog_unavailable'))
      return 'unavailable'
    }
    if (answer.status !== 'ok' || !answer.value) {
      ui.fail(t('err.aborted'))
      return false
    }
    try {
      imported(await credsets.importCode(answer.value))
      return true
    } catch (error) {
      ui.fail(reason(error))
      text = `${reason(error)}\n\n${t('setup.dialog_retry')}`
    }
  }
  ui.fail(t('setup.dialog_gave_up'))
  return false
}

export async function setupCommand ({ code, dialog = false, prompt = askDialog } = {}) {
  ui.title(t('setup.title'))
  if (!code && dialog) return fromDialog(prompt)

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
    imported(await credsets.importCode(value))
    return true
  } catch (error) {
    ui.fail(reason(error))
    return false
  }
}
```

Add inside the `setup` group of `locales/de.json`:

```json
    "dialog_title": "gws-connect – Einrichtung",
    "dialog_opening": "Ein Fenster fragt jetzt nach dem Einrichtungs-Code.",
    "dialog_prompt": "Bitte den Einrichtungs-Code aus dem Passwortmanager einfügen und auf OK klicken.",
    "dialog_retry": "Bitte den Code noch einmal vollständig kopieren – vom Anfang bis zum letzten Zeichen.",
    "dialog_cancel": "Abbrechen",
    "dialog_unavailable": "Das Eingabefenster konnte nicht geöffnet werden.",
    "dialog_gave_up": "Drei Versuche ohne gültigen Code. Bitte beim Absender einen neuen Code anfordern."
```

and in `locales/en.json`:

```json
    "dialog_title": "gws-connect – setup",
    "dialog_opening": "A window now asks for the setup code.",
    "dialog_prompt": "Please paste the setup code from the password manager and click OK.",
    "dialog_retry": "Please copy the code again, completely – from the start to the very last character.",
    "dialog_cancel": "Cancel",
    "dialog_unavailable": "The input window could not be opened.",
    "dialog_gave_up": "Three tries without a valid code. Please ask the sender for a new one."
```

(Keep valid JSON: add commas between the existing last key and these.)

In `src/menu.mjs` replace the `case 'setup':` block with:

```js
    case 'setup': {
      const r = await setupCommand({
        code: typeof flags.code === 'string' ? flags.code : undefined,
        dialog: Boolean(flags.dialog)
      })
      // 3 tells a caller such as Claude that no window could be shown, which
      // needs a different next step than a refused code.
      if (r === 'unavailable') return 3
      return r ? 0 : 1
    }
```

and in `help()` after the `setup --code` line:

```js
  ui.line(`  gws-connect setup --dialog        ${t('menu.setup')}`)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Smoke-test end to end on this machine**

Run (PowerShell): `$env:GWS_CONNECT_HOME = "$env:TEMP\gwsc-smoke"; node bin/gws-connect.mjs setup --dialog --lang de; echo "exit $LASTEXITCODE"`
Expected: the German window appears. Click Abbrechen → `exit 1`. Run again and paste `GWSC1.x.y` twice → second window shows the retry sentence. Then remove `$env:TEMP\gwsc-smoke`.

- [ ] **Step 6: Commit**

```bash
git add src/commands/setup.mjs src/menu.mjs locales/de.json locales/en.json tests/setup-dialog.test.mjs
git commit -m "feat: setup --dialog asks for the code in a native window"
```

---

### Task 5: Installer scripts

**Files:**
- Create: `install/install.sh`, `install/install.ps1`
- Test: `tests/install-scripts.test.mjs`

**Interfaces:**
- Consumes: release files `SHA256SUMS`, `gws-connect-<platform>.zip` (Task 1; zip root folder is `gws-connect-<platform>/`); CLI `relink` (Task 2).
- Produces: `~/.gws-connect/app/` (bundle contents), launcher `~/.gws-connect/gws-connect[.cmd]`, `<claude>/skills/gws-konten/`; last stdout line `installed gws-connect <version> - next: <launcher> doctor --yes`. Env overrides: `GWS_CONNECT_RELEASE_URL`, `GWS_CONNECT_HOME`, `CLAUDE_CONFIG_DIR`.

- [ ] **Step 1: Write the failing test**

Create `tests/install-scripts.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const RELEASE = 'https://github.com/chrisTeclead/gws-connect/releases/latest/download'
const read = (f) => fs.readFile(new URL(`../install/${f}`, import.meta.url), 'utf8')
const sh = await read('install.sh')
const ps1 = await read('install.ps1')

// The part of each script that becomes the launcher file.
function launcher (script, start, end) {
  const from = script.indexOf(start)
  const to = script.indexOf(end, from + start.length)
  assert.ok(from !== -1 && to !== -1, 'launcher body not found')
  return script.slice(from, to)
}

for (const [name, body] of [['install.sh', sh], ['install.ps1', ps1]]) {
  test(`${name} defaults to the public release and honours the overrides`, () => {
    assert.ok(body.includes(RELEASE))
    for (const v of ['GWS_CONNECT_RELEASE_URL', 'GWS_CONNECT_HOME', 'CLAUDE_CONFIG_DIR']) {
      assert.ok(body.includes(v), `${name} must honour ${v}`)
    }
  })

  test(`${name} installs nothing system-wide`, () => {
    for (const word of ['sudo', 'npm ', 'brew ', 'winget', 'choco ']) {
      assert.ok(!body.includes(word), `${name} must not use ${word.trim()}`)
    }
  })

  test(`${name} checks the checksum, relinks, installs the skill`, () => {
    assert.ok(body.includes('SHA256SUMS'))
    assert.match(body, /relink/)
    assert.match(body, /skills/)
    assert.match(body, /gws-konten/)
    assert.match(body, /doctor --yes/)
  })
}

test('install.sh tells Apple Silicon from Intel, even under Rosetta', () => {
  assert.match(sh, /hw\.optional\.arm64/)
  assert.match(sh, /mac-arm64/)
  assert.match(sh, /mac-x64/)
  assert.match(sh, /com\.apple\.quarantine/)
})

test('install.ps1 refuses ARM Windows and enables TLS 1.2 before downloading', () => {
  assert.match(ps1, /ARM64/)
  const tls = ps1.indexOf('Tls12')
  const firstDownload = ps1.indexOf('Invoke-WebRequest')
  assert.ok(tls !== -1 && tls < firstDownload, 'PowerShell 5.1 needs TLS 1.2 switched on first')
})

test('install.ps1 never exits the caller\'s shell', () => {
  // A user who pasted it into their own PowerShell window would lose it.
  assert.ok(!/^\s*exit\b/m.test(ps1))
})

test('the launchers carry no absolute path, so umlauts and spaces in the user name are harmless', () => {
  const posix = launcher(sh, "<<'EOF'", '\nEOF')
  assert.match(posix, /dirname "\$0"/)
  assert.ok(!posix.includes('$HOME_DIR'), 'resolved at run time, not baked in')
  const cmd = launcher(ps1, "@'", "'@")
  assert.match(cmd, /%~dp0app\\runtime\\node\\node\.exe/)
  assert.match(cmd, /%~dp0app\\runtime\\gws\\gws\.exe/)
  assert.ok(!/[A-Z]:\\/.test(cmd))
  assert.match(ps1, /Encoding\]::ASCII/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/install-scripts.test.mjs`
Expected: FAIL — `ENOENT … install/install.sh`.

- [ ] **Step 3: Write `install/install.sh`**

```bash
#!/usr/bin/env bash
# gws-connect installer for macOS. Meant to be run by Claude Code:
#   curl -fsSL https://github.com/chrisTeclead/gws-connect/releases/latest/download/install.sh | bash
#
# curl sets no quarantine flag, so nothing here meets Gatekeeper. Everything
# lands in ~/.gws-connect/app; accounts and credentials are never touched.
# Running it again is how you update.
set -euo pipefail

RELEASE_URL="${GWS_CONNECT_RELEASE_URL:-https://github.com/chrisTeclead/gws-connect/releases/latest/download}"
HOME_DIR="${GWS_CONNECT_HOME:-$HOME/.gws-connect}"
SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"

fail () { echo "gws-connect install failed: $*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS; on Windows use install.ps1"

# A shell under Rosetta reports x86_64 on Apple Silicon. The hardware flag
# does not lie, and the native build is the one that should run.
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
  PLATFORM=mac-arm64
elif [ "$(uname -m)" = "x86_64" ]; then
  PLATFORM=mac-x64
else
  fail "unsupported processor $(uname -m)"
fi
BUNDLE="gws-connect-$PLATFORM"

mkdir -p "$HOME_DIR"
WORK="$(mktemp -d "$HOME_DIR/.install-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "downloading $BUNDLE"
curl -fsSL -o "$WORK/SHA256SUMS" "$RELEASE_URL/SHA256SUMS" || fail "could not download SHA256SUMS"
curl -fsSL -o "$WORK/$BUNDLE.zip" "$RELEASE_URL/$BUNDLE.zip" || fail "could not download $BUNDLE.zip"

expected="$(awk -v f="$BUNDLE.zip" '$2 == f { print $1 }' "$WORK/SHA256SUMS")"
[ -n "$expected" ] || fail "SHA256SUMS lists no $BUNDLE.zip"
actual="$(shasum -a 256 "$WORK/$BUNDLE.zip" | awk '{ print $1 }')"
[ "$expected" = "$actual" ] || fail "checksum mismatch for $BUNDLE.zip - nothing was changed"

unzip -q "$WORK/$BUNDLE.zip" -d "$WORK/unpacked" || fail "could not unpack $BUNDLE.zip"
[ -x "$WORK/unpacked/$BUNDLE/runtime/node/bin/node" ] || fail "$BUNDLE.zip is incomplete"
xattr -dr com.apple.quarantine "$WORK/unpacked/$BUNDLE" 2>/dev/null || true

# The old app is removed only once the new one is in place.
APP="$HOME_DIR/app"
if [ -d "$APP" ]; then mv "$APP" "$WORK/old-app"; fi
if ! mv "$WORK/unpacked/$BUNDLE" "$APP"; then
  if [ -d "$WORK/old-app" ]; then mv "$WORK/old-app" "$APP"; fi
  fail "could not move the new version into place"
fi

LAUNCHER="$HOME_DIR/gws-connect"
cat > "$LAUNCHER" <<'EOF'
#!/usr/bin/env bash
# Generated by install.sh. Do not edit. Runs gws-connect from the installed app.
HERE="$(cd "$(dirname "$0")" && pwd)"
export GWS_CONNECT_GWS_BIN="$HERE/app/runtime/gws/gws"
exec "$HERE/app/runtime/node/bin/node" "$HERE/app/bin/gws-connect.mjs" "$@"
EOF
chmod 755 "$LAUNCHER"

"$LAUNCHER" relink >/dev/null || fail "could not repair the account launchers"

mkdir -p "$SKILLS_DIR"
rm -rf "$SKILLS_DIR/gws-konten"
cp -R "$APP/skills/gws-konten" "$SKILLS_DIR/gws-konten"

VERSION="$("$APP/runtime/node/bin/node" -p 'require(process.argv[1]).version' "$APP/package.json")"
echo "installed gws-connect $VERSION - next: $LAUNCHER doctor --yes"
```

- [ ] **Step 4: Write `install/install.ps1`**

Note: the closing `'@` of the here-string must stay in column 0.

```powershell
# gws-connect installer for Windows. Meant to be run by Claude Code:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/chrisTeclead/gws-connect/releases/latest/download/install.ps1 | iex"
#
# Invoke-WebRequest sets no Mark of the Web, so nothing here meets SmartScreen.
# Everything lands in ~/.gws-connect/app; accounts and credentials are never
# touched. Running it again is how you update. It throws instead of exiting,
# so a user who pasted it into their own window keeps that window.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  # Windows PowerShell 5.1 may still default to TLS 1.0, which GitHub refuses.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $release = if ($env:GWS_CONNECT_RELEASE_URL) { $env:GWS_CONNECT_RELEASE_URL } else { 'https://github.com/chrisTeclead/gws-connect/releases/latest/download' }
  $homeDir = if ($env:GWS_CONNECT_HOME) { $env:GWS_CONNECT_HOME } else { Join-Path $env:USERPROFILE '.gws-connect' }
  $claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
  $prefix = 'gws-connect install failed:'

  $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  if ($arch -eq 'ARM64') { throw "$prefix there is no ARM Windows build of gws" }
  if ($arch -ne 'AMD64') { throw "$prefix unsupported processor $arch" }
  $bundle = 'gws-connect-win-x64'

  New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
  $work = Join-Path $homeDir ('.install-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    Write-Host "downloading $bundle"
    $sums = Join-Path $work 'SHA256SUMS'
    $zip = Join-Path $work "$bundle.zip"
    try { Invoke-WebRequest -UseBasicParsing -Uri "$release/SHA256SUMS" -OutFile $sums } catch { throw "$prefix could not download SHA256SUMS" }
    try { Invoke-WebRequest -UseBasicParsing -Uri "$release/$bundle.zip" -OutFile $zip } catch { throw "$prefix could not download $bundle.zip" }

    $expected = Get-Content $sums | ForEach-Object {
      $parts = $_ -split '\s+'
      if ($parts[1] -eq "$bundle.zip") { $parts[0] }
    } | Select-Object -First 1
    if (-not $expected) { throw "$prefix SHA256SUMS lists no $bundle.zip" }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash
    if ($actual -ne $expected) { throw "$prefix checksum mismatch for $bundle.zip - nothing was changed" }

    $unpacked = Join-Path $work 'unpacked'
    Expand-Archive -LiteralPath $zip -DestinationPath $unpacked
    $new = Join-Path $unpacked $bundle
    if (-not (Test-Path (Join-Path $new 'runtime\node\node.exe'))) { throw "$prefix $bundle.zip is incomplete" }

    # The old app is removed only once the new one is in place. A running
    # gws-connect locks node.exe, and the rename fails cleanly in that case.
    $app = Join-Path $homeDir 'app'
    $old = Join-Path $work 'old-app'
    if (Test-Path $app) {
      try { Move-Item -LiteralPath $app -Destination $old } catch { throw "$prefix gws-connect is still running - close its windows and try again" }
    }
    try { Move-Item -LiteralPath $new -Destination $app } catch {
      if (Test-Path $old) { Move-Item -LiteralPath $old -Destination $app }
      throw "$prefix could not move the new version into place"
    }

    # %~dp0 is the launcher's own folder. Nothing absolute is written, because
    # cmd.exe reads batch files in the OEM codepage and would mangle a user
    # name like "Anna Müller".
    $launcher = Join-Path $homeDir 'gws-connect.cmd'
    $body = @'
@echo off
rem Generated by install.ps1. Do not edit. Runs gws-connect from the installed app.
set "GWS_CONNECT_GWS_BIN=%~dp0app\runtime\gws\gws.exe"
"%~dp0app\runtime\node\node.exe" "%~dp0app\bin\gws-connect.mjs" %*
'@
    [IO.File]::WriteAllText($launcher, $body.Replace("`n", "`r`n").Replace("`r`r", "`r"), [Text.Encoding]::ASCII)

    & $launcher relink | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "$prefix could not repair the account launchers" }

    $skills = Join-Path $claudeDir 'skills'
    New-Item -ItemType Directory -Force -Path $skills | Out-Null
    $skill = Join-Path $skills 'gws-konten'
    if (Test-Path $skill) { Remove-Item -LiteralPath $skill -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $app 'skills\gws-konten') -Destination $skill -Recurse

    $version = (Get-Content -Raw (Join-Path $app 'package.json') | ConvertFrom-Json).version
    Write-Host "installed gws-connect $version - next: $launcher doctor --yes"
  } finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Real install on this Windows machine**

Build and serve locally (needs network once for the bundle download; the cache makes reruns fast):

```powershell
node tools/make-bundle.mjs --platform win-x64
Copy-Item install\install.sh, install\install.ps1 dist\
$server = Start-Process python -ArgumentList '-m','http.server','8765','--directory','dist' -PassThru -WindowStyle Hidden
$env:GWS_CONNECT_RELEASE_URL = 'http://127.0.0.1:8765'
$env:GWS_CONNECT_HOME = "$env:TEMP\gwsc-install\home"
$env:CLAUDE_CONFIG_DIR = "$env:TEMP\gwsc-install\claude"
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm $env:GWS_CONNECT_RELEASE_URL/install.ps1 | iex"
& "$env:GWS_CONNECT_HOME\gws-connect.cmd" list --lang en
Stop-Process $server
```

Expected: last installer line `installed gws-connect 0.1.0 - next: …\gws-connect.cmd doctor --yes`; `list` prints "No account connected yet"; `$env:CLAUDE_CONFIG_DIR\skills\gws-konten\SKILL.md` exists. Clean up `$env:TEMP\gwsc-install` and the env vars afterwards. If `make-bundle` needs files in `dist/` removed first, do so. `dist/` is build output — confirm it is in `.gitignore`; add it if not.

- [ ] **Step 7: Commit**

```bash
git add install/install.sh install/install.ps1 tests/install-scripts.test.mjs .gitignore
git commit -m "feat: installer scripts that put gws-connect at a fixed place"
```

---

### Task 6: `INSTALL.md` — the page Claude reads

**Files:**
- Create: `install/INSTALL.md`
- Test: `tests/install-doc.test.mjs`

**Interfaces:**
- Consumes: the two one-liners (Task 5), launcher paths (Task 5), `setup --dialog` + exit code 3 (Task 4), `add <email> --yes`, `doctor --yes` (existing).
- Produces: `install/INSTALL.md`, published unchanged by Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/install-doc.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const read = (f) => fs.readFile(new URL(`../install/${f}`, import.meta.url), 'utf8')
const doc = await read('INSTALL.md')

// Each script's header names its own one-liner; the doc must repeat it exactly.
async function oneLiner (script) {
  const body = await read(script)
  const line = body.split('\n').find(l => /^#\s+(curl|powershell)/.test(l))
  assert.ok(line, `${script} has no one-liner in its header`)
  return line.replace(/^#\s+/, '').trim()
}

test('INSTALL.md gives exactly the commands the scripts document', async () => {
  assert.ok(doc.includes(await oneLiner('install.sh')))
  assert.ok(doc.includes(await oneLiner('install.ps1')))
})

test('INSTALL.md walks the fixed order with the fixed launcher', () => {
  const order = ['<launcher> doctor --yes', '<launcher> setup --dialog', '<launcher> add ']
  const at = order.map(s => doc.indexOf(s))
  assert.ok(at.every(i => i !== -1), `missing one of ${order}`)
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'steps out of order')
  assert.ok(doc.includes('~/.gws-connect/gws-connect'))
  assert.ok(doc.includes('gws-connect.cmd'))
})

test('INSTALL.md forbids other installers and guards the code', () => {
  assert.match(doc, /npm/)
  assert.match(doc, /brew/)
  assert.match(doc, /winget/)
  assert.match(doc, /never ask/i)
  assert.match(doc, /exit code 3|exits with 3/i)
  assert.ok(!doc.includes('GWSC1.'), 'no code, not even one that looks real')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/install-doc.test.mjs`
Expected: FAIL — `ENOENT … install/INSTALL.md`.

- [ ] **Step 3: Write `install/INSTALL.md`**

````markdown
# Installing gws-connect — instructions for Claude

You were given this page by someone who is **not technical** and asked to set
gws-connect up for them. It connects their Google accounts (Gmail, Drive,
Calendar), read-only, so you can read in them afterwards.

Act, don't explain. Talk to the user in their language, in short plain
sentences. Never show them a command unless they ask.

## 1. Install

Run the one line for their system:

- **macOS:**
  `curl -fsSL https://github.com/chrisTeclead/gws-connect/releases/latest/download/install.sh | bash`
- **Windows:**
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/chrisTeclead/gws-connect/releases/latest/download/install.ps1 | iex"`

It needs no administrator rights and ends with a line starting `installed`.
Running it again later is how you update; connected accounts are kept.

**Install nothing else.** No `npm`, no `brew`, no `winget`, no Node, no gws —
everything is bundled. If the installer fails, tell the user the one-line
reason it printed and stop.

From here on use only the launcher:

- macOS: `~/.gws-connect/gws-connect`
- Windows: `%USERPROFILE%\.gws-connect\gws-connect.cmd`

Add `--lang de` or `--lang en` to every call, matching the user's language.

## 2. Check

`<launcher> doctor --yes`

Read its output. If it reports a problem, see step 6.

## 3. The setup code

Tell the user, before you run the next command: "A window will now ask for
the setup code. Paste it from your password manager and click OK."

`<launcher> setup --dialog`

- The code is the secret itself. **Never ask** the user to paste it into the
  chat, never type, echo, store or log it. If they paste it into the chat
  anyway, tell them plainly that it should be replaced with a new one, and
  carry on.
- Exit code 0: done. Exit code 1: they cancelled or the code was wrong three
  times — ask whether to try again.
- **Exit code 3:** no window could be shown. Open the launcher in a terminal
  window of its own instead; it asks for the code first:
  - macOS: `open -a Terminal ~/.gws-connect/gws-connect`
  - Windows: `start "" "%USERPROFILE%\.gws-connect\gws-connect.cmd"`

  Tell the user to paste the code there (macOS: Cmd+V; Windows: right-click)
  and press Enter, then close that window and come back.

## 4. Connect an account

Ask for the Google address they want to connect. Before running the command,
tell them three things:

1. Sign out of Google in the browser first, otherwise Google takes whoever is
   signed in.
2. In the browser, pick exactly that address.
3. "Google hasn't verified this app" is expected here: **Advanced → Go to …**.
   Do not cancel.

`<launcher> add <address> --yes`

The browser opens; the command waits until they are done. gws-connect then
checks which account actually answered and refuses a mismatch — pass its
message on as it is.

Repeat for every further address.

## 5. Done

The `gws-konten` skill is installed and tells you how to read in the
connected accounts. Tell the user they can now ask you about their mail,
files and appointments. They should say "yes" when gws-connect later asks to
re-check access after eight days.

## 6. When something fails

Read `~/.gws-connect/app/docs/en/TROUBLESHOOTING.md` (German:
`docs/de/PROBLEME.md`) before guessing. Do not change settings on your own; a
wrong switch only shows up a week later.
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add install/INSTALL.md tests/install-doc.test.mjs
git commit -m "docs: INSTALL.md, the page Claude follows to set everything up"
```

---

### Task 7: Release workflow with real installs on macOS and Windows

**Files:**
- Create: `tools/ci/install-check.sh`, `tools/ci/install-check.ps1`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `node tools/make-bundle.mjs --all` → `dist/*.zip` + `dist/SHA256SUMS` (Task 1); `install/*` (Tasks 5–6).
- Produces: on tag `v*`, a GitHub Release with `gws-connect-{win-x64,mac-arm64,mac-x64}.zip`, `SHA256SUMS`, `install.sh`, `install.ps1`, `INSTALL.md` — only if all install checks pass. `workflow_dispatch` runs everything except publishing.

- [ ] **Step 1: Write `tools/ci/install-check.sh`**

```bash
#!/usr/bin/env bash
# CI only. Installs from a local copy of the release twice, the way an update
# would, and checks that nothing the user owns is lost. Then feeds it a
# tampered zip and checks that the installed app survives.
# usage: install-check.sh <dist-dir>
set -euo pipefail

DIST="$(cd "$1" && pwd)"
PORT=8765
URL="http://127.0.0.1:$PORT"
python3 -m http.server "$PORT" --directory "$DIST" >/dev/null 2>&1 &
SERVER=$!
# pwd -P: /var is a symlink on macOS, and node reports the resolved path.
TMP="$(cd "$(mktemp -d)" && pwd -P)"
trap 'kill $SERVER; rm -rf "$TMP"' EXIT
for _ in $(seq 1 40); do curl -fs "$URL/SHA256SUMS" >/dev/null && break; sleep 0.25; done

export GWS_CONNECT_RELEASE_URL="$URL"
export GWS_CONNECT_HOME="$TMP/home"
export CLAUDE_CONFIG_DIR="$TMP/claude"
L="$GWS_CONNECT_HOME/gws-connect"

echo "--- first install"
bash "$DIST/install.sh"
"$L" list --lang en
"$GWS_CONNECT_HOME/app/runtime/gws/gws" --version
test -f "$CLAUDE_CONFIG_DIR/skills/gws-konten/SKILL.md"

echo "--- update with an account present"
mkdir -p "$GWS_CONNECT_HOME/accounts/anna-a-de"
printf '{"email":"anna@a.de","credSet":"default","services":["gmail"],"accountType":"workspace","connectedAt":"2026-09-01T00:00:00.000Z"}\n' \
  > "$GWS_CONNECT_HOME/accounts/anna-a-de/meta.json"
cp "$GWS_CONNECT_HOME/accounts/anna-a-de/meta.json" "$TMP/meta.before"
bash "$DIST/install.sh"
cmp "$TMP/meta.before" "$GWS_CONNECT_HOME/accounts/anna-a-de/meta.json"
grep -q "$GWS_CONNECT_HOME/app/runtime/node/bin/node" "$GWS_CONNECT_HOME/bin/gws-anna-a-de"

echo "--- tampered zip is refused and the app survives"
touch "$GWS_CONNECT_HOME/app/.marker"
mkdir "$TMP/bad"
cp "$DIST"/* "$TMP/bad/"
for z in "$TMP"/bad/*.zip; do printf 'x' >> "$z"; done
python3 -m http.server $((PORT + 1)) --directory "$TMP/bad" >/dev/null 2>&1 &
BAD=$!
for _ in $(seq 1 40); do curl -fs "http://127.0.0.1:$((PORT + 1))/SHA256SUMS" >/dev/null && break; sleep 0.25; done
if GWS_CONNECT_RELEASE_URL="http://127.0.0.1:$((PORT + 1))" bash "$DIST/install.sh"; then
  kill $BAD; echo "a tampered zip must be refused"; exit 1
fi
kill $BAD
test -f "$GWS_CONNECT_HOME/app/.marker"

echo "install-check ok"
```

- [ ] **Step 2: Write `tools/ci/install-check.ps1`**

```powershell
# CI only. Windows twin of install-check.sh - see there for the why.
# usage: install-check.ps1 <dist-dir>
param([Parameter(Mandatory)] [string] $Dist)
$ErrorActionPreference = 'Stop'
$Dist = (Resolve-Path $Dist).Path

function Serve ($dir, $port) {
  $p = Start-Process python -ArgumentList '-m', 'http.server', "$port", '--directory', $dir -PassThru -WindowStyle Hidden
  for ($i = 0; $i -lt 40; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/SHA256SUMS" | Out-Null; break } catch { Start-Sleep -Milliseconds 250 }
  }
  $p
}
function Install ($url) {
  $env:GWS_CONNECT_RELEASE_URL = $url
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm $url/install.ps1 | iex"
  $LASTEXITCODE
}

$tmp = Join-Path $env:RUNNER_TEMP ('gwsc-' + [guid]::NewGuid().ToString('N'))
$env:GWS_CONNECT_HOME = Join-Path $tmp 'home'
$env:CLAUDE_CONFIG_DIR = Join-Path $tmp 'claude'
$launcher = Join-Path $env:GWS_CONNECT_HOME 'gws-connect.cmd'
$good = Serve $Dist 8765
try {
  Write-Host '--- first install'
  if ((Install 'http://127.0.0.1:8765') -ne 0) { throw 'first install failed' }
  & $launcher list --lang en
  if ($LASTEXITCODE -ne 0) { throw 'list failed' }
  & (Join-Path $env:GWS_CONNECT_HOME 'app\runtime\gws\gws.exe') --version
  if (-not (Test-Path (Join-Path $env:CLAUDE_CONFIG_DIR 'skills\gws-konten\SKILL.md'))) { throw 'skill missing' }

  Write-Host '--- update with an account present'
  $acct = Join-Path $env:GWS_CONNECT_HOME 'accounts\anna-a-de'
  New-Item -ItemType Directory -Force $acct | Out-Null
  $meta = '{"email":"anna@a.de","credSet":"default","services":["gmail"],"accountType":"workspace","connectedAt":"2026-09-01T00:00:00.000Z"}'
  [IO.File]::WriteAllText((Join-Path $acct 'meta.json'), $meta)
  if ((Install 'http://127.0.0.1:8765') -ne 0) { throw 'update failed' }
  if ([IO.File]::ReadAllText((Join-Path $acct 'meta.json')) -ne $meta) { throw 'account changed by update' }
  $wrapper = Get-Content -Raw (Join-Path $env:GWS_CONNECT_HOME 'bin\gws-anna-a-de.cmd')
  if (-not $wrapper.Contains((Join-Path $env:GWS_CONNECT_HOME 'app\runtime\node\node.exe'))) { throw 'wrapper not relinked' }

  Write-Host '--- tampered zip is refused and the app survives'
  $marker = Join-Path $env:GWS_CONNECT_HOME 'app\.marker'
  New-Item -ItemType File $marker | Out-Null
  $bad = Join-Path $tmp 'bad'
  New-Item -ItemType Directory $bad | Out-Null
  Copy-Item (Join-Path $Dist '*') $bad
  Get-ChildItem $bad -Filter *.zip | ForEach-Object { Add-Content -LiteralPath $_.FullName -Value 'x' -NoNewline }
  $badServer = Serve $bad 8766
  try {
    if ((Install 'http://127.0.0.1:8766') -eq 0) { throw 'a tampered zip must be refused' }
  } finally { Stop-Process $badServer }
  if (-not (Test-Path $marker)) { throw 'app lost after a refused install' }

  Write-Host 'install-check ok'
} finally {
  Stop-Process $good
}
```

- [ ] **Step 3: Run the Windows check locally**

Run (after `node tools/make-bundle.mjs --platform win-x64` and copying `install/*` into `dist/`): `$env:RUNNER_TEMP = $env:TEMP; powershell -NoProfile -ExecutionPolicy Bypass -File tools/ci/install-check.ps1 dist`
Expected: ends with `install-check ok`. Fix the script (not the check) if a step is wrong; the tamper step must print a `checksum mismatch` line.

- [ ] **Step 4: Write `.github/workflows/release.yml`**

```yaml
# Tag vX.Y.Z (matching package.json) to publish. Run by hand to test
# everything without publishing.
name: release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test
      - name: tag matches package.json
        if: startsWith(github.ref, 'refs/tags/')
        run: test "v$(node -p "require('./package.json').version")" = "$GITHUB_REF_NAME"
      - run: node tools/make-bundle.mjs --all
      - run: cp install/install.sh install/install.ps1 install/INSTALL.md dist/
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  # The only place the Mac bundles run on a real Mac before anyone gets them.
  install-check:
    needs: build
    strategy:
      fail-fast: false
      matrix:
        os: [macos-15, macos-15-intel, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist
      - if: runner.os == 'macOS'
        run: bash tools/ci/install-check.sh dist
      - if: runner.os == 'Windows'
        shell: powershell
        run: powershell -NoProfile -ExecutionPolicy Bypass -File tools/ci/install-check.ps1 dist

  publish:
    needs: install-check
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist
      - env:
          GH_TOKEN: ${{ github.token }}
        run: >
          gh release create "$GITHUB_REF_NAME" dist/*
          --repo "$GITHUB_REPOSITORY" --title "$GITHUB_REF_NAME"
          --notes "Install: paste into Claude - Bitte installiere gws-connect für mich: https://github.com/$GITHUB_REPOSITORY/releases/latest/download/INSTALL.md"
```

Check before committing: the runner labels `macos-15` (arm64) and `macos-15-intel` (x64) are current in GitHub's docs (`https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners`); replace with the current arm64/Intel labels if not. If `npm test` fails on Linux, fix the test or code — Linux is not a target, but the suite should not depend on the host OS.

- [ ] **Step 5: Commit**

```bash
git add tools/ci/install-check.sh tools/ci/install-check.ps1 .github/workflows/release.yml
git commit -m "ci: release workflow that installs each bundle on a real Mac and Windows first"
```

- [ ] **Step 6: Run the workflow once (needs the user)**

Pushing the branch is outward-facing: **ask the user first.** With approval: `git push -u origin feat/shareable-bundle`, then `gh workflow run release.yml --ref feat/shareable-bundle` and `gh run watch`. Expected: `build` and all three `install-check` jobs green, `publish` skipped. Report the run URL. Fix and re-run on failure.

---

### Task 8: Documentation, skill and bundle hand-off

**Files:**
- Modify: `docs/de/ANLEITUNG.md`, `docs/en/GUIDE.md`
- Modify: `README.md`
- Modify: `skills/gws-konten/SKILL.md`
- Modify: `tools/bundle/files.mjs` (`claudeMd()`), `tests/bundle-files.test.mjs`
- Modify: `docs/superpowers/specs/2026-09-23-one-sentence-install-design.md` (§4.5 transport line, §5 table row)
- Test: `tests/docs.test.mjs` (existing — read it first; extend if it checks guide contents)

**Interfaces:**
- Consumes: everything above.
- Produces: docs only; no code interfaces.

- [ ] **Step 1: Read `tests/docs.test.mjs`** and note what it asserts about the guides (links, headings, Node mentions). The rewrite must keep those passing or the test is updated with a reason in the commit message.

- [ ] **Step 2: Write the failing test for the bundle hand-off**

Append to `tests/bundle-files.test.mjs`:

```js
test('the bundle CLAUDE.md prefers the setup popup and knows about relink', () => {
  const md = files.claudeMd('mac-arm64')
  assert.match(md, /setup --dialog/)
  assert.match(md, /exit code 3/i)
  assert.match(md, /relink/)
})
```

Run: `node --test tests/bundle-files.test.mjs` — Expected: FAIL.

- [ ] **Step 3: Update `claudeMd()` in `tools/bundle/files.mjs`**

Change step 2 of "What to do" to ``2. If the doctor is happy, run the setup: `${node} bin/gws-connect.mjs setup --dialog` ``, and replace the paragraph starting "What you SHOULD do is give them the prompt" with:

```
A window of its own asks for the code; tell the user to paste it there and
click OK. If the command ends with exit code 3, no window could be shown -
then open the starter in a terminal window instead:

    ${openStarter}

and tell them to paste the code there - ${paste} - and press Enter.

If the user moved this folder after connecting accounts, run
\`${node} bin/gws-connect.mjs relink\` once; it repairs the account launchers.
```

Run: `npm test` — Expected: PASS (the existing "opens the starter" test still finds `openStarter`).

- [ ] **Step 4: Rewrite the guides**

`docs/en/GUIDE.md` — replace Steps 1–3 ("Node.js", "start the program", "paste the setup code") with:

```markdown
## Step 1 — ask Claude

Open Claude (Claude Code, or the Code tab in Claude Desktop) and paste this
sentence:

> Please install gws-connect for me:
> https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md

Claude installs everything by itself. You do not need to install Node or
anything else, and you get no security warning.

## Step 2 — paste the setup code

A small window appears: **"Please paste the setup code…"**. Paste the code
from your password manager (a long line starting with `GWSC1.`) and click
**OK**.

- **The code is like a password.** Paste it only into that window — never into
  the chat with Claude.
- If the window says the code is incomplete: copy it again in full, from the
  start to the very last character.
```

Renumber the following steps (add accounts → Step 3, eight-day check → Step 4). In "add accounts", replace "Menu item 1 …" with "Claude asks for your email address and opens the browser." Keep the numbered sign-in list unchanged. Add at the end, before "If something does not work":

```markdown
## Without Claude

Open **Terminal** (Mac) or **PowerShell** (Windows), paste the one line for
your system from
[INSTALL.md](https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md),
press Enter. Then start `~/.gws-connect/gws-connect` (Mac) or
`%USERPROFILE%\.gws-connect\gws-connect.cmd` (Windows) — the menu asks for the
setup code first.

## Updating

Paste the same sentence into Claude again. Your accounts are kept.
```

Make the equivalent change in `docs/de/ANLEITUNG.md` with the German sentence
**„Bitte installiere gws-connect für mich: https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md"**, headings „Schritt 1 — Claude fragen", „Schritt 2 — Einrichtungs-Code einfügen", „Ohne Claude", „Aktualisieren", same content in German, matching the existing tone (du/Sie as the file already uses).

- [ ] **Step 5: README — hand-out message and release steps**

In `README.md`, replace the "Start here" table's follow-up line ("Then double-click …") with "Then paste one sentence into Claude — the guide says which." Under "For the person handing it out", after the setup-code block, add:

````markdown
### What to send

Two messages, two channels. The first one is harmless:

> **DE:** Öffne Claude und füge diesen Satz ein:
> „Bitte installiere gws-connect für mich: https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md"
> Wenn ein Fenster nach dem Einrichtungs-Code fragt: den Code aus dem Passwortmanager einfügen.
>
> **EN:** Open Claude and paste this sentence:
> "Please install gws-connect for me: https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md"
> When a window asks for the setup code: paste the code from the password manager.

The second one is the setup code — through the password manager.

### Publishing a release

```bash
# bump "version" in package.json first
git tag v0.2.0 && git push origin v0.2.0
```

The workflow tests, builds all three bundles, installs each one on a real
macOS (Apple Silicon and Intel) and Windows runner, and publishes only if all
of that passes. Before the very first public release, make the repository
public and check its history for pasted codes: `git log -p | grep GWSC1.`
````

Add `gws-connect setup --dialog` and `gws-connect relink` to the "Commands" block.

- [ ] **Step 6: Skill — how to connect one more account**

Append to `skills/gws-konten/SKILL.md`:

```markdown
## Connect another account

If the user wants one more account, use the installed launcher — macOS
`~/.gws-connect/gws-connect`, Windows `%USERPROFILE%\.gws-connect\gws-connect.cmd`:

    <launcher> add <address> --yes

Before running it, tell them: sign out of Google in the browser first, pick
exactly that address, and continue past "Google hasn't verified this app" via
Advanced → Go to … . If the launcher does not exist, gws-connect was set up
from a folder rather than installed; ask the user to paste the install sentence
from their guide again.
```

- [ ] **Step 7: Spec corrections**

In the spec §4.5, replace the Windows bullet's last sentence "Das Skript kommt über **stdin**, nicht über die Kommandozeile." with "Das Skript kommt als `-EncodedCommand`; es enthält nur die Fenstertexte, nie den Code." and in the macOS bullet add "(Skript per `-e`)". In §5 replace the row `| Paket-\`CLAUDE.md\` | bleibt, verweist aber auf \`INSTALL.md\`-Inhalte (eine Quelle, siehe 4.6) |` with `| Paket-\`CLAUDE.md\` | bleibt für den Offline-Weg, nutzt jetzt \`setup --dialog\` und nennt \`relink\` |`.

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add docs README.md skills/gws-konten/SKILL.md tools/bundle/files.mjs tests/bundle-files.test.mjs
git commit -m "docs: the guides now start with one sentence to Claude"
```

- [ ] **Step 10: Hand-checks to report (cannot be automated)**

List these in the final report as open, with who can do them:
- macOS popup (`setup --dialog` on a real Mac) — needs a Mac.
- Full flow from a fresh Claude Code session with only the sentence, on Windows (can be done here once a release exists) and on a Mac.
