// "Scene blueprint" format: the LLM picks ONLY from a fixed directory of places, anchors and cameras, so objects can
// never land in mid-air. This module holds the directory, the prompt, a strict validator and the converter that turns
// the 10 scenes into the plan the renderer already understands (characters, props, beats with shots).
import { HUMAN_RULES, scrub } from './human.mjs';
import { isCreature } from './recipes.mjs';

const R = (n) => Math.round(n * 100) / 100;

// Anchor values are [x, y, z] in stage metres (y up, +z toward the camera). In the anatomy place the anchors are
// organ positions on the dummy, which stands at the centre.
export const PLACES = {
  studio_void: {
    desc: 'Neutral gray/white testing room',
    wall: '#d9dde0', floor: '#c4c9cd',
    anchors: { ANCHOR_CENTER_FLOOR: [0, 0, 0], ANCHOR_LEFT_STAND: [-1.1, 0, 0], ANCHOR_RIGHT_STAND: [1.1, 0, 0], ANCHOR_OVERHEAD_DROP: [0, 4.2, 0] },
    cameras: ['CAM_WIDE_FRONT', 'CAM_MEDIUM_ACTOR', 'CAM_CLOSEUP_CENTER'],
    dressing: [],
  },
  elevator_interior: {
    desc: 'Metallic elevator cabin',
    wall: '#8d9399', floor: '#5d6166',
    anchors: { ANCHOR_FLOOR_CENTER: [0, 0, 0], ANCHOR_FLOOR_FLAT: [0, 0, 0.5], ANCHOR_WALL_BACK: [0, 1.2, -1.6], ANCHOR_PANEL_RIGHT: [1.5, 1.3, -1.45], ANCHOR_CEILING_CABLE: [0, 4.5, -0.6] },
    cameras: ['CAM_CORNER_HIGH', 'CAM_LOW_FLOOR', 'CAM_CLOSEUP_PANEL'],
    dressing: [
      { shape: 'box', size: [3.8, 3.4, 0.1], pos: [0, 1.7, -1.75], rot: [0, 0, 0], color: '#a9afb5' },
      { shape: 'box', size: [0.5, 1.2, 0.1], pos: [1.5, 1.3, -1.65], rot: [0, 0, 0], color: '#2b2f33' },
    ],
  },
  hospital_room: {
    desc: 'Sterile medical room with exam bed',
    wall: '#dfe9e8', floor: '#b9c7c6',
    anchors: { ANCHOR_BED_SURFACE: [0, 0.95, -0.3], ANCHOR_BED_HEAD: [-0.9, 0.95, -0.3], ANCHOR_SIDE_TABLE: [1.5, 0.8, -0.5], ANCHOR_MONITOR_STAND: [1.6, 1.45, -1.5], ANCHOR_DOCTOR_POS: [1.0, 0, 0.5] },
    cameras: ['CAM_WIDE_ROOM', 'CAM_CLOSEUP_PATIENT', 'CAM_XRAY_BODY'],
    dressing: [
      { shape: 'box', size: [2.6, 0.5, 1.1], pos: [0, 0.7, -0.3], rot: [0, 0, 0], color: '#e8eef0' },
      { shape: 'box', size: [0.5, 0.8, 0.5], pos: [1.5, 0.4, -0.5], rot: [0, 0, 0], color: '#cfd6d9' },
      { shape: 'cylinder', size: [0.04, 1.3], pos: [1.6, 0.65, -1.5], rot: [0, 0, 0], color: '#555b60' },
      { shape: 'box', size: [0.5, 0.35, 0.1], pos: [1.6, 1.45, -1.5], rot: [0, 0, 0], color: '#1d2a33' },
    ],
  },
  locked_doorway: {
    desc: 'Wooden door inside a concrete doorframe',
    wall: '#7d7a75', floor: '#5a5855',
    anchors: { ANCHOR_LATCH_GAP: [0.5, 1.1, -1.5], ANCHOR_DOOR_HANDLE: [0.55, 1.15, -1.4], ANCHOR_FLOOR_MAT: [0, 0, -0.4], ANCHOR_HINGE_TOP: [-0.7, 2.3, -1.5] },
    cameras: ['CAM_MACRO_LATCH', 'CAM_EYE_LEVEL_DOOR', 'CAM_SIDE_ANGLE'],
    dressing: [
      { shape: 'box', size: [1.4, 2.6, 0.1], pos: [0, 1.3, -1.6], rot: [0, 0, 0], color: '#8b5a2b' },
      { shape: 'box', size: [0.15, 2.8, 0.2], pos: [-0.8, 1.4, -1.6], rot: [0, 0, 0], color: '#8d8d88' },
      { shape: 'box', size: [0.15, 2.8, 0.2], pos: [0.8, 1.4, -1.6], rot: [0, 0, 0], color: '#8d8d88' },
      { shape: 'box', size: [1.2, 0.03, 0.7], pos: [0, 0.015, -0.4], rot: [0, 0, 0], color: '#3a3a3a' },
    ],
  },
  street_crosswalk: {
    desc: 'Asphalt road with sidewalk and traffic lane',
    wall: '#9fb4c8', floor: '#3b3d40',
    anchors: { ANCHOR_CROSSWALK_CENTER: [0, 0, 0.2], ANCHOR_LANE_ONCOMING: [1.2, 0, -3], ANCHOR_CURB_SAFE: [-1.8, 0.15, 0.4], ANCHOR_POLE_TOP: [-1.9, 3.8, -1.5] },
    cameras: ['CAM_STREET_WIDE', 'CAM_DRIVER_POV', 'CAM_LOW_IMPACT'],
    dressing: [
      ...[-1.2, -0.45, 0.3, 1.05, 1.8].map((z) => ({ shape: 'box', size: [2.6, 0.01, 0.3], pos: [0, 0.005, z], rot: [0, 0, 0], color: '#f2f2f2' })),
      { shape: 'box', size: [1.2, 0.15, 3.4], pos: [-2.4, 0.075, 0], rot: [0, 0, 0], color: '#9a9a96' },
      { shape: 'cylinder', size: [0.05, 4], pos: [-1.9, 2, -1.5], rot: [0, 0, 0], color: '#2e3236' },
    ],
  },
  underwater_deep: {
    desc: 'Dark ocean environment with sandy floor',
    wall: '#0c2a44', floor: '#c2b280',
    anchors: { ANCHOR_MID_WATER: [0, 1.5, 0], ANCHOR_OCEAN_FLOOR: [0, 0, 0], ANCHOR_SURFACE_ABOVE: [0, 4.5, 0], ANCHOR_PERIMETER_SHADOW: [-2.2, 1.2, -2.5] },
    cameras: ['CAM_UNDERWATER_WIDE', 'CAM_CLOSEUP_FACE', 'CAM_ABOVE_LOOKING_DOWN'],
    dressing: [],
  },
  human_anatomy_cutaway: {
    desc: 'Translucent human torso/head silhouette for internal processes',
    wall: '#10151c', floor: '#1d2430',
    anchors: { ANCHOR_HEART: [0.07, 1.75, 0.15], ANCHOR_LUNGS: [0, 1.85, 0.1], ANCHOR_STOMACH: [0, 1.35, 0.12], ANCHOR_BRAIN: [0, 2.32, 0.05], ANCHOR_THROAT_PIPE: [0, 2.02, 0.05], ANCHOR_BLOODSTREAM: [-0.32, 1.35, 0.05] },
    cameras: ['CAM_TORSO_FRONT', 'CAM_MACRO_ORGAN', 'CAM_FLOW_TRACK'],
    dressing: [],
  },
};
export const ANATOMY = 'human_anatomy_cutaway';

