// ---------------------------------------------------------------------------
// THE FRAGILE PART. Everything Drive-DOM-specific lives in this file so that
// when Google reshuffles their markup, there is exactly one place to repair.
//
// Rules for editing this file:
//   - Anchor on meaning: data-id, aria-label, role, text content.
//   - Never anchor on class names or `jsname`. Those are auto-generated and
//     rotate on internal releases with no visible UI change.
// ---------------------------------------------------------------------------

// Drive file IDs are URL-safe base64-ish and long. Real examples run 28-44 chars.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{25,90}$/;

// Attributes that have historically carried the file ID on a Drive row/tile.
const ID_ATTRS = ['data-id', 'data-target-id', 'data-item-id'];

function looksLikeDriveId(value) {
  return typeof value === 'string' && DRIVE_ID_RE.test(value);
}

// Strategy 1: walk up looking for a known ID-bearing attribute.
function byKnownAttribute(start) {
  let el = start;
  let depth = 0;
  while (el && el !== document.documentElement && depth++ < 15) {
    for (const attr of ID_ATTRS) {
      const value = el.getAttribute?.(attr);
      if (looksLikeDriveId(value)) return { id: value, el, via: attr };
    }
    el = el.parentElement;
  }
  return null;
}

// Strategy 2: walk up looking at *every* attribute for something ID-shaped.
// Broader net for when Google renames the attribute but still exposes the ID.
function byAnyAttribute(start) {
  let el = start;
  let depth = 0;
  while (el && el !== document.documentElement && depth++ < 15) {
    for (const attr of el.attributes || []) {
      if (looksLikeDriveId(attr.value)) {
        return { id: attr.value, el, via: `*${attr.name}` };
      }
    }
    el = el.parentElement;
  }
  return null;
}

// Strategy 3: we're inside an opened file, so the ID is in the URL.
function byUrl() {
  const match = location.pathname.match(/\/(?:file\/d|folders)\/([A-Za-z0-9_-]{25,90})/);
  return match ? { id: match[1], el: null, via: 'url' } : null;
}

/**
 * Resolve the Drive item under the pointer.
 * @returns {{id: string, el: Element|null, via: string}|null}
 */
DriveNotes.resolveTarget = function (eventTarget) {
  const result =
    byKnownAttribute(eventTarget) || byAnyAttribute(eventTarget) || byUrl();
  DriveNotes.log('resolveTarget ->', result);
  return result;
};

/**
 * Diagnostic dump for when resolution fails. Prints the ancestor chain with
 * every attribute so the actual ID location can be spotted by eye.
 * Call `DriveNotes.debugDump(el)` from the console.
 */
DriveNotes.debugDump = function (start) {
  let el = start;
  let depth = 0;
  const rows = [];
  while (el && depth++ < 15) {
    const attrs = [...(el.attributes || [])]
      .map((a) => `${a.name}="${a.value}"`)
      .join(' ');
    rows.push({ depth, tag: el.tagName, attrs: attrs.slice(0, 400) });
    el = el.parentElement;
  }
  console.table(rows);
  return rows;
};
