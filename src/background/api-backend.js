// Drive REST backend. One documented call to read, one to write.
//
// Scope note: `drive.metadata` is a RESTRICTED scope. That's fine for personal
// use (one "unverified app" screen, once) but it is the gate that makes wide
// public distribution expensive. See README for the tradeoff.

import { assertAccountAllowed } from './licensing.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.metadata';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/drive/v3/files';
const ABOUT = 'https://www.googleapis.com/drive/v3/about';

// One cache entry per Google account slot, keyed by the /u/N/ index Drive puts
// in its own URLs. A single shared token would be wrong the moment a second
// account is signed in: whichever account authorized first would answer clicks
// made in every other account's tabs.
const TOKEN_PREFIX = 'token:';

const tokenKey = (authUser) => `${TOKEN_PREFIX}${authUser}`;

// MV3 service workers are torn down after ~30s idle, so a plain variable is
// NOT a usable cache — it would drop the token every half-minute and force a
// re-authorization. The real cache is chrome.storage.session: it survives
// worker restarts, lives only in memory, and is cleared when Chrome closes,
// which is exactly right for a bearer token. `memo` is just a hot path.
const memo = new Map();

async function readCachedToken(authUser) {
  const hot = memo.get(authUser);
  if (hot && Date.now() < hot.expiresAt) return hot.token;

  const key = tokenKey(authUser);
  const { [key]: stored } = await chrome.storage.session.get(key);
  if (stored?.token && Date.now() < stored.expiresAt) {
    memo.set(authUser, stored);
    return stored.token;
  }
  return null;
}

async function storeToken(authUser, entry) {
  memo.set(authUser, entry);
  await chrome.storage.session.set({ [tokenKey(authUser)]: entry });
}

async function clearToken(authUser) {
  memo.delete(authUser);
  await chrome.storage.session.remove(tokenKey(authUser));
}

async function clearAllTokens() {
  memo.clear();
  const everything = await chrome.storage.session.get(null);
  const keys = Object.keys(everything).filter((k) => k.startsWith(TOKEN_PREFIX));
  if (keys.length) await chrome.storage.session.remove(keys);
}

// Which address each slot turned out to belong to, e.g. { "0": "a@x.com" }.
//
// Unlike the tokens above this survives Chrome restarts, because it is what
// makes the next silent refresh silent: with the address known, `login_hint`
// names the account outright instead of leaning on `authuser`, which Google
// does not document for this endpoint. It holds no credential — only which
// account a slot maps to.
const ACCOUNTS_KEY = 'accounts';

async function readAccounts() {
  const { [ACCOUNTS_KEY]: accounts } = await chrome.storage.local.get(ACCOUNTS_KEY);
  return accounts || {};
}

async function writeAccount(authUser, email) {
  const accounts = await readAccounts();
  accounts[String(authUser)] = email;
  await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts });
}

async function forgetAccount(authUser) {
  const accounts = await readAccounts();
  delete accounts[String(authUser)];
  await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts });
}