export const MATERIALS = ['worn_metal', 'matte_plastic', 'skin_dummy', 'translucent_blue', 'wood_oak', 'concrete'];
const MATERIAL_COLOR = { worn_metal: '#8a9099', matte_plastic: '#c8553d', skin_dummy: '#dcae8f', translucent_blue: '#6fb7e8', wood_oak: '#9b6b3a', concrete: '#8d8d88' };
export const EXPRESSIONS = ['neutral', 'curious', 'fear', 'pain', 'shock'];
export const POSES = ['idle_stand', 'lying_flat', 'crouching', 'recoil_back', 'clutching_chest', 'falling'];
import { PERFORMS } from './blocks.mjs';
export const ACTIONS = ['static', 'shake_violent', 'drop_gravity', 'slide_inward', 'pulse_glow', 'ragdoll_hit', 'flow_path', ...PERFORMS];

// ---------- prompt ----------
function directory() {
  return Object.entries(PLACES)
    .map(([name, p], i) => `${i + 1}. place: "${name}" (${p.desc})
   - valid_anchors: ${JSON.stringify(Object.keys(p.anchors))}
   - valid_cameras: ${JSON.stringify(p.cameras)}`)
    .join('\n\n');
}

export function buildPrompt(lane, recent) {
  return `You are an automated 3D Short-Form Video Director and Scriptwriter. Your job is to convert a topic into a 10-scene, high-retention edutainment script AND a strict 3D scene layout blueprint in valid JSON format.

TODAY'S LANE: ${lane}. Pick a specific, lesser-known real mechanism, case or fact in that lane (a concrete number, place type or named mechanism; only facts you are highly confident are true; no invented statistics; no real named people). Avoid overused hooks (sleep deprivation, "what if you stopped eating", the Moon vanishing). Do NOT reuse these recent topics: ${recent}

### 1. STORYTELLING & SCRIPT RULES
- Output EXACTLY 10 scenes.
- Each scene's "narration" is ONE crisp spoken sentence. Most are 8 to 12 words; at least two are 7 words or fewer and at least two are 12 to 14 words.
- Tone: direct, matter-of-fact, slightly dramatic edutainment. Dark-comic is fine; keep it non-graphic. Nothing about suicide or self-harm, no instructions for anything dangerous.
- Structure:
  - Scene 1: Immediate visual hook introducing the situation or object (no intro, no greeting).
  - Scene 2: What people normally expect to happen.
  - Scene 3: The twist, hidden mechanism, or real danger.
  - Scenes 4-10: Step-by-step physical escalation, internal body/object mechanics, and the final outcome. The last scene ends on the last hard fact, not a moral.

${HUMAN_RULES}

### 2. STRICT 3D PLACE & ANCHOR DIRECTORY
You MUST ONLY use the exact "place" names and corresponding "anchor" and "camera" names listed below. Never invent new place, anchor or camera names. A scene happens in ONE place; the story may move between places from scene to scene.

${directory()}

### 3. OBJECT & ANIMATION RULES
- Use simple, concrete nouns for "object_type" (e.g. "human_dummy", "wooden_chair", "metal_cylinder", "credit_card", "water_wave", "sphere_particle", "scalpel", "car_sedan", "icicle", "pressure_cooker"). Creatures and characters are allowed as objects too ("cat", "bee", "shark", "robot", "spider"): they are built from combined shapes and get a small idle animation. "human_dummy" is the actor; use at most 2 different dummies in the whole video, and reuse the same "id" for the same dummy or object across scenes.
- "placements" has 1 to 5 entries per scene. At most 2 dummies per scene.
- Use "is_cutaway": true ONLY when showing inside a body, wall, or machine.
- Use "expression" ONLY on "human_dummy" actors: ${JSON.stringify(EXPRESSIONS)}.
- Use "pose" ONLY on "human_dummy" actors: ${JSON.stringify(POSES)}.
- "material" is one of: ${JSON.stringify(MATERIALS)}.
- Use "action" to tell the renderer how the object moves during the scene: ${JSON.stringify(ACTIONS)}. Use "drop_gravity" for something falling onto a dummy or the floor, "ragdoll_hit" when a dummy is struck and goes limp, "pulse_glow" for the hazard or injured part, "flow_path" for something travelling through (blood, water, a particle). Use drop_gravity, ragdoll_hit, slide_inward or flow_path in at most 3 scenes in the whole video and at most ONE such action per scene Block creatures and people can also PERFORM: ${JSON.stringify(PERFORMS)} (walk and dance swing the legs, wave lifts an arm, hop jumps, flap beats wings, wag swings the tail, nod bobs the head, spin turns on the spot, wobble sways). Use a perform action for a living or toy-like object that should visibly do something, at most 2 performers per scene (the renderer shows one moving object per scene; everything you list in a scene must really be visible and really do its action, because the finished video is checked against this script).
- Vary the camera: never use the same camera twice in a row.

### 4. OUTPUT FORMAT
Return ONLY raw, valid JSON. No markdown code fences, no explanations, no extra text. Follow this exact schema:

{
  "video_title": "Short Curiosity-Driven Title (Under 50 chars)",
  "scenes": [
    {
      "scene_id": 1,
      "narration": "One spoken sentence.",
      "place": "exact_place_name",
      "camera": "exact_camera_name",
      "is_cutaway": false,
      "placements": [
        {
          "id": "unique_object_id",
          "object_type": "primitive_noun",
          "anchor": "exact_anchor_name_for_that_place",
          "material": "worn_metal",
          "pose": "optional_pose_if_human_dummy",
          "expression": "optional_expression_if_human_dummy",
          "action": "exact_action_name"
        }
      ]
    }
  ]
}`;
}

