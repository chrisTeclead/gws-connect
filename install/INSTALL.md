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
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; irm https://github.com/chrisTeclead/gws-connect/releases/latest/download/install.ps1 | iex"`

It needs no administrator rights and ends with a line starting `installed`.
Running it again later is how you update; connected accounts are kept.

**Install nothing else.** No `npm`, no `brew`, no `winget`, no Node, no gws —
everything is bundled. If the installer fails, tell the user the one-line
reason it printed and stop.

From here on use only the launcher:

- macOS: `~/.gws-connect/gws-connect`
- Windows: `~/.gws-connect/gws-connect.cmd` (works as written in Git Bash and
  in PowerShell)

Add `--lang de` or `--lang en` to every call, matching the user's language.

## 2. Check

`<launcher> doctor --yes`

Read its output. "No credentials yet" is expected at this point. If it reports
any other problem, see step 6.

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
  - Windows, from PowerShell:
    `Start-Process "$env:USERPROFILE\.gws-connect\gws-connect.cmd"`
  - Windows, from Git Bash:
    `powershell.exe -NoProfile -Command 'Start-Process "$env:USERPROFILE\.gws-connect\gws-connect.cmd"'`

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
