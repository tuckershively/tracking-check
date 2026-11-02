#!/usr/bin/env node
// scan-secrets.mjs: nothing credential-shaped gets into this repository. The pre-commit hook runs it.
//
// Usage
//   node scripts/scan-secrets.mjs              every tracked file plus the untracked files git does not ignore
//   node scripts/scan-secrets.mjs --staged     only what is staged for commit, read from the index (the pre-commit hook)
//   node scripts/scan-secrets.mjs <path>...    specific files or folders
//   --quiet    summary line only
//   --no-env   skip the comparison against real values (the value files below and secret-named
//              environment variables)
//
// Exit 0 clean, 1 findings, 2 usage or git error. Zero dependencies; Node 18 or newer.
//
// Four checks:
//   1. Known token shapes: Anthropic, OpenAI, GitHub, npm, AWS, Google, Slack, Stripe, Mailgun, SendGrid,
//      Shopify, Square, Meta, Twilio, JWTs, private key blocks, Basic and Bearer header literals,
//      user:password@ URLs.
//   2. A secret-named variable assigned a literal (password = "...", SOME_TOKEN=...). Placeholders,
//      template expressions and code that reads the environment do not count.
//   3. Files whose name is a secret store (.env, *.pem, *.key, *.ppk, .credentials.json, id_rsa ...).
//   4. The actual values in your own secret files and in secret-named environment variables: read in
//      memory, never printed, and searched for in every scanned file. This is the check that catches a
//      pasted real value whatever shape it has. Name the files once per clone (env style KEY=value, or
//      JSON), and they stay in .git/config, which is never pushed:
//        git config --add scansecrets.valuefile ~/path/to/secrets.env
//      or list them in the SCAN_SECRETS_FILES environment variable, separated by the path delimiter.
//
// A hit means the value belongs outside the repository. Never weaken a pattern to make a commit pass. data: URIs (inlined
// images and fonts) are the one blanket exemption, because base64 image data matches token shapes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const STAGED = has('--staged');
const QUIET = has('--quiet');
const ENV_CHECK = !has('--no-env');
const EXPLICIT = args.filter((a) => !a.startsWith('--'));
for (const a of args) {
  if (a.startsWith('--') && !['--staged', '--all', '--quiet', '--no-env'].includes(a)) {
    console.error(`scan-secrets: unknown flag ${a}`);
    process.exit(2);
  }
}

const BINARY_EXT = new Set([
  '.exe', '.dll', '.so', '.dylib', '.node', '.wasm', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico',
  '.bmp', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.gz', '.tgz', '.7z', '.rar', '.pdf',
  '.mp3', '.mp4', '.mov', '.wav', '.pyc', '.class', '.jar',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'logs']);

// [regex on the basename, what it is, optional predicate that allows the file anyway]
const FORBIDDEN_NAMES = [
  [/^\.env(\..+)?$|\.env$/i, 'an env file', (b) => /\.(example|template|sample|dist)$/i.test(b)],
  [/\.(pem|key|ppk|p12|pfx|keystore|jks|asc|gpg)$/i, 'a key or certificate store'],
  [/^(\.?credentials\.json|id_rsa|id_dsa|id_ecdsa|id_ed25519|\.netrc|\.pgpass|\.git-credentials|kubeconfig|\.boto|\.s3cfg)$/i, 'a credential file'],
  [/(^|[._-])(secret|secrets|token|tokens)\.(json|txt|yml|yaml|env)$/i, 'a secrets file by name'],
];