// ---------- validation: anything off-directory is repaired, never passed on ----------
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

export function validate(raw) {
  const warnings = [];
  const scenesIn = Array.isArray(raw?.scenes) ? raw.scenes : [];
  if (scenesIn.length < 6) throw new Error(`Blueprint has only ${scenesIn.length} scenes`);
  if (scenesIn.length !== 10) warnings.push(`expected 10 scenes, got ${scenesIn.length}`);

  const dummyIds = [];
  let lastPlace = 'studio_void';
  const scenes = scenesIn.slice(0, 10).map((sc, i) => {
    let place = sc.place;
    if (!PLACES[place]) { warnings.push(`scene ${i + 1}: unknown place "${place}"`); place = lastPlace; }
    lastPlace = place;
    const P = PLACES[place];
    let camera = sc.camera;
    if (!P.cameras.includes(camera)) { warnings.push(`scene ${i + 1}: camera "${camera}" not valid in ${place}`); camera = P.cameras[0]; }

    const used = new Set();
    let dummies = 0;
    const placements = [];
    for (const p of (Array.isArray(sc.placements) ? sc.placements : []).slice(0, 6)) {
      if (!p || typeof p !== 'object') continue;
      const type = slug(p.object_type) || 'object';
      let id = slug(p.id) || type;
      while (used.has(id)) id += '_2';
      let anchor = p.anchor;
      if (!P.anchors[anchor]) { warnings.push(`scene ${i + 1}: anchor "${anchor}" not valid in ${place}`); anchor = Object.keys(P.anchors)[0]; }
      const isDummy = type === 'human_dummy';
      if (isDummy) {
        if (!dummyIds.includes(id)) { if (dummyIds.length >= 2) continue; dummyIds.push(id); }
        if (++dummies > 2) continue;
      }
      used.add(id);
      placements.push({
        id, type, anchor, isDummy,
        material: MATERIALS.includes(p.material) ? p.material : isDummy ? 'skin_dummy' : 'matte_plastic',
        pose: isDummy && POSES.includes(p.pose) ? p.pose : null,
        expression: isDummy && EXPRESSIONS.includes(p.expression) ? p.expression : null,
        action: ACTIONS.includes(p.action) ? p.action : 'static',
      });
    }
    const narration = scrub(sc.narration);
    if (!narration) throw new Error(`Scene ${i + 1} has no narration`);
    const words = narration.split(/\s+/).length;
    if (words < 4 || words > 18) warnings.push(`scene ${i + 1}: narration is ${words} words`);
    return { place, camera, isCutaway: Boolean(sc.is_cutaway), narration, placements };
  });
  return { title: String(raw.video_title || 'Daily Curiosity').slice(0, 90), scenes, dummyIds, warnings };
}

