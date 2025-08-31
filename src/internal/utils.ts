export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let timeout: any;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(null, args), wait);
  };
}

export function effectiveZ(element: Element): number {
  let node: Element | null = element;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node as Element);
    if (style.position !== "static" && style.zIndex !== "auto") {
      const z = parseInt(style.zIndex, 10);
      if (!Number.isNaN(z)) return z;
    }
    node = (node as HTMLElement).parentElement;
  }
  return 0;
}

export function isIgnored(el: Element | null): boolean {
  return !!(
    el && typeof (el as any).closest === "function" && (el as any).closest("[data-liquid-ignore]")
  );
}

export function parseTransform(transform: string): [number, number, number, number, number, number] {
  if (transform === "none") return [1, 0, 0, 1, 0, 0];
  const matrixMatch = transform.match(/matrix\((.+)\)/);
  if (matrixMatch) {
    const values = matrixMatch[1].split(",").map((v) => parseFloat(v.trim()));
    return values as any;
  }
  const matrix3dMatch = transform.match(/matrix3d\((.+)\)/);
  if (matrix3dMatch) {
    const v = matrix3dMatch[1].split(",").map((x) => parseFloat(x.trim()));
    return [v[0], v[1], v[4], v[5], v[12], v[13]] as any;
  }
  return [1, 0, 0, 1, 0, 0];
}

