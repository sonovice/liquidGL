import { createProgram } from "./webgl";
import { fragmentShader, vertexShader } from "./shaders";
import { debounce, effectiveZ, isIgnored } from "./utils";
import type { BoundsRect } from "./types";
import LiquidGLLens from "./lens";
import { registerDynamicElement } from "./runtime-dynamic";

type GL = WebGLRenderingContext | WebGL2RenderingContext;

export class LiquidGLRenderer {
  canvas: HTMLCanvasElement;
  gl: GL;
  lenses: any[] = [];
  texture: WebGLTexture | null = null;
  textureWidth = 0;
  textureHeight = 0;
  scaleFactor = 1;
  startTime = Date.now();
  _scrollUpdateCounter = 0;
  _capturing = false;
  _revealAnimating?: boolean;
  _rafId?: number | null;
  useExternalTicker = false;

  snapshotTarget: Element;
  program: WebGLProgram;
  u: any;

  _dynamicNodes: Array<{ el: Element }> = [];
  _dynMeta: WeakMap<Element, any> = new WeakMap();
  _lastDynamicUpdate = 0;
  _dynamicStyleSheet: CSSStyleSheet;
  _videoNodes: HTMLVideoElement[] = [];
  _tmpCanvas: HTMLCanvasElement;
  _tmpCtx: CanvasRenderingContext2D;
  _compositeCtx?: CanvasRenderingContext2D;
  staticSnapshotCanvas?: HTMLCanvasElement;
  _pendingReveal: any[] = [];
  _snapshotResolution: number;
  _workerEnabled: boolean;
  _dynWorker?: Worker;
  _dynJobs?: Map<string, any>;

