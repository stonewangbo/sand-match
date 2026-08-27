import { CONVEYOR_LIMIT, CONVEYOR_SPEED } from '../config/constants';
import type { Bottle, ConveyorBottle } from '../types';

export class Conveyor {
  readonly limit: number;
  private items: ConveyorBottle[] = [];

  constructor(limit: number = CONVEYOR_LIMIT) {
    this.limit = limit;
  }

  get count(): number {
    return this.items.length;
  }

  get full(): boolean {
    return this.items.length >= this.limit;
  }

  list(): readonly ConveyorBottle[] {
    return this.items;
  }

  tryAdd(bottle: Bottle): boolean {
    if (this.full) return false;
    // 新瓶从左侧进入，避开已有瓶子堆叠
    let start = 0;
    if (this.items.length > 0) {
      const minPos = Math.min(...this.items.map((b) => b.position));
      start = minPos - 0.1;
      if (start < 0) start += 1;
    }
    this.items.push({
      ...bottle,
      position: start,
    });
    return true;
  }

  /** dt 秒，位置 0..1 循环；吸区在约 0.35..0.65 */
  update(dt: number): void {
    for (const b of this.items) {
      b.position += CONVEYOR_SPEED * dt;
      if (b.position >= 1) b.position -= 1;
    }
  }

  /** 是否处于吸取窗口 */
  isInAbsorbWindow(bottle: ConveyorBottle): boolean {
    return bottle.position >= 0.35 && bottle.position <= 0.65;
  }

  /** 将归一化位置映射到沙世界列坐标 */
  worldX(bottle: ConveyorBottle, sandWidth: number): number {
    return bottle.position * (sandWidth - 1);
  }

  replaceAll(next: ConveyorBottle[]): void {
    this.items = next;
  }

  removeByIds(ids: Set<string>): void {
    this.items = this.items.filter((b) => !ids.has(b.id));
  }

  snapshot(): ConveyorBottle[] {
    return this.items.map((b) => ({ ...b }));
  }
}
