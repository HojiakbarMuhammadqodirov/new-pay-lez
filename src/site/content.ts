/**
 * Structure only — no copy.
 *
 * Everything a translator would never touch (icon names, anchors, the numbers
 * behind the count-up stats) lives here; every string lives in `i18n/`. The
 * arrays are index-aligned with their dictionary counterparts, so adding a
 * service or a feature means adding one entry in each place and the compiler
 * catches the half-done version.
 */

import type { IconName } from './icons';

/** Assistant is deliberately absent: it is the floating button, not a nav item. */
export const NAV_ITEMS: Array<{ href: string; icon: IconName }> = [
  { href: '#top', icon: 'home' },
  { href: '#value', icon: 'coin' },
  { href: '#features', icon: 'bars' },
  { href: '#proof', icon: 'briefcase' },
  { href: '#guide', icon: 'ticket' },
  { href: '#guide', icon: 'send' },
];

export const HERO_STATS = [
  { value: 100, suffix: ' pts' },
  { value: 500, suffix: '+' },
  { value: 12, suffix: '+' },
];

/** Brand names are never translated. */
export const PARTNERS = [
  'Media Expert',
  'Douglas',
  'Zalando',
  'Empik',
  'Rossmann',
  'Allegro',
  'Decathlon',
];

export const SERVICE_ICONS: IconName[] = [
  'bakery',
  'coffee',
  'shopping',
  'restaurant',
  'halal',
  'leisure',
  'beauty',
  'housing',
];

export const FEATURE_META: Array<{
  icon: IconName;
  stat?: { value: number; suffix: string };
}> = [
  { icon: 'trophy', stat: { value: 100, suffix: ' pts' } },
  { icon: 'gift' },
  { icon: 'card' },
  { icon: 'qr' },
  { icon: 'assistant' },
];

export const VALUE_CARD = { brand: 'zalando', logo: 'Z' };

export const FOOTER_LINKS: string[][] = [
  ['#value', '#proof', '#guide', '#features'],
  ['#top', '#top', '#proof', '#guide'],
];

export const CONTACT_EMAIL = 'support@paylez.com';
