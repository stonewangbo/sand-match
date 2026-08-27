import type { LevelData } from '../types';
import sampleLevel from './levels/01-cat.json';

export async function loadLevel(id?: string): Promise<LevelData> {
  if (!id || id === sampleLevel.id) {
    return sampleLevel as LevelData;
  }
  const res = await fetch(`./levels/${id}.json`);
  if (!res.ok) throw new Error(`关卡加载失败: ${id}`);
  return (await res.json()) as LevelData;
}

export function getDefaultLevel(): LevelData {
  return sampleLevel as LevelData;
}
