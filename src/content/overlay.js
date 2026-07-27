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
`;

let host = null;
let shadow = null;
let activeHandle = null;

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

  titleEl.textContent = title;
  textarea.value = '';
  textarea.disabled = true;
  statusEl.textContent = 'Loading…';
  statusEl.className = 'status';
  saveBtn.disabled = true;
  // The node is reused across opens, so last time's locked state has to be
  // cleared or an unrelated file inherits the paywall.
  box.classList.remove('locked');
  host.style.display = '';
  position(box, x, y);

  const handle = {
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
      handle.setStatus(err.message || String(err), 'error');
      saveBtn.disabled = false;
    }
  }

  function onOutside(e) {
    if (!e.composedPath().includes(host)) handle.close();
  }

  saveBtn.onclick = commit;
  cancelBtn.onclick = handle.close;
  box.onkeydown = (e) => {
    // Drive binds single letters as global shortcuts (n, r, d, …). Every key
    // event from this box must be stopped or typing a note fires them.
    e.stopPropagation();
    if (e.key === 'Escape') {
      handle.close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
  };
  box.onkeyup = (e) => e.stopPropagation();
  box.onkeypress = (e) => e.stopPropagation();

  document.addEventListener('mousedown', onOutside, true);
  activeHandle = handle;
  return handle;
};
