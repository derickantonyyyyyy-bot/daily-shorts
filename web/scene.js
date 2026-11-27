import * as THREE from 'three';

const W = 1080;
const H = 1920;
const FPS = 30;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true; // cutaway shots slice the body open with a clipping plane
document.body.appendChild(renderer.domElement);

// Deep focus: no depth of field and no motion blur anywhere, so hazard, reaction and background stay crisp.
const scene = new THREE.Scene();
const bg = new THREE.Color(0xaebfcc);
scene.background = bg;
scene.fog = new THREE.Fog(bg, 14, 40);

const cam = new THREE.PerspectiveCamera(32, W / H, 0.03, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const floorMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.9 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0xaebfcc, roughness: 1 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), wallMat);
wall.position.set(0, 8, -5);
scene.add(wall);
const floorBase = new THREE.Color(0xd8dde2);
const wallBase = new THREE.Color(0xaebfcc);
const tmpWall = new THREE.Color(), tmpFloor = new THREE.Color(); // per-scene colours for blueprint places

// ---------- Helpers ----------
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sm = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
// Hard linear keyframe: starts and stops dead, no ease-in / ease-out. Used for every camera move.
const lin = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
// Robotic "stepped" easing for the characters: 4 hard steps instead of a smooth curve
const stepped = (k) => (k >= 1 ? 1 : Math.max(0, Math.ceil(k * 4) / 4));
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const frames = (n) => n / FPS;

// Optics. Lens in mm (35 mm equivalent, portrait frame: 36 mm along the long side).
// 24 mm = establishing, 18-20 mm = close-ups (bulbous noses and hands), 16 mm = snorricam, 85 mm = flat isometric.
const fovOf = (mm) => (2 * Math.atan(18 / mm) * 180) / Math.PI;
// Distance at which a lens frames `frameH` metres of vertical height.
const reach = (frameH, mm) => (frameH * mm) / 36;
const sway = (t, a) => V(Math.sin(t * 2.3), Math.sin(t * 3.1 + 1), Math.sin(t * 1.7 + 2) * 0.5).multiplyScalar(a);

// Speed ramp: normal -> ~10% speed (p .35 to .75) -> catch up. Same constants as src/build_plan.mjs.
function warp(p) {
  if (p < 0.35) return p * 1.58667;
  if (p < 0.75) return 0.55533 + (p - 0.35) * 0.12;
  return 0.60333 + (p - 0.75) * 1.58667;
}
const impactU = (beat) => (beat.ramp ? 0.58 : 0.85);
const impactP = (beat) => (beat.ramp ? 0.5556 : 0.85);

// Materials: registered so the scene can desaturate everything except the highlighted hazard.
const reg = [];
const M = (c, r = 0.6, owner = null) => {
  const mat = new THREE.MeshStandardMaterial({ color: c, roughness: r });
  reg.push({ mat, base: mat.color.clone(), owner });
  return mat;
};
const raw = (c, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};
const grp = (parent, x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

// ---------- Character factory: a stiff mannequin with a hidden skeleton for X-ray / cutaway shots ----------
function makeChar(x, yaw, shirtC, pantsC, skinC) {
  const mats = { shirt: M(shirtC), pants: M(pantsC), skin: M(skinC) };
  const { shirt, pants, skin } = mats;
  const eyeW = M(0xffffff, 0.3), eyeB = M(0x111111, 0.3), mouthM = M(0x4a1010);

  // Everything that belongs to the visible body: fades in X-ray and is sliced by the cutaway plane.
  const clip = new THREE.Plane(V(0, 0, 1), 1000); // constant 1000 = nothing clipped
  const body = [shirt, pants, skin, eyeW, eyeB, mouthM];
  for (const m of body) m.clippingPlanes = [clip];
  for (const m of [shirt, pants, skin]) m.side = THREE.DoubleSide; // so a sliced body shows its inner wall

  const yawG = grp(scene, x, 0, 0);
  yawG.rotation.y = yaw;
  const root = grp(yawG);
  const hips = grp(root, 0, 1.05, 0);
  const torso = grp(hips);
  torso.add(mesh(new THREE.CapsuleGeometry(0.27, 0.5, 4, 12), shirt, 0, 0.45, 0));
  hips.add(mesh(new THREE.CapsuleGeometry(0.25, 0.1, 4, 12), pants, 0, -0.02, 0));

  const head = grp(torso, 0, 1.05, 0);
  head.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 10), skin, 0, -0.02, 0));
  head.add(mesh(new THREE.SphereGeometry(0.23, 24, 18), skin, 0, 0.2, 0));
  const eyes = [-1, 1].map((s) => {
    const e = grp(head, s * 0.085, 0.25, 0.19);
    e.add(mesh(new THREE.SphereGeometry(0.055, 14, 10), eyeW));
    e.add(mesh(new THREE.SphereGeometry(0.026, 10, 8), eyeB, 0, 0, 0.045));
    return e;
  });
  const brows = [-1, 1].map((s) => {
    const b = grp(head, s * 0.085, 0.335, 0.2);
    b.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), eyeB));
    return b;
  });
  const mouth = mesh(new THREE.BoxGeometry(0.09, 0.03, 0.02), mouthM, 0, 0.1, 0.215);
  head.add(mouth);

  const arm = (side) => {
    const sh = grp(torso, side * 0.36, 0.85, 0);
    sh.add(mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), shirt, 0, -0.22, 0));
    const el = grp(sh, 0, -0.44, 0);
    el.add(mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), skin, 0, -0.2, 0));
    el.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), skin, 0, -0.44, 0));
    const hand = grp(el, 0, -0.46, 0);
    return { sh, el, hand };
  };
  const leg = (side) => {
    const hp = grp(hips, side * 0.13, 0, 0);
    hp.add(mesh(new THREE.CapsuleGeometry(0.1, 0.4, 4, 8), pants, 0, -0.25, 0));
    const kn = grp(hp, 0, -0.5, 0);
    kn.add(mesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 8), pants, 0, -0.25, 0));
    kn.add(mesh(new THREE.BoxGeometry(0.14, 0.07, 0.28), eyeB, 0, -0.52, 0.06));
    return { hp, kn };
  };
  // character's left is +x (they face the camera)
  const L = arm(1), R = arm(-1), LL = leg(1), RL = leg(-1);

  // Skeleton + organs (hidden until an X-ray dive or a cutaway). One material per body part so a part can glow on its own.
  const partMat = { head: raw(0xe9e5d3), chest: raw(0xe9e5d3), arm: raw(0xe9e5d3), leg: raw(0xe9e5d3) };
  const bones = [];
  const bone = (parent, geo, part, bx = 0, by = 0, bz = 0, mat = partMat[part]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(bx, by, bz);
    m.visible = false;
    parent.add(m);
    bones.push(m);
    return m;
  };
  bone(head, new THREE.SphereGeometry(0.19, 16, 12), 'head', 0, 0.2, 0);
  bone(head, new THREE.SphereGeometry(0.04, 8, 6), 'head', -0.07, 0.23, 0.15, raw(0x111111));
  bone(head, new THREE.SphereGeometry(0.04, 8, 6), 'head', 0.07, 0.23, 0.15, raw(0x111111));
  bone(torso, new THREE.CapsuleGeometry(0.035, 0.7, 4, 8), 'chest', 0, 0.45, -0.1);
  for (let n = 0; n < 5; n++) {
    const rib = bone(torso, new THREE.TorusGeometry(0.19, 0.016, 6, 18), 'chest', 0, 0.5 + n * 0.085, 0);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1, 0.75, 1);
  }
  bone(torso, new THREE.SphereGeometry(0.07, 10, 8), 'chest', 0.07, 0.72, 0.1, raw(0xb02020)); // heart
  bone(hips, new THREE.BoxGeometry(0.32, 0.12, 0.18), 'leg', 0, 0.0, 0);
  for (const a of [L, R]) {
    bone(a.sh, new THREE.CapsuleGeometry(0.03, 0.36, 4, 6), 'arm', 0, -0.22, 0);
    bone(a.el, new THREE.CapsuleGeometry(0.026, 0.32, 4, 6), 'arm', 0, -0.2, 0);
  }
  for (const l of [LL, RL]) {
    bone(l.hp, new THREE.CapsuleGeometry(0.04, 0.42, 4, 6), 'leg', 0, -0.25, 0);
    bone(l.kn, new THREE.CapsuleGeometry(0.035, 0.4, 4, 6), 'leg', 0, -0.25, 0);
  }

  const anchors = {
    head: grp(head, 0, 0.2, 0),
    chest: grp(torso, 0, 0.7, 0.05),
    arm: grp(R.el, 0, -0.2, 0),
    leg: grp(LL.kn, 0, -0.2, 0),
  };
  return { x, baseYaw: yaw, yawG, root, hips, torso, head, eyes, brows, mouth, L, R, LL, RL, fade: body, bones, partMat, anchors, clip };
}

