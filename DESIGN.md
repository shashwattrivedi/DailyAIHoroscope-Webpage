# Daily AI Horoscope · Design

The reference for how Daily AI Horoscope looks, reads and behaves, on the site and in
everything it posts. Check here before adding a page, a component, an image layout or a
social asset. When the code changes a value listed here, update this file in the same PR.

Open design work is tracked in GitHub issues (e.g. #20 for consistent branding, #19 for the
model arena).

---

## 1. Principles

1. **One screen, one line.** The home page is a single, non-scrolling screen: your sign, today's
   line, Share. Everything else is secondary and stays out of the way.
2. **Honest about what it is.** The lines are written by an AI, not an astrologer. The site
   says so plainly and never presents a line as advice ("please don't follow it").
3. **The sign is the theme.** The whole UI takes the selected sign's colour; ink stays black.
4. **Playful, not mystical.** Bold type, flat colour, real constellations and planets: no
   tarot textures, gradients or gold.
5. **Made to be shared.** Every line can become an image that looks good in a feed and carries
   the site's address.
6. **Fast and light.** Static pages, self-hosted fonts, no framework; lines are baked into the
   HTML at build time.

## 2. Brand

| Element | Value |
|---|---|
| Name | **Daily AI Horoscope** (always this casing; "AI" in caps; no "The") |
| Mark | **Saturn ♄**, drawn as heavy rounded strokes. Geometry: `saturn()` in `scripts/og.html` (800 grid). Exported in `media/brand/` |
| Avatar | Saturn in ink (`#111111`) on brand pink with a light star field: `media/brand/avatar-{32,400,720,1080}.png` |
| Headers | `header-1500x500.png` (X/Bluesky), `cover-1640x624.png` (Facebook), `reddit-banner-1920x384.png` |
| Tagline | Currently two versions: site "AI-WRITTEN · NOT ASTROLOGY", social header "WRITTEN BY AI · NOT THE STARS". **Pick one** (#20) |
| Handle | `@dailyaihoroscope` (Instagram, Facebook); Bluesky `@dailyaihoroscope.com` |
| Hashtags | `#DailyAIHoroscopeWasCorrect` (stories from readers), `#DailyAIHoroscope` |

Rules:
- Use the mark in ink on a flat colour (brand pink or a sign colour), or white on ink. Don't
  outline it, add shadows or recolour it outside the palette.
- Keep clear space around the mark of at least the width of its crossbar.
- Known gap: the site favicon is still the old zodiac-wheel `media/horoscope.svg` and the site
  header has no mark. Both should move to the Saturn mark (#20).

## 3. Colour

### Tokens (site)

| Token | Value | Use |
|---|---|---|
| `--bg` | selected sign's colour (default `#FF6BB5`) | page background, text on ink buttons |
| `--ink` | `#111111` | text, icons, primary buttons, pills |
| white | `#FFFFFF` | stars, constellation lines, planet discs |
| ink tints | `rgba(17,17,17,.08–.45)` | hover, inactive dots, scrim |
| white tints | `rgba(255,255,255,.4)` | the sign bar |

`--bg` is set on `<html>` (by the build for each page, then by `app.js` when the sign changes)
and transitions over `.6s`. Never hard-code a sign colour in a component; read `var(--bg)`.

### Sign palette (`js/signs.js`)

| Sign | Colour | Sign | Colour |
|---|---|---|---|
| Aries | `#FF7A59` | Libra | `#FF6BB5` (brand pink) |
| Taurus | `#3DDC97` | Scorpio | `#9B87FF` |
| Gemini | `#FFD23F` | Sagittarius | `#FF9E7A` |
| Cancer | `#9AD4FF` | Capricorn | `#A9B4C8` |
| Leo | `#FFA62B` | Aquarius | `#5ED3F3` |
| Virgo | `#B5E48C` | Pisces | `#D49BFF` |

All 12 are light enough for ink (`#111111`) text to pass WCAG AA for large text and body text.
Check contrast before adding or changing a sign colour.

### Purpose page (dark)

| Use | Value |
|---|---|
| Background | `#111111` |
| Text | `#F5F3EE`; secondary `#C9C6BF`, `#E3E0D9`; muted `#A9A69F` |
| Lines and borders | `#2E2E2E`, `#3A3A3A` |
| Links | brand pink `#FF6BB5`, hover `#FF9BCD` |
| Accents | lime `#C6F432` (counts), yellow `#FFD23F` (the Forer statistic) |

## 4. Typography

Fonts are self-hosted in `fonts/` (Latin + Latin Extended, `woff2`).

| Role | Font | Size (phone → desktop) | Notes |
|---|---|---|---|
| Sign name (`h1`) | Outfit 900 | 64px → `clamp(80px, 9vw, 128px)` | line-height .9–.95, tracking −.04em, never wraps |
| Today's line (`.quote`) | Outfit 800 | 34px → 52px, auto-fitted to the space | in curly quotes “…”, tracking −.02em |
| UI, buttons | Outfit 700 | 14–17px | |
| Wordmark | Outfit 800 | | "Daily AI Horoscope" |
| Labels, dates, pills (`.mono`) | Space Mono 700 | 11–12px | UPPERCASE, tracking .04–.06em, e.g. `BORN OCT 23 – NOV 21`, `FRI 23 OCT` |

Rules: no other typefaces; no italics; sentence case for UI copy, uppercase only in Space Mono labels.

## 5. Layout

- **Home and sign pages** (`index.html`, `/aries` …): fixed, full-viewport (`100dvh`), no page
  scroll. Top to bottom: top bar (wordmark, date pill) → sign finder (sign bar, prev/next, dots) →
  sky (fills the remaining space) → card (sign name, line) → actions (Share, Save, Follow row,
  "Why does it still feel true?").
- **Desktop** is `(min-width: 900px) and (min-height: 560px)` (`isDesktop()` in `app.js`; same
  media query in CSS): sign chips instead of the bar, birthday pickers in the top bar, the sky
  on the right, the actions on one line.
- **Safe areas:** padding uses `env(safe-area-inset-*)`. Side padding `--pad` = 20px on phones.
- **Must fit** iPhone SE (375×667) without scrolling. Test there whenever something is added
  to the home screen.
- **Purpose page:** a normal scrolling article on dark, max-width content, sections separated
  by `#2E2E2E` rules.

## 6. Components

| Component | Spec |
|---|---|
| Primary button (`.share`) | ink fill, `--bg` text, pill (`border-radius: 999px`), min-height 56px (60px desktop), icon + label |
| Round icon button (`.save`, `.round`) | 44–56px circle, transparent or 2px ink outline |
| Pill (`.date`, chips) | Space Mono label, ink fill with `--bg` text when active |
| Sign bar | white 40% tint, rounded, "BORN …?" + "You're a …" + "All signs" |
| Dots | 8px circles at 28% ink; active is 22px wide, full ink |
| Bottom sheet (sign picker) | white, rounded top, scrim at 45% ink, birthday selects + 12 sign tiles |
| Follow row | "Follow" label + 44px icon links (Instagram, Facebook, Bluesky) from `js/social-links.js`; after a share or save it briefly reads "Follow for tomorrow's line" |
| Sky | real constellation lines (IAU) in white at 55–60% with glowing stars; planets as ink discs with a white pulse ring, placed where they really are today (Astronomy Engine) |

Touch targets are at least 44×44px. Focus is visible (`outline: 3px solid currentColor`).

## 7. Motion

- Sign change: background colour fades over `.6s`; the line rises in (`rise` animation).
- Constellation build: lines draw outward from a lit star; stars light when reached.
- Parallax: layers shift slightly with the cursor or device tilt (`.4s` ease-out).
- Planets: a slow pulse ring (2.4s).
- `prefers-reduced-motion: reduce` turns off parallax, the build animation and pulses.

## 8. Images

All generated images share the card design: sign colour background, star field, the
constellation in white, "Daily AI Horoscope" wordmark, a date pill, `BORN …`, the sign name,
the line, and a footer with the platform icons and the site address. Fonts are Outfit and
Space Mono, loaded before drawing.

| Image | Size | Where it's made | Notes |
|---|---|---|---|
| Share/save card | 1080×1350 PNG | `drawCard()` in `js/app.js` | the address only, no hashtag in the image |
| Link preview (OG) | 1200×630 PNG | `scripts/og.html` (`og`) | constellation on the right |
| Feed post | 1080×1350 JPEG | `scripts/og.html` (`post`) | Instagram carousel slides, Bluesky |
| Story | 1080×1920 JPEG | `scripts/og.html` (`story`) | content between y 250 and 1670 (clear of app overlays); the footer shows `dailyaihoroscope.com/<sign>` since stories can't link |
| Carousel / story cover | 1080×1350, 1080×1920 | `drawCover()` in `scripts/og.html` | Saturn mark, the date, "SWIPE / TAP → FIND YOUR SIGN" |

Footer text shrinks to fit the width; never let it clip. No hashtags inside images (they go in
the post text).

## 9. Voice and copy

- Short, plain, a little wry. Second person ("You're a Scorpio").
- The AI is the author: "written by an AI", "not an astrologer", "No astrology."
- Always keep the disclaimer with the lines in posts: *"Written by an AI, not an astrologer.
  It isn't advice; please don't follow it."*
- Calls to action: "Felt the same? Share it", "Why does it still feel true?", "Share your story"
  with `#DailyAIHoroscopeWasCorrect`.
- Dates: `FRI 23 OCT` in pills; `23 October 2026` in prose.
- Sign names: Capricorn, Scorpio in UI; the IAU names (Capricornus, Scorpius) only in data keys.

## 10. Social

- Same name, avatar, header, bio and link on every platform; profile links live in
  `js/social-links.js` (also used by the site, JSON-LD `sameAs` and the daily report).
- Daily: Instagram carousel (cover + 12 signs, 4:5) and 12 Stories (9:16); Bluesky 12 posts with the
  4:5 card; Facebook one post. Captions: the line, the disclaimer, the link, hashtags at the end.
- Planned: weekly model-arena results card (#19).

## 11. Accessibility

- Ink on every sign colour meets WCAG AA; check any new colour.
- Icon-only controls have `aria-label`s; decorative SVGs are `aria-hidden`.
- The line is in an `aria-live="polite"` region so screen readers hear sign changes.
- Keyboard: ← / → change sign; Escape closes the sheet and menus.
- Respect `prefers-reduced-motion`.

## 12. Where things live

| What | File |
|---|---|
| Sign data and colours | `js/signs.js` |
| Constellation geometry | `js/constellations.js` |
| Site styles | `css/site.css` (home, sign pages), `css/purpose.css` (purpose page) |
| Share card drawing | `js/app.js` (`drawCard`) |
| Generated images | `scripts/og.html`, run by `scripts/build.mjs` |
| Social links | `js/social-links.js` |
| Brand assets | `media/brand/` |
| Fonts | `fonts/` |
