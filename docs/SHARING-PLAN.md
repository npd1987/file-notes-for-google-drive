# Sharing the extension

**Status:** not started. Nothing here is needed while you're the only user.

**The plan: publish unlisted to the Chrome Web Store.** That's the primary
path. OAuth verification comes later, only if the user count justifies it.

| Phase | Gets you | Cost |
|---|---|---|
| **1 — Chrome Web Store (unlisted)** | One-click install, auto-updates, no developer-mode nag | $5 once |
| **2 — OAuth verification** *(probably never)* | Removes the "unverified app" warning and the 100-user cap | ~$540–1,800/yr + 6 weeks |

**Phase 2 is optional in a strong sense.** Staying under 100 users is a
documented exemption, not a compromise. See Phase 2 before assuming you want
it.

Manually pinning the extension ID is **not part of the plan** — the store does
it for you. It's kept in the [appendix](#appendix--pinning-the-extension-id-manually)
in case you need to hand the folder to someone *before* publishing.

---

# Phase 1 — Chrome Web Store (unlisted)

$5 one-time developer registration, covering every extension you ever publish.
**Unlisted** means reachable by direct link but absent from store search — the
right setting for sharing with people you know.

## What changes for users

They click **Add to Chrome**, approve the permission dialog, done. Chrome
unpacks it into its own profile directory, which they never see or manage.

This kills, in one move:

- The developer-mode startup nag
- Corporate/managed-profile blocks on unpacked extensions
- Manual zip distribution
- **Manual updates** — Chrome auto-updates from the store, so pushing a fix
  reaches everyone silently. This is the biggest practical win, and the reason
  to prefer this over the appendix approach.

## What changes for you

### The store assigns a permanent extension ID

Granted at first upload and fixed forever. Update the authorised redirect URI
in Cloud Console to `https://<store-assigned-id>.chromiumapp.org/`.

If you ever did the appendix, **delete the `key` field from `manifest.json`
before uploading** — the store assigns its own ID and the manual key becomes
obsolete.

### Hardcode the client ID

With the ID permanent, one redirect URI covers every user forever. Ship the
client ID as a built-in default and let the Options field become an override
nobody touches. Users then install and authorize with zero setup — no pasting,
no Cloud Console.

