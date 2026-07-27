// Paid-feature gating. Three questions, deliberately kept apart:
//
//   1. What are the rules right now?   -> remote config, changeable without a release
//   2. Has this install paid?          -> license state
//   3. May this account authorize?     -> the gate, which combines 1 and 2
//
// Every one of them FAILS OPEN. A gate that locks someone out of their own
// notes because a CDN was slow is a far worse outcome than a gate that leaks a
// couple of dollars. Every catch block here unlocks rather than blocks, and
// that is load-bearing, not defensive habit.
//
// Worth being honest about the ceiling: extension source is readable and
// chrome.storage is editable from any devtools window, so anyone determined to
// skip a $2 unlock can. This raises the effort above "notice the limit", which
// is the whole job at this price. Do not spend a week hardening it.

import ExtPay from '../vendor/ExtPay.module.js';

// ExtensionPay's "Permanent ID", shown under the name field on their dashboard.
// It is seeded from the name when the extension is first registered and then
// fixed: renaming afterwards does NOT change it, so the display name is safe to
// edit. Registering a SECOND extension entry does mint a new ID, and pointing
// this constant at the wrong one would make every existing customer come back
// as unpaid.
const EXTPAY_ID = 'file-notes-for-google-drive';

const extpay = ExtPay(EXTPAY_ID);

// ---------------------------------------------------------------- remote config

// The one URL that makes the rules editable after release. Point it at a static
// host and edit the file there; every install picks the change up within
// CONFIG_TTL_MS with no Chrome Web Store review in the loop.
//
// Changing the HOST here also means changing host_permissions in manifest.json,
// or the fetch is blocked and every install silently falls back to DEFAULTS.
// Note the ref: `config`, not `main`. The file lives alone on its own branch so
// that ordinary pushes to main cannot deploy configuration. raw.githubusercontent
// serves whatever the named branch holds, live and with no review, so anything
// sharing a branch with this file would be one careless commit from changing the
// paywall for every install.
const CONFIG_URL =
  'https://raw.githubusercontent.com/npd1987/file-notes-for-google-drive/config/gating.json';

const CONFIG_KEY = 'gatingConfig';
const CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
const CONFIG_TIMEOUT_MS = 4000;

// What ships in the package, and what every failure path falls back to.
//
// gateEnabled MUST default to false. This object is what an install runs on
// when it cannot reach the config host — a typo in CONFIG_URL, a deleted repo,
// a corporate proxy, GitHub having a bad day — and charging people because a
// fetch failed is the single worst failure this feature could have. Turning the
// paywall on is an act of publishing, never a default.
const DEFAULTS = {
  gateEnabled: false,
  freeAccountLimit: 1,
  priceLabel: '$2',
  checkoutUrl: '',
  upgradeHeadline: 'Unlock multiple Google accounts',
  upgradeBody:
    'The free version covers one Google account. A one-time unlock adds as many as you like, on every device you sign into Chrome with.',
};

// Remote JSON is untrusted input: it crosses the network, and one of its fields
// becomes a URL we open in a tab. Copy across only known keys, only at the
// expected type, and only within bounds. A compromised or fat-fingered config
// can then change the rules but cannot inject a javascript: URL or a
// kilobyte-long "price" into the note box.
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = { ...DEFAULTS };

  if (typeof raw.gateEnabled === 'boolean') out.gateEnabled = raw.gateEnabled;

  if (Number.isFinite(raw.freeAccountLimit)) {
    // Floor of 1. A limit of 0 would lock out the first account too, which is
    // never the intent and would read as the extension being broken.
    out.freeAccountLimit = Math.min(99, Math.max(1, Math.floor(raw.freeAccountLimit)));
  }

  for (const key of ['priceLabel', 'upgradeHeadline', 'upgradeBody']) {
    if (typeof raw[key] === 'string' && raw[key].trim() && raw[key].length <= 300) {
      out[key] = raw[key].trim();
    }
  }

  if (typeof raw.checkoutUrl === 'string' && raw.checkoutUrl) {
    try {
      const url = new URL(raw.checkoutUrl);
      if (url.protocol === 'https:') out.checkoutUrl = url.toString();
    } catch {
      // Leave it empty, which disables the gate rather than half-enabling it.
    }
  }

  return out;
}

