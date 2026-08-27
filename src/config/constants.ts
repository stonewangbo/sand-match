/** 传送带最大瓶子数 */
export const CONVEYOR_LIMIT = 6;

/** 同色合并所需瓶子数 */
export const MERGE_COUNT = 3;

/** 每帧沙子物理子步进次数（GPU CA）；略高以便吸走后更快沉底填补 */
export const PHYSICS_SUBSTEPS = 4;

/** 强制使用 WebGL2 网格 CA，无 CPU 回退 */
export const SAND_BACKEND = 'webgl2' as const;

/** 每个激活瓶每帧最多吸取的沙粒数 */
export const ABSORB_PER_TICK = 8;

/** 吸取窗口：相对玻璃瓶底部的列宽（以沙格为单位的半宽） */
export const ABSORB_HALF_WIDTH = 4;

/** 传送带移动速度（槽位比例 / 秒），绕一圈回起点 */
export const CONVEYOR_SPEED = 0.18;

/** 沙粒像素尺寸（渲染） */
export const CELL_SIZE = 4;

/** 颜色调色板：index 0 = 空 */
export const COLOR_PALETTE: readonly string[] = [
  'transparent',
  '#e74c3c', // 红
  '#3498db', // 蓝
  '#f1c40f', // 黄
  '#2ecc71', // 绿
  '#9b59b6', // 紫
  '#e67e22', // 橙
  '#1abc9c', // 青
  '#95a5a6', // 灰
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
