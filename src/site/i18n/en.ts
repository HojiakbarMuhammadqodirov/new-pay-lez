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
      // `{amount}` is filled at render in the reader's currency — the language
      // picks it, so the hole has to be inside the sentence rather than
      // bolted to one end of it. See `i18n/currency.ts`.
      meta: 'Partner store · {amount} value',
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
    eyebrow: 'Partners on paylez',
    title: 'Local businesses grow faster with paylez.',
    items: [
      {
        quote:
          'We put a voucher in the pool on a Tuesday and had a queue by Thursday. It costs us nothing until someone walks in and redeems it.',
        name: 'Kawiarnia Wisła',
        meta: 'Café · Kraków',
      },
      {
        quote:
          'The quiet hours are the ones filling up. Weekday mornings used to be dead — now that is the shift we roster an extra person for.',
        name: 'Studio Barber 9',
        meta: 'Barbershop · Warszawa',
      },
      {
        quote:
          "The customers are ours, not a delivery app's. We can reach the ones who have not been in for a month, and they come back.",
        name: 'Zielony Market',
        meta: 'Grocery · Wrocław',
      },
      {
        quote:
          'Staff learned the QR scan in one shift. No new hardware, nothing extra on the counter, nothing to explain twice.',
        name: 'Pracownia Ceramiki',
        meta: 'Ceramics studio · Gdańsk',
      },
      {
        quote:
          'We finally know what a returning customer is worth against a first-timer. That one report changed how we price.',
        name: 'Fit Klub Nowa',
        meta: 'Gym · 4 sites',
      },
    ],
  },

  /* ───────────────────────────────────────────────────────────── l-earn ── */

  learn: {
    back: 'Back to paylez',
    hero: {
      eyebrow: 'L-Earn',
      lines: ['Learn something new.', 'Earn something real.'],
      lede: 'A few quick questions a day. Points that turn into vouchers at shops you already use. No subscription, no catch.',
      primary: 'Start playing',
      secondary: 'See the games',
      stats: ['Per game win', 'Streak bonus', 'Buys a voucher'],
    },

    steps: {
      eyebrow: 'How it works',
      title: 'Four steps, about two minutes.',
      lede: 'Short enough for a tram ride, which is where most of it gets played.',
      items: [
        {
          title: 'Pick a game',
          body: 'Capitals, flags, or life in Poland. Ten questions a round, and none of them take long.',
        },
        {
          title: 'Answer',
          body: 'Every correct answer scores, and answering quickly scores more — the clock is part of the game.',
        },
        {
          title: 'Keep the streak',
          body: 'Come back tomorrow. A streak multiplies everything you score, and seven days running pays a bonus of its own.',
        },
        {
          title: 'Redeem',
          body: 'Turn points into a voucher and scan it in store. Nothing to print, nothing to wait for.',
        },
      ],
    },

    games: {
      eyebrow: 'The games',
      title: 'Three ways to score.',
      lede: 'All three are translated into every language on this site, so you are never playing in your second one unless you want to.',
      items: [
        {
          name: 'Capital Game',
          blurb: 'Name the capital. It starts easy and stops being easy somewhere around round four.',
          meta: '10 questions · up to 100 pts',
        },
        {
          name: 'Flag Game',
          blurb: 'Match the flag to the country. The quickest of the three, and the one people play in queues.',
          meta: '10 questions · up to 100 pts',
        },
        {
          name: 'Life in Poland',
          blurb: 'The practical one: paperwork, transport, tenancy — the things nobody tells you. Worth points, and worth knowing.',
          meta: '10 questions · up to 150 pts',
        },
      ],
    },

    streak: {
      eyebrow: 'Streaks',
      title: 'The streak is where the points are.',
      lede: 'One round a day keeps it alive. Miss a day and it goes back to one — that is the whole rule.',
      card: { label: 'Current streak', unit: 'days', reward: '+250 pts on day seven' },
      benefits: [
        {
          title: 'Day three: 1.5×',
          body: 'Every point you score is worth half as much again, across all three games.',
        },
        {
          title: 'Day seven: 250 pts',
          body: 'A flat bonus on top of the multiplier, paid the moment the seventh round lands.',
        },
        {
          title: 'It counts the day, not the game',
          body: 'Any round on any game keeps the streak going, so a bad morning at capitals costs you nothing.',
        },
      ],
    },

    board: {
      eyebrow: 'Paylez Champions',
      title: 'The monthly board.',
      lede: 'Everyone starts at zero on the first. The top three share the month’s prize pool; everyone else simply keeps their points.',
      columns: { rank: '#', player: 'Player', points: 'Points' },
      note: 'Sample board — yours resets on the 1st.',
    },

    faq: {
      eyebrow: 'Questions',
      title: 'The short answers.',
      items: [
        {
          q: 'Do points expire?',
          a: 'No. They stay in your balance until you spend them. There is no expiry date and no monthly reset on the points themselves — only the leaderboard starts over.',
        },
        {
          q: 'How many rounds can I play a day?',
          a: 'Three scoring rounds, one per game. You can keep playing after that for practice; it just will not add points.',
        },
        {
          q: 'What is a voucher actually worth?',
          a: '500 points is a {amount} gift card at partner stores like Zalando, Douglas and Media Expert. Smaller discounts start at 100 points.',
        },
        {
          q: 'Is it free?',
          a: 'Yes. No subscription, no entry fee, and nothing to buy before you can play.',
        },
        {
          q: 'Which languages are the questions in?',
          a: 'All five on this site — English, Polish, Uzbek, Russian and Ukrainian. Change the language and the questions change with it.',
        },
      ],
    },

    cta: {
      title: 'Two minutes a day.',
      lede: 'That is the whole commitment. Play a round, keep the streak, and spend the points on something you were going to buy anyway.',
      primary: 'Start playing',
      secondary: 'Explore paylez',
      note: 'Free to play · Available across Poland',
    },
  },

  /* ────────────────────────────────────────────────────────── analytics ── */

  analytics: {
    back: 'Back to paylez',
    hero: {
      eyebrow: 'Partner Analytics',
      lines: ['Every scan,', 'accounted for.'],
      lede: 'Enter your Service ID and see what the campaign actually did — impressions, clicks, redemptions and what they were worth, for every deal you run.',
      primary: 'Open the dashboard',
      secondary: 'See what you get',
      idLabel: 'Service ID',
      idNote: 'Your unique ID — find it on your partner agreement.',
      idAction: 'View analytics',
    },

    kpis: {
      eyebrow: 'The headline',
      title: 'Four numbers, one period.',
      lede: 'The same four at the top of every partner dashboard, against the period before it.',
      items: ['Impressions', 'Unique clickers', 'Conversion rate', 'Redemptions'],
      since: 'vs. previous period',
    },

    funnel: {
      eyebrow: 'Engagement funnel',
      title: 'Where the drop-off is.',
      lede: 'Three stages, and the gap between them is the only thing worth optimising. A deal that is seen and never clicked has a different problem from one that is clicked and never redeemed.',
      stages: [
        { name: 'Impressions', note: 'Your deal appeared in a feed or a search result.' },
        { name: 'Clicks', note: 'Someone opened it. Counted once per person, not per tap.' },
        { name: 'Redemptions', note: 'A voucher was scanned at your counter.' },
      ],
    },

    week: {
      eyebrow: 'Redemptions by day',
      title: 'The week, at a glance.',
      lede: 'Redemptions land on the days you would expect, which is exactly why the days you would not are worth looking at.',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      peak: 'Busiest day',
      total: 'Redeemed this week',
    },

    reports: {
      eyebrow: 'What you get',
      title: 'Past the headline numbers.',
      items: [
        {
          title: 'Geographic breakdown',
          body: 'Which cities and districts your redemptions came from, so a second location is a decision rather than a guess.',
        },
        {
          title: 'Monthly cheque value',
          body: 'What your voucher redemptions added up to over the month — the figure that settles against your account.',
        },
        {
          title: 'Redemption history',
          body: 'Every redemption with its status and timestamp, filterable, and exportable to CSV whenever your accountant asks.',
        },
        {
          title: 'Retention',
          body: 'How many redeemers came back for a second deal. The number that tells you whether you bought a customer or a discount.',
        },
      ],
    },

    cta: {
      title: 'It is already running.',
      lede: 'Every partner deal has been collecting this since the day it went live. Enter your Service ID and the dashboard is there.',
      primary: 'Open the dashboard',
      secondary: 'Talk to us about partnering',
      note: 'Included with every partner account · No extra fee',
    },
  },

  /* ──────────────────────────────────────────────────────────────── b2b ── */

  b2b: {
    back: 'Back to paylez',
    hero: {
      eyebrow: 'Play-to-earn rewards, vouchers, marketing & analytics in one platform',
      lines: ['Turn every visit', 'into a habit.', 'Own your customers.'],
      lede: 'Loyalty, vouchers, marketing and reporting on a single customer record — with your offer sitting inside a game thousands of people open every morning. You fund it only when someone walks in and redeems.',
      primary: 'Talk to sales',
      secondary: 'See the dashboard',
      stats: ['Repeat visit uplift', 'Cost until redemption', 'From signup to live'],
      trust: 'Trusted by 500+ venues · No hardware to buy · No contract to start',
    },

    why: {
      eyebrow: 'Why operators switch',
      title: 'Everything you need to grow revenue from the customers you already have.',
      lede: 'Four systems most venues buy separately — loyalty, vouchers, marketing and analytics — running off one customer record.',
      items: [
        {
          title: 'Nothing until it works',
          body: 'Your voucher goes out to thousands of players. You fund it only when someone walks in and redeems it. Points cost you nothing until a voucher is used, so a campaign that reaches nobody costs nothing either.',
          stat: '{amount} until a voucher is redeemed',
        },
        {
          title: 'The customer is yours',
          body: 'Every play, redemption and visit builds a profile you can contact directly — not a metric locked inside someone else’s app, and not a list you rent back one push at a time.',
          stat: '100% of the customer record',
        },
        {
          title: 'Live in 48 hours',
          body: 'POS integration where you want it, standalone where you don’t. Staff scan a QR at the till, learn it in one shift, and there is no hardware to buy or countertop to give up.',
          stat: '48h from signing to first scan',
        },
        {
          title: 'Four tools, one login',
          body: 'Loyalty, vouchers, campaigns and reporting stop being four contracts, four exports and four versions of who your customer is. One record, one bill, one screen.',
          stat: '4 systems, 1 customer record',
        },
      ],
    },

    dashboard: {
      eyebrow: 'Your dashboard',
      title: 'The screen you open on a Monday morning.',
      lede: 'Not a monthly PDF from an account manager. Every scan, voucher and campaign across your venues — and it opens with a sentence, not a chart.',
      bullets: [
        {
          title: 'It starts in plain words',
          body: 'How many new customers we brought in and roughly what they spent, before you have read a single axis.',
        },
        {
          title: 'One site, or all of them at once',
          body: 'Filter by site, channel or date. Managers get their own venue without ever seeing group numbers.',
        },
        {
          title: 'It tells you what it noticed',
          body: 'Quiet days, rewards earned but never used, a discount tier nobody reaches — each one with the change already drafted.',
        },
      ],
      action: 'Book a walkthrough',
      mock: {
        business: 'Sablewski & Para',
        screen: 'Overview',
        range: 'Last 30 days',
        user: 'MK',
        kicker: 'What paylez did for you',
        // The two holes are a figure each: `{customers}` is a count and
        // `{revenue}` is money in the reader's currency. Both are set into the
        // sentence rather than beside it, so word order stays a translator's.
        headline:
          'We brought {customers} new customers through your door, and they spent about {revenue} with you.',
        tiles: [
          { name: 'Visits', note: 'QR scans at the till' },
          { name: 'Vouchers redeemed', note: 'Points spent with you' },
          { name: 'Repeat rate', note: 'Back within 30 days' },
          { name: 'Average basket', note: 'Per attributed visit' },
        ],
        since: 'vs. previous 30 days',
        chart: {
          title: 'Visits and vouchers redeemed',
          note: 'Every QR scan at the counter, against the vouchers customers actually spent.',
          visits: 'Visits',
          redeemed: 'Redeemed',
        },
        insight: {
          kicker: 'What we noticed',
          text: 'Tuesday is your quietest day, and 38% of the rewards earned last month were never used.',
          action: 'Draft a Tuesday offer',
          dismiss: 'Not now',
        },
        live: {
          title: 'Running right now',
          note: 'Everything customers can see or earn in your venues today.',
          rows: [
            {
              kind: 'Play & Earn',
              name: '−20% off the main menu',
              rule: '500 pts · all four sites',
              statLabel: 'in the pool',
            },
            {
              kind: 'Hot deal',
              name: 'Free coffee before 11',
              rule: 'Mon–Fri · Kazimierz',
              statLabel: 'claimed',
            },
            {
              kind: 'Campaign',
              name: 'Quiet 30 days · push',
              rule: '1,840 customers',
              statLabel: 'opened',
            },
          ],
          on: 'Live',
          off: 'Paused',
          edit: 'Edit',
        },
      },
    },

    pillars: {
      eyebrow: 'The platform',
      title: 'Three parts, one customer record.',
      items: [
        {
          eyebrow: 'Paylez Portal',
          title: 'One dashboard for every site you run.',
          body: 'Spend, plays, redemptions and returning-customer share across all locations — filtered by site, channel or date. No spreadsheets, no waiting on your POS provider.',
          bullets: [
            {
              title: 'Group totals that open into single sites',
              body: 'One number for the business, and the row that explains it one click down.',
            },
            {
              title: 'See which cohort is carrying the month',
              body: 'Returning against first-time basket spend, per site, per channel.',
            },
            {
              title: 'Managers see their venue, not your group',
              body: 'Per-site logins with their own scope, so a shift lead can run their own numbers.',
            },
          ],
          action: 'Explore the portal',
        },
        {
          eyebrow: 'Play & Earn',
          title: 'Your offer, inside a game they open every day.',
          body: 'Customers answer quick questions, build streaks and earn points — then spend those points on a voucher they can only redeem with you.',
          bullets: [
            {
              title: 'Your voucher is in the daily pool',
              body: 'It sits in front of players who are already opening the app to win something.',
            },
            {
              title: 'You set every number on it',
              body: 'Point cost, discount, expiry, weekly cap and which sites accept it.',
            },
            {
              title: 'One QR scan at the till',
              body: 'No hardware, no integration, and one shift for staff to learn it.',
            },
          ],
          action: 'See how Play & Earn works',
        },
        {
          eyebrow: 'Data & marketing',
          title: 'Win back quiet customers in ten minutes a month.',
          body: 'Segment by spend, frequency, location or lapsed days — then fire a push, an offer or a promo code straight to that audience.',
          bullets: [
            {
              title: 'Six ways to reach them',
              body: 'Push, limited offers, promo codes, gift cards, bonus-point drops and email.',
            },
            {
              title: 'Audiences that are already built',
              body: 'Lapsed, high-spend, new this month and single-site, ready to send to.',
            },
            {
              title: 'Revenue reported per campaign',
              body: 'What each message brought back through the door, not what it was opened by.',
            },
          ],
          action: 'Browse the toolkit',
        },
      ],
      portal: {
        label: 'Group spend',
        period: 'This month',
        columns: { site: 'Site', repeat: 'Returning' },
      },
      cohort: {
        label: 'Basket spend by cohort',
        returning: 'Returning',
        first: 'First time',
      },
      game: {
        label: 'Your voucher, in the pool',
        prize: '−20% at your venue',
        cost: '500 pts',
        note: 'Correct! You earned points.',
      },
      campaign: {
        label: 'New campaign',
        audiences: ['Lapsed 30 days', 'High spend', 'New this month', 'One site only'],
        send: 'Send −20% off next visit',
        estimate: 'Est. {amount} recovered spend',
      },
    },

    rollout: {
      eyebrow: 'Getting started',
      title: 'Signed on Monday, live by Wednesday.',
      lede: 'No hardware, no integration project, no training day. Four steps, and the long one is ours.',
      items: [
        {
          title: 'A 20-minute call',
          body: 'Your sites, your average basket, whatever you run today. We come back with a plain forecast of the repeat revenue — not a deck.',
        },
        {
          title: 'We build your listing',
          body: 'Photos, hours, categories and the languages your staff speak, written out in all five languages the app ships in.',
        },
        {
          title: 'Your voucher goes in the pool',
          body: 'You set the point cost, the discount, the expiry and the weekly cap. It is in front of players the same day.',
        },
        {
          title: 'Staff scan at the till',
          body: 'One QR code, one shift to learn it. Redemptions land in your dashboard as they happen.',
        },
      ],
      note: 'Average time from signed contract to first redeemed voucher: 48 hours.',
    },

    operators: {
      eyebrow: 'Operators on paylez',
      title: 'The people running the venues, not the software.',
      items: [
        {
          quote:
            'We stopped renting our customers from delivery apps. Our voucher sits in a game thousands of people open every morning, and the redemptions walk through the door.',
          name: 'Sablewski & Para',
          role: 'Owner — 4 sites, Kraków',
        },
        {
          quote:
            'Ten minutes on a Monday. One push to everyone who has not been in for three weeks. That single message pays for the platform several times over.',
          name: 'Kawiarnia Hermanos',
          role: 'Operations Director — 11 sites',
        },
        {
          quote:
            'Our first voucher was live in the game the same week we signed. Staff scan a QR at the till — that is the whole workflow, which is why it actually stuck across all sites.',
          name: 'Poke Yard',
          role: 'Founder — 6 sites, Warszawa',
        },
        {
          quote:
            'Being able to see basket spend by returning versus first-time customers changed how we price. That report alone justified the switch.',
          name: 'Piekarnia Northline',
          role: 'Managing Director — 9 sites',
        },
      ],
    },

    pricing: {
      eyebrow: 'Pricing',
      title: 'You pay for redemptions, not for seats.',
      lede: 'Every plan includes the portal and unlimited customer records. The monthly fee buys the marketing tools — the vouchers themselves are only ever funded when they are used.',
      perMonth: '/ month',
      quoted: 'Quoted',
      tiers: [
        {
          name: 'Single site',
          note: 'One venue',
          body: 'Play & Earn placement, vouchers and the reports that matter.',
          features: [
            'Your voucher in the daily pool',
            'Owner dashboard and core reports',
            'Unlimited customer records',
            'QR redemption at the till',
          ],
          action: 'Start free',
        },
        {
          name: 'Growth',
          note: 'Up to 5 sites',
          body: 'The full marketing toolkit, per-site logins and bonus-point drops.',
          features: [
            'Everything in Single site',
            'Push, offers, promo codes and gift cards',
            'Built audiences and per-campaign revenue',
            'Per-site logins for managers',
          ],
          action: 'Talk to sales',
        },
        {
          name: 'Group',
          note: '6 sites and up',
          body: 'Multi-site rollout, POS integration and a named contact.',
          features: [
            'Everything in Growth',
            'POS integration and rollout support',
            'Group-level reporting and exports',
            'Named account contact',
          ],
          action: 'Talk to sales',
        },
      ],
      featured: 'Most chosen',
      footnote:
        'Vouchers are funded on redemption on every plan, including the free one. Prices exclude VAT.',
    },

    cta: {
      title: 'See what your regulars are worth.',
      lede: 'A 20-minute call, your numbers, and a plain forecast of the repeat revenue Paylez would unlock across your sites. No contract to start.',
      primary: 'Talk to sales',
      secondary: 'Explore paylez',
      note: 'Multi-site group? Ask about rollout support and POS integration.',
    },
  },

  /* ─────────────────────────────────────────────────────────── vouchers ── */

  vouchers: {
    back: 'Back to paylez',
    hero: {
      eyebrow: 'Points in, real vouchers out',
      lines: ['Play for points.', 'Spend them', 'on something real.'],
      lede: 'Every voucher you earn lands in one wallet: gift cards and discounts at the shops you already use, held until you want them, and spent by showing a QR code at the till.',
      primary: 'Start earning',
      secondary: 'See what is available',
      stats: ['Partner brands', 'Cheapest voucher', 'Cost to redeem'],
      trust: 'No subscription · No card details · Points never expire',
    },

    wallet: {
      title: 'Your vouchers',
      counts: '{active} active · {used} used',
      tabs: { active: 'Active', used: 'Used' },
      note: 'A voucher counts as used the moment you generate its QR code — so generate it at the counter, not on the tram.',
      card: {
        meta: 'Partner store · {amount} value',
        cost: '500 pts',
        action: 'Show QR code',
        code: 'PLZ-9F3K',
        expires: 'Valid until 31.08',
      },
    },

    steps: {
      eyebrow: 'How a voucher happens',
      title: 'Four steps, and none of them cost you money.',
      lede: 'The whole loop, from a spare two minutes on the tram to a discount at the counter.',
      items: [
        {
          title: 'Answer a few questions',
          body: 'Three scoring rounds a day across the three games. Every correct answer is points, and a streak is worth more than a single good day.',
        },
        {
          title: 'Pick a voucher',
          body: 'The wallet shows what your balance can already reach and what it is short of. Nothing is hidden behind a tier you cannot see.',
        },
        {
          title: 'Generate the QR at the till',
          body: 'One tap turns the voucher into a code. It is a single code with a single use, which is why it is generated at the counter rather than in advance.',
        },
        {
          title: 'The discount comes off',
          body: 'Staff scan it, the discount comes off the bill, and the voucher moves to your Used tab with the date and the shop on it.',
        },
      ],
    },

    catalogue: {
      eyebrow: 'What is in the wallet',
      title: 'Gift cards at the shops you were going to anyway.',
      lede: 'The list is refreshed monthly and each card has a limited allocation — when a month runs out, it comes back on the first.',
      cost: 'pts',
      left: '{left} of {of} left',
      everywhere: 'Any store · online too',
      soldOut: 'Back on the 1st',
      action: 'Browse the full list',
    },

    rules: {
      eyebrow: 'The small print, in normal words',
      title: 'Three things worth knowing before you spend.',
      items: [
        {
          title: 'One code, one use',
          body: 'A generated QR cannot be regenerated, screenshotted for later or passed to a friend. That is what keeps a voucher worth honouring at the till.',
        },
        {
          title: 'Generate it at the counter',
          body: 'The voucher moves to Used the moment the code exists, whether or not anyone scans it. Have the shop in front of you first.',
        },
        {
          title: 'Points keep, vouchers expire',
          body: 'Your balance has no expiry date and no monthly reset. An individual voucher does — the date is on the card before you spend anything.',
        },
      ],
    },

    faq: {
      eyebrow: 'Questions',
      title: 'The ones people actually ask.',
      items: [
        {
          q: 'What does a voucher cost me?',
          a: 'Points, and nothing else. There is no subscription, no delivery fee and no card on file — you never enter payment details to redeem one.',
        },
        {
          q: 'Can I combine a voucher with a shop’s own sale?',
          a: 'Usually yes, and the card says so before you redeem. Where a partner excludes sale items, that exclusion is written on the voucher rather than discovered at the till.',
        },
        {
          q: 'I generated a code by accident. Can I get it back?',
          a: 'Not automatically — the code is already live at that point. Write to support with the voucher reference and we will look at it, but the honest answer is to only tap it when you are standing at the counter.',
        },
        {
          q: 'Why do vouchers run out?',
          a: 'Each partner funds a fixed allocation per month. When it is gone the card greys out and returns on the first, which is also why the popular ones go early.',
        },
      ],
    },

    cta: {
      title: 'Your next voucher is about four minutes away.',
      lede: 'That is three rounds of questions. Start today and the streak starts counting too.',
      primary: 'Play & Earn',
      secondary: 'See the games',
      note: 'Free to start · Available across Poland',
    },
  },

  /* ─────────────────────────────────────────────────────────── relocate ── */

  relocate: {
    back: 'Back to paylez',
    hero: {
      eyebrow: 'The Living Guide',
      lines: ['New country.', 'A hundred questions.', 'One guide.'],
      lede: 'Where to open an account, how the rent deposit works, which clinic takes your insurance, what the transfer home actually costs. Nine subjects, fourteen countries, written by people who have done it.',
      primary: 'Open the guide',
      secondary: 'Check a rate',
      stats: ['Subjects covered', 'Countries live', 'Markup on our rate'],
      trust: 'Free · No account needed to read · Updated as the rules change',
    },

    rates: {
      eyebrow: 'Money home',
      title: 'Know the real rate before anyone quotes you one.',
      lede: 'The mid-market rate for the corridors people here actually send along, with no spread of ours on top. Save the pairs you use and they open first.',
      send: 'You send',
      gets: 'They get',
      rate: 'Rate',
      action: 'Compare providers',
      saved: 'Saved pairs',
      savedNote: 'Pinned to the top of the screen, so a rate check is one tap rather than a search.',
      bullets: [
        {
          title: 'The mid-market rate, unmarked',
          body: 'What the currency is worth, not what a provider will give you for it. The difference between the two is the thing worth shopping for.',
        },
        {
          title: 'Providers side by side',
          body: 'Fee, rate and arrival time for each, on the amount you actually typed rather than on a headline example.',
        },
        {
          title: 'Your corridors first',
          body: 'Pin the pairs you send along and they are at the top every time, with the rate already loaded.',
        },
      ],
    },

    guide: {
      eyebrow: 'Help and guidance',
      title: 'Nine subjects, and the one you need is never the one you expected.',
      lede: 'Each opens into step-by-step guidance for your city — the document you need, where it is issued, what it costs and how long it takes.',
      cities: 'All cities',
      search: 'Search the guide',
      items: [
        { name: 'Places', blurb: 'Shops, restaurants and services worth the trip' },
        { name: 'Banking & finance', blurb: 'Accounts, cards, credit and what an IBAN is for' },
        { name: 'Housing', blurb: 'Finding a flat, deposits, contracts and registration' },
        { name: 'Healthcare', blurb: 'Insurance, registering with a clinic, emergencies' },
        { name: 'Legal & visa', blurb: 'Permits, residency, renewals and the documents behind them' },
        { name: 'Employment', blurb: 'Finding work, contracts and the rights that come with them' },
        { name: 'Education', blurb: 'Schools, universities, language courses and recognition' },
        { name: 'Transport', blurb: 'Tickets, passes, licences and getting around' },
        { name: 'Culture & integration', blurb: 'Language, customs, holidays and finding people' },
      ],
    },

    countries: {
      eyebrow: 'Where it works',
      title: 'Fourteen countries, and the guidance is local to each.',
      lede: 'A residence permit in Kraków and one in Rotterdam have nothing in common but the name. The guide is written per country and per city, not translated from one and hoped over the rest.',
      note: 'More countries are added as we find people who have actually lived the process.',
    },

    ask: {
      eyebrow: 'When the guide does not cover it',
      title: 'Ask in your own language.',
      lede: 'The assistant answers from the same guidance, in whichever of the five languages you asked in — and says so plainly when the answer depends on your particular case.',
      placeholder: 'How do I register my address in Kraków?',
      action: 'Ask',
      samples: [
        'What do I need to open a bank account?',
        'How much deposit is normal for a flat?',
        'Which clinic takes EU insurance?',
      ],
    },

    cta: {
      title: 'The first month is the hard one.',
      lede: 'Read what you need before you need it, keep an eye on the rate, and spend the points you earn along the way.',
      primary: 'Open the guide',
      secondary: 'Play & Earn',
      note: 'Free · No account needed to read the guide',
    },
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