// Ask Drive which account a token belongs to. Covered by the drive.metadata
// scope we already hold, so this costs no extra consent. Returns null rather
// than throwing: failing to identify an account is a reason to fall back to
// the old behaviour, not to fail the sign-in that just succeeded.
async function fetchAccountEmail(token) {
  try {
    const response = await fetch(`${ABOUT}?fields=user(emailAddress)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.user?.emailAddress || null;
  } catch {
    return null;
  }
}

// Set this before publishing to the Chrome Web Store so users don't have to
// create their own Cloud project. Safe to hardcode: OAuth client IDs are
// public by design and there is no client secret alongside it. The Options
// field still overrides it, which keeps per-user clients possible.
const DEFAULT_CLIENT_ID =
  '991537843624-2dkkdnhli3o4i8l03vghfihlkqsplhfa.apps.googleusercontent.com';

async function getClientId() {
  const { clientId } = await chrome.storage.sync.get('clientId');
  const id = clientId || DEFAULT_CLIENT_ID;
  if (!id) {
    throw new Error('No OAuth client ID set. Open the extension options.');
  }
  return id;
}

function parseFragment(redirectUrl) {
  const fragment = new URL(redirectUrl).hash.slice(1);
  const params = new URLSearchParams(fragment);
  const token = params.get('access_token');
  if (!token) throw new Error(params.get('error') || 'No access token returned');
  return {
    token,
    expiresAt: Date.now() + (Number(params.get('expires_in') || 3600) - 60) * 1000,
  };
}

async function authorize(interactive, ctx, forceChooser = false) {
  const { authUser, accountHint } = ctx;

  // Before the consent window, not after. Someone who is over the free
  // allowance should meet the offer directly, rather than being walked through
  // a Google sign-in and only then told it doesn't count. Throws when blocked;
  // known slots and unenforced installs pass straight through.
  await assertAccountAllowed(authUser);

  const clientId = await getClientId();
  const accounts = await readAccounts();
  // Prefer what this slot authorized as last time; otherwise trust the address
  // the Drive tab itself is displaying.
  const knownEmail = accounts[String(authUser)] || accountHint;

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', chrome.identity.getRedirectURL());
  url.searchParams.set('scope', SCOPE);
  if (!interactive) url.searchParams.set('prompt', 'none');
  // The recovery path: ask outright rather than resolving the account from
  // hints that have already proved wrong once.
  if (forceChooser) url.searchParams.set('prompt', 'select_account');

  // Google's `authuser` is the same session index Drive uses in /u/N/, so
  // passing it through lands us on the account whose tab the click came from.
  // It is undocumented for this endpoint, which is why it is only the opening
  // guess — everything below exists to not depend on it.
  url.searchParams.set('authuser', String(authUser));

  // Once a slot's address is known, this is what actually pins the account.
  // `prompt=none` cannot resolve which of several signed-in accounts is meant
  // and bails to the chooser; login_hint removes the ambiguity, so the hourly
  // refresh stays invisible.
  if (knownEmail && !forceChooser) url.searchParams.set('login_hint', knownEmail);

  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: url.toString(),
    interactive,
  });
  if (!redirectUrl) throw new Error('Authorization was cancelled');
  const entry = parseFragment(redirectUrl);

  // Check which account we were actually given rather than assuming the hints
  // were honoured.
  const email = await fetchAccountEmail(entry.token);
  if (email) {
    // The tab told us who it is signed in as, so a different answer here means
    // the wrong account was picked. Catching it now beats catching it at the
    // next 404, and lets the message name both accounts.
    const matchesTab = accountHint ? email === accountHint : null;
    if (matchesTab === false) {
      if (!forceChooser) return authorize(true, ctx, true);
      throw new Error(
        `This Drive tab is signed in as ${accountHint}, but ${email} was authorized instead. Try again and choose ${accountHint}.`
      );
    }

    const clash = Object.entries(accounts).find(
      ([slot, known]) => known === email && Number(slot) !== authUser
    );
    if (clash) {
      // Unconfirmed and unasked: the address belongs to another slot, so the
      // hints were probably ignored. Ask outright before believing it.
      if (matchesTab === null && !forceChooser) return authorize(true, ctx, true);
      // Otherwise this mapping is the confirmed one and the OTHER slot's is
      // stale: adding or removing an account in Chrome renumbers /u/N/.
      await clearToken(Number(clash[0]));
      await forgetAccount(Number(clash[0]));
    }
    await writeAccount(authUser, email);
  }

  await storeToken(authUser, entry);
  return entry.token;
}

async function getToken(ctx) {
  const cachedToken = await readCachedToken(ctx.authUser);
  if (cachedToken) return cachedToken;
  // Try a silent refresh first so the common path is invisible; fall back to
  // an interactive prompt only when the Google session can't cover it.
  try {
    return await authorize(false, ctx);
  } catch {
    return await authorize(true, ctx);
  }
}

async function call(path, init = {}, ctx = { authUser: 0 }, retries = { auth: true, account: true }) {
  const { authUser } = ctx;
  const token = await getToken(ctx);
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (response.status === 401 && retries.auth) {
    await clearToken(authUser);
    return call(path, init, ctx, { ...retries, auth: false });
  }

  // A token belonging to the wrong account can't see the file, so Drive says
  // 404 — indistinguishable from a genuinely missing item. That matters
  // because `authuser` is not a documented parameter on the authorization
  // endpoint: if Google ignores it, a silent refresh happily returns the
  // DEFAULT account's token and caches it against this slot, and every call
  // 404s from then on. Rather than trusting the parameter, recover from being
  // wrong: drop the slot's token and ask the user which account this is. The
  // cost when the file really is missing is one account chooser.
  if (response.status === 404 && retries.account) {
    await clearToken(authUser);
    await authorize(true, ctx, true);
    return call(path, init, ctx, { ...retries, account: false });
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `HTTP ${response.status}`;
    if (response.status === 403) {
      throw new Error(`${message} (you may not have edit access to this item)`);
    }
    if (response.status === 404) {
      throw new Error(
        'Item not found. It may have been deleted, or it belongs to a Google account this tab is not signed into.'
      );
    }
    throw new Error(message);
  }
  return body;
}

// supportsAllDrives keeps this working for items in shared drives.
const COMMON = 'supportsAllDrives=true';

export async function getDescription(fileId, ctx) {
  const data = await call(
    `${API}/${encodeURIComponent(fileId)}?fields=name,description,capabilities/canEdit&${COMMON}`,
    {},
    ctx
  );
  return {
    name: data.name,
    description: data.description || '',
    canEdit: data.capabilities?.canEdit !== false,
  };
}

export async function setDescription(fileId, description, ctx) {
  await call(
    `${API}/${encodeURIComponent(fileId)}?fields=description&${COMMON}`,
    { method: 'PATCH', body: JSON.stringify({ description }) },
    ctx
  );
}

export async function testAuth(ctx = { authUser: 0 }) {
  await getToken(ctx);
  return true;
}

// Read-only counterpart to testAuth, for the popup: reports whether we could
// get a token WITHOUT ever showing a window. testAuth is the wrong call there
// — it falls through to an interactive prompt, so merely opening the popup
// would throw a Google sign-in window at you.
//
// Any authorized account counts as connected. The popup can't tell which
// account the open tab belongs to without the "tabs" permission, and adding a
// permission to refine a status dot isn't a trade worth making.
export async function getStatus() {
  const emails = Object.values(await readAccounts());
  const everything = await chrome.storage.session.get(null);
  const anyLive = Object.entries(everything).some(
    ([key, entry]) =>
      key.startsWith(TOKEN_PREFIX) && entry?.token && Date.now() < entry.expiresAt
  );
  if (anyLive) return { connected: true, emails };

  try {
    await authorize(false, { authUser: 0, accountHint: null });
    return { connected: true, emails: Object.values(await readAccounts()) };
  } catch {
    return { connected: false, emails };
  }
}

// Slot -> address, for the options page's account list.
export async function getAccounts() {
  return { accounts: await readAccounts() };
}

// Drop one account: its token and the mapping that would silently re-hint it.
// The grant itself lives in the user's Google account and is revoked from
// there, which the options page links to.
export async function disconnect(authUser) {
  await clearToken(authUser);
  await forgetAccount(authUser);
  return true;
}

// Options calls this when the client ID changes. Every account's token was
// issued by the old client, so all of them go. Clearing storage.session from
// there wouldn't be enough on its own: a live service worker holds `memo` and
// never re-reads storage while those copies are still inside their expiry
// window.
export async function signOut() {
  await clearAllTokens();
  return true;
}
