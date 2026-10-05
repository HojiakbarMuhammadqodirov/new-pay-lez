/**
 * A QR code encoder: byte mode, error-correction level M, versions 1 to 40.
 *
 * A port of the phone app's `lib/utils/qr_encoder.dart`, which follows
 * Project Nayuki's reference encoder (MIT), trimmed to the one mode and one
 * level needed. The site carries its own for the same reason the app does: a
 * QR package would be a new runtime dependency for a few hundred lines of
 * well-known arithmetic. The Dart encoder's output was decoded back by
 * OpenCV, and `scripts/verify-geo.ts` pins this port to the same symbol,
 * module for module.
 *
 * Byte mode because a store URL has lower case, which alphanumeric mode lacks.
 * Level M recovers 15%, which covers a phone camera aimed at a monitor.
 */

/** A finished symbol, size × size modules with `true` for dark. No quiet zone. */
export interface QrMatrix {
  version: number;
  size: number;
  mask: number;
  dark: (x: number, y: number) => boolean;
}

/** Level M, indexed by version (index 0 unused). */
const ECC_PER_BLOCK = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28,
  26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28,
];
const BLOCKS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
  17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45,
  47, 49,
];

const countBits = (version: number) => (version <= 9 ? 8 : 16);

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (version: number) =>
  Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];

/** Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1. */
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

function withEcc(version: number, data: number[]): number[] {
  const numBlocks = BLOCKS[version];
  const eccLen = ECC_PER_BLOCK[version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);

  const blocks: number[][] = [];
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, divisor);
    // A gap in the short blocks, so every block is the same length.
    blocks.push([...dat, ...(i < numShort ? [0] : []), ...ecc]);
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      // Skip the short blocks' padding byte.
      if (i !== shortLen - eccLen || j >= numShort) result.push(blocks[j][i]);
    }
  }
  return result;
}

class Builder {
  readonly version: number;
  readonly size: number;
  readonly modules: boolean[];
  readonly fn: boolean[];

  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = new Array<boolean>(this.size * this.size).fill(false);
    this.fn = new Array<boolean>(this.size * this.size).fill(false);
  }

  get(x: number, y: number): boolean {
    return this.modules[y * this.size + x];
  }

  private set(x: number, y: number, dark: boolean): void {
    this.modules[y * this.size + x] = dark;
    this.fn[y * this.size + x] = true;
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(this.size - 4, 3);
    this.finder(3, this.size - 4);

    const positions = this.alignmentPositions();
    const n = positions.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Not over the three finders.
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.alignment(positions[i], positions[j]);
      }
    }
    this.drawFormatBits(0); // reserves the area; redrawn once the mask is chosen
    this.drawVersion();
  }

  private finder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.set(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private alignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) return [];
    const n = Math.floor(this.version / 7) + 2;
    const step = Math.floor((this.version * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const result: number[] = [];
    for (let i = 0; i < n - 1; i++) result.push(this.size - 7 - i * step);
    result.push(6);
    return result.reverse();
  }

  drawFormatBits(mask: number): void {
    // Level M's format bits are 00.
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(i));
    this.set(8, this.size - 8, true); // the dark module
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  drawCodewords(data: number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.fn[y * this.size + x] && i < data.length * 8) {
            this.modules[y * this.size + x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.fn[y * this.size + x]) continue;
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (invert) this.modules[y * this.size + x] = !this.modules[y * this.size + x];
      }
    }
  }

  /** The standard's four penalty rules, used only to rank the eight masks. */
  penalty(): number {
    const size = this.size;
    const finderLike = [true, false, true, true, true, false, true];
    let score = 0;

    const lines = (at: (line: number, i: number) => boolean): number => {
      let s = 0;
      for (let line = 0; line < size; line++) {
        // Rule 1: runs of five or more.
        let run = 1;
        for (let i = 1; i <= size; i++) {
          if (i < size && at(line, i) === at(line, i - 1)) {
            run++;
          } else {
            if (run >= 5) s += 3 + (run - 5);
            run = 1;
          }
        }
        // Rule 3: a finder look-alike with four light modules on either side
        // (off the edge counts as light).
        const lightAt = (i: number) => i < 0 || i >= size || !at(line, i);
        for (let i = 0; i + 7 <= size; i++) {
          let match = true;
          for (let k = 0; k < 7; k++) {
            if (at(line, i + k) !== finderLike[k]) {
              match = false;
              break;
            }
          }
          if (!match) continue;
          const before = lightAt(i - 1) && lightAt(i - 2) && lightAt(i - 3) && lightAt(i - 4);
          const after = lightAt(i + 7) && lightAt(i + 8) && lightAt(i + 9) && lightAt(i + 10);
          if (before || after) s += 40;
        }
      }
      return s;
    };

    score += lines((y, x) => this.get(x, y));
    score += lines((x, y) => this.get(x, y));

    // Rule 2: 2×2 blocks of one colour.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.get(x, y);
        if (c === this.get(x + 1, y) && c === this.get(x, y + 1) && c === this.get(x + 1, y + 1)) score += 3;
      }
    }

    // Rule 4: how far from half dark.
    let dark = 0;
    for (const m of this.modules) if (m) dark++;
    const total = size * size;
    const k = Math.floor((Math.abs(dark * 20 - total * 10) + total - 1) / total) - 1;
    score += k * 10;
    return score;
  }
}

/** Encode `text` as UTF-8. Throws when it does not fit version 40 (2,331 bytes). */
export function encodeQr(text: string): QrMatrix {
  const data = Array.from(new TextEncoder().encode(text));

  // The smallest version the data fits.
  let version = 1;
  let capacityBits = 0;
  for (;; version++) {
    if (version > 40) throw new RangeError(`too long for a QR code: ${data.length} bytes`);
    capacityBits = dataCodewords(version) * 8;
    if (4 + countBits(version) + 8 * data.length <= capacityBits) break;
  }

  // The bit stream: mode, count, the bytes, terminator, pad.
  const bits: number[] = [];
  const add = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  add(0x4, 4);
  add(data.length, countBits(version));
  for (const b of data) add(b & 0xff, 8);
  add(0, Math.min(4, Math.max(0, capacityBits - bits.length)));
  add(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) add(pad, 8);

  const bytes = new Array<number>(bits.length / 8).fill(0);
  for (let i = 0; i < bits.length; i++) bytes[i >>> 3] |= bits[i] << (7 - (i & 7));

  const codewords = withEcc(version, bytes);
  const builder = new Builder(version);
  builder.drawFunctionPatterns();
  builder.drawCodewords(codewords);

  // The mask with the lowest penalty, as the standard asks.
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    builder.applyMask(m);
    builder.drawFormatBits(m);
    const score = builder.penalty();
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
    builder.applyMask(m); // XOR again: undone
  }
  builder.applyMask(best);
  builder.drawFormatBits(best);

  const { size, modules } = builder;
  return { version, size, mask: best, dark: (x, y) => modules[y * size + x] };
}

/**
 * One SVG path for the dark modules, in module units, offset by `quiet`
 * modules of quiet zone. A single path rather than a rect per module keeps
 * the DOM small and lets `shape-rendering="crispEdges"` do its job.
 */
export function qrPath(matrix: QrMatrix, quiet = 4): string {
  let d = '';
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.dark(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return d;
}
