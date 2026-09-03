import {
  AVALANCHE_STEPS_PER_SEC,
  MAX_AVALANCHE_STEPS_PER_FRAME,
  REPOSE_MAX_STEP,
} from '../config/constants';
import { GpuSandEngine } from '../sand/GpuSandEngine';
import type { GameState } from './GameState';

export class Game {
  private engine: GpuSandEngine;
  private running = false;
  private lastTs = 0;
  private raf = 0;
  /** 雪崩步进累积 */
  private avalancheAcc = 0;

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

  /**
   * 帧序：absorb+密实 → 自由面休止角雪崩 → upload → 渲染
   */
  private update(dt: number): void {
    const { world } = this.state;

    this.state.tick(dt);

    this.avalancheAcc += dt * AVALANCHE_STEPS_PER_SEC;
    const steps = Math.min(
      MAX_AVALANCHE_STEPS_PER_FRAME,
      Math.floor(this.avalancheAcc),
    );
    this.avalancheAcc -= steps;

    if (steps > 0) {
      world.surfaceAvalanche(steps, REPOSE_MAX_STEP);
    }

    if (world.isGpuDirty) {
      this.engine.uploadFromWorld();
    }
  }
}