  constructor(snapshotSelector: string, snapshotResolution = 1.0) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;`;
    this.canvas.setAttribute("data-liquid-ignore", "");
    document.body.appendChild(this.canvas);

    const ctxAttribs: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    };
    const gl =
      (this.canvas.getContext("webgl2", ctxAttribs) as GL) ||
      (this.canvas.getContext("webgl", ctxAttribs) as GL) ||
      (this.canvas.getContext("experimental-webgl", ctxAttribs) as GL);
    if (!gl) throw new Error("liquidGL: WebGL unavailable");
    this.gl = gl;

    this._initGL();

    this.snapshotTarget = document.querySelector(snapshotSelector) || document.body;

    const onResize = debounce(() => {
      if (this._capturing) return;
      if ((window as any).visualViewport && (window as any).visualViewport.scale !== 1) return;
      this._dynamicNodes.forEach((node) => {
        const meta = this._dynMeta.get(node.el);
        if (meta) {
          meta.needsRecapture = true;
          meta.prevDrawRect = null;
          meta.lastCapture = null;
        }
      });
      this._resizeCanvas();
      this.lenses.forEach((l) => l.updateMetrics());
      this.captureSnapshot();
    }, 250);
    window.addEventListener("resize", onResize, { passive: true });

    this._dynamicNodes = [];
    this._dynMeta = new WeakMap();
    this._lastDynamicUpdate = 0;

    const styleEl = document.createElement("style");
    styleEl.id = "liquid-gl-dynamic-styles";
    document.head.appendChild(styleEl);
    this._dynamicStyleSheet = styleEl.sheet as CSSStyleSheet;

    this._resizeCanvas();
    this.captureSnapshot();

    this._pendingReveal = [];

    this._videoNodes = Array.from(this.snapshotTarget.querySelectorAll("video"));
    this._videoNodes = this._videoNodes.filter((v) => !isIgnored(v));
    this._tmpCanvas = document.createElement("canvas");
    this._tmpCtx = this._tmpCanvas.getContext("2d") as CanvasRenderingContext2D;

    this.canvas.style.opacity = "0";
    this._snapshotResolution = Math.max(0.1, Math.min(3.0, snapshotResolution));

    this.useExternalTicker = false;

    this._workerEnabled = typeof (window as any).OffscreenCanvas !== "undefined" &&
      typeof (window as any).Worker !== "undefined" &&
      typeof (window as any).ImageBitmap !== "undefined";

    if (this._workerEnabled) {
      const workerSrc = `self.onmessage = async (e) => { const { id, width, height, snap, dyn } = e.data; const off = new OffscreenCanvas(width, height); const ctx = off.getContext('2d'); ctx.drawImage(snap, 0, 0, width, height); ctx.drawImage(dyn, 0, 0, width, height); const bmp = await off.transferToImageBitmap(); self.postMessage({ id, bmp }, [bmp]); };`;
      const blob = new Blob([workerSrc], { type: "application/javascript" });
      this._dynWorker = new Worker(URL.createObjectURL(blob), { type: "module" });
      this._dynJobs = new Map();
      this._dynWorker.onmessage = (e: MessageEvent) => {
        const { id, bmp } = e.data as any;
        const meta = this._dynJobs!.get(id);
        if (!meta) return;
        this._dynJobs!.delete(id);
        const { x, y } = meta;
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
      };
    }
  }

  private _initGL() {
    const gl = this.gl;
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) throw new Error("liquidGL: Shader failed");
    this.program = program;

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.u = {
      tex: gl.getUniformLocation(this.program, "u_tex"),
      res: gl.getUniformLocation(this.program, "u_resolution"),
      textureResolution: gl.getUniformLocation(this.program, "u_textureResolution"),
      bounds: gl.getUniformLocation(this.program, "u_bounds"),
      refraction: gl.getUniformLocation(this.program, "u_refraction"),
      bevelDepth: gl.getUniformLocation(this.program, "u_bevelDepth"),
      bevelWidth: gl.getUniformLocation(this.program, "u_bevelWidth"),
      frost: gl.getUniformLocation(this.program, "u_frost"),
      radius: gl.getUniformLocation(this.program, "u_radius"),
      time: gl.getUniformLocation(this.program, "u_time"),
      specular: gl.getUniformLocation(this.program, "u_specular"),
      revealProgress: gl.getUniformLocation(this.program, "u_revealProgress"),
      revealType: gl.getUniformLocation(this.program, "u_revealType"),
      tiltX: gl.getUniformLocation(this.program, "u_tiltX"),
      tiltY: gl.getUniformLocation(this.program, "u_tiltY"),
      magnify: gl.getUniformLocation(this.program, "u_magnify"),
    };
  }

  private _resizeCanvas() {
    const dpr = Math.min(2, (window.devicePixelRatio as number) || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  async captureSnapshot() {
    if (this._capturing || typeof (window as any).html2canvas === "undefined") return;
    this._capturing = true;

    const undos: Array<() => void> = [];

    const attemptCapture = async (attempt = 1, maxAttempts = 3, delayMs = 500): Promise<boolean> => {
      try {
        const target = this.snapshotTarget as HTMLElement;
        const fullW = target.scrollWidth;
        const fullH = target.scrollHeight;
        const maxTex = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 8192;
        const MAX_MOBILE_DIM = 4096;
        const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent);

        let scale = Math.min(this._snapshotResolution, maxTex / fullW, maxTex / fullH);
        if (isMobileSafari) {
          const over = (Math.max(fullW, fullH) * scale) / MAX_MOBILE_DIM;
          if (over > 1) scale = scale / over;
        }
        this.scaleFactor = Math.max(0.1, scale);

        this.canvas.style.visibility = "hidden";
        undos.push(() => (this.canvas.style.visibility = "visible"));

        const lensElements = this.lenses.flatMap((lens) => [lens.el, lens._shadowEl]).filter(Boolean);

        const ignoreElementsFunc = (element: Element) => {
          if (!element || !(element as any).hasAttribute) return false as any;
          if (element === this.canvas || lensElements.includes(element as any)) return true as any;
          const style = window.getComputedStyle(element);
          if (style.position === "fixed") return true as any;
          return isIgnored(element as any);
        };

        const html2canvas = (window as any).html2canvas as any;
        const snapCanvas: HTMLCanvasElement = await html2canvas(this.snapshotTarget, {
          allowTaint: false,
          useCORS: true,
          backgroundColor: null,
          removeContainer: true,
          width: fullW,
          height: fullH,
          scrollX: 0,
          scrollY: 0,
          scale: scale,
          ignoreElements: ignoreElementsFunc,
        });

        this._uploadTexture(snapCanvas);
        return true;
      } catch (e) {
        console.error("liquidGL snapshot failed on attempt " + attempt, e);
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return await attemptCapture(attempt + 1, maxAttempts, delayMs);
        } else {
          console.error("liquidGL: All snapshot attempts failed.", e);
          return false;
        }
      } finally {
        for (let i = undos.length - 1; i >= 0; i--) undos[i]();
        this._capturing = false;
      }
    };

    return await attemptCapture();
  }

  private _uploadTexture(srcCanvas: HTMLCanvasElement | HTMLCanvasElement & { width: number; height: number }) {
    let canvas: HTMLCanvasElement = srcCanvas as any;
    if (!(canvas instanceof HTMLCanvasElement)) {
      const tmp = document.createElement("canvas");
      tmp.width = (srcCanvas as any).width || 0;
      tmp.height = (srcCanvas as any).height || 0;
      if (tmp.width === 0 || tmp.height === 0) return;
      try {
        const ctx = tmp.getContext("2d");
        (ctx as CanvasRenderingContext2D).drawImage(canvas as any, 0, 0);
        canvas = tmp;
      } catch (e) {
        console.warn("liquidGL: Unable to convert OffscreenCanvas for upload", e);
        return;
      }
    }
    if (canvas.width === 0 || canvas.height === 0) return;
    this.staticSnapshotCanvas = canvas;
    const gl = this.gl;
    if (!this.texture) this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textureWidth = canvas.width;
    this.textureHeight = canvas.height;
    this.render();
    if (this._pendingReveal.length) {
      this._pendingReveal.forEach((ln) => ln._reveal());
      this._pendingReveal.length = 0;
    }
  }

  addLens(element: Element, options: any) {
    const lens = new LiquidGLLens(this, element, options);
    this.lenses.push(lens);
    const maxZ = this._getMaxLensZ();
    if (maxZ > 0) this.canvas.style.zIndex = String(maxZ - 1);
    if (!this.texture) {
      this._pendingReveal.push(lens);
    } else {
      lens._reveal();
    }
    return lens;
  }

  render() {
    const gl = this.gl;
    if (!this.texture) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.u.tex, 0);
    const time = (Date.now() - this.startTime) / 1000;
    gl.uniform1f(this.u.time, time);

    this.lenses.forEach((lens) => {
      lens.updateMetrics();
      if (lens._mirrorActive && lens._mirrorClipUpdater) lens._mirrorClipUpdater();
      this._renderLens(lens);
    });
  }

  private _renderLens(lens: any) {
    const gl = this.gl;
    const rect: BoundsRect | null = lens.rectPx;
    if (!rect) return;
    const dpr = Math.min(2, (window.devicePixelRatio as number) || 1);
    let overscrollY = 0;
    let overscrollX = 0;
    const vv: any = (window as any).visualViewport;
    if (vv) {
      overscrollX = vv.offsetLeft;
      overscrollY = vv.offsetTop;
    }
    const x = (rect.left + overscrollX) * dpr;
    const y = this.canvas.height - (rect.top + overscrollY + rect.height) * dpr;
    const w = rect.width * dpr;
    const h = rect.height * dpr;
    gl.viewport(x, y, w, h);
    gl.uniform2f(this.u.res, w, h);
    const docX = rect.left - (this.snapshotTarget as HTMLElement).getBoundingClientRect().left;
    const docY = rect.top - (this.snapshotTarget as HTMLElement).getBoundingClientRect().top;
    const leftUV = (docX * this.scaleFactor) / this.textureWidth;
    const topUV = (docY * this.scaleFactor) / this.textureHeight;
    const wUV = (rect.width * this.scaleFactor) / this.textureWidth;
    const hUV = (rect.height * this.scaleFactor) / this.textureHeight;
    gl.uniform4f(this.u.bounds, leftUV, topUV, wUV, hUV);
    gl.uniform2f(this.u.textureResolution, this.textureWidth, this.textureHeight);
    gl.uniform1f(this.u.refraction, lens.options.refraction);
    gl.uniform1f(this.u.bevelDepth, lens.options.bevelDepth);
    gl.uniform1f(this.u.bevelWidth, lens.options.bevelWidth);
    gl.uniform1f(this.u.frost, lens.options.frost);
    gl.uniform1f(this.u.radius, lens.radiusGl);
    gl.uniform1i(this.u.specular, lens.options.specular ? 1 : 0);
    gl.uniform1f(this.u.revealProgress, lens._revealProgress || 1.0);
    gl.uniform1i(this.u.revealType, lens.revealTypeIndex || 0);
    const mag = Math.max(0.001, Math.min(3.0, lens.options.magnify !== undefined ? lens.options.magnify : 1.0));
    gl.uniform1f(this.u.magnify, mag);
    gl.uniform1f(this.u.tiltX, lens.tiltX || 0);
    gl.uniform1f(this.u.tiltY, lens.tiltY || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  addDynamicElement(el: any) {
    registerDynamicElement(this, el);
  }

  _getMaxLensZ() {
    let maxZ = 0;
    this.lenses.forEach((ln: any) => {
      const z = effectiveZ(ln.el);
      if (z > maxZ) maxZ = z;
    });
    return maxZ;
  }
}

