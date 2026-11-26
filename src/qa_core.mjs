// The reference check. Each scene in the script says which objects/characters exist and what they do (beat.expect).
// This module compares that against what the renderer reports (window.probe in web/scene.js) and repairs the plan.
//   1. presence: every listed object and character must actually be on screen at some point in its scene
//   2. action:   every listed action must really happen (an object travels and lands, a glow shows, the camera shakes, a body goes limp, the body turns see-through)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hdist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function sampleTimes(beat) {
  const d = beat.end - beat.start;
  const ts = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => beat.start + f * d);
  if (beat.motion && beat.impactAt) ts.push(Math.min(beat.end - 0.02, beat.impactAt + 0.15));
  return [...new Set(ts.map((t) => +t.toFixed(3)))].sort((a, b) => a - b);
}

export function evaluate(beat, samples, i) {
  const ex = beat.expect;
  if (!ex) return [];
  const f = [];
  const add = (kind, extra, detail) => f.push({ beat: i, kind, ...extra, detail });

  for (const id of ex.objects || []) {
    if (!samples.some((s) => s.p.objects[id]?.visible && s.p.objects[id].onScreen)) add('presence', { id }, `object "${id}" is never visible on screen in scene ${i + 1}`);
  }
  for (const w of ex.chars || []) {
    if (!samples.some((s) => s.p.chars[w]?.visible && s.p.chars[w].onScreen)) add('presence', { who: w }, `character ${w} is never visible on screen in scene ${i + 1}`);
  }

  for (const a of ex.actions || []) {
    if (a.kind === 'motion') {
      const pts = samples.map((s) => s.p.objects[a.id]).filter(Boolean);
      if (!pts.length) continue;
      if (!beat.motion) { add('motion-missing', { id: a.id }, `"${a.id}" should ${a.style === 'drop' ? 'fall' : 'move'} but the scene has no motion`); continue; }
      const seen = pts.some((o) => o.visible && o.onScreen);
      // travelled far enough? Compare the furthest sampled position with the first; short planned paths (a 0.9 m flow) need less than 0.8 m
      const span = Math.max(...pts.map((o) => dist(pts[0].pos, o.pos)));
      const planned = a.at && a.from ? dist([a.from.x, a.from.y, a.from.z], [a.at.x, a.at.y, a.at.z]) : 0.8;
      const moved = span >= Math.min(0.8, 0.5 * planned);
      const last = samples[samples.length - 1].p;
      const target = a.at ? [a.at.x, a.at.y, a.at.z] : last.chars[a.to]?.pos;
      const landed = !target || hdist(pts[pts.length - 1].pos, target) < 1.3;
      if (!moved) add('motion-static', { id: a.id }, `"${a.id}" never moves in scene ${i + 1}`);
      else if (!seen) add('motion-unseen', { id: a.id }, `"${a.id}" moves but is never on screen`);
      if (moved && !landed) add('motion-miss', { id: a.id }, `"${a.id}" does not end up at its target`);
    } else if (a.kind === 'glow') {
      const ok = samples.some((s) => (a.id ? s.p.objects[a.id]?.glowing : s.p.chars[a.who]?.glowing));
      if (!ok) add('glow', { id: a.id, who: a.who }, `${a.id || 'character ' + a.who} should glow but does not`);
    } else if (a.kind === 'shake') {
      if (!samples.some((s) => s.p.shake >= 0.04)) add('shake', {}, `scene ${i + 1} should shake but the camera stays steady`);
    } else if (a.kind === 'ragdoll') {
      const late = samples.filter((s) => s.t >= beat.start + 0.35 * (beat.end - beat.start));
      if (!late.some((s) => s.p.chars[a.who]?.lying)) add('ragdoll', { who: a.who }, `character ${a.who} should go limp but stays upright`);
    } else if (a.kind === 'cutaway') {
      if (!samples.some((s) => (s.p.chars[a.who]?.skinOpacity ?? 1) < 0.5)) add('cutaway', { who: a.who }, `character ${a.who} should look see-through but stays solid`);
    }
  }
  for (const d of ex.dropped || []) add('unsupported', { id: d.id }, `"${d.id}" (${d.action}) cannot be shown: only one moving object per scene is supported`);
  return f;
}

