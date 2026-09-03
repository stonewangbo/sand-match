import { COLOR_PALETTE } from '../config/constants';
import type { Bottle } from '../types';

export function bottleColor(color: number): string {
  return COLOR_PALETTE[color] ?? '#888';
}

export interface BuildBottleOptions {
  /** 库存可点击按钮；传送带为展示用 div */
  interactive?: boolean;
  /** 显示剩余容量（传送带）或总容量（库存未装） */
  showRemaining?: boolean;
  className?: string;
}

/** 敞口玻璃罐：正面朝向、向前倾 45°，可见对向瓶口 */
export function buildBottleElement(
  bottle: Bottle,
  options: BuildBottleOptions = {},
): HTMLElement {
  const { interactive = false, showRemaining = false, className = '' } = options;
  const el = document.createElement(interactive ? 'button' : 'div');
  if (interactive) {
    (el as HTMLButtonElement).type = 'button';
  }
  el.className = ['glass-bottle', className].filter(Boolean).join(' ');
  el.dataset.id = bottle.id;
  el.dataset.color = String(bottle.color);

  const scene = document.createElement('div');
  scene.className = 'gb-scene';

  const mouth = document.createElement('div');
  mouth.className = 'gb-mouth';

  const rim = document.createElement('div');
  rim.className = 'gb-neck gb-rim';

  const hole = document.createElement('div');
  hole.className = 'gb-hole';

  const lip = document.createElement('div');
  lip.className = 'gb-lip';

  const body = document.createElement('div');
  body.className = 'gb-body';

  const fill = document.createElement('div');
  fill.className = 'gb-fill';
  fill.style.background = bottleColor(bottle.color);

  const glass = document.createElement('div');
  glass.className = 'gb-glass';

  const shine = document.createElement('div');
  shine.className = 'gb-shine';

  const cap = document.createElement('span');
  cap.className = 'cap num-outline';

  mouth.appendChild(rim);
  mouth.appendChild(hole);
  mouth.appendChild(lip);
  body.appendChild(fill);
  body.appendChild(glass);
  body.appendChild(shine);
  scene.appendChild(mouth);
  scene.appendChild(body);
  el.appendChild(scene);
  el.appendChild(cap);

  syncBottleVisual(el, bottle, showRemaining);
  return el;
}

export function syncBottleVisual(
  el: HTMLElement,
  bottle: Bottle,
  showRemaining = true,
): void {
  const fill = el.querySelector<HTMLElement>('.gb-fill');
  const hole = el.querySelector<HTMLElement>('.gb-hole');
  const cap = el.querySelector('.cap');
  const color = bottleColor(bottle.color);

  if (fill) {
    const pct =
      bottle.capacity > 0
        ? Math.min(100, (bottle.filled / bottle.capacity) * 100)
        : 0;
    fill.style.background = color;
    if (pct < 1) {
      fill.style.height = '48%';
      fill.style.opacity = '1';
      fill.classList.add('gb-fill--mark');
    } else {
      fill.style.height = `${pct}%`;
      fill.style.opacity = '1';
      fill.classList.remove('gb-fill--mark');
    }
  }

  // 从瓶口俯视也能看到沙面颜色
  if (hole) {
    hole.style.setProperty('--sand', color);
    const pct =
      bottle.capacity > 0
        ? Math.min(100, (bottle.filled / bottle.capacity) * 100)
        : 0;
    hole.classList.toggle('gb-hole--empty', pct < 1);
  }

  if (cap) {
    const n = showRemaining
      ? Math.max(0, bottle.capacity - bottle.filled)
      : bottle.capacity;
    cap.textContent = String(n);
  }
}
