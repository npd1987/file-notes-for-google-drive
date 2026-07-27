# Paid multi-account unlock

The free version covers one Google account. Connecting a second prompts for a
one-time payment. Every number in that sentence, including whether it applies at
all, is editable after release without a Chrome Web Store review.

Shipped in v1.1.0, **switched off**. `admin/gating.json` has
`gateEnabled: false` and an empty `checkoutUrl`, and either one alone is enough
to keep the gate dormant. Nothing charges anyone until both are set and
published.

---

## How it fits together

```
admin/config-editor.html   you edit the rules here (opens from file://)
        ↓ download
admin/gating.json          the rules, as a file
        ↓ admin/publish.ps1
the `config` branch        raw.githubusercontent.com/npd1987/…/config/gating.json
        ↓ fetched every 24h
src/background/licensing.js   the rules, the license, and the gate
        ↓ throws ACCOUNT_LIMIT
src/content/overlay.js        the offer, in the note box
```

Three questions are kept apart on purpose, because they fail differently:

| Question | Where | On failure |
|---|---|---|
| What are the rules? | `getConfig()` | Falls back to cache, then to built-in defaults |
| Has this install paid? | `getLicense()` | Unlocks |
| May this account authorize? | `assertAccountAllowed()` | Unlocks |

**Everything fails open.** Every catch block in `licensing.js` unlocks rather
than blocks. This is load-bearing: someone locked out of their own notes by a
slow CDN is a far worse outcome than a few dollars of leakage.

---

## The rules

| Field | Effect |
|---|---|
| `gateEnabled` | The kill switch. `false` makes every install fully free. |
| `freeAccountLimit` | Accounts allowed without paying. Clamped to 1–99. |
| `priceLabel` | Display only. Stripe holds the real amount. |
| `checkoutUrl` | Override. Empty means ExtensionPay's own page. Must be https. |
| `upgradeHeadline` / `upgradeBody` | The offer copy, capped at 300 characters. |

Remote JSON is untrusted input: it crosses a network and one field becomes a URL
opened in a tab. `sanitize()` copies across only known keys, only at the
expected type, and only in bounds, so a compromised config can change the rules
but cannot inject a `javascript:` URL or a kilobyte of text into the note box.

### Existing users keep what they had

`recordBaseline()` runs once, on update, and records how many accounts were
already connected. The allowance is then `max(freeAccountLimit, baseline)`.
Someone using three accounts before v1.1.0 keeps all three forever.

Stored as a count rather than a grandfathered flag so that raising the free limit
later still helps them, and so nobody's working setup breaks on an auto-update
they never asked for.

### Counting

Distinct email addresses, never slot keys. Chrome renumbers `/u/N/` whenever an
account is added or removed, so two slots can briefly name the same person and
counting keys would charge them for it.

---

## Changing the rules after release

1. Open `admin/config-editor.html` (double-click it, no server needed).
2. Press **Load live config** to see what users are actually on right now.
3. Edit. The preview shows the note box as they will see it, and greys out when
   the combination you have chosen leaves the gate off.
4. **Download gating.json**, save it over `admin/gating.json`.
5. Run the publish script.

```bash
pwsh -File admin/publish.ps1 -WhatIf
```

`-WhatIf` shows the diff and changes nothing. Drop it to publish.

Installs pick up the change within 24 hours, or immediately on browser restart.
There is no way to reach someone faster than that, which is exactly why the kill
switch exists: if the gate ever misfires, `gateEnabled: false` is hours, while a
store review is days.

### Where the config lives

```
https://raw.githubusercontent.com/npd1987/file-notes-for-google-drive/config/gating.json
```

Repo `npd1987/file-notes-for-google-drive`, **public**, branch **`config`**.

Note the branch. `gating.json` sits alone on an orphan branch that shares no
history with `main`. raw.githubusercontent serves whatever the named branch
holds, live and unreviewed, so anything sharing a branch with this file would be
one careless commit away from changing the paywall for every install. The split
is what makes publishing config a deliberate act rather than a side effect of
pushing code.

Public is required, not a preference: the fetch is anonymous from every user's
browser, and a private repo would 404 for all of them. Nothing in the file is
sensitive.

The setup is already done. Recreating it from scratch would be:

```bash
gh repo create npd1987/file-notes-for-google-drive --public --add-readme
git clone https://github.com/npd1987/file-notes-for-google-drive.git /tmp/cfg
git -C /tmp/cfg checkout --orphan config && git -C /tmp/cfg rm -rf .
cp admin/gating.json /tmp/cfg/ && git -C /tmp/cfg add gating.json
git -C /tmp/cfg commit -m "Add gating config" && git -C /tmp/cfg push -u origin config
```

The URL appears in three places, and all three must agree or the fetch fails
silently and every install falls back to the built-in defaults:

- `CONFIG_URL` in `src/background/licensing.js`
- `host_permissions` in `manifest.json` (the host only)
- `$Repo` / `$RawUrl` in `admin/publish.ps1`

