# Tracking check: www.riverbend-plumbing.example

**Verdict: NOT TRUSTWORTHY YET.** 2026-11-02 12:08 UTC. Container GTM-SAMPLE1, measurement id G-SAMPLE0001.

FAIL 2 | WARN 4 | MANUAL 7 | PASS 8 | INFO 3 | SKIP 3

Checked 5 saved pages in sample/site. Container: saved copy sample/gtm.js. Requests sent: none; everything was read from files.

The ids follow the phases of the checklist at https://tuckershively.com/docs/tracking/tracking-verification-checklist/. A PASS means the script could see it in the pages or the container. MANUAL means only a person in the tool can check it.

## Fix first

- **FAIL 1.3** Only one Tag Manager container loads, and it is GTM-SAMPLE1: 2 containers: GTM-SAMPLE1 on 5 page(s), GTM-TESTOLD on 1 page(s); two on one page: /about.html (GTM-SAMPLE1 + GTM-TESTOLD). A leftover container sends visits to a property nobody reads
- **FAIL 1.5** No hard-coded Google tag sends to the same measurement id beside the container: gtag.js for G-SAMPLE0001 loads beside the container on 1 page(s): /services.html. Every page view on them counts twice
- **WARN 1.1** The container loads on every page, as a script and as a noscript fallback: 5 pages checked; no noscript fallback on 1: /about.html
- **WARN 2.4** A thank-you page cannot be reached without a send: noindex, out of the sitemap, not linked: /thank-you.html: no noindex, listed in the sitemap. Visits that never sent anything can land there and count as leads
- **WARN 2.6** A tap on an email link sends a GA4 event (email_click): mailto: links on 5 page(s), but no tag fires on a mailto: click. Fine only if email is not a lead channel
- **WARN 5.1** Every form carries hidden fields for the click id, the UTM values, the landing page and the referrer: no hidden source fields in the forms on /contact.html: a lead arrives with no record of where it came from

## Every check

