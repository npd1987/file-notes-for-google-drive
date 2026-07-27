# Chrome Web Store upload — step by step

Work top to bottom. **Order matters in Phase C→D**: the store assigns your
permanent extension ID at upload, and OAuth can't be wired up until you know
it. Doing these out of order gives you a published extension that can't sign
in.

Copy for every store field lives in [../store/LISTING.md](../store/LISTING.md).

---

## Phase A — Build the package

- [ ] **Generate icons.** Open `store/icon-generator.html` in Chrome, pick a
      style and colour, click download. Save all four PNGs into a new
      `icons/` folder in the project root.

- [ ] **Verify they landed.** You should have `icons/icon16.png`,
      `icon32.png`, `icon48.png`, `icon128.png`. The manifest already
      references these paths — a missing file fails upload.

- [ ] **Set the version.** In `manifest.json`, change `"version"` to
      `"1.0.0"`. Every upload needs a higher version than the last, so it's
      worth starting clean.

- [ ] **Build a clean zip.** Don't right-click the project folder — that
      nests everything one level deep and the store rejects it, because
      `manifest.json` must sit at the zip root. Run this instead:

      ```powershell
      $stage = "$env:TEMP\filenotes-package"
      if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
      New-Item -ItemType Directory -Path $stage | Out-Null
      Copy-Item manifest.json $stage
      Copy-Item src   -Destination $stage -Recurse
      Copy-Item icons -Destination $stage -Recurse
      Compress-Archive -Path "$stage\*" -DestinationPath ".\file-notes-v1.0.0.zip" -Force
      ```

      This deliberately excludes `store/`, `docs/`, `screenshots/`,
      `.claude/`, and the README — working files that shouldn't ship.

- [ ] **Smoke-test the zip.** Extract it somewhere temporary, Load unpacked
      from *that* folder, and confirm Alt+right-click still works. Catches a
      missing file before review does.

## Phase B — Register

- [ ] Go to the
      [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
      and pay the **$5** one-time fee. Covers every extension you ever
      publish. (You may already have an account from years ago — check before
      paying.)

- [ ] **Set and verify the publisher contact email.** ☰ menu →
      **PUBLISHER → Settings** → enter the address → **Verify** → click the
      link Google emails you.

      Do this now rather than later: it's account-level, it has nothing to do
      with your listing, and *Submit for review* stays greyed out until it's
      verified — with no hint why unless you click "Why can't I submit?".
      This address is displayed publicly on the listing.

## Phase C — Upload, but do NOT publish

- [ ] **Add new item** → upload `file-notes-v1.0.0.zip`.

- [ ] **Copy the Item ID.** It's in the dashboard URL:
      `.../devconsole/…/<ITEM-ID>/edit`. A 32-character string of letters.
      **This is your permanent extension ID.** Write it down.

> Stop here. Publishing now would ship an extension that can't authorize,
> because Google doesn't yet recognise its redirect URI.

## Phase D — Wire up OAuth to the new ID

- [ ] **Cloud Console** → **Clients** → your Web application client → add to
      *Authorised redirect URIs*:

      ```
      https://<ITEM-ID>.chromiumapp.org/
      ```

      Keep your existing unpacked URI too — you'll want the dev copy working
      while you test.

- [ ] **Fill in the client ID.** In `src/background/api-backend.js`, set
      `DEFAULT_CLIENT_ID` to your OAuth client ID string. This is what saves
      users from creating their own Cloud project. Safe to hardcode: client
      IDs are public by design and there's no secret beside it.

- [ ] **Bump to `1.0.1`**, rebuild the zip (same command, new filename),
      and upload it to the same item.

## Phase E — Fill in the listing

All text is in [../store/LISTING.md](../store/LISTING.md) — paste, don't retype.

**Store listing tab**
- [ ] Name: `File Notes for Google Drive`
- [ ] Summary (the 120-char one)
- [ ] Detailed description
- [ ] Category: **Productivity**
- [ ] Store icon: `icon128.png`
- [ ] Screenshots (1280×800) — **check for personal data first**

**Privacy tab**
- [ ] Single purpose description
- [ ] Justification for each: `storage`, `identity`, googleapis.com host
      permission, drive.google.com content script
- [ ] Remote code: **No**
- [ ] Data collection: leave **every** box unticked
- [ ] Tick all three certifications
- [ ] Privacy policy URL: your published Doc `/pub` link

**Distribution tab**
- [ ] Visibility: **Unlisted**
- [ ] All regions

## Phase F — Submit

- [ ] **Submit for review.** Hours to days. Restricted scopes get read
      closely, so expect the slower end.

- [ ] If a reviewer questions the scope, LISTING.md ends with a prepared
      rebuttal explaining why `drive.file` can't do this.

## Phase G — After approval

- [ ] **Disable your unpacked copy first.** ⚠️ Running the store version and
      the unpacked version together means *two* content scripts on
      drive.google.com — two context-menu handlers, two overlays, one
      Alt+right-click. Confusing and hard to diagnose. Turn one off.

- [ ] Install from your store link and test end to end.

- [ ] Once the store version is confirmed working, remove the old unpacked
      redirect URI from Cloud Console.

---

## Common rejection reasons, and where you stand

| Reason | Status |
|---|---|
| Trademark in the name | ✅ Avoided — "for Google Drive", not leading with it |
| Missing/unreachable privacy policy | ✅ Published Doc |
| Permissions broader than justified | ⚠️ Restricted scope — justification prepared |
| Vague single-purpose statement | ✅ Written |
| Undeclared remote code | ✅ Everything's bundled |
| Screenshots that don't show the product | ✅ Yours shows the real interaction |

## What this does *not* get you

- ❌ The **"Google hasn't verified this app"** screen — still appears
- ❌ The **100-user cap** — still applies

Both belong to OAuth verification, which is separate and probably never worth
doing. See [SHARING-PLAN.md](SHARING-PLAN.md) Phase 2.

## Worth doing later

Migrating to `chrome.identity.getAuthToken` now that the ID is permanent. It
deletes the implicit flow, the hourly re-auth, the `login_hint` workaround,
and the whole session-storage caching layer. Needs a *Chrome Extension*-type
OAuth client instead of *Web application*. See SHARING-PLAN.md Phase 1.
