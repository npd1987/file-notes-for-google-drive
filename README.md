# Drive Notes

Alt + right-click any Google Drive file or folder → a small box opens at the
cursor → type (or dictate) a description → Ctrl+Enter.

It writes to Drive's **native description field**, which means the notes are
indexed by Drive search. Search a word from a note and the file comes back.

---

## Step 0: verify the spike before anything else

Everything rests on one assumption: **the file ID is readable from Drive's
DOM.** Confirm it first.

1. Load the extension (below), then open Drive.
2. Alt + right-click a file.

If the note box opens with the real filename in its header, the assumption
holds and you're done — skip to *Usage*.

If it doesn't, run this in the DevTools console on `drive.google.com`, then
right-click a file:

```bash
document.addEventListener('contextmenu',e=>{let l=e.target,d=0;while(l&&d++<12){console.log(d,l.tagName,[...l.attributes].map(a=>`${a.name}="${a.value}"`).join(' ').slice(0,300));l=l.parentElement}},true)
```

Look for a long alphanumeric string (25–90 chars) matching the ID in the URL
when you open that file. Whatever attribute holds it goes into `ID_ATTRS` in
[`src/content/resolver.js`](src/content/resolver.js). That's the only file that
needs to change.

---

## Install

Most people should just install it from the
[Chrome Web Store listing](https://chromewebstore.google.com/detail/file-notes-for-google-drive/fcekoocdkkmahmilnbfbdcnpfhjhgjjl).
There is no setup: a working OAuth client ships in the package, and the first
Alt + right-click in each Google account authorizes that account.

For development:

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this folder.
2. Note the extension ID Chrome assigns. It stays stable as long as you don't
   move the folder. Its redirect URI must be registered in Cloud Console —
   the current one already is, see [docs/HANDOFF.md](docs/HANDOFF.md).
3. Nothing else. The Options page has an Advanced section for supplying your
   own OAuth client, which almost nobody needs.

The first connection in each account shows *"Google hasn't verified this
app."* That's expected while the app is unverified. Advanced → Go to.

If you do stand up your own Cloud project, set the consent screen's publishing
status to **In production**, not *Testing*. Test-user tokens expire every
7 days and you'd re-authorise constantly.

---

## Usage

| Action | Key |
|---|---|
| Open the note box | Alt + right-click an item |
| Save | Ctrl+Enter |
| Cancel | Esc |
| Dictate | **Win+H** while the box is focused |

Win+H is Windows' built-in dictation and works in any focused text box, so
there's no in-extension voice code yet. If it proves too clunky, the Web Speech
API version is the next milestone.

Plain right-click is untouched — Drive's own menu still works normally.

---

## How it's built

```
src/content/     runs on drive.google.com
  config.js      settings, modifier matching, account-slot detection
  resolver.js    ← the only Drive-DOM-dependent file
  overlay.js     the note box (Shadow DOM)
  content.js     event wiring
src/background/
  service-worker.js  message router
  api-backend.js     Drive REST — active
  ui-backend.js      zero-OAuth alternative — stub
  licensing.js       paid gating: remote rules, license, the gate
src/options/     settings page
src/popup/       toolbar popup
admin/           local control panel for the gating rules (not shipped)
```

Three deliberate choices:

**The DOM surface is one selector.** The content script asks Drive's DOM for
exactly one thing — the file ID. Everything else (filename, existing
description, saving) goes through the documented REST API. Drive's markup uses
auto-generated class names that rotate on internal releases with no visible UI
change, so minimising this surface is what buys longevity.

**The backend is swappable.** `api-backend` is stable but needs the restricted
`drive.metadata` scope. `ui-backend` would drive Drive's own UI instead —
fragile, but needs *no* OAuth at all, which matters a lot if this is ever
distributed beyond ~100 users. Switching is a one-line change in
`service-worker.js`.

**Every request carries a Google account.** Drive puts the signed-in account
slot in its own URLs (`/drive/u/1/…`), and with several accounts open at once
that index is the only thing distinguishing one tab from another. The content
script reads it, tokens are cached per slot, and the address each slot
authorized as is recorded so `login_hint` can name it on later refreshes. See
[docs/HANDOFF.md](docs/HANDOFF.md) for why this can't be simplified away.

**The paywall is remote-controlled.** Whether extra Google accounts cost
anything, how many are free, and what the price says all live in a JSON file on
a static host, refetched daily. That makes the free/paid line a decision you can
change in minutes rather than a release. It ships switched off. See
[docs/PAID-PLAN.md](docs/PAID-PLAN.md).

### Distribution, if it ever comes to that

| Users | Path |
|---|---|
| Just you | Unpacked + unverified OAuth app. Free. |
| Up to 100 | Chrome Web Store unlisted ($5 once). Every user sees the unverified-app warning. Cap is **lifetime and non-resettable**. |
| Beyond 100 | OAuth verification: ~6 weeks and a demo video. The CASA assessment (~$540–1,800/yr) applies only if Google decides you're in scope, and **Google initiates that, not you** — so submitting tests the no-server argument for free. Procedure in [VERIFICATION-CHECKLIST.md](docs/VERIFICATION-CHECKLIST.md), decision in [SHARING-PLAN.md](docs/SHARING-PLAN.md). |

---

## Known limits

- Descriptions cap at **25,000 characters** (per Drive's own counter in the
  details panel). Generous, but the box doesn't warn you when you approach it.
- Needs edit access to the item. Read-only shared files return a 403, surfaced
  in the box.
- Descriptions don't appear in Drive's list view or in Drive for Desktop —
  they're searchable but invisible. This is why the box confirms *Saved*
  before closing.
- One item at a time. Multi-select is next.

## Plans

- 👉 **[docs/HANDOFF.md](docs/HANDOFF.md) — start here.** Current state, all
  the IDs and URLs, what's pending, and what's already been ruled out.
- [docs/UPLOAD-CHECKLIST.md](docs/UPLOAD-CHECKLIST.md) — Chrome Web Store
  submission, step by step. Done for v1.0.1; useful if you publish again.

- [docs/VOICE-PLAN.md](docs/VOICE-PLAN.md) — built-in dictation, Web Speech
  first and Whisper later. Starts with a go/no-go spike.
- [docs/SHARING-PLAN.md](docs/SHARING-PLAN.md) — **publish unlisted to the
  Chrome Web Store** ($5), then OAuth verification later if the user count
  justifies it. Real costs for each. Phase 1 is done.
- [docs/VERIFICATION-CHECKLIST.md](docs/VERIFICATION-CHECKLIST.md) — the
  step-by-step for OAuth verification and CASA, if Phase 2 ever starts.

## Licence

**[AGPL-3.0](LICENSE).**

Not an ideological choice: the extension vendors
[ExtPay](https://github.com/Glench/ExtPay) (see
[src/vendor/README.md](src/vendor/README.md)) to take payments, ExtPay is
AGPLv3, and that licence carries forward to anything distributed with it. Open
sourcing costs nothing real here, because a Chrome extension ships its source as
readable JavaScript regardless — anyone can unzip the published package and read
exactly this.

If you fork it, the same terms apply to you: publish your source and keep the
attribution.

## Next

1. Multi-select — apply one note to every selected item.
2. Web Speech API dictation (needs an extension-origin iframe; the content
   script runs in `drive.google.com`'s origin, so a mic grant to the extension
   doesn't reach it).
3. Dots on rows that already have descriptions — one batched API call makes
   invisible metadata visible at a glance.
