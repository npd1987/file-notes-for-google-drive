// Shared namespace for the content script bundle.
// Content scripts can't use ES modules from the manifest, but every file listed
// in `js` shares one isolated-world global scope, so a namespace object works.
var DriveNotes = {
  settings: {
    modifier: 'alt', // 'alt' | 'ctrl' | 'shift'
    mode: 'replace', // 'replace' | 'append'
    debug: false,
  },
};

DriveNotes.loadSettings = async function () {
  const stored = await chrome.storage.sync.get(['modifier', 'mode', 'debug']);
  Object.assign(DriveNotes.settings, stored);
  return DriveNotes.settings;
};

// Keep settings live so changing them in options doesn't need a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in DriveNotes.settings) DriveNotes.settings[key] = newValue;
  }
});

DriveNotes.modifierHeld = function (event) {
  switch (DriveNotes.settings.modifier) {
    case 'ctrl':
      return event.ctrlKey;
    case 'shift':
      return event.shiftKey;
    case 'alt':
    default:
      return event.altKey;
  }
};

DriveNotes.log = function (...args) {
  if (DriveNotes.settings.debug) console.log('[Drive Notes]', ...args);
};

/**
 * Which signed-in Google account this tab belongs to.
 *
 * Drive carries the account slot in its own URLs (/drive/u/1/my-drive), and
 * with several accounts open at once that index is the ONLY thing telling one
 * tab from another. Every request has to carry it, or a click in one account's
 * tab gets answered with another account's token and Drive returns a 404 that
 * looks like a missing file.
 *
 * Not every Drive URL has the path segment — an opened file is often
 * /file/d/<id>/view?authuser=1 — so the query string is checked as well.
 *
 * @returns {number} the account index, 0 when nothing says otherwise
 */
DriveNotes.currentAuthUser = function () {
  const fromPath = location.pathname.match(/\/u\/(\d+)(?:\/|$)/);
  if (fromPath) return Number(fromPath[1]);
  const fromQuery = new URLSearchParams(location.search).get('authuser');
  return /^\d+$/.test(fromQuery || '') ? Number(fromQuery) : 0;
};

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function emailFromAttributes(el) {
  if (!el) return null;
  for (const attr of ['aria-label', 'title', 'data-email']) {
    const match = (el.getAttribute(attr) || '').match(EMAIL_PATTERN);
    if (match) return match[0];
  }
  return null;
}

/**
 * The address this Drive tab is signed in as, read off the page.
 *
 * Worth the fragility because it's the only way to know the account BEFORE
 * authorizing rather than after. With it, `login_hint` names the right account
 * on the very first attempt and Google never shows the chooser; without it the
 * user has to pick from a list and has no way to tell which one this tab is.
 *
 * Every failure here is safe: returning null falls back to the previous
 * behaviour, which is a chooser.
 *
 * @returns {string|null}
 */
DriveNotes.currentAccountEmail = function () {
  // 1. The One Google bar's account button spells it out:
  //    "Google Account: Ada Lovelace (ada@example.com)".
  const labelled = document.querySelector('[aria-label*="Google Account"]');
  const fromLabel = emailFromAttributes(labelled);
  if (fromLabel) return fromLabel;

  // 2. Some surfaces carry it as a plain attribute instead.
  const fromAttr = emailFromAttributes(document.querySelector('[data-email]'));
  if (fromAttr) return fromAttr;

  // 3. Anything else that calls itself an account and contains an address.
  //    Deliberately NOT a document-wide search for an email: Drive is full of
  //    OTHER people's addresses in sharing dialogs and owner columns, and
  //    hinting one of those would be worse than hinting nothing at all.
  for (const el of document.querySelectorAll('[aria-label*="ccount"], [title*="ccount"]')) {
    const found = emailFromAttributes(el);
    if (found) return found;
  }

  return null;
};

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Build the textarea's starting contents for an item that may already have a
// description. The caret always lands at the very END of whatever this
// returns, so what actually varies between modes is how much scaffolding is
// pre-typed for you — nothing else.
DriveNotes.composeInitial = function (existing) {
  const text = existing || '';
  switch (DriveNotes.settings.mode) {
    case 'append': // legacy stored value
    case 'newline':
      return text ? `${text}\n` : '';
    case 'dated':
      return text ? `${text}\n\n${todayStamp()} ` : `${todayStamp()} `;
    case 'replace': // legacy stored value
    case 'continue':
    default:
      return text;
  }
};
