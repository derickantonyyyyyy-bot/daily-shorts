// Writes today's short as a *directed scene*: narration, two characters with a relationship,
// a setting, a few purposeful props, and per-beat staging (poses, eye lines, who holds what, camera focus, SFX).
import fs from 'node:fs';
import { director, parseJson } from './llm.mjs';
import { HUMAN_RULES, scrub } from './human.mjs';

// Default format: the 10-scene blueprint (src/script_blueprint.mjs). Set SCRIPT_FORMAT=classic for the two-character director below.
if ((process.env.SCRIPT_FORMAT || 'blueprint') === 'blueprint') {
  await import('./script_blueprint.mjs');
  process.exit(0);
}

const POSES = ['calm', 'walk', 'curious', 'confusion', 'fear', 'shock', 'pain', 'collapse', 'run'];
const SHOTS = ['wide', 'suspense', 'hazard_ecu', 'impact_closeup', 'ots', 'crash_zoom', 'xray', 'cutaway', 'snorricam',
  'worm_eye', 'top_down', 'projectile_pov', 'panic_track', 'whip_pan', 'orbit'];
const SHOT_ALIAS = { low_angle: 'worm_eye' }; // older name for the same shot
const BODY_SHOTS = ['xray', 'cutaway', 'snorricam', 'crash_zoom', 'panic_track']; // target must be a character
const PARTS = ['head', 'chest', 'arm', 'leg'];
const GLOWS = ['red', 'orange', 'green'];
const LAYERS = ['foreground', 'midground', 'background'];
// A different lane each weekday keeps the channel from drifting into the same few topics.
const THEMES = [
  'geology, weather and space',                       // Sun
  'the body: mechanisms, medicine, odd case histories', // Mon
  'engineering failures and near-misses',             // Tue
  'history oddities with a real paper trail',         // Wed
  'animal biology that sounds fake but is not',       // Thu
  'physics hiding inside everyday objects',           // Fri
  'food and kitchen chemistry',                       // Sat
];
const theme = THEMES[new Date().getUTCDay()];

fs.mkdirSync('work', { recursive: true });
fs.mkdirSync('data', { recursive: true });
const histPath = 'data/history.json';
const history = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
const recent = history.slice(-60).map((h) => h.title).join(' | ') || 'none yet';

const example = JSON.stringify({
  title: '...',
  description: '...',
  tags: ['...'],
  characters: {
    A: { name: 'Maya', role: 'night-shift nurse', attitude: 'tired, sarcastic' },
    B: { name: 'Leo', role: 'new intern', attitude: 'overconfident, fidgety' },
  },
  relationship: 'one line: how they feel about each other and what is at stake',
  setting: { name: 'hospital supply room', wall: '#c9d6d3', floor: '#9aa5a3' },
  props: [
    { id: 'ceramic_mug', name: 'chipped ceramic mug', purpose: 'Maya grips it when stressed', layer: 'midground', x: 0.2, holdable: true, weight: 0.3 },
  ],
  beats: [
    {
      text: 'max 14 spoken words',
      action: 'who touches/uses which object and how, tied to this line',
      poseA: 'calm', poseB: 'curious',
      lookA: 'B', lookB: 'ceramic_mug',
      holdA: 'ceramic_mug', holdB: null,
      focus: 'both',
      shot: 'suspense', shotTarget: 'A', shotTo: null, shotPart: 'chest', shotWho: null,
      ramp: false,
      motion: null,
      highlight: null,
      sfx: { text: 'short sound effect description', seconds: 1.2 },
    },
  ],
}, null, 1);

