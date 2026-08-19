# Guide — connecting Google accounts

For you, if you were handed this folder and a **setup code**.
About 5 minutes for the program, then 2 minutes per account.

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

## Step 1 — Node.js

If you do not know whether you have Node.js: just carry on, the program will tell you.

If it is missing, get it here: **[nodejs.org](https://nodejs.org)** → the **LTS** version.
Install it, close the window, continue with step 2.

---

## Step 2 — start the program

- **Mac:** double-click `Start-Mac.command`
- **Windows:** double-click `Start-Windows.cmd`

> **Mac, first time:** macOS may complain about an "unidentified developer". Right-click the
> file → **Open** → **Open**. Only needed once.

The program checks your environment and sets up what is missing, if you agree.

---

## Step 3 — paste the setup code

You will receive a long line starting with `GWSC1.`. It comes through a password manager,
not by email.

On the first start the program asks by itself: **Setup code:** → paste → Enter.
Later, any time, via menu item **6 (Enter the setup code)**.

From a terminal it also works directly:

```bash
node bin/gws-connect.mjs setup
```

- **The code is like a password.** Do not forward it, do not paste it into a chat.
- After importing, it is not stored; it is used up.
- If you get a message about a wrong **checksum**, the code was cut off while copying. Copy
  it again in full — from `GWSC1.` to the very last character.

---

## Step 4 — add accounts

Menu item **1 (Add an account)**, as often as you like — once per account.

For each account:

1. Enter the **email address**.
2. The program tells you what happens next. Read it, it is two sentences.
3. **Sign out of Google in your browser first.** Otherwise Google silently takes whichever
   account you are currently signed in as. The program detects this and refuses, but
   starting signed out saves you the round trip.
4. The browser opens. **Pick exactly the address you entered** — use "Use another account"
   if needed.
5. You will see: **"Google hasn't verified this app."**
   **That is expected here.** Continue via **Advanced → Go to …**. Do not cancel.
6. Grant consent. The list shows three permissions, all of them "view" / read.
7. The program then checks for itself **which account actually answered**. If it does not
   match, the connection is dropped immediately and you are told what happened.

Done. Repeat for every further account.

---

## Step 5 — check once after 8 days

The program reminds you by itself. When the reminder appears: say **yes**.

**Why:** if something is misconfigured in the Google Cloud project, everything works at
first — and Google cuts access off after exactly 7 days, silently. So a check on day one
proves nothing. Only a successful check **after** the eighth day shows that it holds. After
that the program stops asking.

---

## What you have afterwards

One command per account under `~/.gws-connect/bin/`. Claude uses it to read in that one
account.

Menu item **2 (Overview)** shows what is connected.
Menu item **3 (Check access)** really asks Google.
Menu item **4 (Remove an account)** revokes consent at Google and deletes everything.

---

## If something does not work

First menu item **5 (Check environment)** — it says concretely what is missing.
Then [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

And: **do not guess and do not change anything else.** A wrongly set switch only shows up
after a week, and by then the cause is hard to find. Better to report it.
