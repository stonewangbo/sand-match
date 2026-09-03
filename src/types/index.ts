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
  /** 深度列数（从前到后） */
  rows: number;
  /** 每行瓶子数 */
  cols: number;
  /** UI 只显示最前几列；默认取常量 */
  visibleRows?: number;
  /** 长度必须 = rows * cols，全部为实瓶；加载时会随机打乱 */
  bottles: BottleDef[];
}

export interface LevelData {
  id: string;
  name: string;
  sand: LevelSandData;
  inventory: LevelInventoryData;
  conveyorLimit?: number;
}

/** 屏幕矩形，用于放入传送带的飞入动画 */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type GameEventMap = {
  'inventory:changed': void;
  'conveyor:changed': void;
  /** 库存瓶放入传送带（含合并后新瓶），带动画起点 */
  'bottle:placed': { bottleId: string; from: ScreenRect };
  'bottle:merged': { color: ColorId; capacity: number };
  'game:won': void;
  'hud:update': { remaining: number; conveyorCount: number };
  'sand:absorbed': {
    grains: { bottleId: string; color: ColorId; x: number; y: number }[];
  };
};
