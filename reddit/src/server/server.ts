import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {context, reddit} from '@devvit/web/server'
import type {PartialJsonValue, UiResponse} from '@devvit/web/shared'
import {Endpoint, EndpointMethod, type ErrorRsp} from '../shared/api.ts'
import {dbPostedFor, dbSetPosted} from './db.ts'
import {dateFor, fetchDay, postFor} from './horoscope.ts'

type TaskRsp = {[key: string]: never}
type AnyRsp = UiResponse | TaskRsp | ErrorRsp

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(500, {error: msg, status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    await drain(reqMsg)
    switch (endpoint) {
      case Endpoint.DailyPost:
        console.log(`[daily-post] ${await postToday()}`)
        rsp = {}
        break
      case Endpoint.OnMenuPostNow:
        rsp = {showToast: {text: await postToday(), appearance: 'success'}}
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

/** Posts the day's lines to this subreddit once; returns what happened. */
export async function postToday(now: number = Date.now()): Promise<string> {
  const date = dateFor(now)
  const done = await dbPostedFor(date)
  if (done) return `Already posted for ${date} (${done}).`
  const day = await fetchDay(date)
  if (!day) return `The lines for ${date} aren't published yet.`
  const post = await reddit.submitPost({
    subredditName: context.subredditName,
    ...postFor(day),
  })
  await dbSetPosted(date, post.id)
  return `Posted ${date}: ${post.id}.`
}

async function drain(reqMsg: IncomingMessage): Promise<void> {
  reqMsg.resume()
  await once(reqMsg, 'end')
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
