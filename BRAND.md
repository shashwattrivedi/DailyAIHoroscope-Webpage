# Brand

One mark, one name, one pink, one tagline, on the site, the images and every social account.

## The mark

**Saturn ♄**: a black stroked glyph with round ends. It is one SVG path, `SATURN` in `js/signs.js`, and everything draws it from there:

- the site header, before "Daily AI Horoscope" (`build.mjs` adds it to every page, in the text colour);
- the favicon, phone icons and logo files (`node scripts/brand.mjs`);
- the post, story, cover and link-preview images (`scripts/og.html`) and the saved share card (`js/app.js`).

To change the mark, change the path in `js/signs.js`, run `node scripts/brand.mjs`, and redraw the social avatars and headers to match (they are PNGs made with the same path; see below).

## Files (`media/brand/`)

| File | Use |
|---|---|
| `saturn.svg` | The mark alone, black on transparent |
| `logo.svg` | Mark + "Daily AI Horoscope", black, for light or coloured backgrounds |
| `logo-white.svg` | The same in white, for dark backgrounds |
| `favicon.svg`, `favicon.ico` | Browser tab (the build also copies the `.ico` to `/favicon.ico`) |
| `apple-touch-icon.png` | iPhone home screen, 180 px |
| `icon-192.png`, `icon-512.png` | Android and `site.webmanifest`; the mark stays inside the safe zone for round masks |
| `avatar-1080.png`, `-720`, `-400`, `-32` | Social profile pictures |
| `header-1500x500.png` | Bluesky banner, X header |
| `cover-1640x624.png` | Facebook Page cover |
| `reddit-banner-1920x384.png` | Reddit banner |

The logo SVGs embed the Outfit font, so they look the same anywhere.

## Colours

- **Brand pink** `#FF6BB5`: avatars, headers, icons, `theme_color`. It's also Libra's colour.
- **Ink** `#111111`: the mark, text and buttons.
- **White** `#FFFFFF`: stars and constellation lines.
- **Sign colours** (`SIGNS` in `js/signs.js`): the site and each sign's images take the colour of the sign shown. The Instagram cover takes a different sign colour each day.

## Type

- **Outfit** 800 for the wordmark and headings, 900 for big display text.
- **Space Mono** 700, in capitals, for dates, pills and small labels.

Both are self-hosted in `fonts/`.

## Name and words

- Name: **Daily AI Horoscope**, always in full, capital A and I. Handle: `dailyaihoroscope`.
- Tagline: **Written by AI · not the stars** (in Space Mono capitals on pills: `WRITTEN BY AI · NOT THE STARS`).
- Bio: "Daily horoscopes for all 12 signs, written by an AI 🤖✨ Not astrology, just the Barnum effect." Link: https://dailyaihoroscope.com
- Every line carries the note that it's AI-written and not advice.

## Social sizes

| Platform | Picture | Banner |
|---|---|---|
| Instagram | `avatar-1080.png` | none |
| Facebook Page | `avatar-720.png` | `cover-1640x624.png` |
| Bluesky | `avatar-1080.png` | `header-1500x500.png` |
| X | `avatar-400.png` | `header-1500x500.png` |
| Reddit | `avatar-400.png` | `reddit-banner-1920x384.png` |

All use the same name, bio and link.