const chars = {
  A: makeChar(-0.85, 0.35, 0x3a6ea5, 0x2b2f3a, 0xdcae8f),
  B: makeChar(0.85, -0.35, 0xb5533c, 0x3b3a32, 0x8d5a3b),
};

// Glow marker for a highlighted body part
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.45, depthTest: false })
);
marker.renderOrder = 10;
marker.visible = false;
scene.add(marker);

// ---------- Poses (radians). Negative x on an arm swings it forward. ----------
const base = {
  hx: 0, hy: 0, hz: 0, tx: 0, tz: 0, lax: 0, laz: 0.08, rax: 0, raz: -0.08,
  lex: -0.05, rex: -0.05, llx: 0, rlx: 0,
  rootY: 0, rootX: 0, rootRz: 0, eye: 1, mouth: 1, brow: 0, face: 0,
};
const P = (o) => ({ ...base, ...o });
const POSES = {
  calm: P({}),
  walk: P({ tx: 0.05 }), // limbs are driven by a stiff oscillator in render()
  curious: P({ tx: 0.3, hx: 0.2, hz: 0.15, brow: 0.2, eye: 0.9 }),
  confusion: P({ hz: 0.35, hx: 0.1, rax: -2.6, rex: -2.2, brow: -0.35, eye: 0.8, mouth: 0.8 }),
  fear: P({ tx: -0.2, hx: -0.15, lax: -1.5, rax: -1.5, lex: -1.5, rex: -1.5, laz: 0.1, raz: -0.1,
            eye: 1.7, mouth: 2.2, brow: 0.5, llx: 0.25, rlx: -0.25 }),
  shock: P({ tx: -0.3, hx: -0.1, lax: -0.4, rax: -0.4, laz: 0.7, raz: -0.7, eye: 1.9, mouth: 2.4, brow: 0.6 }),
  pain: P({ tx: 0.7, hx: 0.3, lax: -1.0, rax: -1.0, lex: -1.7, rex: -1.7, eye: 0.4, mouth: 1.6,
            brow: -0.4, llx: 0.2, rlx: 0.2, rootY: -0.04 }),
  collapse: P({ rootRz: 1.5, rootX: 0.95, rootY: 0.28, eye: 0.3, mouth: 1.4, lax: -0.3, rax: 0.3 }),
  // run: limbs are driven by a stiff oscillator in render(); the character turns to face the lens
  run: P({ tx: 0.25, eye: 1.6, mouth: 2.0, brow: 0.5, face: 1 }),
};
const MOOD = {
  calm: 0xaebfcc, curious: 0xaebfcc, confusion: 0xb9c0cc,
  fear: 0xc9a4a4, shock: 0xcfb3a0, pain: 0xb88a8a, collapse: 0x8f7a7a, run: 0xc9a4a4,
};
const MOOD_PRIORITY = ['collapse', 'pain', 'fear', 'run', 'shock'];
const STEP_TIME = { collapse: 0.4 }; // seconds to move into a pose
const DISTRESS = ['fear', 'shock', 'pain', 'run'];
const SPEED = { run: 1.9, walk: 0.8 }; // metres per second of travel toward the lens
const MAX_TRAVEL = 3.2;
const keys = Object.keys(base);
const GLOW = { red: 0xff2a1a, orange: 0xff8a00, green: 0x39ff14 };
// Impact heights measured from the rig (the mannequin is ~2.55 m tall: head ~2.3, chest ~1.75, arm ~1.25, knee ~0.35).
const PART_Y = { head: 2.3, chest: 1.75, arm: 1.25, leg: 0.35 };

// ---------- Props (built from Groq-designed primitives) ----------
const LAYER_Z = { foreground: 1.7, midground: -0.9, background: -3 };
const props = {};

