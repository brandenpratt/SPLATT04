import {
  ARENA_HALF_DEPTH,
  ARENA_HALF_WIDTH,
  CELL_DEPTH,
  CELL_WIDTH,
  GRID_COLS,
  GRID_ROWS,
  OBSTACLES,
} from './arena.js';
import { Coverage, PaintOwner } from './types.js';

export const GRID_LENGTH = GRID_COLS * GRID_ROWS;

export function cellIndex(col: number, row: number): number {
  return row * GRID_COLS + col;
}

export function colOf(index: number): number {
  return index % GRID_COLS;
}

export function rowOf(index: number): number {
  return Math.floor(index / GRID_COLS);
}

export function worldToCol(x: number): number {
  return Math.floor((x + ARENA_HALF_WIDTH) / CELL_WIDTH);
}

export function worldToRow(z: number): number {
  return Math.floor((z + ARENA_HALF_DEPTH) / CELL_DEPTH);
}

export function colToWorld(col: number): number {
  return -ARENA_HALF_WIDTH + (col + 0.5) * CELL_WIDTH;
}

export function rowToWorld(row: number): number {
  return -ARENA_HALF_DEPTH + (row + 0.5) * CELL_DEPTH;
}

/**
 * Cells sitting under cover are not part of the paintable floor. Shots that strike cover
 * leave a cosmetic splat on the client but must never move the coverage score.
 */
function buildPaintableMask(): Uint8Array {
  const mask = new Uint8Array(GRID_LENGTH).fill(1);
  for (const o of OBSTACLES) {
    if (o.kind === 'circle') {
      const minCol = Math.max(0, worldToCol(o.x - o.r));
      const maxCol = Math.min(GRID_COLS - 1, worldToCol(o.x + o.r));
      const minRow = Math.max(0, worldToRow(o.z - o.r));
      const maxRow = Math.min(GRID_ROWS - 1, worldToRow(o.z + o.r));
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const dx = colToWorld(col) - o.x;
          const dz = rowToWorld(row) - o.z;
          if (dx * dx + dz * dz <= o.r * o.r) mask[cellIndex(col, row)] = 0;
        }
      }
    } else {
      const minCol = Math.max(0, worldToCol(o.x - o.hx));
      const maxCol = Math.min(GRID_COLS - 1, worldToCol(o.x + o.hx));
      const minRow = Math.max(0, worldToRow(o.z - o.hz));
      const maxRow = Math.min(GRID_ROWS - 1, worldToRow(o.z + o.hz));
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          mask[cellIndex(col, row)] = 0;
        }
      }
    }
  }
  return mask;
}

export const PAINTABLE_MASK: Uint8Array = buildPaintableMask();
export const PAINTABLE_CELL_COUNT: number = PAINTABLE_MASK.reduce((a, b) => a + b, 0);

export function createGrid(): Uint8Array {
  return new Uint8Array(GRID_LENGTH);
}

/**
 * Deterministic per-cell jitter so splat edges are ragged instead of geometric.
 * Both client (practice mode) and server produce byte-identical results.
 */
