// Writing the 12 lines: the prompt, reading the model's answer, and checking each line.
//
// The prompt asks for the voice of a real newspaper horoscope. Its numbers come from the
// style of ~13,000 published horoscopes (general, love and career): one or two sentences,
// "you", a mix of firm and hedged predictions, mostly love and work, often another
// person, and only rarely the sky. Only those statistics were used, no horoscope text;
// the examples below are original.
//
// Each sign gets two random moods (the feeling of its line), a life area and an opening,
// so the lines have nothing to do with the sign and the 12 don't all sound alike.

export const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpius', 'Sagittarius', 'Capricornus', 'Aquarius', 'Pisces'];

const MOODS = ['fear', 'disappointment', 'strength', 'uncertainty', 'anxiety', 'playfulness', 'joy', 'caution', 'independence',
  'stability', 'balance', 'optimism', 'stress', 'clarity', 'restlessness', 'hesitation', 'overwhelm', 'doubt', 'perseverance',
  'creativity', 'tranquility', 'motivation', 'enthusiasm', 'conflict', 'healing', 'solitude', 'resilience', 'frustration',
  'sadness', 'reflection', 'nostalgia', 'curiosity', 'impatience', 'gratitude', 'boredom', 'courage', 'relief', 'confusion',
  'surprise', 'pride', 'regret', 'hope', 'calm', 'excitement', 'loneliness', 'warmth', 'tiredness', 'determination'];

// Weighted like real horoscopes: love and work come up most.
const AREAS = ['love', 'love', 'love', 'work', 'work', 'work', 'friends', 'home and family', 'a conversation or message', 'creativity and ideas',
  'plans and decisions', 'someone close', 'the day as a whole', 'the day as a whole'];

const OPENINGS = ['a firm prediction with "will" or "you\'ll"', 'a hedged prediction with "may", "might" or "could"', 'opens with "If you…"',
  'opens with "Today" or a time of day (this morning, by evening)', 'opens with "There\'s" or "There is"',
  'opens with another person (someone, a friend, a colleague, a partner)', 'opens with how you have been feeling lately, then says what changes',
  'opens with the life area itself (Love…, Work…, Home…)', 'says something "is likely to" happen', 'opens with a small surprise or piece of news'];
const SKY = 'opens with the sky (the stars, the Moon, the planets) as mood only, never a specific astrological claim';

const EXAMPLES = [
  'You will find that a conversation you have been dreading goes far more smoothly than expected, perhaps even ending in laughter.',
  'Someone at work may notice an effort you thought went unseen, and their words could echo in your mind until evening.',
  'If a plan has felt uncertain lately, a small piece of news this afternoon may settle the question more kindly than you think.',
  "There's a restless edge to the morning, but by evening it softens into something much closer to contentment.",
  'The stars put old friendships in the spotlight, and a familiar name may appear just when you least expect it.',
  'Love feels lighter than usual, and a simple gesture from someone close is likely to mean more than they realise.',
  'An idea you set aside months ago returns, and this time it seems to have found its moment.',
  'A misunderstanding at home could clear up on its own, leaving things calmer than they have been all week.',
  'Your patience is about to pay off in a way that feels small at first and much bigger by the weekend.',
  'You may feel pulled between staying in and saying yes to everything, and either way the day is likely to surprise you.'
];

function pick(list, n) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// previous: the day before's { Sign: line }, so the new lines don't echo it.
export function prompt(previous) {
  const moods = pick(MOODS, 24);
  const areas = SIGNS.map(() => AREAS[Math.floor(Math.random() * AREAS.length)]);
  // One or two lines open with the sky; the rest get the other openings, with one or two
  // used twice to make 12.
  const sky = Math.random() < 0.5 ? 1 : 2;
  const rest = pick([...OPENINGS, ...pick(OPENINGS, 12 - OPENINGS.length)], 12 - sky);
  const openings = pick([...rest, ...Array(sky).fill(SKY)], 12);
  return `Write today's 12 horoscopes, one per sign, for a light-hearted experiment on the Barnum effect. Each must sound exactly like a real newspaper horoscope, yet be general enough that almost anyone reading it feels it fits their day.

How real horoscopes sound:
- They speak to the reader as "you" and say what the day holds: a mix of firm predictions ("you will", "is likely to") and hedged ones ("may", "could").
- They are about ordinary life: love, work, friends, home, a conversation, a plan. Other people often appear (someone, a friend, a colleague, a partner).
- They have a feeling to them, set by the two moods, but they show it through what happens; they never name the mood words.
- One or two sentences, 16 to 30 words in total.

Rules:
- Predict, never advise: no commands and no "should", "need to", "try", "don't" or "remember". Where a horoscope would give advice, say what is likely to happen instead.
- Never mention health, medicine, money or anyone's name, and no sign names.
- Ignore each sign's traditional traits; use only its moods, area and opening.
- Only lines whose opening says "the sky" may mention stars, the Moon or planets.
- Avoid "journey", "tapestry", "dance", "intertwine", "blend", "embrace" and "a sense of".
${previous ? '- Do not reuse or closely echo any of these lines from the day before:\n' + Object.values(previous).map((l) => '  ' + l).join('\n') + '\n' : ''}
These examples show the voice only. Never reuse their wording or ideas:
${pick(EXAMPLES, 5).map((e) => '- ' + e).join('\n')}

For each sign: two moods, a life area, and how the line opens.
${SIGNS.map((s, i) => `${s}: ${moods[i * 2]} + ${moods[i * 2 + 1]}; area: ${areas[i]}; opening: ${openings[i]}`).join('\n')}

Output exactly 12 lines and nothing else, in this format:
${SIGNS.map((s) => s + ': <horoscope>').join('\n')}`;
}

