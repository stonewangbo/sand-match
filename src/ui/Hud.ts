import { COLOR_PALETTE, CONVEYOR_LIMIT } from '../config/constants';
import type { GameState } from '../core/GameState';

export class Hud {
  constructor(
    private readonly el: HTMLElement,
    private readonly state: GameState,
  ) {
    state.bus.on('hud:update', (p) => this.render(p.remaining, p.conveyorCount));
    this.render(state.world.countNonEmpty(), state.conveyor.count);
  }

  private render(remaining: number, conveyorCount: number): void {
    this.el.textContent = `沙粒 ${remaining} · 传送带 ${conveyorCount}/${this.state.conveyor.limit ?? CONVEYOR_LIMIT} · GPU`;
  }
}

export function showWinOverlay(overlay: HTMLElement, onRestart: () => void): void {
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="overlay-card">
      <h2>通关！</h2>
      <p>玻璃瓶里的沙子已全部装完。</p>
      <button type="button" id="btn-restart">再来一局</button>
    </div>
  `;
  overlay.querySelector('#btn-restart')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    onRestart();
  });
}

export function bottleStyle(color: number): string {
  return COLOR_PALETTE[color] ?? '#888';
}
