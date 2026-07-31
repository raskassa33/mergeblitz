// render.js — canvas 2D renderer. Deliberately simple/direct draw calls
// (no scene graph) to keep the bundle tiny and the frame time low.
import { GRID_SIZE } from './engine.js';

const TILE_COLORS = {
  2: '#3a3f58',
  4: '#454b6b',
  8: '#5b4b8a',
  16: '#6b4b9a',
  32: '#8a4bb0',
  64: '#a64bc0',
  128: '#c04bb8',
  256: '#d94b9e',
  512: '#f04b7e',
  1024: '#ff5c5c',
  2048: '#ffb84b',
  4096: '#ffd24b',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const size = Math.min(canvas.parentElement.clientWidth, 480);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(state) {
    const size = canvas.width / dpr;
    const pad = size * 0.03;
    const cell = (size - pad * (GRID_SIZE + 1)) / GRID_SIZE;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(0, 0, size, size, 16);
    ctx.fill();

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const x = pad + c * (cell + pad);
        const y = pad + r * (cell + pad);

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRect(x, y, cell, cell, 10);
        ctx.fill();

        const tile = state.grid[r][c];
        if (!tile) continue;

        ctx.fillStyle = tile.bomb ? '#ff3b3b' : TILE_COLORS[tile.value] || '#ffffff';
        roundRect(x, y, cell, cell, 10);
        ctx.fill();

        ctx.fillStyle = tile.value > 8 ? '#ffffff' : '#161a2e';
        ctx.font = `700 ${cell * 0.34}px 'Space Grotesk', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(tile.value), x + cell / 2, y + cell / 2 - (tile.bomb ? cell * 0.08 : 0));

        if (tile.bomb) {
          ctx.font = `700 ${cell * 0.18}px system-ui, sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(`\u{1F4A3} ${tile.bomb.counter}`, x + cell / 2, y + cell * 0.82);
        }
      }
    }
  }

  return { draw, resize };
}
