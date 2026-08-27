import './styles/main.css';
import { Game } from './core/Game';
import { GameState } from './core/GameState';
import { getDefaultLevel } from './level/LevelLoader';
import { ConveyorView } from './ui/ConveyorView';
import { Hud, showWinOverlay } from './ui/Hud';
import { InventoryView } from './ui/InventoryView';

function mount(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#sand-canvas');
  const inventoryEl = document.querySelector<HTMLElement>('#inventory');
  const conveyorEl = document.querySelector<HTMLElement>('#conveyor');
  const hudEl = document.querySelector<HTMLElement>('#hud');
  const overlay = document.querySelector<HTMLElement>('#overlay');

  if (!canvas || !inventoryEl || !conveyorEl || !hudEl || !overlay) {
    throw new Error('缺少必要 DOM 节点');
  }

  let game: Game | null = null;
  let conveyorView: ConveyorView | null = null;

  const showFatal = (message: string): void => {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="overlay-card">
        <h2>无法启动</h2>
        <p>${message}</p>
      </div>
    `;
  };

  const start = (): void => {
    try {
      game?.stop();
      conveyorView?.destroy();

      const state = new GameState(getDefaultLevel());
      game = new Game(state, canvas);
      new Hud(hudEl, state);
      new InventoryView(inventoryEl, state);
      conveyorView = new ConveyorView(conveyorEl, state);

      state.bus.on('game:won', () => {
        showWinOverlay(overlay, start);
      });

      game.start();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : '当前设备不支持 WebGL2，无法运行 GPU 沙粒模拟';
      showFatal(msg);
    }
  };

  start();
}

mount();