// Primitives (size arrays): box [w,h,d] sphere [r] cylinder [r,h] cone [r,h] capsule [r,len]
// ellipsoid [rx,ry,rz] dome [r] (half sphere) tapered [rTop,rBottom,h] torus [r,tube] wedge [w,h,d] (triangular prism)
function makeGeo(shape, a, b, c) {
  switch (shape) {
    case 'box': return new THREE.BoxGeometry(a, b, c);
    case 'sphere': return new THREE.SphereGeometry(a, 16, 12);
    case 'cylinder': return new THREE.CylinderGeometry(a, a, b, 16);
    case 'cone': return new THREE.ConeGeometry(a, b, 16);
    case 'ellipsoid': return new THREE.SphereGeometry(1, 20, 14).scale(a, b, c);
    case 'dome': return new THREE.SphereGeometry(a, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'tapered': return new THREE.CylinderGeometry(a, b, c, 16);
    case 'torus': return new THREE.TorusGeometry(a, b, 10, 24);
    case 'wedge': {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(a, 0); sh.lineTo(0, b);
      const g = new THREE.ExtrudeGeometry(sh, { depth: c, bevelEnabled: false });
      g.center();
      return g;
    }
    default: return new THREE.CapsuleGeometry(a, b, 4, 10);
  }
}

function buildProps(list) {
  for (const def of list) {
    const g = new THREE.Group();
    const pm = [];
    const matBy = {}, geoBy = {}, groups = {}; // shared per colour / size; pivot groups for movable parts
    for (const p of def.parts) {
      const [a, b, c] = p.size;
      const gk = p.shape + p.size.join(',');
      const geo = geoBy[gk] || (geoBy[gk] = makeGeo(p.shape, a, b, c));
      let mat = matBy[p.color];
      if (!mat) { mat = matBy[p.color] = M(new THREE.Color(p.color).getHex(), 0.65, def.id); pm.push(mat); }
      const m = mesh(geo, mat, p.pos[0], p.pos[1], p.pos[2]);
      m.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      if (p.part && p.part !== 'body') {
        const side = p.pos[0] < -0.01 ? 'L' : p.pos[0] > 0.01 ? 'R' : 'C';
        const key = p.part + side + (p.pos[2] > 0.1 ? 'F' : p.pos[2] < -0.1 ? 'B' : 'M'); // front / back pairs of legs swing opposite
        (groups[key] ||= { part: p.part, side, fb: key.slice(-1), meshes: [] }).meshes.push(m);
      } else g.add(m);
    }
    const rig = [];
    for (const gr of Object.values(groups)) { // pivot: top of arms, legs, wings, ears, tail; bottom of the head
      const bb = new THREE.Box3();
      for (const m of gr.meshes) bb.expandByObject(m);
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const py = gr.part === 'head' ? bb.min.y : gr.part === 'wing' || gr.part === 'fin' || gr.part === 'wheel' ? (bb.min.y + bb.max.y) / 2 : bb.max.y;
      const pv = new THREE.Group();
      pv.position.set(cx, py, cz);
      for (const m of gr.meshes) { m.position.sub(pv.position); pv.add(m); }
      g.add(pv);
      rig.push({ part: gr.part, side: gr.side, fb: gr.fb, node: pv, base: pv.position.clone() });
    }
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    const home = new THREE.Vector3(def.x, 0, LAYER_Z[def.layer] ?? 0);
    props[def.id] = {
      def, group: g, home, mats: pm, weight: def.weight, size: maxDim, rig,
      heldScale: Math.min(1, 0.45 / maxDim), midY: (box.min.y + box.max.y) / 2,
    };
    g.position.copy(home);
    scene.add(g);
  }
}

// Block creatures perform: walk, wave, hop, flap, wag, nod, spin, dance, wobble. Returns a pose number used by probe() and QA
// (sum of how far the limbs are bent plus the lift), so "is it really doing it" can be checked from the page.
function perform(pr, name, t) {
  const g = pr.group;
  let pose = 0;
  const NEED = { walk: ['leg'], dance: ['leg', 'arm'], wave: ['arm'], flap: ['wing', 'fin'], wag: ['tail'], nod: ['head'] };
  if (NEED[name] && !pr.rig.some((r) => NEED[name].includes(r.part))) name = 'hop'; // no such limb: the whole object hops instead
  const sw = (f, a) => Math.sin(t * f) * a;
  for (const r of pr.rig) {
    const n = r.node;
    n.rotation.set(0, 0, 0);
    const sgn = r.side === 'L' ? -1 : 1;
    const alt = (r.side === 'L' ? 1 : -1) * (r.fb === 'B' ? -1 : 1); // opposite legs swing against each other
    let rx = 0, rz = 0, ry = 0;
    if (name === 'walk' && r.part === 'leg') rx = alt * sw(7, 0.7);
    else if (name === 'walk' && r.part === 'arm') rx = -alt * sw(7, 0.55);
    else if (name === 'dance' && r.part === 'leg') rx = alt * sw(9, 0.5);
    else if (name === 'dance' && r.part === 'arm') rz = sgn * (1.9 + sw(9, 0.5));
    else if (name === 'wave' && r.part === 'arm' && r.side !== 'L') { rz = sgn * (2.3 + sw(10, 0.35)); }
    else if (name === 'flap' && (r.part === 'wing' || r.part === 'fin')) rz = sgn * -sw(12, 0.9);
    else if (name === 'wag' && r.part === 'tail') ry = sw(11, 0.7);
    else if (name === 'nod' && r.part === 'head') rx = sw(6, 0.35);
    else if (name === 'hop' && r.part === 'leg') rx = 0;
    else if (name === 'wobble' && r.part !== 'head') rz = sw(8, 0.12);
    n.rotation.set(rx, ry, rz);
    pose += Math.abs(rx) + Math.abs(ry) + Math.abs(rz);
  }
  let lift = 0;
  if (name === 'hop') lift = Math.abs(Math.sin(t * 5)) * 0.3;
  else if (name === 'walk' || name === 'dance') lift = Math.abs(Math.sin(t * 7)) * 0.04;
  else if (name === 'flap') lift = 0.1 + Math.abs(sw(6, 0.08));
  g.position.y += lift;
  if (name === 'spin') g.rotation.y = t * 3.2;
  else if (name === 'wobble') g.rotation.z = sw(8, 0.15);
  else if (name === 'dance') g.rotation.y = sw(3, 0.5);
  else if (name === 'walk') g.position.x += sw(1.4, 0.35);
  pr.pose = pose + lift + (name === 'spin' ? 1 : 0) + Math.abs(g.rotation.z);
  return pr.pose;
}

// Flight path of a thrown / dropped object (mp 0..1). Shared by the prop placer and the projectile-POV camera.
// m.at = a fixed floor/world point (blueprint scenes without a dummy); m.from = where the object starts (its anchor).
const motionEnd = (m) => {
  if (m.at) return V(m.at.x, m.at.y, m.at.z);
  const c = chars[m.to].yawG.position;
  return V(c.x, (c.y || 0) + (PART_Y[m.part] || 1.1), c.z + 0.3);
};
function motionPos(pr, m, mp) {
  const end = motionEnd(m);
  const start = m.style === 'drop'
    ? V(end.x, m.from ? Math.max(m.from.y, 2.5) : 4.2, end.z)
    : m.style === 'flow' && m.from ? V(m.from.x, m.from.y, m.from.z) // flows start exactly at their anchor
    : (m.from ? V(m.from.x, m.from.y + 0.6, m.from.z) : pr.home.clone().setY(pr.home.y + 0.6));
  const pos = start.clone().lerp(end, m.style === 'drop' ? mp * mp : mp);
  if (m.style === 'fly') pos.y += Math.sin(mp * Math.PI) * 0.5;
  return pos;
}

// ---------- Timeline helpers ----------
let beats = [];
const cap = document.getElementById('cap');

// Effective pose for a character in a beat, including the weight of whatever they hold.
function eff(beat, who) {
  if (!beat) return POSES.calm;
  const name = beat['pose' + who] || 'calm';
  const p = { ...POSES[name] };
  const hold = beat['hold' + who];
  if (hold && props[hold] && name !== 'collapse' && name !== 'run') {
    const w = props[hold].weight;
    p.rax = -0.75;
    p.rex = -0.7 - w * 0.35; // heavier things drag the forearm down/in
    p.raz = -0.15;
    p.tz = -0.1 * w;         // lean away from the load
    p.tx = p.tx - 0.05 * w;
    p.rootY = p.rootY - 0.03 * w;
  }
  return p;
}

// Distance a character has walked / run toward the lens by this moment (carries over between beats).
function travel(who, i, local) {
  let z = 0;
  for (let j = 0; j <= i; j++) {
    const b = beats[j];
    const sp = SPEED[b['pose' + who]] || 0;
    z += sp * (j === i ? Math.min(local, b.end - b.start) : b.end - b.start);
  }
  return Math.min(z, MAX_TRAVEL);
}

// World position of a target: a character body part, a prop, or the middle of the stage.
function tpos(key, part = 'chest') {
  if (key === 'A' || key === 'B') {
    const a = chars[key].anchors[part] || chars[key].anchors.chest;
    return a.getWorldPosition(V());
  }
  if (props[key]) {
    const pr = props[key];
    return pr.group.getWorldPosition(V()).add(V(0, pr.midY * pr.group.scale.y, 0));
  }
  return V(0, 0.95, 0);
}

// Pitch/yaw (relative to the character's own facing) needed to look at a target.
function lookAngles(who, key) {
  const c = chars[who];
  let target;
  if (key === 'camera') target = cam.position.clone();
  else if (key === 'A' || key === 'B') target = tpos(key, 'head');
  else if (props[key]) target = tpos(key);
  else return [0, 0];
  const hp = c.yawG.worldToLocal(c.head.getWorldPosition(V()));
  const d = c.yawG.worldToLocal(target).sub(hp);
  return [clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), -0.5, 0.6), clamp(Math.atan2(d.x, d.z), -0.9, 0.9)];
}
// null = default eye line: look at the other character (runners look into the lens)
const lookKey = (beat, who) => {
  if (!beat) return null;
  if (beat['pose' + who] === 'run') return 'camera';
  return beat['look' + who] ?? (who === 'A' ? 'B' : 'A');
};

