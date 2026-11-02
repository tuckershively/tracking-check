// npm test: runs tracking-check on the invented sample and checks it reports what the sample was built
// to show. No network: the sample is read from files, and the run must send no request at all.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "tracking-check-test-"));
let failed = 0;
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"}  ${what}`); if (!cond) failed++; };

const run = spawnSync(process.execPath, [
  "tracking-check.mjs", "--dir", "sample/site", "--container", "sample/gtm.js",
  "--gtm", "GTM-SAMPLE1", "--mid", "G-SAMPLE0001", "--record", "sample/records.md", "--out", out,
], { cwd: root, encoding: "utf8" });

ok(run.status === 1, `exits 1 because the sample has FAILs (got ${run.status})`);
const got = JSON.parse(fs.readFileSync(path.join(out, "tracking-check.json"), "utf8"));
const want = JSON.parse(fs.readFileSync(path.join(root, "sample", "report", "tracking-check.json"), "utf8"));
ok(got.requests.length === 0, "the sample run sends no request");
ok(got.verdict === want.verdict, `verdict is "${want.verdict}"`);
const status = (r) => Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
const g = status(got), w = status(want);
for (const id of Object.keys(w)) ok(g[id] === w[id], `${id} is ${w[id]}${g[id] === w[id] ? "" : ` (got ${g[id]})`}`);
ok(Object.keys(g).length === Object.keys(w).length, `${Object.keys(w).length} checks, no more and no fewer`);

// The planted faults, by name, so a change that hides one fails loudly.
for (const [id, s, why] of [
  ["1.3", "FAIL", "the leftover test container on the about page"],
  ["1.5", "FAIL", "the hard-coded Google tag on the services page"],
  ["1.1", "WARN", "the missing noscript fallback"],
  ["2.4", "WARN", "the thank-you page in the sitemap without noindex"],
  ["2.6", "WARN", "email links with no email event"],
  ["5.1", "WARN", "the form with no hidden source fields"],
  ["2.2", "PASS", "the lead event on the confirmed send"],
  ["2.5", "PASS", "the phone event reached through the link click listener"],
]) ok(g[id] === s, `catches ${why} (${id} ${s})`);

// Read-only by construction: the script never names a request method other than GET.
const src = fs.readFileSync(path.join(root, "tracking-check.mjs"), "utf8");
ok(!/method:\s*["'](POST|PUT|PATCH|DELETE)/i.test(src) && /method: "GET"/.test(src), "the script only ever sends GET");

fs.rmSync(out, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
