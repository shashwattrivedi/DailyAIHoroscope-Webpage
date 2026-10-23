import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, beforeEach, test} from 'node:test'
import {type Context, reddit, redis, runWithContext} from '@devvit/web/server'
import {Endpoint, type ErrorRsp} from '../shared/api.ts'
import {dateFor, postFor, SIGNS} from './horoscope.ts'
import {onReq, postToday} from './server.ts'

let server: Server
let serverURL: string
const redisValues = new Map<string, string>()
const posts: {subredditName: string; title: string; text: string}[] = []
let dayFile: {status: number; body?: object} = {status: 404}
const realFetch = globalThis.fetch
const redisGet = redis.get.bind(redis)
const redisSet = redis.set.bind(redis)
const submitPost = reddit.submitPost.bind(reddit)

const day = {
  date: '2026-10-24',
  signs: Object.fromEntries(SIGNS.map(([key]) => [key, `Line for ${key}.`])),
}
const noon = Date.parse('2026-10-24T12:00:00Z')

before(async () => {
  redis.get = async key => redisValues.get(key)
  redis.set = (async (key: string, value: string) => {
    redisValues.set(key, value)
    return 'OK'
  }) as typeof redis.set
  reddit.submitPost = (async (opts: (typeof posts)[number]) => {
    posts.push(opts)
    return {id: `t3_${posts.length}`}
  }) as unknown as typeof reddit.submitPost
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (!String(url).startsWith('https://data.dailyaihoroscope.com/'))
      return realFetch(url, init)
    return new Response(JSON.stringify(dayFile.body ?? {}), {
      status: dayFile.status,
    })
  }) as typeof fetch

  server = createServer(async (req, rsp) => {
    await runWithContext(
      {
        appName: 'horoscopeapp',
        subredditName: 'DailyAIHoroscope',
      } as unknown as Context,
      () => onReq(req, rsp),
    )
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const info = server.address() as AddressInfo
  serverURL = `http://127.0.0.1:${info.port}`
})

after(async () => {
  redis.get = redisGet
  redis.set = redisSet
  reddit.submitPost = submitPost
  globalThis.fetch = realFetch
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()))
  })
})

beforeEach(() => {
  redisValues.clear()
  posts.length = 0
  dayFile = {status: 404}
})

test('the post date is the UTC date', () => {
  assert.equal(dateFor(noon), '2026-10-24')
  assert.equal(dateFor(Date.parse('2026-10-24T23:59:00Z')), '2026-10-24')
})

test('the post has all 12 signs, the disclaimer and the link', () => {
  const {title, text} = postFor(day)
  assert.equal(
    title,
    'Daily AI Horoscope, 24 October 2026: 12 lines written by an AI',
  )
  assert.match(text, /\*\*♏ Scorpio\*\*: Line for Scorpius\./)
  assert.match(text, /\*\*♑ Capricorn\*\*: Line for Capricornus\./)
  assert.equal(text.match(/^\*\*/gm)?.length, 12)
  assert.match(text, /not an astrologer/)
  assert.match(text, /\(https:\/\/dailyaihoroscope\.com\)/)
})

test('cron posts once a day', async () => {
  dayFile = {status: 200, body: day}
  const run = () =>
    fetch(`${serverURL}/${Endpoint.DailyPost}`, {method: 'POST', body: '{}'})
  assert.equal((await run()).status, 200)
  assert.equal((await run()).status, 200)
  assert.equal(posts.length, 1)
  assert.equal(posts[0]?.subredditName, 'DailyAIHoroscope')
})

test('nothing is posted before the day is published', async () => {
  const msg = await runWithContext(
    {subredditName: 'DailyAIHoroscope'} as unknown as Context,
    () => postToday(noon),
  )
  assert.match(msg, /aren't published yet/)
  assert.equal(posts.length, 0)
})

test('a file with a missing sign is an error, not a post', async () => {
  dayFile = {status: 200, body: {date: day.date, signs: {Aries: 'x'}}}
  const rsp = await fetch(`${serverURL}/${Endpoint.OnMenuPostNow}`, {
    method: 'POST',
    body: '{}',
  })
  assert.equal(rsp.status, 500)
  assert.equal(posts.length, 0)
})

test('wrong method', async () => {
  const rsp = await fetch(`${serverURL}/${Endpoint.DailyPost}`)
  assert.equal(rsp.status, 404)
  assert.deepEqual<ErrorRsp>(await rsp.json(), {
    error: 'not found',
    status: 404,
  })
})
