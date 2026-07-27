# Privacy Policy: File Notes for Google Drive

**Last updated:** 27 July 2026

## Summary

File Notes for Google Drive collects nothing about you. There is no analytics,
no tracking, and no advertising. Your notes travel only between your own browser
and your own Google Drive. The extension makes two other network requests, both
described below, and neither carries anything about you or your files.

## What the extension does

It lets you add or edit the **description** field on your Google Drive files
and folders using a shortcut, instead of navigating Drive's details panel.
Descriptions are stored by Google as part of your file's metadata, in your own
Google Drive.

## What it accesses

To read and write descriptions, the extension requests the
`https://www.googleapis.com/auth/drive.metadata` permission from your Google
account. This allows viewing and modifying file and folder **metadata**, meaning
names and descriptions. It does **not** grant access to the contents of your
files.

The extension only reads or writes metadata for an item at the moment you
explicitly act on it. It does not scan, index, or enumerate your Drive.

## What it stores, and where

Everything is stored locally in your own browser. Nothing is stored by the
developer.

| Data | Where | Notes |
|---|---|---|
| Your preferences | `chrome.storage.sync` | Shortcut key, note mode |
| OAuth client ID (optional) | `chrome.storage.sync` | Only if you supply your own. Not a secret; public by OAuth design |
| Google account addresses | `chrome.storage.local` | The address of each account you authorize, so signing in again can name the right one instead of showing you an account chooser. Read from the Drive API with the token you just granted, and shown back to you on the options page and in the toolbar popup |
| Settings file | `chrome.storage.local` | A cached copy of the developer's configuration file, described below |
| Purchase flag | `chrome.storage.local` | Whether this browser has bought the multi-account unlock. A true or false value, nothing more |
| ExtensionPay identifier | Extension storage | A random identifier created by the bundled ExtensionPay library so a purchase can be matched to this installation. Not derived from anything about you |
| Access token | `chrome.storage.session` | Memory only. Never written to disk. Cleared when Chrome closes |

Note that `chrome.storage.sync` is synchronised across your own Chrome profiles
by Google, under your own Google account.

The text of your notes is **not** retained by the extension. It is sent to
Google Drive and stored there as your file's description.

## What it transmits, and to whom

**To Google, operated by Google:**

- `accounts.google.com`, to sign in
- `www.googleapis.com`, to read and write the description on the item you act
  on, and to confirm which Google account an access token belongs to

**To GitHub, as a plain file download:**

- `raw.githubusercontent.com`, from which the extension downloads one settings file
  published by the developer, at most once every 24 hours. It controls whether
  the multi-account feature is free or paid, how many accounts are free, and the
  wording of the upgrade prompt, so these can be corrected without shipping a new
  version of the extension. The request is an ordinary unauthenticated download.
  It sends no account information, no identifiers, and no cookies. GitHub sees
  only that some browser requested a public file, as it would for any public URL.

**To ExtensionPay, only in connection with the optional purchase:**

- `extensionpay.com`, where the bundled ExtensionPay library checks whether this
  installation has purchased the multi-account unlock, identified by the random
  identifier described above. If you choose to buy, the checkout happens on
  ExtensionPay's own page, and your payment details are handled there by
  ExtensionPay and Stripe. The extension never sees or stores your payment
  details. It receives only a true or false answer about whether a purchase
  exists.

**No data is transmitted to the developer.** There is no backend server, no
analytics, no telemetry, no advertising, and no error reporting.

## What is not collected

- No personally identifiable information is collected by the extension
- No file contents
- No browsing history or web activity
- No location data
- No health information
- No payment details reach the extension or the developer
- No data is sold or shared with anyone
- No data is used for advertising, profiling, or creditworthiness

## Third parties

Two third parties are involved, and only in the limited ways described above:

- **GitHub**, as the host of a public settings file the extension downloads
- **ExtensionPay** and **Stripe**, as the processors of the optional one-time
  purchase, who handle payment details directly and under their own privacy
  policies

Neither receives your notes, your file names, your file contents, or your Google
account address.

## Retention

The developer retains nothing, because the developer receives nothing. Locally
stored data persists until you remove the extension or clear its storage.
Descriptions you save live in your Google Drive and are yours to edit or delete
at any time.

## Revoking access

You can revoke the extension's access to your Google account at any time at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions).
Removing the extension from Chrome deletes all locally stored data.

Revoking access does not delete descriptions you have already saved. Those are
part of your Drive files and remain yours.

## Children

The extension is not directed at children under 13 and collects no data from
anyone.

## Changes

Material changes to this policy will be reflected in the "Last updated" date
above, and in the extension's Chrome Web Store listing.

## Contact

Questions about this policy: **filenotes.gdrive@gmail.com**
