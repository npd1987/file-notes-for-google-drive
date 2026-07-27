// Local control panel for the gating rules. Deliberately dependency-free and
// buildless: it has to open by double-clicking the HTML file, on a machine with
// nothing installed, years from now.
//
// It reads the LIVE config over https (raw.githubusercontent.com sends
// access-control-allow-origin: *, so this works from file://) but it cannot
// write. Publishing is a separate, explicit step, which is the right shape for
// something that changes what every installed copy does.

const DEFAULT_URL =
  'https://raw.githubusercontent.com/npd1987/file-notes-for-google-drive/config/gating.json';

// Mirrors DEFAULTS in src/background/licensing.js. If you change one, change
// the other; there is no shared module because the extension must not depend on
// anything in admin/.
const DEFAULTS = {
  gateEnabled: false,
  freeAccountLimit: 1,
  priceLabel: '$2',
  checkoutUrl: '',
  upgradeHeadline: 'Unlock multiple Google accounts',
  upgradeBody:
    'The free version covers one Google account. A one-time unlock adds as many as you like, on every device you sign into Chrome with.',
};

const el = (id) => document.getElementById(id);
const fields = {
  gateEnabled: el('gateEnabled'),
  freeAccountLimit: el('freeAccountLimit'),
  priceLabel: el('priceLabel'),
  checkoutUrl: el('checkoutUrl'),
  upgradeHeadline: el('upgradeHeadline'),
  upgradeBody: el('upgradeBody'),
};

let msgTimer;
function flash(node, text, kind = '') {
  clearTimeout(msgTimer);
  node.textContent = text;
  node.className = kind;
  msgTimer = setTimeout(() => {
    node.textContent = '';
    node.className = '';
  }, 3000);
}

function read() {
  return {
    gateEnabled: fields.gateEnabled.checked,
    freeAccountLimit: Math.min(99, Math.max(1, Number(fields.freeAccountLimit.value) || 1)),
    priceLabel: fields.priceLabel.value.trim(),
    checkoutUrl: fields.checkoutUrl.value.trim(),
    upgradeHeadline: fields.upgradeHeadline.value.trim(),
    upgradeBody: fields.upgradeBody.value.trim(),
  };
}

function write(config) {
  const merged = { ...DEFAULTS, ...config };
  fields.gateEnabled.checked = Boolean(merged.gateEnabled);
  fields.freeAccountLimit.value = merged.freeAccountLimit;
  fields.priceLabel.value = merged.priceLabel;
  fields.checkoutUrl.value = merged.checkoutUrl;
  fields.upgradeHeadline.value = merged.upgradeHeadline;
  fields.upgradeBody.value = merged.upgradeBody;
  render();
}

// The preview answers the question the form can't: does this actually read as
// an offer, or as an error? Same effective-state logic as licensing.js, so a
// combination that silently disables the gate shows up here as greyed out
// rather than as a surprise in production.
function render() {
  const config = read();
  // ExtensionPay ships in the package, so a checkout always exists and
  // gateEnabled is the only switch. checkoutUrl only redirects it elsewhere.
  const live = config.gateEnabled;

  el('pvTitle').textContent = config.upgradeHeadline || DEFAULTS.upgradeHeadline;
  el('pvBody').textContent = config.upgradeBody || DEFAULTS.upgradeBody;
  el('pvButton').textContent = `Unlock for ${config.priceLabel || DEFAULTS.priceLabel}`;
  el('preview').classList.toggle('off', !live);

  el('pvNote').textContent = live
    ? `Shown when someone connects account number ${config.freeAccountLimit + 1}. Checkout: ${
        config.checkoutUrl || 'ExtensionPay'
      }.`
    : 'Never shown: charging is switched off. Everyone gets every feature.';

  el('output').textContent = JSON.stringify(config, null, 2);
}

for (const field of Object.values(fields)) {
  field.addEventListener('input', render);
}

el('load').addEventListener('click', async () => {
  const url = el('sourceUrl').value.trim();
  if (!url) return flash(el('loadMsg'), 'Set a config URL first', 'error');

  localStorage.setItem('configUrl', url);
  flash(el('loadMsg'), 'Loading…');
  try {
    // cache: no-store, because GitHub's raw CDN holds a copy for a few minutes
    // and a stale read here would have you editing yesterday's rules.
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    write(await response.json());
    flash(el('loadMsg'), 'Loaded live config', 'ok');
  } catch (err) {
    flash(el('loadMsg'), `Couldn't load: ${err.message}`, 'error');
  }
});

el('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('output').textContent);
    flash(el('msg'), 'Copied', 'ok');
  } catch {
    flash(el('msg'), 'Clipboard blocked, select the JSON and copy it', 'error');
  }
});

el('download').addEventListener('click', () => {
  const blob = new Blob([`${el('output').textContent}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'gating.json';
  link.click();
  URL.revokeObjectURL(link.href);
  flash(el('msg'), 'Downloaded', 'ok');
});

el('sourceUrl').value = localStorage.getItem('configUrl') || DEFAULT_URL;
write(DEFAULTS);
