import {redis} from '@devvit/web/server'

// The post made for each date, so the cron and the menu item never post a day twice.

export async function dbPostedFor(date: string): Promise<string | undefined> {
  return (await redis.get(postedKey(date))) ?? undefined
}

export async function dbSetPosted(date: string, postId: string): Promise<void> {
  await redis.set(postedKey(date), postId)
}

function postedKey(date: string): string {
  return `posted:${date}`
}
