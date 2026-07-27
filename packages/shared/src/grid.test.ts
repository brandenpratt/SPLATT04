import { describe, expect, it } from 'vitest';
import {
  PAINTABLE_CELL_COUNT,
  PAINTABLE_MASK,
  applyDelta,
  cellIndex,
  cellsToPercent,
  computeCoverage,
  createGrid,
  decodeGrid,
  encodeDelta,
  encodeGrid,
  stampCircle,
  worldToCol,
  worldToRow,
} from './grid.js';
import { CELL_WIDTH, GRID_COLS, GRID_ROWS, OBSTACLES } from './arena.js';
import { PaintOwner } from './types.js';

describe('paint grid stamping', () => {
  it('paints a roughly circular area of the expected size', () => {
    const grid = createGrid();
    const radius = 2;
    const result = stampCircle(grid, 0, -24, radius, PaintOwner.Cyan);

    // Ragged edges mean the count is approximate, but it must track pi*r^2 / cellArea.
    const expected = (Math.PI * radius * radius) / (CELL_WIDTH * (54 / GRID_ROWS));
    expect(result.changed).toBeGreaterThan(expected * 0.75);
    expect(result.changed).toBeLessThan(expected * 1.25);
  });

  it('paints the centre cell and leaves distant cells alone', () => {
    const grid = createGrid();
    stampCircle(grid, -30, 8, 1.5, PaintOwner.Magenta);
    expect(grid[cellIndex(worldToCol(-30), worldToRow(8))]).toBe(PaintOwner.Magenta);
    expect(grid[cellIndex(worldToCol(20), worldToRow(-20))]).toBe(PaintOwner.Neutral);
  });

  it('produces irregular edges rather than a perfect disc', () => {
    const grid = createGrid();
    stampCircle(grid, 0, -24, 3, PaintOwner.Cyan);
    // Sample the ring at exactly r: a perfect disc would paint all of it.
    let painted = 0;
    let total = 0;
    for (let a = 0; a < 64; a++) {
      const angle = (a / 64) * Math.PI * 2;
      const col = worldToCol(0 + Math.cos(angle) * 3);
      const row = worldToRow(-24 + Math.sin(angle) * 3);
      total++;
      if (grid[cellIndex(col, row)] === PaintOwner.Cyan) painted++;
    }
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(total);
  });

  it('never paints cells sitting under cover', () => {
    const boat = OBSTACLES.find((o) => o.id === 'c_speedboat')!;
    const grid = createGrid();
    stampCircle(grid, boat.x, boat.z, 4, PaintOwner.Cyan);
    const idx = cellIndex(worldToCol(boat.x), worldToRow(boat.z));
    expect(PAINTABLE_MASK[idx]).toBe(0);
    expect(grid[idx]).toBe(PaintOwner.Neutral);
  });

  it('is deterministic across repeated stamps', () => {
    const a = createGrid();
    const b = createGrid();
    stampCircle(a, 4.5, -13.25, 1.7, PaintOwner.Magenta);
    stampCircle(b, 4.5, -13.25, 1.7, PaintOwner.Magenta);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('repainting enemy cells', () => {
  it('transfers ownership and reports what was stolen', () => {
    const grid = createGrid();
    const first = stampCircle(grid, 0, -24, 2, PaintOwner.Cyan);
    expect(first.stolen).toBe(0);

    const second = stampCircle(grid, 0, -24, 2, PaintOwner.Magenta);
    expect(second.changed).toBe(first.changed);
    expect(second.stolen).toBe(first.changed);

    const coverage = computeCoverage(grid);
    expect(coverage.cyan).toBe(0);
    expect(coverage.magenta).toBeGreaterThan(0);
  });

  it('does nothing when restamping the same owner', () => {
    const grid = createGrid();
    stampCircle(grid, 10, 20, 2, PaintOwner.Cyan);
    const again = stampCircle(grid, 10, 20, 2, PaintOwner.Cyan);
    expect(again.changed).toBe(0);
    expect(again.gained).toBe(0);
  });

  it('refuses to stamp neutral', () => {
    const grid = createGrid();
    const result = stampCircle(grid, 0, 0, 3, PaintOwner.Neutral);
    expect(result.changed).toBe(0);
  });
});

describe('coverage percentages', () => {
  it('starts fully neutral', () => {
    const coverage = computeCoverage(createGrid());
    expect(coverage.cyan).toBe(0);
    expect(coverage.magenta).toBe(0);
    expect(coverage.neutral).toBeCloseTo(100, 5);
  });

  it('always sums to 100', () => {
    const grid = createGrid();
    stampCircle(grid, -20, 0, 5, PaintOwner.Cyan);
    stampCircle(grid, 20, 0, 4, PaintOwner.Magenta);
    const coverage = computeCoverage(grid);
    expect(coverage.cyan + coverage.magenta + coverage.neutral).toBeCloseTo(100, 5);
    expect(coverage.cyan).toBeGreaterThan(coverage.magenta);
  });

  it('reaches 100% for one team when the whole floor is claimed', () => {
    const grid = createGrid();
    for (let i = 0; i < grid.length; i++) if (PAINTABLE_MASK[i]) grid[i] = PaintOwner.Magenta;
    const coverage = computeCoverage(grid);
    expect(coverage.magenta).toBeCloseTo(100, 5);
    expect(coverage.neutral).toBeCloseTo(0, 5);
  });

  it('excludes covered cells from the denominator', () => {
    expect(PAINTABLE_CELL_COUNT).toBeLessThan(GRID_COLS * GRID_ROWS);
    expect(cellsToPercent(PAINTABLE_CELL_COUNT)).toBeCloseTo(100, 5);
  });
});

describe('wire encoding', () => {
  it('round-trips a full grid', () => {
    const grid = createGrid();
    stampCircle(grid, -12, -6, 4, PaintOwner.Cyan);
    stampCircle(grid, 14, 12, 3, PaintOwner.Magenta);
    const restored = decodeGrid(encodeGrid(grid));
    expect(Array.from(restored)).toEqual(Array.from(grid));
  });

  it('applies deltas to bring a stale grid up to date', () => {
    const server = createGrid();
    const client = createGrid();
    const dirty = new Set<number>();
    stampCircle(server, 3, 3, 2.5, PaintOwner.Cyan, dirty);

    applyDelta(client, encodeDelta(dirty, server, 10_000));
    expect(Array.from(client)).toEqual(Array.from(server));
  });

  it('respects the per-snapshot delta budget', () => {
    const server = createGrid();
    const dirty = new Set<number>();
    stampCircle(server, 0, -24, 6, PaintOwner.Cyan, dirty);
    const delta = encodeDelta(dirty, server, 20);
    expect(delta.length).toBe(40);
  });
});
