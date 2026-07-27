# Handoff — File Notes for Google Drive

**As of 27 July 2026.** Read this first when picking the project back up.

## Where things stand

The extension **works and is in daily use**.

| Version | State |
|---|---|
| **1.0.1** | **Approved and published**, unlisted, on 27 Jul 2026. This is what the store serves. |
| **1.0.2** | **Submitted, awaiting review.** Adds the toolbar popup, the corrected store summary and description, and removes em dashes from user-visible copy. |
| **1.0.3** | **Code complete and tested unpacked. No zip built, nothing uploaded.** Multi-account support. Do not upload until 1.0.2 clears — a new package replaces the pending submission and restarts the clock. Build command at the bottom of this file. |

Only one submission is ever in flight. A rejected *update* never takes down the
published version, which is why getting 1.0.1 approved untouched mattered.

## What 1.0.3 adds, and why it isn't trivial

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

Both redirect URIs are registered in Cloud Console — the store one and the
local unpacked one — so the dev copy keeps working alongside the published
version.

> ⚠️ **Don't move the project folder.** The local unpacked extension ID is
> derived from its path; moving it changes the ID and breaks that copy's
> OAuth. The store copy is unaffected.

## Immediate next actions

- [ ] **Watch for the 1.0.2 review result.** Dashboard → item → Status. Set to
      auto-publish on approval.
- [ ] **Then upload 1.0.3.** Not before — a new package replaces the pending
      submission.
- [ ] **Re-paste three listing fields when submitting 1.0.3.** They carry over
      between versions untouched, so editing `store/LISTING.md` alone changes
      nothing. Each is flagged in that file:
      - **Summary** — *not editable in the dashboard.* It is read from the
        `description` key in `manifest.json`; the dashboard greys it out as
        "Summary from package". Changing it means editing the manifest and
        re-uploading.
      - **Detailed description** — editable, paste it.
      - **`storage` permission justification** — editable, paste it. It now
        discloses that account addresses are stored.
- [ ] **Keep one copy enabled at a time.** The store copy and the unpacked copy
      both match `drive.google.com`, which means two content scripts, two
      context-menu handlers and two overlays fighting over one Alt+right-click.
      Genuinely baffling if you don't expect it.
- [ ] Once the store version is confirmed working, remove the
      `bigmlljg…` redirect URI from Cloud Console. **Not yet** — the unpacked
      copy is still the dev/test target.

## House style for user-visible copy

**No em dashes** anywhere a user can read them: the store listing, the options
page, the popup, error strings. Code comments are exempt. This is a deliberate
preference, not an accident — em dashes read as machine-written. Use commas,
colons, parentheses or a second sentence.

## If the reviewer questions the scope

The likeliest challenge is "why not the narrower `drive.file`?" A prepared
rebuttal is at the bottom of [../store/LISTING.md](../store/LISTING.md). Short
version, on Google's own authority: selecting a folder does **not** grant
`drive.file` access to the files inside it, so annotating an arbitrary
right-clicked file would require a Picker dialog per file — slower than
Drive's own description panel, which defeats the entire purpose.

## Architecture, and why

Two decisions carry the design:

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

Also worth remembering: tokens live in `chrome.storage.session`, not a
service-worker variable. MV3 workers die after ~30s idle, which was silently
throwing the token away and forcing constant re-auth. Don't "simplify" that
back into a plain variable, and don't move it to `storage.local` either —
that would write a live credential to disk. The slot-to-address map *is* in
`storage.local`, deliberately: it holds no credential and has to survive a
browser restart to be useful.

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
   simplification. Given 1.0.3 exists specifically to support several accounts
   in one profile, the trade is now a bad one. Left here so nobody
   re-discovers the idea without also re-discovering the objection.

## Things already investigated — don't redo these

| Question | Answer |
|---|---|
| Does an API exist for new Google Sites? | **No.** Only Classic Sites, deprecated since 2016. No MCP connector either. |
| Can `drive.file` avoid the restricted scope? | **No.** Folder selection doesn't cascade to contained files. |
| Can the extension trigger Win+H / OS dictation? | **No.** Synthetic key events never reach the OS; `chrome.commands` can't bind the Windows key. Native messaging is the only route and isn't worth it. |
| Can Claude read the Web Store dashboard via the Chrome extension? | **No.** Chrome forbids scripting the extensions gallery. Desktop screen capture works instead. |
| Drive description character limit | **25,000** |
| Does `about.get` work under the `drive.metadata` scope? | **Yes.** Confirmed against Google's reference 27 Jul 2026. Returns `user.emailAddress`, which is how account discovery works with no extra scope. |
| Can the store Summary be edited in the dashboard? | **No.** It comes from `manifest.json`'s `description`. Requires a package re-upload. |
| Can you buy a CASA assessment up front? | **No.** Tier 2 is initiated by Google when it decides your app is in scope. Self-initiated assessments are validated only at Tier 3, the expensive tier. |
| Is the CASA free self-scan still available? | **No.** Deprecated. An authorized lab must validate. |

## Build commands

Rebuild the store zip (bump the version in `manifest.json` first — every
upload needs a higher version):

```powershell
$v = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
Remove-Item "file-notes-v$v.zip" -ErrorAction SilentlyContinue
Compress-Archive -Path icons, src, manifest.json -DestinationPath "file-notes-v$v.zip"
"built file-notes-v$v.zip"
```

`manifest.json` must sit at the zip root — never zip the folder itself.
Naming the three paths explicitly excludes `store/`, `docs/`, `screenshots/`
and `.claude/` by design.

Syntax check everything:

```powershell
Get-ChildItem -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```
