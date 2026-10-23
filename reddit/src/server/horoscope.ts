// The day's lines, as published by the site's Worker (one public JSON file per date,
// documented at https://dailyaihoroscope.com/embed#data), and the Reddit post made
// from them. The post matches the other platforms' (worker/src/social.js).

export const SITE = 'https://dailyaihoroscope.com'
export const DATA = 'https://data.dailyaihoroscope.com/data/'

/** The 12 signs: the data file's key, the shown name and the glyph. */
export const SIGNS = [
  ['Aries', 'Aries', '♈'],
  ['Taurus', 'Taurus', '♉'],
  ['Gemini', 'Gemini', '♊'],
  ['Cancer', 'Cancer', '♋'],
  ['Leo', 'Leo', '♌'],
  ['Virgo', 'Virgo', '♍'],
  ['Libra', 'Libra', '♎'],
  ['Scorpius', 'Scorpio', '♏'],
  ['Sagittarius', 'Sagittarius', '♐'],
  ['Capricornus', 'Capricorn', '♑'],
  ['Aquarius', 'Aquarius', '♒'],
  ['Pisces', 'Pisces', '♓'],
] as const

export type Day = {date: string; signs: {[key: string]: string}}

const DISCLAIMER =
  'Written by an AI, not an astrologer. It isn’t advice; please don’t follow it.'
const INVITE = 'Felt true? Share it with #DailyAIHoroscopeWasCorrect'

/** The date to post: the UTC date, so a noon UTC post is "today" for most readers. */
export function dateFor(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** The day's file, or null while it isn't published yet (404). */
export async function fetchDay(date: string): Promise<Day | null> {
  const rsp = await fetch(`${DATA}${date}.json`)
  if (rsp.status === 404) return null
  if (!rsp.ok) throw Error(`${DATA}${date}.json: HTTP ${rsp.status}`)
  const day = (await rsp.json()) as Day
  const missing = SIGNS.filter(([key]) => !day.signs?.[key])
  if (missing.length)
    throw Error(`${date}: no line for ${missing.map(([k]) => k).join(', ')}`)
  return day
}

/** Title and Markdown body of the day's post. */
export function postFor(day: Day): {title: string; text: string} {
  const long = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const lines = SIGNS.map(
    ([key, name, glyph]) => `**${glyph} ${name}**: ${day.signs[key]}`,
  )
  return {
    title: `Daily AI Horoscope, ${long}: 12 lines written by an AI`,
    text: [
      `Twelve horoscope-style lines for ${long}, written by an AI as a small experiment on the Barnum effect ([why they feel true](${SITE}/purpose)).`,
      ...lines,
      `*${DISCLAIMER}*`,
      `[dailyaihoroscope.com](${SITE}) · ${INVITE}`,
    ].join('\n\n'),
  }
}