export function cellNoise(col: number, row: number): number {
  let h = Math.imul(col, 374761393) + Math.imul(row, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

export interface StampResult {
  /** Cells whose ownership changed. */
  changed: number;
  /** Cells the stamping team gained (repaints of enemy or neutral floor). */
  gained: number;
  /** Cells taken directly off the opposing team. */
  stolen: number;
}

/**
 * Paint every paintable cell inside `radius` of (x, z) for `owner`.
 * Repainting an enemy cell transfers ownership. Indices that changed are pushed onto `dirty`.
 */
export function stampCircle(
  grid: Uint8Array,
  x: number,
  z: number,
  radius: number,
  owner: PaintOwner,
  dirty?: Set<number>,
): StampResult {
  const result: StampResult = { changed: 0, gained: 0, stolen: 0 };
  if (owner === PaintOwner.Neutral) return result;

  const reach = radius * 1.2;
  const minCol = Math.max(0, worldToCol(x - reach));
  const maxCol = Math.min(GRID_COLS - 1, worldToCol(x + reach));
  const minRow = Math.max(0, worldToRow(z - reach));
  const maxRow = Math.min(GRID_ROWS - 1, worldToRow(z + reach));

  for (let row = minRow; row <= maxRow; row++) {
    const cz = rowToWorld(row);
    for (let col = minCol; col <= maxCol; col++) {
      const idx = cellIndex(col, row);
      if (PAINTABLE_MASK[idx] === 0) continue;
      const cx = colToWorld(col);
      const dx = cx - x;
      const dz = cz - z;
      // +/-14% ragged edge, deterministic per cell.
      const jitter = 1 + (cellNoise(col, row) - 0.5) * 0.28;
      const effective = radius * jitter;
      if (dx * dx + dz * dz > effective * effective) continue;

      const previous = grid[idx];
      if (previous === owner) continue;
      grid[idx] = owner;
      result.changed++;
      result.gained++;
      if (previous !== PaintOwner.Neutral) result.stolen++;
      dirty?.add(idx);
    }
  }
  return result;
}

export function computeCoverage(grid: Uint8Array): Coverage {
  let cyan = 0;
  let magenta = 0;
  for (let i = 0; i < GRID_LENGTH; i++) {
    if (PAINTABLE_MASK[i] === 0) continue;
    const v = grid[i];
    if (v === PaintOwner.Cyan) cyan++;
    else if (v === PaintOwner.Magenta) magenta++;
  }
  const total = PAINTABLE_CELL_COUNT || 1;
  const cyanPct = (cyan / total) * 100;
  const magentaPct = (magenta / total) * 100;
  return {
    cyan: cyanPct,
    magenta: magentaPct,
    neutral: Math.max(0, 100 - cyanPct - magentaPct),
  };
}

/** Percentage of the paintable floor represented by `cells`. */
export function cellsToPercent(cells: number): number {
  return (cells / (PAINTABLE_CELL_COUNT || 1)) * 100;
}

// --- Wire encoding ---------------------------------------------------------

const B64 =
  typeof globalThis.btoa === 'function'
    ? (bytes: Uint8Array) => {
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return globalThis.btoa(s);
      }
    : (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const UNB64 =
  typeof globalThis.atob === 'function'
    ? (text: string) => {
        const raw = globalThis.atob(text);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
      }
    : (text: string) => new Uint8Array(Buffer.from(text, 'base64'));

/** Full-grid snapshot, run-length encoded then base64'd. Sent once on join. */
export function encodeGrid(grid: Uint8Array): string {
  const runs: number[] = [];
  let i = 0;
  while (i < grid.length) {
    const value = grid[i];
    let run = 1;
    while (i + run < grid.length && grid[i + run] === value && run < 65535) run++;
    runs.push(value, run & 0xff, (run >> 8) & 0xff);
    i += run;
  }
  return B64(Uint8Array.from(runs));
}

export function decodeGrid(encoded: string): Uint8Array {
  const bytes = UNB64(encoded);
  const grid = createGrid();
  let out = 0;
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const value = bytes[i];
    const run = bytes[i + 1] | (bytes[i + 2] << 8);
    for (let k = 0; k < run && out < grid.length; k++) grid[out++] = value;
  }
  return grid;
}

/** Deltas travel as a flat [index, owner, index, owner, ...] array to keep JSON small. */
export function encodeDelta(dirty: Iterable<number>, grid: Uint8Array, limit: number): number[] {
  const out: number[] = [];
  for (const idx of dirty) {
    out.push(idx, grid[idx]);
    if (out.length >= limit * 2) break;
  }
  return out;
}

export function applyDelta(grid: Uint8Array, delta: number[]): void {
  for (let i = 0; i + 1 < delta.length; i += 2) {
    grid[delta[i]] = delta[i + 1];
  }
}
