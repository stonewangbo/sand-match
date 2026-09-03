import { CELL_SIZE, COLOR_PALETTE } from '../config/constants';
import type { SandWorld } from './SandWorld';

const SIM_VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * 对角滑落（棋盘格避免双写冲突）——沙漏休止角雪崩主路径
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

vec4 cellAt(vec2 uv) {
  if (!inBounds(uv)) return vec4(0.0);
  return texture(u_tex, uv);
}

float idAt(vec2 uv) {
  return cellAt(uv).r;
}

void main() {
  vec2 res = 1.0 / u_texel;
  float fx = floor(v_uv.x * res.x);
  float fy = floor((1.0 - v_uv.y) * res.y);
  float checker = mod(fx + fy + u_parity, 2.0);

  vec4 me4 = cellAt(v_uv);
  float me = me4.r;
  // 保留 G（列下沉量），slide 不改写密实动画标记
  float sinkG = me4.g;
  if (checker > 0.5) {
    outColor = vec4(me, sinkG, 0.0, 1.0);
    return;
  }

  vec2 srcUv = v_uv + vec2(-u_dir * u_texel.x, u_texel.y);
  vec2 belowSrcUv = srcUv - vec2(0.0, u_texel.y);
  float src = idAt(srcUv);
  float belowSrc = idAt(belowSrcUv);

  bool meEmpty = me <= 0.001;
  bool srcSolid = inBounds(srcUv) && src > 0.001;
  bool srcBlocked = !inBounds(belowSrcUv) || belowSrc > 0.001;

  if (meEmpty && srcSolid && srcBlocked) {
    float srcSink = cellAt(srcUv).g;
    outColor = vec4(src, srcSink, 0.0, 1.0);
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
    outColor = vec4(0.0, sinkG, 0.0, 1.0);
    return;
  }

  outColor = vec4(me, sinkG, 0.0, 1.0);
}`;

/**
 * 点彩渲染：按当前网格采样，不做整列下沉偏移
 *（整列 UV 偏移会把未吸取沙采样到空处，吸取结束又跳回，表现为消失/抖动/复现）
 */
const BLIT_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D u_tex;
uniform sampler2D u_palette;
uniform vec2 u_texel;
uniform vec3 u_bg;
in vec2 v_uv;
out vec4 outColor;

bool inBounds(vec2 uv) {
  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}

vec4 cellAt(vec2 uv) {
  if (!inBounds(uv)) return vec4(0.0);
  return texture(u_tex, uv);
}

float idAt(vec2 uv) {
  return cellAt(uv).r;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 shadeId(float id, vec2 sampleUv) {
  float idx = (id * 255.0 + 0.5) / 256.0;
  vec3 albedo = texture(u_palette, vec2(idx, 0.5)).rgb;

  vec2 res = 1.0 / u_texel;
  vec2 cell = floor(sampleUv * res);
  float h0 = hash21(cell + id * 17.0);
  float h1 = hash21(cell * 1.37 + id * 9.1);
  float h2 = hash21(cell.yx * 2.11 + 3.7);

  float grain = (h0 - 0.5) * 0.34;
  vec3 tint = vec3((h1 - 0.5) * 0.05, (h2 - 0.5) * 0.03, (h0 - 0.5) * -0.02);
  albedo = clamp(albedo * (1.0 + grain) + tint, 0.0, 1.0);

  float nU = idAt(sampleUv + vec2(0.0, u_texel.y));
  float nD = idAt(sampleUv - vec2(0.0, u_texel.y));
  float nL = idAt(sampleUv - vec2(u_texel.x, 0.0));
  float nR = idAt(sampleUv + vec2(u_texel.x, 0.0));
  float nUL = idAt(sampleUv + vec2(-u_texel.x, u_texel.y));
  float nDR = idAt(sampleUv + vec2(u_texel.x, -u_texel.y));

  float lit = 0.0;
  lit += (nU <= 0.001) ? 0.05 : -0.015;
  lit += (nUL <= 0.001) ? 0.03 : 0.0;
  lit += (nL <= 0.001) ? 0.02 : 0.0;
  lit -= (nD > 0.001) ? 0.05 : 0.0;
  lit -= (nDR > 0.001) ? 0.03 : 0.0;
  lit -= (nR > 0.001) ? 0.02 : 0.0;

  float ambient = 0.94 + sampleUv.y * 0.06;
  vec3 rgb = albedo * (ambient + lit);

  if (h2 > 0.988) {
    rgb += vec3(0.12, 0.12, 0.12) * (h2 - 0.988) * 8.0;
  }
  return clamp(rgb, 0.0, 1.0);
}

void main() {
  float id = idAt(v_uv);
  if (id <= 0.001) {
    outColor = vec4(u_bg, 1.0);
    return;
  }

  outColor = vec4(shadeId(id, v_uv), 1.0);
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
    this.slideProg = this.createProgram(SIM_VS, SLIDE_FS, [
      'u_tex',
      'u_texel',
      'u_dir',
      'u_parity',
    ]);
    this.blitProg = this.createProgram(SIM_VS, BLIT_FS, [
      'u_tex',
      'u_palette',
      'u_texel',
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

  /** 将 CPU 网格上传到 GPU；G = 列下沉格数（字节） */
  uploadFromWorld(): void {
    if (this.lost) return;
    const { width, height, cells } = this.world;
    const buf = this.uploadBuffer;
    for (let y = 0; y < height; y++) {
      const srcRow = y * width;
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

  /** GPU → CPU 同步（吸取 / 通关用）；仅同步色 ID */
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

  /**
   * 一轮休止角雪崩：多次对角滑（无竖直 fall，避免空洞上冒）。
   * 滑后由 CPU densifyAll 密实消缝。
   */
  stepAvalancheOnce(): void {
    if (this.lost) return;
    const preferLeft = Math.random() < 0.5;
    const dir0 = preferLeft ? -1 : 1;
    this.dispatchSlide(dir0, this.frameParity);
    this.swap();
    this.dispatchSlide(-dir0, this.frameParity);
    this.swap();
    this.dispatchSlide(dir0, this.frameParity);
    this.swap();
    this.dispatchSlide(-dir0, this.frameParity);
    this.swap();
    this.frameParity ^= 1;
  }

  stepAvalanche(n: number): void {
    for (let i = 0; i < n; i++) this.stepAvalancheOnce();
  }

  /** @deprecated 使用 stepAvalanche */
  stepSubsteps(n: number): void {
    this.stepAvalanche(n);
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
    gl.uniform2fv(p.uniforms['u_texel']!, this.texel);
    gl.uniform3f(p.uniforms['u_bg']!, 0xf0 / 255, 0xe6 / 255, 0xd4 / 255);
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
    gl.deleteProgram(this.slideProg.prog);
    gl.deleteProgram(this.blitProg.prog);
    gl.deleteVertexArray(this.vao);
  }
}
