/** 传送带最大瓶子数 */
export const CONVEYOR_LIMIT = 6;

/** 同色合并所需瓶子数 */
export const MERGE_COUNT = 3;

/** 休止角：相邻列顶面允许的最大高差（格）；1 ≈ 45° 台阶，干沙稳定 */
export const REPOSE_MAX_STEP = 1;

/**
 * 自由面雪崩速度（遍 / 秒）。
 * 每遍只处理过陡列，过陡则顶沙滑向邻列。
 */
export const AVALANCHE_STEPS_PER_SEC = 16;

/** 单帧最多雪崩遍数 */
export const MAX_AVALANCHE_STEPS_PER_FRAME = 2;

/** 每遍每个候选列不滑落的概率（干沙摩擦） */
export const AVALANCHE_FRICTION = 0.55;

/** 每遍最多移动的沙粒数，避免一轮摊平整幅沙面 */
export const AVALANCHE_MAX_MOVES = 10;

/** @deprecated 改用 AVALANCHE_STEPS_PER_SEC */
export const FALL_CELLS_PER_SEC = AVALANCHE_STEPS_PER_SEC;

/** @deprecated 改用 MAX_AVALANCHE_STEPS_PER_FRAME */
export const MAX_PHYSICS_STEPS_PER_FRAME = MAX_AVALANCHE_STEPS_PER_FRAME;

/** @deprecated */
export const PHYSICS_SUBSTEPS = 1;

/** @deprecated 已取消吸取加速 settle / 冒泡 */
export const SETTLE_TOTAL = 0;

/** @deprecated */
export const SETTLE_BURST = 0;

/** @deprecated */
export const SETTLE_PER_FRAME = 0;

/** @deprecated */
export const SETTLE_SUBSTEPS = SETTLE_TOTAL;

/** 强制使用 WebGL2 网格 CA，无 CPU 回退 */
export const SAND_BACKEND = 'webgl2' as const;

/** 每个激活瓶每帧最多吸取的沙粒数 */
export const ABSORB_PER_TICK = 4;

/** 吸取口半宽（沙格）：窄口，贴近瓶子经过的列 */
export const ABSORB_HALF_WIDTH = 3;

/** 传送带移动速度（槽位比例 / 秒），绕一圈回起点 */
export const CONVEYOR_SPEED = 0.36;

/** 库存深度列总数中，UI 只展示最前面几列 */
export const INVENTORY_VISIBLE_ROWS = 3;

/** 沙粒像素尺寸（渲染）；越小越细腻 */
export const CELL_SIZE = 2;

/** 颜色调色板：略降饱和、略暖，更接近染色沙 */
export const COLOR_PALETTE: readonly string[] = [
  'transparent',
  '#c75b52', // 红
  '#4a8fbf', // 蓝
  '#d4b84a', // 黄
  '#5fad72', // 绿
  '#9a7bb0', // 紫
  '#d4894a', // 橙
  '#4ea89a', // 青
  '#9a9a92', // 灰
];

export const COLOR_NAMES: readonly string[] = [
  '空',
  '红',
  '蓝',
  '黄',
  '绿',
  '紫',
  '橙',
  '青',
  '灰',
];