// ---------- conversion to the render plan ----------
const POSE_MAP = { idle_stand: 'calm', lying_flat: 'collapse', crouching: 'curious', recoil_back: 'shock', clutching_chest: 'pain', falling: 'collapse' };
const EXPR_MAP = { neutral: 'calm', curious: 'curious', fear: 'fear', pain: 'pain', shock: 'shock' };
const PART_OF = { ANCHOR_HEART: 'chest', ANCHOR_LUNGS: 'chest', ANCHOR_STOMACH: 'chest', ANCHOR_BRAIN: 'head', ANCHOR_THROAT_PIPE: 'head', ANCHOR_BLOODSTREAM: 'arm' };
const OVERHEAD = new Set(['ANCHOR_OVERHEAD_DROP', 'ANCHOR_CEILING_CABLE', 'ANCHOR_POLE_TOP', 'ANCHOR_SURFACE_ABOVE', 'ANCHOR_HINGE_TOP']);
const SFX = { drop_gravity: 'heavy object crash and thud', ragdoll_hit: 'dull body impact thud', shake_violent: 'violent low rumble and rattle', slide_inward: 'metal scraping slide', pulse_glow: 'electric hum pulsing', flow_path: 'liquid whoosh rushing past' };
const MOTION_ACTIONS = ['drop_gravity', 'slide_inward', 'flow_path', 'ragdoll_hit'];

