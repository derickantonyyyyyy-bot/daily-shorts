// Props are built by COMBINING primitive shapes (box, sphere, cylinder, cone, capsule, ellipsoid, dome, tapered, torus, wedge)
// into something that looks like the thing: a mug is a cylinder plus a torus handle, a cat is an ellipsoid body, a sphere head,
// cone ears, capsule legs and a tail.
//
// Groq designs each object in THREE passes, each with its own API key:
//   pass 1 (GROQ_API_KEY_1)  create    - builds it, starting from a local reference recipe when one matches (src/recipes.mjs)
//   pass 2 (GROQ_API_KEY_2)  enhance   - fixes it so it looks like what the object means (defining features, proportions)
//   pass 3 (GROQ_API_KEY_3)  polish    - fine detail, material variety, wear, a distinctive silhouette
// A failed or invalid pass keeps the previous result. Without Groq (or if every pass fails) the local recipe is used, so an
// object is never just a plain block. Characters and creatures get character-specific instructions and an idle animation.
import fs from 'node:fs';
import { groq, parseJson } from './llm.mjs';
import { expand } from './parts.mjs';
import { recipeFor } from './recipes.mjs';

const script = JSON.parse(fs.readFileSync('work/script.json', 'utf8'));

const k1 = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY;
const keys = [k1, process.env.GROQ_API_KEY_2 || k1, process.env.GROQ_API_KEY_3 || process.env.GROQ_API_KEY_2 || k1];
const PASSES = [
  { name: 'create', cap: 14, temp: 0.8 },
  { name: 'enhance', cap: 22, temp: 0.6 },
  { name: 'polish', cap: 34, temp: 0.6 },
];

const FORMAT = `Shapes and size arrays:
  box [width, height, depth]; sphere [radius]; cylinder [radius, height]; cone [radius, height]; capsule [radius, length];
  ellipsoid [rx, ry, rz] (stretched sphere: bodies, heads, bellies); dome [radius] (half sphere, flat side down: lids, caps, helmets);
  tapered [radiusTop, radiusBottom, height] (cone-like cylinder: torsos, legs, cups, bottles); torus [radius, tube] (rings, handles, wheels, bands);
  wedge [width, height, depth] (triangular prism: fins, wings, roofs, blades).
"pos" is [x, y, z] of the part's CENTRE relative to the object's base centre (metres, y up, lowest point at y = 0, the front faces +z). "rot" is optional [x, y, z] radians. "color" is "#rrggbb".
Add "mirror": true to a part to automatically create its left/right twin across the x axis (use it for eyes, ears, arms, legs, wheels, wings: describe ONE side only).
Do not build the object out of boxes alone: combine DIFFERENT shapes so the silhouette is recognisable.
Reply with JSON only: {"parts":[{"shape":"ellipsoid","size":[0.2,0.2,0.4],"pos":[0,0.45,0],"rot":[0,0,0],"color":"#aa5533","mirror":false}]}`;

const CHARACTER = `This is a CHARACTER / creature. Build it the way a toy designer would from combined shapes: a body (ellipsoid or tapered), a head (sphere or ellipsoid) with eyes (small dark spheres, mirror), a nose / snout / beak, ears or other head features, limbs as capsules with hands or feet (mirror), and a tail or accessory if it fits. Give it a clear face and a distinctive silhouette and colour accents.`;

function promptFor(pass, def, parts, ref) {
  const creature = Boolean(def.creature);
  const who = `Object: ${def.name}. Its role in the scene: ${def.purpose}. Setting: ${script.setting.name}.${def.material ? ` Main material: ${def.material.replace(/_/g, ' ')}.` : ''} ${
    def.holdable ? 'It is HOLDABLE, so keep it under 0.4 m in every dimension.' : 'Use realistic real-world size.'
  }${creature ? `\n${CHARACTER}` : ''}`;
  if (pass === 0) {
    const refText = ref?.matched
      ? `\nA reference build of a similar thing (adapt it to this object, change proportions, colours and details; do not copy blindly):\n${JSON.stringify({ parts: ref.parts })}`
      : '';
    return `You are a 3D prop modeller. Build the object below by combining several different primitive shapes so it is instantly recognisable by silhouette and has character (wear, chips, a distinctive colour accent).
${who}${refText}
Use 4 to 14 parts. ${FORMAT}`;
  }
  const cur = JSON.stringify({ parts });
  if (pass === 1) {
    return `You are a senior 3D prop artist reviewing a first draft built from primitives. Make it look like what this object actually MEANS: a stranger should name it at a glance.
${who}
Fix proportions, add the defining features it is missing (handle, spout, lid, hinges, frayed ends, rust, labels, cracks, face, limbs), swap boxes for rounder shapes where the real thing is round, correct wrong colours, and remove parts that do not belong. Keep what already works.
Use up to 22 parts. ${FORMAT}
Current draft:
${cur}`;
  }
  return `You are a lead 3D prop artist doing the final polish on a prop built from primitives. Push it further so it looks like the real thing, not a toy.
${who}
Add fine detail and material variety (rims, seams, bolts, wear marks, dents, tape, dirt, small accent colours${creature ? ', eyebrows, teeth, claws, patterns, clothing details' : ''}), make the silhouette more distinctive, and make the hazard or purpose of the object visually obvious. Keep every defining feature of the current version and stay within real-world proportions.
Use up to 34 parts. ${FORMAT}
Current version:
${cur}`;
}

async function designOne(def) {
  const ref = recipeFor(def.name, def.color);
  let parts = null;
  const trail = [];
  for (let n = 0; n < PASSES.length; n++) {
    try {
      const out = parseJson(await groq(promptFor(n, def, parts, ref), { key: keys[n], temperature: PASSES[n].temp, max: 7000 }));
      const next = expand(out.parts || [], 60).slice(0, PASSES[n].cap * 2);
      if (next.length < (n === 0 ? 2 : 4)) throw new Error(`only ${next.length} valid parts`);
      parts = next;
      trail.push(`${PASSES[n].name}:${parts.length}`);
    } catch (e) {
      trail.push(`${PASSES[n].name}:kept previous (${e.message.slice(0, 80)})`);
      if (!parts && n === 0) break; // nothing to refine, fall back to the local recipe
    }
  }
  return { parts, trail };
}

const designed = {};
const trails = {};
if (script.props.length) {
  if (!k1) {
    console.warn('No GROQ_API_KEY_1 / GROQ_API_KEY set, building props from the local recipes.');
  } else {
    await Promise.all(
      script.props.filter((p) => !p.parts).map(async (p) => { // props with preset parts (set dressing) are kept as they are
        const r = await designOne(p);
        trails[p.id] = r.trail.join(' > ');
        if (r.parts) designed[p.id] = r.parts;
      })
    );
  }
}

const props = script.props.map((p) => {
  const recipe = recipeFor(p.name, p.color);
  const by = p.parts ? 'preset' : designed[p.id] ? 'groq' : 'recipe';
  return {
    ...p,
    creature: p.creature ?? recipe.creature,
    parts: p.parts || designed[p.id] || expand(recipe.parts, 60),
    designedBy: by,
    recipeKind: recipe.kind,
  };
});

fs.writeFileSync('work/props.json', JSON.stringify({ props }, null, 2));
for (const p of props) {
  const shapes = [...new Set(p.parts.map((x) => x.shape))].join('+');
  console.log(`${p.id} [${p.designedBy}${p.creature ? ', character' : ''}, ${p.parts.length} parts: ${shapes}] ${trails[p.id] || ''}`);
}
