import { INVENTORY_VISIBLE_ROWS } from '../config/constants';
import { createBottle } from './Bottle';
import type { Bottle, BottleDef, LevelInventoryData } from '../types';

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export class Inventory {
  readonly rows: number;
  readonly cols: number;
  /** UI 可见的最前深度列数 */
  readonly visibleRows: number;
  /** 行优先；消耗后列尾可为 null */
  private slots: (Bottle | null)[];

  constructor(data: LevelInventoryData) {
    this.rows = data.rows;
    this.cols = data.cols;
    this.visibleRows = Math.min(
      data.visibleRows ?? INVENTORY_VISIBLE_ROWS,
      this.rows,
    );
    const size = this.rows * this.cols;
    if (data.bottles.length !== size) {
      throw new Error(
        `库存瓶子数须等于 ${size}（${this.rows}×${this.cols}），实际 ${data.bottles.length}`,
      );
    }
    if (data.bottles.some((b) => b == null)) {
      throw new Error('库存不允许空位，bottles 须全部为实瓶');
    }
    const defs = shuffleInPlace([...data.bottles]) as BottleDef[];
    this.slots = defs.map((def) => createBottle(def));
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
    for (let i = 0; i < stack.length; i++) {
      this.slots[i * this.cols + col] = stack[i]!;
    }
  }

  /** 供 UI 渲染的快照（全部深度列） */
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