async function fetchConfig() {
  // AbortController rather than a bare fetch: this runs on the path to opening
  // the note box on a first-ever second account, and a hung request there would
  // look like the extension freezing.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CONFIG_TIMEOUT_MS);
  try {
    const response = await fetch(CONFIG_URL, { signal: abort.signal, cache: 'no-cache' });
    if (!response.ok) return null;
    return sanitize(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheConfig(config) {
  await chrome.storage.local.set({
    [CONFIG_KEY]: { config, fetchedAt: Date.now() },
  });
}

/**
 * The rules in force right now.
 *
 * A cached copy answers immediately and a stale one refreshes in the
 * background, so the gate decision never waits on the network once the first
 * fetch has landed. Only a completely cold install blocks, and only briefly.
 */
export async function getConfig() {
  let cached = null;
  try {
    ({ [CONFIG_KEY]: cached } = await chrome.storage.local.get(CONFIG_KEY));
  } catch {
    return { ...DEFAULTS };
  }

  if (cached?.config) {
    const stale = Date.now() - (cached.fetchedAt || 0) > CONFIG_TTL_MS;
    // Fire and forget. The answer we already hold is good enough for this
    // decision; the fresh one is for the next.
    if (stale) refreshConfig();
    return { ...DEFAULTS, ...cached.config };
  }

  const fresh = await fetchConfig();
  if (fresh) {
    await cacheConfig(fresh);
    return fresh;
  }
  return { ...DEFAULTS };
}

/** Force a fetch now. Called on install, on browser start, and from Options. */
export async function refreshConfig() {
  const fresh = await fetchConfig();
  if (fresh) await cacheConfig(fresh);
  return fresh || (await getConfig());
}

// -------------------------------------------------------------------- license

// chrome.storage.sync, not local: someone who paid on their desktop should not
// be asked again on their laptop. It syncs with the Chrome profile, which is
// the closest thing to an account identity this extension has.
const LICENSE_KEY = 'license';

export async function getLicense() {
  try {
    const { [LICENSE_KEY]: license } = await chrome.storage.sync.get(LICENSE_KEY);
    return {
      paid: Boolean(license?.paid),
      source: license?.source || null,
      since: license?.since || null,
    };
  } catch {
    // Storage unreadable is not the user's fault. Unlock.
    return { paid: true, source: 'fallback', since: null };
  }
}

export async function setPaid(paid, source = 'manual') {
  await chrome.storage.sync.set({
    [LICENSE_KEY]: { paid: Boolean(paid), source, since: Date.now() },
  });
  return getLicense();
}

/**
 * Register the payment listener. Called once from the service worker's top
 * level, which is what lets a payment completed in another tab unlock this
 * browser without anyone pressing anything.
 */
export function startPaymentListener() {
  try {
    extpay.startBackground();
    extpay.onPaid.addListener(() => setPaid(true, 'extpay'));
  } catch {
    // A payment listener that won't start is not a reason to break the
    // extension. Options' Restore button remains the manual path.
  }
}

/**
 * Ask ExtensionPay whether this browser has paid, and cache the answer.
 * Options calls it behind "Already paid? Restore", the standard escape hatch
 * for a payment that completed somewhere this browser wasn't watching.
 *
 * This only ever PROMOTES to paid. It never revokes, for two reasons: a network
 * failure and a genuine "not paid" are hard to tell apart from here, and being
 * wrongly locked out is a far worse experience than a refunded $2 that keeps
 * working. Revocation, if it is ever needed, should be a deliberate act.
 */
export async function refreshLicense() {
  let cached;
  try {
    cached = await getLicense();
  } catch {
    return { paid: true, source: 'fallback', since: null };
  }
  if (cached.paid) return cached;

  try {
    const user = await extpay.getUser();
    if (user?.paid) return setPaid(true, 'extpay');
  } catch {
    // Offline, or ExtensionPay is down. Say nothing and keep what we had.
  }
  return cached;
}

// ------------------------------------------------------------------ the gate

// Slot -> address, written by api-backend.js. Read directly rather than
// imported to keep this module off the api-backend import cycle; api-backend
// owns the key and is the only writer.
const ACCOUNTS_KEY = 'accounts';

// How many accounts were already connected when the gating build landed.
// Existing users keep everything they had: the allowance is the config limit OR
// this number, whichever is larger. Expressed as a count rather than a
// grandfathered boolean so that raising the free limit later still helps them,
// and so nobody's working setup breaks on an auto-update they didn't ask for.
const BASELINE_KEY = 'preGateAccountCount';

async function readAccounts() {
  const { [ACCOUNTS_KEY]: accounts } = await chrome.storage.local.get(ACCOUNTS_KEY);
  return accounts || {};
}

// Distinct addresses, not slot keys. Chrome renumbers /u/N/ whenever an account
// is added or removed, so two slots can briefly name the same person and
// counting keys would charge them for it.
const countAccounts = (accounts) => new Set(Object.values(accounts).filter(Boolean)).size;

async function readBaseline() {
  const { [BASELINE_KEY]: baseline } = await chrome.storage.local.get(BASELINE_KEY);
  return Number.isFinite(baseline) ? baseline : 0;
}

/**
 * Record how many accounts predate gating. Called from onInstalled.
 * Written once and never revised: a later update must not re-baseline someone
 * to a number that includes accounts the gate itself let through.
 */
export async function recordBaseline(reason) {
  const { [BASELINE_KEY]: existing } = await chrome.storage.local.get(BASELINE_KEY);
  if (Number.isFinite(existing)) return existing;

  const count = reason === 'update' ? countAccounts(await readAccounts()) : 0;
  await chrome.storage.local.set({ [BASELINE_KEY]: count });
  return count;
}

/**
 * Everything the UI needs to describe the current plan, in one round trip.
 * Shared by the popup, the options page, and the gate itself.
 */
export async function getPlan() {
  const [config, license, accounts, baseline] = await Promise.all([
    getConfig(),
    getLicense(),
    readAccounts(),
    readBaseline(),
  ]);

  const allowance = Math.max(config.freeAccountLimit, baseline);
  // ExtensionPay ships in the package, so there is always somewhere to send
  // someone who hits the wall. gateEnabled is therefore the only switch, which
  // keeps the kill switch the single lever it should be.
  const enforced = config.gateEnabled && !license.paid;

  return {
    paid: license.paid,
    licenseSource: license.source,
    connected: countAccounts(accounts),
    allowance,
    enforced,
    grandfathered: baseline > config.freeAccountLimit,
    priceLabel: config.priceLabel,
    checkoutUrl: config.checkoutUrl,
    upgradeHeadline: config.upgradeHeadline,
    upgradeBody: config.upgradeBody,
    gateEnabled: config.gateEnabled,
    freeAccountLimit: config.freeAccountLimit,
  };
}

/**
 * The gate. Throws a tagged error if authorizing this slot would exceed the
 * allowance; returns silently otherwise.
 *
 * Called before the OAuth window opens, so someone who is going to be stopped
 * is stopped BEFORE Google's consent screen rather than after it. Being sent
 * through a sign-in and then told no would be the worst version of this.
 *
 * @param {number|string} authUser  the /u/N/ slot the click came from
 */
export async function assertAccountAllowed(authUser) {
  let plan;
  let accounts;
  try {
    [plan, accounts] = await Promise.all([getPlan(), readAccounts()]);
  } catch {
    return; // fail open
  }

  if (!plan.enforced) return;

  // Already known slots re-authorize freely. Tokens expire hourly, and charging
  // someone at every refresh would be absurd.
  if (Object.prototype.hasOwnProperty.call(accounts, String(authUser))) return;

  if (plan.connected < plan.allowance) return;

  const error = new Error(
    `${plan.upgradeHeadline} (${plan.priceLabel})`
  );
  // Carried across the message boundary by service-worker.js so the note box
  // can render a real offer instead of red error text.
  error.code = 'ACCOUNT_LIMIT';
  error.upgrade = {
    headline: plan.upgradeHeadline,
    body: plan.upgradeBody,
    priceLabel: plan.priceLabel,
    allowance: plan.allowance,
  };
  throw error;
}

/**
 * Open the checkout page. ExtensionPay hosts it, and its page is what talks to
 * Stripe, so no card details ever come near this extension.
 *
 * A checkoutUrl in remote config overrides it. That is the migration path for
 * self-hosting later: stand up your own page, publish its URL, and installs
 * move over on their next config refresh with no release involved.
 *
 * The URL is never accepted from the caller. The content script runs in
 * drive.google.com's world, and letting it name a URL for the extension to open
 * would hand any script on that page a tab-opening primitive.
 */
export async function openCheckout() {
  const { checkoutUrl } = await getConfig();
  if (checkoutUrl) {
    await chrome.tabs.create({ url: checkoutUrl });
    return true;
  }
  await extpay.openPaymentPage();
  return true;
}
