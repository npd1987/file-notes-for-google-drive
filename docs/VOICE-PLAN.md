# Built-in voice dictation — implementation plan

**Goal:** a mic button in the note box, plus a keyboard shortcut that opens the
box already recording. No dependency on OS-level dictation, so it works on
macOS, Linux and ChromeOS rather than Windows only.

**Status:** not started. The core extension works; this bolts onto the side.
`resolver.js` and the entire backend are untouched by this work.

---

## The constraint that shapes everything

The content script runs in **`drive.google.com`'s** origin. Microphone
permission is granted *per origin*. So a `getUserMedia()` call from the content
script prompts for **Drive**, not for our extension — and if the user has ever
denied mic access to Drive, we're permanently stuck with no way to recover.

The fix is to do all audio work inside a hidden `<iframe>` whose `src` is a page
we host at `chrome-extension://<id>/`. That document runs at **our** origin, so
the grant belongs to us, persists across sessions, and is unaffected by whatever
the user has decided about Drive.

Transcripts cross back to the content script via `postMessage`.

### Why this is possible at all

Permissions Policy defaults `microphone` to `self`, meaning a cross-origin
iframe gets nothing *unless the parent explicitly delegates* via an
`allow="microphone"` attribute — and delegation is impossible if the parent
document sends a header locking the feature off.

Checked 2026-07-26: Drive's `Permissions-Policy` response header lists only
client-hint features (`ch-ua-*`). There is **no** `microphone=()` directive, so
the default `self` applies and delegation is available to us. We create the
iframe element ourselves, so we control the `allow` attribute.

> Caveat: that check was against the unauthenticated redirect chain. Re-confirm
> against the signed-in app in DevTools during Phase 0. If Google ever adds a
> `microphone=()` directive, this entire approach dies and the fallback is a
> separate extension popup window (see *Fallbacks*).

---

## Phase 0 — Spike (~30 min). Do this before writing anything else.

The only genuine unknown is whether the mic grant flows cleanly through an
extension-origin iframe embedded in Drive. Everything after this is mechanical.

1. Add a minimal `src/mic/mic.html` that calls `getUserMedia({audio: true})` on
   load and `postMessage`s success or the error name to its parent.
2. Add it to `web_accessible_resources` for `https://drive.google.com/*`.
3. From the content script, inject:
   ```js
   const frame = document.createElement('iframe');
   frame.src = chrome.runtime.getURL('src/mic/mic.html');
   frame.allow = 'microphone';
   frame.style.display = 'none';
   document.documentElement.appendChild(frame);
   ```
4. Open Drive, trigger it, and confirm the permission prompt appears **and is
   attributed to the extension**, not to drive.google.com.

**Pass:** prompt appears, granting it sticks across a page reload.
**Fail:** `NotAllowedError` with no prompt → delegation is blocked; go to
*Fallbacks* before investing further.

Do not build Phase 1 until this passes.

---

## Phase 1 — Web Speech API

Free, no API key, live interim results. This is the default implementation.

### New files

**`src/mic/mic.html`** — near-empty document, loads `mic.js`. Never visible.

**`src/mic/mic.js`** (~80 lines) — the recognizer, running at extension origin.

- Owns a `webkitSpeechRecognition` instance with `continuous = true` and
  `interimResults = true`.
- Listens for `{type:'mic:start'}` / `{type:'mic:stop'}` from the parent.
- Emits `{type:'mic:interim', text}`, `{type:'mic:final', text}`,
  `{type:'mic:error', name}`, `{type:'mic:state', recording}`.
- **Validates `event.origin` on every inbound message.** The iframe is embedded
  in a page we don't control; treat anything arriving from it as untrusted.

### Modified files

| File | Change |
|---|---|
| `manifest.json` | `web_accessible_resources` entry for `src/mic/*` |
| `src/content/overlay.js` | Mic button, recording indicator, transcript insertion (~50 lines) |
| `src/content/content.js` | Lazily inject the iframe, bridge postMessage (~30 lines) |
| `src/options/options.*` | One-time "Enable microphone" button + status (~30 lines) |

### The recognizer interface

Define this now, even with one implementation. It's what makes Phase 3 a swap
rather than a rewrite — same reasoning as the existing backend split.

```js
start()                      // begin capturing
stop()                       // end capturing, flush any pending final result
onInterim(text)              // live, not yet committed — may be revised
onFinal(text)                // committed, safe to insert
onError(name)                // 'not-allowed' | 'no-speech' | 'network' | …
```

Web Speech fires `onInterim` continuously. Whisper will only ever fire
`onFinal`. The overlay must already handle an implementation that never sends
interim results — build that in from the start.

### Four things that must be handled or it will feel broken

**1. Auto-restart.** Chrome's recognizer stops on its own after a few seconds of
silence and caps total session length. If `onend` fires while the user still
has recording active, restart it immediately. Without this, dictation dies
mid-thought and feels unreliable — this is the single most common way these
implementations disappoint.

Guard against a restart loop: if `onend` fires more than ~3 times in 2 seconds
with no results in between, stop and surface an error instead of spinning.

