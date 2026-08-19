# gws-connect

Connect any number of Google accounts to the
[Google Workspace CLI](https://github.com/googleworkspace/cli) — read-only, one isolated
credential store per account, on macOS and Windows.

Built for handing out to non-technical colleagues: they paste one setup code and add their
accounts. They never touch the Google Cloud Console.

**Verbinde beliebig viele Google-Konten lesend mit der Google Workspace CLI.**
Für Nicht-Techniker gebaut: einen Einrichtungs-Code einfügen, Konten hinzufügen, fertig.

---

## Start here / Hier anfangen

| | |
|---|---|
| **Deutsch** | [docs/de/ANLEITUNG.md](docs/de/ANLEITUNG.md) |
| **English** | [docs/en/GUIDE.md](docs/en/GUIDE.md) |

Then double-click `Start-Mac.command` (macOS) or `Start-Windows.cmd` (Windows).

---

## For the person handing it out

You need one Google Cloud project set to Audience `External` with publishing status
`In production`, then you generate a setup code that carries its OAuth client. Everyone you
hand that code to can connect any account type without touching the Cloud Console.

→ **[docs/en/ADMIN-CLOUD-PROJECT.md](docs/en/ADMIN-CLOUD-PROJECT.md)** ·
[Deutsch](docs/de/ADMIN-CLOUD-PROJEKT.md)

```bash
node tools/make-setup-code.mjs \
  --label "My Team" --audience external \
  --client-id "<CLIENT_ID>" --client-secret "<CLIENT_SECRET>"
```

The code is a secret — share it through a password manager, never by email. This repository
contains none.

---

## Commands

```
gws-connect                       interactive menu
gws-connect setup --code <code>   import credentials
gws-connect add <email>           connect one account
gws-connect list                  overview
gws-connect verify [<email>]      really ask Google
gws-connect remove <email>        revoke at Google, then delete
gws-connect doctor                check the environment
gws-connect --lang de|en          switch language
```

`--yes` makes any command non-interactive.

---

## How it works

**The filesystem is the source of truth.** Every connected account is a directory under
`~/.gws-connect/accounts/<id>/` holding a `meta.json` and that account's `gws` token store.
The account list *is* the directory listing, so there is no central config that can drift out
of step with reality.

**Nothing is recorded without an identity cross-check.** After every sign-in, gws-connect
asks Google which address actually answered and compares it to the one requested. On a
mismatch it signs out and records nothing. Connecting the wrong account is the most common
failure in this flow, and it is silent unless you check.

**Secrets are split by blast radius.** The client secret goes to the macOS Keychain or a
DPAPI-encrypted file on Windows, because it is shared across everyone using the same setup
code. The OAuth tokens stay as `gws`-managed files, per user — they are *not* in a vault, and
the docs say so rather than implying otherwise.

**Wrappers hold no secrets.** Each generated `gws-<id>` launcher is one line delegating to a
shared runner, so credential handling lives in exactly one place instead of being copied into
every generated script.

**The 7-day trap is automated.** A misconfigured Cloud project cuts access after exactly
7 days, silently, so an account counts as proven only once a check succeeds at least 8 days
after connecting. Until then the menu keeps asking. A hand-written calendar reminder does not
survive contact with non-technical users.

---

## Claude skill

`skills/gws-konten/SKILL.md` teaches Claude which accounts exist, how to query one through
its wrapper, and never to merge results across accounts without labelling them. Copy it into
your project's `.claude/skills/`.

`skills/examples/` holds two working examples to adapt — finding invoices and receipts, and
finding appointments and deadlines across accounts.

---

## Requirements

Node.js ≥ 20 (the `gws` CLI is itself a Node package, so this is not an extra dependency).
No runtime dependencies — Node built-ins only.

## Tests

```bash
npm test
```

Runs against a fake `gws` executable, an isolated temp HOME and a test secrets backend. No
real account, no sign-in, no network.

## License

MIT
