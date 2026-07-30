import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Group,
  MathUtils,
  NoToneMapping,
  type BufferGeometry,
  type PerspectiveCamera,
} from 'three';
import { COLORS } from '../../components/GlobeHero/config';
import {
  buildButtons,
  buildDpad,
  buildGrips,
  buildLightBar,
  buildShell,
  buildStickRings,
  buildStickWells,
  buildSticks,
  buildTouchpad,
  buildTriggers,
} from './controllerGeometry';

/**
 * Fixed 3/4 view from above, facing right.
 *
 * `rotation.x` negative tips the top edge away so the face is seen from above.
 * `rotation.y` is what sets which way it points: the face normal starts at +Z,
 * and rotating by +y swings it toward +X, so a positive value aims the
 * controller to the right. (It was negative before, which aimed it left.)
 * The z-roll is mirrored to match.
 */
const VIEW_ANGLE: [number, number, number] = [-0.46, 0.5, -0.1];

/**
 * Body palette, per theme.
 *
 * On the dark page the shell is near-black with just enough teal to sit in the
 * palette. On the light one it inverts to a pale moulding — a black object on
 * paper reads as a hole punched in the page, and the neon rim light it was lit
 * with has nothing to separate it from.
 *
 * `metalness` is a *multiplier* on each material's own value rather than a flat
 * override: there is no environment map here, so a metallic surface reflects
 * only the rig's direct lights and otherwise goes black. That is exactly what
 * gives the dark shell its depth, and exactly what would turn the pale one to
 * mud, so the light tone dials it back instead of restating every material.
 */
const TONE = {
  glow: {
    shell: '#0f1618',
    control: '#182225',
    well: '#0a1113',
    touchpad: '#0c1416',
    metalness: 1,
    ambient: 0.55,
    key: 2.4,
    rim: 2.8,
  },
  ink: {
    shell: '#dde7e4',
    control: '#c3d3cf',
    well: '#adbfbb',
    touchpad: '#c9d7d4',
    metalness: 0.3,
    ambient: 0.72,
    key: 1.7,
    rim: 1.6,
  },
} as const;

type ControllerTone = keyof typeof TONE;

/**
 * Radius of a sphere enclosing the whole model — half the diagonal of its
 * ~3.9 x 2.6 bounding box, which stays valid whatever the fixed rotation is.
 */
const MODEL_RADIUS = 2.35;

/** Breathing room around the model, so the glow is never clipped either. */
const FIT_MARGIN = 1.12;

/**
 * Pulls the camera back far enough that the model always fits.
 *
 * A fixed camera distance only works at one aspect ratio: `fov` is vertical, so
 * a canvas narrower than it is tall crops the model's sides — which is exactly
 * what produced the hard vertical edges. Fitting against whichever axis is
 * tighter makes clipping impossible at any size.
 */
function FitCamera() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useLayoutEffect(() => {
    const aspect = width / Math.max(height, 1);
    const halfVertical = MathUtils.degToRad(camera.fov) / 2;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
    const limiting = Math.min(halfVertical, halfHorizontal);

    camera.position.set(0, 0, (MODEL_RADIUS / Math.sin(limiting)) * FIT_MARGIN);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [camera, width, height]);

  return null;
}

interface SceneProps {
  primaryColor: string;
  tone: ControllerTone;
}

