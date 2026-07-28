import js from '@eslint/js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, 'public', 'js');

// public/js/*.js are 10 plain <script> tags sharing one global scope by design
// (see CLAUDE.md — required for inline onclick="" handlers, no ES modules).
// Declare every top-level function/const/let as a shared global so no-undef
// still catches real typos (e.g. an undefined `b` where `badge` was meant)
// without flagging legitimate cross-file references.
function extractTopLevelGlobals(dir) {
  const globals = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const line of src.split('\n')) {
      const fn = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (fn) { globals[fn[1]] = 'writable'; continue; }
      const decl = line.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
      if (decl) { globals[decl[1]] = 'writable'; continue; }
    }
  }
  return globals;
}

const sharedScriptGlobals = extractTopLevelGlobals(jsDir);

export default [
  js.configs.recommended,
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly', navigator: 'readonly',
        fetch: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', location: 'readonly',
        Image: 'readonly', FileReader: 'readonly', Blob: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        DOMParser: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        confirm: 'readonly', alert: 'readonly', prompt: 'readonly', history: 'readonly',
        AbortSignal: 'readonly', AbortController: 'readonly', CustomEvent: 'readonly',
        pdfjsLib: 'readonly', JSZip: 'readonly', XLSX: 'readonly', supabase: 'readonly',
        ...sharedScriptGlobals,
      },
    },
    rules: {
      // Nearly every top-level declaration here is consumed by another file or an
      // inline onclick="" attribute — no-unused-vars can't see either, so it's not
      // meaningful signal in this architecture. no-undef (below, via recommended)
      // still catches real bugs like referencing an undeclared variable.
      'no-unused-vars': 'off',
      // Every name in sharedScriptGlobals is also the file's own top-level
      // declaration (that's the point — one shared namespace across 10 scripts),
      // so it always collides with itself here. Real accidental redeclarations
      // within a single file are rare enough that this trade-off is worth it.
      'no-redeclare': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly', fetch: 'readonly', console: 'readonly',
        AbortSignal: 'readonly', Buffer: 'readonly', URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