// The answer's text, whichever shape the model returns it in.
export function text(res) {
  if (typeof res === 'string') return res;
  if (typeof res?.response === 'string') return res.response;
  if (res?.choices) return res.choices[0]?.message?.content ?? '';
  if (res?.output) return res.output.filter((o) => o.type === 'message').flatMap((o) => o.content).map((c) => c.text).join('');
  return '';
}

// { Sign: line } for all 12 signs, or null if any is missing.
export function parse(answer) {
  const out = {};
  for (const raw of String(answer).split('\n')) {
    const m = raw.replace(/[*_#]/g, '').trim().match(/^([A-Za-z]+)\s*:\s*(.+)$/);
    if (!m) continue;
    const sign = SIGNS.find((s) => s.toLowerCase() === m[1].toLowerCase() || (s === 'Scorpius' && /^scorpio$/i.test(m[1])) || (s === 'Capricornus' && /^capricorn$/i.test(m[1])));
    const line = m[2].trim().replace(/^["“]|["”]$/g, '');
    if (sign && line.length > 10 && line.length < 260) out[sign] = line;
  }
  return SIGNS.every((s) => out[s]) ? out : null;
}

// What's wrong with a line, if anything: advice, banned topics, sign names, clichés, length.
const RULES = [
  ['advice', /^(don't|do not|try|take|make|be|let|go|keep|remember|consider|stay|avoid|give|focus|trust|listen|allow|accept|ask|spend|tell)\b|\b(you should|you need to|you must|you have to|make sure)\b/i],
  ['health or money', /\b(health|healthy|doctor|medic\w*|illness|sick|diet|money|cash|financ\w*|invest\w*|salary|debt|loan|bank)\b/i],
  ['a sign name', /\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpi\w*|sagittarius|capricorn\w*|aquarius|pisces)\b/i],
  ['a cliché', /\b(journey|tapestry|dance|intertwin\w*|blend\w*|embrac\w*)\b|\ba sense of\b/i]
];
export function problems(line) {
  const found = RULES.filter(([, rx]) => rx.test(line)).map(([name]) => name);
  const words = line.split(/\s+/).length;
  if (words < 12 || words > 36) found.push(words + ' words');
  return found;
}

const SYSTEM = 'You write short horoscopes in the voice of a newspaper astrology column, for a light-hearted experiment about the Barnum effect.';

// The request for one model. model: { id, options, format } from MODELS in wrangler.jsonc;
// options are model-specific (e.g. turning thinking off). format "responses" is for
// models that take OpenAI's Responses input (gpt-oss): with chat messages they spend the
// whole answer on reasoning.
function request(model, ask) {
  if (model.format === 'responses') return { instructions: SYSTEM, input: ask, ...(model.options || {}) };
  return {
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: ask }],
    max_tokens: 1200,
    temperature: 0.9,
    ...(model.options || {})
  };
}

// Asks the model up to 3 times with the same prompt and keeps the first answer with no
// problems, or else the one with the fewest. Returns { signs, issues: { Sign: [problem] } }.
export async function write(env, model, ask) {
  let best = null, last = '';
  const count = (x) => Object.keys(x.issues).length;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = text(await env.AI.run(model.id, request(model, ask)));
    const signs = parse(last);
    if (!signs) continue;
    const issues = Object.fromEntries(SIGNS.map((s) => [s, problems(signs[s])]).filter(([, p]) => p.length));
    if (!best || count({ issues }) < count(best)) best = { signs, issues };
    if (!count(best)) break;
  }
  if (!best) throw new Error(model.id + ': output did not contain 12 signs: ' + last.slice(0, 300));
  if (count(best)) console.log('[write] ' + model.id + ' kept with ' + JSON.stringify(best.issues));
  return best;
}
