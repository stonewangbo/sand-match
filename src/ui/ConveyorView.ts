import { CONVEYOR_LIMIT } from '../config/constants';
import { buildBottleElement, syncBottleVisual } from './BottleDom';
import type { GameState } from '../core/GameState';
import type { ScreenRect } from '../types';

/** 放入传送带飞入时长 */
const PLACE_MS = 270;
const EXIT_MS = 200;
const ENTER_MS = 220;
const WRAP_FADE_MS = 140;

export class ConveyorView {
  private raf = 0;
  private badge: HTMLElement | null = null;
  /** 待播放入动画的起点（render 与事件可能交错） */
  private placeFrom = new Map<string, ScreenRect>();
  /** 正在离场的 id，rAF 跳过位置同步 */
  private exiting = new Set<string>();
  /** 上一帧 position，用于检测绕回 */
  private lastPos = new Map<string, number>();

  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
    private readonly zone: HTMLElement,
  ) {
    this.root.classList.add('conveyor-track');
    this.ensureBadge();
    state.bus.on('conveyor:changed', () => this.reconcileBottles());
    state.bus.on('hud:update', () => this.syncBadge());
    state.bus.on('bottle:placed', (p) => {
      this.placeFrom.set(p.bottleId, p.from);
      this.applyPlaceAnim(p.bottleId);
    });
    this.reconcileBottles();
    this.startPositionSync();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.placeFrom.clear();
    this.exiting.clear();
    this.lastPos.clear();
  }

  private ensureBadge(): void {
    let badge = this.zone.querySelector<HTMLElement>('.conveyor-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'conveyor-badge';
      this.zone.prepend(badge);
    }
    this.badge = badge;
    this.syncBadge();
  }

  private syncBadge(): void {
    if (!this.badge) return;
    const n = this.state.conveyor.count;
    const lim = this.state.conveyor.limit ?? CONVEYOR_LIMIT;
    this.badge.textContent = `${n}/${lim}`;
  }

  /** 按 id 复用 DOM：保留 / 新增 / 离场，避免整树重建打断动画 */
  private reconcileBottles(): void {
    this.syncBadge();
    const bottles = this.state.conveyor.list();
    const live = new Map(bottles.map((b) => [b.id, b]));
    const existing = new Map<string, HTMLElement>();

    for (const el of this.root.querySelectorAll<HTMLElement>('.conveyor-bottle')) {
      const id = el.dataset.id;
      if (!id) continue;
      if (this.exiting.has(id)) continue;
      existing.set(id, el);
    }

    // 删除：exit 后再 remove
    for (const [id, el] of existing) {
      if (live.has(id)) continue;
      existing.delete(id);
      this.lastPos.delete(id);
      this.startExit(el, id);
    }

    // 新增 / 更新位置
    for (const bottle of bottles) {
      let el = existing.get(bottle.id);
      if (!el) {
        el = buildBottleElement(bottle, {
          interactive: false,
          showRemaining: true,
          className: 'conveyor-bottle',
        });
        this.applyPosition(el, bottle.position);
        this.root.appendChild(el);
        this.lastPos.set(bottle.id, bottle.position);

        if (this.placeFrom.has(bottle.id)) {
          this.applyPlaceAnim(bottle.id);
        } else {
          // bottle:placed 在 selectFrontBottle 之后同步发出；延迟一帧再决定 enter，避免飞入被 scale-in 抢先
          const id = bottle.id;
          requestAnimationFrame(() => {
            const node = this.root.querySelector<HTMLElement>(
              `.conveyor-bottle[data-id="${id}"]:not(.conveyor-bottle--exit)`,
            );
            if (!node || this.exiting.has(id)) return;
            if (this.placeFrom.has(id)) {
              this.applyPlaceAnim(id);
              return;
            }
            if (node.classList.contains('conveyor-bottle--place')) return;
            this.applyEnterAnim(node);
          });
        }
      } else {
        this.applyPosition(el, bottle.position);
        syncBottleVisual(el, bottle, true);
      }
    }

    // DOM 已就绪后补播尚未执行的放入动画
    for (const id of [...this.placeFrom.keys()]) {
      this.applyPlaceAnim(id);
    }
  }

  private startExit(el: HTMLElement, id: string): void {
    if (this.exiting.has(id)) return;
    this.exiting.add(id);
    el.classList.remove('conveyor-bottle--place', 'conveyor-bottle--enter', 'conveyor-bottle--wrap');
    el.classList.add('conveyor-bottle--exit');
    const done = (): void => {
      el.remove();
      this.exiting.delete(id);
    };
    el.addEventListener('animationend', done, { once: true });
    window.setTimeout(done, EXIT_MS + 40);
  }

  private applyEnterAnim(el: HTMLElement): void {
    el.classList.remove('conveyor-bottle--enter');
    void el.offsetWidth;
    el.classList.add('conveyor-bottle--enter');
    const clear = (): void => {
      el.classList.remove('conveyor-bottle--enter');
    };
    el.addEventListener('animationend', clear, { once: true });
    window.setTimeout(clear, ENTER_MS + 40);
  }

  private applyPosition(el: HTMLElement, position: number): void {
    el.style.left = `${position * 100}%`;
  }

  /** 从库存位置 FLIP 飞入传送带落点 */
  private applyPlaceAnim(bottleId: string): void {
    const from = this.placeFrom.get(bottleId);
    const el = this.root.querySelector<HTMLElement>(
      `.conveyor-bottle[data-id="${bottleId}"]:not(.conveyor-bottle--exit)`,
    );
    if (!from || !el) return;
    this.placeFrom.delete(bottleId);

    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);

    el.style.setProperty('--place-dx', `${dx}px`);
    el.style.setProperty('--place-dy', `${dy}px`);
    el.style.setProperty('--place-ms', `${PLACE_MS}ms`);
    el.classList.remove('conveyor-bottle--place', 'conveyor-bottle--enter');
    void el.offsetWidth;
    el.classList.add('conveyor-bottle--place');

    const clear = (): void => {
      el.classList.remove('conveyor-bottle--place');
      el.style.removeProperty('--place-dx');
      el.style.removeProperty('--place-dy');
      el.style.removeProperty('--place-ms');
    };
    el.addEventListener('animationend', clear, { once: true });
    window.setTimeout(clear, PLACE_MS + 40);
  }

  private applyWrapFade(el: HTMLElement): void {
    el.classList.remove('conveyor-bottle--wrap');
    void el.offsetWidth;
    el.classList.add('conveyor-bottle--wrap');
    const clear = (): void => {
      el.classList.remove('conveyor-bottle--wrap');
    };
    el.addEventListener('animationend', clear, { once: true });
    window.setTimeout(clear, WRAP_FADE_MS + 40);
  }

  /** 每帧同步水平位置、剩余容量与液面；检测绕回淡入 */
  private startPositionSync(): void {
    const tick = () => {
      const bottles = this.state.conveyor.list();
      const byId = new Map(bottles.map((b) => [b.id, b]));

      for (const el of this.root.querySelectorAll<HTMLElement>('.conveyor-bottle')) {
        const id = el.dataset.id;
        if (!id || this.exiting.has(id)) continue;
        if (el.classList.contains('conveyor-bottle--exit')) continue;
        const b = byId.get(id);
        if (!b) continue;

        const prev = this.lastPos.get(id);
        if (prev !== undefined && prev - b.position > 0.5) {
          this.applyWrapFade(el);
        }
        this.lastPos.set(id, b.position);
        this.applyPosition(el, b.position);
        syncBottleVisual(el, b, true);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
