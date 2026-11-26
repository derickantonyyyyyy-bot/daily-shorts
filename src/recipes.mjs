// Local library of "combined shape" builds. Used as (a) a reference sent to Groq for similar objects and
// (b) the fallback when Groq is unavailable, so props never degrade to a plain block.
// All sizes are metres, y is up, the front of a character faces +z, and mirror:true doubles a part across x.
const S = (shape, size, pos, color, extra = {}) => ({ shape, size, pos, color, ...extra });
const dark = '#1b1b1b', white = '#f4f4f4';

const RECIPES = [
  { kind: 'person', creature: true, re: /(human|person|man|woman|doll|dummy|figure|patient|doctor|worker|child|kid|robot|astronaut)/,
    build: (c) => [
      S('tapered', [0.2, 0.17, 0.62], [0, 1.0, 0], c),                       // torso
      S('ellipsoid', [0.2, 0.17, 0.12], [0, 0.66, 0], '#2f3542'),            // hips
      S('sphere', [0.17], [0, 1.52, 0], '#dcae8f'),                          // head
      S('sphere', [0.03], [0.065, 1.55, 0.15], dark, { mirror: true }),      // eyes
      S('capsule', [0.055, 0.5], [0.3, 1.0, 0], c, { rot: [0, 0, 0.12], mirror: true }), // arms
      S('sphere', [0.06], [0.33, 0.7, 0], '#dcae8f', { mirror: true }),      // hands
      S('capsule', [0.075, 0.5], [0.11, 0.33, 0], '#2f3542', { mirror: true }), // legs
      S('box', [0.12, 0.07, 0.26], [0.11, 0.04, 0.05], dark, { mirror: true }), // shoes
    ] },
  { kind: 'animal', creature: true, re: /(cat|dog|fox|wolf|bear|rabbit|rat|mouse|pig|cow|horse|animal|creature|monster|beast)/,
    build: (c) => [
      S('ellipsoid', [0.22, 0.2, 0.4], [0, 0.45, 0], c),                       // body
      S('sphere', [0.17], [0, 0.62, 0.42], c),                                 // head
      S('cone', [0.06, 0.14], [0.1, 0.82, 0.42], c, { mirror: true }),         // ears
      S('sphere', [0.025], [0.07, 0.66, 0.57], dark, { mirror: true }),        // eyes
      S('sphere', [0.03], [0, 0.6, 0.6], '#d47a7a'),                           // nose
      S('capsule', [0.05, 0.28], [0.12, 0.2, 0.28], c, { mirror: true }),      // front legs
      S('capsule', [0.05, 0.28], [0.12, 0.2, -0.28], c, { mirror: true }),     // back legs
      S('capsule', [0.035, 0.4], [0, 0.55, -0.55], c, { rot: [-1.0, 0, 0] }),  // tail
    ] },
  { kind: 'bird', creature: true, re: /(bird|crow|pigeon|eagle|owl|duck|chicken|parrot)/,
    build: (c) => [
      S('ellipsoid', [0.14, 0.15, 0.22], [0, 0.3, 0], c),
      S('sphere', [0.09], [0, 0.45, 0.2], c),
      S('cone', [0.035, 0.12], [0, 0.44, 0.33], '#e0a526', { rot: [1.57, 0, 0] }),
      S('sphere', [0.018], [0.045, 0.48, 0.27], dark, { mirror: true }),
      S('wedge', [0.3, 0.14, 0.03], [0.2, 0.32, 0], c, { rot: [0, 0, -0.3], mirror: true }),
      S('wedge', [0.18, 0.1, 0.03], [0, 0.28, -0.3], c, { rot: [0.4, 0, 0] }),
      S('cylinder', [0.012, 0.15], [0.05, 0.08, 0.02], '#e0a526', { mirror: true }),
    ] },
  { kind: 'fish', creature: true, re: /(fish|shark|whale|dolphin|eel|squid)/,
    build: (c) => [
      S('ellipsoid', [0.2, 0.2, 0.55], [0, 0.5, 0], c),
      S('wedge', [0.3, 0.35, 0.04], [0, 0.5, -0.6], c, { rot: [0, 1.57, 0] }),
      S('wedge', [0.25, 0.22, 0.04], [0, 0.78, 0], c, { rot: [0, 1.57, 0] }),
      S('wedge', [0.22, 0.16, 0.04], [0.2, 0.42, 0.15], c, { rot: [0, 0, -0.5], mirror: true }),
      S('sphere', [0.03], [0.14, 0.56, 0.4], dark, { mirror: true }),
    ] },
  { kind: 'insect', creature: true, re: /(bee|wasp|fly|insect|bug|ant|beetle)/,
    build: (c) => [
      S('ellipsoid', [0.07, 0.07, 0.11], [0, 0.4, -0.08], '#e9b824'),
      S('ellipsoid', [0.073, 0.073, 0.03], [0, 0.4, -0.06], dark),
      S('sphere', [0.055], [0, 0.4, 0.07], c),
      S('sphere', [0.014], [0.03, 0.42, 0.11], dark, { mirror: true }),
      S('ellipsoid', [0.09, 0.01, 0.05], [0.09, 0.48, -0.02], '#cfe6f2', { rot: [0, 0, 0.4], mirror: true }),
      S('cone', [0.012, 0.05], [0, 0.4, -0.21], dark, { rot: [-1.57, 0, 0] }),
    ] },
  { kind: 'spider', creature: true, re: /(spider|crab|scorpion)/,
    build: (c) => [
      S('sphere', [0.12], [0, 0.22, -0.08], c),
      S('sphere', [0.08], [0, 0.22, 0.08], c),
      ...[0.1, 0.0, -0.1, -0.2].map((z, i) => S('capsule', [0.012, 0.3], [0.2, 0.15, z], dark, { rot: [0.2 * (i - 1.5), 0, -1.0], mirror: true })),
    ] },
  { kind: 'car', re: /(car|sedan|truck|van|bus|vehicle|taxi)/,
    build: (c) => [
      S('box', [1.7, 0.45, 4.2], [0, 0.55, 0], c),
      S('box', [1.5, 0.45, 2.0], [0, 0.98, -0.2], '#9fc4d8'),
      S('torus', [0.3, 0.1], [0.9, 0.32, 1.35], dark, { rot: [0, 1.57, 0], mirror: true }),
      S('torus', [0.3, 0.1], [0.9, 0.32, -1.35], dark, { rot: [0, 1.57, 0], mirror: true }),
      S('sphere', [0.12], [0.6, 0.62, 2.1], '#ffe9a8', { mirror: true }),
    ] },
  { kind: 'icicle', re: /(icicle|spike|nail|shard|thorn|needle|dagger|stalactite)/,
    build: (c) => [
      S('cone', [0.08, 0.7], [0, 0.35, 0], c, { rot: [3.14, 0, 0] }),
      S('cylinder', [0.09, 0.05], [0, 0.72, 0], c),
    ] },
  { kind: 'cable', re: /(cable|wire|rope|cord|chain|hose)/,
    build: (c) => [
      ...[0, 1, 2, 3, 4].map((i) => S('capsule', [0.025, 0.5], [Math.sin(i * 0.9) * 0.12, 0.25 + i * 0.5, 0], c)),
      S('cone', [0.04, 0.12], [0.02, 2.6, 0], '#c9803a'),
      S('cone', [0.025, 0.1], [-0.04, 2.6, 0.02], '#c9803a', { rot: [0, 0, 0.5] }),
    ] },
  { kind: 'mug', re: /(mug|cup|glass|vial|bottle|jar)/,
    build: (c) => [
      S('cylinder', [0.05, 0.1], [0, 0.05, 0], c),
      S('torus', [0.03, 0.009], [0.06, 0.05, 0], c, { rot: [0, 1.57, 0] }),
    ] },
  { kind: 'cone', re: /(cone|pylon|funnel)/,
    build: (c) => [
      S('cone', [0.2, 0.7], [0, 0.4, 0], '#ff6a1a'),
      S('box', [0.5, 0.05, 0.5], [0, 0.025, 0], '#2b2b2b'),
      S('torus', [0.13, 0.02], [0, 0.4, 0], white, { rot: [1.57, 0, 0] }),
    ] },
  { kind: 'chair', re: /(chair|stool|bench|seat)/,
    build: (c) => [
      S('box', [0.45, 0.05, 0.45], [0, 0.45, 0], c),
      S('box', [0.45, 0.5, 0.05], [0, 0.72, -0.22], c),
      S('cylinder', [0.025, 0.45], [0.19, 0.225, 0.19], c, { mirror: true }),
      S('cylinder', [0.025, 0.45], [0.19, 0.225, -0.19], c, { mirror: true }),
    ] },
  { kind: 'blade', re: /(knife|scalpel|blade|razor|scissor|axe)/,
    build: (c) => [
      S('wedge', [0.18, 0.03, 0.01], [0, 0.03, 0.07], '#cfd5d9'),
      S('box', [0.16, 0.03, 0.012], [0, 0.03, 0.07], '#cfd5d9'),
      S('cylinder', [0.012, 0.1], [0, 0.03, -0.04], dark, { rot: [1.57, 0, 0] }),
    ] },
  { kind: 'pot', re: /(cooker|pot|pan|kettle|tank|cylinder|barrel|drum|canister|battery)/,
    build: (c) => [
      S('cylinder', [0.17, 0.3], [0, 0.15, 0], c),
      S('dome', [0.17], [0, 0.3, 0], c),
      S('torus', [0.08, 0.015], [0.2, 0.2, 0], dark, { rot: [0, 1.57, 0], mirror: true }),
      S('cylinder', [0.02, 0.05], [0, 0.46, 0], dark),
    ] },
  { kind: 'card', re: /(card|phone|tablet|book|plate|sheet|paper|tile)/,
    build: (c) => [S('box', [0.086, 0.054, 0.003], [0, 0.03, 0], c)],
  },
  { kind: 'ball', re: /(ball|sphere|particle|bubble|pill|drop|cell|pearl)/,
    build: (c) => [S('sphere', [0.05], [0, 0.05, 0], c), S('sphere', [0.018], [0.02, 0.07, 0.035], white)],
  },
  { kind: 'wave', re: /(wave|water|liquid|flood|fluid|blood|smoke|cloud)/,
    build: (c) => [
      S('ellipsoid', [0.8, 0.35, 0.4], [0, 0.3, 0], c),
      S('wedge', [0.6, 0.5, 0.5], [0.3, 0.5, 0.1], c, { rot: [0, 0, 0.3] }),
      S('ellipsoid', [0.3, 0.1, 0.5], [-0.6, 0.1, 0.2], white),
    ] },
];

const GENERIC = (c) => [
  S('tapered', [0.22, 0.28, 0.5], [0, 0.3, 0], c),
  S('dome', [0.22], [0, 0.55, 0], c),
  S('torus', [0.27, 0.025], [0, 0.35, 0], '#3a3a3a', { rot: [1.57, 0, 0] }),
];

// Whole-word matching (so "steel_cable" is not a fish because of "eel", and "credit_card" is not a car).
const words = (type) => String(type || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
const matches = (re, type) => words(type).some((w) => new RegExp(`^(?:${re.source})s?$`).test(w));
const find = (type) => RECIPES.find((x) => matches(x.re, type));

export function recipeFor(type, color = '#8a7f6a') {
  const r = find(type);
  return { kind: r?.kind || 'generic', creature: Boolean(r?.creature), parts: (r ? r.build(color) : GENERIC(color)), matched: Boolean(r) };
}
export const isCreature = (type) => Boolean(find(type)?.creature);