const prompt = `You are the writer-director of a daily 35-45 second vertical "edutainment" short. A stiff, uncanny
3D mannequin cast acts out a real, surprising fact while a deadpan narrator explains it.

TODAY'S LANE: ${theme}.

MAKE IT NON-GENERIC
- Pick a specific, lesser-known real mechanism, case or fact in today's lane. Avoid overused hooks
  (sleep deprivation, "what if you stopped eating", the Moon vanishing, etc.).
- Include at least one concrete detail (a number, a place type, a named mechanism). Only state facts you are
  highly confident are true. No invented statistics. No real named people.
- Dark-comic is fine; keep it non-graphic. No suicide/self-harm, no instructions for anything dangerous.
- Do NOT reuse these recent topics: ${recent}

STAGING RULES (apply to every beat)
- Two characters, A and B, with different goals or attitudes and a clear relationship and small stake.
  Their body language should contrast (e.g. A leans in, B backs away).
- Say exactly who touches or uses which object and how, and tie that action to the narration line
  (e.g. A grips the chipped mug while staring at B). Give objects a purpose that shows mood, habit or tension;
  never have a character hold an item passively.
- Eye lines: lookA / lookB point at the centre of the interaction: "A", "B", a prop id, or "camera" (rarely). Use null for the default.
- Layout: spread props across foreground / midground / background, use "focus" ("A", "B", "both" or a prop id)
  so the camera guides the eye to where the action is.
- Weight and contact: a heavy holdable prop (weight near 1) should visibly drag the holder's posture.
- Keep it tight: 2 characters, 3-5 props total, 10-14 short beats.

CAMERA DIRECTION (vertical 9:16, under 60 s). The camera is a hyper-caffeinated invisible drone: it never sits still,
rockets through Z instead of cutting, and points at exactly what the narration says. Lenses are wide (16-24 mm), everything
stays in sharp focus, and every move is a hard linear snap on the syllable. Keep beats SHORT: 10-14 beats, at most 10 spoken words each.
Pick one "shot" per beat from: ${SHOTS.join(', ')}.
- wide: eye-level medium, 24 mm, character waist-up (or both) with a static or ultra-slow push-in: someone doing something normal. Use "focus".
- suspense: creeping push-in with a slight Dutch tilt toward shotTarget; a calm, unaware character beside the hazard.
- hazard_ecu: extreme close-up on a prop (shotTarget = prop id; it fills ~70% of the frame): a whip-pan DOWN from the character (shotTo = "A"/"B") to reveal the threat (frayed wire, tiny insect, rusty nail).
- impact_closeup: starts tight on a mundane prop (shotTarget = prop id) then whips out to reveal the character beside it (shotTo).
- ots: tight behind the ear of shotWho ("A"/"B"), looking down at their hands or the object shotTarget, with a slight handheld sway, while they unknowingly interact with the hazard.
- crash_zoom: the camera rockets forward through Z into the eyes of shotTarget ("A"/"B") and stops millimetres away at the moment of realisation (shock pose, frozen).
- xray: rapid Z-axis dive THROUGH the skin and clothes of shotTarget ("A"/"B") to shotPart; the damaged part glows.
- cutaway: 45-degree isometric cross-section; the outer layer of shotTarget ("A"/"B") slices cleanly away at shotPart (${PARTS.join('/')}) to show the inside (throat, chest, bone).
- snorricam: camera locked to the chest of shotTarget ("A"/"B"): their body stays frozen centre-frame while the world spins; use with pain/fear/run, ends with a rapid backward pull.
- worm_eye: inches off the floor, tilted up past a dangerous prop (shotTarget = prop id) toward the looming, terrified face of shotTo ("A"/"B"). Also accepts "low_angle".
- top_down: God's eye, 90 degrees to the floor. Two uses only: a character walking blindly toward a floor hazard ("walk" pose) and the stiff ragdoll aftermath ("collapse" pose), which ends on a slow pull-up.
- projectile_pov: missile cam: rides just behind the flying object of this same beat's "motion" (a falling icicle, a shard, a swallowed pill) as it hurtles at the character. REQUIRES "motion" on the beat.
- panic_track: handheld tracking right in front of the face of shotTarget ("A"/"B") in the "run" pose, running at the lens.
- whip_pan: quick whips between a confused face (shotTarget "A"/"B") and the strange object (shotTo = prop id); use the confusion pose.
- orbit: 180-degree orbit freeze around hazard and victim: time slows near zero (use "ramp": true) while the camera sweeps half a circle. Put a "motion" on the beat so the orbit centres between hazard and victim.
Typical arc for a 15-second stretch: wide (normal) -> hazard_ecu (reveal the threat) -> ots (they unknowingly touch it) -> xray or cutaway (internal damage glows red) -> snorricam or worm_eye (violent shake, pain/panic) -> top_down (motionless, slow pull-up that resets for the loop). Vary it and never use the same shot twice in a row.
Speed ramp: "ramp": true on the single most dangerous beat. Action plays at normal speed, drops to ~10% at the moment of danger, then catches up. Use at most 2 per video.
Motion: to have an object hit someone, set "motion": {"prop":"<holdable or fixed prop id>","to":"A"|"B","part":"head|chest|arm|leg","style":"drop"|"fly"}. It lands at the impact moment (put an sfx on the same beat; it is timed to the impact automatically). Use at most 2 per video.
Highlight: "highlight": {"prop":"<id>","color":"red|orange|green"} or {"who":"A"|"B","part":"chest","color":"red"} makes the hazard or injured part glow against a desaturated scene. Use on the key beats; xray beats auto-highlight their part.
Loop: the LAST beat should return characters and camera to the opening look (calm poses, same shot, nothing held) so the Short loops seamlessly. The FIRST beat should start calm with nothing held.

${HUMAN_RULES}

OUTPUT: JSON only, no code fences, in exactly this shape (replace values):
${example}

Field rules:
- narration is the concatenation of every beat "text": 90-120 words total, hook first, twist last. Each shot must land on the exact words it illustrates.
- poseA / poseB are one of: ${POSES.join(', ')}. "walk" is a stiff deadpan stroll toward the lens (before a hazard). Use shock/fear/pain/collapse/run only when the story says something goes wrong.
- lookA/lookB, holdA/holdB, focus must be valid ids (props you defined, "A", "B", "both", "camera" as appropriate).
- holdA/holdB must be a prop with holdable true. Holdable props must be small (a cup, tool, phone, vial).
- sfx is optional per beat (null when none); at most 6 across the video; "seconds" between 0.5 and 3.
- layer is one of: ${LAYERS.join(', ')}. x is between -2 and 2. weight is 0 to 1.
- wall/floor are #rrggbb colours that suit the setting.`;

