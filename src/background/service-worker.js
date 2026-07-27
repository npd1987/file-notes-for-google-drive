// Message router. The content script never talks to Google directly — it asks
// here, so the backend is a one-line swap.

import * as apiBackend from './api-backend.js';
// import * as uiBackend from './ui-backend.js';  // see ui-backend.js
import * as licensing from './licensing.js';

const backend = apiBackend;

// Top level, not inside a listener: the service worker is torn down after ~30s
// idle and rebuilt on the next event, and this has to be registered on every
// one of those rebuilds for a payment made in another tab to land.
licensing.startPaymentListener();

// The account baseline has to be captured the moment this build lands, before
// the gate has had any chance to influence the count. onInstalled is the only
// hook that fires exactly once per update.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  licensing.recordBaseline(reason);
  licensing.refreshConfig();
});

// Config also refreshes on browser start, so a machine left open for a week
// isn't the only thing standing between a rule change and the people it's for.
chrome.runtime.onStartup.addListener(() => {
  licensing.refreshConfig();
});

// Tab context for a request: which Drive account slot the click came from, and
// the address that tab displays as signed in. Both default to the single
// account case so callers with no tab at all — the popup — still work.
const tabContext = ({ authUser = 0, accountHint = null }) => ({ authUser, accountHint });

const handlers = {
  async getDescription(message) {
    const { name, description, canEdit } = await backend.getDescription(
      message.fileId,
      tabContext(message)
    );
    return { name, description, canEdit };
  },

  async setDescription(message) {
    await backend.setDescription(message.fileId, message.description, tabContext(message));
    return {};
  },

  async testAuth(message) {
    await backend.testAuth(tabContext(message));
    return {};
  },

  async getStatus() {
    return backend.getStatus();
  },

  async getAccounts() {
    return backend.getAccounts();
  },

  async disconnect({ authUser }) {
    await backend.disconnect(authUser);
    return {};
  },

  async signOut() {
    await backend.signOut();
    return {};
  },

  async getPlan() {
    return { plan: await licensing.getPlan() };
  },

  // Options' "Already paid? Restore" button. Also re-pulls the rules, so one
  // click covers both reasons someone would press it.
  async refreshLicense() {
    await licensing.refreshConfig();
    await licensing.refreshLicense();
    return { plan: await licensing.getPlan() };
  },

  // Takes no URL by design: see openCheckout in licensing.js.
  async openCheckout() {
    await licensing.openCheckout();
    return {};
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message type: ${message?.type}` });
    return false;
  }
  handler(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    // `code` and `upgrade` ride along so a refusal that has an offer behind it
    // arrives as one, rather than as a string the caller would have to match on.
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err.message || String(err),
        ...(err.code ? { code: err.code } : {}),
        ...(err.upgrade ? { upgrade: err.upgrade } : {}),
      })
    );
  return true; // keep the channel open for the async response
});
