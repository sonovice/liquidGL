import { LiquidGLRenderer } from "./renderer";
import type { LiquidGLOptions } from "./types";

const defaults: Required<LiquidGLOptions> = {
  target: ".liquidGL",
  snapshot: "body",
  resolution: 2.0,
  refraction: 0.01,
  bevelDepth: 0.08,
  bevelWidth: 0.15,
  frost: 0,
  shadow: true,
  specular: true,
  reveal: "fade",
  tilt: false,
  tiltFactor: 5,
  magnify: 1,
  on: {},
};

export function installOnWindow() {
  const w = window as any;
  w.liquidGL = function liquidGL(userOptions: LiquidGLOptions = {}) {
    const options = { ...defaults, ...userOptions } as any;
    if (typeof w.__liquidGLNoWebGL__ === "undefined") {
      const testCanvas = document.createElement("canvas");
      const testCtx = (testCanvas.getContext("webgl2") || testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl")) as any;
      w.__liquidGLNoWebGL__ = !testCtx;
    }
    if (w.__liquidGLNoWebGL__) {
      const fallbackNodes = document.querySelectorAll(options.target);
      fallbackNodes.forEach((node: any) => {
        Object.assign(node.style, {
          background: "rgba(255, 255, 255, 0.07)",
          backdropFilter: "blur(12px)",
          webkitBackdropFilter: "blur(12px)",
        });
      });
      return fallbackNodes.length === 1 ? fallbackNodes[0] : Array.from(fallbackNodes);
    }
    let renderer = w.__liquidGLRenderer__ as LiquidGLRenderer | undefined;
    if (!renderer) {
      renderer = new LiquidGLRenderer(options.snapshot!, options.resolution!);
      w.__liquidGLRenderer__ = renderer;
    }
    const nodeList = document.querySelectorAll(options.target!);
    if (!nodeList || nodeList.length === 0) {
      console.warn(`liquidGL: Target element(s) '${options.target}' not found.`);
      return;
    }
    const instances = Array.from(nodeList).map((el) => (renderer as any).addLens(el, options));
    if (!(renderer as any)._rafId && !renderer!.useExternalTicker) {
      const loop = () => {
        renderer!.render();
        (renderer as any)._rafId = requestAnimationFrame(loop);
      };
      (renderer as any)._rafId = requestAnimationFrame(loop);
    }
    return instances.length === 1 ? instances[0] : instances;
  };

  w.liquidGL.registerDynamic = function registerDynamic(elements: string | Element | NodeList | Element[]) {
    const renderer: LiquidGLRenderer | undefined = w.__liquidGLRenderer__;
    if (!renderer || !(renderer as any).addDynamicElement) return;
    (renderer as any).addDynamicElement(elements);
    if ((renderer as any).captureSnapshot) (renderer as any).captureSnapshot();
  };

  w.liquidGL.syncWith = function syncWith(config: any = {}) {
    const renderer: LiquidGLRenderer | undefined = w.__liquidGLRenderer__;
    if (!renderer) {
      console.warn("liquidGL: Please initialize liquidGL *before* calling syncWith().");
      return {} as any;
    }
    const G = (w as any).gsap;
    const L = (w as any).Lenis;
    const LS = (w as any).LocomotiveScroll;
    const ST = G ? G.ScrollTrigger : null;
    let lenis = config.lenis;
    let loco = config.locomotiveScroll;
    const useGSAP = config.gsap !== false && G && ST;
    if (config.lenis !== false && L && !lenis) lenis = new L();
    if (config.locomotiveScroll !== false && LS && !loco && document.querySelector("[data-scroll-container]")) {
      loco = new LS({ el: document.querySelector("[data-scroll-container]"), smooth: true });
    }
    if (useGSAP && ST) {
      if (loco) {
        loco.on("scroll", ST.update);
        ST.scrollerProxy(loco.el, {
          scrollTop(value: number) {
            return arguments.length ? loco.scrollTo(value, { duration: 0, disableLerp: true }) : loco.scroll.instance.scroll.y;
          },
          getBoundingClientRect() {
            return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
          },
          pinType: loco.el.style.transform ? "transform" : "fixed",
        });
        ST.addEventListener("refresh", () => loco.update());
        ST.refresh();
      } else if (lenis) {
        lenis.on("scroll", ST.update);
      }
    }
    if ((renderer as any)._rafId) {
      cancelAnimationFrame((renderer as any)._rafId);
      (renderer as any)._rafId = null;
    }
    renderer.useExternalTicker = true;
    if (useGSAP) {
      G.ticker.add((time: number) => {
        if (lenis) lenis.raf(time * 1000);
        renderer.render();
      });
      G.ticker.lagSmoothing(0);
    } else {
      const loop = (time: number) => {
        if (lenis) lenis.raf(time);
        if (loco) loco.update();
        renderer.render();
        (renderer as any)._rafId = requestAnimationFrame(loop);
      };
      (renderer as any)._rafId = requestAnimationFrame(loop);
    }
    return { lenis, locomotiveScroll: loco };
  };
}

