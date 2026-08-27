import { createBottle } from './Bottle';
import type { Bottle, BottleDef, LevelInventoryData } from '../types';

export class Inventory {
  readonly rows: number;
  readonly cols: number;
  /** 行优先，null = 空位 */
  private slots: (Bottle | null)[];

  constructor(data: LevelInventoryData) {
    this.rows = data.rows;
    this.cols = data.cols;
    const size = this.rows * this.cols;
    this.slots = Array.from({ length: size }, (_, i) => {
      const def = data.bottles[i];
      return def ? createBottle(def) : null;
    });
  }

  getSlot(row: number, col: number): Bottle | null {
    if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return null;
    return this.slots[row * this.cols + col] ?? null;
  }

  /** 仅第一行可取 */
  takeFromFrontRow(col: number): Bottle | null {
    if (col < 0 || col >= this.cols) return null;
    const idx = col; // row 0
    const bottle = this.slots[idx];
    if (!bottle) return null;
    this.slots[idx] = null;
    this.collapseColumn(col);
    return bottle;
  }

  /** 取出后该列上方瓶子下沉补位 */
  private collapseColumn(col: number): void {
    const stack: Bottle[] = [];
    for (let r = 0; r < this.rows; r++) {
      const b = this.slots[r * this.cols + col];
      if (b) stack.push(b);
      this.slots[r * this.cols + col] = null;
    }
    // 第一行在 index 0：瓶子沉到顶部（row 0）
    for (let i = 0; i < stack.length; i++) {
      this.slots[i * this.cols + col] = stack[i]!;
    }
  }

  /** 供 UI 渲染的快照 */
  snapshot(): (Bottle | null)[] {
    return this.slots.slice();
  }

  frontRowBottles(): (Bottle | null)[] {
    return this.slots.slice(0, this.cols);
  }
}

export function bottleDef(color: number, capacity: number): BottleDef {
  return { color, capacity };
}
