/*
 * Liquid Glass Effect – transparent, glossy refraction for the .menu-wrap element.
 * -----------------------------------------------------------------------------
 * Requirements:   WebGL + html2canvas
 * Author:         NaughtyDuk© - https://liquid.naughtyduk.com
 * Version:        1.0.0
 * Date:           2025-06-20
 * License:        MIT
 *
 */

(() => {
  "use strict";

  /* --------------------------------------------------
   *  Utility – debounce a function
   * ------------------------------------------------*/
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const context = this;
      const later = () => {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /* --------------------------------------------------
   *  WebGL helpers
   * ------------------------------------------------*/
  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source.trim());
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader error", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Program link error", gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  /* --------------------------------------------------
   *  Main class
   * ------------------------------------------------*/
  class LiquidGlass {
    constructor(container, options) {
      this.el = container;
      this.options = options;
      this.originalShadow = this.el.style.boxShadow;
      this.originalOpacity = this.el.style.opacity;
      this.originalTransition = this.el.style.transition;
      this.el.style.transition = "none";
      this.el.style.opacity = 0;
      this.canvas = document.createElement("canvas");
      this.canvas.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;border-radius:inherit;z-index:2;`;
      this.el.style.position =
        this.el.style.position === "static"
          ? "relative"
          : this.el.style.position;
      this.el.appendChild(this.canvas);
      this.gl = this.canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
      });
      if (!this.gl) {
        console.warn("WebGL not available – skipping liquid glass");
        this.canvas.remove();
        return;
      }

      // If WebGL is running, we don't need the CSS fallback. Disabling it
      // prevents the browser from doing expensive, redundant work.
      this.el.style.backdropFilter = "none";
      this.el.style.webkitBackdropFilter = "none";

      this.texture = null;
      this.program = null;
      this.posBuf = null;
      this.uTex = null;
      this.uRes = null;
      this.uBounds = null;
      this.uRefraction = null;
      this.uBevelDepth = null;
      this.uBevelWidth = null;
      this.uFrost = null;
      this.uRadius = null;
      this.uTime = null;
      this.uSpecular = null;
      this.textureWidth = 0;
      this.textureHeight = 0;
      this.uvScale = [0, 0];
      this.radius = 0;
      this.initialX = 0;
      this.initialY = 0;
      this.startTime = Date.now();

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.el);

      // Add a resize observer to the body to recapture the background on resize.
      // This is debounced to avoid performance issues.
      const debouncedRecapture = debounce(() => this.captureFullPage(), 250);
      const bodyResizeObserver = new ResizeObserver(debouncedRecapture);
      bodyResizeObserver.observe(document.body);

      // Track scroll cheaply – just update an offset uniform.
      this.scrollOffset = window.scrollY;
      this.lastCaptureScroll = window.scrollY;

      this.captureBusy = false;

      window.addEventListener(
        "scroll",
        () => {
          this.scrollOffset = window.scrollY;
        },
        { passive: true }
      );

      // We only recapture on an explicit resize now.

      this.initGL();
      this.resize();

      if (typeof window.html2canvas === "undefined") {
        console.error(
          "liquidGlass: html2canvas.js is required. Please include it manually."
        );
        return;
      }
      this.captureFullPage();

      const fullH = document.documentElement.scrollHeight;
      const fullW = document.documentElement.scrollWidth;
      const maxTex = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 8192;
      let scale = Math.min(1, maxTex / fullW, maxTex / fullH);
      // Downscale a bit more to reduce memory
      if (scale > 0.5) scale = 0.5;
      this.scaleFactor = scale;

      this.setShadow(this.options.shadow);
    }

    setShadow(enabled) {
      if (enabled) {
        this.el.style.boxShadow =
          "0 10px 30px rgba(0, 0, 0, 0.1), 0 0 0 0.5px rgba(0, 0, 0, 0.05)";
      } else {
        this.el.style.boxShadow = this.originalShadow;
      }
    }

    fadeIn() {
      requestAnimationFrame(() => {
        this.el.style.transition =
          this.originalTransition || "opacity 250ms ease";
        requestAnimationFrame(() => {
          this.el.style.opacity = this.originalOpacity || 1;
        });
      });
    }

    /* ----------------------------- */
    initGL() {
      const vsSource = `
                attribute vec2 a_position;
                varying vec2 v_uv;
                void main(){
                  v_uv = (a_position + 1.0) * 0.5;
                  gl_Position = vec4(a_position, 0.0, 1.0);
                }
              `;

      const fsSource = `
                precision highp float;
                varying vec2 v_uv;
                uniform sampler2D u_tex;
                uniform vec2 u_resolution;
                uniform vec4 u_bounds; // xy = origin, zw = scale in UV
                uniform float u_refraction;
                uniform float u_bevelDepth;
                uniform float u_bevelWidth;
                uniform float u_frost;
                uniform float u_radius;
                uniform float u_time;
                uniform bool u_specular;
        
                float udRoundBox( vec2 p, vec2 b, float r )
                {
                  return length(max(abs(p)-b+r,0.0))-r;
                }
                
                // distance to nearest edge (0 at edge, 0.5 in centre)
                float edgeFactor(vec2 uv, float radius_px){
                  vec2 p_px = (uv - 0.5) * u_resolution;
                  vec2 b_px = 0.5 * u_resolution;
                  
                  float d = -udRoundBox(p_px, b_px, radius_px);
                  
                  // Convert bevelWidth to pixels
                  float bevel_px = u_bevelWidth * min(u_resolution.x, u_resolution.y);
                  
                  return 1.0 - smoothstep(0.0, bevel_px, d);
                }
        
                void main(){
                  // Make displacement isotropic regardless of element aspect.
                  vec2 delta = v_uv - 0.5;
                  delta.x *= u_resolution.x / u_resolution.y;
                  vec2 dir = normalize(delta);
        
                  float edge = edgeFactor(v_uv, u_radius);
      
                  // A gentle, overall refraction for the main lens effect.
                  float refraction_strength = edge * u_refraction;
                  // A second, stronger refraction at the very edge to simulate a bevel.
                  float bevel_strength = pow(edge, 10.0) * u_bevelDepth;
                  vec2 offset = dir * (refraction_strength + bevel_strength);
      
                  // Map local v_uv to global texture UV. We flip the v_uv.y component
                  // (1.0 - v_uv.y) because WebGL's quad coordinates start from the
                  // bottom-left, while our texture is oriented from the top-left. This
                  // aligns them correctly.
                  vec2 flipped_v_uv = vec2(v_uv.x, 1.0 - v_uv.y);
                  vec2 mapped = u_bounds.xy + flipped_v_uv * u_bounds.zw;
                  vec2 refracted_uv = mapped + offset;
      
                  // This is the robust fix for all edge artifacts. Instead of clamping, we
                  // smoothly mix back to the un-refracted UV if we are about to sample
                  // outside the texture. This prevents all visual glitches at the boundary.
                  float oob_x = max(0.0, -refracted_uv.x) + max(0.0, refracted_uv.x - 1.0);
                  float oob_y = max(0.0, -refracted_uv.y) + max(0.0, refracted_uv.y - 1.0);
                  float oob_blend = 1.0 - smoothstep(0.0, 0.01, max(oob_x, oob_y));
                  vec2 sampleUV = mix(mapped, refracted_uv, oob_blend);
                  
                  vec4 finalColor;
  
                  if (u_frost > 0.0) {
                      float frost_amount = u_frost / u_resolution.x;
                      vec4 blurred = vec4(0.0);
                      blurred += texture2D(u_tex, sampleUV + vec2(-1.0, -1.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(0.0, -1.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(1.0, -1.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(-1.0, 0.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(0.0, 0.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(1.0, 0.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(-1.0, 1.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(0.0, 1.0) * frost_amount);
                      blurred += texture2D(u_tex, sampleUV + vec2(1.0, 1.0) * frost_amount);
                      finalColor = blurred / 9.0;
                  } else {
                      finalColor = texture2D(u_tex, sampleUV);
                  }
      
                  if (u_specular) {
                      // Two moving light sources for broad highlights
                      vec2 light_pos1 = vec2(sin(u_time * 0.2), cos(u_time * 0.3)) * 0.6 + 0.5;
                      vec2 light_pos2 = vec2(sin(u_time * -0.4 + 1.5), cos(u_time * 0.25 - 0.5)) * 0.6 + 0.5;
  
                      float d1 = distance(v_uv, light_pos1);
                      float d2 = distance(v_uv, light_pos2);
  
                      // Create soft, broad highlights from the light sources
                      float highlight = 0.0;
                      highlight += smoothstep(0.4, 0.0, d1) * 0.1; // Intensity 0.1
                      highlight += smoothstep(0.5, 0.0, d2) * 0.08; // Intensity 0.08
  
                      // A subtle, shimmering layer across the surface
                      float shimmer_noise = (sin(v_uv.x * 20.0 + u_time * 1.5) + cos(v_uv.y * 15.0 + u_time * 1.0));
                      float shimmer = pow(fract(shimmer_noise * 5.3983), 20.0);
                      highlight += shimmer * 0.03; // Very subtle shimmer
  
                      finalColor.rgb += highlight;
                  }
      
                  // Keep whatever alpha html2canvas captured – if the pixel is transparent
                  // we want the underlying page colour to show through instead of forcing
                  // an opaque black.
                  gl_FragColor = finalColor;
                }
              `;

      const gl = this.gl;
      this.program = createProgram(gl, vsSource, fsSource);
      if (!this.program) return;

      this.uTex = gl.getUniformLocation(this.program, "u_tex");
      this.uRes = gl.getUniformLocation(this.program, "u_resolution");
      this.uBounds = gl.getUniformLocation(this.program, "u_bounds");
      this.uRefraction = gl.getUniformLocation(this.program, "u_refraction");
      this.uBevelDepth = gl.getUniformLocation(this.program, "u_bevelDepth");
      this.uBevelWidth = gl.getUniformLocation(this.program, "u_bevelWidth");
      this.uFrost = gl.getUniformLocation(this.program, "u_frost");
      this.uRadius = gl.getUniformLocation(this.program, "u_radius");
      this.uTime = gl.getUniformLocation(this.program, "u_time");
      this.uSpecular = gl.getUniformLocation(this.program, "u_specular");

      const posLoc = gl.getAttribLocation(this.program, "a_position");
      this.posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    /* ----------------------------- */
    resize() {
      const rect = this.el.getBoundingClientRect();
      const dpr = Math.min(1, window.devicePixelRatio || 1);
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;

      const style = window.getComputedStyle(this.el);
      const borderRadius = parseFloat(style.borderRadius);
      this.radius = borderRadius * dpr;

      // Also update our cached position on resize.
      this.initialX = rect.left;
      this.initialY = rect.top;

      // Recalculate UV scale so the sampled region matches the new element size.
      if (this.textureWidth && this.textureHeight) {
        const wUV = (rect.width * this.scaleFactor) / this.textureWidth;
        const hUV = (rect.height * this.scaleFactor) / this.textureHeight;
        this.uvScale = [wUV, hUV];
      }

      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (this.texture) this.render();
    }

    /* ----------------------------- */
    async captureFullPage() {
      const rect = this.el.getBoundingClientRect();

      // --------------------------------------------------------------
      // html2canvas renders the DOM exactly as it exists in the current
      // viewport—including any scroll offset.  If the page is initially
      // loaded half-way down, that means the entire document is translated
      // upwards by that offset inside the snapshot.  Subsequent coordinate
      // mapping (which assumes an origin at scroll 0) then yields colour /
      // contrast discrepancies.  To guarantee a uniform capture space we
      // momentarily scroll to the very top, take the snapshot, and then
      // restore the user's original scroll position.
      // --------------------------------------------------------------

      const prevScrollX = window.scrollX;
      const prevScrollY = window.scrollY;

      if (prevScrollY !== 0 || prevScrollX !== 0) {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        // Ensure layout has updated before continuing.
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Temporarily hide our overlay so it isn't captured.
      this.canvas.style.visibility = "hidden";

      // To prevent the element itself from being captured in the background, we add
      // a temporary attribute to it. The `onclone` callback for html2canvas will
      // then find and remove this element from the cloned document before the
      // "screenshot" is taken.
      const tempAttr = `data-liquid-ignore`;
      this.el.setAttribute(tempAttr, "");

      await new Promise((r) => requestAnimationFrame(r));

      let viewportCanvas;
      try {
        viewportCanvas = await window.html2canvas(document.body, {
          scale: this.scaleFactor,
          backgroundColor: null,
          useCORS: true,
          removeContainer: true,
          onclone: (doc) => {
            const ghost = doc.querySelector(`[${tempAttr}]`);
            if (ghost) ghost.remove();
          },
          // Ignore other canvas elements to prevent warnings and capture issues.
          ignoreElements: (el) => el.tagName === "CANVAS",
        });
      } catch (e) {
        console.warn("html2canvas failed", e);
      } finally {
        this.canvas.style.visibility = "visible";
        // Always remove the temporary attribute
        this.el.removeAttribute(tempAttr);
      }

      if (!viewportCanvas) return;

      // Restore the user's scroll position so the page appears unaffected.
      if (prevScrollY !== 0 || prevScrollX !== 0) {
        window.scrollTo({
          top: prevScrollY,
          left: prevScrollX,
          behavior: "instant",
        });
      }

      // The full-page canvas may exceed MAX_TEXTURE_SIZE in width; so we will canvas.scale to ensure inside. Already scaled.
      this.updateTexture(viewportCanvas);
      this.fadeIn();

      // Compute UV scale of the menu within the big texture, and store texture dims.
      this.textureWidth = viewportCanvas.width;
      this.textureHeight = viewportCanvas.height;
      const wUV = (rect.width * this.scaleFactor) / this.textureWidth;
      const hUV = (rect.height * this.scaleFactor) / this.textureHeight;
      this.uvScale = [wUV, hUV];

      // Cache the initial element position relative to the document.
      this.initialX = rect.left;
      this.initialY = rect.top;
    }

    /* ----------------------------- */
    updateTexture(srcCanvas) {
      const gl = this.gl;
      if (!this.texture) this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      // Keep original orientation (top-left origin) so UV mapping aligns.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        srcCanvas
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.render();
    }

    /* ----------------------------- */
    render() {
      const gl = this.gl;
      if (!this.program || !this.texture) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniform1i(this.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);

      if (this.uBounds && this.uvScale[0] > 0) {
        // For robust correctness (at the cost of a tiny bit of extra work), we
        // query the element's position in the document every frame.  This
        // guarantees the sampled region always lines up with whatever is
        // currently behind the fixed element, even if the page is initially
        // loaded at an arbitrary scroll position, or layout shifts occur.

        const rect = this.el.getBoundingClientRect();
        const docX = rect.left + window.scrollX;
        const docY = rect.top + window.scrollY;
        const leftUV = (docX * this.scaleFactor) / this.textureWidth;
        const topUV = (docY * this.scaleFactor) / this.textureHeight;
        gl.uniform4f(this.uBounds, leftUV, topUV, ...this.uvScale);
      }

      gl.uniform1f(this.uRefraction, this.options.refraction);
      gl.uniform1f(this.uBevelDepth, this.options.bevelDepth);
      gl.uniform1f(this.uBevelWidth, this.options.bevelWidth);
      gl.uniform1f(this.uFrost, this.options.frost);
      gl.uniform1f(this.uRadius, this.radius);

      const elapsedTime = (Date.now() - this.startTime) / 1000.0;
      gl.uniform1f(this.uTime, elapsedTime);
      gl.uniform1i(this.uSpecular, this.options.specular ? 1 : 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  /* --------------------------------------------------
   *  Public API
   * ------------------------------------------------*/
  window.liquidGlass = function (userOptions = {}) {
    const defaults = {
      target: ".menu-wrap",
      refraction: 0.01,
      bevelDepth: 0.08,
      bevelWidth: 0.15,
      frost: 0,
      shadow: true,
      specular: true,
    };
    const options = { ...defaults, ...userOptions };

    const targetEl = document.querySelector(options.target);
    if (!targetEl) {
      console.warn(
        `liquidGlass: Target element "${options.target}" not found.`
      );
      return;
    }

    if (targetEl._liquidGlass) {
      console.warn(
        `liquidGlass: Already initialized on target element "${options.target}".`
      );
      return;
    }

    targetEl._liquidGlass = new LiquidGlass(targetEl, options);
    return targetEl._liquidGlass;
  };
})();