function poseOf(p) {
  const base = POSE_MAP[p.pose] || 'calm';
  return base === 'calm' && p.expression ? EXPR_MAP[p.expression] || 'calm' : base;
}

// Which shot, target and part each directory camera becomes in the renderer.
function shotFor(cam, c) {
  const victim = c.victim;
  switch (cam) {
    case 'CAM_MEDIUM_ACTOR': return { shot: 'wide', target: victim || c.main || 'both' };
    case 'CAM_CLOSEUP_CENTER': case 'CAM_CLOSEUP_PANEL': case 'CAM_MACRO_LATCH':
      return c.main ? { shot: 'hazard_ecu', target: c.main, to: victim } : victim ? { shot: 'crash_zoom', target: victim } : { shot: 'wide', target: 'both' };
    case 'CAM_CORNER_HIGH': case 'CAM_SIDE_ANGLE': return { shot: 'suspense', target: victim || c.main || 'both' };
    case 'CAM_LOW_FLOOR': case 'CAM_LOW_IMPACT': return { shot: 'worm_eye', target: c.main || victim || 'both', to: victim };
    case 'CAM_DRIVER_POV': return c.motion ? { shot: 'projectile_pov', target: c.motion.prop } : c.main ? { shot: 'hazard_ecu', target: c.main, to: victim } : { shot: 'wide', target: 'both' };
    case 'CAM_CLOSEUP_PATIENT': case 'CAM_CLOSEUP_FACE': return victim ? { shot: 'crash_zoom', target: victim } : { shot: 'wide', target: 'both' };
    case 'CAM_XRAY_BODY': case 'CAM_MACRO_ORGAN': return { shot: 'xray', target: victim || 'A', part: c.part };
    case 'CAM_ABOVE_LOOKING_DOWN': return { shot: 'top_down', target: victim || 'both' };
    case 'CAM_TORSO_FRONT': return { shot: 'cutaway', target: victim || 'A', part: c.part };
    case 'CAM_FLOW_TRACK': return c.motion ? { shot: 'projectile_pov', target: c.motion.prop } : { shot: 'xray', target: victim || 'A', part: c.part };
    default: return { shot: 'wide', target: 'both' }; // the *_WIDE cameras
  }
}

