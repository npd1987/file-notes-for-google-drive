// The note box. Lives in a Shadow DOM so Drive's stylesheet can't reach in
// and our styles can't leak out.

const OVERLAY_CSS = `
  :host { all: initial; }
  .box {
    position: fixed;
    z-index: 2147483647;
    width: 340px;
    box-sizing: border-box;
    padding: 12px;
    border-radius: 10px;
    background: #ffffff;
    color: #1f1f1f;
    border: 1px solid rgba(0, 0, 0, 0.15);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    font: 13px/1.45 "Google Sans", Roboto, system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    .box { background: #1f1f1f; color: #e8eaed; border-color: rgba(255,255,255,0.16); }
    textarea { background: #2d2e30 !important; color: #e8eaed !important; border-color: #5f6368 !important; }
  }
  .title {
    font-weight: 500;
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 84px;
    resize: vertical;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #c4c7c5;
    background: #fff;
    color: inherit;
    font: inherit;
  }
  textarea:focus { outline: 2px solid #0b57d0; outline-offset: -1px; }
  .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .hint { flex: 1; font-size: 11px; opacity: 0.65; }
  button {
    font: inherit;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid transparent;
    cursor: pointer;
  }
  .save { background: #0b57d0; color: #fff; }
  .save:disabled { opacity: 0.5; cursor: default; }
  .cancel { background: transparent; color: inherit; border-color: #c4c7c5; }
  .status { margin-top: 6px; font-size: 12px; min-height: 16px; }
  .status.error { color: #d93025; }
  .status.ok { color: #188038; }

  /* The upgrade offer replaces the editor in place rather than opening a
     second window: the click that triggered it was aimed at this spot, and
     moving the answer somewhere else would lose it. */
  .upgrade { display: none; }
  .box.locked .upgrade { display: block; }
  /* Normally the title carries the filename, so an offer with no product name
     asks for money without saying what for. Only shown when locked, because in
     the editor the filename is the useful thing to see. */
  .product { display: none; }
  .box.locked .product {
    display: block;
    font-size: 11px;
    opacity: 0.6;
    margin-bottom: 2px;
  }
  .box.locked textarea,
  .box.locked .status,
  .box.locked .hint,
  .box.locked .save { display: none; }
  .upgrade p { margin: 0 0 10px; font-size: 12.5px; opacity: 0.85; }
  .upgrade .unlock { background: #0b57d0; color: #fff; width: 100%; }
  .upgrade .note { font-size: 11px; opacity: 0.6; margin: 8px 0 0; }

  /* Shown when this content script has been orphaned by an extension update.
     The page has to reload to get a live script, so the box stops pretending
     it can save and offers the one action that helps. */
  .stale { display: none; }
  .box.stale-mode .stale { display: block; }
  .box.stale-mode .save,
  .box.stale-mode .hint { display: none; }
  /* Only when there is nothing typed. If the user has text, the editor stays
     put so a reload can't quietly eat what they wrote. */
  .box.stale-empty textarea,
  .box.stale-empty .status { display: none; }
  .stale p { margin: 0 0 10px; font-size: 12.5px; opacity: 0.85; }
  .stale .reload { background: #0b57d0; color: #fff; width: 100%; }
  /* Warmer than the muted note under the upgrade button: this one is telling
     you that pressing the button below will discard what you typed. */
  .stale .warn { font-size: 11.5px; color: #b06000; margin: 0 0 8px; }
  .stale .warn:empty { display: none; }
  @media (prefers-color-scheme: dark) { .stale .warn { color: #fdd663; } }
`;

let host = null;
let shadow = null;
let activeHandle = null;

