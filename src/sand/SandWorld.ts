import {
  AVALANCHE_FRICTION,
  AVALANCHE_MAX_MOVES,
  REPOSE_MAX_STEP,
} from '../config/constants';
import type { ColorId } from '../types';

export class SandWorld {
  readonly width: number;
  readonly height: number;
  /** 行优先，0 = 空；GPU 仿真时作 CPU 镜像（吸取/判定） */
  readonly cells: Uint8Array;
  /** CPU 侧改写后需重新上传 GPU */
  private gpuDirty = true;
  private readonly scratch: Uint8Array;

  constructor(width: number, height: number, initial?: ArrayLike<number>) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
    this.scratch = new Uint8Array(height);
    if (initial) {
      const n = Math.min(initial.length, this.cells.length);
      for (let i = 0; i < n; i++) {
        this.cells[i] = initial[i] & 0xff;
      }
    }
  }

  get isGpuDirty(): boolean {
    return this.gpuDirty;
  }

  markGpuDirty(): void {
    this.gpuDirty = true;
  }

  clearGpuDirty(): void {
    this.gpuDirty = false;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  get(x: number, y: number): ColorId {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.cells[this.index(x, y)]!;
  }

  set(x: number, y: number, color: ColorId): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[this.index(x, y)] = color;
    this.gpuDirty = true;
  }

  isEmpty(x: number, y: number): boolean {
    return this.get(x, y) === 0;
  }

  countNonEmpty(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== 0) n++;
    }
    return n;
  }

  /**
   * 自由面 y：该列最靠瓶口（最小 y）的非空沙；空列返回 -1。
   */
  findTopSandY(x: number): number {
    if (x < 0 || x >= this.width) return -1;
    const { height, width, cells } = this;
    for (let y = 0; y < height; y++) {
      if (cells[y * width + x] !== 0) return y;
    }
    return -1;
  }

  /**
   * 将一列压实到瓶底：保持自上而下色序，空位只留在顶面以上。
   * @returns 顶面下沉格数
   */
  densifyColumn(x: number): number {
    if (x < 0 || x >= this.width) return 0;
    const { height, width, cells, scratch } = this;
    const oldTop = this.findTopSandY(x);

    let n = 0;
    for (let y = 0; y < height; y++) {
      const c = cells[y * width + x]!;
      if (c !== 0) scratch[n++] = c;
    }

    const base = height - n;
    let changed = false;
    for (let y = 0; y < height; y++) {
      const next = y < base ? 0 : scratch[y - base]!;
      const i = y * width + x;
      if (cells[i] !== next) {
        cells[i] = next;
        changed = true;
      }
    }
    if (!changed) return 0;

    this.gpuDirty = true;
    const newTop = n === 0 ? -1 : base;
    let sink = 0;
    if (oldTop >= 0 && newTop >= 0) sink = Math.max(0, newTop - oldTop);
    else if (oldTop >= 0 && newTop < 0) sink = 1;
    return sink;
  }

  densifyColumns(xs: Iterable<number>): number {
    let total = 0;
    const seen = new Set<number>();
    for (const x of xs) {
      if (seen.has(x)) continue;
      seen.add(x);
      total += this.densifyColumn(x);
    }
    return total;
  }

  /** 全图逐列密实（雪崩 slide 后消缝） */
  densifyAll(): number {
    let total = 0;
    for (let x = 0; x < this.width; x++) {
      total += this.densifyColumn(x);
    }
    return total;
  }

  /**
   * 自由面休止角雪崩一遍：仅高差超过 maxStep 的列可崩。
   * 按高差优先、摩擦随机、每遍移动上限，形成漏斗而非液面摊平。
   */
  surfaceAvalanchePass(maxStep = REPOSE_MAX_STEP): number {
    const { width, height, cells } = this;
    const tops = new Int32Array(width);
    for (let x = 0; x < width; x++) {
      tops[x] = this.findTopSandY(x);
    }

    const columnDrop = (x: number, nx: number): number => {
      const topY = tops[x]!;
      if (topY < 0) return 0;
      const nTop = tops[nx]!;
      if (nTop < 0) return height - topY;
      return nTop - topY;
    };

    const candidates: { x: number; nx: number; drop: number }[] = [];
    for (let x = 0; x < width; x++) {
      if (tops[x]! < 0) continue;
      let bestNx = -1;
      let bestDrop = 0;
      for (const dx of [-1, 1] as const) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const drop = columnDrop(x, nx);
        if (drop > maxStep && drop > bestDrop) {
          bestDrop = drop;
          bestNx = nx;
        }
      }
      if (bestNx >= 0) {
        candidates.push({ x, nx: bestNx, drop: bestDrop });
      }
    }

    candidates.sort((a, b) => b.drop - a.drop);

    let moved = 0;
    for (const c of candidates) {
      if (moved >= AVALANCHE_MAX_MOVES) break;
      if (Math.random() < AVALANCHE_FRICTION) continue;

      const x = c.x;
      const topY = tops[x]!;
      if (topY < 0) continue;

      // 按当前 tops 重选最陡邻列（先前移动可能已改变）
      let nx = -1;
      let drop = 0;
      const dirs: number[] = Math.random() < 0.5 ? [-1, 1] : [1, -1];
      for (const dx of dirs) {
        const nxi = x + dx;
        if (nxi < 0 || nxi >= width) continue;
        const d = columnDrop(x, nxi);
        if (d > maxStep && d > drop) {
          drop = d;
          nx = nxi;
        }
      }
      if (nx < 0) continue;

      const color = cells[topY * width + x]!;
      if (color === 0) continue;

      const nTop = tops[nx]!;
      cells[topY * width + x] = 0;
      if (nTop < 0) {
        cells[(height - 1) * width + nx] = color;
      } else {
        const destY = nTop - 1;
        if (destY < 0) {
          cells[topY * width + x] = color;
          continue;
        }
        cells[destY * width + nx] = color;
      }

      this.densifyColumn(x);
      this.densifyColumn(nx);
      tops[x] = this.findTopSandY(x);
      tops[nx] = this.findTopSandY(nx);
      this.gpuDirty = true;
      moved += 1;
    }
    return moved;
  }

  /** 连续多遍自由面雪崩 */
  surfaceAvalanche(passes: number, maxStep = REPOSE_MAX_STEP): number {
    let total = 0;
    for (let i = 0; i < passes; i++) {
      const n = this.surfaceAvalanchePass(maxStep);
      total += n;
      if (n === 0) break;
    }
    return total;
  }

  /**
   * 在指定列带内，按「从瓶口向上吸」物理：每列只看最底部一颗沙，
   * 仅当其为目标色时可吸取（不会穿透下层异色）。
   * 在可吸列中随机选一列，避免总啃同一列挖出竖沟。
   */
  findAbsorbableInColumnBand(
    color: ColorId,
    centerX: number,
    halfWidth: number,
  ): { x: number; y: number } | null {
    const x0 = Math.max(0, Math.floor(centerX - halfWidth));
    const x1 = Math.min(this.width - 1, Math.ceil(centerX + halfWidth));
    const candidates: { x: number; y: number }[] = [];

    for (let x = x0; x <= x1; x++) {
      for (let y = this.height - 1; y >= 0; y--) {
        const c = this.get(x, y);
        if (c === 0) continue;
        if (c === color) {
          candidates.push({ x, y });
        }
        break;
      }
    }

    if (candidates.length === 0) return null;
    const i = Math.floor(Math.random() * candidates.length);
    return candidates[i]!;
  }
}