Safe to hardcode: client IDs are public by design and there's no secret
alongside it. Every published extension does this. See
[Security notes](#security-notes-on-a-shared-client-id).

### Migrate to `chrome.identity.getAuthToken` ← the real prize

A stable store ID unlocks Chrome's native token management. This **deletes**:

- The implicit OAuth flow
- The hourly re-authorization
- The `login_hint` workaround for multi-account users
- The entire `chrome.storage.session` caching layer in `api-backend.js`

Chrome handles acquisition, caching, and refresh against the profile's
signed-in account. By a wide margin the largest simplification available to
this codebase.

Requires a **Chrome Extension**-type OAuth client instead of *Web application*,
with `oauth2: { client_id, scopes }` declared in the manifest. That's why it's
a publish-time swap rather than something to do now.

## What you must prepare first

Three things the project doesn't currently have:

1. **Icons.** The manifest declares none. The store requires 128×128 minimum,
   plus at least one screenshot for the listing.
2. **A privacy policy at a public URL.** Mandatory for anything handling user
   data, which `drive.metadata` unambiguously is. Must state what's collected
   (nothing leaves the browser except to Google), what's stored, and how to
   revoke access.
3. **Written permission justifications.** You'll have to explain why you need a
   restricted scope and broad host permissions. Expect closer scrutiny and a
   slower review than a trivial extension gets.

Plus listing copy and the $5. Review runs hours to days; no paid fast lane
exists.

## What Phase 1 does NOT fix

Easy to conflate, but these come from a separate gate:

- ❌ The **"Google hasn't verified this app"** screen — still there
- ❌ The **100-user cap** — still there, still lifetime and non-resettable

Both belong to OAuth verification, which is Phase 2. Publishing fixes
distribution friction only.

---

# Phase 2 — OAuth verification

Only worth doing if you approach 100 users, or the warning screen is visibly
costing you adoption.

> **Step-by-step procedure: [VERIFICATION-CHECKLIST.md](VERIFICATION-CHECKLIST.md).**
> This section is the decision; that file is the execution. One finding there
> changes the calculus below: CASA is initiated by Google, not by you, so
> submitting for verification tests the no-server argument at no cost.

## The costs, precisely

**The verification review itself is free.** Google doesn't charge to review an
app. The cost is the **CASA security assessment**, required only for *some*
apps using restricted scopes.

| | Cost |
|---|---|
| OAuth verification review | **$0** |
| CASA Tier 2 — lab-validated scan | ~**$540–1,000**/app, annually |
| CASA Tier 3 — full penetration test | ~**$4,500**/app |

TAC Security is the lab Google negotiated a discount with; Tier 2 starts around
$540. The old **free self-scan tier is deprecated** — no longer a path.

Budget **~$540–1,800/yr**. An earlier draft of this document guessed $0 on the
grounds that this app has no server of its own. That was too optimistic — see
below.

Also required: a **demo video** of the end-to-end OAuth flow, and roughly
**6 weeks** of review.

## The "no third-party server holds Google data" argument

> **Reworded for 1.1.0, and the precision matters.** This used to be the "no
> server" argument. That claim is no longer true as written: the extension now
> fetches `gating.json` from `raw.githubusercontent.com` and ships a content
> script for `extensionpay.com`. Both are third-party servers and a reviewer
> will see them in the manifest.
>
> The claim that survives, and the one that actually tracks Google's wording
> below, is narrower and stronger: **no Google user data reaches any server
> other than Google's own.** The config fetch is an unauthenticated download
> that sends nothing. ExtensionPay receives a random install identifier and a
> paid flag, and never a file name, description, or account address. Make
> *that* argument, and be ready to show the two hosts and say what each carries.

Two Google pages disagree, and it matters which one a reviewer applies.

The **developer-facing page** conditions the assessment on servers:

> "Every app that requests access to Google users' restricted data **and has
> the ability to access data from or through a third-party server** must go
> through a security assessment."
> — [restricted-scope-verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

The **authoritative Help Center requirements page** states it flatly, with no
architectural carve-out:

> "Apps requesting access to *restricted scopes* … must submit to an annual
> security assessment from a Google empanelled group of security assessors."
> — [support 13464321](https://support.google.com/cloud/answer/13464321?hl=en)

The [official FAQ](https://support.google.com/cloud/answer/13463817?hl=en)
contains **no exemption for client-only apps**. Its only assessment exemption
is "projects with no restricted scopes." Documented exceptions are personal
use, dev/testing, internal org use, and domain-wide installs — all about *who
uses it*, none about architecture.

**Conclusion:** no Google user data leaving Google's own servers is an argument
to raise, not an exemption to rely on. Plan for the cost; be pleasantly
surprised if not.

Note the developer-facing quote turns on "the ability to access data **from or
through** a third-party server." Read literally, having any third-party host in
the manifest invites the question. The answer is that neither host can access
Google user data, because none is ever sent to either. That is a claim about
data flow, which is demonstrable, rather than a claim about architecture, which
1.1.0 no longer supports.

## A second risk: "narrowest scope"

The same requirements page states:

> "You must only request the **narrowest scope(s)** your app needs to
> function."

This app requests `drive.metadata`. A reviewer could reasonably hold that
`drive.file` is narrower and sufficient, and reject on that basis. That's a
rejection risk independent of cost.

**You have a documented rebuttal** — see the section below. `drive.file` cannot
support right-click annotation of an arbitrary file, on Google's own authority.
Cite that if the objection comes up.

## The `drive.file` escape hatch — CLOSED, doesn't work

Recorded here so nobody re-investigates it.

`drive.file` is **non-sensitive**: no verification, no CASA, no 100-user cap,
no annual fee. If this app could run on it, Phase 2 would cease to exist. It
grants **per-file** access — the app can touch only files the user explicitly
hands it through the Google Picker, plus files the app created itself. That
user-as-gatekeeper property is exactly why Google doesn't audit it.

The hope was that picking a **folder** would cascade access to its contents, so
one "grant My Drive" step at setup would cover everything.

**It does not.** From Eric Koleda (Google) in the Apps Script community
[thread](https://groups.google.com/g/google-apps-script-community/c/_W-NKbttfbo):

> "the drive.file scope doesn't give you access to files within a folder that
> was picked"

Folder selection grants access to the folder object only. No cascade.

A second problem sat behind it regardless: files **added later** wouldn't be
covered even if folders had cascaded, so grants would need constant renewal.

### Why this isn't worth revisiting

Under `drive.file`, every file would need picking through a Picker dialog
before it could be annotated: open Picker → find file → select → *then* the
note box. That's more clicks than Drive's own description panel — it adds a
dialog to a workflow whose entire purpose is removing clicks.

**`drive.metadata` is the only scope that supports this interaction.** The
restricted-scope consequences in this document are unavoidable, not a design
oversight.

## What would make it definitely expensive

Adding **any server component** removes the no-server argument entirely. The
most likely accidental route: implementing Whisper dictation with a proxy to
hide the API key (see [VOICE-PLAN.md](VOICE-PLAN.md) Phase 3). Don't add a
backend casually.

## The realistic recommendation

**Stay under 100 users and skip Phase 2 entirely.** That's the documented
personal-use exemption, not a workaround. Users see the unverified warning
once; that's the whole cost.

Phase 1 ($5) still buys auto-updates and clean installs. Verification is a
separate decision you may never need to make.

---

# Security notes on a shared client ID

Applies to both paths — hardcoding the client ID for store users and handing it
to someone manually are the same thing.

**Not a secret.** Client IDs are public by design, visible in every OAuth URL.
Public clients like extensions have no client secret because they can't keep
one. Sharing it leaks nothing.

**Tokens never cross accounts.** The client ID identifies the *app*, not a
user. Each person authorizes with their own Google account; their token is
scoped to their own Drive and delivered to their own browser. You cannot reach
their files, they cannot reach yours. Cloud Console shows you aggregate request
counts and nothing else.

Three real costs, none of them data exposure:

| | |
|---|---|
| **User cap** | All users share your project's 100-user unverified cap. Lifetime, non-resettable. The one that actually bites. |
| **Your app name** | Their consent screen says "Drive Notes" with your support email. A modified copy circulating under your client ID would wear your name. Reputational, not access. |
| **Permanent grants** | Every registered redirect URI can receive tokens under your app identity, indefinitely. |

**You keep one control:** deleting the OAuth client in Cloud Console instantly
revokes everyone.

---

# Appendix — Pinning the extension ID manually

**Not part of the plan.** Only needed if you want to hand the folder to someone
before publishing to the store. Phase 1 makes all of this obsolete, so skip it
unless there's a specific reason.

## The problem it solves

For unpacked extensions Chrome derives the extension ID from the **folder's
absolute path on disk**, and the OAuth redirect URI is built from that ID:

```
https://<extension-id>.chromiumapp.org/
```

Every recipient gets a different ID, therefore a different redirect URI,
therefore one your OAuth client has never heard of. Authorization fails even
though the code is byte-identical.

Without pinning, sharing needs a round-trip per person: they install → send you
their redirect URI → you register it → you send back the client ID.

## The fix

A `"key"` field in `manifest.json` — a base64-encoded RSA public key — makes
Chrome derive the ID from **the key instead of the path**, so it's identical on
every machine.

### Step 1 — Save your current settings first

`chrome.storage` is keyed by extension ID. Changing the ID makes Chrome treat
this as a brand-new extension, so your saved settings are **wiped**. Copy these
out of Options first:

- OAuth client ID
- Google account email (if set)
- Modifier key and mode, if changed from defaults

### Step 2 — Generate the key and compute the resulting ID

Save as `generate-key.js` in the project root, run `node generate-key.js`:

```js
const { generateKeyPairSync, createHash } = require('crypto');
const { writeFileSync } = require('fs');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Chrome's extension ID: SHA-256 of the DER public key, first 16 bytes, each
// nibble mapped 0-15 -> 'a'-'p'.
const digest = createHash('sha256').update(publicKey).digest();
const id = [...digest.subarray(0, 16)]
  .flatMap((b) => [b >> 4, b & 15])
  .map((n) => String.fromCharCode(97 + n))
  .join('');

writeFileSync('extension-private-key.pem', privateKey);
console.log('manifest "key":\n' + publicKey.toString('base64') + '\n');
console.log('extension ID:      ' + id);
console.log('redirect URI:      https://' + id + '.chromiumapp.org/');
```

Keep `extension-private-key.pem` safe and **out of anything you share**.

### Step 3 — Add the key to the manifest

Top level of `manifest.json`, alongside `"name"` and `"version"`:

```json
"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A…"
```

Reload at `chrome://extensions` and confirm the ID matches the script output.

### Step 4 — Update Google Cloud

Your redirect URI just changed, so your own setup is broken until you fix it.

1. Cloud Console → **Clients** → your Web application client
2. Add `https://<new-id>.chromiumapp.org/` to *Authorised redirect URIs*
3. Remove the old one once the new one is confirmed working

### Step 5 — Re-enter settings and verify

Options → paste the client ID and account email back → Save → Test connection.
Reload a Drive tab and Alt+right-click something.

## Distributing this way

1. Zip the folder. **Exclude** `extension-private-key.pem`, `.claude/`, and
   `docs/` if you'd rather not share the notes.
2. Send it with the client ID string.
3. They: `chrome://extensions` → Developer mode → Load unpacked → Options →
   paste client ID → Save → reload their Drive tab.

### Tell them three things

- **They'll see "Google hasn't verified this app."** Advanced → Go to. Warn
  them in advance; it looks alarming and people back out.
- **They're granting `drive.metadata`** — read and modify metadata across their
  entire Drive, though not file contents. You know that's fine because you have
  the source. They're taking your word for it. Say so plainly.
- **Chrome nags about developer mode** on every startup, and managed/corporate
  Chrome profiles often block unpacked extensions outright. On a work machine
  this may simply not load.

**A consequence of pinning:** once the ID is fixed, anyone who obtains the
folder can install and authorize under your client ID without asking you. They
still only ever reach their own Drive, but they consume your user cap. That's
the trade for removing the round-trip.
