# Privacy Policy — File Notes for Google Drive

**Last updated:** 27 July 2026

## Summary

File Notes for Google Drive collects nothing. There is no server, no analytics,
no tracking, and no third party. Your data travels only between your own
browser and Google's own servers.

## What the extension does

It lets you add or edit the **description** field on your Google Drive files
and folders using a shortcut, instead of navigating Drive's details panel.
Descriptions are stored by Google as part of your file's metadata, in your own
Google Drive.

## What it accesses

To read and write descriptions, the extension requests the
`https://www.googleapis.com/auth/drive.metadata` permission from your Google
account. This allows viewing and modifying file and folder **metadata** — names
and descriptions. It does **not** grant access to the contents of your files.

The extension only reads or writes metadata for an item at the moment you
explicitly act on it. It does not scan, index, or enumerate your Drive.

## What it stores, and where

Everything is stored locally in your own browser. Nothing is stored by the
developer.

| Data | Where | Notes |
|---|---|---|
| OAuth client ID | `chrome.storage.sync` | Not a secret; public by OAuth design |
| Google account email (optional) | `chrome.storage.sync` | Only if you enter one, to speed up sign-in |
| Your preferences | `chrome.storage.sync` | Shortcut key, note mode |
| Access token | `chrome.storage.session` | Memory only. Never written to disk. Cleared when Chrome closes. |

Note that `chrome.storage.sync` is synchronised across your own Chrome profiles
by Google, under your own Google account.

The text of your notes is **not** retained by the extension. It is sent to
Google Drive and stored there as your file's description.

## What it transmits, and to whom

Network requests go to two places, both operated by Google:

- `accounts.google.com` — to sign in
- `www.googleapis.com` — to read and write the description on the item you act on

**No data is transmitted to the developer or to any third party.** The
extension has no backend server. There is no analytics, telemetry, advertising,
or error reporting.

## What is not collected

- No personally identifiable information
- No file contents
- No browsing history or web activity
- No location data
- No health or financial information
- No data is sold or shared with anyone
- No data is used for advertising, profiling, or creditworthiness

## Retention

The developer retains nothing, because the developer receives nothing. Locally
stored data persists until you remove the extension or clear its storage.
Descriptions you save live in your Google Drive and are yours to edit or delete
at any time.

## Revoking access

You can revoke the extension's access to your Google account at any time at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions).
Removing the extension from Chrome deletes all locally stored data.

Revoking access does not delete descriptions you have already saved — those are
part of your Drive files and remain yours.

## Children

The extension is not directed at children under 13 and collects no data from
anyone.

## Changes

Material changes to this policy will be reflected in the "Last updated" date
above, and in the extension's Chrome Web Store listing.

## Contact

Questions about this policy: **noahdavi@gmail.com**
