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

export type BoundsRect = { left: number; top: number; width: number; height: number };

