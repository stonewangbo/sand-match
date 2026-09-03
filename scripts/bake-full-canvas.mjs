/**
 * 将 01-cat 空格填满为青(7)，底部加固灰(8)基座，并重建库存容量。
 * Usage: node scripts/bake-full-canvas.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEVEL_PATH = join(__dirname, '../src/level/levels/01-cat.json');

const FILL_COLOR = 7; // 青：罐内填充沙
const BASE_COLOR = 8; // 灰：底台
const BASE_ROWS = 32;
const SLOT_COUNT = 24; // 6×4

function countColors(cells) {
  const counts = new Map();
  for (const c of cells) {
    if (c === 0) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return counts;
}

/**
 * 按色量权重分配 24 个瓶槽；保证每色至少 1 瓶（若有沙）。
 */
function allocateSlots(counts, slots) {
  const colors = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (colors.length === 0) return [];
  if (colors.length > slots) {
    throw new Error(`颜色种类 ${colors.length} 超过瓶槽 ${slots}`);
  }

  const total = colors.reduce((s, [, n]) => s + n, 0);
  const alloc = new Map(colors.map(([c]) => [c, 1]));
  let remaining = slots - colors.length;

  // 按剩余色量比例继续分配
  while (remaining > 0) {
    let best = colors[0][0];
    let bestScore = -1;
    for (const [c, n] of colors) {
      const share = n / total;
      const ideal = share * slots;
      const score = ideal - (alloc.get(c) || 0);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    alloc.set(best, (alloc.get(best) || 0) + 1);
    remaining -= 1;
  }

  return colors.map(([c, n]) => ({ color: c, total: n, bottles: alloc.get(c) }));
}

function splitCapacity(total, bottleCount) {
  const base = Math.floor(total / bottleCount);
  let rem = total - base * bottleCount;
  const caps = [];
  for (let i = 0; i < bottleCount; i++) {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    caps.push(base + extra);
  }
  return caps;
}

function buildBottles(counts) {
  const plan = allocateSlots(counts, SLOT_COUNT);
  const bottles = [];
  for (const { color, total, bottles: n } of plan) {
    for (const capacity of splitCapacity(total, n)) {
      bottles.push({ color, capacity });
    }
  }
  if (bottles.length !== SLOT_COUNT) {
    throw new Error(`瓶数 ${bottles.length} !== ${SLOT_COUNT}`);
  }
  return bottles;
}

function main() {
  const level = JSON.parse(readFileSync(LEVEL_PATH, 'utf8'));
  const { width: w, height: h, cells } = level.sand;
  if (cells.length !== w * h) {
    throw new Error(`cells 长度 ${cells.length} !== ${w * h}`);
  }

  const next = cells.slice();

  // 1) 空格 → 青
  for (let i = 0; i < next.length; i++) {
    if (next[i] === 0) next[i] = FILL_COLOR;
  }

  // 2) 底部 BASE_ROWS：填充青改回灰，保证满宽灰基座
  const y0 = h - BASE_ROWS;
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (next[i] === FILL_COLOR) next[i] = BASE_COLOR;
    }
  }

  // 校验无空
  if (next.some((c) => c === 0)) {
    throw new Error('烘焙后仍存在空格');
  }

  const counts = countColors(next);
  const bottles = buildBottles(counts);
  const invSum = bottles.reduce((s, b) => s + b.capacity, 0);
  const sandSum = [...counts.values()].reduce((a, b) => a + b, 0);
  if (invSum !== sandSum || sandSum !== w * h) {
    throw new Error(`容量不匹配 inv=${invSum} sand=${sandSum} total=${w * h}`);
  }

  level.sand.cells = next;
  level.inventory.bottles = bottles;
  // 保持 rows/cols/visibleRows
  level.inventory.rows = level.inventory.rows ?? 6;
  level.inventory.cols = level.inventory.cols ?? 4;

  mkdirSync(dirname(LEVEL_PATH), { recursive: true });
  writeFileSync(LEVEL_PATH, JSON.stringify(level));

  console.log('baked', LEVEL_PATH);
  console.log('fill', Object.fromEntries(counts));
  console.log(
    'bottles',
    bottles.map((b) => `${b.color}:${b.capacity}`).join(' '),
  );
  console.log('sum', sandSum, '/', w * h);
}

main();
