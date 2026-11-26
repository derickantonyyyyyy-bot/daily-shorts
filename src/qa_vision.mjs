// Second reference check, on the RENDERED frames: a vision model looks at one frame per scene and says whether the objects and
// characters the script promised are visible and whether the frame matches the promised action.
// Report only (work/qa_vision.json); it cannot repair a finished render. QA_VISION_STRICT=1 fails the workflow on many mismatches.
import fs from 'node:fs';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.log('ANTHROPIC_API_KEY not set, skipping the vision check.');
  process.exit(0);
}
const plan = JSON.parse(fs.readFileSync('work/plan.json', 'utf8'));
const FPS = 30;
const lastFrame = Math.ceil(plan.duration * FPS) - 1;
const frameFile = (t) => `work/frames/f${String(Math.min(lastFrame, Math.max(0, Math.round(t * FPS)))).padStart(5, '0')}.jpg`;
const nameOf = Object.fromEntries(plan.props.map((p) => [p.id, p.name]));

function expectation(b) {
  const ex = b.expect || {};
  const objs = (ex.objects || []).map((id) => `"${id}" (a ${nameOf[id] || id})`);
  const acts = (ex.actions || []).map((a) => {
    if (a.kind === 'motion') return `"${a.id}" is ${a.style === 'drop' ? 'falling' : 'moving'} ${a.to ? 'toward character ' + a.to : 'through the scene'} (a single frame may catch it mid-path)`;
    if (a.kind === 'glow') return `${a.id ? '"' + a.id + '"' : 'character ' + a.who} glows`;
    if (a.kind === 'shake') return 'the whole frame looks shaken';
    if (a.kind === 'ragdoll') return `character ${a.who} lies limp on the floor`;
    return `character ${a.who}'s body looks see-through with a skeleton visible`;
  });
  return { objs, chars: ex.chars || [], acts };
}

const content = [{
  type: 'text',
  text: `You are checking frames from a vertical 3D animation made of simple mannequins ("character A" and "character B") and props built from a few primitive shapes, so judge recognisability generously (a cat is a few ellipsoids and cones). For each scene one frame is shown with what the script says must be in it. Answer with JSON only, no code fences:
{"scenes":[{"scene":1,"objects":{"<object id>":true},"characters":true,"action_ok":true,"note":"max 12 words"}]}
- objects: true if that object is visible and recognisable in the frame, else false.
- characters: true if every listed character is visible, false if one is missing, null if none are listed.
- action_ok: true if the frame is consistent with every listed action, false if not, null if no action is listed.`,
}];
const shown = [];
plan.beats.forEach((b, i) => {
  const e = expectation(b);
  const t = b.impactAt && e.acts.length ? b.impactAt : b.start + 0.5 * (b.end - b.start);
  const file = frameFile(t);
  if (!fs.existsSync(file)) return;
  shown.push(i);
  content.push({
    type: 'text',
    text: `Scene ${i + 1}. Objects that must be visible: ${e.objs.join(', ') || 'none'}. Characters: ${e.chars.join(', ') || 'none'}. Actions: ${e.acts.join('; ') || 'none'}.`,
  });
  content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(file).toString('base64') } });
});

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 3000, messages: [{ role: 'user', content }] }),
});
if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
const text = (await res.json()).content.map((c) => c.text || '').join('').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
const out = JSON.parse(text);

const problems = [];
for (const sc of out.scenes || []) {
  const missing = Object.entries(sc.objects || {}).filter(([, v]) => v === false).map(([k]) => k);
  if (missing.length) problems.push(`scene ${sc.scene}: not visible: ${missing.join(', ')}`);
  if (sc.characters === false) problems.push(`scene ${sc.scene}: a listed character is missing`);
  if (sc.action_ok === false) problems.push(`scene ${sc.scene}: action not visible${sc.note ? ' (' + sc.note + ')' : ''}`);
}
fs.writeFileSync('work/qa_vision.json', JSON.stringify({ checked: shown.map((i) => i + 1), problems, raw: out }, null, 2));
console.log(`Vision check: ${shown.length} scenes, ${problems.length} problem(s)`);
for (const p of problems) console.log('  -', p);
if (problems.length > 3 && process.env.QA_VISION_STRICT === '1') process.exit(1);
