import type { Bottle, BottleDef, ColorId } from '../types';

let bottleSeq = 0;

export function createBottle(def: BottleDef): Bottle {
  bottleSeq += 1;
  return {
    id: `b${bottleSeq}`,
    color: def.color,
    capacity: def.capacity,
    filled: 0,
  };
}

export function remainingSpace(bottle: Bottle): number {
  return Math.max(0, bottle.capacity - bottle.filled);
}

export function isFull(bottle: Bottle): boolean {
  return remainingSpace(bottle) <= 0;
}

export function mergeBottles(bottles: Bottle[]): Bottle {
  if (bottles.length === 0) throw new Error('empty merge');
  const color = bottles[0]!.color;
  const capacity = bottles.reduce((s, b) => s + b.capacity, 0);
  const filled = bottles.reduce((s, b) => s + b.filled, 0);
  bottleSeq += 1;
  return {
    id: `b${bottleSeq}`,
    color,
    capacity,
    filled,
  };
}

export function colorOf(bottle: Bottle): ColorId {
  return bottle.color;
}