// Drive binds single keys as global shortcuts, and its listeners sit on the
// document. Our box lives in a CLOSED shadow root, so by the time an event
// reaches those listeners it has been retargeted to the host <div> and Drive's
// "is the user typing in a field?" check no longer sees a textarea. It treats
// the keystroke as a shortcut, and for any key where that means preventDefault,
// the character is never typed at all. An apostrophe was one of them.
//
// Stopping the event on the box itself is too late: that is the bubble phase,
// and anything Drive registered in the CAPTURE phase has already run. So this
// sits on `window` in the capture phase, which is the first node in the path,
// and is registered at document_start so it is ahead of the page's own scripts.
//
// stopPropagation does NOT cancel the default action, so the character still
// lands in the textarea and Enter still inserts a newline. It only means Drive
// never hears the keystroke.
function onKeyCapture(event) {
  if (!host || !activeHandle) return;
  // composedPath() truncates at the host for a closed root, which is exactly
  // the node being tested for, so this works without opening the shadow tree.
  if (!event.composedPath().includes(host)) return;

  event.stopPropagation();
  if (event.type !== 'keydown') return;

  if (event.key === 'Escape') {
    activeHandle.close();
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    activeHandle.commit();
  }
}

// Registered once, at load, rather than per-open: capture listeners on the same
// node fire in registration order, and the only way to be certain of running
// before Drive's is to be attached before Drive's scripts run at all.
for (const type of ['keydown', 'keypress', 'keyup']) {
  window.addEventListener(type, onKeyCapture, true);
}

function build() {
  host = document.createElement('div');
  host.setAttribute('data-drive-notes', '');
  // 'closed' so the host page can't reach the note text through
  // host.shadowRoot while it's being typed. We keep our own reference, so
  // nothing else changes.
  shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>${OVERLAY_CSS}</style>
    <div class="box" role="dialog" aria-label="Drive note">
      <div class="product"></div>
      <div class="title"></div>
      <textarea placeholder="Describe this item…" spellcheck="true"></textarea>
      <div class="status"></div>
      <div class="upgrade">
        <p class="body"></p>
        <button class="unlock" type="button"></button>
        <!-- "not per account" is doing real work here. Without it, a one-time
             payment sitting next to a list of accounts reads as a price per
             account, which is the opposite of what's being offered. -->
        <p class="note">Pay once, not per account. Unlocks unlimited Google accounts.</p>
      </div>
      <div class="stale">
        <p class="body">File Notes updated in the background. This tab is still running the old version, so reload the page to reconnect.</p>
        <!-- Above the button, not below it. A warning about losing your work is
             only useful if it is read before the thing that destroys it. -->
        <p class="warn"></p>
        <button class="reload" type="button">Reload page</button>
      </div>
      <div class="row">
        <span class="hint">Ctrl+Enter saves · Esc cancels</span>
        <button class="cancel" type="button">Cancel</button>
        <button class="save" type="button">Save</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(host);
}

// Keep the box on screen regardless of where the click landed.
function position(box, x, y) {
  const margin = 8;
  box.style.left = '0px';
  box.style.top = '0px';
  const rect = box.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - margin);
  const top = Math.min(y, window.innerHeight - rect.height - margin);
  box.style.left = `${Math.max(margin, left)}px`;
  box.style.top = `${Math.max(margin, top)}px`;
}

/**
 * Open the note box.
 * @param {{x:number, y:number, title:string, onSave:(text:string)=>Promise<void>}} opts
 * @returns {{setTitle:Function, setValue:Function, setStatus:Function, close:Function}}
 */
