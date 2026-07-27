// ---------------------------------------------------------------------------
// STUB — not wired up yet.
//
// The zero-OAuth alternative: instead of calling the Drive API, drive Drive's
// own UI to edit the description. No scopes, no consent screen, no 100-user
// cap, no CASA assessment. That makes it the better backend if this is ever
// distributed widely — and the worse one for personal use, because it is
// far more fragile.
//
// Approach to try first (thanks to the Alt+V, D accelerator):
//
//   1. Select the target row (click it, or restore Drive's own selection).
//   2. Dispatch Alt+V, then D, to open the details panel via Drive's hidden
//      menubar — this replaces a ~6-selector chain with two keypresses.
//   3. Find the description textarea in the panel by aria-label / role.
//   4. Set its value using the NATIVE setter, not `.value =`. Closure-based
//      apps like Drive track their own state and ignore plain assignment:
//
//        const proto = window.HTMLTextAreaElement.prototype;
//        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
//        setter.call(el, text);
//        el.dispatchEvent(new Event('input', { bubbles: true }));
//
//   5. Blur to commit, then verify by reading the value back.
//
// KNOWN RISK, UNVERIFIED: synthetic KeyboardEvents carry `isTrusted: false`.
// Browser-level shortcuts ignore them outright. Drive's Alt+V menubar is
// implemented in its own JavaScript rather than by the browser, so it *may*
// honour a synthetic event — but this has not been tested. If it doesn't,
// fall back to clicking the details toggle button, located by its aria-label.
//
// This backend must run in the CONTENT SCRIPT, not here — it needs DOM access.
// The file lives beside api-backend.js only to keep the two implementations of
// the same interface together.
// ---------------------------------------------------------------------------

export async function getDescription() {
  throw new Error('UI backend not implemented yet');
}

export async function setDescription() {
  throw new Error('UI backend not implemented yet');
}

export async function testAuth() {
  return true; // No auth needed — that's the entire point of this backend.
}
