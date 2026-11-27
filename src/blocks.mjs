// Block mode: every prop is rebuilt out of small cubes ("blocks", like toy bricks), so it reads at a glance and each limb can move.
// Any primitive design (from Groq or src/recipes.mjs) is rasterised onto a grid; only the visible surface blocks are kept.
// A part may carry a "part" tag (head, arm, leg, wing, tail, fin, wheel...). Tagged blocks become their own pivot group in the
// renderer so the object can perform actions (walk, wave, hop, flap, wag, nod, spin, dance, wobble).
export const PERFORMS = ['walk', 'wave', 'hop', 'flap', 'wag', 'nod', 'spin', 'dance', 'wobble'];
export const PART_TAGS = ['head', 'arm', 'leg', 'wing', 'tail', 'fin', 'wheel', 'ear', 'body'];

function rotM([rx, ry, rz]) { // Euler XYZ (three.js default) as a 3x3 matrix, row-major
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  return [c * e, -c * f, d, a * f + b * d * e, a * e - b * d * f, -b * c, b * f - a * d * e, b * e + a * d * f, a * c];
}
function inside(shape, [a, b, c], x, y, z) {
  switch (shape) {
    case 'box': return Math.abs(x) <= a / 2 && Math.abs(y) <= b / 2 && Math.abs(z) <= c / 2;
    case 'sphere': return x * x + y * y + z * z <= a * a;
    case 'ellipsoid': return (x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2 <= 1;
    case 'cylinder': return x * x + z * z <= a * a && Math.abs(y) <= b / 2;
    case 'cone': { const h = b; if (Math.abs(y) > h / 2) return false; const r = (a * (h / 2 - y)) / h; return x * x + z * z <= r * r; }
    case 'tapered': { const h = c; if (Math.abs(y) > h / 2) return false; const r = b + ((a - b) * (y + h / 2)) / h; return x * x + z * z <= r * r; }
    case 'capsule': { const hl = b / 2; const cy = Math.max(-hl, Math.min(hl, y)); return x * x + (y - cy) ** 2 + z * z <= a * a; }
    case 'dome': return y >= 0 && x * x + y * y + z * z <= a * a;
    case 'torus': return (Math.hypot(x, y) - a) ** 2 + z * z <= b * b;
    case 'wedge': { const X = x + a / 2, Y = y + b / 2; return X >= 0 && Y >= 0 && X / a + Y / b <= 1 && Math.abs(z) <= c / 2; }
    default: return false;
  }
}
function extent(p) { // half size of a part's bounding box in its local frame
  const [a, b, c] = p.size;
  switch (p.shape) {
    case 'box': case 'wedge': return [a / 2, b / 2, c / 2];
    case 'sphere': case 'dome': return [a, a, a];
    case 'ellipsoid': return [a, b, c];
    case 'cylinder': return [a, b / 2, a];
    case 'cone': return [a, b / 2, a];
    case 'tapered': { const r = Math.max(a, b); return [r, c / 2, r]; }
    case 'capsule': return [a, b / 2 + a, a];
    case 'torus': return [a + b, a + b, b];
    default: return [a, a, a];
  }
}

// parts: [{shape,size,pos,rot,color,part?}] -> blocks as box parts. maxBlocks keeps the draw count sane.
export function blockify(parts, { maxBlocks = 260, minCell = 0.03 } = {}) {
  if (!parts.length) return parts;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const prep = parts.map((p) => {
    const e = extent(p), R = rotM(p.rot || [0, 0, 0]);
    const w = [0, 1, 2].map((i) => Math.abs(R[i * 3]) * e[0] + Math.abs(R[i * 3 + 1]) * e[1] + Math.abs(R[i * 3 + 2]) * e[2]);
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.pos[i] - w[i]); hi[i] = Math.max(hi[i], p.pos[i] + w[i]); }
    return { p, R, w };
  });
  const maxDim = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.05);
  let cell = Math.max(minCell, maxDim / 16);
  for (let tries = 0; tries < 8; tries++) {
    const grid = new Map();
    const key = (i, j, k) => `${i},${j},${k}`;
    const ox = lo[0], oy = lo[1], oz = lo[2];
    for (const { p, R, w } of prep) {
      const i0 = Math.floor((p.pos[0] - w[0] - ox) / cell), i1 = Math.ceil((p.pos[0] + w[0] - ox) / cell);
      const j0 = Math.floor((p.pos[1] - w[1] - oy) / cell), j1 = Math.ceil((p.pos[1] + w[1] - oy) / cell);
      const k0 = Math.floor((p.pos[2] - w[2] - oz) / cell), k1 = Math.ceil((p.pos[2] + w[2] - oz) / cell);
      let hit = 0;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const dx = ox + (i + 0.5) * cell - p.pos[0], dy = oy + (j + 0.5) * cell - p.pos[1], dz = oz + (k + 0.5) * cell - p.pos[2];
        // inverse rotation = transpose
        const lx = R[0] * dx + R[3] * dy + R[6] * dz, ly = R[1] * dx + R[4] * dy + R[7] * dz, lz = R[2] * dx + R[5] * dy + R[8] * dz;
        if (inside(p.shape, p.size, lx, ly, lz)) { grid.set(key(i, j, k), { i, j, k, color: p.color, part: p.part || null }); hit++; }
      }
      if (!hit) { // thin parts (a whisker, a wire) still get one block at their centre
        const i = Math.round((p.pos[0] - ox) / cell - 0.5), j = Math.round((p.pos[1] - oy) / cell - 0.5), k = Math.round((p.pos[2] - oz) / cell - 0.5);
        grid.set(key(i, j, k), { i, j, k, color: p.color, part: p.part || null });
      }
    }
    const shell = [...grid.values()].filter((c) => ![[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].every(([a, b, d]) => grid.has(key(c.i + a, c.j + b, c.k + d))));
    if (shell.length <= maxBlocks || tries === 7) {
      const s = cell * 0.94; // a hair under the cell so block edges stay visible
      const minJ = Math.min(...shell.map((c) => c.j));
      const base = (minJ) * cell + oy; // lowest block rests on y = 0
      return shell.map((c) => ({
        shape: 'box', size: [s, s, s], rot: [0, 0, 0], color: c.color, ...(c.part ? { part: c.part } : {}),
        pos: [+(ox + (c.i + 0.5) * cell).toFixed(3), +(oy + (c.j + 0.5) * cell - base).toFixed(3), +(oz + (c.k + 0.5) * cell).toFixed(3)],
      }));
    }
    cell *= 1.18;
  }
  return parts;
}
