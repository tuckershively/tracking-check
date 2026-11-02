#!/usr/bin/env node
// tracking-check: the tracking verification checklist, run as a script.
// The checklist it follows, with the manual way to do every step:
// https://tuckershively.com/docs/tracking/tracking-verification-checklist/
//
// Read-only. It sends GET requests and nothing else: it never submits a form, signs in, or
// changes a container, a property or a site. No API key. Zero dependencies. Node 18 or newer.
//
//   node tracking-check.mjs https://example.com [options]
//   node tracking-check.mjs --dir ./saved-site [options]
//
// Options
//   --gtm GTM-XXXXXXX      the container the site should load (default: the one the pages load)
//   --mid G-XXXXXXXXXX     the measurement id of the GA4 data stream the business uses
//   --container <file>     a saved copy of the container's gtm.js instead of the published one
//   --dir <folder>         check saved .html files instead of a live site (its sitemap.xml is read)
//   --record <file>        the document the business keeps its tracking ids in; checked for each id
//   --lead-event <name>    the lead event name (default generate_lead)
//   --phone-event <name>   the phone tap event name (default phone_click)
//   --email-event <name>   the email tap event name (default email_click)
//   --max <n>              the most pages to check (default 60)
//   --confirmed 1.8,3.2    checks you verified by hand this run; they report as PASS
//   --out <folder>         where the report goes (default ./tracking-check-<date>)
//
// Exit 0 when nothing FAILs, 1 when something does, 2 on a usage error.

import fs from "node:fs";
import path from "node:path";

const VERSION = "1.0.0";
const GUIDE = "https://tuckershively.com/docs/tracking/tracking-verification-checklist/";
const UA = `tracking-check/${VERSION} (+https://github.com/tuckershively/tracking-check)`;
const USAGE = "usage: node tracking-check.mjs <https://site> | --dir <folder>  [--gtm GTM-X] [--mid G-X] [--container gtm.js] [--record file] [--lead-event name] [--phone-event name] [--email-event name] [--max n] [--confirmed ids] [--out folder]";