// Where a framing shot looks, and how many metres of height it shows.
function frameOf(key, beat) {
  if (key === 'A' || key === 'B') {
    const T = tpos(key, 'chest');
    const down = beat['pose' + key] === 'collapse';
    // standing = 24 mm waist-up medium (head sits at ~2.3 m); collapsed = ~2.5 m long on the floor, so frame it wide
    return down ? { x: T.x, y: 0.5, z: T.z, H: 5.0 } : { x: T.x, y: 1.75, z: T.z, H: 2.0 };
  }
  if (props[key]) {
    const T = tpos(key);
    return { x: T.x, y: T.y, z: T.z, H: Math.max(1.4, props[key].size / 0.55) };
  }
  const down = beat.poseA === 'collapse' || beat.poseB === 'collapse';
  // two-shot: both characters (about +/-1.3 m including arms) must fit the 9:16 width at 24 mm
  return { x: 0, y: down ? 0.9 : 1.3, z: 0, H: down ? 4.4 : 5.0 };
}

// ---------- Camera director ----------
// The camera is a hyper-caffeinated invisible drone: every move is a hard linear keyframe (no easing),
// lenses are wide, and it rockets through Z instead of cutting.
const CUT_H = { head: 0.8, chest: 1.5, arm: 1.3, leg: 1.7 };       // metres of height framed by the cutaway
const XRAY_H = { head: 0.5, chest: 0.9, arm: 0.8, leg: 0.9 };      // where the X-ray dive stops
// 45 degree isometric direction (from the target toward the camera), slowly drifting
const cutDir = (p) => {
  const a = lerp(Math.PI / 4, 0.95, p), e = 0.61;
  return V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
};

