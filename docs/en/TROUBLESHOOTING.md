# If something does not work

First run menu item **5 (Check environment)**. It says concretely what is missing and needs
no sign-in.

---

## "Google hasn't verified this app"

**This is expected.** Continue via **Advanced → Go to …**.

The prepared app is deliberately not verified by Google. Verification would be needless
effort for this purpose, and without it everything works — permanently, as long as the Cloud
project is set to `In production`. The warning stays there forever regardless.

Do not cancel. If you cancel here, no account is connected.

---

## Wrong account connected

Message: **"WRONG account connected: … expected …"**

The program detected this itself and dropped the connection — nothing is broken.

The cause is almost always that you were still signed in to a different Google account in
your browser, and the consent screen silently used that one.

**How to fix:**

1. **Sign out** of Google in the browser (all accounts).
2. Menu item **1** again, same address.
3. On the consent screen pick **exactly that address** — use "Use another account" if needed.

---

## Access worked and disappeared after about a week

This is the 7-day trap, and it has exactly one cause: the Cloud project's publishing status
is on `Testing` instead of `In production`.

You cannot fix this yourself — **report it to the operator** who issued the setup code. It
then affects everyone using the same code.

With your own project: [OWN-PROJECT.md](OWN-PROJECT.md), step 6.

---

## `access_denied` or "blocked by your administrator"

This account's Workspace domain does not allow unverified third-party apps.

Two routes:

- Ask that domain's Workspace administrator to allow the app (they need the client ID).
- Or create your own Cloud project inside that domain:
  [OWN-PROJECT.md](OWN-PROJECT.md). For a company account this is the clean route, because
  `Internal` works there with no warning and no user cap.

---

## "Gmail does not respond" / "Drive does not respond" / "Calendar does not respond"

The named API is not enabled in the Cloud project. The message always names the specific
API — that is the one missing.

For the shared project: report it to the operator
([ADMIN-CLOUD-PROJECT.md](ADMIN-CLOUD-PROJECT.md), step 2).
For your own project: [OWN-PROJECT.md](OWN-PROJECT.md), step 3.

Note: the account is still connected and usable for the other areas.

---

## "The code is incomplete or altered"

The setup code was cut off while copying — typical when it arrived through a chat or an email
with a line break.

Copy it **in full** again: from `GWSC1.` to the very last character, with no spaces and no
line break in the middle.

The code is deliberately checked up front. Without that check, a truncated code would only
surface later as an incomprehensible OAuth error.

---

## "No credentials stored yet"

You have not entered the setup code yet. Without it no account can be connected.

```
gws-connect setup
```

Or start the menu; it asks by itself the first time.

---

## Node.js missing or too old

Version 20 or newer is required. Get the **LTS** version from
[nodejs.org](https://nodejs.org), install it, close the window and restart the program.

---

## `gws` will not install

Menu item 5 offers to install it. If that fails, by hand:

```bash
npm install -g @googleworkspace/cli
```

On a Mac, alternatively `brew install googleworkspace-cli`.

If it fails on permissions, that is almost always an `npm` directory problem and not
something this program controls — ask someone who knows `npm` on that machine.

---

## macOS: "unidentified developer" on double-click

Right-click `Start-Mac.command` → **Open** → **Open**. Only the first time.

---

## Removing an account again

Menu item **4 (Remove an account)**. It first revokes consent at Google, then deletes the
local data.

If the program reports that revoking failed: revoke it by hand at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions). Otherwise a
valid grant stays at Google that nobody can see any more.

---

## Nothing helps

Say **what you did, what was on the screen, and which account it was about** — verbatim, not
summarised. The error messages are deliberately specific; the exact wording usually leads
straight to the cause.

**Do not guess and do not change anything else.** A wrongly set switch in the Cloud project
only shows up after a week, and by then the cause is hard to find.
