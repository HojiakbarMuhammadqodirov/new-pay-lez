/**
 * Animated great-circle routes, drawn as camera-facing ribbons.
 *
 * All arcs live in a single merged geometry — one draw call for the whole
 * flight network. Both the thickness (WebGL has no usable `linewidth`) and the
 * animation are resolved on the GPU, so the CPU only ever updates one `uTime`
 * uniform per frame.
 */

export const routesVertexShader = /* glsl */ `
  attribute vec3  aTangent; // direction along the arc at this point
  attribute float aSide;    // -1 / +1 — which rail of the ribbon
  attribute float aT;       // 0..1 position along this route
  attribute float aPhase;   // per-route animation offset
  attribute float aSpeed;   // per-route speed multiplier

  uniform float uTime;
  uniform float uWidth;

  varying float vT;
  varying float vHead;
  varying float vSide;

  void main() {
    vT = aT;
    vSide = aSide;
    // Constant across every vertex of a route, so it never interpolates.
    vHead = fract(uTime * aSpeed + aPhase);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Expand perpendicular to both the arc and the view direction, so the
    // ribbon always presents its full width to the camera.
    vec3 tangentView = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
    vec3 viewDirection = normalize(-mvPosition.xyz);

    vec3 offset = cross(tangentView, viewDirection);
    float len = length(offset);
    // Degenerate only when the arc points straight at the camera; any fixed
    // perpendicular is correct there because the ribbon is edge-on anyway.
    offset = len > 1e-4 ? offset / len : vec3(1.0, 0.0, 0.0);

    mvPosition.xyz += offset * aSide * uWidth * 0.5;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const routesFragmentShader = /* glsl */ `
  uniform vec3  uPrimary;
  uniform float uTrailLength;
  uniform float uTrailCutoff;
  uniform float uHeadSize;
  uniform float uHeadIntensity;
  uniform float uTrailIntensity;
  uniform float uBaseOpacity;
  uniform float uOpacity;
  uniform float uEdgeSoftness;

  varying float vT;
  varying float vHead;
  varying float vSide;

  void main() {
    // Signed distance behind the head, wrapped into [0, 1).
    float d = vHead - vT;
    d += step(d, 0.0);

    // Exponential trail, hard-faded before it can wrap onto its own head.
    float trail = exp(-d / uTrailLength);
    trail *= 1.0 - smoothstep(uTrailCutoff * 0.55, uTrailCutoff, d);

    // Small saturated core at the leading edge.
    float head = 1.0 - smoothstep(0.0, uHeadSize, d);

    float intensity = uBaseOpacity
                    + trail * uTrailIntensity
                    + head * uHeadIntensity;

    // Feather the ribbon's long edges. Without this a thick line reads as a
    // hard-edged rectangle; with it, it reads as a stroke.
    intensity *= 1.0 - smoothstep(1.0 - uEdgeSoftness, 1.0, abs(vSide));

    // Clamp keeps the accent hue exact; bloom provides the flare.
    intensity = clamp(intensity, 0.0, 1.0) * uOpacity;

    gl_FragColor = vec4(uPrimary * intensity, 1.0);

    #include <colorspace_fragment>
  }
`;
