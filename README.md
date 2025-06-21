# LiquidGL – Ultra-light glassmorphism for the web

<img src="/assets/liquidGlass-promo.gif" alt="LiquidGL" style="width: 100%"/>

LiquidGL turns any fixed-position element into a perfectly refracted, glossy "glass pane" rendered in WebGL.

<a href="https://liquid.naughtyduk.com"><strong>DEMO</strong></a>

## Overview

`LiquidGL` recreates Apple's upcoming "Liquid Glass" aesthetic in the browser with an ultra-light WebGL shader. Because WebGL cannot read live pixels for security reasons, the library takes a single high-resolution snapshot of the page when you call `LiquidGL()`. This keeps performance smooth, but it also means the pane can't refract content that changes afterwards, such as playing video or animations. Your page can still have video and animations, they just won't be refracted through the lens.

---

## Prerequisites

Add **both** of the following scripts before you initialise LiquidGL (normally at the end of the `<body>`):

```html
<!-- html2canvas – DOM snapshotter (required) -->
<script
  src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
  defer
></script>

<!-- liquid.js – the library itself -->
<script src="/scripts/liquidGL.js" defer></script>
```

> `html2canvas` provides the high-resolution snapshot of the page background that LiquidGL refracts. The library will throw if either dependency is missing.

---

## Quick start

```html
<script>
  document.addEventListener("DOMContentLoaded", () => {
    LiquidGL({
      target: ".selector", // CSS selector for the element to glass-ify
      refraction: 0.01, // Base refraction strength (0–1)
      bevelDepth: 0.08, // Intensity of the edge bevel (0–1)
      bevelWidth: 0.15, // Width of the bevel as a proportion of the element (0–1)
      frost: 2, // Subtle blur radius in px. 0 = crystal clear
      shadow: true, // Adds a soft drop-shadow under the pane
      specular: true, // Animated light highlights (slightly more GPU)
      on: {
        init(instance) {
          // The `init` callback fires once LiquidGL has taken its snapshot
          // and rendered the first frame. It's the ideal place to hide or
          // prepare elements for reveal animations (e.g. with GSAP, ScrollTrigger)
          // because it ensures the content is visible to the snapshot before
          // you hide it from the user.
          console.log("LiquidGL ready!", instance);
        },
      },
    });
  });
</script>
```

### Parameters

| Option       | Type     | Default     | Description                                                            |
| ------------ | -------- | ----------- | ---------------------------------------------------------------------- |
| `target`     | string   | `.selector` | CSS selector of the element that should receive the effect.            |
| `refraction` | number   | `0.01`      | Base refraction offset applied across the pane.                        |
| `bevelDepth` | number   | `0.08`      | Additional refraction applied on the very edge to simulate depth.      |
| `bevelWidth` | number   | `0.15`      | Width of the bevel zone, expressed as a fraction of the shortest side. |
| `frost`      | number   | `0`         | Size of the blur kernel in **pixels** for a frosted glass look.        |
| `shadow`     | boolean  | `true`      | Toggles a subtle drop-shadow under the pane.                           |
| `specular`   | boolean  | `true`      | Enables animated specular highlights that move with time.              |
| `on.init`    | function | `—`         | Runs once the first full render completes. Receives the instance.      |

All options are optional—only `target` is required.

### Presets

Below are some ready-made configurations you can copy-paste. Feel free to tweak values to suit your design.

| Name        | Settings                                                                                               | Purpose                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Default** | `{ refraction: 0, bevelDepth: 0.052, bevelWidth: 0.211, frost: 2, shadow: true, specular: true }`      | Balanced default used in the demo.                      |
| **Alien**   | `{ refraction: 0.073, bevelDepth: 0.2, bevelWidth: 0.156, frost: 2, shadow: true, specular: false }`   | Strong refraction & deep bevel for a sci-fi look.       |
| **Pulse**   | `{ refraction: 0.03, bevelDepth: 0, bevelWidth: 0.273, frost: 0, shadow: false, specular: false }`     | Flat pane with wide bevel—great for pulsing UI effects. |
| **Frost**   | `{ refraction: 0, bevelDepth: 0.035, bevelWidth: 0.119, frost: 0.9, shadow: true, specular: true }`    | Softly diffused, privacy-glass style.                   |
| **Edge**    | `{ refraction: 0.047, bevelDepth: 0.136, bevelWidth: 0.076, frost: 2, shadow: true, specular: false }` | Thin bevel and bright rim highlights.                   |

---

## Limitations

- Animated or video content **behind** the pane is not re-captured in real-time; the snapshot is static for performance reasons.
- All page content must be present (visible in the DOM) **before** you initialise LiquidGL. Deferred/scroll-triggered animations should be started **after** `on.init`.
- The initial capture is synchronous and may block the main thread momentarily; call `LiquidGL()` inside a `DOMContentLoaded` or `load` handler to avoid jank during critical rendering.
- Extremely long documents can exceed GPU texture limits, causing memory or performance issues. Consider segmenting very long pages or reducing `scaleFactor` (see source).

---

## Border-radius

LiquidGL automatically inherits the `border-radius` of the `target` element, ensuring the refraction respects rounded corners without any extra configuration.

---

## License

MIT © NaughtyDuk