const raw = await director(prompt);
const s = parseJson(raw);

// ---------- validate and normalise ----------
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
const num = (v, d, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : d);

s.characters = s.characters || {};
for (const k of ['A', 'B']) {
  const c = s.characters[k] || {};
  s.characters[k] = { name: String(c.name || (k === 'A' ? 'Maya' : 'Leo')), role: String(c.role || ''), attitude: String(c.attitude || '') };
}
s.setting = { name: String(s.setting?.name || 'room'), wall: hex(s.setting?.wall, '#aebfcc'), floor: hex(s.setting?.floor, '#d8dde2') };

const props = [];
for (const p of (s.props || []).slice(0, 6)) {
  const id = slug(p.id || p.name);
  if (!id || props.some((q) => q.id === id)) continue;
  props.push({
    id,
    name: String(p.name || id),
    purpose: String(p.purpose || ''),
    layer: LAYERS.includes(p.layer) ? p.layer : 'midground',
    x: num(p.x, 0, -2, 2),
    holdable: Boolean(p.holdable),
    weight: num(p.weight, 0.3, 0, 1),
  });
}
s.props = props;
const propIds = new Set(props.map((p) => p.id));
const holdable = new Set(props.filter((p) => p.holdable).map((p) => p.id));

const okLook = (v, who) => {
  if (v == null || v === 'null') return null;
  const other = who === 'A' ? 'B' : 'A';
  return v === 'camera' || v === other || propIds.has(v) ? v : null;
};

