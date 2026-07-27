// Entry point: intercept modifier + right-click on a Drive item and open the
// note box.
//
// The listener is registered on `window` in the CAPTURE phase at
// document_start. That ordering is deliberate: capture on window runs before
// capture on document, and document_start means we register before Drive's own
// SPA bootstraps. Without both, Drive's custom context menu wins the race.

DriveNotes.loadSettings();

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        // A rejection can carry an offer as well as a message. Rebuilt as a
        // real Error so callers keep the ordinary try/catch shape, with the
        // extra fields hung off it.
        const error = new Error(response?.error || 'Unknown error');
        if (response?.code) error.code = response.code;
        if (response?.upgrade) error.upgrade = response.upgrade;
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

window.addEventListener(
  'contextmenu',
  (event) => {
    if (!DriveNotes.modifierHeld(event)) return;

    const target = DriveNotes.resolveTarget(event.target);
    if (!target) {
      // Couldn't identify an item — let Drive's own menu open rather than
      // swallowing the click and leaving the user with nothing.
      DriveNotes.log('no target resolved; passing through');
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    // Captured once, here, rather than read again when the save fires: the
    // user could navigate this tab to a different account while the box is
    // open, and the save has to go to the account the file was read from.
    const authUser = DriveNotes.currentAuthUser();
    const accountHint = DriveNotes.currentAccountEmail();
    DriveNotes.log('authUser ->', authUser, 'accountHint ->', accountHint);

    const overlay = DriveNotes.openOverlay({
      x: event.clientX,
      y: event.clientY,
      title: 'Loading…',
      onSave: async (text) => {
        await send({
          type: 'setDescription',
          fileId: target.id,
          description: text,
          authUser,
          accountHint,
        });
      },
    });

    // Read the current description first so saving edits rather than clobbers.
    // The API also gives us the real filename, which saves scraping it.
    send({ type: 'getDescription', fileId: target.id, authUser, accountHint })
      .then(({ name, description }) => {
        overlay.setTitle(name || 'Untitled');
        overlay.setValue(DriveNotes.composeInitial(description));
      })
      .catch((err) => {
        // The one refusal that isn't a failure: this account is past the free
        // allowance. It gets an offer instead of red text.
        if (err.code === 'ACCOUNT_LIMIT') {
          overlay.showUpgrade(err.upgrade || {}, () => send({ type: 'openCheckout' }));
          return;
        }
        overlay.setTitle('Drive note');
        overlay.setStatus(err.message, 'error');
      });
  },
  true
);

// Diagnostic helper for spike work. NOTE: content scripts run in an isolated
// world, so this is not visible from the default console context — switch the
// DevTools context dropdown (top of the Console panel) from `top` to
// `File Notes for Google Drive` first. The standalone snippet in the README
// needs no switching.
window.__driveNotesDebug = (el) => DriveNotes.debugDump(el || document.activeElement);
