// Writes the invented sample site. Riverbend Plumbing does not exist: the domain is on the reserved
// .example top-level domain, the phone number is in the 555-01xx range kept for fiction, and the
// container and measurement ids are made up. Run: node sample/build-site.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "site");
fs.mkdirSync(dir, { recursive: true });
const HOST = "https://www.riverbend-plumbing.example";
const head = (title, extra = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-SAMPLE1');</script>
<!-- End Google Tag Manager -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | Riverbend Plumbing</title>
${extra}</head>`;
const noscript = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-SAMPLE1" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;
const nav = `<nav><a href="/">Home</a> <a href="/services.html">Services</a> <a href="/about.html">About</a> <a href="/contact.html">Contact</a></nav>`;
const foot = `<footer><p>Call <a href="tel:+15555550142">(555) 555-0142</a> or email <a href="mailto:office@riverbend-plumbing.example">office@riverbend-plumbing.example</a></p></footer>`;

const pages = {
  "index.html": `${head("Plumbing repairs and water heaters")}
<body>
${noscript}
${nav}
<main><h1>Plumbing repairs, drains and water heaters</h1>
<p>Same-day repairs for leaks, clogged drains and water heaters that quit.</p>
<p><a href="/contact.html">Ask for a visit</a></p></main>
${foot}
</body>
</html>
`,
  // An old plugin left a hard-coded Google tag on this page, sending to the same measurement id as the container.
  "services.html": `${head("Services", `<script async src="https://www.googletagmanager.com/gtag/js?id=G-SAMPLE0001"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-SAMPLE0001');</script>
`)}
<body>
${noscript}
${nav}
<main><h1>Services</h1><ul><li>Leak repair</li><li>Drain cleaning</li><li>Water heater replacement</li></ul></main>
${foot}
</body>
</html>
`,
  // A leftover test container from the first build still loads here, and the noscript fallback was dropped.
  "about.html": `${head("About", `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-TESTOLD');</script>
`)}
<body>
${nav}
<main><h1>About Riverbend Plumbing</h1><p>A small crew of licensed plumbers.</p></main>
${foot}
</body>
</html>
`,
  // The form pushes form_sent only after the server confirms the send. It has no hidden source fields.
  "contact.html": `${head("Contact")}
<body>
${noscript}
${nav}
<main><h1>Ask for a visit</h1>
<form id="visit" action="/api/visit" method="post">
  <label>Name <input name="name" required></label>
  <label>Phone <input name="phone" type="tel" required></label>
  <label>What is going on? <textarea name="message"></textarea></label>
  <button type="submit">Send</button>
</form>
<p id="status" hidden>Thanks, I will call you back today.</p></main>
${foot}
<script src="/js/form.js"></script>
</body>
</html>
`,
  // Listed in the sitemap and missing noindex, so a visit that never sent anything can land here.
  "thank-you.html": `${head("Thank you")}
<body>
${noscript}
${nav}
<main><h1>Thank you</h1><p>Your request is in.</p></main>
${foot}
</body>
</html>
`,
};
for (const [f, html] of Object.entries(pages)) fs.writeFileSync(path.join(dir, f), html);
fs.mkdirSync(path.join(dir, "js"), { recursive: true });
fs.writeFileSync(path.join(dir, "js", "form.js"), `// Sends the form, then tells Tag Manager only when the server confirms it arrived.
document.getElementById("visit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch(e.target.action, { method: "POST", body: new FormData(e.target) });
  if (r.ok) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "form_sent" });
    document.getElementById("status").hidden = false;
  }
});
`);
fs.writeFileSync(path.join(dir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", "/services.html", "/about.html", "/contact.html", "/thank-you.html"].map((p) => `  <url><loc>${HOST}${p}</loc></url>`).join("\n")}
</urlset>
`);
console.log(`wrote ${Object.keys(pages).length} pages, js/form.js and sitemap.xml to sample/site`);
