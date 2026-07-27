# Chrome Web Store listing — copy & paste

Everything below is text you paste into fields in the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole). Nothing
here needs editing except where marked **[FILL IN]**.

---

## Store listing tab

### Name

```
File Notes for Google Drive
```

> Deliberately not "Google Drive File Notes." Leading with another party's
> trademark is a common rejection reason; the "X for Y" form is the accepted
> descriptive convention.

### Summary (132 characters max)

```
Alt + right-click to edit any Drive file or folder's built-in description. Searchable notes and tags, filenames stay clean.
```

*(123 characters)*

> ⚠️ **This field is not editable in the dashboard.** It's read from the
> `description` key in `manifest.json`, and the dashboard shows it greyed out
> as "Summary from package". Changing it means editing the manifest, rebuilding
> the zip and re-uploading — keep the two strings identical.
>
> Changed after 1.0.1 — names the native description field, and leads with
> search rather than burying it.

### Detailed description

```
Give your Drive files the context their filenames can't carry.

Google Drive already has a description field on every file and folder, but reaching it takes a right-click, a details panel, and a scroll. Most people never find it. File Notes puts it one shortcut away.

Alt + right-click any file or folder. A box opens at your cursor with the existing description loaded and ready to edit. Type, press Ctrl+Enter, done.

WHY THE DESCRIPTION FIELD

Because Drive search reads it. Every word you put there is findable later, without touching the filename and without opening the file to bury the information inside it.

So your names stay short and clean, and the file still carries every term you might search for.

USE CASES

• Search tags: write the words you'll actually reach for months from now, like "invoice, Q3, unpaid, Henderson". The filename stays "Invoice 1042.pdf".
• Video and image files: describe what search can't see, like "raw interview footage, second camera, unusable audio".
• Context that doesn't belong in the document: why a draft was rejected, who asked for it, what's still missing.
• Folder notes: what a project folder is for, and what state it's in.
• A running log: dated-entry mode adds to the note instead of replacing it.

MULTIPLE GOOGLE ACCOUNTS

If you have more than one Google account signed into Chrome, File Notes works in all of them. It reads which account a Drive tab belongs to and edits that account's file, so notes taken in a work tab and a personal tab each save where they should.

The toolbar icon lists every account you have connected and opens the right Drive in one click, so you always know which one you're heading into.

One Google account is free. Connecting more is a one-time payment that unlocks unlimited accounts, with no subscription and nothing to renew. It travels with your Chrome profile, so signing into Chrome on another computer carries it across. If you were already using several accounts before this became a paid feature, they stay unlocked.

FEATURES

• Alt + right-click any file or folder (configurable to Ctrl or Shift)
• Opens at your cursor, focused and ready to type
• Loads the existing description so you extend rather than overwrite
• Three modes: continue the text, start a new line, or start a dated entry
• Ctrl+Enter to save, Esc to cancel
• Works on folders as well as files
• Works across every Google account signed into Chrome
• Account picker in the toolbar popup, so the right Drive is one click away
• Dictate with your operating system's voice typing, since the box is a normal text field

PRIVACY

No analytics. No tracking. No account to create. Your notes go directly from your browser to your own Google Drive and nowhere else. The extension cannot read your file contents, only names and descriptions.

The only other request it makes is a small settings file it checks once a day, which sends nothing about you and nothing about your files.

Your plain right-click is untouched. Drive's own menu works exactly as before.
```

> Changed after 1.0.1 — the USE CASES section is new. Listing fields carry over
> between versions untouched, so **re-paste this field when submitting 1.0.2**
> or the old description stays live.
>
> Changed again for 1.1.0, and **pasted into the dashboard on 27 Jul 2026**. The
> MULTIPLE GOOGLE ACCOUNTS section and two FEATURES bullets are new.
>
> **"No server" was removed from PRIVACY and it must not come back.** As of
> 1.1.0 the extension fetches a config file from `raw.githubusercontent.com`
> and ships a content script for `extensionpay.com`. Both are visible to a
> reviewer as host permissions, and a listing claiming no server contradicts
> them.
>
> **The price is deliberately not named.** `priceLabel` is remote config and can
> change without a review; a number written here would need a fresh review to
> correct. Say "a one-time payment" and let the button carry the amount.

### Category

```
Productivity
```

### Language

```
English (United States)
```

---

## Graphics you need to produce

| Asset | Spec | How |
|---|---|---|
| Store icon | 128×128 PNG | `store/icon-generator.html` |
| Screenshot ×1–5 | **1280×800** or 640×400 PNG | See below |
| Small promo tile | 440×280 PNG (optional) | Optional — skip |

### Screenshot suggestions

At minimum one, ideally three. Take them at 1280×800:

