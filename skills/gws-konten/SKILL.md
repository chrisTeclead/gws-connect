---
name: gws-konten
description: Use when reading Gmail, Google Drive or Google Calendar across the Google accounts connected with gws-connect. Triggers on questions about mail, files, appointments, invoices, receipts or deadlines that involve one or more connected Google accounts.
---

# Connected Google accounts

Accounts connected by `gws-connect` live under `~/.gws-connect/accounts/`. Each
directory holds a `meta.json` with the address, the areas that were granted and
the timestamps. There is no central index — the directory listing *is* the
account list.

## Find out which accounts exist

Read every `~/.gws-connect/accounts/*/meta.json`:

```json
{
  "email": "tony@terra-one.de",
  "credSet": "default",
  "services": ["gmail", "drive", "calendar"],
  "accountType": "workspace",
  "connectedAt": "2026-08-19T09:12:00.000Z",
  "verifiedAt": null
}
```

The `email` field names the account. The directory name is its id. `services`
lists what may be read: `gmail`, `drive`, `calendar`.

## Query one account

Run that account's wrapper. On macOS it is `~/.gws-connect/bin/gws-<id>`, on
Windows `~/.gws-connect/bin/gws-<id>.cmd`, where `<id>` is the directory name.

```
~/.gws-connect/bin/gws-tony-terra-one-de gmail users list --params '{"userId":"me","q":"invoice"}'
~/.gws-connect/bin/gws-tony-terra-one-de calendar events list --params '{"calendarId":"primary"}'
~/.gws-connect/bin/gws-tony-terra-one-de drive files list --params '{"q":"name contains 2026"}'
```

The wrapper pins that one account. It cannot accidentally answer for another.

## Rules

- **One account per call.** Never merge results from two accounts into a single
  list without labelling which account each item came from. Two accounts can
  hold different versions of the same document or invoice, and silently mixing
  them produces answers nobody can check.
- **Read-only.** Every grant uses a `readonly` scope. Write calls fail by
  design — do not look for a way around it.
- **Only what is connected.** If a question needs an account that has no
  directory, say so and point at `gws-connect`. Do not guess at contents.
- **Respect `services`.** An account whose `services` omits an area cannot
  answer for it. Check before calling, and say which area is missing.
- **`verifiedAt: null` on an old account is worth mentioning.** It means the
  access has never been confirmed past Google's 7-day cutoff, so a failure may
  be a configuration problem rather than an empty result.

## Connect another account

If the user wants one more account, use the installed launcher — macOS
`~/.gws-connect/gws-connect`, Windows `~/.gws-connect/gws-connect.cmd` (as written, in Git Bash or PowerShell):

    <launcher> add <address> --yes

Before running it, tell them: sign out of Google in the browser first, pick
exactly that address, and continue past "Google hasn't verified this app" via
Advanced → Go to … . If the launcher does not exist, gws-connect was set up
from a folder rather than installed; ask the user to paste the install sentence
from their guide again.
