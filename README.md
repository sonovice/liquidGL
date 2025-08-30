# liquidGL – Ultra-light glassmorphism for the web (ESM package)

<a href="https://liquidgl.naughtyduk.com"><img src="/assets/liquidGlass-promo.gif" alt="liquidGL" style="width: 100%"/></a>

**Browser-only ESM**

- This package targets modern browsers only (no Node.js/SSR). It depends on `html2canvas` and WebGL.
- Exports ESM only. Use with Vite, Bun, Next (client components), or any modern bundler targeting browsers.

## Installation

```bash
bun add liquidgl html2canvas
```

> html2canvas is declared as a dependency and is automatically installed. It is attached to `window` by this package at runtime.

## Quick start (ESM)

```ts
import liquidGL from "liquidgl";

// Call after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  liquidGL({
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
    on: {
      init(instance) {
        console.log("liquidGL ready!", instance);
      }
    }
  });
});
```

> Ensure your target element sits above your page content using a suitable `z-index`.

### Registering dynamic elements

For animated DOM (text, CSS animations) overlapping the lens:

```ts
liquidGL.registerDynamic(".my-animated-element");
```

### Optional: sync with smooth scrolling libraries

```ts
const { lenis, locomotiveScroll } = liquidGL.syncWith();
```

- Auto-detects Lenis/Locomotive Scroll and synchronizes the render loop.
- Call after you initialize `liquidGL()`.

## Options

- **target**: string (default: `.liquidGL`) – CSS selector for lens elements.
- **snapshot**: string (default: `body`) – CSS selector for the element to snapshot.
- **resolution**: number (default: 2.0) – Snapshot resolution (0.1–3.0).
- **refraction**: number (default: 0.01) – Base refraction strength.
- **bevelDepth**: number (default: 0.08)
- **bevelWidth**: number (default: 0.15)
- **frost**: number (default: 0) – Additional blur in the lens.
- **shadow**: boolean (default: true)
- **specular**: boolean (default: true)
- **reveal**: "none" | "fade" (default: "fade")
- **tilt**: boolean (default: false)
- **tiltFactor**: number (default: 5)
- **magnify**: number (default: 1)
- **on.init(instance)**: callback fired once the first render completes

## Notes and tips

- Call `liquidGL()` after content that should be visible to the snapshot is present.
- Use `data-liquid-ignore` on elements you want excluded from the snapshot.
- Very long pages may hit GPU texture limits; reduce `resolution` or snapshot a smaller container.
- The library uses a single shared WebGL canvas and works best when all target lenses share the same stacking context/z-index.
- Images inside the target must be CORS-permitted.

## Browser support

Modern browsers with WebGL. Performance is best in Chromium-based browsers; Safari performance is being improved.

## License

MIT © NaughtyDuk and contributors
