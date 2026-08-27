import { MERGE_COUNT } from '../config/constants';
import { mergeBottles } from './Bottle';
import type { Conveyor } from './Conveyor';
import type { ColorId, ConveyorBottle } from '../types';

export interface MergeResult {
  merged: boolean;
  color?: ColorId;
  capacity?: number;
}

/**
 * 传送带上任意三个同色瓶子合并为一个（容量相加），保留中间位置。
 */
export function tryMergeConveyor(conveyor: Conveyor): MergeResult {
  const items = [...conveyor.list()];
  if (items.length < MERGE_COUNT) return { merged: false };

  const byColor = new Map<ColorId, ConveyorBottle[]>();
  for (const b of items) {
    const list = byColor.get(b.color) ?? [];
    list.push(b);
    byColor.set(b.color, list);
  }

  for (const [color, group] of byColor) {
    if (group.length < MERGE_COUNT) continue;

    // 取位置最接近的三个
    group.sort((a, b) => a.position - b.position);
    const trio = group.slice(0, MERGE_COUNT);
    const avgPos =
      trio.reduce((s, b) => s + b.position, 0) / trio.length;

    const merged = mergeBottles(trio);
    const ids = new Set(trio.map((b) => b.id));
    const rest = items
      .filter((b) => !ids.has(b.id))
      .map((b) => ({ ...b }));

    rest.push({
      ...merged,
      position: avgPos,
    });
    rest.sort((a, b) => a.position - b.position);
    conveyor.replaceAll(rest);

    return {
      merged: true,
      color,
      capacity: merged.capacity,
    };
  }

  return { merged: false };
}
