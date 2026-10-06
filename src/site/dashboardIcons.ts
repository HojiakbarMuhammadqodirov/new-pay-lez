/**
 * The partner dashboard's icon set, as path data.
 *
 * The v3 design (`b2b/dashboard-design/Paylez Partner Dashboard v3.dc.html`)
 * draws every icon with one helper: a 24×24 viewBox, stroke only, round caps
 * and joins, 1.8 wide, a list of `d` strings. The site's own `icons.tsx` is a
 * different family drawn at a different weight, and a rail of v3 icons with a
 * site icon in the middle reads as a mistake — so the dashboard carries the
 * mock's paths verbatim, here, and `DxIcon` in `dashboardKit.tsx` draws them.
 *
 * Data rather than components, in a `.ts` file, so `content.ts` can type the
 * rail's `icon` field against it without importing React, and so a screen
 * builder who needs a new glyph adds a row here rather than a component.
 *
 * Shapes the mock writes as `<rect>` or `<circle>` are restated as paths, so
 * every entry is the same kind of thing and the component has one code path.
 */
export const DX_ICONS = {
  /* ── the rail, in rail order ── */
  overview: ['M3 3v18h18', 'M7 15l4-5 3 3 4-6'],
  deals: [
    'M20.6 13.6 13.6 20.6a2 2 0 0 1-2.8 0l-7.4-7.4V4h9.2l8 8a2 2 0 0 1 0 1.6Z',
    'M7.5 7.5h.01',
  ],
  campaigns: ['M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8L12 3Z'],
  vouchers: ['M4 7h16v4a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z', 'M12 7v10'],
  passes: [
    'M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V8Z',
    'M15 7v12',
  ],
  customers: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M22 21v-2a4 4 0 0 0-3-3.9',
  ],
  assistant: [
    'M12 3v3',
    'M12 18v3',
    'M5.6 5.6l2.1 2.1',
    'M16.3 16.3l2.1 2.1',
    'M3 12h3',
    'M18 12h3',
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  ],
  scans: [
    'M3 7V5a2 2 0 0 1 2-2h2',
    'M17 3h2a2 2 0 0 1 2 2v2',
    'M21 17v2a2 2 0 0 1-2 2h-2',
    'M7 21H5a2 2 0 0 1-2-2v-2',
    'M7 12h10',
  ],
  receipt: ['M6 2h12v20l-3-2-3 2-3-2-3 2Z', 'M9 8h6', 'M9 12h6'],
  team: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M15 11l2 2 4-4',
  ],
  house: ['M3 21V9l9-6 9 6v12', 'M9 21v-7h6v7'],

  /* ── chrome ── */
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  calendar: [
    'M6 4h12a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z',
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
  ],
  globe: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
    'M3 12h18',
    'M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18',
  ],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8', 'M13.7 21a2 2 0 0 1-3.4 0'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    'M12 2v2',
    'M12 20v2',
    'M4.9 4.9l1.4 1.4',
    'M17.7 17.7l1.4 1.4',
    'M2 12h2',
    'M20 12h2',
    'M4.9 19.1l1.4-1.4',
    'M17.7 6.3l1.4-1.4',
  ],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  download: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  eye: [
    'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  warn: [
    'M12 9v4',
    'M12 17h.01',
    'M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  ],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 16v-4', 'M12 8h.01'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', 'M21 21l-4.3-4.3'],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14v10H5Z'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  userPlus: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M19 8v6',
    'M22 11h-6',
  ],
  signOut: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  mail: ['M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z', 'M3 7l9 6 9-6'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 15h10l1-15'],
  ban: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M5.6 5.6l12.8 12.8'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  swap: ['M7 7h13l-4-4', 'M17 17H4l4 4'],
  tablet: [
    'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
    'M11 18h2',
  ],
  pin: ['M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3Z'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z', 'M9 12l2 2 4-4'],
  /* The team table's "regenerate code" (v3's own path) and the code panel's copy. */
  refresh: ['M21 12a9 9 0 1 1-2.6-6.3', 'M21 4v5h-5'],
  copy: ['M9 9h11v11H9Z', 'M5 15H4V4h11v1'],
  /* The Passes screen's template marks (v3's own paths; VIP reuses `campaigns`,
     scratch reuses `plus`) and the payout card. */
  passDaily: [
    'M8 3v3',
    'M16 3v3',
    'M4 8h16',
    'M5 6h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
    'M12 13h.01',
  ],
  passBundle: ['M12 2 3 7v10l9 5 9-5V7l-9-5Z', 'M3 7l9 5 9-5', 'M12 12v10'],
  passSeasonal: ['M12 3a9 9 0 1 0 9 9', 'M12 7v5l3 2', 'M16 3l2 2 3-3'],
  card: ['M3 10h18', 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'],
} as const satisfies Record<string, readonly string[]>;

export type DxIconName = keyof typeof DX_ICONS;