function ControllerModel({ primaryColor, tone }: SceneProps) {
  const group = useRef<Group>(null);
  const skin = TONE[tone];

  const parts = useMemo(
    () => ({
      shell: buildShell(),
      grips: buildGrips(),
      triggers: buildTriggers(),
      wells: buildStickWells(),
      sticks: buildSticks(),
      dpad: buildDpad(),
      buttons: buildButtons(),
      touchpad: buildTouchpad(),
      lightBar: buildLightBar(),
      stickRings: buildStickRings(),
    }),
    [],
  );

  useEffect(
    () => () => {
      for (const geometry of Object.values(parts) as BufferGeometry[]) {
        geometry.dispose();
      }
    },
    [parts],
  );

  // Position only: the brief calls for a fixed viewing angle, so nothing here
  // touches rotation. The drift just stops it reading as a flat still image.
  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    const t = state.clock.elapsedTime;
    node.position.y = Math.sin(t * 0.6) * 0.055;
    node.position.x = Math.sin(t * 0.41) * 0.03;
  });

  return (
    <group ref={group} rotation={VIEW_ANGLE}>
      {/* Shell and grips share a material so the body reads as one moulding. */}
      <mesh geometry={parts.shell}>
        <meshStandardMaterial
          color={skin.shell}
          metalness={0.42 * skin.metalness}
          roughness={0.3}
        />
      </mesh>
      <mesh geometry={parts.grips}>
        <meshStandardMaterial
          color={skin.shell}
          metalness={0.42 * skin.metalness}
          roughness={0.34}
        />
      </mesh>
      <mesh geometry={parts.triggers}>
        <meshStandardMaterial
          color={skin.shell}
          metalness={0.5 * skin.metalness}
          roughness={0.26}
        />
      </mesh>

      {/* Controls: a step deeper than the shell and slightly rougher, so they
          read as inset parts rather than more of the same moulding. */}
      <mesh geometry={parts.wells}>
        <meshStandardMaterial
          color={skin.well}
          metalness={0.3 * skin.metalness}
          roughness={0.55}
        />
      </mesh>
      <mesh geometry={parts.sticks}>
        <meshStandardMaterial
          color={skin.control}
          metalness={0.35 * skin.metalness}
          roughness={0.42}
        />
      </mesh>
      <mesh geometry={parts.dpad}>
        <meshStandardMaterial
          color={skin.control}
          metalness={0.4 * skin.metalness}
          roughness={0.34}
        />
      </mesh>
      <mesh geometry={parts.buttons}>
        <meshStandardMaterial
          color={skin.control}
          metalness={0.45 * skin.metalness}
          roughness={0.22}
          emissive={primaryColor}
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh geometry={parts.touchpad}>
        <meshStandardMaterial
          color={skin.touchpad}
          metalness={0.55 * skin.metalness}
          roughness={0.18}
        />
      </mesh>

      {/* Emissive: pure light, picked up by bloom. */}
      <mesh geometry={parts.lightBar}>
        <meshBasicMaterial color={primaryColor} toneMapped={false} />
      </mesh>
      <mesh geometry={parts.stickRings}>
        <meshBasicMaterial color={primaryColor} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Lighting rig.
 *
 * Deliberately lights-only — no environment map. An HDRI would mean either a
 * third-party request or a bundled asset, and this reads well enough from a
 * three-point rig: white key from the upper right (matching the camera angle),
 * teal rim from behind to separate it from the background, and a soft teal
 * bounce from below so the underside of the grips never goes solid black.
 */
function Rig({ primaryColor, tone }: SceneProps) {
  const skin = TONE[tone];

  return (
    <>
      <ambientLight intensity={skin.ambient} />
      <directionalLight position={[4, 5.5, 4]} intensity={skin.key} />
      <directionalLight
        position={[-3, 1.5, -4]}
        intensity={skin.rim}
        color={primaryColor}
      />
      <pointLight
        position={[0, -3, 2.5]}
        intensity={14 * skin.metalness}
        distance={12}
        color={primaryColor}
      />
      <pointLight position={[3.5, 1, 3]} intensity={8} distance={11} color="#ffffff" />
    </>
  );
}

interface Controller3DProps {
  primaryColor?: string;
  /** Body palette and rig. `'ink'` for a light page. */
  tone?: ControllerTone;
}

/**
 * The controller, in its own canvas.
 *
 * Deliberately **no post-processing pass**. A composer renders through its own
 * render targets and composites them back opaque, which paints a solid
 * rectangle behind the model — the visible box the design had. The neon glow
 * instead comes from a CSS `drop-shadow` on the canvas, which follows the
 * rendered alpha and so hugs the controller's silhouette rather than outlining
 * the canvas.
 *
 * Rendering is gated on visibility: with the globe already holding a WebGL
 * context on the same page, a second one spinning away off-screen is pure
 * waste. `frameloop="never"` parks it until it scrolls into view.
 */
export const Controller3D = memo(function Controller3D({
  primaryColor = COLORS.primary,
  tone = 'glow',
}: Controller3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '15% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="controller-3d" ref={host} aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: NoToneMapping,
        }}
        // Distance is set by `FitCamera` from the canvas aspect; this is only
        // the starting value before the first layout pass.
        camera={{ position: [0, 0, 8], fov: 32 }}
        frameloop={visible ? 'always' : 'never'}
        // Belt and braces on transparency: `alpha: true` already implies a
        // clear alpha of 0, but stating it rules out the canvas painting a
        // rectangle behind the model.
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        <FitCamera />
        <Rig primaryColor={primaryColor} tone={tone} />
        <ControllerModel primaryColor={primaryColor} tone={tone} />
      </Canvas>
    </div>
  );
});
