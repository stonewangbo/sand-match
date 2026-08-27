import { bottleStyle } from './Hud';
import type { GameState } from '../core/GameState';

export class ConveyorView {
  private raf = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
  ) {
    state.bus.on('conveyor:changed', () => this.renderSlots());
    this.renderSlots();
    this.startPositionSync();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  private renderSlots(): void {
    const limit = this.state.conveyor.limit;
    const bottles = this.state.conveyor.snapshot();
    // 按位置排序展示
    bottles.sort((a, b) => a.position - b.position);

    this.root.innerHTML = '';
    this.root.style.display = 'grid';
    this.root.style.gridTemplateColumns = `repeat(${limit}, 1fr)`;

    // 用 limit 个槽展示当前瓶子（按序填入，空槽占位）
    for (let i = 0; i < limit; i++) {
      const slot = document.createElement('div');
      slot.className = 'conveyor-slot';
      slot.dataset.slot = String(i);
      const bottle = bottles[i];
      if (bottle) {
        const el = document.createElement('div');
        el.className = 'conveyor-bottle';
        el.dataset.id = bottle.id;
        el.style.background = bottleStyle(bottle.color);
        const remaining = Math.max(0, bottle.capacity - bottle.filled);
        const cap = document.createElement('span');
        cap.className = 'cap';
        cap.textContent = String(remaining);
        el.appendChild(cap);
        slot.appendChild(el);
      }
      this.root.appendChild(slot);
    }
  }

  /** 高频刷新剩余容量数字（吸取时） */
  private startPositionSync(): void {
    const tick = () => {
      const bottles = this.state.conveyor.list();
      for (const el of this.root.querySelectorAll<HTMLElement>('.conveyor-bottle')) {
        const id = el.dataset.id;
        const b = bottles.find((x) => x.id === id);
        if (!b) continue;
        const cap = el.querySelector('.cap');
        if (cap) {
          cap.textContent = String(Math.max(0, b.capacity - b.filled));
        }
        // 轻微水平位移反馈传送带运动
        const offset = (b.position - 0.5) * 8;
        el.style.transform = `translateX(${offset}px)`;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
