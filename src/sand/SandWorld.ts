import type { ColorId } from '../types';

export class SandWorld {
  readonly width: number;
  readonly height: number;
  /** 行优先，0 = 空；GPU 仿真时作 CPU 镜像（吸取/判定） */
  readonly cells: Uint8Array;
  /** CPU 侧改写后需重新上传 GPU */
  private gpuDirty = true;

  constructor(width: number, height: number, initial?: ArrayLike<number>) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
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
   * 在指定列带内，按「从瓶口向上吸」物理：每列只看最底部一颗沙，
   * 仅当其为目标色时可吸取（不会穿透下层异色）。
   * 优先更靠下、更靠近 centerX 的格子。
   */
  findAbsorbableInColumnBand(
    color: ColorId,
    centerX: number,
    halfWidth: number,
  ): { x: number; y: number } | null {
    const x0 = Math.max(0, Math.floor(centerX - halfWidth));
    const x1 = Math.min(this.width - 1, Math.ceil(centerX + halfWidth));
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (let x = x0; x <= x1; x++) {
      for (let y = this.height - 1; y >= 0; y--) {
        const c = this.get(x, y);
        if (c === 0) continue;
        if (c === color) {
          const dist = Math.abs(x - centerX);
          if (
            !best ||
            y > best.y ||
            (y === best.y && dist < bestDist)
          ) {
            best = { x, y };
            bestDist = dist;
          }
        }
        break; // 该列底部表面已确定
      }
    }
    return best;
  }
}
