import { buildBottleElement } from './BottleDom';
import type { GameState } from '../core/GameState';
import type { Bottle } from '../types';

const RISE_MS = 260;

export class InventoryView {
  private hint: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
  ) {
    state.bus.on('inventory:changed', () => this.render());
    state.bus.on('conveyor:changed', () => this.syncControls());
    state.bus.on('hud:update', () => this.syncControls());
    this.render();
  }

  render(): void {
    const first = this.captureRects();
    const { inventory } = this.state;
    const slots = inventory.snapshot();
    const showRows = inventory.visibleRows;
    this.root.style.gridTemplateColumns = `repeat(${inventory.cols}, 64px)`;
    this.root.innerHTML = '';

    this.hint = document.createElement('div');
    this.hint.className = 'inv-row-hint';
    this.root.appendChild(this.hint);
    this.updateHint();

    for (let r = 0; r < showRows; r++) {
      for (let c = 0; c < inventory.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'inv-cell';
        const bottle = slots[r * inventory.cols + c];
        if (bottle) {
          cell.appendChild(this.makeButton(bottle, r === 0, c));
        }
        this.root.appendChild(cell);
      }
    }

    this.playRiseFlip(first);
  }

  /** 传送带满/通关时只更新禁用态与提示，避免整表闪烁 */
  private syncControls(): void {
    this.updateHint();
    const blocked = this.state.conveyor.full || this.state.won;
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(
      '.inv-bottle:not(.inv-bottle--rear)',
    )) {
      btn.disabled = blocked;
      btn.title = blocked ? '暂不可选' : '放入传送带';
    }
  }

  private updateHint(): void {
    if (!this.hint) return;
    this.hint.textContent = this.state.conveyor.full
      ? '传送带已满，等待合并或吸取腾出空位'
      : '点击第一列玻璃瓶放入传送带';
  }

  private captureRects(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    for (const el of this.root.querySelectorAll<HTMLElement>('.inv-bottle[data-id]')) {
      const id = el.dataset.id;
      if (id) map.set(id, el.getBoundingClientRect());
    }
    return map;
  }

  /** 同 id 瓶子格子变化时 FLIP 上升，被点走的瓶不参与 */
  private playRiseFlip(first: Map<string, DOMRect>): void {
    if (first.size === 0) return;

    const pending: Array<{ el: HTMLElement; dx: number; dy: number }> = [];
    for (const el of this.root.querySelectorAll<HTMLElement>('.inv-bottle[data-id]')) {
      const id = el.dataset.id;
      if (!id) continue;
      const from = first.get(id);
      if (!from) continue;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      pending.push({ el, dx, dy });
    }

    if (pending.length === 0) return;

    for (const { el, dx, dy } of pending) {
      el.classList.add('inv-bottle--rising');
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const { el } of pending) {
          el.style.transition = `transform ${RISE_MS}ms cubic-bezier(0.22, 0.85, 0.28, 1)`;
          el.style.transform = '';
        }
      });
    });

    window.setTimeout(() => {
      for (const { el } of pending) {
        el.classList.remove('inv-bottle--rising');
        el.style.transition = '';
        el.style.transform = '';
      }
    }, RISE_MS + 40);
  }

  private makeButton(bottle: Bottle, selectable: boolean, col: number): HTMLElement {
    const btn = buildBottleElement(bottle, {
      interactive: true,
      showRemaining: false,
      className: 'inv-bottle',
    }) as HTMLButtonElement;

    const blocked = this.state.conveyor.full || this.state.won;
    if (selectable) {
      btn.disabled = blocked;
      btn.title = blocked ? '暂不可选' : '放入传送带';
      // 始终挂监听，syncControls 只改 disabled，避免满带解除后无法点击
      btn.addEventListener('click', () => {
        if (this.state.conveyor.full || this.state.won) return;
        const from = btn.getBoundingClientRect();
        const before = new Set(this.state.conveyor.list().map((b) => b.id));
        if (!this.state.selectFrontBottle(col)) return;
        for (const b of this.state.conveyor.list()) {
          if (before.has(b.id)) continue;
          this.state.bus.emit('bottle:placed', {
            bottleId: b.id,
            from: {
              left: from.left,
              top: from.top,
              width: from.width,
              height: from.height,
            },
          });
        }
      });
    } else {
      btn.disabled = false;
      btn.classList.add('inv-bottle--rear');
      btn.title = '仅第一列可选';
      btn.tabIndex = -1;
      btn.setAttribute('aria-disabled', 'true');
    }
    return btn;
  }
}
