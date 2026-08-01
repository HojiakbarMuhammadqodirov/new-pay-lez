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
 * Fixed 3/4 views from above, one per facing.
 *
 * `rotation.x` negative tips the top edge away so the face is seen from above.
 * `rotation.y` is what sets which way it points: the face normal starts at +Z,
 * and rotating by +y swings it toward +X, so a positive value aims the
 * controller to the right and a negative one to the left. The z-roll mirrors
 * with it — a roll that leans *into* the turn on one side leans out of it on
 * the other, and the model looks like it is falling over.
 */
const VIEW_ANGLE: Record<ControllerFacing, [number, number, number]> = {
  right: [-0.46, 0.5, -0.1],
  left: [-0.46, -0.5, 0.1],
};

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
/**
 * The four face buttons on a light page, clockwise from the top.
 *
 * The one place on the site that is deliberately not two colours. Everywhere
 * else a third hue is a bug (see CLAUDE.md); here the four-colour face is what a
 * gamepad *is* — it is the reason anyone recognises the silhouette — and on a
 * pale moulding under white light it is the only colour on the object. The
 * order matches `buildButtons()`: top, right, bottom, left.
 *
 * Deep rather than primary: saturated at this size on a light shell reads as
 * plastic tat, and these still have to sit on a page whose own accent is a cyan.
 */
const BUTTON_COLORS = ['#e0a800', '#d4453f', '#2f9e5f', '#3560c9'] as const;

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
    /**
     * `null` means "use `primaryColor`".
     *
     * `lightColor` tints the rim and bounce lamps; `trim` is the light bar and
     * the rings round the sticks. On black both are the accent and that is the
     * whole look — a dark moulding separated from a dark page by its own neon.
     */
    lightColor: null,
    trim: null,
    /** Face buttons: one shared colour, lit by the accent. */
    buttons: null,
  },
  ink: {
    shell: '#dde7e4',
    control: '#c3d3cf',
    well: '#adbfbb',
    touchpad: '#c9d7d4',
    metalness: 0.3,
    ambient: 0.78,
    key: 1.9,
    rim: 1.5,
    /*
     * Neutral on paper, and this is the fix for what the accent was doing here.
     * A cyan rim light and a cyan bounce lamp on a pale grey moulding do not
     * read as neon — they read as a colour cast, a photograph with the white
     * balance wrong. The object goes back to being lit by white light, and the
     * colour on it comes from the buttons instead.
     */
    lightColor: '#ffffff',
    trim: '#9aa8ab',
    buttons: BUTTON_COLORS,
  },
} as const;

type ControllerTone = keyof typeof TONE;

/** Which way the face of the controller is turned. */
export type ControllerFacing = 'left' | 'right';

/**
 * Radius of a sphere enclosing the whole model, so it holds at any rotation.
 *
 * The geometry spans about x ±1.86, y -0.94..1.14, z -0.68..0.6; the corner of
 * that box is 2.28 from its centre, and the idle drift moves it another 0.06.
 * 2.35 is that, rounded up — and it is a *corner*, which no part of the model
 * actually reaches, so the fit below always has a little slack in hand.
 */
const MODEL_RADIUS = 2.35;

/**
 * Breathing room around the model, as a multiple of the fitted distance.
 *
 * The default leaves the controller sitting in air, which is right when it is
 * one element among three in the features stage. Callers that give the canvas a
 * column of its own pass something tighter — see the `fitMargin` prop.
 */
const FIT_MARGIN = 1.12;

/**
 * Pulls the camera back far enough that the model always fits.
 *
 * A fixed camera distance only works at one aspect ratio: `fov` is vertical, so
 * a canvas narrower than it is tall crops the model's sides — which is exactly
 * what produced the hard vertical edges. Fitting against whichever axis is
 * tighter makes clipping impossible at any size.
 */
