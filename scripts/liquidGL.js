/*
 * LiquidGL – Ultra-light glassmorphism for the web
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
  class LiquidGL {
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
      this.snapshotTarget = document.querySelector(this.options.snapshot);
      if (!this.snapshotTarget) {
        console.warn(
          `LiquidGL: Snapshot element "${this.options.snapshot}" not found. Falling back to <body>.`
        );
        this.snapshotTarget = document.body;
      }

      const ctxAttribs = { alpha: true, premultipliedAlpha: true };
      this.gl =
        this.canvas.getContext("webgl", ctxAttribs) ||
        this.canvas.getContext("experimental-webgl", ctxAttribs);
      if (!this.gl) {
        console.warn("WebGL unavailable");
        this.canvas.remove();
        return;
      }

      const bgCol = window.getComputedStyle(this.el).backgroundColor;
      const rgbaMatch = bgCol.match(/rgba?\(([^)]+)\)/);
      this._bgColorComponents = null;
      if (rgbaMatch) {
        const comps = rgbaMatch[1].split(/[ ,]+/).map(parseFloat);
        const [r, g, b, a = 1] = comps;
        this._bgColorComponents = { r, g, b, a };
        this.el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0)`;
      }

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
      this.uRevealProgress = null;
      this.uRevealType = null;
      this.textureWidth = 0;
      this.textureHeight = 0;
      this.uvScale = [0, 0];
      this.radius = 0;
      this.initialX = 0;
      this.initialY = 0;
      this.startTime = Date.now();
      this.renderLoopRunning = false;
      this.scrollOffset = 0;
      this._tiltHandlersBound = false;
      this._isPointerInside = false;

      if ("ResizeObserver" in window) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.el);

        const debouncedRecapture = debounce(() => this.captureFullPage(), 250);
        const snapshotResizeObserver = new ResizeObserver(debouncedRecapture);
        snapshotResizeObserver.observe(this.snapshotTarget);
      } else {
        const debouncedResize = debounce(() => {
          this.resize();
          this.captureFullPage();
        }, 250);
        window.addEventListener("resize", debouncedResize, { passive: true });
      }

      this.captureBusy = false;

      this.initGL();
      this.resize();

      if (typeof window.html2canvas === "undefined") {
        console.error(
          "LiquidGL: html2canvas.js is required. Please include it manually."
        );
        return;
      }

      const fullH = this.snapshotTarget.scrollHeight;
      const fullW = this.snapshotTarget.scrollWidth;
      const maxTex = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 8192;
      let scale = Math.min(1, maxTex / fullW, maxTex / fullH);
      if (scale > 0.5) scale = 0.5;
      this.scaleFactor = scale;

      const startCapture = () => {
        const firstCapture = this.captureFullPage();
        this.initPromise = firstCapture.then(() => {
          if (
            this.options &&
            this.options.on &&
            typeof this.options.on.init === "function"
          ) {
            this.options.on.init.call(this, this);
          }
          this._reveal();

          if (this.options.specular) {
            this._startContinuousRender();
          }
        });
      };

      if (document.readyState === "complete") {
        startCapture();
      } else {
        window.addEventListener("load", startCapture, { once: true });
      }

      this.setShadow(this.options.shadow);

      if (this.options.tilt) {
        this._bindTiltHandlers();
      }
    }

    setShadow(enabled) {
      if (enabled) {
        this.el.style.boxShadow =
          "0 10px 30px rgba(0, 0, 0, 0.1), 0 0 0 0.5px rgba(0, 0, 0, 0.05)";
      } else {
        this.el.style.boxShadow = this.originalShadow;
      }
    }

    _startContinuousRender() {
      if (this.renderLoopRunning) return;
      this.renderLoopRunning = true;
      const loop = () => {
        if (!document.body.contains(this.el)) {
          this.renderLoopRunning = false;
          return;
        }
        this.render();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    _reveal() {
      const revealType = this.options.reveal ?? "fade";
      const revealTypes = { none: 0, fade: 1 };
      const revealTypeIndex = revealTypes[revealType];

      requestAnimationFrame(() => {
        if (revealType === "fade") {
          const duration = 1000;
          const startTime = Date.now();

          this.gl.useProgram(this.program);
          this.gl.uniform1i(this.uRevealType, revealTypeIndex);

          const animate = () => {
            const progress = Math.min(1, (Date.now() - startTime) / duration);
            this.gl.uniform1f(this.uRevealProgress, progress);
            this.el.style.opacity = (this.originalOpacity || 1) * progress;

            if (this._bgColorComponents) {
              const { r, g, b, a } = this._bgColorComponents;
              this.el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${
                a * progress
              })`;
            }
            this.render();

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              this.el.style.transition = this.originalTransition || "";
              this.el.style.opacity = this.originalOpacity || 1;
              if (this._bgColorComponents) {
                const { r, g, b, a } = this._bgColorComponents;
                this.el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
              }
              if (!this.renderLoopRunning) this.render();
            }
          };

          this.gl.uniform1f(this.uRevealProgress, 0);
          this.render();

          requestAnimationFrame(() => {
            animate();
          });
        } else {
          this.render();
          this.el.style.transition =
            this.originalTransition || "opacity 250ms ease";
          requestAnimationFrame(() => {
            this.el.style.opacity = this.originalOpacity || 1;
          });
        }
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
                precision mediump float;
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
                uniform float u_revealProgress;
                uniform int u_revealType;
        
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
      
                  // Add a safe-guard against normalize(0,0) which is undefined and can
                  // cause a white pixel artifact on some GPUs.
                  if (length(delta) == 0.0) {
                    dir = vec2(0.0, 0.0);
                  }

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
                  if (u_revealType == 1) { // 1 = fade
                      // Premultiply RGB by the same factor when premultipliedAlpha
                      // is enabled. Without this, the very first low-alpha frame
                      // can appear bright (causing a white flash) because RGB is
                      // left at full intensity.
                      finalColor.rgb *= u_revealProgress;
                      finalColor.a  *= u_revealProgress;
                  }
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
      this.uRevealProgress = gl.getUniformLocation(
        this.program,
        "u_revealProgress"
      );
      this.uRevealType = gl.getUniformLocation(this.program, "u_revealType");

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

      this.initialX = rect.left;
      this.initialY = rect.top;

      if (this.textureWidth && this.textureHeight) {
        const wUV = (rect.width * this.scaleFactor) / this.textureWidth;
        const hUV = (rect.height * this.scaleFactor) / this.textureHeight;
        this.uvScale = [wUV, hUV];
      }

      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (this.texture) this.render();
    }

    /* ----------------------------- */
    async captureFullPage(attempt = 0) {
      if (this.captureBusy) return;
      this.captureBusy = true;

      const rect = this.el.getBoundingClientRect();

      const sw = this.snapshotTarget.scrollWidth;
      const sh = this.snapshotTarget.scrollHeight;
      if (sw === 0 || sh === 0) {
        console.warn(
          "LiquidGL: Skipping capture due to zero-size snapshot target"
        );
        this.captureBusy = false;
        return;
      }

      this.canvas.style.visibility = "hidden";
      const ignoreAttr = "data-liquid-ignore";
      this.el.setAttribute(ignoreAttr, "");

      let viewportCanvas;
      try {
        const fullH2 = this.snapshotTarget.scrollHeight;
        const fullW2 = this.snapshotTarget.scrollWidth;
        const maxTex2 = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 8192;
        let newScale = Math.min(1, maxTex2 / fullW2, maxTex2 / fullH2);
        if (newScale > 0.5) newScale = 0.5;
        this.scaleFactor = newScale;

        const isXOrigin = (src) => {
          try {
            const u = new URL(src, document.baseURI);
            return u.origin !== location.origin;
          } catch {
            return false;
          }
        };

        const h2cOpts = {
          allowTaint: false,
          useCORS: true,
          backgroundColor: null,
          removeContainer: true,
          width: this.snapshotTarget.scrollWidth,
          height: this.snapshotTarget.scrollHeight,
          scrollX: 0,
          scrollY: 0,
          ignoreElements: (el) => {
            if (el.hasAttribute(ignoreAttr)) return true;
            if (el.tagName === "CANVAS") return true;
            if (el.tagName === "IMG" && isXOrigin(el.src)) return true;
            return false;
          },
        };
        if (Number.isFinite(this.scaleFactor)) h2cOpts.scale = this.scaleFactor;

        viewportCanvas = await html2canvas(this.snapshotTarget, h2cOpts);
      } catch (e) {
        console.warn("html2canvas failed", e);
      } finally {
        this.canvas.style.visibility = "visible";
        this.el.removeAttribute(ignoreAttr);
        this.captureBusy = false;
      }

      if (!viewportCanvas) {
        console.warn(`LiquidGL: capture attempt ${attempt} returned null`);
        this.el.style.opacity = this.originalOpacity || 1;
        return;
      }

      this.updateTexture(viewportCanvas);

      this.textureWidth = viewportCanvas.width;
      this.textureHeight = viewportCanvas.height;
      const wUV = (rect.width * this.scaleFactor) / this.textureWidth;
      const hUV = (rect.height * this.scaleFactor) / this.textureHeight;
      this.uvScale = [wUV, hUV];

      this.initialX = rect.left;
      this.initialY = rect.top;
    }

    /* ----------------------------- */
    updateTexture(srcCanvas) {
      if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) {
        console.warn(
          "LiquidGL: Skipping texture update due to zero-size canvas"
        );
        return;
      }
      const gl = this.gl;
      if (!this.texture) this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
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
      if (this.canvas.width === 0 || this.canvas.height === 0) {
        return;
      }

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
        const rect = this.el.getBoundingClientRect();
        const snapshotRect = this.snapshotTarget.getBoundingClientRect();

        const docX = rect.left - snapshotRect.left;
        const docY = rect.top - snapshotRect.top + this.scrollOffset;

        const leftUV = (docX * this.scaleFactor) / this.textureWidth;
        const topUV = (docY * this.scaleFactor) / this.textureHeight;
        gl.uniform4f(this.uBounds, leftUV, topUV, ...this.uvScale);
      }

      gl.uniform1f(this.uRefraction, this.options.refraction);
      gl.uniform1f(this.uBevelDepth, this.options.bevelDepth);
      gl.uniform1f(this.uBevelWidth, this.options.bevelWidth);
      gl.uniform1f(this.uFrost, this.options.frost);

      const styleNow = window.getComputedStyle(this.el);
      const brRaw = styleNow.borderTopLeftRadius.split(" ")[0];
      const isPercent = brRaw.trim().endsWith("%");
      let brPx;
      const rectNow = this.el.getBoundingClientRect();
      if (isPercent) {
        const pct = parseFloat(brRaw);
        brPx = (Math.min(rectNow.width, rectNow.height) * pct) / 100;
      } else {
        brPx = parseFloat(brRaw);
      }

      const dprNow = Math.min(1, window.devicePixelRatio || 1);
      const maxAllowed = Math.min(rectNow.width, rectNow.height) * dprNow * 0.5;
      const newRadius = Math.min(brPx * dprNow, maxAllowed);
      this.radius = newRadius;
      gl.uniform1f(this.uRadius, this.radius);

      const elapsedTime = (Date.now() - this.startTime) / 1000.0;
      gl.uniform1f(this.uTime, elapsedTime);
      gl.uniform1i(this.uSpecular, this.options.specular ? 1 : 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    /* ----------------------------- */
    _bindTiltHandlers() {
      if (this._tiltHandlersBound) return;

      const getMaxTilt = () =>
        Number.isFinite(this.options.tiltFactor) ? this.options.tiltFactor : 5;

      const applyTilt = (clientX, clientY) => {
        if (!this._tiltInteracting) {
          this._tiltInteracting = true;
          this.el.style.transition =
            "transform 0.12s cubic-bezier(0.33,1,0.68,1)";
        }
        const rect = this._initialTiltRect || this.el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const pctX = dx / (rect.width / 2);
        const pctY = dy / (rect.height / 2);
        const maxTilt = getMaxTilt();
        const rotY = pctX * maxTilt;
        const rotX = -pctY * maxTilt;
        this.el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      };

      this._onMouseEnter = () => {
        this._tiltInteracting = false;
      };
      this._onTouchStart = (e) => {
        this._tiltInteracting = false;
        if (e.touches && e.touches.length === 1) {
          const t = e.touches[0];
          applyTilt(t.clientX, t.clientY);
        }
      };

      this._onMouseMove = (e) => applyTilt(e.clientX, e.clientY);
      this._onMouseLeave = () => {
        this.el.style.transition =
          "transform 0.4s cubic-bezier(0.33, 1, 0.68, 1)";
        this.el.style.transform =
          "perspective(800px) rotateX(0deg) rotateY(0deg)";
      };

      this.el.addEventListener("mouseenter", this._onMouseEnter, {
        passive: true,
      });
      this.el.addEventListener("mousemove", this._onMouseMove, {
        passive: true,
      });
      this.el.addEventListener("mouseleave", this._onMouseLeave, {
        passive: true,
      });
      this.el.addEventListener("touchstart", this._onTouchStart, {
        passive: true,
      });
      this.el.addEventListener("touchmove", this._onTouchMove, {
        passive: true,
      });
      this.el.addEventListener("touchend", this._onTouchEnd, { passive: true });

      this._tiltHandlersBound = true;
    }

    /* ----------------------------- */
    _unbindTiltHandlers() {
      if (!this._tiltHandlersBound) return;
      this.el.removeEventListener("mouseenter", this._onMouseEnter);
      this.el.removeEventListener("mousemove", this._onMouseMove);
      this.el.removeEventListener("mouseleave", this._onMouseLeave);
      this.el.removeEventListener("touchstart", this._onTouchStart);
      this.el.removeEventListener("touchmove", this._onTouchMove);
      this.el.removeEventListener("touchend", this._onTouchEnd);
      this._tiltHandlersBound = false;
      this.el.style.transform = "";
    }

    /* ----------------------------- */
    setTilt(enabled) {
      this.options.tilt = !!enabled;
      if (this.options.tilt) {
        this._bindTiltHandlers();
      } else {
        this._unbindTiltHandlers();
      }
    }
  }

  /* --------------------------------------------------
   *  Public API
   * ------------------------------------------------*/
  window.LiquidGL = function (userOptions = {}) {
    const defaults = {
      target: ".selector",
      snapshot: "body",
      refraction: 0.01,
      bevelDepth: 0.08,
      bevelWidth: 0.15,
      frost: 0,
      shadow: true,
      specular: true,
      reveal: "fade",
      tilt: false,
      tiltFactor: 5,
      on: {},
    };
    const options = { ...defaults, ...userOptions };

    const targetEl = document.querySelector(options.target);
    if (!targetEl) {
      console.warn(`LiquidGL: Target element "${options.target}" not found.`);
      return;
    }

    if (targetEl._LiquidGL) {
      console.warn(
        `LiquidGL: Already initialized on target element "${options.target}".`
      );
      return;
    }

    targetEl._LiquidGL = new LiquidGL(targetEl, options);
    return targetEl._LiquidGL;
  };
})();
