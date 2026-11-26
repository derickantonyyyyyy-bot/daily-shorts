// Shared helpers for objects built by combining primitive shapes.
export const SHAPES = { box: 3, sphere: 1, cylinder: 2, cone: 2, capsule: 2, ellipsoid: 3, dome: 1, tapered: 3, torus: 2, wedge: 3 };
const num = (v, d, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function cleanPart(p) {
  if (!p || !SHAPES[p.shape]) return null;
  return {
    shape: p.shape,
    size: Array.from({ length: SHAPES[p.shape] }, (_, i) => num(p.size?.[i], 0.1, 0.005, 5)),
    pos: [0, 1, 2].map((i) => num(p.pos?.[i], 0, -4, 4)),
    rot: [0, 1, 2].map((i) => num(p.rot?.[i], 0, -6.3, 6.3)),
    color: /^#[0-9a-fA-F]{6}$/.test(String(p.color)) ? p.color : '#888888',
    mirror: Boolean(p.mirror),
  };
}

// A part with mirror:true becomes itself plus its left/right twin (x flipped), so only one side is ever described.
export function expand(parts, cap = 60) {
  const out = [];
  for (const raw of parts) {
    const p = cleanPart(raw);
    if (!p) continue;
    const { mirror, ...one } = p;
    out.push(one);
    if (mirror && Math.abs(one.pos[0]) > 0.001) {
      out.push({ ...one, pos: [-one.pos[0], one.pos[1], one.pos[2]], rot: [one.rot[0], -one.rot[1], -one.rot[2]] });
    }
    if (out.length >= cap) break;
  }
  return out.slice(0, cap);
}
