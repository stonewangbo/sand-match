import type { GameState } from '../core/GameState';

export class Hud {
  constructor(
    private readonly el: HTMLElement,
    private readonly state: GameState,
  ) {
    state.bus.on('hud:update', (p) => this.render(p.remaining));
    this.render(state.world.countNonEmpty());
  }

  private render(remaining: number): void {
    this.el.innerHTML = `<span class="num-outline">${remaining}</span> 沙粒 · ${this.state.levelName}`;
  }
}

export function showWinOverlay(overlay: HTMLElement, onRestart: () => void): void {
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="overlay-card">
      <h2>通关！</h2>
      <p>罐子里的沙子已全部装完。</p>
      <button type="button" id="btn-restart">再来一局</button>
    </div>
  `;
  overlay.querySelector('#btn-restart')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    onRestart();
  });
}