function FitCamera({ margin }: { margin: number }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useLayoutEffect(() => {
    const aspect = width / Math.max(height, 1);
    const halfVertical = MathUtils.degToRad(camera.fov) / 2;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
    const limiting = Math.min(halfVertical, halfHorizontal);

    camera.position.set(0, 0, (MODEL_RADIUS / Math.sin(limiting)) * margin);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [camera, width, height, margin]);

  return null;
}

interface SceneProps {
  primaryColor: string;
  tone: ControllerTone;
}

function ControllerModel({
  primaryColor,
  tone,
  facing,
}: SceneProps & { facing: ControllerFacing }) {
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

  // `buttons` is an array and everything else is a single geometry, so this
  // flattens before disposing — without it the four face buttons would leak,
  // and a cast would have hidden that rather than caught it.
  useEffect(
    () => () => {
      for (const part of Object.values(parts) as Array<
        BufferGeometry | BufferGeometry[]
      >) {
        for (const geometry of Array.isArray(part) ? part : [part]) {
          geometry.dispose();
        }
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
    <group ref={group} rotation={VIEW_ANGLE[facing]}>
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
      {/* One mesh per button so each can take its own colour. On the dark page
          they all share the shell's control grey and are lit by the accent; on
          paper they are the four-colour face a gamepad is known by, and the
          only colour on the object. */}
      {parts.buttons.map((geometry, i) => (
        <mesh geometry={geometry} key={i}>
          <meshStandardMaterial
            color={skin.buttons ? skin.buttons[i] : skin.control}
            metalness={0.45 * skin.metalness}
            roughness={0.22}
            emissive={skin.buttons ? skin.buttons[i] : primaryColor}
            /* Barely lit on paper — enough to keep the colour from going muddy
               in the shaded half, not so much that four dots start glowing on a
               white page. The dark page has bloom to catch it, so it can afford
               more. */
            emissiveIntensity={skin.buttons ? 0.12 : 0.5}
          />
        </mesh>
      ))}
      <mesh geometry={parts.touchpad}>
        <meshStandardMaterial
          color={skin.touchpad}
          metalness={0.55 * skin.metalness}
          roughness={0.18}
        />
      </mesh>

      {/* On black these are pure light, picked up by bloom. On paper there is no
          bloom and nothing to glow against, so they become unlit trim — the
          moulding line a real controller has, rather than a strip of cyan. */}
      <mesh geometry={parts.lightBar}>
        <meshBasicMaterial color={skin.trim ?? primaryColor} toneMapped={false} />
      </mesh>
      <mesh geometry={parts.stickRings}>
        <meshBasicMaterial color={skin.trim ?? primaryColor} toneMapped={false} />
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
  // Neutral on paper: see the `lightColor` note in `TONE`. On black it is the
  // accent, which is what separates a dark object from a dark page.
  const lamp = skin.lightColor ?? primaryColor;

  return (
    <>
      <ambientLight intensity={skin.ambient} />
      <directionalLight position={[4, 5.5, 4]} intensity={skin.key} />
      <directionalLight position={[-3, 1.5, -4]} intensity={skin.rim} color={lamp} />
      <pointLight
        position={[0, -3, 2.5]}
        /*
         * The bounce off the ground. Scaled by `metalness` so it only really
         * exists on the dark shell, which is metal and needs something to
         * reflect; on the pale one it is a fill light, and 14 × 0.3 is about
         * right for keeping the underside of the grips off pure grey.
         */
        intensity={14 * skin.metalness}
        distance={12}
        color={lamp}
      />
      <pointLight position={[3.5, 1, 3]} intensity={8} distance={11} color="#ffffff" />
    </>
  );
}

interface Controller3DProps {
  primaryColor?: string;
  /** Body palette and rig. `'ink'` for a light page. */
  tone?: ControllerTone;
  /**
   * Which way it turns. On the features stage it faces right, into the page;
   * in the L-Earn hero it sits on the right of the grid, so it faces left —
   * back toward the headline it belongs to.
   */
  facing?: ControllerFacing;
  /**
   * How much air to leave around the model, as a multiple of the fitted camera
   * distance — so *smaller is bigger*. 1 would put the enclosing sphere exactly
   * on the frustum, and since that sphere is drawn around a box corner the
   * silhouette still clears it; below about 0.95 the grips start to crop.
   */
  fitMargin?: number;
  /** Extra class on the host, for callers that place it themselves. */
  className?: string;
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
  facing = 'right',
  fitMargin = FIT_MARGIN,
  className,
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
    <div
      className={className ? `controller-3d ${className}` : 'controller-3d'}
      ref={host}
      aria-hidden
    >
      <Canvas
        dpr={[1, 1.75]}
        /*
         * Measure the *layout* box, not the painted one.
         *
         * R3F sizes itself from `getBoundingClientRect()`, which includes CSS
         * transforms, and re-measures on scroll. The hover `scale(1.08)` below
         * therefore reads back as a canvas 8% wider than its box — and the
         * width it writes back is untransformed, so the next measurement finds
         * 1.08 x that, and the one after 1.08 x again. Scrolling while hovered
         * walked the canvas off the right of the screen in a few frames.
         *
         * `offsetSize` switches the measurement to `offsetWidth/offsetHeight`,
         * which transforms cannot touch, and the loop has no input.
         */
        resize={{ offsetSize: true }}
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
        <FitCamera margin={fitMargin} />
        <Rig primaryColor={primaryColor} tone={tone} />
        <ControllerModel primaryColor={primaryColor} tone={tone} facing={facing} />
      </Canvas>
    </div>
  );
});
