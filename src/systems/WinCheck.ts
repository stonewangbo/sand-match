import type { SandWorld } from '../sand/SandWorld';
import type { Conveyor } from '../bottle/Conveyor';
import { remainingSpace } from '../bottle/Bottle';

/** 玻璃内无沙，且传送带瓶已无需再吸（或已空世界）即通关 */
export function checkWin(world: SandWorld, _conveyor: Conveyor): boolean {
  return world.countNonEmpty() === 0;
}

/** HUD：剩余沙粒 */
export function sandRemaining(world: SandWorld): number {
  return world.countNonEmpty();
}

export function conveyorHasSpace(conveyor: Conveyor): boolean {
  return !conveyor.full;
}

export function totalBottleSpace(conveyor: Conveyor): number {
  return conveyor.list().reduce((s, b) => s + remainingSpace(b), 0);
}