Changing the *file* never needs a release. Changing the *host, repo, branch, or
account* does. That asymmetry is the whole point, so treat the repo and the
`npd1987` account as things you keep.

---

## Tests

```bash
node admin/gate-test.mjs
```

16 checks against a stubbed `chrome.storage`, no install step. They cover the
things a paying user would notice if they broke: an already-connected account is
never blocked, the first account is always free, the kill switch works,
grandfathered accounts survive, duplicate addresses across renumbered slots count
once, and a storage failure fails open.

Run it after touching `licensing.js`. It is the only thing standing between a
refactor and silently charging the wrong people.

---

## Payments

Chrome Web Store Payments was shut down years ago. There is no way to charge
through Chrome itself, so the money has to move through an outside processor.

**ExtensionPay** is the chosen route: 5% per transaction, no monthly fee, funds
paid directly into your own Stripe account. Assume Stripe's own fees stack on
top, which at these prices matters more than the 5% does:

| Price | Stripe (2.9% + $0.30) | ExtPay 5% | You keep |
|---|---|---|---|
| $2 | $0.36 | $0.10 | $1.54 (77%) |
| $3 | $0.39 | $0.15 | $2.46 (82%) |
| $5 | $0.45 | $0.25 | $4.30 (86%) |

The fixed $0.30, not the percentage, is what makes small prices expensive. Since
`priceLabel` and `checkoutUrl` are both remote config, $2 against $3 is a live
test rather than a guess.

### The account setup

| | |
|---|---|
| ExtPay permanent ID | `file-notes-for-google-drive` |
| Plan | USD 2, **Once - Lifetime** (one-time, no renewals) |
| Plan nickname | `premium-lifetime` |
| Stripe account | A dedicated one, separate from the Buy Me a Coffee tip jar |
| Vendored ExtPay | 3.1.2, byte-identical to npm's published `dist/ExtPay.js` |

The ID is ExtensionPay's **Permanent ID**, seeded from the extension's name at
first registration and fixed thereafter. Renaming on their dashboard does not
change it, so the display name is safe to edit. Registering a *second* extension
entry does mint a new ID, which is the mistake to avoid: there is a stale
`files-notes-for-google-drive` entry from a typo during setup, and pointing
`EXTPAY_ID` at it would make every customer come back as unpaid.

One-time is what the rest of the code assumes. `user.paid` flips true once and
`refreshLicense()` never revokes, so there is no renewal or dunning handling
anywhere, by design.

Multiple plans need ExtPay 3.1+. The vendored copy is 3.1.2, so that constraint
is already satisfied if a second tier is ever added.

### The Stripe account is deliberately separate

Public business details, branding, and statement descriptor are **account-level**
in Stripe and shared by everything on the account. Running the paid extension on
the same account as the tip jar means one cannot be rebranded without rebranding
the other. Hence a second Stripe account under the same login, which is a
supported setup and needs no separate legal entity.

### What is wired

- `src/vendor/ExtPay.module.js` — imported by `licensing.js`
- `src/vendor/ExtPay.js` — the content script on `extensionpay.com`, which is
  how a completed payment reaches the extension
- `extensionpay.com` in `host_permissions`
- `startPaymentListener()` at the service worker's top level, not inside a
  listener: the worker is torn down after ~30s idle and rebuilt on the next
  event, and the payment listener has to survive every one of those rebuilds

`refreshLicense()` only ever **promotes** to paid, never revokes. A network
failure and a genuine "not paid" are hard to tell apart from inside the browser,
and being wrongly locked out is far worse than a refunded $2 that keeps working.
Revocation, if ever needed, should be a deliberate act rather than a side effect
of bad wifi.

The price itself lives on ExtensionPay's dashboard under **Edit extension name
or plans**, not in `gating.json`. `priceLabel` is the button's text and must be
kept in step by hand.

### Replacing it later

Self-hosting to avoid the 5% is a contained change, because nothing outside
`refreshLicense()` knows who the processor is. The popup, the options page, the
note box and the gate all ask `getPlan()`, which asks `getLicense()`, which reads
local state. Swapping ExtensionPay for your own server means changing what
writes that state, and nothing else.

Worth doing the arithmetic before you do the work: at 5%, a server pays for
itself somewhere north of a few thousand dollars of sales a year, and it takes on
uptime, PCI scope by proxy, and a database that must never lose a row.

---

## What this does not do

**It is bypassable.** Extension source is readable and `chrome.storage` is
editable from any devtools window. Anyone determined to skip a $2 unlock can, in
about five minutes. Server-checked licensing raises the bar but never closes it,
because the client still decides. At this price the gate is a nudge for honest
people, not a lock, and hardening it further is not worth a week.

**The price label is not the price.** Changing `priceLabel` changes the button.
Changing what Stripe charges is a separate act in Stripe. Do both or the button
lies.

**The Chrome Web Store review will ask about the new host permission.** The
honest justification is the true one: the extension fetches a small JSON file
describing which features are enabled. No user data is sent, and the request
carries no identifiers.
