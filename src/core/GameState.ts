import { CONVEYOR_LIMIT } from '../config/constants';
import { Conveyor } from '../bottle/Conveyor';
import { Inventory } from '../bottle/Inventory';
import { tryMergeConveyor } from '../bottle/MergeSystem';
import { EventBus } from './EventBus';
import { SandWorld } from '../sand/SandWorld';
import { absorbSand } from '../systems/AbsorbSystem';
import { checkWin, sandRemaining } from '../systems/WinCheck';
import type { GameEventMap, LevelData } from '../types';

export class GameState {
  readonly bus = new EventBus<GameEventMap>();
  readonly world: SandWorld;
  readonly inventory: Inventory;
  readonly conveyor: Conveyor;
  won = false;
  readonly levelName: string;

  constructor(level: LevelData) {
    this.levelName = level.name;
    this.world = new SandWorld(level.sand.width, level.sand.height, level.sand.cells);
    this.inventory = new Inventory(level.inventory);
    this.conveyor = new Conveyor(level.conveyorLimit ?? CONVEYOR_LIMIT);
  }

  /** 点击库存第一行某一列 */
  selectFrontBottle(col: number): boolean {
    if (this.won) return false;
    if (this.conveyor.full) return false;
    const bottle = this.inventory.takeFromFrontRow(col);
    if (!bottle) return false;
    if (!this.conveyor.tryAdd(bottle)) return false;
    this.bus.emit('inventory:changed', undefined);
    this.bus.emit('conveyor:changed', undefined);
    this.emitHud();
    this.runMergeLoop();
    return true;
  }

  tick(dt: number): void {
    if (this.won) return;
    this.conveyor.update(dt);
    absorbSand(this.world, this.conveyor);
    this.removeFullBottles();
    this.runMergeLoop();
    this.emitHud();

    if (checkWin(this.world, this.conveyor)) {
      this.won = true;
      this.bus.emit('game:won', undefined);
    }
  }

  /** 装满的瓶子离开传送带，腾出槽位 */
  private removeFullBottles(): void {
    const fullIds = new Set(
      this.conveyor.list().filter((b) => b.filled >= b.capacity).map((b) => b.id),
    );
    if (fullIds.size === 0) return;
    this.conveyor.removeByIds(fullIds);
    this.bus.emit('conveyor:changed', undefined);
  }

  private runMergeLoop(): void {
    // 可能连续合并
    for (let i = 0; i < 4; i++) {
      const result = tryMergeConveyor(this.conveyor);
      if (!result.merged) break;
      this.bus.emit('bottle:merged', {
        color: result.color!,
        capacity: result.capacity!,
      });
      this.bus.emit('conveyor:changed', undefined);
    }
  }

  private emitHud(): void {
    this.bus.emit('hud:update', {
      remaining: sandRemaining(this.world),
      conveyorCount: this.conveyor.count,
    });
  }
}
