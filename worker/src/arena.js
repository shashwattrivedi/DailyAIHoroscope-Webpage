// Several models write each day, and visitors vote on which lines feel true (#19).
//
// Every model in MODELS (wrangler.jsonc) gets the same prompt and writes all 12 lines.
// Then one line per sign is chosen, so everyone everywhere still sees one set of 12:
// - Each model gets an equal share of the signs (3 each with 4 models; with more than 12
//   models, 12 different models a day, the ones shown least so far first).
// - Within that, each sign goes to the model that has written it least often, so over a
//   few days every model covers every sign about equally and no model is helped by the
//   signs it gets.
// - Only lines that pass the writer's checks are chosen. If no allowed model has a clean
//   line for a sign, any clean line is used, and if there is none, the house model's
//   (MODEL); either way the sign is listed in fallback.
// - Ties are broken with a secure random number, so the code (which is public) can't be
//   used to tell which model wrote which line.
//
// Which model wrote which line, and all the lines not chosen, stay private in KV
// (arena:<date>) until the week's results are published. The public day file and the
// pages only ever have the 12 chosen lines. Running totals of what each model was given
// are kept in arena:counts.

import { SIGNS, prompt, write } from './writer.js';

// The models of the arena, or just the house model when MODELS isn't set.
export function models(env) {
  const list = Array.isArray(env.MODELS) && env.MODELS.length ? env.MODELS : [{ id: env.MODEL, options: env.MODEL_OPTIONS }];
  return list.map((m) => (typeof m === 'string' ? { id: m } : m));
}

const random = () => crypto.getRandomValues(new Uint32Array(1))[0];

// results: { modelId: { signs, issues } } for the models that wrote; counts: arena:counts.
// Returns { signs: { Sign: line }, models: { Sign: modelId }, fallback: [Sign] }.
export function choose(results, counts, house) {
  const ids = Object.keys(results);
  if (!ids.length) throw new Error('no model wrote any lines');
  const total = (id) => counts[id]?.total || 0;
  const signCount = (id, s) => counts[id]?.signs?.[s] || 0;
  const clean = (id, s) => !results[id].issues?.[s];
  // With up to 12 models, an equal share each; with more, one sign each, for the models
  // shown least so far.
  const cap = Math.ceil(SIGNS.length / ids.length);
  const today = Object.fromEntries(ids.map((id) => [id, 0]));
  const tie = Object.fromEntries(ids.map((id) => [id, random()]));
  const out = { signs: {}, models: {}, fallback: [] };
  // Signs in a random order, so no sign always gets first pick.
  for (const s of SIGNS.map((s) => [random(), s]).sort((a, b) => a[0] - b[0]).map(([, s]) => s)) {
    const rank = (a, b) => signCount(a, s) - signCount(b, s) || total(a) + today[a] - total(b) - today[b] || tie[a] - tie[b];
    let id = ids.filter((id) => today[id] < cap && clean(id, s)).sort(rank)[0];
    if (!id) {
      out.fallback.push(s);
      id = ids.filter((id) => clean(id, s)).sort(rank)[0] || (results[house] ? house : ids[0]);
    }
    today[id]++;
    out.signs[s] = results[id].signs[s];
    out.models[s] = id;
  }
  return out;
}

// Writes the day with every model (in parallel) and chooses the 12 lines. previous: the
// day before's lines. Returns { signs, models, fallback, save }: call save() once these
// lines are the published ones, to keep the record and update the counts.
export async function writeDay(env, date, previous) {
  const ask = prompt(previous);
  const list = models(env);
  const settled = await Promise.allSettled(list.map((m) => write(env, m, ask)));
  const results = {}, failed = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results[list[i].id] = r.value;
    else failed[list[i].id] = String(r.reason?.message || r.reason).slice(0, 300);
  });
  const counts = (await env.HOROSCOPES.get('arena:counts', 'json')) || {};
  const day = choose(results, counts, env.MODEL);
  if (Object.keys(failed).length || day.fallback.length) console.log('[arena] ' + date + ' failed: ' + JSON.stringify(failed) + ' fallback: ' + day.fallback.join(', '));
  const save = async () => {
    for (const [s, id] of Object.entries(day.models)) {
      const c = (counts[id] ||= { total: 0, signs: {} });
      c.total++;
      c.signs[s] = (c.signs[s] || 0) + 1;
    }
    await env.HOROSCOPES.put('arena:' + date, JSON.stringify({
      date, prompt: ask, chosen: day.models, fallback: day.fallback, lines: results, failed, createdAt: new Date().toISOString()
    }));
    await env.HOROSCOPES.put('arena:counts', JSON.stringify(counts));
  };
  return { ...day, save };
}
