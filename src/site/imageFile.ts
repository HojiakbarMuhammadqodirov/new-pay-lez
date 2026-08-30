/**
 * A picked image file as a small square data URL.
 *
 * Lifted out of `profile.tsx`, where it was `toAvatar`, when the venue's logo
 * needed the same thing. Two screens take an image from a file input and both
 * have the same problem: the file the picker hands over is three or four
 * megabytes of phone camera, and an origin has about five megabytes of
 * `localStorage` for everything on this site put together. Neither screen wants
 * the file — they want a picture small enough to keep.
 *
 * Cover-cropped rather than squashed, because a portrait photo scaled to a
 * square makes a face narrow and a wordmark illegible, and every use of this is
 * drawn in a square or a disc.
 *
 * JPEG rather than PNG because the common input is a photograph, and `0.82` is
 * where the artefacts stop being visible at these sizes. A logo with hard edges
 * is the case that argues for PNG, and it loses: the same file at PNG is
 * routinely four times the bytes, and these are stored in a quota measured for
 * the whole site.
 *
 * Rejects by resolving to `null` rather than throwing. The only realistic
 * failure is a file that is not an image, and the honest response to that is to
 * leave whatever was already chosen alone.
 */
export async function toSquareDataUrl(file: File, px: number): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
    });
    image.src = url;
    if (!(await loaded)) return null;

    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      px,
      px,
    );
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    /* Always, including on the failure paths above: an object URL is a live
       reference to the file and is not collected while it exists. */
    URL.revokeObjectURL(url);
  }
}

/**
 * How big a stored profile photo is, per side.
 *
 * 192 rather than the 92 the form draws it at, because the same data URL is the
 * only copy and a retina screen reads it at twice the CSS size.
 */
export const AVATAR_PX = 192;

/**
 * And a venue's logo, which is drawn larger than a profile photo is.
 *
 * It appears at 5.5rem in the listing preview and is the mark a customer
 * recognises the venue by in the app, so it is given more to work with than a
 * face in a chip. The help text asks for 512 and this stores 256: what the form
 * is asking for is a source big enough to survive the crop, not the size we
 * intend to keep.
 */
export const LOGO_PX = 256;
