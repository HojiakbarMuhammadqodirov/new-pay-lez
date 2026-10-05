/**
 * Where the "Get the app" popup sends people.
 *
 * Kept apart from the component so `scripts/verify-geo.ts` can check the
 * links and the QR codes drawn from them without a DOM.
 */

/** The Android package is `com.paylez.paylez` (iOS is `com.paylez.payles`). */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.paylez.paylez';

/**
 * The App Store listing, or `null` while there is none. Null draws the iPhone
 * card as "Coming soon", with a placeholder in place of a QR code and a
 * disabled button. Once the app is live, set this to its
 * `https://apps.apple.com/…/id<number>` URL and nothing else changes.
 */
export const APP_STORE_URL: string | null = null;