| Status | Id | Phase | Check | Detail |
| --- | --- | --- | --- | --- |
| WARN | 1.1 | Tags on every page | The container loads on every page, as a script and as a noscript fallback | 5 pages checked; no noscript fallback on 1: /about.html |
| PASS | 1.2 | Tags on every page | The container id is a real id, not a placeholder such as GTM-XXXXXXX | GTM-SAMPLE1, GTM-TESTOLD |
| FAIL | 1.3 | Tags on every page | Only one Tag Manager container loads, and it is GTM-SAMPLE1 | 2 containers: GTM-SAMPLE1 on 5 page(s), GTM-TESTOLD on 1 page(s); two on one page: /about.html (GTM-SAMPLE1 + GTM-TESTOLD). A leftover container sends visits to a property nobody reads |
| PASS | 1.4 | Tags on every page | The container is published and can be read | GTM-SAMPLE1 version 12, 4 tags; read from the saved copy sample/gtm.js |
| FAIL | 1.5 | Tags on every page | No hard-coded Google tag sends to the same measurement id beside the container | gtag.js for G-SAMPLE0001 loads beside the container on 1 page(s): /services.html. Every page view on them counts twice |
| PASS | 1.6 | Tags on every page | The measurement id in the container matches the data stream of the property the business uses | G-SAMPLE0001 |
| PASS | 1.7 | Tags on every page | The container id and measurement id are written down in a document the business keeps | GTM-SAMPLE1, G-SAMPLE0001 in sample/records.md |
| MANUAL | 1.8 | Tags on every page | A fresh visit from a phone shows up in GA4 Realtime in the property the business uses | open the site on a phone off the office wifi, then look in Reports, Realtime of that property |
| PASS | 2.1 | Each event fires once | The container has one Google tag per measurement id, so each page load sends one page view | G-SAMPLE0001 |
| PASS | 2.2 | Each event fires once | The lead event (generate_lead) fires on a confirmed send, never on Tag Manager's form submission trigger | generate_lead on form_sent |
| PASS | 2.3 | Each event fires once | The events the pages push and the events the container waits for match | form_sent |
| WARN | 2.4 | Each event fires once | A thank-you page cannot be reached without a send: noindex, out of the sitemap, not linked | /thank-you.html: no noindex, listed in the sitemap. Visits that never sent anything can land there and count as leads |
| PASS | 2.5 | Each event fires once | A tap on a phone link sends a GA4 event (phone_click) | phone_click |
| WARN | 2.6 | Each event fires once | A tap on an email link sends a GA4 event (email_click) | mailto: links on 5 page(s), but no tag fires on a mailto: click. Fine only if email is not a lead channel |
| MANUAL | 2.7 | Each event fires once | In Tag Assistant preview, one page load sends one page view, a good send fires the lead event once, and a send that fails validation fires none | Tag Assistant (tagassistant.google.com), then the same actions in GA4 DebugView |
| MANUAL | 2.8 | Each event fires once | GA4's enhanced measurement form interactions are off, or their events are kept out of the lead count | GA4, Admin, Data streams, the web stream, Enhanced measurement, Form interactions |
| INFO | 3.1 | Key events | Events this container sends to GA4 | generate_lead, phone_click |
| MANUAL | 3.2 | Key events | generate_lead and phone_click are marked as key events (and email_click if email is a lead channel), no page view or scroll event is, and the date they were marked is written down | GA4, Admin, Events (key events). Marking does not apply to earlier data |
| MANUAL | 4.1 | A real lead end to end | A test lead sent from a phone reaches the inbox or CRM, shows as the lead event in Realtime, and a real tap on the phone link shows as the phone event | tell the office first, then mark or delete the test lead so it never reaches a report |
| WARN | 5.1 | Source on the lead | Every form carries hidden fields for the click id, the UTM values, the landing page and the referrer | no hidden source fields in the forms on /contact.html: a lead arrives with no record of where it came from |
| MANUAL | 5.2 | Source on the lead | Landing with ?gclid=TEST123&utm_source=test&utm_medium=cpc, moving to a second page and sending puts those values in fields on the lead record, and they survive a later visit | phone leads need a source too: a tracking number or a required lead source field |
| INFO | 6.1 | Consent | Consent setup seen in the pages and the container | consent default: none found; consent tool: none found |
| MANUAL | 6.2 | Consent | Consent behaves as designed: the default before any choice, no GA4 or click id cookie after a rejection, the gated tags after acceptance, and the choice remembered | Tag Assistant, Consent tab, and the browser's cookie list after each choice |
| SKIP | 7.1 | Tagging server | Tagging server | the container sends straight to Google; no tagging server configured |
| SKIP | 8.1 | Ad platforms | Google Ads conversion tags have a Conversion Linker beside them | no Google Ads tags in the container |
| SKIP | 8.2 | Ad platforms | Ad platforms record conversions | no Google Ads or Meta tags found |
| INFO | 9.1 | Monthly re-check | Run this again every month and keep the dated report | site edits, plugin updates and rebuilt forms break tracking without warning |

## What only a person can check

- [ ] **1.8** A fresh visit from a phone shows up in GA4 Realtime in the property the business uses. How: open the site on a phone off the office wifi, then look in Reports, Realtime of that property. Result: _write it here_
- [ ] **2.7** In Tag Assistant preview, one page load sends one page view, a good send fires the lead event once, and a send that fails validation fires none. How: Tag Assistant (tagassistant.google.com), then the same actions in GA4 DebugView. Result: _write it here_
- [ ] **2.8** GA4's enhanced measurement form interactions are off, or their events are kept out of the lead count. How: GA4, Admin, Data streams, the web stream, Enhanced measurement, Form interactions. Result: _write it here_
- [ ] **3.2** generate_lead and phone_click are marked as key events (and email_click if email is a lead channel), no page view or scroll event is, and the date they were marked is written down. How: GA4, Admin, Events (key events). Marking does not apply to earlier data. Result: _write it here_
- [ ] **4.1** A test lead sent from a phone reaches the inbox or CRM, shows as the lead event in Realtime, and a real tap on the phone link shows as the phone event. How: tell the office first, then mark or delete the test lead so it never reaches a report. Result: _write it here_
- [ ] **5.2** Landing with ?gclid=TEST123&utm_source=test&utm_medium=cpc, moving to a second page and sending puts those values in fields on the lead record, and they survive a later visit. How: phone leads need a source too: a tracking number or a required lead source field. Result: _write it here_
- [ ] **6.2** Consent behaves as designed: the default before any choice, no GA4 or click id cookie after a rejection, the gated tags after acceptance, and the choice remembered. How: Tag Assistant, Consent tab, and the browser's cookie list after each choice. Result: _write it here_

When they are done, run the check again with `--confirmed 1.8,2.7,2.8,3.2,4.1,5.2,6.2` and keep the report.
