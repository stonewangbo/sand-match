import { ABSORB_HALF_WIDTH, ABSORB_PER_TICK } from '../config/constants';
import { isFull, remainingSpace } from '../bottle/Bottle';
import type { Conveyor } from '../bottle/Conveyor';
import type { SandWorld } from '../sand/SandWorld';

/**
 * 处于吸取窗口且未满的瓶子，每 tick 从列带底部表面吸取同色沙粒。
 * 重力塌陷后沙堆沉底，瓶口只能吸到各列最下方暴露的沙粒。
 */
export function absorbSand(world: SandWorld, conveyor: Conveyor): number {
  let absorbed = 0;

  for (const bottle of conveyor.list()) {
    if (!conveyor.isInAbsorbWindow(bottle)) continue;
    if (isFull(bottle)) continue;

    const centerX = conveyor.worldX(bottle, world.width);
    let budget = Math.min(ABSORB_PER_TICK, remainingSpace(bottle));

    while (budget > 0) {
      const cell = world.findAbsorbableInColumnBand(
        bottle.color,
        centerX,
        ABSORB_HALF_WIDTH,
      );
      if (!cell) break;
      world.set(cell.x, cell.y, 0);
      bottle.filled += 1;
      absorbed += 1;
      budget -= 1;
    }
  }

  return absorbed;
}
