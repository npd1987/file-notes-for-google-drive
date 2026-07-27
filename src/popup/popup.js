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

const el = {
  version: document.getElementById('version'),
  statusRow: document.getElementById('statusRow'),
  statusText: document.getElementById('statusText'),
  account: document.getElementById('account'),
  hint: document.getElementById('hint'),
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

  const [response, planResponse] = await Promise.all([ask('getStatus'), ask('getPlan')]);
  connected = Boolean(response?.ok && response.connected);

  renderHint(modifier || 'alt', connected);

  if (connected) {
    setStatus('ok', 'Connected');
    el.account.textContent =
      describeAccounts(response?.emails) + describePlan(planResponse?.plan);
    el.primary.textContent = 'Open Drive';
  } else {
    setStatus('pending', 'Not connected yet');
    el.account.textContent = '';
    el.primary.textContent = 'Connect Google';
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
