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

// Exit codes: 0 answer, 2 cancel, 3 no dialog. PowerShell itself exits 1 on
// an uncaught error, so 1 must never mean "the user said no".
function windowsScript ({ title, prompt, ok, cancel }) {
  return [
    'try {',
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
    '$answer = $f.ShowDialog()',
    '} catch { exit 3 }',
    "if ($answer -eq 'OK') { [Console]::Out.Write($t.Text); exit 0 } else { exit 2 }"
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
  if (platform === 'win32' && status === 2) return { status: 'cancel' }
  return { status: 'unavailable' }
}

// windowsHide would set SW_HIDE for the child, and Windows applies that to the
// first window powershell shows - the form. The child shares our console, so
// nothing extra flashes up.
export const SPAWN_OPTIONS = Object.freeze({ stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })

function runProcess ({ file, args }) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(file, args, SPAWN_OPTIONS)
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
