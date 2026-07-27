// Any entry left blank is dropped from the footer rather than shipped as a
// dead link. The store URL is the published (not unpacked) item ID.
const STORE_URL =
  'https://chromewebstore.google.com/detail/file-notes-for-google-drive/fcekoocdkkmahmilnbfbdcnpfhjhgjjl';

const LINKS = [
  { label: 'Contact', url: 'https://forms.gle/yJrB6vpDj5H1dPFv9' },
  { label: 'Rate it', url: `${STORE_URL}/reviews` },
  { label: 'Tip jar', url: 'https://buymeacoffee.com/noahdavidson', last: true },
];

const MODIFIER_LABELS = { alt: 'Alt', ctrl: 'Ctrl', shift: 'Shift' };
const DRIVE_URL = 'https://drive.google.com';

// Drive's own URLs carry the account slot, so opening a specific account is a
// URL and nothing more. The slot is the same number the options page lists.
const driveUrlForSlot = (slot) => `${DRIVE_URL}/drive/u/${slot}/`;

// Google shows a photo here; reading those needs a scope this extension does
// not ask for, so a slot-stable colour and the first letter stand in. Indexed
// by slot rather than hashed from the address, so the colour never depends on
// what the address happens to be.
const AVATAR_COLORS = [
  '#1a73e8',
  '#9334e6',
  '#12805c',
  '#c5221f',
  '#b06000',
  '#0b7285',
  '#6741d9',
  '#495057',
];

const el = {
  version: document.getElementById('version'),
  statusRow: document.getElementById('statusRow'),
  statusText: document.getElementById('statusText'),
  account: document.getElementById('account'),
  hint: document.getElementById('hint'),
  pickerLabel: document.getElementById('pickerLabel'),
  accountList: document.getElementById('accountList'),
  primary: document.getElementById('primary'),
  settings: document.getElementById('settings'),
  links: document.getElementById('links'),
};

let connected = false;

function setStatus(kind, text) {
  el.statusRow.className = kind;
  el.statusText.textContent = text;
}

// Built from a template rather than innerHTML so the modifier label — which
// comes out of storage — can never be parsed as markup.
function renderHint(modifier, isConnected) {
  const key = MODIFIER_LABELS[modifier] || MODIFIER_LABELS.alt;
  el.hint.textContent = '';
  el.hint.append('Hold ');
  const kbd = document.createElement('kbd');
  kbd.textContent = key;
  el.hint.append(kbd);
  el.hint.append(
    isConnected
      ? ' and right-click any file or folder in Drive.'
      : ' and right-click any file in Drive. Google will ask you to sign in once.'
  );
}

// Built with DOM calls rather than innerHTML, matching the options page: these
// strings are addresses that came back from Google and they go nowhere near a
// HTML parser.
function buildAccountRow(slot, email) {
  const row = document.createElement('button');
  row.className = 'account';
  // The row truncates; the tooltip does not.
  row.title = email;

  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.style.background = AVATAR_COLORS[slot % AVATAR_COLORS.length];
  avatar.textContent = email.trim().charAt(0).toUpperCase() || '?';
  // Decoration. The address beside it is what a screen reader should read.
  avatar.setAttribute('aria-hidden', 'true');

  const who = document.createElement('span');
  who.className = 'who';

  const address = document.createElement('span');
  address.className = 'email';
  address.textContent = email;

  const index = document.createElement('span');
  index.className = 'slot';
  // Worth the 12px: if Chrome renumbers the slots and a row ever points at the
  // wrong Drive, this is the one thing a user can check against the address bar.
  index.textContent = `/u/${slot}/`;

  who.append(address, index);

  const go = document.createElement('span');
  go.className = 'go';
  go.textContent = '↗';
  go.setAttribute('aria-hidden', 'true');

  row.append(avatar, who, go);
  row.addEventListener('click', () => {
    chrome.tabs.create({ url: driveUrlForSlot(slot) });
    window.close();
  });
  return row;
}

// One account is not a choice, so the popup keeps the single button it has
// always had. The picker appears at two, and replaces that button rather than
// sitting beside it — two ways to open Drive is one too many.
function renderPicker(accounts) {
  const entries = Object.entries(accounts || {})
    .map(([slot, email]) => [Number(slot), email])
    .filter(
      ([slot, email]) =>
        Number.isInteger(slot) && slot >= 0 && typeof email === 'string' && email
    )
    .sort(([a], [b]) => a - b);

  el.accountList.textContent = '';

  if (entries.length < 2) {
    el.pickerLabel.hidden = true;
    el.accountList.hidden = true;
    el.primary.hidden = false;
    return;
  }

  for (const [slot, email] of entries) el.accountList.append(buildAccountRow(slot, email));

  el.pickerLabel.hidden = false;
  el.accountList.hidden = false;
  el.primary.hidden = true;
}

function renderLinks() {
  for (const { label, url, last } of LINKS) {
    if (!url) continue;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    if (last) a.className = 'last';
    el.links.append(a);
  }
}

// sendMessage rejects if the service worker can't be reached at all; callers
// treat that the same as a negative answer.
function ask(type) {
  return chrome.runtime.sendMessage({ type }).catch(() => null);
}

// One account: name it. Several: a count, because three addresses won't fit in
// a 300px popup and the options page lists them properly anyway.
function describeAccounts(emails) {
  if (!emails?.length) return '';
  return emails.length === 1 ? `· ${emails[0]}` : `· ${emails.length} accounts`;
}

// Appended to the account line rather than given a row of its own: in a 300px
// popup a second status line reads as a second problem.
function describePlan(state) {
  if (!state || (!state.enforced && !state.paid)) return '';
  if (state.paid) return ' · unlocked';
  return ` · ${state.connected}/${state.allowance}`;
}

async function refresh() {
  const { modifier } = await chrome.storage.sync.get(['modifier']);

  const [response, planResponse, accountsResponse] = await Promise.all([
    ask('getStatus'),
    ask('getPlan'),
    ask('getAccounts'),
  ]);
  connected = Boolean(response?.ok && response.connected);

  renderHint(modifier || 'alt', connected);

  if (connected) {
    setStatus('ok', 'Connected');
    el.account.textContent =
      describeAccounts(response?.emails) + describePlan(planResponse?.plan);
    el.primary.textContent = 'Open Drive';
    // Falls back to the single button on its own if the slot map is empty,
    // which is what a live token whose address we never resolved looks like.
    renderPicker(accountsResponse?.accounts);
  } else {
    setStatus('pending', 'Not connected yet');
    el.account.textContent = '';
    el.primary.textContent = 'Connect Google';
    renderPicker(null);
  }
}

el.primary.addEventListener('click', async () => {
  if (connected) {
    chrome.tabs.create({ url: DRIVE_URL });
    window.close();
    return;
  }

  // The consent window takes focus, which destroys this popup mid-flight. The
  // flow itself lives in the service worker and finishes regardless; reopening
  // the popup then shows "Connected". So this state is mostly a courtesy for
  // the moment before we're closed, and the response often never arrives.
  el.primary.disabled = true;
  setStatus('', 'Connecting…');
  const response = await ask('testAuth');
  el.primary.disabled = false;

  if (response?.ok) await refresh();
  else setStatus('error', response?.error || "Couldn't connect");
});

el.settings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

el.version.textContent = chrome.runtime.getManifest().version;
renderLinks();
refresh();
