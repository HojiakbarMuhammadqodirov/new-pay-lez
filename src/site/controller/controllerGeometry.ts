import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A games controller as solid geometry, built procedurally.
 *
 * Everything here is closed volume with generously bevelled edges — the
 * previous wireframe read as goggles precisely because an outline has no form
 * to catch a highlight. Rounded edges are what let a key light draw the shape.
 *
 * Laid out symmetric about x = 0, face toward +Z, in a space roughly
 * 3.7 wide x 2.5 tall.
 */

export const SHELL_DEPTH = 0.42;
export const BEVEL = 0.16;
/** Front face of the shell, where the controls are mounted. */
export const FACE_Z = SHELL_DEPTH / 2 + BEVEL;

/** Rounded rectangle as a `Shape`, for extruding into a soft-edged slab. */
function roundedRect(width: number, height: number, radius: number): Shape {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const shape = new Shape();

  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  return shape;
}

/** An extruded rounded rectangle with bevelled front and back faces. */
function roundedSlab(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevel = 0.035,
): BufferGeometry {
  const geometry = new ExtrudeGeometry(roundedRect(width, height, radius), {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -depth / 2 + bevel);
  geometry.computeVertexNormals();
  return geometry;
}

/** The shell outline: shoulders out wide, two grips descending, dip between. */
function shellOutline(): Shape {
  const s = new Shape();

  s.moveTo(0, 1.14);
  s.bezierCurveTo(0.44, 1.14, 0.86, 1.08, 1.16, 0.94);
  s.bezierCurveTo(1.58, 0.76, 1.84, 0.42, 1.86, 0.02);
  s.bezierCurveTo(1.88, -0.42, 1.68, -0.76, 1.34, -0.82);
  s.bezierCurveTo(1.02, -0.88, 0.82, -0.64, 0.68, -0.36);
  s.bezierCurveTo(0.54, -0.1, 0.3, 0.0, 0, 0.0);
  s.bezierCurveTo(-0.3, 0.0, -0.54, -0.1, -0.68, -0.36);
  s.bezierCurveTo(-0.82, -0.64, -1.02, -0.88, -1.34, -0.82);
  s.bezierCurveTo(-1.68, -0.76, -1.88, -0.42, -1.86, 0.02);
  s.bezierCurveTo(-1.84, 0.42, -1.58, 0.76, -1.16, 0.94);
  s.bezierCurveTo(-0.86, 1.08, -0.44, 1.14, 0, 1.14);

  return s;
}

export function buildShell(): BufferGeometry {
  const geometry = new ExtrudeGeometry(shellOutline(), {
    depth: SHELL_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 6,
    curveSegments: 40,
  });
  geometry.translate(0, 0, -SHELL_DEPTH / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The grips swell out behind the shell.
 *
 * An extrusion alone gives a flat back, which reads as a cut-out card from any
 * angle other than dead-on. These ellipsoids are what give the 3/4 view its
 * depth.
 */
export function buildGrips(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const side of [-1, 1]) {
    const grip = new SphereGeometry(1, 32, 24);
    grip.scale(0.46, 0.62, 0.52);
    grip.rotateZ(side * 0.34);
    grip.translate(side * 1.28, -0.32, -0.16);
    parts.push(grip);
  }

  return mergeGeometries(parts, false)!;
}

/** Shoulder buttons along the top-back edge. */
export function buildTriggers(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const side of [-1, 1]) {
    const bumper = roundedSlab(0.66, 0.2, 0.34, 0.09);
    bumper.rotateX(-0.32);
    bumper.translate(side * 1.14, 1.0, -0.16);
    parts.push(bumper);
  }

  return mergeGeometries(parts, false)!;
}

/** Recessed collars the sticks sit in — reads as a machined dish. */
export function buildStickWells(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const x of [-0.62, 0.62]) {
    const well = new CylinderGeometry(0.34, 0.36, 0.07, 32);
    well.rotateX(Math.PI / 2);
    well.translate(x, -0.06, FACE_Z - 0.02);
    parts.push(well);
  }

  return mergeGeometries(parts, false)!;
}

/** Stick shaft plus dished cap, raised proud of the face. */
export function buildSticks(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const x of [-0.62, 0.62]) {
    const shaft = new CylinderGeometry(0.13, 0.17, 0.17, 24);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(x, -0.06, FACE_Z + 0.08);
    parts.push(shaft);

    const cap = new SphereGeometry(0.23, 28, 18);
    cap.scale(1, 1, 0.5);
    cap.translate(x, -0.06, FACE_Z + 0.17);
    parts.push(cap);
  }

  return mergeGeometries(parts, false)!;
}

/** D-pad: two crossed slabs, rounded. */
export function buildDpad(): BufferGeometry {
  const horizontal = roundedSlab(0.62, 0.21, 0.11, 0.06);
  const vertical = roundedSlab(0.21, 0.62, 0.11, 0.06);
  for (const part of [horizontal, vertical]) {
    part.translate(-1.12, 0.5, FACE_Z + 0.03);
  }
  return mergeGeometries([horizontal, vertical], false)!;
}

/** Four action buttons in the usual diamond, each domed. */
/**
 * The four face buttons, **one geometry each**, clockwise from the top.
 *
 * Not merged, unlike every other group here, because on a light page each one
 * takes its own colour — see `BUTTON_COLORS` in `Controller3D.tsx`. Four draw
 * calls instead of one is nothing next to the shell, and merging them would
 * mean a vertex-colour attribute and a custom material to read it, which is a
 * lot of machinery for four spheres.
 *
 * The order is the order the colours are assigned in, so it is part of the
 * contract: **top, right, bottom, left.**
 */
export function buildButtons(): BufferGeometry[] {
  const centre = { x: 1.12, y: 0.5 };
  const offsets: Array<[number, number]> = [
    [0, 0.26],
    [0.26, 0],
    [0, -0.26],
    [-0.26, 0],
  ];

  return offsets.map(([dx, dy]) => {
    const barrel = new CylinderGeometry(0.125, 0.125, 0.1, 20);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(centre.x + dx, centre.y + dy, FACE_Z + 0.03);

    const dome = new SphereGeometry(0.125, 20, 14);
    dome.scale(1, 1, 0.42);
    dome.translate(centre.x + dx, centre.y + dy, FACE_Z + 0.08);

    return mergeGeometries([barrel, dome], false)!;
  });
}

/** Touchpad slab between the shoulders. */
export function buildTouchpad(): BufferGeometry {
  const pad = roundedSlab(0.82, 0.44, 0.07, 0.1);
  pad.translate(0, 0.6, FACE_Z + 0.01);
  return pad;
}

/* ── emissive parts ─────────────────────────────────────────────────────── */

/** Light bar either side of the touchpad. */
export function buildLightBar(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const x of [-0.48, 0.48]) {
    const bar = new BoxGeometry(0.05, 0.4, 0.05);
    bar.translate(x, 0.6, FACE_Z + 0.03);
    parts.push(bar);
  }

  return mergeGeometries(parts, false)!;
}

/** Thin lit ring around each stick well. */
export function buildStickRings(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (const x of [-0.62, 0.62]) {
    const ring = new CylinderGeometry(0.335, 0.335, 0.035, 40, 1, true);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, -0.06, FACE_Z + 0.01);
    parts.push(ring);
  }

  return mergeGeometries(parts, false)!;
}
