// Writes release-notes.json for the beta site from APP_CHANGELOG, so the
// in-app What's new and the beta notes come from one source.
//
//   node tools/build-release-notes.mjs [out-file]   (default: release-notes.json)
//
// Loads js/version.js and js/whatsnew-core.js with node:vm, the way the
// tests do; the output keeps only version, date, headline, benefits and
// highlight. No dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const ctx = { console, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(ctx);
for (const f of ['js/version.js', 'js/whatsnew-core.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
}

const out = process.argv[2] || 'release-notes.json';
const rows = JSON.parse(JSON.stringify(ctx.wnReleaseNotesJson(ctx.APP_CHANGELOG)));
writeFileSync(out, JSON.stringify({ version: ctx.APP_VERSION, releases: rows }, null, 2) + '\n');
console.log(`Wrote ${rows.length} releases (latest v${ctx.APP_VERSION}) to ${out}`);
