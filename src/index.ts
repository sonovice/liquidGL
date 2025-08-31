// Public ESM entry for the browser-only liquidGL package
// - Ensures html2canvas is available in the global scope for the internal engine
// - Imports the original implementation (which registers window.liquidGL)
// - Re-exports a typed, ergonomic ESM API for consumers

import html2canvas from "html2canvas";

// Attach html2canvas to window so the internal implementation can use it
// The library is browser-only; these guards avoid issues if bundled for SSR by mistake
if (typeof window !== "undefined") {
  // @ts-ignore
  (window as any).html2canvas = html2canvas;
}

// Side-effect import: defines window.liquidGL and helpers
import "./internal/liquidGL.js";

// Minimal type surface for options; kept aligned with runtime defaults
export type LiquidGLOptions = {
  target?: string;
  snapshot?: string;
  resolution?: number;
  refraction?: number;
  bevelDepth?: number;
  bevelWidth?: number;
  frost?: number;
  shadow?: boolean;
  specular?: boolean;
  reveal?: "none" | "fade";
  tilt?: boolean;
  tiltFactor?: number;
  magnify?: number;
  on?: { init?: (instance: any) => void };
};

// ESM-friendly API wrappers that delegate to the global implementation
export function liquidGL(options: LiquidGLOptions = {}) {
  // @ts-ignore
  return (window as any).liquidGL(options);
}

liquidGL.registerDynamic = function registerDynamic(elements: string | Element | NodeList | Element[]) {
  // @ts-ignore
  return (window as any).liquidGL.registerDynamic(elements);
};

liquidGL.syncWith = function syncWith(config: any = {}) {
  // @ts-ignore
  return (window as any).liquidGL.syncWith(config);
};

export default liquidGL;

