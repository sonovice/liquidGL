
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
    const list = renderer.snapshotTarget.querySelectorAll(elements);
    for (const n of list as any) registerDynamicElement(renderer, n as Element);
    return;
  }
  if (elements instanceof NodeList || Array.isArray(elements)) {
    for (const n of Array.from(elements as any)) registerDynamicElement(renderer, n as Element);
    return;
  }
  add(elements as Element);
}

