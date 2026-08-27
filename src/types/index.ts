export type ColorId = number; // 0 = empty, 1..N = colors

export interface BottleDef {
  color: ColorId;
  capacity: number;
}

export interface Bottle {
  id: string;
  color: ColorId;
  /** 剩余可装容量 */
  capacity: number;
  /** 已装入数量 */
  filled: number;
}

/** 传送带上的瓶子，附带归一化位置 0..1 */
export interface ConveyorBottle extends Bottle {
  /** 0 = 左侧入口，1 = 右侧出口（循环） */
  position: number;
}

export interface LevelSandData {
  width: number;
  height: number;
  /** 行优先色值；长度 = width * height，0 为空 */
  cells: number[];
}

export interface LevelInventoryData {
  rows: number;
  cols: number;
  /** 长度 = rows * cols，空位用 null */
  bottles: (BottleDef | null)[];
}

export interface LevelData {
  id: string;
  name: string;
  sand: LevelSandData;
  inventory: LevelInventoryData;
  conveyorLimit?: number;
}

export type GameEventMap = {
  'inventory:changed': void;
  'conveyor:changed': void;
  'bottle:merged': { color: ColorId; capacity: number };
  'game:won': void;
  'hud:update': { remaining: number; conveyorCount: number };
};
