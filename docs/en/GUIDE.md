# Guide — connecting Google accounts

For you, if you were handed a **sentence for Claude** and a **setup code**.
About 5 minutes for the setup, then 2 minutes per account.

You do **not** create a Google Cloud project and you do **not** type any credentials. That
part is already prepared.

---

## What this does

It connects your Google accounts to Google's official
[Google Workspace CLI](https://github.com/googleworkspace/cli) so Claude can **read** in
them — Gmail, Google Drive and Calendar.

Access is **read-only**. Nothing can be deleted, changed or sent. Each account lives in its
own separate store; no account can accidentally answer for another.

---

## Step 1 — ask Claude

Open Claude (Claude Code, or the Code tab in Claude Desktop) and paste this
sentence:

> Please install gws-connect for me:
> https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md

Claude installs everything by itself. You do not need to install Node or
anything else, and you get no security warning.

---

## Step 2 — paste the setup code

A small window appears: **"Please paste the setup code…"**. Paste the code
from your password manager (a long line starting with `GWSC1.`) and click
**OK**.

- **The code is like a password.** Paste it only into that window — never into
  the chat with Claude.
- After importing, it is not stored; it is used up.
- If the window says the code is incomplete: copy it again in full, from the
  start to the very last character.

---

## Step 3 — add accounts

Claude asks for your email address and opens the browser. Once per account, as often as
you like.

For each account:

1. Give the **email address**.
2. **Sign out of Google in your browser first.** Otherwise Google silently takes whichever
   account you are currently signed in as. The program detects this and refuses, but
   starting signed out saves you the round trip.
3. The browser opens. **Pick exactly the address you gave** — use "Use another account"
   if needed.
4. You will see: **"Google hasn't verified this app."**
   **That is expected here.** Continue via **Advanced → Go to …**. Do not cancel.
5. Grant consent. The list shows three permissions, all of them "view" / read.
6. The program then checks for itself **which account actually answered**. If it does not
   match, the connection is dropped immediately and you are told what happened.

Done. For every further account just tell Claude: "Connect my account … as well".

---

## Step 4 — check once after 8 days

The program reminds you by itself. When the reminder appears: say **yes**.

**Why:** if something is misconfigured in the Google Cloud project, everything works at
first — and Google cuts access off after exactly 7 days, silently. So a check on day one
proves nothing. Only a successful check **after** the eighth day shows that it holds. After
that the program stops asking.

---

## What you have afterwards

Everything lives under `~/.gws-connect/` in your user folder. There is one command per
account under `bin/`; Claude uses it to read in that one account.

Just ask Claude about your mail, files and appointments.

The menu with the overview, the access check and "Remove an account" starts with
`~/.gws-connect/gws-connect` (Mac) or `%USERPROFILE%\.gws-connect\gws-connect.cmd`
(Windows) — or ask Claude to open it.

---

## Updating

Paste the same sentence from step 1 into Claude again. Your accounts are kept.

---

## Without Claude

Open **Terminal** (Mac) or **PowerShell** (Windows), paste the one line for
your system from
[INSTALL.md](https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md),
press Enter. Then start `~/.gws-connect/gws-connect` (Mac) or
`%USERPROFILE%\.gws-connect\gws-connect.cmd` (Windows) — the menu asks for the
setup code first.

---

## If something does not work

First the menu's **Check environment** — it says concretely what is missing.
Then [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

And: **do not guess and do not change anything else.** A wrongly set switch only shows up
after a week, and by then the cause is hard to find. Better to report it.
