// engine.js — pure MergeBlitz game engine. No DOM, no Telegram SDK, no network.
// This module is the single source of truth for game rules and must stay
// deterministic given the same seed, so Daily Challenge boards match across
// every device/browser exactly.

export const GRID_SIZE = 4;
export const INITIAL_METER_MS = 25000; // starting Blitz Meter fuel
export const COMBO_WINDOW_MS = 700;    // merges within this window of each other chain the combo
export const BOMB_FUSE_MOVES = 4;      // moves before an unmerged bomb detonates
export const BOMB_SPAWN_CHANCE = 0.06; // chance a new tile spawns as a bomb (once score > 0)

// ---------- Deterministic PRNG (mulberry32) ----------
// Chosen deliberately over Math.random / built-in RNGs because we need the
// exact same sequence on every platform for the Daily Challenge to be fair.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple stable string hash (FNV-1a) -> 32-bit seed, same output on every JS engine.
export function seedFromDateString(dateStr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function todayUTCString() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

let idCounter = 1;
function nextId() {
  return 't' + idCounter++;
}

// ---------- Grid helpers ----------
export function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

export function emptyCells(grid) {
  const cells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}

export function spawnTile(grid, rng, allowBomb) {
  const cells = emptyCells(grid);
  if (cells.length === 0) return grid;
  const [r, c] = cells[Math.floor(rng() * cells.length)];
  const value = rng() < 0.9 ? 2 : 4;
  const isBomb = allowBomb && rng() < BOMB_SPAWN_CHANCE;
  grid[r][c] = {
    id: nextId(),
    value,
    bomb: isBomb ? { counter: BOMB_FUSE_MOVES } : null,
  };
  return grid;
}

// Slide + merge one row toward index 0. Callers rotate the grid so every
// direction reuses this single function.
function slideRow(row) {
  const tiles = row.filter(Boolean);
  const result = [];
  let scoreGained = 0;
  let mergesInMove = 0;

  let i = 0;
  while (i < tiles.length) {
    const cur = tiles[i];
    const next = tiles[i + 1];
    if (next && !cur.bomb && !next.bomb && cur.value === next.value) {
      const mergedValue = cur.value * 2;
      result.push({ id: nextId(), value: mergedValue, bomb: null });
      scoreGained += mergedValue;
      mergesInMove++;
      i += 2;
    } else {
      result.push(cur);
      i += 1;
    }
  }
  while (result.length < GRID_SIZE) result.push(null);
  return { row: result, scoreGained, mergesInMove };
}

function rotateGrid(grid, times) {
  let g = grid;
  const n = GRID_SIZE;
  for (let t = 0; t < ((times % 4) + 4) % 4; t++) {
    const rotated = createEmptyGrid();
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        rotated[c][n - 1 - r] = g[r][c];
      }
    }
    g = rotated;
  }
  return g;
}

const DIR_ROTATIONS = { left: 0, up: 3, right: 2, down: 1 };

function applyMove(grid, direction) {
  const rotations = DIR_ROTATIONS[direction];
  let rotated = rotateGrid(grid, rotations);

  let totalScore = 0;
  let totalMerges = 0;
  let moved = false;
  const newRows = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    const beforeIds = rotated[r].map((c) => (c ? c.id : null)).join(',');
    const beforeVals = rotated[r].map((c) => (c ? c.value : null)).join(',');
    const { row, scoreGained, mergesInMove } = slideRow(rotated[r]);
    const afterVals = row.map((c) => (c ? c.value : null)).join(',');
    if (beforeVals !== afterVals || beforeIds.split(',').length !== row.filter(Boolean).length) {
      // value layout changed shape -> definitely moved; also check simple positional shift below
    }
    newRows.push(row);
    totalScore += scoreGained;
    totalMerges += mergesInMove;
  }

  // detect movement by comparing (rotated-back) resulting grid to the original
  let result = rotateGrid(newRows, (4 - rotations) % 4);

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const a = grid[r][c];
      const b = result[r][c];
      const av = a ? a.value : null;
      const bv = b ? b.value : null;
      if (av !== bv) moved = true;
    }
  }
  if (totalMerges > 0) moved = true;

  // Bomb countdown + detonation, only on a move that actually changed the board
  let bombDetonations = 0;
  if (moved) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = result[r][c];
        if (cell && cell.bomb) {
          cell.bomb.counter -= 1;
        }
      }
    }
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = result[r][c];
        if (cell && cell.bomb && cell.bomb.counter <= 0) {
          bombDetonations++;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) {
                result[rr][cc] = null;
              }
            }
          }
        }
      }
    }
  }

  return { grid: result, moved, scoreGained: totalScore, merges: totalMerges, bombDetonations };
}

export function hasLegalMove(grid) {
  if (emptyCells(grid).length > 0) return true;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = grid[r][c];
      if (!cell) continue;
      const right = c + 1 < GRID_SIZE ? grid[r][c + 1] : null;
      const down = r + 1 < GRID_SIZE ? grid[r + 1][c] : null;
      if (right && !cell.bomb && !right.bomb && right.value === cell.value) return true;
      if (down && !cell.bomb && !down.bomb && down.value === cell.value) return true;
    }
  }
  return false;
}

// ---------- Public game state API ----------
export function createGame(seed) {
  const rng = mulberry32(seed);
  let grid = createEmptyGrid();
  grid = spawnTile(grid, rng, false);
  grid = spawnTile(grid, rng, false);
  return {
    grid,
    rng,
    score: 0,
    meterMs: INITIAL_METER_MS,
    maxMeterMs: INITIAL_METER_MS,
    combo: 0,
    lastMergeAt: -Infinity, // sentinel so the very first merge never falsely chains a combo
    startedAt: Date.now(),
    over: false,
  };
}

/** direction: 'left' | 'right' | 'up' | 'down' */
export function step(state, direction, nowMs) {
  if (state.over) return state;
  const { grid, moved, scoreGained, merges, bombDetonations } = applyMove(state.grid, direction);
  if (!moved) return state;

  let combo = state.combo;
  if (merges > 0) {
    combo = nowMs - state.lastMergeAt < COMBO_WINDOW_MS ? combo + merges : merges;
  } else {
    combo = 0;
  }
  const multiplier = 1 + combo * 0.15;
  const roundScore = Math.round(scoreGained * multiplier) + bombDetonations * 50;
  const meterRefill = scoreGained * 15 + bombDetonations * 3000;
  const meterMs = Math.min(state.maxMeterMs, state.meterMs + meterRefill);

  const newGrid = spawnTile(grid, state.rng, state.score + roundScore > 100);

  const nextState = {
    ...state,
    grid: newGrid,
    score: state.score + roundScore,
    meterMs,
    combo,
    lastMergeAt: merges > 0 ? nowMs : state.lastMergeAt,
  };

  if (!hasLegalMove(nextState.grid)) nextState.over = true;
  return nextState;
}

export function tickMeter(state, deltaMs) {
  if (state.over) return state;
  const meterMs = state.meterMs - deltaMs;
  if (meterMs <= 0) return { ...state, meterMs: 0, over: true };
  return { ...state, meterMs };
}
