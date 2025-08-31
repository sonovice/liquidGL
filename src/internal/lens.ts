import type { LiquidGLRenderer } from "./renderer";
import { effectiveZ } from "./utils";

export class LiquidGLLens {
  renderer: LiquidGLRenderer;
  el: HTMLElement;
  options: any;
  _initCalled = false;
  rectPx: any = null;
  radiusGl = 0;
  radiusCss = 0;
  revealTypeIndex: number;
  _revealProgress = 1;
  tiltX = 0;
  tiltY = 0;
  originalShadow: string;
  originalOpacity: string | number;
  originalTransition: string;
  _shadowEl?: HTMLDivElement | null;
  _shadowSyncFn?: () => void;
  _mirror?: HTMLCanvasElement | null;
  _mirrorCtx?: CanvasRenderingContext2D | null;
  _mirrorClipUpdater?: () => void;
  _mirrorActive?: boolean;
  _baseRect?: DOMRect | null;
  _tiltHandlersBound?: boolean;
  _savedTransform?: string;
  _savedTransformStyle?: string;
  _tiltInteracting?: boolean;
  _resetCleanupTimer?: any;
  _pivotOrigin?: string;

  constructor(renderer: LiquidGLRenderer, element: Element, options: any) {
    this.renderer = renderer;
    this.el = element as HTMLElement;
    this.options = options;
    this.revealTypeIndex = this.options.reveal === "fade" ? 1 : 0;
    this._revealProgress = this.revealTypeIndex === 0 ? 1 : 0;
    this.tiltX = 0;
    this.tiltY = 0;

    this.originalShadow = this.el.style.boxShadow;
    this.originalOpacity = this.el.style.opacity as any;
    this.originalTransition = this.el.style.transition;
    this.el.style.transition = "none";
    this.el.style.opacity = "0";

    this.el.style.position = this.el.style.position === "static" ? "relative" : this.el.style.position;

    const bgCol = window.getComputedStyle(this.el).backgroundColor;
    const rgbaMatch = bgCol.match(/rgba?\(([^)]+)\)/);
    if (rgbaMatch) {
      const comps = rgbaMatch[1].split(/[ ,]+/).map(parseFloat);
      const [r, g, b] = comps;
      this.el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0)`;
    }
    this.el.style.backdropFilter = "none";
    (this.el.style as any).webkitBackdropFilter = "none";
    this.el.style.backgroundImage = "none";
    this.el.style.background = "transparent";
    this.el.style.pointerEvents = "none";

    this.updateMetrics();
    this.setShadow(this.options.shadow);
    if (this.options.tilt) this._bindTiltHandlers();

    if (typeof (window as any).ResizeObserver !== "undefined" && !(this as any)._sizeObs) {
      const obs = new (window as any).ResizeObserver(() => {
        this.updateMetrics();
        this.renderer.render();
      });
      obs.observe(this.el);
      (this as any)._sizeObs = obs;
    }
  }

  updateMetrics() {
    const rect = this._baseRect ? this._baseRect : this.el.getBoundingClientRect();
    this.rectPx = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const style = window.getComputedStyle(this.el);
    const brRaw = style.borderTopLeftRadius.split(" ")[0];
    const isPct = brRaw.trim().endsWith("%");
    let brPx: number;
    if (isPct) {
      const pct = parseFloat(brRaw);
      brPx = (Math.min(rect.width, rect.height) * pct) / 100;
    } else {
      brPx = parseFloat(brRaw);
    }
    const maxAllowedCss = Math.min(rect.width, rect.height) * 0.5;
    this.radiusCss = Math.min(brPx, maxAllowedCss);
    const dpr = Math.min(2, (window.devicePixelRatio as number) || 1);
    this.radiusGl = this.radiusCss * dpr;
    if (this._shadowSyncFn) this._shadowSyncFn();
  }

  setShadow(enabled: boolean) {
    this.options.shadow = !!enabled;
    const SHADOW_VAL = "0 10px 30px rgba(0,0,0,0.1), 0 0 0 0.5px rgba(0,0,0,0.05)";
    const syncShadow = () => {
      if (!this._shadowEl) return;
      const r = this._baseRect ? this._baseRect : this.el.getBoundingClientRect();
      this._shadowEl!.style.left = `${r.left}px`;
      this._shadowEl!.style.top = `${r.top}px`;
      this._shadowEl!.style.width = `${r.width}px`;
      this._shadowEl!.style.height = `${r.height}px`;
      this._shadowEl!.style.borderRadius = `${this.radiusCss}px`;
    };
    if (enabled) {
      this.el.style.boxShadow = SHADOW_VAL;
      if (!this._shadowEl) {
        this._shadowEl = document.createElement("div");
        Object.assign(this._shadowEl.style, {
          position: "fixed",
          pointerEvents: "none",
          zIndex: String(effectiveZ(this.el) - 2),
          boxShadow: SHADOW_VAL,
          willChange: "transform, width, height",
          opacity: this.revealTypeIndex === 1 ? "0" : "1",
        } as CSSStyleDeclaration as any);
        document.body.appendChild(this._shadowEl);
        this._shadowSyncFn = syncShadow;
        window.addEventListener("resize", this._shadowSyncFn, { passive: true });
      }
      syncShadow();
    } else {
      if (this._shadowEl) {
        window.removeEventListener("resize", this._shadowSyncFn as any);
        this._shadowEl.remove();
        this._shadowEl = null;
      }
      this.el.style.boxShadow = this.originalShadow;
    }
  }

  _reveal() {
    if (this.revealTypeIndex === 0) {
      this.el.style.opacity = (this.originalOpacity as any) || "1";
      this.renderer.canvas.style.opacity = "1";
      this._revealProgress = 1;
      this._TriggerInit();
      return;
    }
    if ((this.renderer as any)._revealAnimating) return;
    (this.renderer as any)._revealAnimating = true;
    const dur = 1000;
    const start = performance.now();
    const animate = () => {
      const progress = Math.min(1, (performance.now() - start) / dur);
      (this.renderer.lenses as any[]).forEach((ln: any) => {
        ln._revealProgress = progress;
        ln.el.style.opacity = String(((ln.originalOpacity as any) || 1) * progress);
        if (ln._shadowEl) ln._shadowEl.style.opacity = String(progress);
      });
      this.renderer.canvas.style.opacity = String(progress);
      this.renderer.render();
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        (this.renderer as any)._revealAnimating = false;
        (this.renderer.lenses as any[]).forEach((ln: any) => {
          ln.el.style.transition = ln.originalTransition || "";
          ln._TriggerInit();
        });
      }
    };
    requestAnimationFrame(animate);
  }

  _TriggerInit() {
    if (this._initCalled) return;
    this._initCalled = true;
    if (this.options.on && this.options.on.init) {
      this.options.on.init(this);
    }
  }

  _bindTiltHandlers() {
    if (this._tiltHandlersBound) return;
    if (this._savedTransform === undefined) {
      const currentTransform = this.el.style.transform;
      if (currentTransform && currentTransform.includes("translate")) {
        this._savedTransform = currentTransform.replace(/translate\([^)]*\)\s*/g, "").trim();
        if (this._savedTransform === "") this._savedTransform = "none";
      } else {
        this._savedTransform = currentTransform;
      }
    }
    if (this._savedTransformStyle === undefined) this._savedTransformStyle = this.el.style.transformStyle;
    this.el.style.transformStyle = "preserve-3d";

    const getMaxTilt = () => (Number.isFinite(this.options.tiltFactor) ? this.options.tiltFactor : 5);
    this._applyTilt = (clientX: number, clientY: number) => {
      if (!this._tiltInteracting) {
        this._tiltInteracting = true;
        this.el.style.transition = "transform 0.12s cubic-bezier(0.33,1,0.68,1)";
      }
      const r = this._baseRect || this.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      this._pivotOrigin = `${cx}px ${cy}px`;
      const pctX = (clientX - cx) / (r.width / 2);
      const pctY = (clientY - cy) / (r.height / 2);
      const maxTilt = getMaxTilt();
      const rotY = pctX * maxTilt;
      const rotX = -pctY * maxTilt;
      const baseTransform = this._savedTransform && this._savedTransform !== "none" ? this._savedTransform + " " : "";
      const transformStr = `${baseTransform}perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      this.tiltX = rotX;
      this.tiltY = rotY;
      this.el.style.transformOrigin = `50% 50%`;
      this.el.style.transform = transformStr;
      this.renderer.render();
    } as any;

    this._onMouseEnter = (e: any) => {
      if (this._resetCleanupTimer) {
        clearTimeout(this._resetCleanupTimer);
        this._resetCleanupTimer = null;
        this.el.style.transition = "none";
        this.el.style.transform = this._savedTransform || "";
        void (this.el as any).offsetHeight;
      }
      this._tiltInteracting = false;
      const r = this._baseRect || this.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      (this as any)._applyTilt(cx, cy);
      if (e && typeof e.clientX === "number") {
        requestAnimationFrame(() => (this as any)._applyTilt(e.clientX, e.clientY));
      }
      document.addEventListener("mousemove", this._docPointerMove as any, { passive: true });
    };

    this._docPointerMove = (e: any) => {
      const x = e.clientX ?? (e.touches && e.touches[0].clientX);
      const y = e.clientY ?? (e.touches && e.touches[0].clientY);
      if (x === undefined || y === undefined) return;
      const r = this.el.getBoundingClientRect();
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (inside) {
        (this as any)._applyTilt(x, y);
      } else {
        this._smoothReset();
      }
    };

    this.el.addEventListener("mouseenter", this._onMouseEnter as any, { passive: true });
    this.el.addEventListener("mousemove", (e) => (this as any)._applyTilt((e as MouseEvent).clientX, (e as MouseEvent).clientY), { passive: true });
    this.el.addEventListener("touchstart", (e) => {
      if ((e as TouchEvent).touches && (e as TouchEvent).touches.length === 1) {
        const t = (e as TouchEvent).touches[0];
        (this as any)._applyTilt(t.clientX, t.clientY);
      }
    }, { passive: true });
    this.el.addEventListener("touchmove", (e) => {
      if ((e as TouchEvent).touches && (e as TouchEvent).touches.length === 1) {
        const t = (e as TouchEvent).touches[0];
        (this as any)._applyTilt(t.clientX, t.clientY);
      }
    }, { passive: true });
    this.el.addEventListener("touchend", () => this._smoothReset(), { passive: true });
    document.addEventListener("pointermove", this._docPointerMove as any, { passive: true });
    this._tiltHandlersBound = true;
  }

  _onMouseEnter?: (e: any) => void;
  _docPointerMove?: (e: any) => void;
  _applyTilt?: (x: number, y: number) => void;

  _smoothReset() {
    this.el.style.transition = "transform 0.4s cubic-bezier(0.33,1,0.68,1)";
    this.el.style.transformOrigin = `50% 50%`;
    const baseRest = this._savedTransform && this._savedTransform !== "none" ? this._savedTransform + " " : "";
    this.el.style.transform = `${baseRest}perspective(800px) rotateX(0deg) rotateY(0deg)`;
    this.tiltX = 0;
    this.tiltY = 0;
    this.renderer.render();
  }
}

export default LiquidGLLens;

