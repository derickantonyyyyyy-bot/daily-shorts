// Props are modelled by Groq in THREE passes, each with its own API key:
//   pass 1 (GROQ_API_KEY_1)  create    - builds the object from simple primitives
//   pass 2 (GROQ_API_KEY_2)  enhance   - fixes it so it looks like what the object means (defining features, proportions)
//   pass 3 (GROQ_API_KEY_3)  polish    - adds fine detail, material variety, wear and a distinctive silhouette
// A failed or invalid pass keeps the previous result. A missing key reuses the first available key.
// With no Groq key at all, plain placeholder blocks are used so the video still renders.
import fs from 'node:fs';
import { groq, parseJson } from './llm.mjs';

const script = JSON.parse(fs.readFileSync('work/script.json', 'utf8'));
const SHAPES = { box: 3, sphere: 1, cylinder: 2, cone: 2, capsule: 2 };
const num = (v, d, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

const k1 = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY;
const keys = [k1, process.env.GROQ_API_KEY_2 || k1, process.env.GROQ_API_KEY_3 || process.env.GROQ_API_KEY_2 || k1];
const PASSES = [
  { name: 'create', cap: 10, temp: 0.8 },
  { name: 'enhance', cap: 16, temp: 0.6 },
  { name: 'polish', cap: 24, temp: 0.6 },
];

function cleanPart(p) {
  if (!p || !SHAPES[p.shape]) return null;
  return {
    shape: p.shape,
    size: Array.from({ length: SHAPES[p.shape] }, (_, i) => num(p.size?.[i], 0.1, 0.01, 3)),
    pos: [0, 1, 2].map((i) => num(p.pos?.[i], 0, -3, 3)),
    rot: [0, 1, 2].map((i) => num(p.rot?.[i], 0, -6.3, 6.3)),
    color: /^#[0-9a-fA-F]{6}$/.test(String(p.color)) ? p.color : '#888888',
  };
}

const FORMAT = `Shapes and size arrays: box [width, height, depth]; sphere [radius]; cylinder [radius, height]; cone [radius, height]; capsule [radius, length].
"pos" is [x, y, z] of the part's CENTRE relative to the object's base centre (metres, y up, lowest point at y = 0). "rot" is optional [x, y, z] radians. "color" is "#rrggbb".
Reply with JSON only: {"parts":[{"shape":"box","size":[0.1,0.1,0.1],"pos":[0,0.05,0],"rot":[0,0,0],"color":"#aa5533"}]}`;

function promptFor(pass, def, parts) {
  const who = `Object: ${def.name}. Its role in the scene: ${def.purpose}. Setting: ${script.setting.name}. ${
    def.holdable ? 'It is HOLDABLE, so keep it under 0.4 m in every dimension.' : 'It is fixed scenery.'
  }`;
  if (pass === 0) {
    return `You are a 3D prop modeller. Build the object below from simple primitives so it is instantly recognisable by silhouette and has character (wear, chips, a distinctive colour accent), not a generic block.
${who}
Use 3 to 10 parts. ${FORMAT}`;
  }
  const cur = JSON.stringify({ parts });
  if (pass === 1) {
    return `You are a senior 3D prop artist reviewing a first draft built from primitives. Make it look like what this object actually MEANS: a stranger should name it at a glance.
${who}
Fix proportions, add the defining features it is missing (handle, spout, lid, hinges, frayed ends, rust, labels, cracks), correct wrong colours, and remove parts that do not belong. Keep what already works.
Use up to 16 parts. ${FORMAT}
Current draft:
${cur}`;
  }
  return `You are a lead 3D prop artist doing the final polish on a prop built from primitives. Push it further so it looks like the real thing, not a toy.
${who}
Add fine detail and material variety (rims, seams, bolts, wear marks, dents, tape, dirt, small accent colours), make the silhouette more distinctive, and make the hazard or purpose of the object visually obvious. Keep every defining feature of the current version and stay within real-world proportions.
Use up to 24 parts. ${FORMAT}
Current version:
${cur}`;
}

async function designOne(def) {
  let parts = null;
  const trail = [];
  for (let n = 0; n < PASSES.length; n++) {
    try {
      const out = parseJson(await groq(promptFor(n, def, parts), { key: keys[n], temperature: PASSES[n].temp, max: 6000 }));
      const next = (out.parts || []).slice(0, PASSES[n].cap).map(cleanPart).filter(Boolean);
      if (next.length < (n === 0 ? 1 : 3)) throw new Error(`only ${next.length} valid parts`);
      parts = next;
      trail.push(`${PASSES[n].name}:${parts.length}`);
    } catch (e) {
      trail.push(`${PASSES[n].name}:kept previous (${e.message.slice(0, 80)})`);
      if (!parts && n === 0) break; // nothing to refine, give up on this prop
    }
  }
  return { parts, trail };
}

const designed = {};
const trails = {};
if (script.props.length) {
  if (!k1) {
    console.warn('No GROQ_API_KEY_1 / GROQ_API_KEY set, using placeholder props.');
  } else {
    await Promise.all(
      script.props.map(async (p) => {
        const r = await designOne(p);
        trails[p.id] = r.trail.join(' > ');
        if (r.parts) designed[p.id] = r.parts;
      })
    );
  }
}

const props = script.props.map((p) => ({
  ...p,
  parts: designed[p.id] || [
    { shape: 'box', size: [p.holdable ? 0.12 : 0.6, p.holdable ? 0.16 : 0.8, p.holdable ? 0.12 : 0.6], pos: [0, p.holdable ? 0.08 : 0.4, 0], rot: [0, 0, 0], color: '#8a7f6a' },
  ],
  designedBy: designed[p.id] ? 'groq' : 'placeholder',
}));

fs.writeFileSync('work/props.json', JSON.stringify({ props }, null, 2));
for (const p of props) console.log(`${p.id} [${p.designedBy}, ${p.parts.length} parts] ${trails[p.id] || ''}`);
