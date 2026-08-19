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
