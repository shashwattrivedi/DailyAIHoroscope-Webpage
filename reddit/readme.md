## Daily AI Horoscope for Reddit

Posts the day's 12 AI-written horoscope lines from [dailyaihoroscope.com](https://dailyaihoroscope.com) to the subreddit it is installed in (r/DailyAIHoroscope), once a day. The lines are written by an AI as a small experiment on the Barnum effect: why vague lines feel personal. Every post says they aren't astrology or advice.

- **Daily post:** at 12:00 UTC the app fetches that UTC date's lines and submits one text post: the 12 lines, a disclaimer and a link to the site. A date is posted only once (kept in Redis as `posted:<date>`). If the day isn't published yet, it posts nothing.
- **Moderator menu item:** "Post today's horoscopes" does the same at once, for a missed day or a first test.
- **No user data:** the app reads no posts, comments or users, and sends nothing about Reddit or its users anywhere. It only reads one public file per day.

## Fetch Domains

The following domains are requested for this app:

- `data.dailyaihoroscope.com`: the public, read-only daily data of Daily AI Horoscope, one JSON file per date (`https://data.dailyaihoroscope.com/data/YYYY-MM-DD.json`, for example [2026-10-24](https://data.dailyaihoroscope.com/data/2026-10-24.json)). It is a documented open-data API that anyone can use without a key ([documentation](https://dailyaihoroscope.com/embed#data)), served as static files from a CDN. The app makes one GET request a day (plus one per moderator click), sends no data, and only needs the day's 12 lines, which Devvit's own storage can't provide because they are written outside Reddit by the site.

## Terms and privacy

- Terms: https://dailyaihoroscope.com/terms
- Privacy: https://dailyaihoroscope.com/privacy

## Commands

- `npm run playtest [r/sub]`: watches changes, builds, uploads, and installs on Reddit. Accepts an optional subreddit.
- `npm run build`: builds the server.
- `npm run test`: type checks, lints, runs the unit tests and builds.
- `npm run format`: fixes lints and formatting.
- `npm run publish`: cleans, builds, uploads, and files a new app review request.

Source: [github.com/shashwattrivedi/DailyAIHoroscope-Webpage](https://github.com/shashwattrivedi/DailyAIHoroscope-Webpage) (`reddit/`).
