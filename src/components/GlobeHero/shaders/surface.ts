/**
 * Globe body.
 *
 * Doubles as the depth occluder that makes borders and routes disappear behind
 * the planet. Lighting is analytic (one soft key + ambient wash + fresnel rim)
 * so we need no real lights, no shadow maps and no normal matrices beyond the
 * one three.js already provides.
 */

export const surfaceVertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  void main() {
    vNormalView = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const surfaceFragmentShader = /* glsl */ `
  uniform vec3  uBackground;
  uniform vec3  uPrimary;
  uniform vec3  uLightDirection;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform float uAmbient;

  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  void main() {
    vec3 N = normalize(vNormalView);
    vec3 V = normalize(-vViewPosition);
    vec3 L = normalize(uLightDirection);

    // Soft rim: peaks exactly on the silhouette, zero across the face.
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uRimPower);

    // Soft ambient: half-lambert, never fully dark, never a hard terminator.
    float wrapped = dot(N, L) * 0.5 + 0.5;

    /*
     * Lerp toward the accent rather than adding it to the background.
     *
     * Addition can only ever brighten, which is the right model on near-black
     * and useless on paper — every layer would wash out to white. The mix is
     * the same picture on a dark page (where uBackground is ~0, so it *is*
     * addition) and darkens correctly on a light one: one shader, both themes.
     *
     * (No backticks in here — the whole shader is a template literal.)
     */
    float amount = clamp(uAmbient * wrapped + uRimStrength * fresnel, 0.0, 1.0);

    gl_FragColor = vec4(mix(uBackground, uPrimary, amount), 1.0);

    #include <colorspace_fragment>
  }
`;
