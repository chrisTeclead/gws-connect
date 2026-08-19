// Everything the user sees. Text arrives already translated - this module
// never contains a sentence, only formatting.
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { t } from './i18n.mjs'

const colour = stdout.isTTY && !process.env.GWS_CONNECT_NO_COLOR && !process.env.NO_COLOR

const ESC = String.fromCharCode(27)
const sgr = (n) => `${ESC}[${n}m`

const C = colour
  ? {
      reset: sgr(0),
      bold: sgr(1),
      dim: sgr(2),
      red: sgr(31),
      green: sgr(32),
      yellow: sgr(33),
      blue: sgr(34)
    }
  : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', blue: '' }

export function clear () { if (stdout.isTTY) stdout.write(`${ESC}[2J${ESC}[H`) }
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
    const hide = () => {
      readline.moveCursor(stdout, -1, 0)
      stdout.write(' ')
      readline.moveCursor(stdout, -1, 0)
    }
    stdin.on('data', hide)
    try {
      const answer = await rl.question(`${C.bold}${question}${C.reset} `)
      stdout.write('\n')
      return answer.trim()
    } finally {
      stdin.off('data', hide)
    }
  })
}

// Accepts German and English affirmatives, because one binary serves both
// languages and a German user typing "j" at an English prompt should work.
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
