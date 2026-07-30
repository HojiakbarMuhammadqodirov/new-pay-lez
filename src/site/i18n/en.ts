/**
 * English — the source dictionary.
 *
 * Its shape defines the `Dictionary` type, so every other language is checked
 * against it at compile time: a missing or misspelt key is a build error, not a
 * blank space on the page. Arrays are index-aligned with the structural data in
 * `content.ts` (icons, hrefs, stats), which is what keeps the copy free of
 * anything that isn't words.
 */
export const en = {
  code: 'en',
  label: 'English',
  short: 'EN',
  region: 'GB',

  nav: ['Home', 'L-Earn', 'Analytics', 'B2B', 'Vouchers', 'Relocate'],
  signIn: 'Sign in',
  assistant: 'Open the AI assistant',
  languageMenu: 'Change language',
  theme: {
    label: 'Theme',
    toLight: 'Switch to light theme',
    toDark: 'Switch to dark theme',
  },

  hero: {
    lines: ['Play & Earn.', 'Exclusive deals.'],
    lede: 'Discover, play and get rewarded.',
    primary: 'Play & Earn',
    secondary: 'How it works',
    stats: ['Per game win', 'Partner stores', 'Cities live'],
  },

  proof: 'Redeem points at leading partner stores',

  guide: {
    eyebrow: 'In your city',
    title: 'Discover services in your city.',
    lede: 'Hot deals, trusted spots & local favourites — all in one place.',
    services: [
      { name: 'Bakery', blurb: 'Freshly baked goodness nearby' },
      { name: 'Coffee', blurb: 'Your perfect cup, wherever' },
      { name: 'Shopping', blurb: 'Top spots to shop like a local' },
      { name: 'Restaurant', blurb: 'Discover the best local flavours' },
      { name: 'Halal', blurb: 'Halal-certified places you can trust' },
      { name: 'Leisure', blurb: 'Fun things to do around you' },
      { name: 'Beauty', blurb: 'Self-care and beauty' },
      { name: 'Housing', blurb: 'Find your new home abroad' },
    ],
  },

  features: {
    eyebrow: 'How paylez works',
    title: 'Play a little. Earn a lot.',
    lede: 'Answer quick questions, build a streak and turn points into real vouchers.',
    cards: [
      {
        title: 'Answer questions. Build streaks. Win rewards.',
        body: 'Train your mind daily with the Play & Earn brain game. Every correct answer earns points you can redeem for discount vouchers at partner stores.',
      },
      {
        title: 'Exclusive deals',
        body: 'Hand-picked gift cards and discounts from our partner network, updated regularly.',
      },
      {
        title: 'Instant mobile vouchers',
        body: 'Redeem straight from your phone and scan in-store — nothing to print.',
      },
      {
        title: 'Scan QR codes, earn extra points',
        body: 'Scan partner QR codes in-store to unlock bonus points and instant voucher drops — right from your phone.',
      },
      {
        title: 'AI Assistant',
        body: 'Your digital companion for the move abroad — ask it anything, any time.',
      },
    ],
  },

  value: {
    eyebrow: 'Play & Earn',
    title: 'Your points are real money.',
    lede: "No gimmicks, no expiry traps. Play to earn points, then cash them in for gift cards and discounts you'll actually use.",
    card: {
      merchant: 'Zalando Gift Card',
      meta: 'Partner store · €25 value',
      title: 'Redeem your points for a real voucher.',
      price: '500 pts',
      revealed: 'Voucher ready · PLZ-9F3K',
      action: 'Redeem 100 points',
    },
    benefits: [
      {
        title: 'Earn points just by playing',
        body: 'Answer a few quick questions a day, build your streak, and rack up points on the tram, in a queue, anywhere.',
      },
      {
        title: 'Redeem for gift cards & discounts',
        body: 'Turn points into vouchers at partner stores like Zalando, Douglas and Media Expert — redeemed straight from your phone.',
      },
      {
        title: 'Climb the Paylez Champions board',
        body: 'Invite friends, keep your streak alive and rise up the monthly leaderboard for bigger prizes.',
      },
    ],
  },

  voices: {
    eyebrow: 'Loved by newcomers',
    title: 'People settle in faster with paylez.',
    items: [
      {
        quote:
          'Paylez is the first app I open in a new city — deals, points and everything I need to settle in, all in one place.',
        name: 'Mira D.',
        meta: 'Kraków · Member since 2025',
      },
      {
        quote:
          'I earned enough points in two weeks to grab a Zalando voucher. Playing a quick quiz on the tram actually pays off.',
        name: 'Ola K.',
        meta: 'Student, new arrival',
      },
      {
        quote:
          'The Living Guide walked me through opening a bank account and finding a flat when I moved. Genuinely a lifesaver.',
        name: 'Mateusz R.',
        meta: 'Relocated from Lisbon',
      },
      {
        quote:
          "Redeemed a Douglas gift card for my sister's birthday — 100 points, two taps, done.",
        name: 'Priya S.',
        meta: 'Member since 2024',
      },
      {
        quote:
          'As a partner store, Paylez brings us motivated local customers without discounting our brand. The AI Assistant handles the questions too.',
        name: 'Elena V.',
        meta: 'Partner store owner',
      },
    ],
  },

  cta: {
    title: 'Play. Earn. Settle in.',
    lede: 'Join thousands making a new country feel like home — play games, earn real rewards and get expert help every step of the way. Free to start.',
    primary: 'Play & Earn',
    secondary: 'Explore the Living Guide',
    note: 'No subscription required · Available across Poland',
  },

  footer: {
    blurb:
      'Play & Earn. Exclusive deals. Real rewards. Discover, save and get rewarded.',
    location: 'Kraków, Poland',
    columns: [
      {
        heading: 'Product',
        links: ['Play & Earn', 'Discounts', 'Relocate', 'AI Assistant'],
      },
      {
        heading: 'Company',
        links: ['Support', 'Share Your Feedback', 'Hot Deals', 'Community'],
      },
    ],
    news: {
      heading: 'Get the best deals first',
      body: 'One short email a week — the new drops and points multipliers worth your time.',
      success: "You're in — watch your inbox ✦",
      placeholder: 'you@email.com',
      emailLabel: 'Email address',
      subscribe: 'Subscribe',
    },
    legal: '© 2026 Paylez. All rights reserved.',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
  },
};

/**
 * Note the absence of `as const`: it would freeze every string into its own
 * literal type, and no translation could then satisfy the shape.
 */
export type Dictionary = typeof en;
