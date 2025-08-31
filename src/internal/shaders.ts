export const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main(){
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const fragmentShader = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform vec2  u_textureResolution;
uniform vec4  u_bounds;
uniform float u_refraction;
uniform float u_bevelDepth;
uniform float u_bevelWidth;
uniform float u_frost;
uniform float u_radius;
uniform float u_time;
uniform bool  u_specular;
uniform float u_revealProgress;
uniform int   u_revealType;
uniform float u_tiltX;
uniform float u_tiltY;
uniform float u_magnify;

float udRoundBox( vec2 p, vec2 b, float r ) {
  return length(max(abs(p)-b+r,0.0))-r;
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float edgeFactor(vec2 uv, float radius_px){
  vec2 p_px = (uv - 0.5) * u_resolution;
  vec2 b_px = 0.5 * u_resolution;
  float d = -udRoundBox(p_px, b_px, radius_px);
  float bevel_px = u_bevelWidth * min(u_resolution.x, u_resolution.y);
  return 1.0 - smoothstep(0.0, bevel_px, d);
}
void main(){
  vec2 p = v_uv - 0.5;
  p.x *= u_resolution.x / u_resolution.y;

  float edge = edgeFactor(v_uv, u_radius);
  float min_dimension = min(u_resolution.x, u_resolution.y);
  float offsetAmt = (edge * u_refraction + pow(edge, 10.0) * u_bevelDepth);
  float centreBlend = smoothstep(0.15, 0.45, length(p));
  vec2 offset = normalize(p) * offsetAmt * centreBlend;

  float tiltRefractionScale = 0.05;
  vec2 tiltOffset = vec2(tan(radians(u_tiltY)), -tan(radians(u_tiltX))) * tiltRefractionScale;

  vec2 localUV = (v_uv - 0.5) / u_magnify + 0.5;
  vec2 flippedUV = vec2(localUV.x, 1.0 - localUV.y);
  vec2 mapped = u_bounds.xy + flippedUV * u_bounds.zw;
  vec2 refracted = mapped + offset - tiltOffset;

  float oob = max(max(-refracted.x, refracted.x - 1.0), max(-refracted.y, refracted.y - 1.0));
  float blend = 1.0 - smoothstep(0.0, 0.01, oob);
  vec2 sampleUV = mix(mapped, refracted, blend);

  vec4 baseCol = texture2D(u_tex, mapped);

  vec2 texel = 1.0 / u_textureResolution;
  vec4 refrCol;

  if (u_frost > 0.0) {
      float radius = u_frost * 4.0;
      vec4 sum = vec4(0.0);
      const int SAMPLES = 16;
      for (int i = 0; i < SAMPLES; i++) {
          float angle = random(v_uv + float(i)) * 6.283185;
          float dist = sqrt(random(v_uv - float(i))) * radius;
          vec2 offset = vec2(cos(angle), sin(angle)) * texel * dist;
          sum += texture2D(u_tex, sampleUV + offset);
      }
      refrCol = sum / float(SAMPLES);
  } else {
      refrCol = texture2D(u_tex, sampleUV);
      refrCol += texture2D(u_tex, sampleUV + vec2( texel.x, 0.0));
      refrCol += texture2D(u_tex, sampleUV + vec2(-texel.x, 0.0));
      refrCol += texture2D(u_tex, sampleUV + vec2(0.0,  texel.y));
      refrCol += texture2D(u_tex, sampleUV + vec2(0.0, -texel.y));
      refrCol /= 5.0;
  }

  if (refrCol.a < 0.1) {
      refrCol = baseCol;
  }

  float diff = clamp(length(refrCol.rgb - baseCol.rgb) * 4.0, 0.0, 1.0);
  float antiHalo = (1.0 - centreBlend) * diff;
  vec4 final = refrCol;

  vec2 p_px = (v_uv - 0.5) * u_resolution;
  vec2 b_px = 0.5 * u_resolution;
  float dmask = udRoundBox(p_px, b_px, u_radius);
  float inShape = 1.0 - step(0.0, dmask);

  if (u_specular) {
    vec2 lp1 = vec2(sin(u_time*0.2), cos(u_time*0.3))*0.6 + 0.5;
    vec2 lp2 = vec2(sin(u_time*-0.4+1.5), cos(u_time*0.25-0.5))*0.6 + 0.5;
    float h = 0.0;
    h += smoothstep(0.4,0.0,distance(v_uv, lp1))*0.1;
    h += smoothstep(0.5,0.0,distance(v_uv, lp2))*0.08;
    final.rgb += h;
  }

  if (u_revealType == 1) {
      final.rgb *= u_revealProgress;
      final.a  *= u_revealProgress;
  }

  final.rgb *= inShape;
  final.a   *= inShape;
  gl_FragColor = final;
}`;

