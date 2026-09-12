/**
 * Whether a stored picture is one this site may draw.
 *
 * Every photo and logo the site produces itself is a `data:` URL — `imageFile.ts`
 * crops the file and keeps the bytes — so drawing one costs nothing and asks
 * nobody. What the *server* holds is wider: the Base44 import brought six of the
 * eight venue images over as `https://base44.app/…` addresses, and another
 * client may one day write its own. An `<img src>` pointed at either is a
 * request to somebody else's server from a site whose rule is that it makes
 * none (root `CLAUDE.md`, "No third-party runtime requests").
 *
 * So such a value is **kept and not drawn**. It still counts as answered — the
 * listing has a logo, the server says so, and a readiness meter that called it
 * missing would be calling the server wrong — it still round-trips untouched,
 * because a write only ever sends a picture this file says is one, and the disc
 * shows the initial in its place.
 */
export const isPicture = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^data:image\//i.test(value);
