# LiquidGlass – Ultra-light glassmorphism for the web

LiquidGlass turns any fixed-position element into a perfectly refracted, glossy "glass pane" rendered in WebGL.

---

## Prerequisites

Add **both** of the following scripts anywhere before you initialise LiquidGlass (normally at the end of the `<body>`):

```html
<!-- html2canvas – DOM snapshotter (required) -->
<script
  src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
  defer
></script>

<!-- liquid.js – the library itself -->
<script src="/scripts/liquid.js" defer></script>
```

> `html2canvas` provides the high-resolution snapshot of the page background that LiquidGlass refracts. The library will throw if either dependency is missing.

---

## Quick start

```html
<script>
  document.addEventListener("DOMContentLoaded", () => {
    liquidGlass({
      target: ".menu-wrap", // CSS selector for the element to glass-ify
      refraction: 0.01, // Base refraction strength (0–1)
      bevelDepth: 0.08, // Intensity of the edge bevel (0–1)
      bevelWidth: 0.15, // Width of the bevel as a proportion of the element (0–1)
      frost: 2, // Subtle blur radius in px. 0 = crystal clear
      shadow: true, // Adds a soft drop-shadow under the pane
      specular: true, // Animated light highlights (slightly more GPU)
      on: {
        init(instance) {
          // Callback fired when the first frame has rendered
          console.log("LiquidGlass ready!", instance);
        },
      },
    });
  });
</script>
```

### Option reference

| Option       | Type     | Default      | Description                                                            |
| ------------ | -------- | ------------ | ---------------------------------------------------------------------- |
| `target`     | string   | `.menu-wrap` | CSS selector of the element that should receive the effect.            |
| `refraction` | number   | `0.01`       | Base refraction offset applied across the pane.                        |
| `bevelDepth` | number   | `0.08`       | Additional refraction applied on the very edge to simulate depth.      |
| `bevelWidth` | number   | `0.15`       | Width of the bevel zone, expressed as a fraction of the shortest side. |
| `frost`      | number   | `0`          | Size of the blur kernel in **pixels** for a frosted glass look.        |
| `shadow`     | boolean  | `true`       | Toggles a subtle drop-shadow under the pane.                           |
| `specular`   | boolean  | `true`       | Enables animated specular highlights that move with time.              |
| `on.init`    | function | `—`          | Runs once the first full render completes. Receives the instance.      |

All options are optional—only `target` is required.

---

## Limitations

- Animated or video content **behind** the pane is not re-captured in real-time; the snapshot is static for performance reasons.
- All page content must be present (visible in the DOM) **before** you initialise LiquidGlass. Deferred/scroll-triggered animations should be started **after** `on.init`.
- The initial capture is synchronous and may block the main thread momentarily; call `liquidGlass()` inside a `DOMContentLoaded` or `load` handler to avoid jank during critical rendering.
- Extremely long documents can exceed GPU texture limits, causing memory or performance issues. Consider segmenting very long pages or reducing `scaleFactor` (see source).

---

## Border-radius

LiquidGlass automatically inherits the `border-radius` of the target element, ensuring the refraction respects rounded corners without any extra configuration.

---

## License

MIT © NaughtyDuk
