/**
 * Inline icon set, traced from the original design's SVGs.
 *
 * Inline rather than a sprite or an icon font: every glyph inherits
 * `currentColor`, so the whole set follows the accent with no extra plumbing
 * and no additional network request.
 */

const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M14.5 9.2a2.6 2 0 0 0-5 .3c0 2.5 5 1 5 3.5a2.6 2 0 0 1-5 .3" /></>,
  bars: <><path d="M3 21h18" /><rect x="5" y="10" width="3" height="8" rx="1" /><rect x="10.5" y="5" width="3" height="13" rx="1" /><rect x="16" y="13" width="3" height="5" rx="1" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  ticket: <><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" /><path d="M14 7v10" /></>,
  bot: <><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M2 12v3M22 12v3" /></>,
  send: <><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></>,

  bakery: <><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="9" r="1" fill="currentColor" stroke="none" /><circle cx="13" cy="14" r="1" fill="currentColor" stroke="none" /><circle cx="9.5" cy="14.5" r="1" fill="currentColor" stroke="none" /></>,
  coffee: <><path d="M4 8h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" /><path d="M16 9h2a2 2 0 0 1 0 4h-2" /><path d="M7 3v2M11 3v2" /></>,
  shopping: <><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  restaurant: <><path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" /><path d="M16 3c-1.6 0-2.5 2-2.5 4.5S15 12 16 12v9" /></>,
  halal: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" /><path d="M9 12l2 2 4-4" /></>,
  leisure: <><rect x="3" y="8" width="18" height="9" rx="4" /><path d="M7 12v2M6 13h2" /><circle cx="15.5" cy="12.5" r="1" fill="currentColor" stroke="none" /><circle cx="17.5" cy="14.5" r="1" fill="currentColor" stroke="none" /></>,
  beauty: <><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7L12 3Z" /><path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" /></>,
  housing: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,

  trophy: <><path d="M6 4h12v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V4Z" /><path d="M6 5H3v1a3 3 0 0 0 3 3M18 5h3v1a3 3 0 0 1-3 3M9 20h6M12 11v9" /></>,
  gift: <><path d="M20.6 4H3.4L2 8h20l-1.4-4Z" /><path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" /><path d="M9 12h6" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 14v3M17 20h4M20.5 17v.01" /></>,
  assistant: <><path d="M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4Z" /><path d="M5 21a7 7 0 0 1 14 0" /><path d="M12 3V1M18 6l1-1M6 6 5 5" /></>,

  flag: <><path d="M5 21V4" /><path d="M5 4.5h11l-1.6 3.5L16 11.5H5" /></>,
  map: <><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4Z" /><path d="M9 4v13M15 7v12.5" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5Z" /><path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5Z" /></>,

  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" /></>,
  moon: <><path d="M20 13.4A8.4 8.4 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4Z" /></>,
  check: <><path d="M5 12l5 5L20 7" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" /></>,
  youtube: <><path d="M22 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.5A2.5 2.5 0 0 0 2.4 7.3C2 8.8 2 12 2 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.5a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12ZM10 15V9l5.2 3L10 15Z" fill="currentColor" stroke="none" /></>,
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 20, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
