# liquidGL – Ultra-light glassmorphism for the web

<a href="https://liquidgl.naughtyduk.com"><img src="/assets/liquidGlass-promo.gif" alt="liquidGL" style="width: 100%"/></a>

liquidGL turns any fixed-position element into a perfectly refracted, glossy "glass pane" rendered in WebGL.

<a href="https://liquidgl.naughtyduk.com" target="_blank" rel="noopener noreferrer"><strong>TRY IT OUT</strong></a>

<a href="https://liquidgl.naughtyduk.com/demos/demo-1.html" target="_blank" rel="noopener noreferrer"><strong>DEMO 1</strong></a> | <a href="https://liquidgl.naughtyduk.com/demos/demo-2.html" target="_blank" rel="noopener noreferrer"><strong>DEMO 2</strong></a> | <a href="https://liquidgl.naughtyduk.com/demos/demo-3.html" target="_blank" rel="noopener noreferrer"><strong>DEMO 3</strong></a> | <a href="https://liquidgl.naughtyduk.com/demos/demo-4.html" target="_blank" rel="noopener noreferrer"><strong>DEMO 4</strong></a> | <a href="https://liquidgl.naughtyduk.com/demos/demo-5.html" target="_blank" rel="noopener noreferrer"><strong>DEMO 5</strong></a>

## Overview

`liquidGL` recreates Apple's upcoming "Liquid Glass" aesthetic in the browser with an ultra-light WebGL shader. WebGL cannot read live pixels for security reasons, the library takes a single high-resolution snapshot of the page when you call `LiquidGL()`. This keeps performance smooth, but it also means the pane can't refract content that changes afterwards, such as playing video or animations. Your page can still have video and animations, they just won't be refracted through the lens in real time.

---

## Prerequisites

Add **both** of the following scripts before you initialise liquidGL (normally at the end of the `<body>`):

```html
<!-- html2canvas – DOM snapshotter (required) -->
<script
  src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
  defer
></script>

<!-- liquidGL.js – the library itself -->
<script src="/scripts/liquidGL.js" defer></script>
```

> `html2canvas` provides the high-resolution snapshot of the page background that liquidGL refracts. The library will throw if either dependency is missing.

---

## Quick start

Set up your HTML structure first. You will have a fixed parent element to wrap everything and place it over your page content, a `target` element that will receive the glass effect, and a child element for your content (excluded from glass effect).

```html
<!-- Example HTML structure -->
<body>
  <!-- A container to position your glass element above the body -->
  <div class="fixed-container">
    <!-- Fixed wrapper -->
    <div class="selector">
      <!-- Target (glassified) -->
      <div class="content">
        <!-- Content -->
        <img src="/example.svg" alt="Alt Text" />
        <p>This example text content will appear on top of the glass.</p>
      </div>
    </div>
  </div>
</body>
```

> Make sure that your `.fixed-container` element has a high z-index so that it sits over your page content.

Next, initialise the library with the selector for your target element.

```html
<script>
  document.addEventListener("DOMContentLoaded", () => {
    const glassEffect = LiquidGL({
      snapshot: "body",
      target: ".selector", // CSS selector for the element to glass-ify
      refraction: 0.01, // Base refraction strength (0–1)
      bevelDepth: 0.08, // Intensity of the edge bevel (0–1)
      bevelWidth: 0.15, // Width of the bevel as a proportion of the element (0–1)
      frost: 2, // Subtle blur radius in px. 0 = crystal clear
      shadow: true, // Adds a soft drop-shadow under the pane
      specular: true, // Animated light highlights (slightly more GPU)
      reveal: "fade", // Reveal animation
      on: {
        init(instance) {
          // The `init` callback fires once liquidGL has taken its snapshot
          // and rendered the first frame. It's the ideal place to hide or
          // prepare elements for reveal animations (e.g. with GSAP, ScrollTrigger)
          // because it ensures the content is visible to the snapshot before
          // you hide it from the user.
          console.log("liquidGL ready!", instance);
        },
      },
    });
  });
</script>
```

---

## Optionally sync with Lenis/GSAP

```html
<script>
  window.addEventListener("load", function () {
    // Lenis & GSAP ScrollTrigger integration
    const lenis = new Lenis();

    lenis.on("scroll", ScrollTrigger.update);

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
      if (window.glassEffect) {
        if (Array.isArray(window.glassEffect)) {
          if (window.__LiquidGLRenderer__) window.__LiquidGLRenderer__.render();
        } else if (!window.glassEffect.options.specular) {
          window.glassEffect.render();
        }
      }
    });

    gsap.ticker.lagSmoothing(0);
  });
</script>
```

> Don't forget to include Lenis and GSAP before calling them in the load event.

## Parameters

| Option       | Type     | Default     | Description                                                                                                   |
| ------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `snapshot`   | string   | `'body'`    | CSS selector for the element to snapshot. Defaults to `<body>`.                                               |
| `target`     | string   | `.selector` | CSS selector of the element(s) that should be glassified, all elements with this selector will be glassified. |
| `refraction` | number   | `0.01`      | Base refraction offset applied across the pane.                                                               |
| `bevelDepth` | number   | `0.08`      | Additional refraction applied on the very edge to simulate depth.                                             |
| `bevelWidth` | number   | `0.15`      | Width of the bevel zone, expressed as a fraction of the shortest side.                                        |
| `frost`      | number   | `0`         | Size of the blur kernel in **pixels** for a frosted glass look.                                               |
| `shadow`     | boolean  | `true`      | Toggles a subtle drop-shadow under the pane.                                                                  |
| `specular`   | boolean  | `true`      | Enables animated specular highlights that move with time.                                                     |
| `tilt`       | boolean  | `false`     | Adds a 3-D tilt interaction on cursor/touch movement (rotates the pane).                                      |
| `tiltFactor` | number   | `5`         | Depth of the tilt in degrees (0-25 recommended). Higher = steeper tilt.                                       |
| `reveal`     | string   | `'fade'`    | - `None` - immediately render the `target` element.<br>- `Fade` - a smooth fade in of the `target` element.   |
| `on.init`    | function | `—`         | Runs once the first full render completes. Receives the instance.                                             |

