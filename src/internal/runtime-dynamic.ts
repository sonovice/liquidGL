
export function registerDynamicElement(renderer: any, elements: any) {
  const add = (el: Element) => {
    if (!el || !(el as any).getBoundingClientRect) return;
    if ((el as any).closest && (el as any).closest("[data-liquid-ignore]")) return;
    if (renderer._dynamicNodes.some((n: any) => n.el === el)) return;
    renderer._dynamicNodes = renderer._dynamicNodes.filter((n: any) => !el.contains(n.el));
    const meta = { _capturing: false, prevDrawRect: null, lastCapture: null, needsRecapture: true, hoverClassName: null, _animating: false, _rafId: null, _lastCaptureTs: 0, _heavyAnim: false };
    renderer._dynMeta.set(el, meta);
  };

  if (typeof elements === "string") {
    renderer.snapshotTarget.querySelectorAll(elements).forEach((n: any) => registerDynamicElement(renderer, n));
    return;
  }
  if ((NodeList as any).prototype.isPrototypeOf(elements) || Array.isArray(elements)) {
    Array.from(elements as any).forEach((n: any) => registerDynamicElement(renderer, n));
    return;
  }
  add(elements as Element);
}

