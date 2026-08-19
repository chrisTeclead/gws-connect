import { t, initI18n, setLang, detectLang, LANGS } from './core/i18n.mjs'
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
    ui.dim(`${t('menu.credsets_hint')}`)
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
      case '5': await doctorCommand({}); await ui.pause(); break
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

function help () {
  ui.title(t('menu.title'))
  ui.line(`  gws-connect                       ${t('menu.title')}`)
  ui.line(`  gws-connect setup --code <code>   ${t('setup.title')}`)
  ui.line(`  gws-connect add <email>           ${t('menu.add')}`)
  ui.line(`  gws-connect list                  ${t('menu.list')}`)
  ui.line(`  gws-connect verify [<email>]      ${t('menu.verify')}`)
  ui.line(`  gws-connect remove <email>        ${t('menu.remove')}`)
  ui.line(`  gws-connect doctor                ${t('menu.doctor')}`)
  ui.line(`  gws-connect credentials           ${t('menu.credsets')}`)
  ui.line(`  gws-connect --lang de|en          ${t('menu.lang')}`)
  ui.blank()
  ui.dim('--yes: ask nothing, take the defaults (for scripts)')
}

export async function main (argv) {
  const { command, positional, flags } = parseArgs(argv)

  const wanted = typeof flags.lang === 'string' ? flags.lang : detectLang()
  await initI18n(wanted)
  if (typeof flags.lang === 'string' && LANGS.includes(flags.lang)) await setLang(flags.lang)

  const interactive = !flags.yes
  const force = Boolean(flags.yes || flags.force)

  if (flags.help || command === 'help' || command === '--help') {
    help()
    return 0
  }

  switch (command) {
    case null:
      await menu()
      return 0

    case 'setup':
      return await setupCommand({
        code: typeof flags.code === 'string' ? flags.code : undefined
      }) ? 0 : 1

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
      if (r.total === 0) return 0
      return r.ok === r.total ? 0 : 1
    }

    case 'remove':
      return await removeCommand({ email: positional[0], force }) ? 0 : 1

    case 'doctor': {
      const r = await doctorCommand({ interactive })
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
      help()
      return 2
  }
}
