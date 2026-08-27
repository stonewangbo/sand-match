import { CELL_SIZE, COLOR_PALETTE, PHYSICS_SUBSTEPS } from '../config/constants';
import type { SandWorld } from './SandWorld';

const SIM_VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** 竖直下落：空格承接上方沙粒；底部/侧壁越界视为固体墙 */
const FALL_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D u_tex;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 outColor;

bool inBounds(vec2 uv) {
  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}

float idAt(vec2 uv) {
  if (!inBounds(uv)) return 0.0;
  return texture(u_tex, uv).r;
}

void main() {
  // v_uv: x→右, y→上；格子 y 向下增大，故下方 = v_uv - texel.y
  vec2 aboveUv = v_uv + vec2(0.0, u_texel.y);
  vec2 belowUv = v_uv - vec2(0.0, u_texel.y);

  float me = idAt(v_uv);
  float above = idAt(aboveUv);
  float below = idAt(belowUv);

  bool meSolid = me > 0.001;
  bool meEmpty = !meSolid;
  // 越界下方当作墙，不能掉出世界
  bool belowEmpty = inBounds(belowUv) && below <= 0.001;
  bool aboveSolid = inBounds(aboveUv) && above > 0.001;

  if (meSolid && belowEmpty) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
  } else if (meEmpty && aboveSolid) {
    outColor = vec4(above, 0.0, 0.0, 1.0);
  } else {
    outColor = vec4(me, 0.0, 0.0, 1.0);
  }
}`;

/**
 * 对角滑落（棋盘格避免双写冲突）
 * u_dir: -1 左下 / +1 右下（相对格子 x）
 * u_parity: 0/1 棋盘
 */
const SLIDE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_dir;
uniform float u_parity;
in vec2 v_uv;
out vec4 outColor;

bool inBounds(vec2 uv) {
  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}

float idAt(vec2 uv) {
  if (!inBounds(uv)) return 0.0;
  return texture(u_tex, uv).r;
}

void main() {
  vec2 res = 1.0 / u_texel;
  float fx = floor(v_uv.x * res.x);
  float fy = floor((1.0 - v_uv.y) * res.y);
  float checker = mod(fx + fy + u_parity, 2.0);

  float me = idAt(v_uv);
  if (checker > 0.5) {
    outColor = vec4(me, 0.0, 0.0, 1.0);
    return;
  }

  vec2 srcUv = v_uv + vec2(-u_dir * u_texel.x, u_texel.y);
  vec2 belowSrcUv = srcUv - vec2(0.0, u_texel.y);
  float src = idAt(srcUv);
  float belowSrc = idAt(belowSrcUv);

  bool meEmpty = me <= 0.001;
  bool srcSolid = inBounds(srcUv) && src > 0.001;
  // 源正下越界=墙，视为受阻，可对角滑
  bool srcBlocked = !inBounds(belowSrcUv) || belowSrc > 0.001;

  if (meEmpty && srcSolid && srcBlocked) {
    outColor = vec4(src, 0.0, 0.0, 1.0);
    return;
  }

  vec2 belowUv = v_uv - vec2(0.0, u_texel.y);
  vec2 diagUv = v_uv + vec2(u_dir * u_texel.x, -u_texel.y);
  float below = idAt(belowUv);
  float diag = idAt(diagUv);
  bool meSolid = me > 0.001;
  bool belowFilled = !inBounds(belowUv) || below > 0.001;
  bool diagEmpty = inBounds(diagUv) && diag <= 0.001;

  if (meSolid && belowFilled && diagEmpty) {
    // 正下是墙或沙，且对角目标在界内为空 → 滑出
    // 但正下是墙时 belowFilled=true 且通常不想在底边滑出界——diagEmpty 已要求 inBounds
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  outColor = vec4(me, 0.0, 0.0, 1.0);
}`;

const BLIT_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D u_tex;
uniform sampler2D u_palette;
uniform vec3 u_bg;
in vec2 v_uv;
out vec4 outColor;

