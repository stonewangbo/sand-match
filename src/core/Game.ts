import { PHYSICS_SUBSTEPS } from '../config/constants';
import { GpuSandEngine } from '../sand/GpuSandEngine';
import type { GameState } from './GameState';

export class Game {
  private engine: GpuSandEngine;
  private running = false;
  private lastTs = 0;
  private raf = 0;

  constructor(
    private readonly state: GameState,
    canvas: HTMLCanvasElement,
  ) {
    this.engine = new GpuSandEngine(canvas, state.world);
  }

  get backend(): string {
    return this.engine.backend;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.update(dt);
      this.engine.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.engine.destroy();
  }

  private update(dt: number): void {
    const { world } = this.state;
    if (world.isGpuDirty) {
      this.engine.uploadFromWorld();
    }
    this.engine.stepSubsteps(PHYSICS_SUBSTEPS);
    this.engine.readbackToWorld();
    this.state.tick(dt);
    if (world.isGpuDirty) {
      this.engine.uploadFromWorld();
    }
  }
}
