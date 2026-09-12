/**
 * The face on an identity disc: the photo if there is one, the initial if not.
 *
 * Four discs draw the signed-in person — the header chip on every marketing
 * page, the partner dashboard's rail, the console's own badge and a row in the
 * console's user table — and the profile page draws two more. Before this they
 * all drew a letter, so a photo somebody had chosen and saved was visible on
 * exactly one screen: the form they chose it on.
 *
 * It takes the name and the photo rather than an `Account`, for the same reason
 * `initial()` takes `{ name }`: the console draws this disc for a *directory
 * row*, and the profile form draws it for a **draft** that has not been saved
 * and is not an account at all. A component that insisted on an `Account` would
 * be reimplemented at the two sites that do not have one, which is how a
 * photo-or-letter rule ends up existing three times and disagreeing twice.
 *
 * **Only a picture this site made is drawn.** Photos now come back from the
 * server, and the server may hold an address on somebody else's host; see
 * `picture.ts` for why that is kept and shown as the initial rather than
 * fetched.
 *
 * The disc keeps its own size and colours; this only decides what goes in it.
 */
import { initial } from './context';
import { isPicture } from './picture';

export function Face({ name, photo }: { name: string; photo: string }) {
  /* `alt=""` and no `aria-hidden` of its own: every disc that renders this is
     already `aria-hidden`, and the name is beside it in real text. A photo of
     somebody captioned with their own name is the definition of decorative. */
  return isPicture(photo) ? (
    <img className="avatar-face" src={photo} alt="" />
  ) : (
    <>{initial({ name })}</>
  );
}