export function toScript(bp, summary = '') {
  const whoOf = (id) => (id === bp.dummyIds[0] ? 'A' : id === bp.dummyIds[1] ? 'B' : null);
  const objects = {};
  const sets = {};
  let motions = 0, ramps = 0, sfxCount = 0;

  const beats = bp.scenes.map((sc, idx) => {
    const P = PLACES[sc.place];
    const anchorPos = (a) => P.anchors[a];
    const dummies = sc.placements.filter((p) => p.isDummy && whoOf(p.id));
    const objs = sc.placements.filter((p) => !p.isDummy);
    const cutaway = sc.isCutaway || sc.place === ANATOMY;

    // characters: anchor position, lying bodies are shifted so they are centred on the anchor
    const charLayout = { A: { visible: false }, B: { visible: false } };
    const pose = { A: 'calm', B: 'calm' };
    const seen = {};
    for (const d of dummies) {
      const who = whoOf(d.id);
      const [ax, ay, az] = sc.place === ANATOMY ? [0, 0, 0] : anchorPos(d.anchor);
      const k = (seen[d.anchor] = (seen[d.anchor] || 0) + 1) - 1;
      const pz = poseOf(d);
      pose[who] = pz;
      const lying = pz === 'collapse';
      charLayout[who] = { visible: true, x: R(ax + (lying ? 0.32 : 0) + k * 0.6), y: R(ay), z: R(az) };
    }
    if (cutaway && !charLayout.A.visible && !charLayout.B.visible) charLayout.A = { visible: true, x: 0, y: 0, z: 0 }; // body shots need a body
    const victim = charLayout.A.visible ? 'A' : charLayout.B.visible ? 'B' : null;

    // objects at their anchors (several on one anchor are spread sideways)
    const layout = {};
    const perAnchor = {};
    for (const o of objs) {
      const [ax, ay, az] = anchorPos(o.anchor);
      const k = (perAnchor[o.anchor] = (perAnchor[o.anchor] || 0) + 1) - 1;
      layout[o.id] = { x: R(ax + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4), y: R(ay), z: R(az) };
      if (!objects[o.id]) objects[o.id] = { id: o.id, type: o.type, material: o.material, scene: sc.narration };
    }
    if (P.dressing.length) {
      sets[sc.place] = true;
      layout[`set_${sc.place}`] = { x: 0, y: 0, z: 0 };
    }

    const actors = [...dummies.map((d) => ({ ...d, who: whoOf(d.id) })), ...objs];
    const main = (objs.find((o) => o.action !== 'static') || objs[0])?.id || null;

    // actions
    const beat = { shake: 0 };
    let motion = null, highlight = null, sfx = null;
    for (const a of actors) {
      if (a.action === 'shake_violent') beat.shake = 0.09;
      if (a.action === 'ragdoll_hit' && a.isDummy) { pose[a.who] = 'collapse'; beat.shake = Math.max(beat.shake, 0.06); }
      if (a.action === 'pulse_glow' && !highlight) {
        highlight = a.isDummy
          ? { who: a.who, part: 'chest', color: 'red' }
          : { prop: a.id, color: sc.place === ANATOMY ? 'red' : 'orange' };
      }
      if (!a.isDummy && MOTION_ACTIONS.includes(a.action) && !motion && motions < 3) {
        const from = layout[a.id];
        const style = a.action === 'drop_gravity' ? 'drop' : a.action === 'flow_path' ? 'flow' : 'fly';
        // flowing things (blood, water, particles) travel along the body or floor instead of arcing in from above
        const flowAt = style === 'flow' ? { x: from.x, y: Math.max(0.2, R(from.y - 0.9)), z: from.z } : null;
        motion = flowAt ? { prop: a.id, at: flowAt, style, from } : victim
          ? { prop: a.id, to: victim, part: OVERHEAD.has(a.anchor) || sc.place === ANATOMY && PART_OF[a.anchor] === 'head' ? 'head' : PART_OF[a.anchor] || 'chest', style, from }
          : { prop: a.id, at: style === 'drop' ? { x: from.x, y: 0.15, z: from.z } : { x: 0, y: 0.3, z: 0.3 }, style, from };
        motions++;
      }
      if (!a.isDummy && PERFORMS.includes(a.action)) (beat.perform ||= {})[a.id] = a.action;
      if (!sfx && a.action !== 'static' && SFX[a.action] && sfxCount < 6) { sfx = { text: SFX[a.action], seconds: 1 }; sfxCount++; }
    }
    const danger = motion || actors.some((a) => a.action === 'ragdoll_hit');
    const ramp = Boolean(danger) && ramps < 2 && ++ramps > 0;

    // camera
    const firstOrgan = objs.map((o) => PART_OF[o.anchor]).find(Boolean) || 'chest';
    const c = { victim, main, motion, part: sc.place === ANATOMY ? firstOrgan : 'chest' };
    let sh = shotFor(sc.camera, c);
    if (['xray', 'cutaway', 'crash_zoom'].includes(sh.shot) && !victim && !(cutaway)) sh = { shot: 'wide', target: 'both' };
    if (cutaway && !['xray', 'cutaway'].includes(sh.shot) && (victim || charLayout.A.visible)) sh = { shot: 'xray', target: victim || 'A', part: c.part };
    if (sh.shot === 'projectile_pov' && !motion) sh = { shot: 'wide', target: 'both' };
    if (sh.shot === 'hazard_ecu' && !(sh.target in layout)) sh = { shot: 'wide', target: 'both' };

    // What the finished video must show: the checker (src/qa.mjs) verifies exactly this.
    const expect = {
      objects: objs.map((o) => o.id),
      chars: ['A', 'B'].filter((w) => charLayout[w].visible),
      actions: [],
      dropped: [],
    };
    if (motion) expect.actions.push({ kind: 'motion', id: motion.prop, style: motion.style, to: motion.to || null, at: motion.at || null, part: motion.part || 'chest', from: motion.from });
    for (const a of actors) {
      if (a.action === 'pulse_glow') expect.actions.push(a.isDummy ? { kind: 'glow', who: a.who } : { kind: 'glow', id: a.id });
      if (a.action === 'shake_violent') expect.actions.push({ kind: 'shake' });
      if (!a.isDummy && PERFORMS.includes(a.action)) expect.actions.push({ kind: 'perform', id: a.id, style: a.action });
      if (a.action === 'ragdoll_hit' && a.isDummy) expect.actions.push({ kind: 'ragdoll', who: a.who });
      if (!a.isDummy && MOTION_ACTIONS.includes(a.action) && !(motion && motion.prop === a.id)) expect.dropped.push({ kind: 'motion', id: a.id, action: a.action });
    }
    if (['xray', 'cutaway'].includes(sh.shot)) expect.actions.push({ kind: 'cutaway', who: sh.target === 'B' ? 'B' : 'A' });

    const lookA = main || 'camera', lookB = main || 'camera';
    const visibleBoth = charLayout.A.visible && charLayout.B.visible;
    return {
      text: sc.narration,
      action: `${sc.place}: ${sc.placements.map((p) => `${p.type}@${p.anchor.replace('ANCHOR_', '').toLowerCase()}${p.action !== 'static' ? ` (${p.action})` : ''}`).join(', ')}`,
      poseA: pose.A, poseB: pose.B,
      lookA: visibleBoth ? null : lookA, lookB: visibleBoth ? null : lookB,
      holdA: null, holdB: null,
      focus: victim && !visibleBoth ? victim : 'both',
      shot: sh.shot, shotTarget: sh.target, shotTo: sh.to || null, shotPart: sh.part || 'chest', shotWho: 'A',
      ramp, motion, highlight, sfx,
      shake: beat.shake || undefined,
      perform: beat.perform,
      layout, charLayout, expect,
      wall: P.wall, floor: P.floor, place: sc.place, camera: sc.camera,
    };
  });

  // props: every object once, plus one preset "set" prop per place that has furniture
  const props = Object.values(objects).map((o) => ({
    id: o.id,
    name: o.type.replace(/_/g, ' '),
    purpose: `appears in the line: "${o.scene}"`,
    material: o.material,
    color: MATERIAL_COLOR[o.material],
    creature: isCreature(o.type),
    layer: 'midground', x: 0, holdable: false, weight: 0.3,
  }));
  for (const place of Object.keys(sets)) {
    props.push({
      id: `set_${place}`, name: `${place.replace(/_/g, ' ')} set`, purpose: 'set dressing',
      layer: 'midground', x: 0, holdable: false, weight: 0,
      parts: PLACES[place].dressing, noBlocks: true,
    });
  }

  const first = PLACES[bp.scenes[0].place];
  return {
    title: bp.title,
    description: summary || bp.scenes[0].narration,
    tags: ['edutainment', 'science', 'facts', 'shorts', ...new Set(bp.scenes.map((s) => s.place.split('_')[0]))].slice(0, 12),
    characters: { A: { name: 'Dummy A', role: '', attitude: '' }, B: { name: 'Dummy B', role: '', attitude: '' } },
    relationship: '',
    setting: { name: bp.scenes[0].place, wall: first.wall, floor: first.floor },
    props,
    beats,
  };
}