// Values that are obviously not real: placeholders, template expressions, dotted code references,
// lowercase words joined by - or _ (api-password-from-dashboard, some_secret).
const PLACEHOLDER = /example|your[_ -]?|xxx|placeholder|changeme|change-me|dummy|redacted|sample|replace|insert|paste|fill[_ -]?in|\bhere\b|-here$|_here$|<[^>]*>|\$\{|\$[A-Za-z_(]|%[A-Za-z_]+%|\{\{|\.\.\.|^\*+$|^x+$|from[_-]|-from\b|^(?:[a-z]+[-_])+[a-z]+$|^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$|\(/i;

const entropy = (s) => {
  const f = new Map();
  for (const c of s) f.set(c, (f.get(c) || 0) + 1);
  let h = 0;
  for (const n of f.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
};
const looksSecret = (v) => Boolean(v) && v.length >= 8 && !PLACEHOLDER.test(v) && entropy(v) >= 2.5;

// value: the capture group holding the secret itself (checked with looksSecret); no value means the
// shape alone is specific enough to report.
const PATTERNS = [
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI API key', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g },
  { name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/g },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'Stripe key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/g },
  { name: 'Mailgun key', re: /\bkey-[0-9a-f]{32}\b/g },
  { name: 'SendGrid key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g },
  { name: 'Shopify token', re: /\bshp(?:at|ca|pa|ss)_[0-9a-f]{32}\b/g },
  { name: 'Square token', re: /\bsq0[a-z]{3}-[A-Za-z0-9_-]{22,}/g },
  { name: 'Meta access token', re: /\bEAA[A-Za-z0-9]{80,}/g },
  { name: 'Twilio key', re: /\b(?:SK|AC)[0-9a-f]{32}\b/g },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY/g },
  { name: 'Basic auth literal', re: /\bBasic\s+([A-Za-z0-9+/]{24,}={0,2})(?![A-Za-z0-9+/=])/g, value: 1 },
  { name: 'Bearer token literal', re: /\bBearer\s+([A-Za-z0-9._~+/-]{24,}=*)(?![A-Za-z0-9._~+/=-])/g, value: 1 },
  { name: 'credentials in a URL', re: /\b[a-z][a-z0-9+.-]*:\/\/([^\s/:@"'<>`]+):([^\s/:@"'<>`]{4,})@[^\s"'<>`]+/gi, value: 2 },
  {
    name: 'secret assigned a literal',
    re: /(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|client[_-]?secret|access[_-]?key|private[_-]?key|auth[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*(["'])([^"'\s]{8,})\1/gi,
    value: 2,
  },
  {
    // Upper-case env-style keys only: `const password = env.X` is code, not a value.
    name: 'secret in env style',
    re: /^\s*(?:export\s+|set\s+|\$env:)?[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY|CLIENT_SECRET|ACCESS_KEY)[A-Z0-9_]*\s*=\s*([^\s"'#]{8,})\s*$/g,
    value: 1,
  },
];

const DATA_URI = /data:[a-z0-9/+.-]+;base64,[A-Za-z0-9+/=]+/gi;

function git(argv) {
  return execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
}
function gitBuffer(argv) {
  return execFileSync('git', argv, { cwd: ROOT, maxBuffer: 1 << 26 });
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), out);
    } else if (ent.isFile()) {
      out.push(path.join(dir, ent.name));
    }
  }
}

// Returns [{ rel, read: () => Buffer | null }]
function listFiles() {
  if (STAGED) {
    let names;
    try {
      names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
    } catch (e) {
      console.error('scan-secrets: git diff --cached failed: ' + e.message);
      process.exit(2);
    }
    return names.map((rel) => ({ rel, read: () => gitBuffer(['show', ':' + rel]) }));
  }
  if (EXPLICIT.length) {
    const files = [];
    for (const p of EXPLICIT) {
      const abs = path.resolve(p);
      if (!fs.existsSync(abs)) { console.error(`scan-secrets: no such path ${p}`); process.exit(2); }
      if (fs.statSync(abs).isDirectory()) walk(abs, files); else files.push(abs);
    }
    return files.map((abs) => ({ rel: path.relative(ROOT, abs).split(path.sep).join('/') || abs, read: () => fs.readFileSync(abs) }));
  }
  let names;
  try {
    names = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  } catch {
    const files = [];
    walk(ROOT, files);
    names = files.map((abs) => path.relative(ROOT, abs).split(path.sep).join('/'));
  }
  return names.map((rel) => ({
    rel,
    read: () => {
      const abs = path.join(ROOT, rel);
      return fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs) : null;
    },
  }));
}

// The real values on this machine. Read into memory only; nothing here is ever printed.
function valueFiles() {
  const files = [];
  try { files.push(...git(['config', '--get-all', 'scansecrets.valuefile']).split(/\r?\n/)); } catch { /* none configured */ }
  if (process.env.SCAN_SECRETS_FILES) files.push(...process.env.SCAN_SECRETS_FILES.split(path.delimiter));
  return [...new Set(files.map((f) => f.trim()).filter(Boolean).map((f) => f.replace(/^~(?=$|[\\/])/, os.homedir())))];
}
function secretValues() {
  const vals = [];
  const take = (label, v) => { if (v && v.length >= 6 && !PLACEHOLDER.test(v)) vals.push([label, v]); };
  for (const file of valueFiles()) {
    if (!fs.existsSync(file)) continue;
    const name = path.basename(file);
    const text = fs.readFileSync(file, 'utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { /* env style, not JSON */ }
    if (json) {
      const seen = (node) => {
        if (typeof node === 'string') { if (node.length >= 20) take(`a value from ${name}`, node); }
        else if (node && typeof node === 'object') Object.values(node).forEach(seen);
      };
      seen(json);
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || !/PASS|SECRET|TOKEN|KEY|AUTH|CRED/i.test(m[1])) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      take(`the value of ${m[1]} from ${name}`, v);
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (/TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY/i.test(k) && v && v.length >= 12) {
      take(`the value of the ${k} environment variable`, v);
    }
  }
  return vals;
}

const mask = (s) => (s.length <= 6 ? '*'.repeat(s.length) : s.slice(0, 4) + '…(' + s.length + ' chars)');
const excerpt = (line, matched) => {
  let t = line.trim().split(matched).join(mask(matched));
  if (t.length > 120) t = t.slice(0, 117) + '...';
  return t;
};

const findings = [];
const report = (rel, line, rule, text) => findings.push({ rel, line, rule, text });

const files = listFiles();
if (STAGED && files.length === 0) {
  if (!QUIET) console.log('scan-secrets: nothing staged');
  process.exit(0);
}
const values = ENV_CHECK ? secretValues() : [];
let scanned = 0;

for (const f of files) {
  const base = path.basename(f.rel);
  for (const [re, what, allow] of FORBIDDEN_NAMES) {
    if (re.test(base) && !(allow && allow(base))) report(f.rel, 0, `file name: ${what}`, 'remove it from the repository (git rm --cached) and ignore it');
  }
  if (BINARY_EXT.has(path.extname(base).toLowerCase())) continue;
  let buf;
  try { buf = f.read(); } catch { buf = null; }
  if (!buf) continue;
  if (buf.subarray(0, 8192).includes(0)) continue; // binary content
  scanned++;
  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(DATA_URI, 'data:(inlined)');
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(line)) !== null) {
        const v = p.value ? m[p.value] : m[0];
        if (p.value && !looksSecret(v)) continue;
        report(f.rel, i + 1, p.name, excerpt(line, v));
      }
    }
  });
  for (const [label, v] of values) {
    let idx = text.indexOf(v);
    while (idx !== -1) {
      const lineNo = text.slice(0, idx).split('\n').length;
      report(f.rel, lineNo, label, 'the real value is in this file');
      idx = text.indexOf(v, idx + v.length);
    }
  }
}

findings.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line);
if (!QUIET) {
  for (const x of findings) console.log(`FAIL  ${x.rel}${x.line ? ':' + x.line : ''}  [${x.rule}]  ${x.text}`);
}
const mode = STAGED ? 'staged' : EXPLICIT.length ? 'given' : 'tracked and untracked';
const compared = values.length ? `, compared against ${values.length} real value${values.length === 1 ? '' : 's'} from this machine` : '';
if (findings.length) {
  console.log(`scan-secrets: ${findings.length} finding${findings.length === 1 ? '' : 's'} in ${scanned} ${mode} files${compared}.`);
  console.log('A hit means the value belongs outside the repository. Never weaken a pattern to make a commit pass.');
  process.exit(1);
}
console.log(`scan-secrets: clean, ${scanned} ${mode} files${compared}.`);
