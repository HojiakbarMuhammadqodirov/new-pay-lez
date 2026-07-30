/**
 * A shattered-glass triangle mesh for the nav hover.
 *
 * Generated rather than hand-drawn so the density is a single number, and
 * deterministic so every nav item fractures identically — a per-item random
 * pattern reads as noise, not as one pane of glass.
 *
 * Coordinates are in a 0..100 x 0..100 space; the SVG stretches to the pill
 * with `preserveAspectRatio="none"`, so one mesh fits every label length.
 */

export interface Triangle {
  points: string;
  /** Centroid in mesh space (0..100), used for the pointer falloff. */
  cx: number;
  cy: number;
}

/** Deterministic 32-bit PRNG — same fracture on every render and every item. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a jittered grid and splits every cell into two triangles.
 *
 * The jitter is what stops it looking like graph paper: interior vertices move,
 * edge vertices stay pinned so the mesh still tiles the pill exactly with no
 * gap at the border.
 */
export function buildGlassMesh(columns = 7, rows = 3, seed = 0x9e3779b9): Triangle[] {
  const random = mulberry32(seed);

  const grid: Array<Array<[number, number]>> = [];
  for (let row = 0; row <= rows; row++) {
    const line: Array<[number, number]> = [];
    for (let col = 0; col <= columns; col++) {
      const onEdge = row === 0 || row === rows || col === 0 || col === columns;
      const jitterX = onEdge ? 0 : (random() - 0.5) * (100 / columns) * 0.55;
      const jitterY = onEdge ? 0 : (random() - 0.5) * (100 / rows) * 0.55;
      line.push([
        (col / columns) * 100 + jitterX,
        (row / rows) * 100 + jitterY,
      ]);
    }
    grid.push(line);
  }

  const triangles: Triangle[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = grid[row][col];
      const b = grid[row][col + 1];
      const c = grid[row + 1][col + 1];
      const d = grid[row + 1][col];

      // Alternate the diagonal so the shards do not all lean the same way.
      const flip = random() > 0.5;
      const pair: Array<Array<[number, number]>> = flip
        ? [
            [a, b, c],
            [a, c, d],
          ]
        : [
            [a, b, d],
            [b, c, d],
          ];

      for (const tri of pair) {
        triangles.push({
          points: tri.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '),
          cx: Number(((tri[0][0] + tri[1][0] + tri[2][0]) / 3).toFixed(2)),
          cy: Number(((tri[0][1] + tri[1][1] + tri[2][1]) / 3).toFixed(2)),
        });
      }
    }
  }

  return triangles;
}

/** Built once at module load and shared by every nav item. */
export const GLASS_MESH = buildGlassMesh();