// ---------- options ----------
const argv = process.argv.slice(2);
const opt = { confirmed: [], leadEvent: "generate_lead", phoneEvent: "phone_click", emailEvent: "email_click", max: 60 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const v = () => {
    const x = argv[++i];
    if (x === undefined) { console.error(`${a} needs a value\n${USAGE}`); process.exit(2); }
    return x;
  };
  if (a === "-h" || a === "--help") { console.log(USAGE); process.exit(0); }
  else if (!a.startsWith("--") && !opt.url) opt.url = a;
  else if (a === "--dir") opt.dir = v();
  else if (a === "--gtm") opt.gtm = v().trim().toUpperCase();
  else if (a === "--mid") opt.mid = v().trim().toUpperCase();
  else if (a === "--container") opt.container = v();
  else if (a === "--record") opt.record = v();
  else if (a === "--lead-event") opt.leadEvent = v();
  else if (a === "--phone-event") opt.phoneEvent = v();
  else if (a === "--email-event") opt.emailEvent = v();
  else if (a === "--max") opt.max = Math.max(1, parseInt(v(), 10) || 60);
  else if (a === "--confirmed") opt.confirmed.push(...v().split(",").map((x) => x.trim()).filter(Boolean));
  else if (a === "--out") opt.out = v();
  else { console.error(`unknown flag ${a}\n${USAGE}`); process.exit(2); }
}
if (!opt.url === !opt.dir) { console.error(USAGE); process.exit(2); }
if (opt.url && !/^https?:\/\//i.test(opt.url)) opt.url = "https://" + opt.url;

const checks = [];
const add = (id, phase, status, title, detail = "") => checks.push({ id, phase, status, title, detail: String(detail) });
const PHASES = {
  1: "Tags on every page", 2: "Each event fires once", 3: "Key events", 4: "A real lead end to end",
  5: "Source on the lead", 6: "Consent", 7: "Tagging server", 8: "Ad platforms", 9: "Monthly re-check",
};
const list = (xs, n = 5) => xs.slice(0, n).join(", ") + (xs.length > n ? ` and ${xs.length - n} more` : "");

// ---------- reading: GET only, every request logged ----------
const requests = [];
async function get(url) {
  requests.push(url);
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml,application/javascript,*/*" },
      signal: AbortSignal.timeout(20000),
    });
    const type = r.headers.get("content-type") || "";
    const body = !type || /text|html|xml|javascript|json/i.test(type) ? await r.text() : "";
    return { status: r.status, url: r.url || url, robots: r.headers.get("x-robots-tag") || "", type, body };
  } catch (e) {
    return { status: 0, url, robots: "", type: "", body: "", error: String(e?.cause?.code || e?.message || e) };
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k]); }
  }));
  return out;
}
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));

// ---------- 1. gather the pages ----------
let site = "", origin = "", pageSource = "", truncated = 0, sitemapUrls = [];
let pages = [];
if (opt.dir) {
  const root = path.resolve(opt.dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) { console.error(`no such folder: ${opt.dir}`); process.exit(2); }
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else if (/\.html?$/i.test(e.name)) files.push(f);
    }
  };
  walk(root);
  files.sort();
  const sm = path.join(root, "sitemap.xml");
  if (fs.existsSync(sm)) sitemapUrls = locs(fs.readFileSync(sm, "utf8"));
  if (sitemapUrls[0]) { try { const u = new URL(sitemapUrls[0]); site = u.hostname; origin = u.origin; } catch { /* not a URL */ } }
  site ||= path.basename(root);
  if (files.length > opt.max) { truncated = files.length - opt.max; files.length = opt.max; }
  pages = files.map((f) => {
    const rel = path.relative(root, f).split(path.sep).join("/");
    return { path: "/" + rel.replace(/(^|\/)index\.html?$/i, "$1"), status: 200, robots: "", html: fs.readFileSync(f, "utf8"), file: f };
  });
  pageSource = `${pages.length} saved page${pages.length === 1 ? "" : "s"} in ${opt.dir}`;
} else {
  const start = new URL(opt.url);
  origin = start.origin;
  site = start.hostname;
  const bare = (h) => h.replace(/^www\./, "");
  const sameHost = (u) => { try { return bare(new URL(u).hostname) === bare(start.hostname); } catch { return false; } };
  const norm = (u) => { try { const x = new URL(u); x.hash = ""; return x.href.replace(/\/$/, ""); } catch { return u; } };
  const robots = await get(origin + "/robots.txt");
  let smList = robots.status === 200 ? [...robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]) : [];
  if (!smList.length) smList = [origin + "/sitemap.xml"];
  for (const sm of smList.slice(0, 5)) {
    const r = await get(sm);
    if (r.status !== 200 || !/<(urlset|sitemapindex)/i.test(r.body)) continue;
    if (/<sitemapindex/i.test(r.body)) {
      for (const child of locs(r.body).slice(0, 10)) { const c = await get(child); if (c.status === 200) sitemapUrls.push(...locs(c.body)); }
    } else sitemapUrls.push(...locs(r.body));
  }
  let urls = [...new Set(sitemapUrls.filter(sameHost).map(norm))];
  if (urls.length) pageSource = "the sitemap";
  else {
    const home = await get(start.href);
    const links = [...home.body.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => { try { return new URL(m[1], home.url).href; } catch { return ""; } });
    urls = [...new Set([start.href, ...links.filter((u) => sameHost(u) && !/\.(css|js|png|jpe?g|gif|svg|webp|ico|pdf|xml|txt|zip|woff2?)(\?|$)/i.test(u))].map(norm))];
    pageSource = "the links on the page given (no sitemap found)";
  }
  if (!urls.includes(norm(start.href))) urls.unshift(norm(start.href));
  if (urls.length > opt.max) { truncated = urls.length - opt.max; urls.length = opt.max; }
  const got = await pool(urls, 4, (u) => get(u));
  pages = got.map((r, k) => ({
    path: (() => { try { return new URL(r.url || urls[k]).pathname; } catch { return urls[k]; } })(),
    url: r.url || urls[k],
    status: r.status,
    robots: r.robots,
    html: /html/i.test(r.type) || /<html|<head|<body/i.test(r.body.slice(0, 2000)) ? r.body : "",
    error: r.error,
  }));
  pageSource = `${pages.length} page${pages.length === 1 ? "" : "s"} from ${pageSource}`;
}
if (truncated) pageSource += ` (${truncated} more left out by --max ${opt.max})`;

const ok = pages.filter((p) => p.status === 200 && p.html);
const notOk = pages.filter((p) => !(p.status === 200 && p.html));
const allHtml = ok.map((p) => p.html).join("\n");

