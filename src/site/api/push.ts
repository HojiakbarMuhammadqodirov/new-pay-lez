/**
 * Browser push — the four reminders a player can switch on, this side of it.
 *
 * Three facts decide what the profile's switch can honestly be, and each is a
 * different sentence rather than a disabled control:
 *
 *   * **this browser cannot** — no service worker or no Push API (an iPhone
 *     shows notifications only for a site added to the home screen);
 *   * **this server is not sending** — `GET /v1/push/web-key` answers `null`
 *     while `PAYLEZ_PUSH` is not live, and a switch that subscribes to nothing
 *     would be a picture of a control;
 *   * **the reader said no** — `Notification.permission === 'denied'` cannot be
 *     asked again from a page; only the browser's own settings undo it.
 *
 * The worker is `public/sw.js` and shows the push; nothing here caches.
 */
import { call } from './client';

/** One switch per push, by the server's API name (`domain/reminders.ts`). */
export interface NotificationPrefs {
  dailyGameReminder: boolean;
  energyFull: boolean;
  referralReward: boolean;
  streakAtRisk: boolean;
}

/** The order the profile lists them in. */
export const NOTIFICATION_KINDS = ['dailyGameReminder', 'streakAtRisk', 'energyFull', 'referralReward'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationPrefs = () => call<NotificationPrefs>('/v1/me/notification-prefs');

export const setNotificationPrefs = (patch: Partial<NotificationPrefs>) =>
  call<NotificationPrefs>('/v1/me/notification-prefs', { method: 'PATCH', body: patch });

export const webPushKey = () => call<{ publicKey: string | null }>('/v1/push/web-key');

const saveSubscription = (subscription: PushSubscription) =>
  call<{ ok: true }>('/v1/push-tokens', {
    method: 'POST',
    body: {
      platform: 'web',
      token: JSON.stringify(subscription.toJSON()),
      /* Where the reader is, so six o'clock is *their* six o'clock. */
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const pushPermission = (): NotificationPermission =>
  pushSupported() ? Notification.permission : 'denied';

/** The key the browser wants, as bytes: the server hands out base64url. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (key.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Ask, subscribe, and tell the server where to send. Resolves to the permission
 * the reader ended on, so the caller can draw "blocked" rather than "failed"
 * when the answer was no.
 *
 * An existing subscription made with a *different* key is dropped first: a
 * server whose VAPID pair was rotated cannot reach it, and the browser refuses
 * to subscribe twice to one site with two keys.
 */
export async function subscribe(publicKey: string): Promise<NotificationPermission> {
  const permission =
    Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') return permission;

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const wanted = keyBytes(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  const current = subscription?.options.applicationServerKey;
  if (subscription && current && !sameBytes(new Uint8Array(current), wanted)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  await saveSubscription(subscription);
  return permission;
}

/**
 * Re-tell the server about a subscription this browser already holds — on a
 * profile visit, so a reader who travelled is reminded at six where they are
 * now. Quiet on any failure: it is bookkeeping, not something to report.
 */
export async function refreshSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await saveSubscription(subscription);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