void main() {
  // 上传约定：cell y=0 → 纹理高 v；屏底 v_uv.y=0 → 低 v → 世界底部
  // 不翻转，使重力下落方向与画面下方一致
  float id = texture(u_tex, v_uv).r;
  if (id <= 0.001) {
    outColor = vec4(u_bg, 1.0);
    return;
  }
  // 色号 1..N → 调色板纹素中心
  float idx = (id * 255.0 + 0.5) / 256.0;
  vec3 rgb = texture(u_palette, vec2(idx, 0.5)).rgb;
  outColor = vec4(rgb, 1.0);
}`;

interface Program {
  prog: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export class GpuSandEngine {
  readonly gl: WebGL2RenderingContext;
  readonly backend = 'webgl2' as const;

  private readonly width: number;
  private readonly height: number;
  private readonly texel: Float32Array;
  private readonly readBuffer: Uint8Array;
  private readonly uploadBuffer: Uint8Array;

  private texA!: WebGLTexture;
  private texB!: WebGLTexture;
  private fboA!: WebGLFramebuffer;
  private fboB!: WebGLFramebuffer;
  private paletteTex!: WebGLTexture;
  private readFbo!: WebGLFramebuffer;

  private fallProg!: Program;
  private slideProg!: Program;
  private blitProg!: Program;
  private vao!: WebGLVertexArrayObject;
  private frontIsA = true;
  private frameParity = 0;
  private lost = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: SandWorld,
  ) {
    this.width = world.width;
    this.height = world.height;
    this.texel = new Float32Array([1 / this.width, 1 / this.height]);
    this.readBuffer = new Uint8Array(this.width * this.height * 4);
    this.uploadBuffer = new Uint8Array(this.width * this.height * 4);

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('需要 WebGL2（请升级浏览器或系统 WebView）');
    }
    this.gl = gl;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.initGpu();
      this.uploadFromWorld();
    });

    this.resizeCanvas();
    this.initGpu();
    this.uploadFromWorld();
  }

  private resizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.width * CELL_SIZE;
    const cssH = this.height * CELL_SIZE;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  private initGpu(): void {
    const gl = this.gl;
    this.fallProg = this.createProgram(SIM_VS, FALL_FS, [
      'u_tex',
      'u_texel',
    ]);
    this.slideProg = this.createProgram(SIM_VS, SLIDE_FS, [
      'u_tex',
      'u_texel',
      'u_dir',
      'u_parity',
    ]);
    this.blitProg = this.createProgram(SIM_VS, BLIT_FS, [
      'u_tex',
      'u_palette',
      'u_bg',
    ]);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    if (!vao || !buf) throw new Error('WebGL 资源创建失败');
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texA = this.createDataTexture();
    this.texB = this.createDataTexture();
    this.fboA = this.createFbo(this.texA);
    this.fboB = this.createFbo(this.texB);
    this.readFbo = this.createFbo(this.texA);
    this.paletteTex = this.createPaletteTexture();
  }

  private createProgram(
    vsSrc: string,
    fsSrc: string,
    uniformNames: string[],
  ): Program {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, vsSrc);
    const fs = this.compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    if (!prog) throw new Error('createProgram failed');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uniforms[name] = gl.getUniformLocation(prog, name);
    }
    return { prog, uniforms };
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'compile failed');
    }
    return sh;
  }

  private createDataTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    return tex;
  }

  private createFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('createFramebuffer failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FBO incomplete: ${status}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  private createPaletteTexture(): WebGLTexture {
    const gl = this.gl;
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < COLOR_PALETTE.length; i++) {
      const hex = COLOR_PALETTE[i]!;
      if (hex === 'transparent') continue;
      const h = hex.replace('#', '');
      data[i * 4] = parseInt(h.slice(0, 2), 16);
      data[i * 4 + 1] = parseInt(h.slice(2, 4), 16);
      data[i * 4 + 2] = parseInt(h.slice(4, 6), 16);
      data[i * 4 + 3] = 255;
    }
    const tex = gl.createTexture();
    if (!tex) throw new Error('palette texture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    return tex;
  }

  private frontTex(): WebGLTexture {
    return this.frontIsA ? this.texA : this.texB;
  }

  private backFbo(): WebGLFramebuffer {
    return this.frontIsA ? this.fboB : this.fboA;
  }

  private swap(): void {
    this.frontIsA = !this.frontIsA;
  }

  /** 将 CPU 网格上传到 GPU（cell y=0 → 纹理顶部 → 高 v） */
  uploadFromWorld(): void {
    if (this.lost) return;
    const { width, height, cells } = this.world;
    const buf = this.uploadBuffer;
    for (let y = 0; y < height; y++) {
      const srcRow = y * width;
      // GL 纹理行 0 在底部：写入 height-1-y
      const dstRow = (height - 1 - y) * width * 4;
      for (let x = 0; x < width; x++) {
        const id = cells[srcRow + x]!;
        const i = dstRow + x * 4;
        buf[i] = id;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 255;
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.frontTex());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buf,
    );
    this.world.clearGpuDirty();
  }

  /** GPU → CPU 同步（吸取 / 通关用） */
  readbackToWorld(): void {
    if (this.lost) return;
    const gl = this.gl;
    const { width, height, cells } = this.world;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.frontTex(),
      0,
    );
    gl.readPixels(
      0,
      0,
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.readBuffer,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const buf = this.readBuffer;
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width * 4;
      const dstRow = y * width;
      for (let x = 0; x < width; x++) {
        cells[dstRow + x] = buf[srcRow + x * 4]!;
      }
    }
  }

  /** 一次完整物理子步：竖直 + 左右对角 */
  stepOnce(): void {
    if (this.lost) return;
    this.dispatchFall();
    this.swap();
    const preferLeft = Math.random() < 0.5;
    const dir0 = preferLeft ? -1 : 1;
    this.dispatchSlide(dir0, this.frameParity);
    this.swap();
    this.dispatchSlide(-dir0, this.frameParity);
    this.swap();
    this.frameParity ^= 1;
  }

  stepSubsteps(n: number = PHYSICS_SUBSTEPS): void {
    for (let i = 0; i < n; i++) this.stepOnce();
  }

  private dispatchFall(): void {
    const gl = this.gl;
    const p = this.fallProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.backFbo());
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTex());
    gl.uniform1i(p.uniforms['u_tex']!, 0);
    gl.uniform2fv(p.uniforms['u_texel']!, this.texel);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private dispatchSlide(dir: number, parity: number): void {
    const gl = this.gl;
    const p = this.slideProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.backFbo());
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTex());
    gl.uniform1i(p.uniforms['u_tex']!, 0);
    gl.uniform2fv(p.uniforms['u_texel']!, this.texel);
    gl.uniform1f(p.uniforms['u_dir']!, dir);
    gl.uniform1f(p.uniforms['u_parity']!, parity);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(): void {
    if (this.lost) return;
    const gl = this.gl;
    const p = this.blitProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTex());
    gl.uniform1i(p.uniforms['u_tex']!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(p.uniforms['u_palette']!, 1);
    gl.uniform3f(p.uniforms['u_bg']!, 0x0d / 255, 0x15 / 255, 0x20 / 255);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private disposed = false;

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.texA);
    gl.deleteTexture(this.texB);
    gl.deleteTexture(this.paletteTex);
    gl.deleteFramebuffer(this.fboA);
    gl.deleteFramebuffer(this.fboB);
    gl.deleteFramebuffer(this.readFbo);
    gl.deleteProgram(this.fallProg.prog);
    gl.deleteProgram(this.slideProg.prog);
    gl.deleteProgram(this.blitProg.prog);
    gl.deleteVertexArray(this.vao);
  }
}