> The `target` parameter is required, all other parameters are optional.

## Presets

Below are some ready-made configurations you can copy-paste. Feel free to tweak values to suit your design.

| Name        | Settings                                                                                               | Purpose                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Default** | `{ refraction: 0, bevelDepth: 0.052, bevelWidth: 0.211, frost: 2, shadow: true, specular: true }`      | Balanced default used in the demo.                      |
| **Alien**   | `{ refraction: 0.073, bevelDepth: 0.2, bevelWidth: 0.156, frost: 2, shadow: true, specular: false }`   | Strong refraction & deep bevel for a sci-fi look.       |
| **Pulse**   | `{ refraction: 0.03, bevelDepth: 0, bevelWidth: 0.273, frost: 0, shadow: false, specular: false }`     | Flat pane with wide bevel—great for pulsing UI effects. |
| **Frost**   | `{ refraction: 0, bevelDepth: 0.035, bevelWidth: 0.119, frost: 0.9, shadow: true, specular: true }`    | Softly diffused, privacy-glass style.                   |
| **Edge**    | `{ refraction: 0.047, bevelDepth: 0.136, bevelWidth: 0.076, frost: 2, shadow: true, specular: false }` | Thin bevel and bright rim highlights.                   |

---

## FAQ

| Question                                                                 | Answer                                                                                                                                                                                                                                                                                                                                                               |
| :----------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is there a resize handler?                                               | Yes resize is handled in the library and debounced to 250ms for performance.                                                                                                                                                                                                                                                                                         |
| Does the effect work on mobile?                                          | Yes the library handles all 3 versions of WebGL and provides a frosted CSS `backdrop-filter` as a backup for older devices.                                                                                                                                                                                                                                          |
| I have a preloader, how should I initialise liquidGL?                    | Run your preloader as normal, then once the preloader disappears and page content is visible, you can call `LiquidGL();`.                                                                                                                                                                                                                                            |
| What is the correct way to use liquidGL with page animations?            | Lets say you have a preloader, above the fold intro animations and scroll animations on your page. You would:<br><br>1) animate your preloader and intro animations<br>2) once complete call `LiquidGL();`<br>3) in the `on.init();` callback, set your initial states for elements, i.e setting the start position of any animations like transforms, SplitText etc |
| Can I use liquidGL on multiple elements?                                 | Yes, any element which has the class declared as your `target` will be glassified.                                                                                                                                                                                                                                                                                   |
| Will the library exceed WebGL contexts or have other performance issues? | No, the library uses a shared canvas for all instances, we have tested up to 30 elements on one page and we were not able to cause performance problems or crashes.                                                                                                                                                                                                  |
| Are there any animation limitations?                                     | It depends on what you're trying to do, rotation and scale are expensive CPU/GPU processes, additionally `shadow` `specular` and `tilt` should be used with care when you have lots of instances or complex animations as they can clog the render pipeline.                                                                                                         |

---

## Important Notes

- Animated or video content **behind** the pane is not re-captured in real-time; the snapshot is static for performance and security reasons. Unfortunately there is no current workaround.
- To improve performance on complex pages, you can snapshot a smaller, specific element like a background container instead of the whole page. Use the `snapshot` option with a CSS selector (e.g., `snapshot: '.my-background'`). This reduces texture memory and improves performance.
- All page content must be present (visible in the DOM) **before** you initialise liquidGL. Deferred/scroll-triggered animations should have their initial states set **in** `on.init`.
- The initial capture is synchronous and may block the main thread momentarily; call `LiquidGL()` inside a `DOMContentLoaded` or `load` handler to avoid jank during critical rendering.
- Extremely long documents can exceed GPU texture limits, causing memory or performance issues. Consider segmenting very long pages or reducing `scaleFactor` (see source).
- As with all WebGL effects, any **image** content inside the `target` element must have permissive `Access-Control-Allow-Origin` headers set to prevent CORS issues.

---

## Browser Support

The liquidGL library is compatible with all WebGL enabled browsers on desktop, tablet and mobile devices, including Google Chrome, Safari and Firefox.

| Browser        | Supported |
| :------------- | :-------: |
| Google Chrome  |    Yes    |
| Safari         |    Yes    |
| Firefox        |    Yes    |
| Microsoft Edge |    Yes    |

---

## Other

**Exclude elements**

> You can set elements to be ignored by the refraction using `data-liquid-ignore`. Add this attribute on the parent container of the element you wish to exclude.

**Content Visibility**

> It is recommended to use `z-index: 3;` on the content inside your target element to make it sit on top of the lens. You can also combine this with `mix-blend-mode: difference;` on the `fixed-container` for better legibility.

**Border-radius**

> liquidGL automatically inherits the `border-radius` of the `target` element, ensuring the refraction respects rounded corners without any extra configuration. If you animate the `border-radius` of your `target` element i.e on scroll, the bevel will animate in real time to remain in sync.

---

## License

MIT © NaughtyDuk
