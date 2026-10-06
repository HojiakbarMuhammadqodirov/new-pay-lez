---
paths:
  - "src/components/PaylezIntro/**"
---

# The cold-open (`PaylezIntro`)

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

- **The cold-open is the app icon opening into the name.** `public/logo/logo-dark.jpg`
  is a lowercase **p** in the accent on near-black — the mark on a phone's home
  screen, and also exactly the first letter of the wordmark. So `PaylezIntro` is
  a dark engraved surface with one light crossing it: the light finds the p, the
  p holds for a beat, then it travels into its place in the lockup and shrinks to
  type size while the light carries on and uncovers `aylez` behind it. Three
  seconds, canvas 2D — not WebGL, because this renders *over* the landing page
  and the landing page already spends the document's one WebGL context on the
  globe.

  **This is not the tile coming back.** There is still no mark *beside* the
  wordmark; the header, the footer and the dashboard rail have never had one, and
  the first version of this screen opened on a square tile next to the name and
  was introducing a lockup the product does not use. The distinction is that this
  mark is never beside the name — it **is** the name's first letter, from the
  same face at the same weight, and it ends up sitting *in* the word. The final
  frame is the wordmark and nothing else.

  Six versions preceded it and two are worth naming so nobody builds them again.
  **Three seconds of particles gathering into the word** was the most work of the
  lot and the worst result: a particle field assembling into type is a *tech
  demo*, and a tech demo in front of a payments product reads as a studio showing
  off rather than as a brand arriving. **Six letters rising out of focus** is the
  other — a list of events rather than a gesture.

  Seven rules travel with it:

  - **Nothing is loading, so nothing may claim to measure a load.** The bundle
    finished before the first frame. The hairline under the word is an underline
    arriving with the name, not a meter. The one thing that *does* deplete is the
    rule under the Skip, and that is honest precisely because it measures this
    sequence's own length — a real number `config.ts` owns.
  - **A skippable sequence is one you can actually skip.** The Skip used to
    appear with the hairline, two thirds of the way through a 1.9-second screen,
    which left about a second to notice a control in the corner, move to it and
    press it. It arrives at 400ms now and is pressable for ~2.5s, and
    `npm run verify` holds that floor.
  - **`markHome` is measured, not guessed.** It is the p at the *word's* size and
    the word's own origin — which, because p is the first glyph, is exactly where
    `fillText('paylez')` puts its p. The travelling mark therefore lands on the
    word's own first letter to the pixel, and the hand-off is a crossfade with
    nothing to reconcile.
  - **The word is a high-water mark, and that is what makes the pointer safe.**
    The light is a blend of the scripted path and the cursor, so a hand sweeping
    right and then left would *un-write* the wordmark. Tracking the furthest the
    light has ever reached means a lit letter stays lit, and with nothing left to
    protect the pointer can have the light from the first frame.
  - **The site is uncovered *while* the screen is leaving.** `onComplete` fires
    at `exit.delay`, not at the end. This ground is `--bg`, the *page's* ground,
    so an overlay fading off a page still hidden behind `data-intro='running'`
    fades onto a rectangle of the colour it just removed.
  - **The engraving stops where the brand is.** Everything is composited
    additively on black, so nothing occludes anything — a lattice drawn over the
    letters read as graph paper laid on the brand rather than as the surface it
    is cut into. The ticks fade toward the ink box rather than clipping at it.
  - **The light's reach has a ceiling in pixels.** Its radius is a fraction of
    the viewport diagonal, which is the right look and the wrong cost curve: the
    pool is alpha-composited every frame, so its price is the *square* of the
    radius, and uncapped at 1920×1080 on a 2× display it measured 18ms a frame
    against `StubDrift`'s 7ms. See `light.maxRadius` and `lattice.maxSpan`.

  Two construction traps, both of which cost a debugging session:

  - **`onComplete` is read through a ref.** The caller passes an inline arrow, so
    it is a new function on every render of the page shell — and the shell
    re-renders during the intro for ordinary reasons. Depending on it put
    `reveal` and `finish` in the draw effect's dependency array, which tore the
    effect down and ran it again *mid-sequence*: the clock back to -1, the light
    back to the left edge, the reveal back to nothing. The symptom was a screen
    that never got as far as the wordmark.
  - **`document.fonts.load` is wrapped in `try`.** It is specified to reject on a
    font it cannot parse, but engines have thrown synchronously — and a throw
    escapes the promise executor and rejects the promise the whole sequence hangs
    off, which is a permanently black page rather than a worse-looking intro.