function camState(beat, local) {
  const dur = Math.max(0.01, beat.end - beat.start);
  const p = clamp(local / dur, 0, 1);
  const u = beat.ramp ? warp(p) : p;
  const t = beat.start + local;
  let shot = beat.shot || 'wide';
  let tk = beat.shotTarget || beat.focus || 'both';
  const part = beat.shotPart || 'chest';

  // shots that need a specific kind of target fall back to a safe framing
  if ((shot === 'hazard_ecu' || shot === 'impact_closeup') && !props[tk]) shot = 'wide';
  if (shot === 'projectile_pov' && !(beat.motion && props[beat.motion.prop])) shot = 'wide';
  if (['xray', 'cutaway', 'snorricam', 'crash_zoom', 'panic_track'].includes(shot) && tk !== 'A' && tk !== 'B') tk = 'A';

  const T = tpos(tk, part);
  const s = { pos: V(0, 1.4, 6), look: T.clone(), mm: 24, roll: 0, shake: 0, up: null };

  switch (shot) {
    case 'suspense': { // creeping push-in, slight Dutch tilt, 24 mm; character busy and unaware
      const f = frameOf(tk, beat);
      const h = lerp(f.H * 1.1, f.H * 0.62, p);
      s.pos.set(f.x + 0.45, f.y + 0.35, f.z + reach(h, 24));
      s.look.set(f.x, f.y, f.z);
      s.roll = 0.13;
      break;
    }
    case 'hazard_ecu': { // 18 mm extreme close-up: hard whip-pan DOWN from the character onto the hazard (fills ~70%)
      const who = beat.shotTo === 'B' ? 'B' : 'A';
      const C = tpos(who, 'chest').add(V(0, 0.2, 0));
      const HZ = tpos(tk);
      const fh = Math.max(0.35, props[tk].size / 0.7);
      const med = V(C.x, C.y + 0.1, C.z + reach(2.0, 24));
      const ecu = V(HZ.x + 0.15, HZ.y + 0.1, HZ.z + reach(fh, 18) * lerp(1, 0.85, p));
      const w = lin(0.28, 0.36, p);
      s.pos.copy(med).lerp(ecu, w);
      s.look.copy(C).lerp(HZ, w);
      s.mm = lerp(24, 18, w);
      s.roll = Math.sin(w * Math.PI) * 0.2;
      break;
    }
    case 'impact_closeup': { // starts tight on a mundane object, whips out to reveal the character beside it
      const who = beat.shotTo === 'B' ? 'B' : 'A';
      const R = tpos(who, 'chest').add(V(0, 0.2, 0));
      const HZ = tpos(tk);
      const fh = Math.max(0.35, props[tk].size / 0.7);
      const close = V(HZ.x + 0.2, HZ.y + 0.1, HZ.z + reach(fh, 18) * lerp(1, 0.85, p));
      const med = V(R.x, R.y + 0.1, R.z + reach(2.1, 24));
      const w = lin(0.5, 0.58, p);
      s.pos.copy(close).lerp(med, w);
      s.look.copy(HZ).lerp(R, w);
      s.mm = lerp(18, 24, w);
      s.roll = Math.sin(w * Math.PI) * 0.22;
      break;
    }
    case 'ots': { // tight behind the ear, looking down at the hands, slight handheld sway
      const who = beat.shotWho === 'B' ? 'B' : 'A';
      const other = who === 'A' ? 'B' : 'A';
      const tgt = props[tk] ? tk : beat['hold' + who] || other;
      s.pos.copy(chars[who].head.localToWorld(V(0.13, 0.3, -0.3))).add(sway(t, 0.012));
      s.look.copy(tpos(tgt, 'chest'));
      s.mm = 24;
      s.roll = 0.03;
      break;
    }
    case 'crash_zoom': { // the camera physically rockets forward through Z and stops dead millimetres from the eye
      const E = tpos(tk, 'head').add(V(0, 0.05, 0.1));
      const dir = V(0.15, 0.1, 1).normalize();
      const t0 = 0.3 * dur, tr = 0.1; // rocket for ~3 frames
      const k = lin(t0, t0 + tr, local);
      const d0 = lerp(2.0, 1.75, lin(0, t0, local)); // slow creep before the snap
      s.pos.copy(E).addScaledVector(dir, lerp(d0, 0.45, k));
      s.look.copy(E);
      s.mm = 20;
      if (local >= t0 + tr && local < t0 + tr + frames(4)) s.shake = 0.04; // micro-shake on the stop
      break;
    }
    case 'xray': { // rapid Z-axis dive through skin and clothes; the damaged part glows
      const k = lin(0.1, 0.32, p);
      const d = lerp(reach(2.2, 20), reach(XRAY_H[part] ?? 0.9, 20), k) * (1 - 0.1 * lin(0.32, 1, p));
      s.pos.set(T.x + 0.25 * (1 - k), T.y + 0.15 * (1 - k), T.z + d);
      s.look.copy(T);
      s.mm = 20;
      s.roll = 0.05 * (1 - k);
      break;
    }
    case 'cutaway': { // 45 degree isometric; the outer layer slices away cleanly (see clip plane in render())
      s.mm = 85; // long lens flattens perspective into an isometric look
      s.pos.copy(T).addScaledVector(cutDir(p), reach(CUT_H[part] ?? 1.5, 85));
      s.look.copy(T);
      break;
    }
    case 'snorricam': { // rigidly mounted to the chest: the body stays frozen centre-frame while the world spins
      const c = chars[tk];
      const back = lerp(0.55, 1.3, lin(0.6, 1, p)); // rapid backward pull at the end
      s.pos.copy(c.torso.localToWorld(V(0, 1.3, back)));
      s.look.copy(c.torso.localToWorld(V(0, 1.2, 0)));
      s.up = c.torso.localToWorld(V(0, 1, 0)).sub(c.torso.localToWorld(V(0, 0, 0))).normalize();
      s.mm = 16;
      s.shake = DISTRESS.includes(beat['pose' + tk]) ? 0.05 : 0.015; // violent in pain / panic
      break;
    }
    case 'worm_eye': { // inches off the floor, 15-30 degrees up, past the hazard toward the looming face
      const who = beat.shotTo === 'B' ? 'B' : beat.shotTo === 'A' ? 'A' : null;
      const face = who ? tpos(who, 'head') : T.clone().add(V(0, 0.6, 0));
      const HZ = tpos(tk);
      const pull = 0.9 * lin(0.55, 0.7, p); // rapid backward pull on the reaction
      if (props[tk] && who && HZ.z > face.z + 0.5) s.pos.set(HZ.x + 0.25, 0.08, HZ.z + 0.9 + pull);
      else s.pos.set(face.x + 0.3, 0.08, face.z + 2.3 + pull);
      s.look.copy(face);
      s.mm = 18;
      s.roll = -0.05;
      const tw = who || (tk === 'A' || tk === 'B' ? tk : null);
      s.shake = tw && DISTRESS.includes(beat['pose' + tw]) ? 0.05 : 0.01;
      break;
    }
    case 'top_down': { // God's eye, 90 degrees to the floor: walking toward a hazard, or the ragdoll aftermath
      const down = (tk === 'A' || tk === 'B') && beat['pose' + tk] === 'collapse';
      const C = tk === 'both' ? tpos('A', 'chest') : tpos(tk, 'chest');
      const y = down ? lerp(3.2, 5.4, p) : lerp(3.8, 3.2, p); // aftermath ends on a slow pull-up
      const a = (down ? 0.5 : 0.15) * p;
      s.pos.set(C.x, y, C.z + 0.001);
      s.look.set(C.x, 0, C.z);
      s.up = V(Math.sin(a), 0, -Math.cos(a));
      s.mm = 24;
      break;
    }
    case 'panic_track': { // handheld backward tracking right in front of a runner's face
      const C = tpos(tk, 'chest');
      s.pos.copy(C).add(V(0, 0.1, 1.15)).add(sway(t, 0.035));
      s.look.copy(C).add(V(0, 0.1, 0));
      s.mm = 20;
      s.roll = Math.sin(t * 23) * 0.03;
      break;
    }
    case 'whip_pan': { // quick whips between the confused face and the strange object
      const F = tk === 'A' || tk === 'B' ? tpos(tk, 'head') : T;
      const T2 = tpos(beat.shotTo || 'B', 'chest');
      const w1 = lin(0.36, 0.44, p), w2 = lin(0.76, 0.84, p);
      const mid = F.clone().lerp(T2, 0.5);
      s.pos.set(mid.x * 0.5 + 0.4, 1.3, Math.max(F.z, T2.z) + reach(2.0, 24));
      s.look.copy(F).lerp(T2, w1 - w2);
      s.roll = Math.sin(w1 * Math.PI) * 0.16 - Math.sin(w2 * Math.PI) * 0.16;
      s.mm = 24;
      break;
    }
    case 'orbit': { // 180 degree orbit freeze: sweeps in real time while the action is near-frozen (pair with ramp)
      let C = T.clone();
      let r = props[tk] ? 1.6 : 2.4;
      if (beat.motion && props[beat.motion.prop]) { // centre between hazard and victim to show their spatial relationship
        const Pp = tpos(beat.motion.prop);
        const E = motionEnd(beat.motion);
        C = Pp.clone().lerp(E, 0.5);
        r = clamp(Pp.distanceTo(E) * 0.7 + 1.5, 2, 4);
      }
      const a = lerp(-Math.PI / 2, Math.PI / 2, lin(0.28, 0.8, p));
      s.pos.set(C.x + Math.sin(a) * r, C.y + 0.3, C.z + Math.cos(a) * r);
      s.look.copy(C);
      s.mm = 20;
      break;
    }
    case 'projectile_pov': { // missile cam: parented just behind the flying object
      const m = beat.motion;
      const pr = props[m.prop];
      const mp = clamp(u / impactU(beat), 0, 1);
      const m0 = Math.min(mp, 0.96);
      const dir = motionPos(pr, m, m0 + 0.04).sub(motionPos(pr, m, m0)).normalize();
      s.pos.copy(motionPos(pr, m, mp)).addScaledVector(dir, -0.4).add(V(0, 0.1, 0));
      s.look.copy(motionEnd(m));
      s.mm = 16;
      s.roll = Math.sin(mp * 12) * 0.12; // the object tumbles
      s.shake = 0.01;
      break;
    }
    default: { // 'wide': eye-level medium, 24 mm, static / ultra-slow push-in
      const f = frameOf(tk, beat);
      const h = f.H * lerp(1, 0.94, p);
      s.pos.set(f.x, f.y + 0.15, f.z + reach(h, 24));
      s.look.set(f.x, f.y, f.z);
    }
  }
  s.fov = fovOf(s.mm);
  return s;
}

