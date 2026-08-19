# For the operator — the shared Cloud project

One-time, about 15 minutes. After that you only generate a setup code per person — or hand
everyone the same one.

**Nothing works without these settings.** They are the prerequisite, not a recommendation.

---

## The rule everything hangs on

`Internal` as the audience only exists when the project sits in the same Workspace
organisation as the account signing in. A personal `@gmail.com` account has no
organisation; a colleague on a different company domain is not in *yours*.

A project meant to serve **arbitrary** account types must therefore be set to
**`External`** — and then the publishing status decides everything:

| Publishing status | Consequence |
|---|---|
| `Testing` | works, and Google cuts access off after **7 days**, silently |
| **`In production`** | the refresh token lasts indefinitely, even unverified |

That is the entire difference between permanent and one week.

---

## Setup

### 1. Create the project

[console.cloud.google.com](https://console.cloud.google.com) → project picker top left →
**New project**. Wait until it is selected at the top. Everything that follows applies to
whichever project is shown top left.

No billing account needed — the Gmail, Drive and Calendar APIs are free.

### 2. Enable three APIs

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

If it says **Manage** instead of Enable, it is already on.

### 3. Audience set to `External`

**Google Auth Platform → Audience** (older views: *APIs & Services → OAuth consent screen*)

- App name: something users will recognise on the consent screen
- Support email and contact address: yours
- Audience: **`External`**

### 4. Register the scopes

**Data access → Add or remove scopes.** Exactly these three, all read-only:

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/calendar.readonly
```

If an entry without `readonly` shows up, it is the wrong one.

### 5. Publishing status to `In production`

**Audience → Publish app** → confirm. Afterwards it must read **`In production`**, not
`Testing`.

Google will then offer or nag about **verification**. It is not required. Without it, every
sign-in permanently shows "Google hasn't verified this app" — users click through via
*Advanced → Go to …*.

### 6. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type: **Desktop app**
- The client ID and client secret appear; both retrievable again at any time

### 7. Generate a setup code

```bash
node tools/make-setup-code.mjs \
  --id default \
  --label "My Team" \
  --audience external \
  --client-id "<CLIENT_ID>" \
  --client-secret "<CLIENT_SECRET>"
```

The result is one line starting with `GWSC1.`. **Share it through a password manager, never
by email or chat.** Anyone holding the code can act as this OAuth client.

---

## Checklist before handover

- [ ] Gmail, Drive and Calendar APIs are enabled
- [ ] Audience is **`External`**
- [ ] The three `readonly` scopes are registered
- [ ] Publishing status is **`In production`** — not `Testing`
- [ ] An OAuth client of type **Desktop app** exists
- [ ] The setup code is in the password manager, not in an email

---

## What you have to keep an eye on

**The 100-user cap.** An unverified `External` app may serve at most **100** distinct Google
accounts. Counting is per account that granted consent — ten colleagues with three accounts
each is 30 of 100. If you approach it, you need a second project or Google verification.

**The publishing status is now a shared risk.** If it falls back to `Testing`, **every**
connection dies at once and without notice. Check it whenever several people report problems
at the same time.

**Foreign Workspace administrators can block the app.** A colleague whose company blocks
unverified third-party apps will not get through with your code. For that case there is
[OWN-PROJECT.md](OWN-PROJECT.md).

**Frankly:** an unverified app with Gmail read access is a grey area that Google tolerates
but does not guarantee. That now applies to everyone you hand the code to — no longer just
one isolated case. If that is not acceptable for your situation, Google verification is the
clean route.

---

## What you cannot check yourself

The sign-ins live on the users' machines, not yours. Whether a setup works can only be shown
by `gws-connect verify` there. What you can check is everything in the checklist above — and
that is enough to rule out the common failures.
