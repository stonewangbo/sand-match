import { bottleStyle } from './Hud';
import type { GameState } from '../core/GameState';
import type { Bottle } from '../types';

export class InventoryView {
  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
  ) {
    state.bus.on('inventory:changed', () => this.render());
    state.bus.on('conveyor:changed', () => this.render());
    this.render();
  }

  render(): void {
    const { inventory, conveyor } = this.state;
    const slots = inventory.snapshot();
    this.root.style.gridTemplateColumns = `repeat(${inventory.cols}, 56px)`;
    this.root.innerHTML = '';

    const hint = document.createElement('div');
    hint.className = 'inv-row-hint';
    hint.textContent = conveyor.full
      ? '传送带已满，等待合并或吸取腾出空位'
      : '点击第一行瓶子放入传送带';
    this.root.appendChild(hint);

    for (let r = 0; r < inventory.rows; r++) {
      for (let c = 0; c < inventory.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'inv-cell';
        const bottle = slots[r * inventory.cols + c];
        if (!bottle) {
          cell.classList.add('empty');
        } else {
          cell.appendChild(this.makeButton(bottle, r === 0, c));
        }
        this.root.appendChild(cell);
      }
    }
  }

  private makeButton(bottle: Bottle, selectable: boolean, col: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inv-bottle';
    btn.style.background = bottleStyle(bottle.color);
    btn.disabled = !selectable || this.state.conveyor.full || this.state.won;
    btn.title = selectable ? '放入传送带' : '仅第一行可选';
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = String(bottle.capacity);
    btn.appendChild(cap);
    if (selectable) {
      btn.addEventListener('click', () => {
        this.state.selectFrontBottle(col);
      });
    }
    return btn;
  }
}
