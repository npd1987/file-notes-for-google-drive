# Handoff — File Notes for Google Drive

**As of 27 July 2026.** Read this first when picking the project back up.

## Where things stand

The extension **works and is in daily use**. It is now a **git repository**,
published at
[github.com/npd1987/file-notes-for-google-drive](https://github.com/npd1987/file-notes-for-google-drive),
**public**, **AGPL-3.0**.

| Version | State |
|---|---|
| **1.0.1** | **Approved and published**, unlisted, 27 Jul 2026. This is what the store currently serves. |
| **1.0.2** | **Abandoned.** Its review was cancelled on 27 Jul 2026 rather than waited out, and it will never be submitted. Everything it contained is in 1.1.0. |
| **1.0.3** | **Never built, never uploaded. Subsumed into 1.1.0** — do not look for it. Its multi-account work is in 1.1.0. |
| **1.1.0** | **Uploaded as the draft package, listing and privacy fields filled in, awaiting Submit.** Multi-account support, the paid gating feature, the popup account picker and the keystroke fix. |

### Cancelling a review is a supported move

1.0.2 sat in review holding up 1.1.0, so it was cancelled: **⋮ menu on the Store
listing page → Cancel review**, which returns the item to draft and re-enables
"Upload new package". Up to six cancellations per publisher per day.

Two neighbouring menu items do something entirely different and neither is what
you want: **Roll back version** republishes an older build to installed users,
and **Unpublish** removes the item from the store. The published version is
untouched by cancelling.

Only one submission is ever in flight. A rejected *update* never takes down the
published version, which is why getting 1.0.1 approved untouched mattered.

---

## What 1.1.0 adds

Five separate changes landed together.

### 1. Multi-account support (was going to be 1.0.3)

The extension used to hold **one** OAuth token. With several Google accounts
signed into one Chrome profile, that was not merely limited but actively
broken: Alt + right-click in a `/u/1/` tab sent account 0's token, Drive
returned 404, and the error said "the file ID may have been misread" — which
sent you looking in entirely the wrong place.

Now:

- `DriveNotes.currentAuthUser()` reads the slot from `/u/N/` (or the
  `authuser` query param on opened-file URLs).
- `DriveNotes.currentAccountEmail()` reads the signed-in address off the Drive
  page. This is the second Drive-DOM dependency in the codebase; it fails
  safely to `null`.
- Tokens are cached **per slot** in `chrome.storage.session`.
- After each authorization, `about.get` reports which account the token
  actually belongs to. That address is stored per slot in
  `chrome.storage.local` and used as `login_hint` afterwards.

**Why the discovery step exists:** `authuser` is *not* a documented parameter
on Google's authorization endpoint. If Google ignored it, a silent refresh
would return the default account's token and cache it against the wrong slot,
404ing forever. Rather than trusting it, the code verifies what it got and
recovers: a mismatch against the tab's address reopens the account chooser
automatically, and a 404 does the same as a backstop. Verified working against
three live accounts on 27 Jul 2026 — `authuser` *is* being honoured, and
neither fallback fires in practice.

**Consent still appears once per account.** `login_hint` skips the account
chooser, not the grant. Three accounts means three unverified-app warnings.

### 2. Paid gating — one Google account free, $2 to unlock the rest

Full design in **[PAID-PLAN.md](PAID-PLAN.md)**. The essentials:

- **The published config is now switched ON**, as of 27 Jul 2026, so that the
  store listing and the extension agree during review. This was safe to do
  before approval because the live 1.0.1 has no licensing code and never
  requests `raw.githubusercontent.com`, so it cannot read the config at all.
  Only 1.1.0 installs see it.
- **The built-in defaults stay `false` and must not change.** `DEFAULTS` in
  `licensing.js` is what an install falls back to when it cannot reach the
  config host, and charging someone because a fetch failed is the worst failure
  this feature could have. Turning the paywall on is an act of publishing.
- Reversing it is one `publish.ps1` run away, picked up within 24 hours or
  immediately on browser restart.
- The rules live in a JSON file on a **static URL, refetched every 24 hours**,
  so the free/paid line changes in minutes rather than needing a store review.
- **Everything fails open.** Every catch in `licensing.js` unlocks rather than
  blocks. Someone locked out of their own notes by a slow CDN is far worse than
  a few dollars of leakage.
- **Existing users keep what they had.** `recordBaseline()` runs once on update
  and records how many accounts were already connected; the allowance is
  `max(freeAccountLimit, baseline)`. Anyone already on three accounts keeps
  three, permanently.
- Accounts are counted by **distinct email address**, never slot key, because
  Chrome renumbers `/u/N/` when accounts are added or removed.

### 3. Orphaned content scripts after an update

When Chrome installs a new version, content scripts in already-open tabs keep
running but lose their connection; replacements are only injected on page load.
Alt + right-click in such a tab used to print "Extension context invalidated"
as raw red error text.

Now the box detects it via `chrome.runtime.id` and offers a **Reload page**
button. Any typed text stays on screen with a warning *above* the button.

**Re-injecting fresh scripts does not work** and was rejected: the orphaned
listener registered first and calls `stopImmediatePropagation`, so it swallows
the click before a new script sees it. The page genuinely has to reload.
`showStale()` in `src/content/overlay.js` deliberately calls **no `chrome` API**,
because it has to run when the extension is unreachable.

### 4. Drive swallowing keystrokes in the note box

Reported symptom: an apostrophe could not be typed into a note, while the same
character went into Drive's own description field fine.

Cause: the box lives in a **closed shadow root**, so by the time a keystroke
reaches Drive's document-level listeners it has been retargeted to the host
`<div>`. Drive's "is the user typing in a field?" check no longer sees a
textarea, so it treats the keystroke as a shortcut, and for any key where that
means `preventDefault()` the character is never typed.

The old guard stopped the event on the box itself, which is the **bubble**
phase. Anything Drive registered in the **capture** phase had already run.
`onKeyCapture` now sits on `window` in the capture phase, the first node in the
propagation path, registered at load so it is ahead of the page's own scripts.
`stopPropagation` does not cancel the default action, so the character still
lands in the textarea; Drive simply never hears the keystroke. Escape and
Ctrl+Enter moved into that same listener, because nothing bound to the box can
fire any more.

**Confirmed fixed against live Drive on 27 Jul 2026.** The mechanism was first
proven in a rig: a stand-in capture listener that cancels a key reproduces the
symptom exactly, and the fix clears it, the key types and the stand-in never
runs. The apostrophe was then verified by hand in Drive itself.

Nothing on the save path was ever the problem: there is no sanitizing anywhere,
and `JSON.stringify` encodes an apostrophe correctly. Worth remembering next
time a character goes missing, the suspicion belongs on the page's key handling,
not on the note text.

### 5. Account picker in the toolbar popup

Multi-account support made a single **Open Drive** button ambiguous: it always
landed on whichever account Drive opened by default, with no way to say which
one you meant. At **two or more** connected accounts the popup now replaces that
button with one row per account, each showing the address, its `/u/N/` slot and
a coloured initial. Clicking a row opens `drive.google.com/drive/u/N/`.

- **At one account nothing changes.** One account is not a choice, so the single
  button stays exactly as it was.
- The slot map already existed (`getAccounts`, the same message the options page
  uses), so this added **no permission, no scope and no API call**.
- The `/u/N/` line under each address is deliberate. Chrome renumbers the slots
  when accounts are added or removed there, so a row can briefly point at the
  wrong Drive until that account is used once and `api-backend.js` repairs the
  mapping. The slot is the one thing a user can check against Drive's own
  address bar when that happens.
- **No profile photos.** Reading those needs a scope this extension does not
  ask for. The circle is the first letter on a colour chosen by slot index.

**Height.** Chrome caps popups at **600px** and scrolls the whole popup past
that, which would push Settings and the footer off the bottom. So the popup is a
flex column with `max-height: 600px` and `#accountList` is the only child allowed
to shrink. Measured: two accounts 411px, five 576px, six and up pinned at 600px
with the list scrolling inside its own box. No row count is hardcoded anywhere,
so this stays correct if the hint text or header ever changes.

---

## Key facts you'll need

| | |
|---|---|
| Google account (everything) | noahdavi@gmail.com |
| Cloud project | **Drive Notes** |
| OAuth client type | Web application |
| OAuth client ID | `991537843624-2dkkdnhli3o4i8l03vghfihlkqsplhfa.apps.googleusercontent.com` |
| OAuth scope | `https://www.googleapis.com/auth/drive.metadata` (restricted) |
| Store item ID (permanent) | `fcekoocdkkmahmilnbfbdcnpfhjhgjjl` |
| Store listing | [chromewebstore.google.com/detail/…/fcekoocdkkmahmilnbfbdcnpfhjhgjjl](https://chromewebstore.google.com/detail/file-notes-for-google-drive/fcekoocdkkmahmilnbfbdcnpfhjhgjjl) |
| Popup footer links | Contact → `forms.gle/yJrB6vpDj5H1dPFv9` · Tip jar → `buymeacoffee.com/noahdavidson` · Rate → store listing `/reviews`. All set in `LINKS` at the top of `src/popup/popup.js`. |
| Local unpacked ID (path-derived) | `bigmlljgjdgilbfnbdieanchahnaapfpj` |
| Store visibility | Unlisted |
| Privacy policy | [published Doc](https://docs.google.com/document/d/e/2PACX-1vTjkq2KG-4igc0t-uQ0Gd7rHHlYofDZFeEOW7xbYCet6Db_R2pk0oxFvHCdJNAOUwl6XoTYdawDdbHO/pub). The editable source doc is in the owner's Drive, titled the same; its ID is deliberately not recorded here because this repo is public. |
| **GitHub repo** | `npd1987/file-notes-for-google-drive`, public, AGPL-3.0. `main` = source, `config` = the gating file, orphan branch. |
| **ExtPay permanent ID** | `file-notes-for-google-drive` |
| **Plan** | USD 2, **Once - Lifetime**, nickname `premium-lifetime` |
| **Stripe account** | A **dedicated** account, separate from the Buy Me a Coffee tip jar. Live payments approved 27 Jul 2026. |
| **Config URL** | `https://raw.githubusercontent.com/npd1987/file-notes-for-google-drive/config/gating.json` |

Both redirect URIs are registered in Cloud Console — the store one and the
local unpacked one — so the dev copy keeps working alongside the published
version.

> ⚠️ **Don't move the project folder.** The local unpacked extension ID is
> derived from its path; moving it changes the ID and breaks that copy's
> OAuth. The store copy is unaffected.

> ⚠️ **Do not register a second extension on ExtensionPay.** The Permanent ID
> is seeded from the name at first registration and then fixed, so *renaming*
> is safe. Registering a new entry mints a new ID, and pointing `EXTPAY_ID` at
> the wrong one makes every existing customer read as unpaid. A stale
> `files-notes-for-google-drive` entry exists from a typo during setup; delete
> it or ignore it, but never wire to it.

### Why the Stripe account is separate

Public business details, branding and statement descriptor are **account-level**
in Stripe, shared by everything on that account. Running the paid extension on
the tip jar's account meant rebranding one rebranded the other — which happened
once during setup and was undone. Two accounts under one login is a supported
setup and needs no separate legal entity.

---

## Changing the paywall after release

```powershell
.\admin\publish.ps1 -WhatIf     # show the diff, change nothing
.\admin\publish.ps1             # publish
```

Edit the values in **`admin/config-editor.html`** (double-click it, no server
needed), which previews the box as users will see it and exports the JSON.

The config lives **alone on the `config` branch**, an orphan sharing no history
with `main`. raw.githubusercontent serves whatever that branch holds, live and
unreviewed, so keeping it off `main` is what stops an ordinary code push from
changing the paywall for every install.

`gateEnabled: false` is the **kill switch**. If the gate ever misfires, that is
hours to fix; a store review is days.

> ⚠️ **Stripe takes real money now.** `gateEnabled` is the only thing between
> free and charging people. Run `-WhatIf` first, every time.

The URL appears in **three** places and all must agree, or the fetch fails
silently and every install falls back to the built-in defaults:

- `CONFIG_URL` in `src/background/licensing.js`
- `host_permissions` in `manifest.json` (the host only)
- `$Repo` / `$RawUrl` in `admin/publish.ps1`

Changing the *file* never needs a release. Changing the *host, repo, branch or
account* does.

---

## Immediate next actions

- [ ] **Watch for the review result.** Dashboard → item → Status. Confirm
      whether it is 1.0.2 or 1.0.3 while you're there.
- [ ] **Then upload `file-notes-v1.1.0.zip`** from the project root. Not
      before — a new package replaces the pending submission and restarts the
      clock. Do **not** cancel the pending review to get ahead; that loses your
      queue position and can flag the account.
- [ ] **Expect a slower review than usual.** 1.1.0 adds two host permissions
      and a content script on a new domain. Honest justification: *the
      extension fetches a small JSON file describing which features are
      enabled; no user data is sent and the request carries no identifiers.*
- [ ] **Re-paste three listing fields when submitting.** They carry over
      between versions untouched, so editing `store/LISTING.md` alone changes
      nothing. Each is flagged in that file:
      - **Summary** — *not editable in the dashboard.* Read from the
        `description` key in `manifest.json`.
      - **Detailed description** — editable, paste it.
      - **`storage` permission justification** — editable, paste it.
- [ ] **Only after 1.1.0 is live and confirmed working**, flip the paywall with
      `admin/publish.ps1`.
- [ ] **Keep one copy enabled at a time.** The store copy and the unpacked copy
      both match `drive.google.com`, which means two content scripts, two
      context-menu handlers and two overlays fighting over one Alt+right-click.
      They run in separate isolated worlds and cannot suppress each other.
- [ ] Once the store version is confirmed working, remove the `bigmlljg…`
      redirect URI from Cloud Console. **Not yet** — the unpacked copy is still
      the dev/test target.

---

## What was verified end to end on 27 Jul 2026

Not unit tests. Actually performed against live services:

- Gate blocks a second account and shows the offer, **before** any Google
  consent screen rather than after.
- Grandfathering held in the real extension: three pre-existing accounts,
  `allowance: 3`.
- Real Stripe checkout with test card `4242 4242 4242 4242`, invoice recorded
  as paid.
- `onPaid` listener fired, `chrome.storage.sync` updated, gate stopped
  enforcing, options page re-rendered to "Unlocked", the second account opened
  the normal editor.
- Remote config genuinely fetched from GitHub by the installed extension
  (`gatingConfig` present in `chrome.storage.local`, which only happens on a
  successful fetch).
- Stripe customer portal works.

**Test mode is automatic.** ExtensionPay enables it because the extension is
loaded unpacked, and disables it once installed from the store. It is not a
setting and cannot be turned off.

### Tests

```powershell
node admin\gate-test.mjs
```

21 checks against a stubbed `chrome.storage`, no install step. They cover what
a paying user would notice if it broke: known accounts never blocked, first
account always free, kill switch, grandfathering, duplicate addresses counted
once, storage failure fails open, a dead payment processor never revoking
someone who paid, and — the one that would have shipped a paywall to everyone —
a cold install with an unreachable config host **not** gating.

Run it after touching `licensing.js`.

---

## House style for user-visible copy

**No em dashes** anywhere a user can read them: the store listing, the options
page, the popup, error strings. Code comments are exempt. This is a deliberate
preference, not an accident — em dashes read as machine-written. Use commas,
colons, parentheses or a second sentence.

Say what is being sold. The upgrade box carries the extension name from
`chrome.runtime.getManifest()`, not from remote config, because the name of the
thing being charged for must never be wrong. And "pay once, **not per
account**" is load-bearing: without it, a one-time price beside a list of
accounts reads as a price *per* account.

## If the reviewer questions the scope

The likeliest challenge is "why not the narrower `drive.file`?" A prepared
rebuttal is at the bottom of [../store/LISTING.md](../store/LISTING.md). Short
version, on Google's own authority: selecting a folder does **not** grant
`drive.file` access to the files inside it, so annotating an arbitrary
right-clicked file would require a Picker dialog per file — slower than
Drive's own description panel, which defeats the entire purpose.

---

## Architecture, and why

**The Drive-DOM surface is exactly one selector.** `src/content/resolver.js` is
the only file that depends on Drive's markup, and it asks for one thing: the
file ID. Filename, existing description and saving all go through the
documented REST API. Drive's class names are auto-generated and rotate without
visible UI change, so minimising this surface is what buys longevity. **If the
extension ever breaks after a Drive update, this file is almost certainly the
only thing to repair** — it carries three fallback strategies and a
`debugDump()` helper.

**The backend is swappable.** `api-backend.js` (active) uses the Drive REST
API. `ui-backend.js` is a documented stub that would drive Drive's own UI
instead — fragile, but needs *no OAuth at all*. Switching is one line in
`service-worker.js`.

**Two Drive-DOM dependencies now, not one.** `resolver.js` reads the file ID;
`config.js` reads the signed-in account address. The second is what lets
`login_hint` name the right account *before* authorizing rather than after,
which is what removes the account chooser. It returns `null` on failure and
the code falls back to a chooser, so a Drive markup change degrades rather
than breaks. Note it deliberately does **not** search the document for any
email — Drive is full of other people's addresses in sharing dialogs, and
hinting one of those would be worse than hinting nothing.

**The payment processor is behind one function.** `refreshLicense()` in
`licensing.js` is the only code that knows ExtensionPay exists. Everything else
asks `getPlan()`. Self-hosting later to avoid the 5% means changing what writes
the license state and nothing else. `checkoutUrl` in remote config already
overrides where people are sent, so the migration needs no release.

`refreshLicense()` only ever **promotes** to paid, never revokes. A network
failure and a genuine "not paid" are hard to tell apart from inside a browser,
and being wrongly locked out is far worse than a refunded $2 that keeps
working.

**The gate runs before the OAuth window opens**, in `authorize()`. Someone over
the allowance meets the offer directly instead of being walked through a Google
sign-in and only then refused.

Also worth remembering: tokens live in `chrome.storage.session`, not a
service-worker variable. MV3 workers die after ~30s idle, which was silently
throwing the token away and forcing constant re-auth. Don't "simplify" that
back into a plain variable, and don't move it to `storage.local` either —
that would write a live credential to disk. The slot-to-address map *is* in
`storage.local`, deliberately: it holds no credential and has to survive a
browser restart to be useful.

`startPaymentListener()` is called at the service worker's **top level**, not
inside a listener, for the same reason: the worker is torn down and rebuilt
constantly, and the listener must survive every rebuild.

### The vendored ExtPay is not upstream's module build

`src/vendor/` holds **two copies** of the same library, and
[src/vendor/README.md](../src/vendor/README.md) explains why. Upstream's
`dist/ExtPay.module.js` opens with a bare `import 'webextension-polyfill'`,
which only resolves under a bundler and throws in a browser. This project has
no build step, so `ExtPay.module.js` here is `dist/ExtPay.js` with
`export default ExtPay;` appended. The content script entry has to stay the
classic build, since content scripts are not modules.

**When updating, do not copy `dist/ExtPay.module.js`.** Commands are in that
README.

---

## Licence

**AGPL-3.0**, and not by preference. ExtPay is AGPLv3 and that carries forward
to anything distributed with it. Open sourcing costs nothing real here, because
a Chrome extension ships its source as readable JavaScript regardless — anyone
can unzip the published package and read exactly the same code.

The `LICENSE` file is included in the store zip so the licence travels with the
distributed work.

If you ever want this closed source, the options are: email
glen@extensionpay.com and ask for an exception, or drop the dependency and use
a Stripe Payment Link through the `checkoutUrl` override.

---

## Plans, not yet started

- [VOICE-PLAN.md](VOICE-PLAN.md) — built-in dictation. Web Speech first,
  Whisper later. **Starts with a 30-minute go/no-go spike** on whether the mic
  grant flows through an extension-origin iframe. Verified 27 Jul 2026 that
  Drive sends no `microphone=()` Permissions-Policy header, so delegation
  isn't blocked at the door.
- [SHARING-PLAN.md](SHARING-PLAN.md) — the *decision* on OAuth verification.
  Staying under 100 users is Google's documented personal-use exemption.
- [VERIFICATION-CHECKLIST.md](VERIFICATION-CHECKLIST.md) — the *procedure*,
  written 27 Jul 2026. Two findings change the old calculus: **you cannot
  initiate CASA, Google does**, so submitting for verification tests the
  no-server argument at no cost; and the real blocker is not money but a
  **domain**, since Google requires a public homepage with the privacy policy
  on the same domain, and the policy is currently a published Google Doc.
- [UPLOAD-CHECKLIST.md](UPLOAD-CHECKLIST.md) — Chrome Web Store submission.
  Still accurate, and now used for every version update, not just the first.
- [PAID-PLAN.md](PAID-PLAN.md) — the paid feature, in full. **Done and
  shipped in 1.1.0**, but read it before changing any of it.

> **Chrome Web Store review and OAuth verification are unrelated systems.**
> Publishing 1.1.0 does not trigger OAuth verification and Google will not
> start it on its own. You submit it yourself, in Cloud Console, and only then
> does Google decide whether CASA applies. The 100-user cap is **lifetime and
> cumulative**, not concurrent; uninstalls still count.

## Feature backlog

1. **Multi-select** — apply one note to every selected item.
2. **Dots on rows that already have descriptions.** One batched
   `files.list` with `fields=files(id,description)` paints the whole view.
   This may be the bigger day-to-day win: descriptions are invisible in Drive's
   list view, so there's currently no way to see annotation coverage at a
   glance.
3. ~~**`chrome.identity.getAuthToken` migration.**~~ **Reconsider before
   attempting.** It looked like the largest available simplification: delete
   the implicit flow, the hourly re-auth, the `login_hint` handling and the
   session-storage cache. But `getAuthToken` issues tokens for the account
   signed into the **Chrome profile**, and cannot target a specific Drive
   account slot. Adopting it would trade multi-account support for that
   simplification. Given multi-account is now a *paid* feature, the trade is a
   very bad one. Left here so nobody re-discovers the idea without also
   re-discovering the objection.

## Things already investigated — don't redo these

| Question | Answer |
|---|---|
| Does an API exist for new Google Sites? | **No.** Only Classic Sites, deprecated since 2016. No MCP connector either. |
| Can `drive.file` avoid the restricted scope? | **No.** Folder selection doesn't cascade to contained files. |
| Can the extension trigger Win+H / OS dictation? | **No.** Synthetic key events never reach the OS; `chrome.commands` can't bind the Windows key. Native messaging is the only route and isn't worth it. |
| Can Claude read the Web Store dashboard via the Chrome extension? | **No.** Chrome forbids scripting the extensions gallery. Desktop screen capture works instead. |
| Drive description character limit | **25,000** |
| Does `about.get` work under the `drive.metadata` scope? | **Yes.** Returns `user.emailAddress`, which is how account discovery works with no extra scope. |
| Can the store Summary be edited in the dashboard? | **No.** It comes from `manifest.json`'s `description`. Requires a package re-upload. |
| Can you buy a CASA assessment up front? | **No.** Tier 2 is initiated by Google when it decides your app is in scope. Self-initiated assessments are validated only at Tier 3, the expensive tier. |
| Is the CASA free self-scan still available? | **No.** Deprecated. An authorized lab must validate. |
| Can Chrome take in-app payments? | **No.** Chrome Web Store Payments was shut down years ago. An outside processor is mandatory. |
| What does ExtensionPay cost? | **5% per transaction**, no monthly fee, funds paid into your own Stripe account. Assume Stripe's own fees stack on top. At $2 you keep roughly **$1.54**; the fixed $0.30, not the 5%, is what makes small prices expensive. |
| Can users be prompted to update the extension? | **No, and they never need to be.** Chrome auto-updates extensions every few hours and on browser start, silently. |
| Can orphaned content scripts be replaced automatically after an update? | **No.** The orphan registered its listener first and calls `stopImmediatePropagation`, so it swallows the click before any re-injected script sees it. The page must reload. |
| Does `import()` work in a service worker console? | **No.** Disallowed on `ServiceWorkerGlobalScope`. Send a message from the options page instead. |
| Does upstream's `ExtPay.module.js` work without a bundler? | **No.** Bare `import 'webextension-polyfill'`. See `src/vendor/README.md`. |

---

## Build commands

Rebuild the store zip. Bump the version in `manifest.json` first — every
upload needs a higher version than the published one:

```powershell
$v = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
Compress-Archive -Path manifest.json, icons, src, LICENSE -DestinationPath "file-notes-v$v.zip" -Force
"built file-notes-v$v.zip"
```

`manifest.json` must sit at the zip root — never zip the folder itself. Naming
the paths explicitly excludes `admin/`, `docs/`, `store/`, `screenshots/`,
`old versions/` and `.claude/` by design. `LICENSE` is included deliberately,
for AGPL.

Verify a built zip before uploading:

```powershell
Expand-Archive file-notes-v1.1.0.zip -DestinationPath $env:TEMP\zipcheck -Force
Get-ChildItem $env:TEMP\zipcheck
```

`manifest.json` must be at the top level, and `admin/` and `docs/` must not
appear at all.

Syntax check everything (skip `src/vendor/`, which is third-party and minified
in places):

```powershell
Get-ChildItem -Recurse -Filter *.js | Where-Object { $_.FullName -notlike '*\vendor\*' } | ForEach-Object { node --check $_.FullName }
```

Note the background files are ES modules; `node --check` treats `.js` as
CommonJS and will report false errors on their `import` lines. Those three are
covered by `admin\gate-test.mjs` instead.

## File layout

```
manifest.json              MV3 manifest
file-notes-v1.1.0.zip      the current upload package (newest lives in root)
old versions/              superseded zips
LICENSE                    AGPL-3.0
src/content/               runs on drive.google.com
  config.js                settings, modifier matching, account-slot detection
  resolver.js              ← the only Drive-DOM-dependent file
  overlay.js               the note box (Shadow DOM): editor, upgrade, stale
  content.js               event wiring
src/background/
  service-worker.js        message router
  api-backend.js           Drive REST — active
  ui-backend.js            zero-OAuth alternative — stub
  licensing.js             remote config, licence, the gate
src/vendor/                ExtPay, checked in — read its README before updating
src/options/               settings page
src/popup/                 toolbar popup
admin/                     NOT SHIPPED. Paywall control panel and tests.
  config-editor.html       edit the rules, preview the box, export JSON
  publish.ps1              push the rules live
  gating.json              the current rules
  gate-test.mjs            21 tests
docs/                      NOT SHIPPED. This file and the plans.
store/                     NOT SHIPPED. Listing copy and privacy policy.
```

## Tooling installed on this machine

- **git** 2.55.0
- **GitHub CLI** 2.96.0, authenticated as `npd1987` (`gh auth status` to check)

Commits use `npd1987 <npd1987@users.noreply.github.com>`, passed per-command
rather than written to global git config, so a real email stays out of a public
repo's history.
