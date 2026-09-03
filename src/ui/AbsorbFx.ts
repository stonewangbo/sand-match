import { COLOR_PALETTE } from '../config/constants';
import type { GameState } from '../core/GameState';

type Phase = 'attract' | 'fall' | 'splash';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  bottleId: string;
  phase: Phase;
  /** 吸引阶段拖尾（最近若干点） */
  trail: { x: number; y: number }[];
  /** 延迟启动（ms） */
  delay: number;
  born: number;
}

const MAX_PARTICLES = 280;
const TRAIL_LEN = 5;
const ATTRACT_G = 2200;
const GRAVITY = 980;
const MOUTH_RADIUS = 10;

/**
 * Canvas2D 力场粒子：从被吸沙格位置飞入瓶口 → 落入沙面 → 溅起。
 * 网格密实塌陷由 densify + slide 表现。
 */
export class AbsorbFx {
  private readonly fxCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private raf = 0;
  private lastTs = 0;
  private unsub: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly sandCanvas: HTMLCanvasElement,
    private readonly state: GameState,
  ) {
    this.fxCanvas = document.createElement('canvas');
    this.fxCanvas.className = 'fx-canvas';
    this.fxCanvas.setAttribute('aria-hidden', 'true');
    this.layer.innerHTML = '';
    this.layer.appendChild(this.fxCanvas);

    const ctx = this.fxCanvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 FX Canvas2D 上下文');
    this.ctx = ctx;

    this.syncSize();
    this.resizeObs = new ResizeObserver(() => this.syncSize());
    this.resizeObs.observe(this.layer);

    this.unsub = state.bus.on('sand:absorbed', (p) => this.spawn(p.grains));
    this.lastTs = performance.now();
    this.tick(this.lastTs);
  }

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    cancelAnimationFrame(this.raf);
    this.particles = [];
    this.layer.innerHTML = '';
  }

  private syncSize(): void {
    const rect = this.layer.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.fxCanvas.width !== w || this.fxCanvas.height !== h) {
      this.fxCanvas.width = w;
      this.fxCanvas.height = h;
    }
    this.fxCanvas.style.width = `${rect.width}px`;
    this.fxCanvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private spawn(
    grains: { bottleId: string; color: number; x: number; y: number }[],
  ): void {
    const layerRect = this.layer.getBoundingClientRect();
    const canvasRect = this.sandCanvas.getBoundingClientRect();
    const { width: gw, height: gh } = this.state.world;
    const now = performance.now();
    const cellW = canvasRect.width / gw;
    const cellH = canvasRect.height / gh;

    for (const g of grains) {
      const bottleEl = document.querySelector<HTMLElement>(
        `.conveyor-bottle[data-id="${g.bottleId}"]`,
      );
      if (!bottleEl) continue;

      const color = COLOR_PALETTE[g.color] ?? '#ccc';
      const cellCx =
        canvasRect.left + ((g.x + 0.5) / gw) * canvasRect.width - layerRect.left;
      const cellCy =
        canvasRect.top + ((g.y + 0.5) / gh) * canvasRect.height - layerRect.top;

      this.pushParticle({
        x: cellCx + (Math.random() - 0.5) * cellW * 0.6,
        y: cellCy + (Math.random() - 0.5) * cellH * 0.6,
        vx: (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 40,
        life: 0.9 + Math.random() * 0.35,
        maxLife: 1.2,
        size: 2.2 + Math.random() * 1.8,
        color,
        bottleId: g.bottleId,
        phase: 'attract',
        trail: [],
        delay: Math.random() * 35,
        born: now,
      });
    }

    this.trimPool();
  }

  private pushParticle(p: Particle): void {
    this.particles.push(p);
  }

  private trimPool(): void {
    while (this.particles.length > MAX_PARTICLES) {
      const idx = this.particles.findIndex((p) => p.phase === 'splash');
      if (idx >= 0) this.particles.splice(idx, 1);
      else this.particles.shift();
    }
  }

  private bottleTargets(bottleId: string): {
    mouthX: number;
    mouthY: number;
    landX: number;
    landY: number;
  } | null {
    const bottleEl = document.querySelector<HTMLElement>(
      `.conveyor-bottle[data-id="${bottleId}"]`,
    );
    if (!bottleEl) return null;

    const layerRect = this.layer.getBoundingClientRect();
    const neck = bottleEl.querySelector<HTMLElement>('.gb-neck');
    const body = bottleEl.querySelector<HTMLElement>('.gb-body');
    const fill = bottleEl.querySelector<HTMLElement>('.gb-fill');
    if (!neck || !body) return null;

    const neckRect = neck.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const mouthX = neckRect.left + neckRect.width / 2 - layerRect.left;
    const mouthY = neckRect.top + neckRect.height * 0.35 - layerRect.top;

    let landY: number;
    if (fill && !fill.classList.contains('gb-fill--mark')) {
      const fillRect = fill.getBoundingClientRect();
      landY = fillRect.top + 2 - layerRect.top;
    } else {
      landY = bodyRect.top + bodyRect.height * 0.72 - layerRect.top;
    }
    const landX = bodyRect.left + bodyRect.width / 2 - layerRect.left;

    return { mouthX, mouthY, landX, landY };
  }

  private tick = (ts: number): void => {
    const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    this.syncSize();
    const rect = this.layer.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    const next: Particle[] = [];
    for (const p of this.particles) {
      if (ts < p.born + p.delay) {
        next.push(p);
        continue;
      }

      const alive = this.integrate(p, dt, ts);
      if (alive) {
        this.drawParticle(p);
        next.push(p);
      }
    }
    this.particles = next;
    this.raf = requestAnimationFrame(this.tick);
  };

  private integrate(p: Particle, dt: number, _ts: number): boolean {
    p.life -= dt;
    if (p.life <= 0) return false;

    const targets = this.bottleTargets(p.bottleId);
    if (!targets) return false;
    const { mouthX, mouthY, landX, landY } = targets;

    if (p.phase === 'attract') {
      const dx = mouthX - p.x;
      const dy = mouthY - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      // 近口吸力增强：分段 + 1/(r+ε)
      const pull =
        ATTRACT_G * (0.35 + 1.2 / (dist * 0.02 + 1)) *
        (dist < 40 ? 1.6 : 1);
      p.vx += (dx / dist) * pull * dt;
      p.vy += (dy / dist) * pull * dt;
      // 轻微切向噪声，轨迹不呈直线
      const nx = -dy / dist;
      const ny = dx / dist;
      const noise = (Math.random() - 0.5) * 180;
      p.vx += nx * noise * dt;
      p.vy += ny * noise * dt;
      // 阻尼，避免无限加速
      p.vx *= 1 - 1.8 * dt;
      p.vy *= 1 - 1.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > TRAIL_LEN) p.trail.shift();

      if (dist < MOUTH_RADIUS || (dy > 0 && dist < MOUTH_RADIUS * 1.8)) {
        p.phase = 'fall';
        p.vx *= 0.35;
        p.vy = Math.max(40, Math.abs(p.vy) * 0.4);
        p.life = Math.max(p.life, 0.35);
        p.trail.length = 0;
      }
      return true;
    }

    if (p.phase === 'fall') {
      p.vy += GRAVITY * 1.15 * dt;
      p.vx += (landX - p.x) * 4 * dt;
      p.vx *= 1 - 3 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const floorY = Math.max(landY, mouthY + 6);
      if (p.y >= floorY) {
        this.pulseFill(p.bottleId);
        this.spawnSplash(p, landX, floorY);
        return false;
      }
      return true;
    }

    // splash
    p.vy += GRAVITY * 1.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.size *= 1 - 1.5 * dt;
    return p.life > 0 && p.size > 0.4;
  }

  private spawnSplash(src: Particle, landX: number, landY: number): void {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.pushParticle({
        x: landX + (Math.random() - 0.5) * 8,
        y: landY,
        vx: (Math.random() - 0.5) * 90,
        vy: -40 - Math.random() * 70,
        life: 0.18 + Math.random() * 0.14,
        maxLife: 0.32,
        size: src.size * (0.45 + Math.random() * 0.35),
        color: src.color,
        bottleId: src.bottleId,
        phase: 'splash',
        trail: [],
        delay: 0,
        born: performance.now(),
      });
    }
    this.trimPool();
  }

  private pulseFill(bottleId: string): void {
    const bottleEl = document.querySelector<HTMLElement>(
      `.conveyor-bottle[data-id="${bottleId}"]`,
    );
    const fill = bottleEl?.querySelector<HTMLElement>('.gb-fill');
    if (!fill) return;
    fill.classList.add('gb-fill--pulse');
    window.setTimeout(() => fill.classList.remove('gb-fill--pulse'), 180);
  }

  private drawParticle(p: Particle): void {
    const ctx = this.ctx;
    const alpha = Math.max(0, Math.min(1, p.life / Math.max(0.15, p.maxLife * 0.5)));

    if (p.phase === 'attract' && p.trail.length > 1) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.size * 0.55);
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha * 0.35;
      ctx.beginPath();
      ctx.moveTo(p.trail[0]!.x, p.trail[0]!.y);
      for (let i = 1; i < p.trail.length; i++) {
        ctx.lineTo(p.trail[i]!.x, p.trail[i]!.y);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.size * 0.55, p.size * 0.45, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