// ---------- what the pages carry ----------
const scriptTags = (html) => [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]);
for (const p of ok) {
  const scripts = scriptTags(p.html);
  p.ids = [...new Set(scripts.flatMap((s) => [...s.matchAll(/\bGTM-[A-Z0-9]{4,}\b/g)].map((m) => m[0])))];
  p.ns = [...new Set([...p.html.matchAll(/ns\.html\?id=(GTM-[A-Z0-9]+)/gi)].map((m) => m[1].toUpperCase()))];
  p.gtag = [...new Set([...p.html.matchAll(/gtag\/js\?id=(G-[A-Z0-9]+)/gi)].map((m) => m[1].toUpperCase()))];
  p.forms = [...p.html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
    .filter((m) => !/role\s*=\s*["']search|action\s*=\s*["'][^"']*search/i.test(m[1]))
    .filter((m) => [...m[2].matchAll(/<(input|textarea|select)\b[^>]*>/gi)].some((f) => !/type\s*=\s*["']?(hidden|submit|button|search)/i.test(f[0]) && !/name\s*=\s*["']?(q|s|search)["'\s>]/i.test(f[0])))
    .map((m) => m[0]);
  p.tel = /href\s*=\s*["']tel:/i.test(p.html);
  p.mailto = /href\s*=\s*["']mailto:/i.test(p.html);
  p.noindex = /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(p.html)
    || /<meta\b[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots/i.test(p.html)
    || /noindex/i.test(p.robots);
  p.inline = scripts.filter((s) => !/\bsrc\s*=/i.test(s.slice(0, s.indexOf(">")))).join("\n");
  p.srcs = scripts.map((s) => (/\bsrc\s*=\s*["']([^"']+)["']/i.exec(s.slice(0, s.indexOf(">") + 1)) || [])[1]).filter(Boolean);
}

// The site's own script files, where form handlers usually push their events.
const ownScripts = [];
{
  const seen = new Set();
  for (const p of ok) for (const s of p.srcs) {
    if (seen.size >= 10) break;
    if (opt.dir) {
      if (/^(https?:)?\/\//i.test(s)) continue;
      const clean = s.split(/[?#]/)[0];
      const f = clean.startsWith("/") ? path.join(path.resolve(opt.dir), clean) : path.resolve(path.dirname(p.file), clean);
      if (!seen.has(f) && fs.existsSync(f)) { seen.add(f); ownScripts.push(fs.readFileSync(f, "utf8")); }
    } else {
      let u; try { u = new URL(s, p.url); } catch { continue; }
      if (u.origin !== new URL(p.url).origin || seen.has(u.href)) continue;
      seen.add(u.href);
    }
  }
  if (!opt.dir) {
    const got = await pool([...seen], 4, (u) => get(u));
    for (const r of got) if (r.status === 200) ownScripts.push(r.body);
  }
}
const pageCode = ok.map((p) => p.inline).join("\n") + "\n" + ownScripts.join("\n");
const pushedEvents = new Set();
for (const m of pageCode.matchAll(/dataLayer\.push\(\s*\{[^}]*?["']?event["']?\s*:\s*["']([\w.-]+)["']/g)) pushedEvents.add(m[1]);
for (const m of pageCode.matchAll(/gtag\(\s*["']event["']\s*,\s*["']([\w.-]+)["']\s*[,)]/g)) pushedEvents.add(m[1]);

// ---------- the container ----------
const byId = {};
for (const p of ok) for (const id of p.ids) (byId[id] ||= []).push(p.path);
const ids = Object.keys(byId).sort((a, b) => byId[b].length - byId[a].length);
const gtmId = opt.gtm || ids[0] || "";

function parseGtm(js) {
  const i = js.indexOf("var data = ");
  if (i < 0) return null;
  const c = js.slice(i + 11);
  let depth = 0, end = 0, inStr = false, esc = false;
  for (let k = 0; k < c.length; k++) {
    const h = c[k];
    if (inStr) { if (esc) esc = false; else if (h === "\\") esc = true; else if (h === '"') inStr = false; continue; }
    if (h === '"') inStr = true;
    else if (h === "{") depth++;
    else if (h === "}") { depth--; if (!depth) { end = k + 1; break; } }
  }
  try { return JSON.parse(c.slice(0, end)).resource || null; } catch { return null; }
}

let container = null, containerSource = "", containerStatus = 0;
if (opt.container) {
  containerSource = `saved copy ${opt.container}`;
  if (fs.existsSync(opt.container)) container = parseGtm(fs.readFileSync(opt.container, "utf8"));
} else if (gtmId) {
  const r = await get(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`);
  containerStatus = r.status;
  containerSource = `published container from googletagmanager.com (status ${r.status || r.error})`;
  if (r.status === 200) container = parseGtm(r.body);
}

const C = container || { macros: [], tags: [], predicates: [], rules: [] };
for (const k of ["macros", "tags", "predicates", "rules"]) C[k] ||= [];
const resolve = (v) => {
  if (Array.isArray(v) && v[0] === "macro") { const m = C.macros[v[1]]; return m && m.function === "__c" ? String(m.vtp_value ?? "") : `{{variable ${v[1]}}}`; }
  return typeof v === "string" ? v : "";
};
const flat = (v) => {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return "";
  if (v[0] === "macro") return resolve(v);
  if (v[0] === "escape") return flat(v[1]);
  return v.slice(v[0] === "template" || v[0] === "list" ? 1 : 0).map(flat).join("");
};
const settings = (t) => {
  const out = {};
  const walk = (v) => {
    if (!Array.isArray(v)) return;
    if (v[0] === "map") {
      const o = {};
      for (let k = 1; k + 1 < v.length; k += 2) o[v[k]] = v[k + 1];
      if (o.parameter) out[o.parameter] = resolve(o.parameterValue);
    }
    v.forEach(walk);
  };
  walk(t.vtp_configSettingsTable);
  return out;
};

// When each tag fires: the events and conditions on its triggers.
const eventMacros = new Set(C.macros.map((m, i) => (m.function === "__e" ? i : -1)).filter((i) => i >= 0));
// A link click trigger often keeps its tel: or mailto: condition on its listener (the "enable when"
// part), and the tag reaches that listener through the trigger id in gtm.triggers. Follow that link.
const triggerMacros = new Set(C.macros.map((m, i) => (m.function === "__v" && m.vtp_name === "gtm.triggers" ? i : -1)).filter((i) => i >= 0));
const preds = C.predicates.map((p) => {
  const onMacro = (set) => Array.isArray(p.arg0) && p.arg0[0] === "macro" && set.has(p.arg0[1]);
  const val = String(p.arg1 ?? "");
  return { onEvent: onMacro(eventMacros), triggerIds: onMacro(triggerMacros) ? val.match(/\d+_\d+/g) || [] : [], fn: p.function, val };
});
const ruleParts = C.rules.map((r) => {
  const ifs = (r.find((x) => x[0] === "if") || []).slice(1).map((i) => preds[i]).filter(Boolean);
  return {
    ifs,
    adds: (r.find((x) => x[0] === "add") || []).slice(1),
    tel: ifs.some((p) => !p.onEvent && /tel:/i.test(p.val)),
    mailto: ifs.some((p) => !p.onEvent && /mailto:/i.test(p.val)),
  };
});
const listener = {};
for (const r of ruleParts) for (const t of r.adds) {
  const id = C.tags[t]?.vtp_uniqueTriggerId;
  if (!id) continue;
  listener[id] ||= { tel: false, mailto: false };
  listener[id].tel ||= r.tel;
  listener[id].mailto ||= r.mailto;
}
const fires = C.tags.map(() => []);
for (const r of ruleParts) {
  const events = r.ifs.filter((p) => p.onEvent).map((p) => (p.fn === "_eq" ? p.val : `/${p.val}/`));
  const via = r.ifs.flatMap((p) => p.triggerIds).map((id) => listener[id]).filter(Boolean);
  const tel = r.tel || via.some((l) => l.tel);
  const mailto = r.mailto || via.some((l) => l.mailto);
  for (const t of r.adds) if (fires[t]) fires[t].push({ events, tel, mailto });
}
const customEvents = new Set(fires.flat().flatMap((f) => f.events).filter((e) => !e.startsWith("gtm.") && !e.startsWith("/")));

// GA4 events the container sends: GA4 event tags, and gtag("event", ...) calls in custom HTML tags.
const ga4Events = [];
C.tags.forEach((t, i) => {
  if (t.function === "__gaawe") ga4Events.push({ i, name: resolve(t.vtp_eventName) || "(unnamed)" });
  if (t.function === "__html") for (const m of flat(t.vtp_html).matchAll(/gtag\(\s*["']event["']\s*,\s*["']([\w.-]+)["']\s*[,)]/g)) ga4Events.push({ i, name: m[1] });
});
const googleTags = {};
C.tags.forEach((t) => {
  let id = "";
  if (t.function === "__googtag") id = resolve(t.vtp_tagId);
  if (t.function === "__gaawc") id = resolve(t.vtp_measurementId);
  if (id) googleTags[id] = (googleTags[id] || 0) + 1;
  if (t.function === "__html") for (const m of flat(t.vtp_html).matchAll(/gtag\(\s*["']config["']\s*,\s*["'](G-[A-Z0-9]+)["']/g)) googleTags[m[1]] = (googleTags[m[1]] || 0) + 1;
});
const mids = [...new Set((JSON.stringify(C).match(/\bG-[A-Z0-9]{6,12}\b/g) || []))];
const describe = (e) => `${e.name} on ${fires[e.i].flatMap((f) => f.events).join(" or ") || "no trigger"}`;

// ---------- Phase 1: tags are on every page ----------
const noScript = ok.filter((p) => !p.ids.length).map((p) => p.path);
const noNs = ok.filter((p) => p.ids.length && !p.ns.length).map((p) => p.path);
add("1.1", 1, !ok.length ? "FAIL" : noScript.length ? "FAIL" : noNs.length ? "WARN" : "PASS",
  "The container loads on every page, as a script and as a noscript fallback",
  !ok.length ? `no page could be read${notOk[0] ? ` (${notOk[0].path}: ${notOk[0].status || notOk[0].error})` : ""}`
    : [`${ok.length} page${ok.length === 1 ? "" : "s"} checked`,
      noScript.length && `no container script on ${noScript.length}: ${list(noScript)}`,
      noNs.length && `no noscript fallback on ${noNs.length}: ${list(noNs)}`,
      notOk.length && `${notOk.length} did not answer 200 and were not checked: ${list(notOk.map((p) => `${p.path} ${p.status || p.error}`))}`].filter(Boolean).join("; "));

const placeholder = (id) => /X{3,}|0{6,}|1234567/i.test(id.slice(4));
const fake = ids.filter(placeholder);
add("1.2", 1, !ids.length ? "FAIL" : fake.length ? "FAIL" : "PASS", "The container id is a real id, not a placeholder such as GTM-XXXXXXX",
  !ids.length ? "no container id on any page" : fake.length ? `placeholder id on the pages: ${fake.join(", ")}` : ids.join(", "));

const twoOnOnePage = ok.filter((p) => p.ids.length > 1).map((p) => `${p.path} (${p.ids.join(" + ")})`);
const wrongNs = ok.filter((p) => p.ns.length && p.ids.length && p.ns.some((n) => !p.ids.includes(n))).map((p) => p.path);
add("1.3", 1, ids.length > 1 || (opt.gtm && !byId[opt.gtm]) ? "FAIL" : wrongNs.length ? "WARN" : ids.length ? "PASS" : "SKIP",
  `Only one Tag Manager container loads${opt.gtm ? `, and it is ${opt.gtm}` : ""}`,
  ids.length > 1 ? `${ids.length} containers: ${ids.map((id) => `${id} on ${byId[id].length} page(s)`).join(", ")}${twoOnOnePage.length ? `; two on one page: ${list(twoOnOnePage, 3)}` : ""}. A leftover container sends visits to a property nobody reads`
    : opt.gtm && !byId[opt.gtm] ? `the pages load ${ids.join(", ") || "no container"}, not ${opt.gtm}`
    : wrongNs.length ? `the noscript fallback names a different container on: ${list(wrongNs)}` : ids[0] || "no container");

add("1.4", 1, !gtmId && !opt.container ? "SKIP" : container ? "PASS" : "FAIL", "The container is published and can be read",
  container ? `${gtmId || "container"} version ${C.version || "?"}, ${C.tags.length} tags; read from the ${containerSource}`
    : !gtmId && !opt.container ? "no container id to read" : `could not read it: ${containerSource}${containerStatus === 404 ? ". A 404 means nothing has been published in this container" : ""}`);

const gtagPages = ok.filter((p) => p.gtag.length);
const dupGtag = gtagPages.filter((p) => p.gtag.some((g) => mids.includes(g)));
add("1.5", 1, dupGtag.length ? "FAIL" : gtagPages.length ? "WARN" : "PASS", "No hard-coded Google tag sends to the same measurement id beside the container",
  dupGtag.length ? `gtag.js for ${[...new Set(dupGtag.flatMap((p) => p.gtag))].join(", ")} loads beside the container on ${dupGtag.length} page(s): ${list(dupGtag.map((p) => p.path))}. Every page view on them counts twice`
    : gtagPages.length ? `gtag.js for ${[...new Set(gtagPages.flatMap((p) => p.gtag))].join(", ")} also loads on ${gtagPages.length} page(s): ${list(gtagPages.map((p) => p.path))}. Make sure that property is meant to get the data`
    : "none found");

add("1.6", 1, !container ? "SKIP" : !mids.length ? "FAIL" : opt.mid ? (!mids.includes(opt.mid) ? "FAIL" : mids.length > 1 ? "WARN" : "PASS") : mids.length > 1 ? "WARN" : "MANUAL",
  "The measurement id in the container matches the data stream of the property the business uses",
  !container ? "no container read" : !mids.length ? "the container sends to no GA4 measurement id"
    : opt.mid ? (!mids.includes(opt.mid) ? `the container sends to ${mids.join(", ")}, not ${opt.mid}` : mids.length > 1 ? `${opt.mid}, plus ${mids.filter((m) => m !== opt.mid).join(", ")}` : opt.mid)
    : mids.length > 1 ? `the container sends to ${mids.length} ids: ${mids.join(", ")}. Pass --mid with the right one`
    : `the container sends to ${mids[0]}. Compare it with the Measurement ID in GA4, Admin, Data streams, then pass --mid ${mids[0]}`);

if (opt.record) {
  const b = fs.existsSync(opt.record) ? fs.readFileSync(opt.record, "utf8") : "";
  const need = [...new Set([gtmId, ...(opt.mid ? [opt.mid] : mids)].filter(Boolean))];
  const miss = need.filter((x) => !b.includes(x));
  add("1.7", 1, !b ? "FAIL" : miss.length ? "WARN" : "PASS", "The container id and measurement id are written down in a document the business keeps",
    !b ? `${opt.record} not found` : miss.length ? `missing from ${opt.record}: ${miss.join(", ")}` : `${need.join(", ")} in ${opt.record}`);
} else add("1.7", 1, "MANUAL", "The container id, measurement id, property and data stream are written down in a document the business keeps", "pass --record <file> to check the ids are in it");
add("1.8", 1, "MANUAL", "A fresh visit from a phone shows up in GA4 Realtime in the property the business uses", "open the site on a phone off the office wifi, then look in Reports, Realtime of that property");

// ---------- Phase 2: each event fires once ----------
const gtIds = Object.keys(googleTags);
const doubled = gtIds.filter((id) => googleTags[id] > 1);
add("2.1", 2, !container ? "SKIP" : doubled.length ? "WARN" : gtIds.length ? "PASS" : gtagPages.length ? "INFO" : "WARN",
  "The container has one Google tag per measurement id, so each page load sends one page view",
  !container ? "no container read" : doubled.length ? `${doubled.map((id) => `${id} has ${googleTags[id]} Google tags`).join(", ")}: each one sends a page view`
    : gtIds.length ? gtIds.join(", ") : gtagPages.length ? "no Google tag in the container; the pages load gtag.js directly" : "no Google tag in the container: GA4 gets no page views from it");

const formPages = ok.filter((p) => p.forms.length).map((p) => p.path);
const leadTags = ga4Events.filter((e) => e.name === opt.leadEvent || /lead|submit|quote|estimate|contact|booked/i.test(e.name));
const onFormSubmit = leadTags.filter((e) => fires[e.i].some((f) => f.events.includes("gtm.formSubmit")));
add("2.2", 2, !formPages.length ? "SKIP" : !container ? "FAIL" : !leadTags.length ? "FAIL" : onFormSubmit.length ? "FAIL" : "PASS",
  `The lead event (${opt.leadEvent}) fires on a confirmed send, never on Tag Manager's form submission trigger`,
  !formPages.length ? "no forms on the checked pages" : !container ? "no container read" : !leadTags.length ? `forms on ${list(formPages)}, but the container sends no lead event`
    : onFormSubmit.length ? `${onFormSubmit.map((e) => e.name).join(", ")} fires on gtm.formSubmit, which counts button presses, failed validation and sends that never arrived. Fire it on an event the page pushes after the send succeeds`
    : leadTags.map(describe).join("; "));

const pushedLead = [...pushedEvents].filter((e) => !customEvents.has(e) && /sent|lead|submit|error|success|quote|estimate|contact|booked/i.test(e));
const notPushed = [...customEvents].filter((e) => !pushedEvents.has(e));
add("2.3", 2, !container || (!pushedEvents.size && !customEvents.size) ? "SKIP" : pushedLead.length ? "FAIL" : notPushed.length ? "WARN" : "PASS",
  "The events the pages push and the events the container waits for match",
  !container ? "no container read" : !pushedEvents.size && !customEvents.size ? "no custom events on either side"
    : [pushedLead.length && `pages push ${pushedLead.join(", ")}, but no trigger in the container listens for ${pushedLead.length === 1 ? "it" : "them"}`,
      notPushed.length && `the container waits for ${notPushed.join(", ")}, but nothing on the checked pages pushes ${notPushed.length === 1 ? "it" : "them"}`].filter(Boolean).join("; ") || [...customEvents].join(", "));

const thanks = ok.filter((p) => /thank|success|confirmation/i.test(p.path));
const thankIssues = thanks.map((p) => {
  const slug = p.path.replace(/\/$/, "").replace(/\.html?$/i, "").split("/").pop();
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linkRe = new RegExp(`href\\s*=\\s*["'][^"']*/?${esc}(\\.html?|/)?["']`, "i");
  const inSitemap = sitemapUrls.some((u) => { try { return new URL(u).pathname.replace(/\/$/, "").replace(/\.html?$/i, "").endsWith(slug); } catch { return false; } });
  const linked = ok.filter((o) => o !== p && linkRe.test(o.html)).map((o) => o.path);
  const why = [!p.noindex && "no noindex", inSitemap && "listed in the sitemap", linked.length && `linked from ${list(linked, 3)}`].filter(Boolean);
  return why.length ? `${p.path}: ${why.join(", ")}` : "";
}).filter(Boolean);
add("2.4", 2, !thanks.length ? "SKIP" : thankIssues.length ? "WARN" : "PASS",
  "A thank-you page cannot be reached without a send: noindex, out of the sitemap, not linked",
  !thanks.length ? "no thank-you page among the checked pages" : thankIssues.length ? `${thankIssues.join("; ")}. Visits that never sent anything can land there and count as leads` : thanks.map((p) => p.path).join(", "));

const telPages = ok.filter((p) => p.tel).map((p) => p.path);
const phoneTags = ga4Events.filter((e) => fires[e.i].some((f) => f.tel && f.events.some((x) => /gtm\.(linkClick|click)/.test(x))));
add("2.5", 2, !telPages.length ? "SKIP" : !container || !phoneTags.length ? "FAIL" : "PASS", `A tap on a phone link sends a GA4 event (${opt.phoneEvent})`,
  !telPages.length ? "no tel: links on the checked pages" : !container ? "no container read" : !phoneTags.length ? `tel: links on ${telPages.length} page(s), but no tag fires on a tel: click: phone taps are not counted`
    : phoneTags.map((e) => e.name + (e.name === opt.phoneEvent ? "" : ` (named differently from ${opt.phoneEvent}; fine if the key event uses this name)`)).join(", "));

const mailPages = ok.filter((p) => p.mailto).map((p) => p.path);
const emailTags = ga4Events.filter((e) => fires[e.i].some((f) => f.mailto && f.events.some((x) => /gtm\.(linkClick|click)/.test(x))));
add("2.6", 2, !mailPages.length ? "SKIP" : !container || !emailTags.length ? "WARN" : "PASS", `A tap on an email link sends a GA4 event (${opt.emailEvent})`,
  !mailPages.length ? "no mailto: links on the checked pages" : !container ? "no container read" : !emailTags.length ? `mailto: links on ${mailPages.length} page(s), but no tag fires on a mailto: click. Fine only if email is not a lead channel`
    : emailTags.map((e) => e.name).join(", "));
add("2.7", 2, "MANUAL", "In Tag Assistant preview, one page load sends one page view, a good send fires the lead event once, and a send that fails validation fires none", "Tag Assistant (tagassistant.google.com), then the same actions in GA4 DebugView");
add("2.8", 2, "MANUAL", "GA4's enhanced measurement form interactions are off, or their events are kept out of the lead count", "GA4, Admin, Data streams, the web stream, Enhanced measurement, Form interactions");

// ---------- Phase 3: key events ----------
const sent = [...new Set(ga4Events.map((e) => e.name))];
add("3.1", 3, !container ? "SKIP" : "INFO", "Events this container sends to GA4", sent.join(", ") || "none");
add("3.2", 3, "MANUAL", `${opt.leadEvent} and ${opt.phoneEvent} are marked as key events (and ${opt.emailEvent} if email is a lead channel), no page view or scroll event is, and the date they were marked is written down`, "GA4, Admin, Events (key events). Marking does not apply to earlier data");

// ---------- Phase 4: a real lead end to end ----------
add("4.1", 4, "MANUAL", "A test lead sent from a phone reaches the inbox or CRM, shows as the lead event in Realtime, and a real tap on the phone link shows as the phone event", "tell the office first, then mark or delete the test lead so it never reaches a report");

// ---------- Phase 5: the source reaches the lead record ----------
const sourceField = /<input\b[^>]*type\s*=\s*["']?hidden[^>]*name\s*=\s*["']?[^"'\s>]*(gclid|utm_|landing|referr|source)/i;
const sourceField2 = /<input\b[^>]*name\s*=\s*["']?[^"'\s>]*(gclid|utm_|landing|referr|source)[^>]*type\s*=\s*["']?hidden/i;
const formsNoSource = ok.flatMap((p) => p.forms.filter((f) => !sourceField.test(f) && !sourceField2.test(f)).map(() => p.path));
const runtimeHint = /gclid/i.test(pageCode + JSON.stringify(C)) && /createElement\(\s*["']input|type\s*=\s*["']hidden|\.type\s*=\s*["']hidden|querySelectorAll?\(\s*["']form/i.test(pageCode + flat(C.tags.map((t) => t.vtp_html || "")));
add("5.1", 5, !formPages.length ? "SKIP" : !formsNoSource.length ? "PASS" : runtimeHint ? "INFO" : "WARN",
  "Every form carries hidden fields for the click id, the UTM values, the landing page and the referrer",
  !formPages.length ? "no forms on the checked pages" : !formsNoSource.length ? `forms on ${list(formPages)}`
    : runtimeHint ? `no hidden source fields in the HTML of ${list([...new Set(formsNoSource)])}, but a script appears to add them while the page runs. The test in 5.2 proves it either way`
    : `no hidden source fields in the forms on ${list([...new Set(formsNoSource)])}: a lead arrives with no record of where it came from`);
add("5.2", 5, "MANUAL", "Landing with ?gclid=TEST123&utm_source=test&utm_medium=cpc, moving to a second page and sending puts those values in fields on the lead record, and they survive a later visit", "phone leads need a source too: a tracking number or a required lead source field");

// ---------- Phase 6: consent ----------
const consentDefault = /gtag\(\s*["']consent["']\s*,\s*["']default["']/i.test(allHtml) || /consent_default|__cvt_[\w]*consent|"consentStorage/i.test(JSON.stringify(C));
const cmp = (allHtml.match(/cookiebot|onetrust|cookielaw|termly|iubenda|cookieyes|usercentrics|complianz|osano|klaro/gi) || []).map((x) => x.toLowerCase());
add("6.1", 6, "INFO", "Consent setup seen in the pages and the container", `consent default: ${consentDefault ? "set" : "none found"}; consent tool: ${[...new Set(cmp)].join(", ") || "none found"}`);
add("6.2", 6, "MANUAL", "Consent behaves as designed: the default before any choice, no GA4 or click id cookie after a rejection, the gated tags after acceptance, and the choice remembered", "Tag Assistant, Consent tab, and the browser's cookie list after each choice");

// ---------- Phase 7: the tagging server ----------
let serverUrl = "";
for (const t of C.tags) {
  const s = t.function === "__googtag" || t.function === "__gaawc" ? settings(t) : {};
  serverUrl ||= s.server_container_url || s.transport_url || resolve(t.vtp_serverContainerUrl) || resolve(t.vtp_transportUrl) || "";
  if (t.function === "__html") serverUrl ||= (/(?:server_container_url|transport_url)["']?\s*:\s*["'](https:\/\/[^"']+)["']/.exec(flat(t.vtp_html)) || [])[1] || "";
}
serverUrl = /^https?:\/\//.test(serverUrl) ? serverUrl.replace(/\/+$/, "") : "";
if (serverUrl) {
  const h = await get(`${serverUrl}/healthy`);
  add("7.1", 7, h.status === 200 ? "PASS" : "FAIL", "The tagging server answers its health check over HTTPS", `${serverUrl}/healthy answered ${h.status || h.error}`);
  add("7.2", 7, "MANUAL", "GA4 requests go to the tagging server and return 200, it sets the click id cookie, Safari keeps the expiry it set, and its events reach Realtime", "browser network panel, then a page load with ?gclid=TEST123, then the cookie in Safari");
} else add("7.1", 7, "SKIP", "Tagging server", !container ? "no container read" : "the container sends straight to Google; no tagging server configured");

// ---------- Phase 8: ad platforms ----------
const adsTags = C.tags.filter((t) => t.function === "__awct" || t.function === "__sp" || (t.function === "__html" && /AW-\d{6,}/.test(flat(t.vtp_html)))).length;
const linker = C.tags.some((t) => t.function === "__gclidw");
const adsOnPage = /gtag\/js\?id=AW-|['"]AW-\d{6,}/.test(allHtml);
const meta = /fbq\(|connect\.facebook\.net/.test(allHtml + flat(C.tags.map((t) => t.vtp_html || "")));
add("8.1", 8, !adsTags ? "SKIP" : linker ? "PASS" : "WARN", "Google Ads conversion tags have a Conversion Linker beside them",
  !adsTags ? (adsOnPage ? "Google Ads loads through gtag.js on the page, not the container" : "no Google Ads tags in the container") : linker ? `${adsTags} Ads tag(s) and a Conversion Linker` : `${adsTags} Ads tag(s) and no Conversion Linker: Ads clicks lose their click id`);
if (adsTags || adsOnPage || meta) add("8.2", 8, "MANUAL", "Every conversion action the business relies on records recent conversions with no warning, auto-tagging is on, and offline uploads have no unexplained rejected rows", `${[adsTags || adsOnPage ? "Google Ads, Goals, Conversions" : "", meta ? "Meta Events Manager: browser and server events share an event id" : ""].filter(Boolean).join("; ")}`);
else add("8.2", 8, "SKIP", "Ad platforms record conversions", "no Google Ads or Meta tags found");

// ---------- Phase 9: monthly ----------
add("9.1", 9, "INFO", "Run this again every month and keep the dated report", "site edits, plugin updates and rebuilt forms break tracking without warning");

// ---------- confirmations from the person running it ----------
const today = new Date().toISOString().slice(0, 10);
for (const c of checks) if (opt.confirmed.includes(c.id) && (c.status === "MANUAL" || c.status === "WARN")) { c.detail = `confirmed by hand on ${today}. ${c.detail}`; c.status = "PASS"; }

// ---------- report ----------
const order = { FAIL: 0, WARN: 1, MANUAL: 2, PASS: 3, INFO: 4, SKIP: 5 };
const byIdOrder = (a, b) => a.id.localeCompare(b.id, "en", { numeric: true });
checks.sort(byIdOrder);
const tally = checks.reduce((t, c) => ((t[c.status] = (t[c.status] || 0) + 1), t), {});
const verdict = tally.FAIL ? "NOT TRUSTWORTHY YET" : tally.WARN || tally.MANUAL ? "PASSES WHAT A SCRIPT CAN SEE, ITEMS LEFT TO CLOSE" : "PASSES";
const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const cell = (s) => String(s || "").replace(/\|/g, "/").replace(/\r?\n/g, " ");
const tallyLine = ["FAIL", "WARN", "MANUAL", "PASS", "INFO", "SKIP"].map((s) => `${s} ${tally[s] || 0}`).join(" | ");
const fixFirst = checks.filter((c) => c.status === "FAIL" || c.status === "WARN").sort((a, b) => order[a.status] - order[b.status] || byIdOrder(a, b));
const manual = checks.filter((c) => c.status === "MANUAL");
const md = [
  `# Tracking check: ${site}`,
  "",
  `**Verdict: ${verdict}.** ${when}. Container ${gtmId || "none"}${mids.length ? `, measurement id ${mids.join(", ")}` : ""}.`,
  "",
  tallyLine,
  "",
  `Checked ${pageSource}. Container: ${containerSource || "none read"}. ${requests.length ? `Requests sent: ${requests.length}, every one a GET.` : "Requests sent: none; everything was read from files."}`,
  "",
  `The ids follow the phases of the checklist at ${GUIDE}. A PASS means the script could see it in the pages or the container. MANUAL means only a person in the tool can check it.`,
  "",
  "## Fix first",
  "",
  ...(fixFirst.length ? fixFirst.map((c) => `- **${c.status} ${c.id}** ${c.title}: ${cell(c.detail)}`) : ["Nothing failed or needs a fix."]),
  "",
  "## Every check",
  "",
  "| Status | Id | Phase | Check | Detail |",
  "| --- | --- | --- | --- | --- |",
  ...checks.map((c) => `| ${c.status} | ${c.id} | ${PHASES[c.phase]} | ${cell(c.title)} | ${cell(c.detail)} |`),
  "",
  "## What only a person can check",
  "",
  ...(manual.length ? [...manual.map((c) => `- [ ] **${c.id}** ${c.title}. How: ${cell(c.detail)}. Result: _write it here_`), "", `When they are done, run the check again with \`--confirmed ${manual.map((c) => c.id).join(",")}\` and keep the report.`] : ["Nothing left."]),
  "",
];
const outDir = opt.out || path.join(process.cwd(), `tracking-check-${today}`);
fs.mkdirSync(outDir, { recursive: true });
const mdFile = path.join(outDir, "tracking-check.md");
fs.writeFileSync(mdFile, md.join("\n"));
fs.writeFileSync(path.join(outDir, "tracking-check.json"), JSON.stringify({
  tool: "tracking-check", version: VERSION, guide: GUIDE, site, when, pages: ok.length, pageSource,
  container: { id: gtmId, source: containerSource, version: C.version || null, measurementIds: mids, events: sent, taggingServer: serverUrl || null },
  verdict, tally, checks, requests: requests.map((url) => ({ method: "GET", url })),
}, null, 2) + "\n");

console.log(`Tracking check: ${site}  ${verdict}`);
console.log(tallyLine.replace(/ \| /g, "  "));
for (const c of fixFirst) console.log(`${c.status.padEnd(5)} ${c.id.padEnd(4)} ${c.title}  |  ${c.detail}`);
if (manual.length) console.log(`MANUAL ${manual.map((c) => c.id).join(", ")}: see the report`);
console.log(`\nwrote ${path.relative(process.cwd(), mdFile) || mdFile} and tracking-check.json`);
process.exit(tally.FAIL ? 1 : 0);