function blendCam(a, b, k) {
  const up = (s) => s.up || V(Math.sin(s.roll), Math.cos(s.roll), 0);
  return {
    pos: a.pos.clone().lerp(b.pos, k),
    look: a.look.clone().lerp(b.look, k),
    fov: lerp(a.fov, b.fov, k),
    roll: lerp(a.roll, b.roll, k),
    shake: lerp(a.shake, b.shake, k),
    up: a.up || b.up ? up(a).lerp(up(b), k).normalize() : null,
  };
}

const grayTmp = new THREE.Color();
function desaturate(color, d) {
  const l = color.r * 0.3 + color.g * 0.59 + color.b * 0.11;
  grayTmp.setRGB(l, l, l);
  return color.lerp(grayTmp, d);
}

function render(t) {
  let i = beats.findIndex((b) => t >= b.start && t < b.end);
  if (i < 0) i = beats.length - 1;
  const beat = beats[i];
  const prevB = i > 0 ? beats[i - 1] : null;
  const local = t - beat.start;
  const dur = beat.end - beat.start;
  const p = clamp(local / dur, 0, 1);
  const u = beat.ramp ? warp(p) : p; // action clock (slow-mo applies here)
  const isLast = i === beats.length - 1;
  const loopK = isLast ? sm(dur - 0.7, dur, local) : 0; // last beat eases back to the opening look
  const snorriWho = beat.shot === 'snorricam' ? (beat.shotTarget === 'B' ? 'B' : 'A') : null;

  // 1) pose both characters (everything except the head's eye line)
  const state = {};
  for (const who of ['A', 'B']) {
    const c = chars[who];
    const name = beat['pose' + who] || 'calm';
    const cur = eff(beat, who);
    const prev = eff(prevB, who);
    const k = stepped((u * dur) / (STEP_TIME[name] || 0.22));
    const v = {};
    for (const key of keys) v[key] = lerp(prev[key] ?? 0, cur[key] ?? 0, k);
    if (loopK > 0) for (const key of keys) v[key] = lerp(v[key], POSES.calm[key], loopK);

    const phase = who === 'B' ? 1.3 : 0;
    const breath = Math.sin(t * 2.2 + phase);
    v.tx += breath * 0.015;
    if (name === 'calm' || name === 'curious') v.hy += (Math.round(Math.sin(t * 0.8 + phase) * 2) / 2) * 0.1;
    if (DISTRESS.includes(name)) {
      v.hz += Math.sin(t * 70 + phase) * 0.02;
      v.lax += Math.sin(t * 55 + phase) * 0.03;
      v.rax += Math.cos(t * 60 + phase) * 0.03;
    }
    if (name === 'walk') { // stiff, deadpan stroll toward the lens
      const ph = t * 6 + phase;
      v.llx = Math.sin(ph) * 0.5;
      v.rlx = -Math.sin(ph) * 0.5;
      v.lax = -Math.sin(ph) * 0.4;
      if (!beat['hold' + who]) v.rax = Math.sin(ph) * 0.4;
      v.rootY = Math.abs(Math.sin(ph)) * 0.025;
    }
    if (name === 'run') { // stiff, flailing sprint toward the lens
      const ph = t * 13 + phase;
      v.llx = Math.sin(ph) * 0.9;
      v.rlx = -Math.sin(ph) * 0.9;
      v.lax = -1.1 + Math.sin(ph + 2) * 0.9;
      v.rax = -1.1 + Math.sin(ph + 4) * 0.9;
      v.lex = -0.6;
      v.rex = -0.6;
      v.rootY = Math.abs(Math.sin(ph)) * 0.06;
    }
    let spin = 0;
    if (snorriWho === who) { // flail + spin so the chest-mounted camera makes the world whirl
      v.tx += Math.sin(t * 8 + phase) * 0.22;
      v.tz += Math.cos(t * 6.3 + phase) * 0.3;
      spin = local * 2.5;
    }

    const cl = beat.charLayout && beat.charLayout[who]; // blueprint scenes place and show/hide each dummy per scene
    c.yawG.visible = cl ? cl.visible !== false : true;
    if (cl) c.yawG.position.set(cl.x ?? c.x, cl.y ?? 0, cl.z ?? 0);
    else c.yawG.position.set(c.x, 0, travel(who, i, local) * (1 - loopK));
    c.yawG.rotation.y = c.baseYaw * (1 - clamp(v.face, 0, 1)) + spin;
    c.torso.rotation.set(v.tx, 0, v.tz);
    c.torso.scale.y = 1 + breath * 0.01;
    c.L.sh.rotation.set(v.lax, 0, v.laz);
    c.R.sh.rotation.set(v.rax, 0, v.raz);
    c.L.el.rotation.x = v.lex;
    c.R.el.rotation.x = v.rex;
    c.LL.hp.rotation.x = v.llx;
    c.RL.hp.rotation.x = v.rlx;
    c.root.position.set(v.rootX, v.rootY, 0);
    c.root.rotation.z = v.rootRz;
    c.eyes.forEach((e) => e.scale.set(1, v.eye, 1));
    c.brows.forEach((b, n) => {
      b.position.y = 0.335 + v.brow * 0.05;
      b.rotation.z = (n === 0 ? -1 : 1) * v.brow * -0.5 * (v.brow < 0 ? 1 : 0.4);
    });
    c.mouth.scale.set(1, v.mouth, 1);
    state[who] = { v, k, name };
  }
  scene.updateMatrixWorld(true);

  // 2) props: thrown/dropped objects, held objects (upright, scaled to fit), or resting at home
  const xrWho = beat.shotTarget === 'B' ? 'B' : 'A';
  const bodyShot = beat.shot === 'xray' || beat.shot === 'cutaway';
  const hl = beat.highlight || (bodyShot ? { who: xrWho, part: beat.shotPart || 'chest', color: 'red' } : null);
  const lay = beat.layout; // blueprint scenes: only the objects listed for this scene exist, at their anchors
  for (const [id, pr] of Object.entries(props)) {
    const g = pr.group;
    let mo = null;
    for (let j = i; j >= (lay ? i : 0); j--) {
      const m = beats[j].motion;
      if (m && m.prop === id) { mo = { m, j }; break; }
    }
    const holder = beat.holdA === id ? 'A' : beat.holdB === id ? 'B' : null;
    g.visible = !lay || Boolean(lay[id]) || Boolean(mo) || Boolean(holder);
    if (mo) {
      if (g.parent !== scene) scene.add(g);
      g.quaternion.identity();
      g.scale.setScalar(1);
      const { m, j } = mo;
      if (j === i) {
        const mp = clamp(u / impactU(beat), 0, 1);
        g.position.copy(motionPos(pr, m, mp));
        g.rotation.set(mp < 1 ? mp * 10 : 0, 0, mp < 1 ? mp * 6 : 0);
      } else {
        const end = motionEnd(m);
        g.rotation.set(0, 0, 0);
        g.position.set(end.x + 0.45, 0, 0.55); // dropped beside the target afterwards
      }
    } else if (holder && state[holder].name !== 'collapse') {
      g.rotation.set(0, 0, 0);
      const hand = chars[holder].R.hand;
      if (g.parent !== hand) hand.add(g);
      g.position.set(0, -0.04, 0.05);
      g.scale.setScalar(pr.heldScale);
      hand.getWorldQuaternion(g.quaternion);
      g.quaternion.invert(); // cancels the hand's world rotation so the object stays upright
    } else {
      if (g.parent !== scene) scene.add(g);
      g.rotation.set(0, 0, 0);
      g.quaternion.identity();
      g.scale.setScalar(1);
      if (holder) g.position.set(chars[holder].x + 0.6, 0, 0.5); // dropped when the holder goes down
      else if (lay && lay[id]) g.position.set(lay[id].x, lay[id].y || 0, lay[id].z);
      else g.position.copy(pr.home);
    }
    const doing = beat.perform?.[id];
    for (const r of pr.rig) r.node.rotation.set(0, 0, 0);
    pr.pose = 0;
    if (doing && g.parent === scene && !mo && g.visible) perform(pr, doing, t - beat.start);
    else if (pr.def.creature && g.parent === scene && !mo && g.visible) { // creature-like props idle: bob and sway
      g.position.y += Math.abs(Math.sin(t * 2.4 + pr.home.x)) * 0.03;
      g.rotation.y = Math.sin(t * 1.3 + pr.home.x) * 0.18;
    }
    if (loopK > 0 && !lay && g.parent === scene) g.position.lerp(pr.home, loopK);
  }
  scene.updateMatrixWorld(true);

  // 3) eye lines: head = pose rotation + stepped blend toward the look target
  for (const who of ['A', 'B']) {
    const { v, k, name } = state[who];
    let pitch = 0, yaw = 0;
    if (name !== 'collapse') {
      const a = lookAngles(who, lookKey(prevB, who));
      const b = lookAngles(who, lookKey(beat, who));
      pitch = lerp(a[0], b[0], k);
      yaw = lerp(a[1], b[1], k);
      if (loopK > 0) { pitch *= 1 - loopK; yaw *= 1 - loopK; }
    }
    chars[who].head.rotation.set(v.hx + pitch, v.hy + yaw, v.hz);
  }
  scene.updateMatrixWorld(true); // head turns matter for over-the-shoulder and snorricam mounts

  // 4) X-ray (skin and clothes fade, skeleton appears), cutaway (a clean slice) and glow highlights
  const glowCol = new THREE.Color(GLOW[hl?.color] || GLOW.red);
  const pulse = 0.6 + 0.4 * Math.sin(t * 10);
  const part = beat.shotPart || 'chest';
  for (const who of ['A', 'B']) {
    const c = chars[who];
    const mine = bodyShot && xrWho === who;
    const fade = beat.shot === 'xray' && mine ? lin(0.1, 0.32, p) : 0;
    const cutK = beat.shot === 'cutaway' && mine ? lin(0.12, 0.4, p) : 0;
    const on = fade > 0.001;
    for (const m of c.fade) {
      if (m.transparent !== on) { m.transparent = on; m.needsUpdate = true; }
      m.opacity = on ? 1 - 0.93 * fade : 1;
      m.depthWrite = !on || fade < 0.5;
    }
    if (beat.shot === 'cutaway' && mine) {
      const dir = cutDir(p);
      c.clip.normal.copy(dir).negate();
      c.clip.constant = dir.dot(tpos(who, part)) + lerp(0.9, -0.02, cutK); // slice sweeps through the body
    } else {
      c.clip.constant = 1000;
    }
    c.bones.forEach((b) => (b.visible = fade > 0.05 || cutK > 0.05));
    for (const [pt, m] of Object.entries(c.partMat)) {
      const glowing = hl && hl.who === who && hl.part === pt;
      m.emissive.copy(glowing ? glowCol : new THREE.Color(0));
      m.emissiveIntensity = glowing ? pulse : 0;
    }
  }
  marker.visible = Boolean(hl && hl.who);
  if (marker.visible) {
    marker.position.copy(tpos(hl.who, hl.part));
    marker.material.color.copy(glowCol);
    marker.scale.setScalar(0.9 + 0.2 * Math.sin(t * 10));
  }
  for (const [id, pr] of Object.entries(props)) {
    const on = hl && hl.prop === id;
    for (const m of pr.mats) {
      m.emissive.copy(on ? glowCol : new THREE.Color(0));
      m.emissiveIntensity = on ? pulse : 0;
    }
  }

  // 5) mood tint + desaturation (everything goes grey except the glowing hazard)
  const names = [state.A.name, state.B.name];
  const mood = MOOD_PRIORITY.find((m) => names.includes(m)) || 'calm';
  bg.copy(beat.wall ? tmpWall.set(beat.wall) : wallBase).lerp(new THREE.Color(MOOD[mood]), mood === 'calm' ? 0 : 0.35);
  const d = hl ? sm(0, 0.2, local) * 0.85 : 0;
  desaturate(bg, d);
  wallMat.color.copy(bg);
  floorMat.color.copy(beat.floor ? tmpFloor.set(beat.floor) : floorBase);
  desaturate(floorMat.color, d);
  scene.fog.color.copy(bg);
  for (const e of reg) {
    e.mat.color.copy(e.base);
    if (d > 0 && !(hl && hl.prop && e.owner === hl.prop)) desaturate(e.mat.color, d);
  }

  // 6) camera: shot + hard 3-frame whip from the previous shot + seamless-loop return + frame-locked jitter
  let cs = camState(beat, local);
  if (prevB && local < frames(4) && (prevB.shot !== beat.shot || prevB.shotTarget !== beat.shotTarget)) {
    const w = lin(0, frames(4), local);
    cs = blendCam(camState(prevB, prevB.end - prevB.start), cs, w);
    cs.roll += Math.sin(w * Math.PI) * 0.1; // whip streak
  }
  if (loopK > 0) cs = blendCam(cs, camState(beats[0], 0), loopK);

  let shake = cs.shake;
  if ((DISTRESS.includes(state.A.name) || DISTRESS.includes(state.B.name)) && local < frames(4)) shake = Math.max(shake, 0.05);
  if (beat.motion) { // micro-shake: 5 frames of high-frequency, low-amplitude jitter on the exact impact frame
    const after = local - impactP(beat) * dur;
    if (after >= 0 && after < frames(5)) shake = Math.max(shake, 0.06);
  }
  if (beat.shake) shake = Math.max(shake, beat.shake); // scene-wide rumble (blueprint "shake_violent")
  window.__shake = shake;
  const fr = Math.round(t * FPS);
  const jitter = V(hash(fr) - 0.5, hash(fr + 7.3) - 0.5, hash(fr + 13.9) - 0.5).multiplyScalar(2 * shake);

  cam.fov = cs.fov;
  cam.updateProjectionMatrix();
  cam.position.copy(cs.pos).add(jitter);
  cam.up.copy(cs.up || V(Math.sin(cs.roll), Math.cos(cs.roll), 0));
  cam.lookAt(cs.look);

  cap.textContent = beat.caption;
  renderer.render(scene, cam);
}

