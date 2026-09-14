// Wrap the CJS client bundle into the DSH web-shell module format:
// `window.__ModuleLoader__.load({ id, factory })` where the factory body is
// the CJS module (it receives `require` for external deps like `react`).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const cjsPath = fileURLToPath(new URL('lib/client.cjs', root));
const outPath = fileURLToPath(new URL('lib/client.js', root));

const body = readFileSync(cjsPath, 'utf8');
const wrapped = `window.__ModuleLoader__.load({\n\tid: "dsh-debate",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n${body}\n\t\treturn module.exports;\n\t}\n});\n`;

writeFileSync(outPath, wrapped);
console.log(`wrapped ${cjsPath} -> ${outPath} (${wrapped.length} bytes)`);
