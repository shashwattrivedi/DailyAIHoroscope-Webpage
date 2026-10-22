# Daily AI Horoscope - Website Page

This repository contains the frontend files for the website [dailyaihoroscope.com](https://dailyaihoroscope.com). The website is created for fun experiment exploring [Barnum effect](https://en.wikipedia.org/wiki/Barnum_effect) and horoscope. Horoscope are generally vague and written in such a way to cover normal aspects of everyone's life. This websites uses a language model to generate 12 random sentences that sound like horoscope ( there is no guarentee but the model is trained to produced such sentences ). Website intends to know if people still find these random sentences on this website relevant and accurate for their day. People are encouraged to share their interpretation for the horoscope and share their story which matches with the horoscope.

Follow the daily lines on [Instagram](https://www.instagram.com/dailyaihoroscope/), [Facebook](https://www.facebook.com/dailyaihoroscope) and [Bluesky](https://bsky.app/profile/dailyaihoroscope.com).

Reiterating the disclaimer again

> **Disclaimer**: Horoscopes do not generally contain any instruction for the reader, but the horoscopes on this page may contain instructions as do not go through any scrutiny. These 12 sentences are produced randomly by an unmonitored model. Please do not follow any instructions mentioned in any horoscope. I do not want anyone following any instructions given by AI. This holds for anything that you read online; please use your discretion. I will not be responsible for anything you follow after reading the horoscope.

The frontend for the website is rendered using the files on this repository.

# Constellations

The constellations used on the wesite are created using the images on IAU. The images, videos and web texts on [iau.org](http://www.iau.org/) are released under the [Creative Commons Attribution 4.0 International license](http://creativecommons.org/licenses/by/4.0/).

# Contribute

You can contribute to the website's design, content (except the horoscope) and share your visualisation of the constellation, there is no standard representation for constellation.
If you find any issue with the content on the page ( except horoscope ), please raise issue on this repository.

# Credits

Thanks [iau.org](http://www.iau.org/) (IAU and Sky & Telescope) for publicly sharing the sky chart.

Glider.js : [GitHub - NickPiscitelli/Glider.js: A fast, lightweight, dependency free, native scrolling carousel alternative!](https://github.com/NickPiscitelli/Glider.js/)

# Structure

- `index.html`: the daily card (one screen, no scroll). It shows the lines for the visitor's own local date and switches to the next set at local midnight.
- `purpose.html`: why the site exists (Barnum effect). "Try it" uses the same day's lines; `#tweetIds` takes comma-separated tweet IDs.
- `js/app.js`: rendering, constellation animation, planets, parallax, share and save-as-image.
- `js/constellations.js`: constellation figures. `js/signs.js`: signs, dates and colours.
- `js/astronomy.browser.min.js`: [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT), used for today's planet positions.
- `widget.html` + `js/widget.js`: the embeddable widget (`/widget?sign=aries&theme=dark`, or no sign to let the visitor pick), for other sites' iframes. No analytics or cookies; its links carry `utm_source=widget` and the embedding site's host.
- `embed.html` + `js/embed.js`: `/embed`, where site owners pick a sign, look and size, preview the widget and copy the snippet; also lists the RSS feeds.
- `worker/`: the Cloudflare Worker that writes the horoscopes (see below).
- `scripts/build.mjs`: the daily build (see below).

The pages work as they are (open `index.html` from any static server). The API address is in the `horoscope-api` meta tag of both pages.

# Daily build and deploy

`npm install`, then `node scripts/build.mjs` copies the site into `dist/` with the newest date's lines written into the HTML, so search engines and link previews see them without running JavaScript. It also writes:

- a page per sign (`/aries` … `/pisces`), each with its own title, description and structured data (JSON-LD `Article`);
- a 1200×630 link-preview image per sign (`og/<sign>-<date>.png`), drawn by `scripts/og.html` in headless Chrome (set `CHROME_PATH` if Chrome isn't in the usual place; without Chrome the images are skipped);
- the widget with the lines baked in, like the pages;
- RSS feeds of the last week's lines: `feed.xml` (all signs) and `feed/<sign>.xml`, linked from the pages;
- `sitemap.xml`, `robots.txt`, and `_headers` (keeps the `pages.dev` copies out of search). Visitors still get their own local date: the page swaps to it on load if it differs.

`.github/workflows/deploy.yml` runs the build and deploys `dist/` to the Cloudflare Pages project `dailyaihoroscope` on every push, and daily when the Worker starts it at 10:00 UTC, right after a new date starts (no GitHub schedule, because GitHub turns those off after 60 days without commits; the Worker needs the `GH_DISPATCH_TOKEN` secret, a fine-grained token for this repo with Actions: Read and write). It needs the repository secrets `CLOUDFLARE_API_TOKEN` (permission: Account > Cloudflare Pages > Edit) and `CLOUDFLARE_ACCOUNT_ID`.

# Daily horoscopes (worker/)

A Cloudflare Worker writes 12 lines per calendar date with Workers AI and stores them in KV.

- A date starts at 00:00 in UTC+14 (the first time zone) and ends at 24:00 in UTC-12, so everyone gets the lines for their own local date.
- A cron runs once a day at 10:00 UTC, when a new date starts. It writes that date's lines into KV and publishes them to the public R2 bucket `dailyaihoroscope-data` as `data/YYYY-MM-DD.json`. Nothing is public before the date starts.
- Visitors load that file from the CDN, so the Worker isn't called at all. The page only falls back to the Worker API if the file is missing; if a date is missing everywhere, the first request generates it.
- The file's address is the `horoscope-data` meta tag: https://data.dailyaihoroscope.com (R2 custom domain, with a Cache Rule so the CDN caches it). While it is empty, pages use the API.
- Each sign gets two random moods; the lines ignore the sign's traditional traits.
- `GET /v1/horoscope?date=YYYY-MM-DD` returns `{ date, signs: { Aries: "...", ... } }`. Dates that have not started anywhere yet return 404.

## Social media (worker/src/social.js)

At 12:00 UTC (retry 14:00), after the site build has published the day's images, the Worker shares the lines:

- **Bluesky**: 12 separate posts, one per sign with its tall 4:5 card, 30 seconds apart.
- **X**: a thread (one post, then a reply per sign). `X_THREAD=false` posts only the first.
- **Facebook**: one Page post with all 12 lines. **Reddit**: one text post in `REDDIT_SUBREDDIT`.
- **Instagram**: one carousel of 13 slides: a cover (`post/cover-<date>.jpg`, "swipe to find your sign") and the 1080×1350 card of each sign (`post/<sign>-<date>.jpg`), with all 12 lines in the caption.
- **Instagram stories**: 13 stories in zodiac order: a cover (`story/cover-<date>.jpg`, "tap to find your sign") and the 1080×1920 card of each sign (`story/<sign>-<date>.jpg`). The API can't add link stickers, so each card shows the sign's address. Saving them to a Highlight has to be done in the app.

Settings are in `worker/wrangler.jsonc` (`SOCIAL` picks the platforms; `SOCIAL_DRY_RUN` is `"true"` until you want real posts, and only logs them). Keys are **Worker secrets, never in the repo**: run `npx wrangler secret put NAME` in your own terminal for each name in `worker/.dev.vars.example`. For local tests, copy that file to `worker/.dev.vars` (ignored by git) and run `npx wrangler dev --test-scheduled`, then open `/__scheduled?cron=0+10,12,14+*+*+*`.

## Daily report and dashboard

At 14:00 UTC the Worker collects a snapshot (Google Analytics for the previous day, followers and likes on Bluesky, Instagram and Facebook, the hashtag stories, and what was written and posted), keeps it in KV (`report:YYYY-MM-DD`, private), and emails it to `ALERT_TO`. `/dashboard` on the Worker shows the latest snapshot with 30-day trends; it answers 404 unless opened once with `?key=` and the `DASHBOARD_KEY` secret, which then sets a cookie. Google Analytics needs `GA_PROPERTY_ID` (wrangler.jsonc) and a read-only service account key in the `GA_SERVICE_ACCOUNT` secret.

## Alerts

The Worker emails `ALERT_TO` (a secret; it must be a verified Cloudflare Email Routing destination) when something needs a person: writing a day's horoscopes failed, the site has no images for the day by 14:00, a platform still failed at the 14:00 retry, or (checked daily at 10:00) the Meta or GitHub token is invalid, expires within 14 days, or (Meta) isn't a Page token with the permissions below.

## Renewing the Meta token

Facebook and Instagram posting and stats use one Page token, the `META_PAGE_TOKEN` secret. It stops working if it's revoked, loses its Page permissions, or Facebook logs the account out (for example after a password change or a security check). Meta then answers with error 190, and the alert links here.

1. Log in to facebook.com with the account that manages the Page, and clear any security check it shows.
2. In the [Graph API Explorer](https://developers.facebook.com/tools/explorer/), pick the "Daily AI Horoscope Poster" app and "Get User Access Token" with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish` (and `business_management` if the Page is in a Business portfolio). When Facebook Login asks, select the Daily AI Horoscope Page **and** its Instagram account.
3. In the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/), "Extend Access Token" to get a long-lived user token.
4. Back in the Explorer, with the long-lived token, run `GET me/accounts` and copy the Page's `access_token`. Check it in the debugger: Type **Page**, the permissions above, Expires **Never**.
5. From the `worker` folder: `npx wrangler secret put META_PAGE_TOKEN` and paste it. The next run retries only what failed.

Each post is recorded in KV, so re-runs never post twice, and a platform that fails doesn't stop the others. Results are in the Worker's logs (`[posted]`, `[ok]`, `[failed]`).

Deploy: `cd worker && npx wrangler deploy`. Bucket CORS: `npx wrangler r2 bucket cors set dailyaihoroscope-data --file r2-cors.json`. The model is set by `MODEL` in `worker/wrangler.jsonc`.
