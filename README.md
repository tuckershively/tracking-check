# tracking-check

A tag that fires, a green tick in a tool, or a server that answers with a 200 proves nothing on its own. Tracking works when the data has landed where it was supposed to go and someone has looked at it there. I check every tracking setup I touch against one checklist, and this repository is that checklist written down as a script.

The checklist is a guide on my site: [Checklist: verify a tracking setup before you trust it](https://tuckershively.com/docs/tracking/tracking-verification-checklist/). Everything below works by hand first. The script runs the same steps the same way every time, so none of them gets skipped.

## What it checks

Point it at a website, or at a folder of saved pages. It reads every page in the sitemap and the published Google Tag Manager container, then reports on the checklist's nine phases:

- **Phase 1, tags on every page.** The container loads on every page as a script and as a noscript fallback. The id is real, not a placeholder. Only one container loads, and no hard-coded Google tag sends to the same GA4 property beside it. The measurement id in the container is the one you expect, and it is written down where the business keeps its records.
- **Phase 2, each event fires once.** There is one Google tag per measurement id, so a page load sends one page view. The lead event fires on a confirmed send, never on Tag Manager's form submission trigger. The events the pages push match the events the container listens for. A thank-you page is out of search and the sitemap. Phone and email taps each send an event.
- **Phase 3, key events.** The events the container actually sends to GA4, so you know which ones to mark.
- **Phase 5, the source on the lead.** Every form carries hidden fields for the click id, the UTM values, the landing page and the referrer.
- **Phase 6, consent.** Whether a consent default and a consent tool are present.
- **Phase 7, the tagging server.** If the container sends through your own tagging server, that server answers its health check.
- **Phase 8, ad platforms.** Google Ads conversion tags have a Conversion Linker beside them.

Phase 4, a real lead sent end to end, and Phase 9, the monthly re-check, are work for a person, and so are some items in the other phases. They can only be checked inside GA4, Tag Assistant, the CRM or an ad account: Realtime, DebugView, key event settings, a real test lead, consent behaviour, Safari cookies, conversion status. The script does not pretend to see those. It lists them as MANUAL, with where to look, so the report is the whole checklist and not only the part a script can read.

## How to do the same check by hand

Do this after any tracking setup or change, and again every month. Keep these open: Tag Assistant, GA4 Realtime and DebugView for the property the business uses, the CRM, the ad accounts, your browser's developer tools, and a real phone. Write down the date and the result of each pass, so the next person knows what working looked like.

One failure I look for every time: a site still loading a leftover test container that sends every visit to a test property, while the real property shows nothing for months. Every tag in that setup fires perfectly. Only looking inside the property that is supposed to get the data shows it.

**Phase 1: the tags are on every page.**
- View the source of every page, including landing pages, the thank-you page and anything added since launch. The container id should appear twice: once in the script in the head, once in the noscript iframe after the body tag opens.
- Make sure the id is a real one, not `GTM-XXXXXXX` left over from a template.
- Search the source for a second container id and for `gtag/js?id=G-`. Only one container should load, and no plugin or hard-coded tag should send to the same measurement id.
- In Tag Manager, open the Google tag and compare its measurement id with the data stream in GA4 (Admin, Data streams). They have to match the property the business actually uses.
- Write the container id, measurement id, property and data stream into a document the business keeps.
- Open the site on a phone, off the office wifi, and watch it arrive in GA4 Realtime in that property.

**Phase 2: each event fires once.**
- In Tag Assistant preview, load a page. It should send one GA4 page view, not two.
- Send the form properly. The lead event (`generate_lead`) should fire exactly once.
- Send it with a required field empty. No lead event should fire.
- If the lead event fires on a thank-you page, that page must be impossible to reach without sending, kept out of navigation, and marked noindex.
- Tap the phone link: `phone_click` fires once. Tap the email link: `email_click` fires once.
- In GA4, check that enhanced measurement's form interactions are off, or that their events stay out of the lead count.
- Repeat the same actions with DebugView open and confirm the same single events, with the parameters you expect.

**Phase 3: key events are marked.**
- In GA4 (Admin, Events), mark `generate_lead` and `phone_click` as key events, and `email_click` if email is a real lead channel.
- Make sure no page view, scroll or engagement event is marked.
- Write down the date you marked them. Marking does not apply to data from before that day.
- In Google Ads, check every conversion action is primary or secondary as intended, and that lead actions count one conversion per click.

**Phase 4: a real lead goes through end to end.**
- Tell the office a test is coming.
- On a phone, from a page other than the landing page, send the form. It should arrive wherever the business gets leads: the inbox, the CRM, or both. If the business gets a text for each new lead, that should arrive too.
- Check the form handler keeps its own copy of every submission, so a lead survives a bounced email.
- Watch the test show up as `generate_lead` in GA4 Realtime.
- Outside preview mode, tap the phone link on a real phone and watch `phone_click` arrive in Realtime.
- Mark or delete the test lead so it never reaches a report or an upload.

**Phase 5: the source reaches the lead record.**
- Land on the site with test values in the address, such as `?gclid=TEST123&utm_source=test&utm_medium=cpc`, click to a second page, then send the form. The lead record should carry those exact values, plus the landing page and the referrer.
- Close the browser, come back later without the test values, and send again. The original source should still be there.
- The values must land in fields on the CRM record, not only in the notification email.
- Phone leads need a source too: a tracking number, or a required lead source field in the CRM.

**Phase 6: consent behaves as designed.**
- Before making any choice, Tag Assistant's Consent tab should show the intended default for every signal.
- Reject. No GA4 cookie and no click id cookie should be written, and the gated tags should not fire.
- Accept. The update should show as granted, and the gated tags and cookies should appear.
- The choice should hold across pages and visits, and the visitor should be able to reopen it.
- Cookies written by a tagging server should follow the same consent state as the browser.

**Phase 7: the tagging server is healthy (if there is one).**
- Its health endpoint should return 200, and an uptime monitor should alert when it stops.
- The certificate on the tagging subdomain should be valid and set to renew.
- In the browser's network panel, GA4 requests should go to the tagging subdomain, not straight to Google, and return 200.
- Load a page with a test click id. The tagging server's response should set the click id cookie, and in Safari that cookie should keep the expiry the server set, not seven days.
- Events sent through the tagging server should show up in GA4 Realtime. The health check proves the server is running. Only Realtime proves it is doing its job.

**Phase 8: the ad platforms are recording conversions.**
- Every Google Ads conversion action the business relies on should be recording recent conversions with no warning in its status or diagnostics.
- Auto-tagging should be on, and recent Google Ads visits should show in GA4 under a paid channel, not as organic or direct.
- The latest offline conversion upload should have no rejected rows, or a known cause for each.
- For Meta, Events Manager should show the expected events arriving, and events sent from both the browser and the server should share an event id so each counts once.

**Phase 9: the monthly re-check.**
- Run a fresh test lead and a phone tap end to end, and confirm both reach Realtime and the CRM with the source attached.
- Compare the month's GA4 lead events, CRM leads and ad platform conversions. They should be in the same range, and a large gap needs an explanation.
- Read the container's version history for changes nobody can account for.
- Check pages added or rebuilt during the month for the container snippets and the hidden form fields.
- Check the tagging server's uptime history and the Safari cookie expiry again.
- Write down the date and the result of the pass.

Site edits, plugin updates, rebuilt forms and browser changes break tracking without any warning. A monthly pass finds the break within weeks, not months later when someone asks why the leads dried up.

## How to run the script

You need [Node.js](https://nodejs.org/) 18 or newer. There is nothing to install: no dependencies, no account, no API key.

```bash
git clone https://github.com/tuckershively/tracking-check.git
cd tracking-check
node tracking-check.mjs https://example.com
```

Tell it what the setup should be, and it checks against that instead of trusting what it finds:

```bash
node tracking-check.mjs https://example.com --gtm GTM-XXXXXXX --mid G-XXXXXXXXXX --record tracking-records.md
```

| Option | What it does |
| --- | --- |
| `--gtm GTM-...` | The container the site should load. Without it, the script uses the one the pages load. |
| `--mid G-...` | The measurement id of the GA4 data stream the business uses. |
| `--record <file>` | The document the business keeps its ids in. The script checks every id is written there. |
| `--dir <folder>` | Check saved pages in a folder instead of a live site. A `sitemap.xml` in the folder is read too. |
| `--container <file>` | Read a saved copy of the container's `gtm.js` instead of the published one. |
| `--lead-event`, `--phone-event`, `--email-event` | Event names, if yours differ from `generate_lead`, `phone_click` and `email_click`. |
| `--max <n>` | The most pages to check. The default is 60. |
| `--confirmed 1.8,3.2` | Items you checked by hand this run. They report as PASS, marked as confirmed by hand with the date. |
| `--out <folder>` | Where the report goes. The default is `tracking-check-<date>` in the current folder. |

To see a run without touching any real site, use the sample in this repository:

```bash
npm test
```

The sample is an invented plumbing business on a reserved `.example` domain, built with the faults I see most often: a leftover test container on one page, a hard-coded Google tag beside the container, a missing noscript fallback, a thank-you page in the sitemap, email links with no event, and a form with no source fields. `sample/report/` holds the report the script writes from it, and the test checks the script still catches every one of those faults. `npm run sample` writes that report again.

## How to read the report

The script writes `tracking-check.md`, for reading, and `tracking-check.json`, for keeping or comparing month to month. It prints the same summary in the terminal, and exits with 1 when anything FAILs, so it can run on a schedule.

The verdict comes first: **NOT TRUSTWORTHY YET** when something FAILs, **PASSES WHAT A SCRIPT CAN SEE, ITEMS LEFT TO CLOSE** when only warnings or manual items remain, **PASSES** when nothing is left. Below it, "Fix first" lists the failures and warnings, the full table follows, and the report ends with the manual checklist to fill in.

| Status | What it means |
| --- | --- |
| FAIL | The data is wrong or missing. Fix it before trusting any number from this setup. |
| WARN | Probably wrong, or right only in a case the script cannot confirm. Read the detail and decide. |
| MANUAL | Only a person inside the tool can check this. The detail says where to look. |
| PASS | The script could see it in the pages or the container, and it is right. |
| INFO | A fact worth knowing, such as the events the container sends. Nothing to fix. |
| SKIP | Does not apply to this site: no forms, no tagging server, no ad tags. |

The ids follow the guide's phases, so `2.2` is the second check in Phase 2. When a check reads WARN or FAIL and you know why, the detail line says what to change. When you have done the manual items, run it again with `--confirmed` and the ids, and keep the dated report. That report is the record of what working looked like.

A PASS from the script is not the end of the job. It proves the pages and the container are built right. Only the manual items prove the data arrived.

## What it never does

- **It only reads.** Every request is a GET, and the report lists every one it sent. It never submits a form, clicks a link, signs in, or changes a site, a container, a property or an ad account.
- **It never needs a key.** No API key, password or account, on any path. What only an account can see is left to you, as MANUAL items.
- **It never sends your data anywhere.** It fetches the site's own pages, the site's own scripts, the container from Google's public address and, if the container names one, the tagging server's health check. The report stays on your machine.
- **It never guesses.** When it cannot see something, it says so instead of passing it.
- **It never installs anything.** One file, no dependencies.

## Contributing

Issues and pull requests are welcome. Before your first commit, turn on the secret scan that runs on every commit:

```bash
npm run hooks
```

`npm run scan` runs the same scan over the whole folder at any time.

## License

MIT. See [LICENSE](LICENSE).