**2. Interim text must not clobber typed text.** Track the interim span as an
explicit `[start, end]` range in the textarea. On each interim update, replace
exactly that range and move the end. On `onFinal`, commit the range and clear
it. Never use `textarea.value +=` — the user can type or click mid-dictation
and the caret will be somewhere unexpected.

**3. Insert at the caret, not the end.** The whole point of the box is editing
existing descriptions. Dictation should land where the cursor is.

**4. Distinguish the error cases.** `not-allowed` needs "enable the mic in
options"; `no-speech` needs "didn't catch that"; `network` needs "speech
recognition is offline". A single generic failure message makes the feature
feel broken when it's actually just quiet in the room.

### Permission first-run flow

Chrome only prompts for the mic from a user gesture, and the first grant is
better done somewhere unambiguous than inside a transient overlay.

1. Options page gets an **Enable microphone** button that calls `getUserMedia`
   at extension origin, then shows granted / denied.
2. The overlay's mic button checks `navigator.permissions.query({name:'microphone'})`
   first. If `denied` or `prompt`, it links to options rather than failing
   silently at the moment the user tries to speak.

### UI states for the mic button

| State | Appearance |
|---|---|
| Idle | Outline mic icon |
| Requesting permission | Spinner |
| Recording | Filled red mic, subtle pulse |
| Error | Mic with strikethrough + message in the existing status line |

Reuse the status line already in the overlay. No new layout.

---

## Phase 2 — Keyboard shortcut (~10 lines, after Phase 1)

This is the part of the original idea that's still missing: start dictating
without touching the mouse.

Add to `manifest.json`:

```json
"commands": {
  "note-with-voice": {
    "suggested_key": { "default": "Alt+Shift+D" },
    "description": "Add a note to the selected Drive item, recording"
  }
}
```

The service worker relays the command to the active Drive tab. The content
script resolves the target from Drive's **current selection** (rows carry
`aria-selected="true"`) rather than from a pointer position, opens the box, and
starts recording immediately.

Note this needs a selection-based resolver path — the existing one resolves
from `event.target`. Small addition to `resolver.js`, and the first change to
that file since it started working, so re-test the mouse path afterward.

---

## Phase 3 — Whisper (optional, later)

Worth doing **only if proper-noun accuracy proves annoying in real use.** Don't
pre-build it. Web Speech handles "notes from the Tuesday sync" fine and mangles
"Kowalczyk"; whether that matters depends entirely on what you dictate.

Same mic plumbing, different recognizer — `mic.js` uses `MediaRecorder` instead
of `webkitSpeechRecognition`, POSTs the blob to the API, emits one `onFinal`.

### Comparison

| | Web Speech | Whisper |
|---|---|---|
| Cost | Free | ~$0.006/min |
| API key | None | Required, stored in extension options |
| Live interim text | Yes | No — silence until you stop |
| Latency | Instant | ~1–2s after stopping |
| Proper nouns | Mediocre | Much better |
| Offline | No | No |
| Punctuation | Weak | Good |

### The thing to get right

An API key in extension storage is readable by anyone with local access to the
profile. That's acceptable for a personal tool. It is **not** acceptable if this
is ever distributed — at that point the key has to move behind a proxy you
control, which also means you'd then be transmitting restricted-scope data
through a server, which is exactly the trigger for the CASA assessment
described in the README. Phase 3 and public distribution interact badly. Keep
that in mind before doing both.

---

## Fallbacks if Phase 0 fails

1. **Separate popup window** — `chrome.windows.create` with a small
   extension-origin window. Unblockable, since it's a top-level document at our
   own origin. Cost: it steals focus, which undercuts the "fast" goal.
2. **Offscreen document** — `chrome.offscreen` with reason `USER_MEDIA`.
   Cleanest if it works, but it is **unverified** whether
   `webkitSpeechRecognition` functions in an offscreen document; reports are
   mixed and it may require a focused document. Test before committing. Works
   for `MediaRecorder` + Whisper regardless, so this becomes the better path if
   Phase 3 ever happens.
3. **Keep Win+H** and ship no built-in voice.

---

## Test checklist

- [ ] Grant flows through the iframe; prompt attributed to the extension
- [ ] Permission survives a browser restart
- [ ] Dictate >30 seconds continuously without dropout (auto-restart works)
- [ ] Type manually mid-dictation; interim text doesn't eat it
- [ ] Dictate into the middle of an existing description
- [ ] Deny permission, confirm the error points at options
- [ ] Stay silent 15s, confirm `no-speech` is a message not a crash
- [ ] Go offline, confirm `network` error is legible
- [ ] Esc mid-recording stops the mic (no hot mic after the box closes)
- [ ] Mic actually released on close — check the tab's recording indicator
- [ ] Alt+Shift+D with a row selected opens recording
- [ ] Mouse path still works after the resolver change

---

## Effort

| Phase | Estimate |
|---|---|
| 0 — Spike | 30 min |
| 1 — Web Speech | Half a day |
| 2 — Shortcut | 1 hour |
| 3 — Whisper | 2–3 hours, only if needed |

Phase 1 assumes Phase 0 passes cleanly. If delegation misbehaves, budget an
extra day for the popup-window fallback.