DriveNotes.openOverlay = function ({ x, y, title, onSave }) {
  if (!host) build();
  if (activeHandle) activeHandle.close();

  const box = shadow.querySelector('.box');
  const titleEl = shadow.querySelector('.title');
  const textarea = shadow.querySelector('textarea');
  const statusEl = shadow.querySelector('.status');
  const saveBtn = shadow.querySelector('.save');
  const cancelBtn = shadow.querySelector('.cancel');
  const upgradeBody = shadow.querySelector('.upgrade .body');
  const unlockBtn = shadow.querySelector('.unlock');
  const productEl = shadow.querySelector('.product');
  const reloadBtn = shadow.querySelector('.reload');
  const staleWarn = shadow.querySelector('.stale .warn');

  titleEl.textContent = title;
  textarea.value = '';
  textarea.disabled = true;
  statusEl.textContent = 'Loading…';
  statusEl.className = 'status';
  saveBtn.disabled = true;
  // The node is reused across opens, so last time's locked state has to be
  // cleared or an unrelated file inherits the paywall.
  box.classList.remove('locked', 'stale-mode', 'stale-empty');
  host.style.display = '';
  position(box, x, y);

  const handle = {
    // Hoisted; declared below. Exposed so the window-level key listener can
    // reach the current box's save without holding a second reference to it.
    commit: (...args) => commit(...args),
    setTitle: (t) => {
      titleEl.textContent = t;
    },
    setValue: (v) => {
      textarea.value = v || '';
      textarea.disabled = false;
      saveBtn.disabled = false;
      statusEl.textContent = '';
      // Focus late so the caret lands in the box and OS dictation (Win+H)
      // targets it immediately.
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    },
    setStatus: (msg, kind = '') => {
      statusEl.textContent = msg;
      statusEl.className = `status ${kind}`;
    },
    // Swap the editor for the offer. Every string here originated in remote
    // config, so all of it goes in as textContent — this box lives inside
    // drive.google.com and must never hand that page a parser.
    showUpgrade: ({ headline, body, priceLabel }, onUnlock) => {
      // From the manifest rather than remote config: the name of the thing
      // being sold is the one string here that must never be wrong, so it comes
      // from the package itself and not from an editable file.
      productEl.textContent = chrome.runtime.getManifest().name;
      titleEl.textContent = headline || 'Unlock multiple accounts';
      upgradeBody.textContent = body || '';
      unlockBtn.textContent = priceLabel ? `Unlock for ${priceLabel}` : 'Unlock';
      box.classList.add('locked');
      unlockBtn.onclick = async () => {
        unlockBtn.disabled = true;
        try {
          await onUnlock();
          handle.close();
        } catch (err) {
          unlockBtn.disabled = false;
          box.classList.remove('locked');
          handle.setStatus(err.message || String(err), 'error');
        }
      };
      // Reposition: the offer is a different height to the editor, and the box
      // was placed for the editor's.
      position(box, x, y);
    },
    // The content script has been orphaned by an update. Nothing it sends can
    // arrive, so stop offering Save and offer the reload instead.
    showStale: () => {
      titleEl.textContent = 'Reconnect needed';
      productEl.textContent = '';
      box.classList.add('stale-mode');
      // Anything already typed is kept on screen and called out, because the
      // reload will discard it and losing someone's note to a housekeeping
      // message would be worse than the bug this is fixing.
      const typed = textarea.value.trim();
      if (typed) {
        staleWarn.textContent = 'Copy your note first: reloading will clear it.';
      } else {
        box.classList.add('stale-empty');
        staleWarn.textContent = '';
      }
      reloadBtn.onclick = () => location.reload();
      position(box, x, y);
    },
    close: () => {
      if (activeHandle !== handle) return;
      host.style.display = 'none';
      document.removeEventListener('mousedown', onOutside, true);
      activeHandle = null;
    },
  };

  async function commit() {
    saveBtn.disabled = true;
    handle.setStatus('Saving…');
    try {
      await onSave(textarea.value);
      handle.setStatus('Saved', 'ok');
      setTimeout(handle.close, 700);
    } catch (err) {
      // The save couldn't even leave the page. showStale keeps the typed text
      // on screen and warns before the reload discards it.
      if (err.code === 'CONTEXT_INVALIDATED') {
        handle.showStale();
        return;
      }
      handle.setStatus(err.message || String(err), 'error');
      saveBtn.disabled = false;
    }
  }

  function onOutside(e) {
    if (!e.composedPath().includes(host)) handle.close();
  }

  saveBtn.onclick = commit;
  cancelBtn.onclick = handle.close;
  // Keyboard handling lives in onKeyCapture at the top of this file, on window
  // in the capture phase. Nothing can be bound to the box itself: the capture
  // listener stops propagation before the event ever gets down here.

  document.addEventListener('mousedown', onOutside, true);
  activeHandle = handle;
  return handle;
};