const IMPACT_P = (b) => (b.ramp ? 0.5556 : 0.85); // same constants as web/scene.js and src/build_plan.mjs

// Fixes the plan for the failures found. Each repeated failure escalates to a stronger fix. Returns a list of what changed.
export function repair(plan, failures, round) {
  const changes = [];
  const note = (i, text) => changes.push(`scene ${i + 1}: ${text}`);
  for (const fl of failures) {
    const b = plan.beats[fl.beat];
    const ex = b.expect || {};
    if (fl.kind === 'presence') {
      if (round === 1 || b.shot !== 'wide') {
        Object.assign(b, { shot: 'wide', shotTarget: 'both', shotTo: null, focus: 'both' });
        note(fl.beat, `${fl.id || 'character ' + fl.who}: switched to a wide shot so it is in frame`);
      } else if (round === 2) {
        const clamp = (p) => { p.x = Math.max(-1.2, Math.min(1.2, p.x)); p.y = Math.min(p.y || 0, 3); p.z = Math.max(-3, Math.min(1.5, p.z)); };
        if (fl.id && b.layout?.[fl.id]) clamp(b.layout[fl.id]);
        if (fl.who && b.charLayout?.[fl.who]) clamp(b.charLayout[fl.who]);
        note(fl.beat, `${fl.id || 'character ' + fl.who}: moved inside the visible area`);
      } else {
        if (fl.id && b.layout?.[fl.id]) { b.layout[fl.id].x *= 0.5; b.layout[fl.id].z = 0.5; b.layout[fl.id].y = Math.min(b.layout[fl.id].y || 0, 1.8); }
        note(fl.beat, `${fl.id || 'character ' + fl.who}: pulled to the centre of the stage`);
      }
    } else if (fl.kind.startsWith('motion')) {
      const a = (ex.actions || []).find((x) => x.kind === 'motion' && x.id === fl.id);
      if (!a) continue;
      const victim = ex.chars?.[0];
      if (fl.kind === 'motion-missing' || fl.kind === 'motion-static') {
        b.motion = { prop: a.id, style: a.style, part: a.part, from: a.from, ...(a.at ? { at: a.at } : a.to && ex.chars?.includes(a.to) ? { to: a.to } : victim ? { to: victim } : { at: { x: 0, y: 0.3, z: 0.3 } }) };
        if (round >= 2 && fl.kind === 'motion-static') { // the same fix did not help: force a clearly visible 1.2 m travel
          const f0 = a.from || { x: 0, y: 1.5, z: 0 };
          b.motion = { prop: a.id, style: a.style, part: a.part, from: f0, at: { x: f0.x, y: Math.max(0.2, f0.y - 1.2), z: f0.z } };
        }
        b.impactAt = b.start + IMPACT_P(b) * (b.end - b.start);
        note(fl.beat, `"${a.id}": motion rebuilt`);
      } else if (fl.kind === 'motion-unseen') {
        Object.assign(b, { shot: 'wide', shotTarget: 'both', shotTo: null, focus: 'both' });
        note(fl.beat, `"${a.id}": wide shot so the movement is visible`);
      } else if (fl.kind === 'motion-miss') {
        if (victim) b.motion = { ...b.motion, to: victim, at: undefined };
        else b.motion = { ...b.motion, to: undefined, at: { x: b.motion.from?.x || 0, y: 0.15, z: b.motion.from?.z || 0 } };
        note(fl.beat, `"${a.id}": landing target corrected`);
      }
    } else if (fl.kind === 'glow') {
      b.highlight = fl.id ? { prop: fl.id, color: 'orange' } : { who: fl.who, part: 'chest', color: 'red' };
      note(fl.beat, 'glow highlight applied');
    } else if (fl.kind === 'shake') {
      b.shake = 0.09;
      note(fl.beat, 'camera shake applied');
    } else if (fl.kind === 'ragdoll') {
      b['pose' + fl.who] = 'collapse';
      note(fl.beat, `character ${fl.who} set to collapse`);
    } else if (fl.kind === 'cutaway') {
      Object.assign(b, { shot: 'xray', shotTarget: fl.who, shotPart: b.shotPart || 'chest' });
      note(fl.beat, `X-ray shot so character ${fl.who} turns see-through`);
    }
  }
  return changes;
}
