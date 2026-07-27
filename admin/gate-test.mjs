// Exercises the gate against a stubbed chrome.storage. The properties that
// matter are the ones a paying user would notice if they broke: existing
// accounts never blocked, fail-open on every error, grandfathering honoured.
//
//   node admin/gate-test.mjs
//
// No framework and no install step, matching the rest of the project. It loads
// licensing.js as a data: URL module so `chrome` resolves to the stub below.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'background',
  'licensing.js'
);

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' :: ' + detail : ''}`);
  ok ? pass++ : fail++;
};

function stubChrome({ local = {}, sync = {}, breakStorage = false } = {}) {
  const area = (store) => ({
    async get(key) {
      if (breakStorage) throw new Error('storage exploded');
      if (key === null) return { ...store };
      if (typeof key === 'string') return { [key]: store[key] };
      return Object.fromEntries(Object.keys(key).map((k) => [k, store[k]]));
    },
    async set(obj) {
      if (breakStorage) throw new Error('storage exploded');
      Object.assign(store, obj);
    },
  });
  globalThis.chrome = {
    storage: { local: area(local), sync: area(sync) },
    tabs: { create: async () => true },
  };
  return { local, sync };
}

// Freshly import per scenario so nothing is memoised across tests.
//
// The ExtPay import is swapped for a stub: a relative import can't resolve from
// a data: URL, and the gate's logic must hold regardless of what the payment
// processor does. Everything ExtPay touches is tested through its absence here,
// which is the case that matters (offline, blocked, or down).
async function load() {
  const source = fs
    .readFileSync(SRC, 'utf8')
    .replace(
      /^import ExtPay from .*$/m,
      'const ExtPay = () => ({ startBackground(){}, onPaid:{addListener(){}}, ' +
        'async getUser(){ throw new Error("offline") }, async openPaymentPage(){} });'
    );
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  return import(url);
}

const cached = (config) => ({
  gatingConfig: { config, fetchedAt: Date.now() },
});

const GATING_ON = {
  gateEnabled: true,
  freeAccountLimit: 1,
  priceLabel: '$2',
  checkoutUrl: 'https://buy.stripe.com/test',
  upgradeHeadline: 'Unlock multiple Google accounts',
  upgradeBody: 'body',
};

async function blocked(mod, slot) {
  try {
    await mod.assertAccountAllowed(slot);
    return null;
  } catch (err) {
    return err;
  }
}

// 1. One account connected, limit 1, connecting a second -> blocked with an offer.
{
  stubChrome({ local: { ...cached(GATING_ON), accounts: { 0: 'a@x.com' } } });
  const mod = await load();
  const err = await blocked(mod, 1);
  check('second account blocked', err?.code === 'ACCOUNT_LIMIT', err?.message);
  check('refusal carries an offer', err?.upgrade?.priceLabel === '$2');
}

// 2. The account already connected re-authorizes freely. Tokens expire hourly;
//    charging at every refresh would be absurd.
{
  stubChrome({ local: { ...cached(GATING_ON), accounts: { 0: 'a@x.com' } } });
  const mod = await load();
  check('known slot passes', (await blocked(mod, 0)) === null);
}

// 3. Nothing connected yet -> the first account is always free.
{
  stubChrome({ local: { ...cached(GATING_ON), accounts: {} } });
  const mod = await load();
  check('first account free', (await blocked(mod, 0)) === null);
}

// 4. Paid -> no limit.
{
  stubChrome({
    local: { ...cached(GATING_ON), accounts: { 0: 'a@x.com', 1: 'b@x.com' } },
    sync: { license: { paid: true, source: 'extpay' } },
  });
  const mod = await load();
  check('paid bypasses the gate', (await blocked(mod, 2)) === null);
}

// 5. Kill switch.
{
  stubChrome({
    local: { ...cached({ ...GATING_ON, gateEnabled: false }), accounts: { 0: 'a@x.com' } },
  });
  const mod = await load();
  check('kill switch unlocks', (await blocked(mod, 1)) === null);
}

// 6. No checkout URL override just means ExtensionPay handles it. The gate
//    still applies, because a checkout always exists now.
{
  stubChrome({
    local: { ...cached({ ...GATING_ON, checkoutUrl: '' }), accounts: { 0: 'a@x.com' } },
  });
  const mod = await load();
  check('empty checkout override still gates', (await blocked(mod, 1))?.code === 'ACCOUNT_LIMIT');
}

// 6b. A dead payment processor must not revoke someone who already paid.
{
  stubChrome({
    local: cached(GATING_ON),
    sync: { license: { paid: true, source: 'extpay' } },
  });
  const mod = await load();
  const state = await mod.refreshLicense(); // the stub's getUser() throws
  check('processor failure never revokes', state.paid === true);
}

// 6c. Unpaid plus an unreachable processor stays unpaid rather than throwing.
{
  stubChrome({ local: cached(GATING_ON) });
  const mod = await load();
  const state = await mod.refreshLicense();
  check('processor failure resolves cleanly', state.paid === false);
}

// 7. Grandfathering: three accounts predate the gate, limit is 1, all keep working.
{
  stubChrome({
    local: {
      ...cached(GATING_ON),
      accounts: { 0: 'a@x.com', 1: 'b@x.com', 2: 'c@x.com' },
      preGateAccountCount: 3,
    },
  });
  const mod = await load();
  check('grandfathered slots keep working', (await blocked(mod, 1)) === null);
  const plan = await mod.getPlan();
  check('allowance follows baseline', plan.allowance === 3, `allowance=${plan.allowance}`);
  check('plan reports grandfathered', plan.grandfathered === true);
  // A fourth is still beyond what they had.
  check('beyond the baseline still blocks', (await blocked(mod, 9))?.code === 'ACCOUNT_LIMIT');
}

// 8. Baseline is written once and never revised, or the gate would re-baseline
//    itself to include accounts it had already let through.
{
  const { local } = stubChrome({ local: { accounts: { 0: 'a@x.com', 1: 'b@x.com' } } });
  const mod = await load();
  check('update records the count', (await mod.recordBaseline('update')) === 2);
  local.accounts[2] = 'c@x.com';
  check('second call does not re-baseline', (await mod.recordBaseline('update')) === 2, `got ${local.preGateAccountCount}`);
}

// 9. A fresh install has no baseline to inherit.
{
  stubChrome({ local: {} });
  const mod = await load();
  check('fresh install baselines at 0', (await mod.recordBaseline('install')) === 0);
}

// 10. Duplicate addresses across renumbered slots count once.
{
  stubChrome({
    local: { ...cached(GATING_ON), accounts: { 0: 'a@x.com', 1: 'a@x.com' } },
  });
  const mod = await load();
  const plan = await mod.getPlan();
  check('duplicate addresses counted once', plan.connected === 1, `connected=${plan.connected}`);
}

// 11. Fail open. Storage errors must never block someone from their own notes.
{
  stubChrome({ breakStorage: true });
  const mod = await load();
  check('storage failure fails OPEN', (await blocked(mod, 5)) === null);
}

// 12. The one that would have shipped a paywall to everyone: no cached config
//     and an unreachable config host. The built-in defaults must not charge.
{
  stubChrome({ local: { accounts: { 0: 'a@x.com', 1: 'b@x.com' } } });
  globalThis.fetch = async () => {
    throw new Error('network unreachable');
  };
  const mod = await load();
  const plan = await mod.getPlan();
  check('cold install with no config does NOT gate', plan.enforced === false);
  check('built-in default is gate-off', plan.gateEnabled === false);
  check('unreachable config never blocks', (await blocked(mod, 7)) === null);
  delete globalThis.fetch;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
