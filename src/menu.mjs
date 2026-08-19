import { t, initI18n, setLang, detectLang, LANGS } from './core/i18n.mjs'
import * as ui from './core/ui.mjs'
import * as accounts from './core/accounts.mjs'
import * as credsets from './core/credsets.mjs'
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

// True on a machine that has never imported credentials. Without them no
// account can be connected, so the menu asks for the code before anything else
// rather than letting the user hit a refusal on "add account".
export async function needsSetup () {
  return (await credsets.list()).length === 0
}

async function switchLanguage () {
  const lang = await ui.choose(t('menu.lang'), LANGS.map(l => ({ value: l, label: l })))
  await setLang(lang)
  await initI18n(lang)
}

// The menu as data, so its contents can be asserted in a test instead of only
// being visible to someone running it by hand.
export function menuItems () {
  return [
    { key: '1', label: t('menu.add'), run: () => addCommand({}) },
    { key: '2', label: t('menu.list'), run: () => listCommand() },
    { key: '3', label: t('menu.verify'), run: () => verifyCommand({}) },
    { key: '4', label: t('menu.remove'), run: () => removeCommand({}) },
    { key: '5', label: t('menu.doctor'), run: () => doctorCommand({}) },
    { key: '6', label: t('menu.setup'), hint: t('menu.setup_hint'), run: () => setupCommand({}) },
    { key: '7', label: t('menu.credsets'), hint: t('menu.credsets_hint'), run: () => credsetsCommand({}) },
    { key: '8', label: t('menu.lang'), run: switchLanguage, quiet: true }
  ]
}

export async function menu () {
  // First run: no credentials at all. Ask for the setup code straight away.
  if (await needsSetup()) {
    ui.clear()
    ui.title(t('menu.title'))
    await setupCommand({})
    await ui.pause()
  }

  for (;;) {
    ui.clear()
    ui.title(t('menu.title'))
    await staleNag()

    const items = menuItems()
    for (const item of items) {
      ui.line(`  ${item.key}  ${item.label}`)
      if (item.hint) ui.dim(item.hint)
    }
    ui.line(`  q  ${t('common.quit')}`)
    ui.blank()

    const choice = (await ui.ask(t('common.choice'))).toLowerCase()
    ui.blank()

    if (choice === 'q') return

    const item = items.find(i => i.key === choice)
    if (!item) {
      ui.warn(t('menu.unknown_choice'))
      await ui.pause()
      continue
    }
    await item.run()
    if (!item.quiet) await ui.pause()
  }
}

function help () {
  ui.title(t('menu.title'))
  ui.line(`  gws-connect                       ${t('menu.title')}`)
  ui.line(`  gws-connect setup                 ${t('menu.setup')}`)
  ui.line(`  gws-connect setup --code <code>   ${t('menu.setup')}`)
  ui.line(`  gws-connect add <email>           ${t('menu.add')}`)
  ui.line(`  gws-connect list                  ${t('menu.list')}`)
  ui.line(`  gws-connect verify [<email>]      ${t('menu.verify')}`)
  ui.line(`  gws-connect remove <email>        ${t('menu.remove')}`)
  ui.line(`  gws-connect doctor                ${t('menu.doctor')}`)
  ui.line(`  gws-connect credentials           ${t('menu.credsets')}`)
  ui.line(`  gws-connect --lang de|en          ${t('menu.lang')}`)
  ui.blank()
  ui.dim(t('menu.yes_flag'))
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
