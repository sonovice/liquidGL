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

export interface LiquidGLStatic {
  (options?: LiquidGLOptions): any;
  registerDynamic(elements: string | Element | NodeList | Element[]): void;
  syncWith(config?: any): { lenis?: any; locomotiveScroll?: any };
}

export declare const liquidGL: LiquidGLStatic;
export default liquidGL;

