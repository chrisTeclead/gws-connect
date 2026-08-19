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
