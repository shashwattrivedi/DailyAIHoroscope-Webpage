# Daily AI Horoscope - Website Page

This repository contains the frontend files for the website [dailyaihoroscope.com](https://dailyaihoroscope.com). The website is created for fun experiment exploring [Barnum effect](https://en.wikipedia.org/wiki/Barnum_effect) and horoscope. Horoscope are generally vague and written in such a way to cover normal aspects of everyone's life. This websites uses a language model to generate 12 random sentences that sound like horoscope ( there is no guarentee but the model is trained to produced such sentences ). Website intends to know if people still find these random sentences on this website relevant and accurate for their day. People are encouraged to share their interpretation for the horoscope and share their story which matches with the horoscope.

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
- `worker/`: the Cloudflare Worker that writes the horoscopes (see below).

The site itself is static with no build step. The API address is in the `horoscope-api` meta tag of both pages.

# Daily horoscopes (worker/)

A Cloudflare Worker writes 12 lines per calendar date with Workers AI and stores them in KV.

- A date starts at 00:00 in UTC+14 (the first time zone) and ends at 24:00 in UTC-12, so everyone gets the lines for their own local date.
- A cron runs hourly and only generates missing dates, up to 6 hours before they start. Lines wait in KV (private) until the date starts (10:00 UTC), then the cron copies them to the public R2 bucket `dailyaihoroscope-data` as `data/YYYY-MM-DD.json`.
- Visitors load that file from the CDN, so the Worker isn't called at all. The page only falls back to the Worker API if the file is missing; if a date is missing everywhere, the first request generates it.
- The file's address is the `horoscope-data` meta tag (the bucket's public domain). While it is empty, pages use the API.
- Each sign gets two random moods; the lines ignore the sign's traditional traits.
- `GET /v1/horoscope?date=YYYY-MM-DD` returns `{ date, signs: { Aries: "...", ... } }`. Dates that have not started anywhere yet return 404.

Deploy: `cd worker && npx wrangler deploy`. Bucket CORS: `npx wrangler r2 bucket cors set dailyaihoroscope-data --file r2-cors.json`. The model is set by `MODEL` in `worker/wrangler.jsonc`.
