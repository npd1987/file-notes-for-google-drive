# Vendored: ExtPay

[ExtensionPay](https://extensionpay.com) client library, from
[github.com/Glench/ExtPay](https://github.com/Glench/ExtPay). **AGPLv3.**

Checked in rather than installed, because this project has no build step and no
`node_modules`. Two files, same code, two loaders:

| File | Loaded as | By |
|---|---|---|
| `ExtPay.js` | classic content script on `extensionpay.com` | `manifest.json` |
| `ExtPay.module.js` | ES module | `src/background/licensing.js` |

## Why both, and why not upstream's module build

The service worker is `"type": "module"`, so it needs an ES module. Upstream's
`dist/ExtPay.module.js` opens with:

```js
import * as browser from 'webextension-polyfill';
```

A bare specifier like that only resolves under a bundler. In a browser it throws
before a line of it runs. The plain `dist/ExtPay.js` build has the polyfill
bundled in already, which is the whole 52 KB versus 13 KB difference.

So `ExtPay.module.js` here is a **copy of `dist/ExtPay.js` with one line
appended**:

```js
export default ExtPay;
```

That works because the plain build is an IIFE assigned to `var ExtPay`, which is
a module-scoped binding once the file is loaded as a module.

The content script entry has to stay the classic build: content scripts are not
modules, and an `export` statement in one is a syntax error.

## Updating

Both files come from the same upstream source. Do not copy
`dist/ExtPay.module.js`.

```bash
curl -sSL -o src/vendor/ExtPay.js https://raw.githubusercontent.com/Glench/ExtPay/main/dist/ExtPay.js
cp src/vendor/ExtPay.js src/vendor/ExtPay.module.js
printf '\nexport default ExtPay;\n' >> src/vendor/ExtPay.module.js
```

Then confirm both still load:

```bash
node --check src/vendor/ExtPay.js && node --input-type=module --check < src/vendor/ExtPay.module.js
```

## Licence

AGPLv3. It is a network-copyleft licence, and this repository is not currently
licensed under it. Worth a decision before the paid version goes live rather
than after. In practice an extension ships its source as readable JavaScript
anyway, and distributing through ExtensionPay is the library's intended use, so
the exposure is limited, but "limited" is not "none".