window.setup = (plan) => {
  beats = plan.beats;
  if (plan.setting?.floor) floorBase.set(plan.setting.floor);
  if (plan.setting?.wall) wallBase.set(plan.setting.wall);
  buildProps(plan.props || []);
};
window.renderFrame = (t) => render(t);

// State snapshot for the automatic checker (src/qa.mjs): is each object/character on screen, did it move, is it glowing...
const _box = new THREE.Box3(), _v = new THREE.Vector3();
function screenInfo(obj) {
  cam.updateMatrixWorld(true);
  obj.updateWorldMatrix(true, true);
  _box.setFromObject(obj);
  if (_box.isEmpty()) return { onScreen: false, frac: 0, size: 0 };
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9, behind = false;
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
    if (_v.clone().applyMatrix4(cam.matrixWorldInverse).z > -0.05) behind = true;
    _v.project(cam);
    x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y);
  }
  const area = Math.max(1e-6, (x1 - x0) * (y1 - y0));
  const ox = Math.max(0, Math.min(x1, 1) - Math.max(x0, -1)), oy = Math.max(0, Math.min(y1, 1) - Math.max(y0, -1));
  const frac = behind ? 0 : (ox * oy) / area;
  const size = (y1 - y0) / 2; // fraction of the frame height
  return { onScreen: !behind && frac >= 0.4 && size >= 0.012, frac: +frac.toFixed(2), size: +size.toFixed(3) };
}
window.probe = () => {
  const out = { shake: window.__shake || 0, objects: {}, chars: {} };
  for (const [id, pr] of Object.entries(props)) {
    const g = pr.group;
    const wp = g.getWorldPosition(new THREE.Vector3());
    out.objects[id] = {
      visible: g.visible,
      ...(g.visible ? screenInfo(g) : { onScreen: false, frac: 0, size: 0 }),
      pos: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
      glowing: pr.mats.some((m) => m.emissiveIntensity > 0.05),
      pose: +(pr.pose || 0).toFixed(3),
    };
  }
  for (const who of ['A', 'B']) {
    const c = chars[who];
    const wp = c.yawG.getWorldPosition(new THREE.Vector3());
    out.chars[who] = {
      visible: c.yawG.visible,
      ...(c.yawG.visible ? screenInfo(c.yawG) : { onScreen: false, frac: 0, size: 0 }),
      pos: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
      lying: Math.abs(c.root.rotation.z) > 0.8,
      skinOpacity: c.mats.skin.transparent ? c.mats.skin.opacity : 1,
      glowing: marker.visible,
    };
  }
  return out;
};
window.ready = true;
