# Creating your own Cloud project

**You only need this in two cases:**

1. A Workspace administrator blocks the prepared app. Recognisable by `access_denied` or
   "This app was blocked by your administrator".
2. The 100-user cap has been reached.

Otherwise skip this page — the setup code is enough.

One-time, about 15 minutes. It is only forms, and you cannot break anything: something new
is created, nothing existing is changed.

---

## First decide which case you are

| Your account | Audience | To make it permanent |
|---|---|---|
| company account on a Google Workspace domain | **`Internal`** | nothing else needed |
| personal `@gmail.com` | **`External`** (forced) | publishing status **`In production`** |

**The project must be created inside the account it is for.** So click your profile picture
top right first and check the address shown. Creating two projects for two accounts under the
same login is the most common mistake and makes `Internal` impossible.

---

## 1. Open the Cloud Console

[console.cloud.google.com](https://console.cloud.google.com)

On the first visit Google asks for your **country** and the **terms of service** — confirm.

> If asked for a **billing account** or a credit card: **skip it.** What we need is free.
> Do not enter anything.

## 2. Create the project

Project picker top left → **New project** → name, e.g. `gws-connect`. **Create**, then wait
until the project is selected at the top.

Important: everything that follows applies to whichever project is shown top left.

## 3. Enable three APIs

Open each in turn and click **Enable**:

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

If it already says **Manage**, it is on.

## 4. Set the audience

**Google Auth Platform → Audience**

- App name: e.g. `gws-connect`
- Support email: your address
- Audience: **`Internal`** for a company account, **`External`** for a personal one

> **Is "Internal" greyed out?** Then the account is not a Workspace account. For a personal
> account that is correct — take `External` and continue with step 5.
> For a company account it means you are in the wrong login. Sign out, sign in with the
> right account, start again from step 2.

**With `Internal` you are done here** — no scope list, no publishing, no review by Google.
Continue with step 7.

## 5. Only for `External`: register the scopes

**Data access → Add or remove scopes.** Type into the filter box, tick the boxes:

```
gmail.readonly
drive.readonly
calendar.readonly
```

**Update**, then **Save**. All three contain `readonly` — read only. If an entry without
`readonly` shows up, it is the wrong one.

## 6. Only for `External`: publish the app

**Audience → Publish app** → confirm. Afterwards it must read **"In production"**, not
"Testing".

**Why this is the most important click:** if it stays on "Testing", everything works at
first — and Google cuts access off after exactly 7 days. The mistake surfaces when nobody
remembers it any more.

Google will then offer **verification**. We do not need it. Consequence: sign-in shows
"Google hasn't verified this app" — expected, click through via *Advanced → Go to …*.

## 7. Create the credentials

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type: **Desktop app**
- **Create**

A window appears with the **client ID** and **client secret**. Leave it open.

> Closing it is not a problem: via **Credentials** → click the client you can get both
> values again at any time.

## 8. Enter them in gws-connect

Start the program, menu item **6 (Add your own Cloud project)** → **client ID and secret
separately**.

- Name: something recognisable, e.g. `company`
- Paste the client ID
- Paste the client secret — **you will see nothing** while doing so, that is deliberate
- Audience: `Internal` or `External`, as chosen above

Then menu item **1 (Add an account)**. Now the program asks which credentials to use — pick
your new project.

---

## If something does not match

Do not guess and do not change anything else — report it. Common stumbling blocks:

- **A different project is shown top left** → switch, repeat the step
- **"Internal" greyed out** → see step 4
- **Asked for a credit card** → enter nothing, see step 1
- **Access gone after 7 days** → the publishing status was on "Testing", see step 6

Otherwise: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
