// Rules and a light scrubber so the narration doesn't read like machine text.
export const HUMAN_RULES = `HUMAN VOICE RULES (the narration must not sound machine-written)
- Burstiness: mix short punchy lines (5-7 words) with longer ones (11-14 words). Never let three lines in a row have the same rhythm.
- Plain words: use everyday words, the way a friend would say it. Never use: delve, tapestry, testament, crucial, pivotal, foster, moreover, furthermore, utilize, leverage, realm, intricate, plethora, "a myriad of", "it is important to note".
- Active voice and contractions: say "Doctors found it", not "It was found by doctors". Use it's, don't, here's, you'd, can't.
- No fluff: no "Let's explore", "Did you know", "In this video", no recap and no neat moral at the end. Start inside the situation and end on the last hard fact.
- Personal perspective: one concrete, slightly odd detail, a mild opinion, or a single rhetorical question where it fits ("Sounds harmless, right?"). Do not overdo it.
- No em dashes and no lists of three adjectives.`;

const SWAPS = [
  [/\bdelv(e|es|ed|ing)\b/gi, 'dig'],
  [/\btapestry\b/gi, 'mix'],
  [/\btestament\b/gi, 'proof'],
  [/\b(crucial|pivotal)\b/gi, 'key'],
  [/\bfoster(s|ed|ing)?\b/gi, 'build'],
  [/\b(moreover|furthermore)\b,?\s*/gi, ''],
  [/\b(utilize|utilise|leverage)(s|d)?\b/gi, 'use'],
  [/\brealm\b/gi, 'world'],
  [/\bintricate\b/gi, 'tricky'],
  [/\bplethora\b/gi, 'pile'],
  [/\ba myriad of\b/gi, 'plenty of'],
  [/\bin conclusion,?\s*/gi, ''],
  [/\bit is important to note that\s*/gi, ''],
  [/\bdid you know( that)?,?\s*/gi, ''],
  [/\s*[—–]\s*/g, ', '],
];

export function scrub(text) {
  let s = String(text || '');
  for (const [re, to] of SWAPS) s = s.replace(re, to);
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.?!])/g, '$1').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A different lane each weekday keeps the channel from drifting into the same few topics.
const LANES = [
  'geology, weather and space',
  'the body: mechanisms, medicine, odd case histories',
  'engineering failures and near-misses',
  'history oddities with a real paper trail',
  'animal biology that sounds fake but is not',
  'physics hiding inside everyday objects',
  'food and kitchen chemistry',
];
export const todaysLane = () => LANES[new Date().getUTCDay()];
