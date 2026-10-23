/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  // Daily cron (devvit.json): posts the day's lines once.
  DailyPost: 'internal/scheduler/daily-post',
  // Moderator menu item: the same, right now.
  OnMenuPostNow: 'internal/on/menu/post-now',
} as const

export const EndpointMethod = {
  [Endpoint.DailyPost]: 'POST',
  [Endpoint.OnMenuPostNow]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
