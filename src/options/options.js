const fields = {
  modifier: document.getElementById('modifier'),
  mode: document.getElementById('mode'),
  debug: document.getElementById('debug'),
  clientId: document.getElementById('clientId'),
};
const statusEl = document.getElementById('status');
const accountsEl = document.getElementById('accounts');
const plan = {
  box: document.getElementById('planBox'),
  summary: document.getElementById('planSummary'),
  detail: document.getElementById('planDetail'),
  unlock: document.getElementById('unlock'),
  restore: document.getElementById('restore'),
  status: document.getElementById('planStatus'),
};

// Guarded: outside a real extension context (e.g. previewing this file
// directly) `chrome` is undefined, and an uncaught throw here would leave the
// rest of the page unwired.
try {
  document.getElementById('redirect').textContent = chrome.identity.getRedirectURL();
} catch {
  document.getElementById('redirect').textContent =
    'unavailable, open this page from chrome://extensions';
}

// The auto-clear timer is cancelled on every new message. Without that, the
// "Saved" timer started by save() would land a second later and wipe the
// "Connected" result that Connect had just put in its place.
let statusTimer;

function setStatus(message, kind = '') {
  clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.className = kind;
}

// The client ID as last saved. Switching OAuth clients invalidates any token
// we're holding, so we compare against this to know when to drop it.
let savedClientId = '';

async function restore() {
  const stored = await chrome.storage.sync.get(['modifier', 'mode', 'debug', 'clientId']);
  fields.modifier.value = stored.modifier || 'alt';
  // 'replace'/'append' are legacy values from before the modes were renamed.
  fields.mode.value =
    { replace: 'continue', append: 'newline' }[stored.mode] ||
    stored.mode ||
    'continue';
  fields.debug.checked = Boolean(stored.debug);
  savedClientId = stored.clientId || '';
  fields.clientId.value = savedClientId;

  // Open the advanced section on load if there's a custom client in it, so it
  // isn't invisibly in effect.
  if (savedClientId) document.querySelector('details').open = true;

  // Accounts are discovered now, not typed. Drop the value the old field left
  // behind so it can't sit in storage looking meaningful.
  chrome.storage.sync.remove('accountEmail');
}

// Built with DOM calls rather than innerHTML: these strings are addresses that
// came back from Google, and they go nowhere near a HTML parser.
async function renderAccounts() {
  const response = await chrome.runtime.sendMessage({ type: 'getAccounts' });
  const accounts = Object.entries(response?.accounts || {}).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  accountsEl.textContent = '';

  if (!accounts.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No accounts authorized yet.';
    accountsEl.append(li);
    return;
  }

  for (const [slot, email] of accounts) {
    const li = document.createElement('li');

    const address = document.createElement('span');
    address.className = 'email';
    address.textContent = email;

    const index = document.createElement('span');
    index.className = 'slot';
    // Drive writes this index into its own URLs, so it's the one piece of
    // jargon here that a user can actually go and see for themselves.
    index.textContent = `/u/${slot}/`;

    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.textContent = 'Disconnect';
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      await chrome.runtime.sendMessage({ type: 'disconnect', authUser: Number(slot) });
      await renderAccounts();
      setStatus('Disconnected', 'ok');
      statusTimer = setTimeout(() => setStatus(''), 1500);
    });

    li.append(address, index, remove);
    accountsEl.append(li);
  }
}

// The whole section hides when nothing is being charged for. An install where
// gating is switched off, or that never reached the config host, should look
// exactly like the version before any of this existed rather than advertising a
// plan that isn't in force.
async function renderPlan(fromResponse) {
  const response =
    fromResponse || (await chrome.runtime.sendMessage({ type: 'getPlan' }).catch(() => null));
  const state = response?.plan;

  if (!state || (!state.enforced && !state.paid)) {
    plan.box.hidden = true;
    return;
  }

  plan.box.hidden = false;

  if (state.paid) {
    plan.summary.textContent = 'Unlocked. Unlimited Google accounts.';
    plan.detail.textContent =
      'Thanks. This travels with your Chrome profile, so signing into Chrome on another computer carries it across.';
    plan.unlock.hidden = true;
    plan.restore.hidden = true;
    return;
  }

  const { connected, allowance } = state;
  plan.summary.textContent = `Free · ${connected} of ${allowance} ${
    allowance === 1 ? 'account' : 'accounts'
  } connected.`;
  plan.detail.textContent = state.grandfathered
    ? `You were already using ${allowance} accounts before this became a paid feature, so they stay. ${state.upgradeBody}`
    : state.upgradeBody;

  plan.unlock.hidden = false;
  plan.unlock.textContent = `Unlock for ${state.priceLabel}`;
  plan.restore.hidden = false;
}

// The plan box reports next to its own buttons rather than in #status, which
// sits at the far bottom of the page beside Save. Restore's whole purpose is to
// answer someone who paid on another machine and is worried the purchase is
// lost; writing that answer offscreen, then wiping it after two seconds, reads
// as a dead button and sends them to support instead.
let planStatusTimer;

function setPlanStatus(message, kind = '', clearAfter = 0) {
  clearTimeout(planStatusTimer);
  plan.status.textContent = message;
  plan.status.className = kind;
  if (clearAfter) planStatusTimer = setTimeout(() => setPlanStatus(''), clearAfter);
}

plan.unlock.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'openCheckout' }).catch(() => null);
  if (!response?.ok) setPlanStatus(response?.error || "Couldn't open checkout", 'error');
});

plan.restore.addEventListener('click', async () => {
  plan.restore.disabled = true;
  setPlanStatus('Checking…');
  const response = await chrome.runtime
    .sendMessage({ type: 'refreshLicense' })
    .catch(() => null);
  plan.restore.disabled = false;

  await renderPlan(response);

  // The success case clears quickly because the box itself visibly changes to
  // unlocked. The "nothing found" case is the one someone needs time to read,
  // so it lingers.
  if (response?.plan?.paid) {
    setPlanStatus('Unlocked', 'ok', 2500);
  } else {
    setPlanStatus('No payment found for this browser', '', 8000);
  }
});

async function save() {
  const clientId = fields.clientId.value.trim();
  const clientChanged = clientId !== savedClientId;

  await chrome.storage.sync.set({
    modifier: fields.modifier.value,
    mode: fields.mode.value,
    debug: fields.debug.checked,
    clientId,
  });
  savedClientId = clientId;

  if (clientChanged) {
    await chrome.runtime.sendMessage({ type: 'signOut' });
    await renderAccounts();
  }

  setStatus(clientChanged ? 'Saved, signed out' : 'Saved', 'ok');
  statusTimer = setTimeout(() => setStatus(''), 1500);
}

document.getElementById('save').addEventListener('click', save);

// Accounts authorize themselves as they're used, so the list can go stale
// while this page sits open. Watch the store rather than making the user
// reload to see an account they just connected.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.accounts) {
    renderAccounts();
    // Connecting or disconnecting moves the "N of M" count too.
    renderPlan();
  }
  if (area === 'sync' && changes.license) renderPlan();
});

restore();
renderAccounts();
renderPlan();