1. The note box open over a Drive folder, mid-sentence — the core moment
2. Drive search returning a file by a word that only appears in its description
3. The options page

Windows: `Win+Shift+S` to snip, then crop/pad to exactly 1280×800 in Paint.

---

## Privacy practices tab

### Single purpose description

```
File Notes for Google Drive lets a user add or edit the description field on their own Google Drive files and folders using a keyboard-and-mouse shortcut, without navigating Drive's details panel.
```

### Permission justifications

**`storage`**

```
Stores the user's preferences locally, such as the modifier key and note mode. If the user chooses to supply their own OAuth client ID under Advanced settings, that is stored too. It also records the email address of each Google account the user authorizes, so that renewing an expired access token can name the right account instead of interrupting the user with an account chooser; those addresses are read from the Drive API using the access token the user just granted, and are shown back to the user on the options page and in the extension's toolbar popup. Short-lived access tokens are cached in session storage so the user is not asked to re-authorize every few minutes. The extension's own downloaded configuration file and a single flag recording whether this browser has purchased the multi-account unlock are cached here as well. No data is transmitted anywhere by this permission.
```

> Changed after 1.0.1. The version submitted with 1.0.1 said "their OAuth
> client ID", which implied every user supplies their own. They don't — the
> extension ships with a built-in client and the stored ID is an optional
> override, so for a typical install nothing of the sort is stored. **Re-paste
> this field when submitting 1.0.2**; the Web Store keeps the old text
> otherwise.

**`identity`**

```
Required to obtain an OAuth access token so the extension can read and write the description field via the Google Drive API. The user authorizes their own Google account directly with Google; the extension never handles credentials.
```

**Host permissions — ALL HOSTS GO IN ONE FIELD**

> ⚠️ Two traps in this one field, both hit during the 1.1.0 submission.
>
> **It is ONE field for every host.** `storage` and `identity` get a box each,
> but all hosts share a single "host permission justification" field. Do not go
> looking for four separate boxes; they do not exist.
>
> **It is capped at 1000 characters.** The block below is 983. There is no room
> to describe each host at length, so every sentence in it is load-bearing.
> `storage` has the same cap and sits at 893.

```
Four hosts, one job each.

drive.google.com: the interface. A content script handles Alt + right-click on a file or folder, identifies the item, and shows the note box. It reads only the item's file ID and which account the tab uses.

www.googleapis.com: the Drive API. Reads the item's current description, saves the edited one, and confirms which account a token belongs to. The only host any file data touches.

raw.githubusercontent.com: one small static JSON settings file from the developer, holding whether multi-account is free or paid, the free limit, and the upgrade prompt wording, so these can be corrected without a new version. Unauthenticated GET, at most once a day, sending no user data or identifiers. Configuration values only, never evaluated as code.

extensionpay.com: payment for the optional one-time multi-account unlock. The ExtensionPay library is bundled, not loaded remotely; a content script here reports a completed payment back. No Drive data is sent.
```

> The last two hosts are new in 1.1.0. The first two are compressed from the
> 1.0.1 submission, which described them in separate fields at greater length.

**Remote code**

```
No, I am not using remote code
```

All JavaScript is bundled in the package, including the ExtensionPay library at
`src/vendor/ExtPay.js`. The only file fetched at runtime is the JSON
configuration described above, which is parsed as data and never evaluated.
Expect a reviewer to probe this, since a fetch from a code-hosting domain looks
like remote code at a glance. The distinction that matters: `gating.json` holds
six values, all of them booleans, numbers or display strings, and `licensing.js`
runs every one of them through `sanitize()` before use.

### Data usage — declare NO collection

Leave **every** data-type checkbox unticked. The extension collects nothing:
no PII, no health, no financial, no authentication info, no personal
communications, no location, no web history, no user activity, no website
content.

Then tick all three certifications:

- ☑ I do not sell or transfer user data to third parties, outside of approved use cases
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

**[FILL IN]** — see the hosting note in the setup checklist.

---

## Distribution tab

### Visibility

```
Unlisted
```

Reachable by direct link, absent from store search. Change to Public later if
you ever want it discoverable.

### Regions

All regions.

---

## Expect this question

Restricted scopes get read closely. If a reviewer asks why not the narrower
`drive.file` scope, the answer is:

```
The drive.file scope only grants access to files the user selects individually through the Google Picker, and per Google's own guidance, selecting a folder does not grant access to files inside it. This extension's single purpose is annotating any file the user right-clicks in place; requiring a Picker dialog per file before each note would defeat that purpose entirely and be slower than Drive's own built-in description panel. drive.metadata is the narrowest scope that supports the feature, and it grants no access to file contents.
```