let sfxCount = 0;
s.beats = (s.beats || [])
  .filter((b) => b && typeof b.text === 'string' && b.text.trim())
  .map((b) => {
    let sfx = null;
    if (b.sfx && b.sfx.text && sfxCount < 6) {
      sfx = { text: String(b.sfx.text).slice(0, 200), seconds: num(b.sfx.seconds, 1.2, 0.5, 3) };
      sfxCount++;
    }
    const tgt = (v, d) => (v === 'A' || v === 'B' || v === 'both' || propIds.has(v) ? v : d);
    let shot = SHOTS.includes(SHOT_ALIAS[b.shot] ?? b.shot) ? SHOT_ALIAS[b.shot] ?? b.shot : 'wide';
    const m = b.motion;
    const motion = m && propIds.has(m.prop) && (m.to === 'A' || m.to === 'B')
      ? { prop: m.prop, to: m.to, part: PARTS.includes(m.part) ? m.part : 'chest', style: m.style === 'fly' ? 'fly' : 'drop' }
      : null;
    const h = b.highlight;
    const highlight = h && (propIds.has(h.prop) || ((h.who === 'A' || h.who === 'B') && PARTS.includes(h.part)))
      ? { prop: propIds.has(h.prop) ? h.prop : null, who: h.who === 'A' || h.who === 'B' ? h.who : null, part: PARTS.includes(h.part) ? h.part : 'chest', color: GLOWS.includes(h.color) ? h.color : 'red' }
      : null;
    const focus = b.focus === 'A' || b.focus === 'B' || b.focus === 'both' || propIds.has(b.focus) ? b.focus : 'both';
    // shots that need a particular kind of target fall back to something that always works
    const fixed = { shot, target: tgt(b.shotTarget, focus) };
    if (BODY_SHOTS.includes(fixed.shot) && fixed.target !== 'A' && fixed.target !== 'B') fixed.target = 'A';
    if (['hazard_ecu', 'impact_closeup'].includes(fixed.shot) && !propIds.has(fixed.target)) fixed.shot = 'wide'; // needs a prop to frame
    if (fixed.shot === 'projectile_pov') {
      if (motion) fixed.target = motion.prop;
      else fixed.shot = 'wide';
    }
    return {
      text: scrub(b.text.trim()),
      action: String(b.action || ''),
      poseA: POSES.includes(b.poseA) ? b.poseA : 'calm',
      poseB: POSES.includes(b.poseB) ? b.poseB : 'calm',
      lookA: okLook(b.lookA, 'A'),
      lookB: okLook(b.lookB, 'B'),
      holdA: holdable.has(b.holdA) ? b.holdA : null,
      holdB: holdable.has(b.holdB) && b.holdB !== b.holdA ? b.holdB : null,
      focus,
      shot: fixed.shot,
      shotTarget: fixed.target,
      shotTo: tgt(b.shotTo, null),
      shotPart: PARTS.includes(b.shotPart) ? b.shotPart : 'chest',
      shotWho: b.shotWho === 'B' ? 'B' : 'A',
      ramp: Boolean(b.ramp),
      motion,
      highlight,
      sfx,
    };
  });
let ramps = 0, motions = 0;
for (const b of s.beats) {
  if (b.ramp && ++ramps > 2) b.ramp = false;
  if (b.motion && ++motions > 2) b.motion = null;
}
if (s.beats.length < 4) throw new Error('Script has too few beats');

s.title = String(s.title || 'Daily Curiosity').slice(0, 90);
s.description = String(s.description || '');
s.tags = Array.isArray(s.tags) ? s.tags.slice(0, 15) : [];
s.relationship = String(s.relationship || '');

fs.writeFileSync('work/script.json', JSON.stringify(s, null, 2));
fs.writeFileSync('work/narration.txt', s.beats.map((b) => b.text).join(' '));
history.push({ date: new Date().toISOString().slice(0, 10), title: s.title, setting: s.setting.name });
fs.writeFileSync(histPath, JSON.stringify(history.slice(-200), null, 2));
console.log(`Script ready (${theme}):`, s.title);
