import { ABSORB_HALF_WIDTH, ABSORB_PER_TICK } from '../config/constants';
import { isFull, remainingSpace } from '../bottle/Bottle';
import type { Conveyor } from '../bottle/Conveyor';
import type { SandWorld } from '../sand/SandWorld';
import type { ColorId } from '../types';

/** 每瓶每帧最多派发的飞入粒子数（与 ABSORB_PER_TICK 对齐） */
const FX_GRAINS_PER_BOTTLE = ABSORB_PER_TICK;

export interface AbsorbGrain {
  bottleId: string;
  color: ColorId;
  /** 被吸走的沙格列 */
  x: number;
  /** 被吸走的沙格行（吸取瞬间坐标，供 FX 出发点） */
  y: number;
}

/**
 * 未满瓶子随传送带移动，在其当前水平位置的窄列带内
 * 吸取底部表面同色沙粒（不穿透下层异色）；
 * 每吸一粒立即密实该列，体内不留上升空洞。
 */
export function absorbSand(
  world: SandWorld,
  conveyor: Conveyor,
): { count: number; grains: AbsorbGrain[] } {
  let count = 0;
  const grains: AbsorbGrain[] = [];

  for (const bottle of conveyor.list()) {
    if (isFull(bottle)) continue;

    const centerX = conveyor.worldX(bottle, world.width);
    let budget = Math.min(ABSORB_PER_TICK, remainingSpace(bottle));
    let fxLeft = FX_GRAINS_PER_BOTTLE;

    while (budget > 0) {
      const cell = world.findAbsorbableInColumnBand(
        bottle.color,
        centerX,
        ABSORB_HALF_WIDTH,
      );
      if (!cell) break;
      // 先记下吸取坐标，再清格+密实（FX 必须从原沙粒位置出发）
      const absX = cell.x;
      const absY = cell.y;
      world.set(absX, absY, 0);
      world.densifyColumn(absX);
      bottle.filled += 1;
      count += 1;
      budget -= 1;
      if (fxLeft > 0) {
        grains.push({
          bottleId: bottle.id,
          color: bottle.color,
          x: absX,
          y: absY,
        });
        fxLeft -= 1;
      }
    }
  }

  return { count, grains };
}
