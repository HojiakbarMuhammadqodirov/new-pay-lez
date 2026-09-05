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

  /*
   * Keyed, not indexed. A business owner sees these in a different order and
   * without Relocate (see `NAV_ORDER_BUSINESS` in `content.ts`), and an array
   * cannot survive being reordered — the first swap would caption Business
   * "Wallet".
   */
  nav: {
    home: 'Home',
    learn: 'L-Earn',
    analytics: 'Analytics',
    business: 'Business',
    /* The same route as `learn`, under the word an owner needs. See
       `NAV_LABEL_BUSINESS` in `content.ts`. */
    games: 'Games',
    /* The page behind this is still `#/vouchers`; "Wallet" is what it is called
       now, because that is what a player opens it to look at. */
    wallet: 'Wallet',
    contact: 'Contact',
    relocate: 'Relocate',
  },
  /** The phone burger's label. There is no visible text beside it. */
  menu: 'Menu',
  signIn: 'Sign in',
  assistant: 'Open the AI assistant',
  languageMenu: 'Change language',
  theme: {
    label: 'Theme',
    toLight: 'Switch to light theme',
    toDark: 'Switch to dark theme',
  },

  /* ─────────────────────────────────────────────────────────────── auth ── */

  auth: {
    /* Two ways in on one route: sign in if you exist, sign up if you do not. */
    eyebrow: 'Welcome back',
    title: 'Sign in to paylez.',
    lede: 'Your points, your vouchers and your guide, on whichever device you picked up.',
    email: 'Email address',
    emailPlaceholder: 'you@email.com',
    password: 'Password',
    passwordPlaceholder: 'Your password',
    submit: 'Sign in',
    /* The credentials are in the bundle either way — see `auth/users.ts`. One
       line per demo account; the role is the same word the header chip uses. */
    errors: {
      email: 'We do not have an account with that email address.',
      password: 'That password does not match.',
      empty: 'Enter your email and password.',
      /* Nobody looked at what was typed — the server could not be reached.
         Saying "wrong password" here sends somebody to check a credential
         that was correct, which is the worse of the two failures. */
      offline: 'We could not reach the server. Nothing is wrong with what you typed — try again in a minute.',
    },

    /* Sign-up, which is also where the individual-or-business question is
       asked — before the account exists rather than after. */
    signUpEyebrow: 'New here',
    signUpTitle: 'Create your paylez account.',
    signUpLede:
      'Two fields and one choice. What you pick decides what the site shows you from the next screen on.',
    name: 'Full name',
    namePlaceholder: 'First and last name',
    newPasswordPlaceholder: 'At least {n} characters',
    typeQuestion: 'Which are you?',
    typeNote: 'You can only pick once for now, so pick the one that fits.',
    signUpSubmit: 'Create account',
    orDivider: 'or',
    googleContinue: 'Continue with Google',
    googleWorking: 'Signing you in…',
    googleUnreachable:
      'Google sign-in is not reachable right now. Use your email and password below.',
    googleRefused:
      'That Google sign-in could not be completed. Please try again.',
    signUpErrors: {
      name: 'Tell us your name.',
      email: 'That does not look like an email address.',
      taken: 'There is already an account with that email address. Sign in instead.',
      password: 'Use at least {n} characters.',
      type: 'Choose whether you are here as a person or as a business.',
    },
    noAccount: 'No account yet?',
    toSignUp: 'Create one',
    haveAccount: 'Already have an account?',
    toSignIn: 'Sign in',

    typeEyebrow: 'One more thing',
    typeTitle: 'How will you use paylez, {name}?',
    typeLede: 'This decides what you see. You can only pick once for now, so pick the one that fits.',
    types: [
      {
        name: 'Individual',
        blurb: 'Play, collect points, spend them on vouchers, and read the guide.',
      },
      {
        name: 'Business owner',
        blurb: 'List your venue, put an offer in front of players, and see what it did.',
      },
    ],
    typeSubmit: 'Continue',
    typeHint: 'Choose one to continue.',

    signOut: 'Sign out',
    cancel: 'Cancel',
    accountMenu: 'Your account',
    dashboard: 'Dashboard',
    roles: { individual: 'User', business: 'Business', admin: 'Admin' },
  },

  /* ────────────────────────────────────────────────────────────── console ── */

  admin: {
    tag: 'Console',
    title: 'The whole platform.',
    lede: 'Every venue, every offer and every account — and the analytics behind each one.',
    back: 'Back to paylez',
    search: 'Search a venue, a service ID, an offer or a person…',
    noMatch: 'Nothing matches that search.',
    /*
     * Index-aligned with the five tiles in `admin.tsx`, and every one of them is
     * a `COUNT` somebody could go and run. There were six: "total deals" and
     * "active deals" collapsed into one, because the only deal route an
     * operator can call returns the live ones and a total would have been the
     * same figure under a different word.
     */
    kpis: [
      'Venues',
      'Live venues',
      'Live offers',
      'Gift cards stocked',
      'Accounts',
    ],
    /* Index-aligned with `ADMIN_TABS`. */
    tabs: ['Services', 'Offers', 'People', 'Website', 'Messages'],

    services: {
      title: 'Business services',
      lede: 'Every venue on the server. Open one to read what is measured about it.',
      serviceId: 'Service ID',
      copy: 'Copy',
      copied: 'Copied',
      analytics: 'Analytics',
      active: 'Active',
      paused: 'Paused',
      live: 'Live listing',
      /* Not a failed request and not a search coming up short: there are no
         venues. It is what a platform looks like before anybody has signed up,
         and it is the state production is in. */
      none: {
        title: 'No venues yet',
        body: 'A venue appears here once an owner finishes their listing. Verify it in the People tab and its offers can go live.',
      },
    },

    deals: {
      title: 'Offers and gift cards',
      lede: 'Every offer the platform holds and everything on the gift-card shelf — including the paused offers and the drafts, which the customer’s own catalogue cannot show.',
      kinds: { gift: 'Gift card', deal: 'Hot deal' },
      until: 'Until {date}',
      cost: '{n} pts',
      stock: '{n} in stock',
      /* The stored state of an offer, which is what the pill says now that this
         list is not live-only. Keyed rather than index-aligned, and typed as a
         plain record, because it is indexed with a column value from the server
         — a status this dictionary has not heard of falls back to the raw word
         rather than to an empty pill. */
      states: {
        draft: 'Draft',
        scheduled: 'Scheduled',
        live: 'Live',
        paused: 'Paused',
        expired: 'Expired',
      } as Record<string, string>,
      untitled: 'No title yet',
      none: {
        title: 'Nothing on offer yet',
        body: 'Hot deals come from venues once they are verified; gift cards are stocked by the platform.',
      },
    },

    /* ── the write half (`adminControls.tsx`) ────────────────────────────────
     *
     * One block for every press on this console that changes something, because
     * the words are the same wherever the press is: an offer, a venue and an
     * account are removed by the same button with the same two questions around
     * it.
     *
     * The sentence under each destructive one says what is **kept** as well as
     * what goes, and that is the half an operator actually needs. "This cannot
     * be undone" is true of the listing and false of the receipts, and choosing
     * between suspending and removing is exactly that distinction. Every one of
     * them also names the reversible alternative, because the press somebody
     * reaches for is the one they were shown.
     */
    manage: {
      working: 'Working…',
      cancel: 'Cancel',
      dismiss: 'Dismiss',
      failed: 'That did not go through.',


      /* venues */
      suspend: 'Suspend',
      restore: 'Restore',

      /* offers */
      pause: 'Pause',
      resume: 'Resume',
      cardRemoved: 'Taken off the shelf.',
      cardDelisted:
        'Off the shelf, and the row stays: {n} of these have been bought, and the codes in those wallets have to go on naming a brand.',

      /* people */
      ban: 'Suspend',
      letBackIn: 'Let back in',
      password: 'Password',
      passwordFor: 'Set a password for {who}',
      passwordBody:
        'They can sign in with it straight away, and every device they are signed in on is signed out. How they originally signed up does not change.',
      newPassword: 'New password',
      passwordHelp: 'At least {n} characters. Read it out to them — nothing here sends it anywhere.',
      setPassword: 'Set it',
      passwordSet: 'Password set. Every session on that account was signed out.',
      operatorRow: 'Operator',
      closedRow: 'Closed',

      /* ── edit mode ────────────────────────────────────────────────────────
         The toolbar switch, the two icon buttons it puts on every row, and the
         dialogue the bin opens. `editOn` / `editOff` are the two labels of one
         control rather than a state read elsewhere: a button that says what
         pressing it will do needs no second word beside it. */
      edit: 'Edit',
      editOn: 'Done editing',
      editHint: 'Every row can be corrected or removed.',
      editRow: 'Edit',
      deleteRow: 'Delete',
      save: 'Save',
      saved: 'Saved.',

      /* The dialogue. One sentence, the thing's own name in it, and two
         buttons — see `ConfirmDialog` for why the typed answer is gone. */
      deleteTitle: 'Delete {what}?',
      deleteVenue:
        'The venue and everything it owns — its offers, campaigns, budgets, tags and visits — are removed from the database. Suspending is the reversible version.',
      deleteDeal:
        'The offer and the impressions and claims it collected are removed from the database. Pausing is the reversible version.',
      deleteUser:
        'The name, address and profile are erased. If the account has never earned or spent anything the row goes too; if it has, it stays as anonymous rows, because a venue’s receipts have to keep adding up.',
      deleteCard: 'The brand comes off the shelf.',
      deleteYes: 'Yes, delete',
      deleted: '{what} deleted.',
      venueDeleted: 'Venue deleted. {n} offers went with it.',
      userDeleted: 'The account is closed, and no row was left behind.',
      userAnonymised:
        'The account is closed. Its rows stay, anonymous, because a venue’s receipts are derived from them.',

      /* Field labels for the three edit forms. Short, because they sit inside a
         row rather than on a page of their own. */
      fields: {
        name: 'Name',
        city: 'City',
        country: 'Country',
        category: 'Category',
        address: 'Address',
        phone: 'Phone',
        email: 'Email',
        title: 'Title',
        description: 'Description',
        terms: 'Terms',
        until: 'Runs until',
        occupation: 'Status',
      },
    },

    people: {

      title: 'People',
      lede: 'The three seeded accounts, and everyone who has signed up since.',
      columns: ['Name', 'Email', 'Role', 'Joined', 'State'],
    },

    state: {
      player: '{points} pts · {streak}-day streak',
      listing: '{percent}% complete',
      live: 'Live',
      noListing: 'Setup not started',
      undecided: 'Not chosen',
      none: '—',
    },

    note: 'Every figure on this console is read from the server, and nothing here is seeded. What this screen can change, it can only take away or give back: a venue, an offer, an account, a password. No figure anybody reports from is editable from here, and every press is written to the audit log with your name on it.',


    /* ── the fourth tab: the site itself, and the only one that asks a server ── */
    /**
     * The fifth tab, and the second one that asks a server. See
     * `adminMessages.tsx` — it shares the Website tab's `Connect` panel and
     * its `down` sentences, so nothing about being disconnected is written
     * twice.
     */
    /**
     * The sixth tab, and the third that asks a server. It is the one screen
     * that shows the rows in `users` and `venues` — see `adminDatabase.tsx`
     * for why that is not the same question the People tab answers.
     */
    database: {
      title: 'On the server',
      lede: 'Everyone who has signed up, and every venue on the platform. This is the live database, not this browser.',
      switch: 'Which table to show',
      counts: { users: 'active accounts', venues: 'live venues', issued: 'points issued' },
      tables: { users: 'People', venues: 'Venues' },
      /* Eight now. The last is the write half — suspend, password, close — and
         it is a column rather than a menu because there are three of them and a
         table row has the width. */
      userColumns: ['Name', 'Email', 'Signed up with', 'City', 'Points', 'Status', 'Joined', 'Actions'],

      venueColumns: ['Venue', 'City', 'Category', 'Owner', 'Visits', 'Verified'],
      /* The one thing on this screen somebody has to *do*. A venue waits here
         until a person looks; until then its owner's offers cannot go live. */
      review: {
        title: 'Waiting for you',
        lede: 'These venues have finished their listing and cannot publish an offer until somebody checks them.',
        approve: 'Verify',
        reject: 'Reject',
      },
      unnamed: 'No name given',
      verified: 'Verified',
      unverified: 'Not yet',
      noUsers: 'Nobody has signed up yet.',
      noVenues: 'No venues yet.',
      note: 'Showing {n} accounts. Suspending an account, closing one and setting a password are all written to the audit log with your name on them — and an operator’s own row cannot be changed from here at all.',

    },
    messages: {
      title: 'What people wrote',
      lede: 'Messages from the Contact page. Replying is your own mail app — the address is a link.',
      filter: 'Filter by status',
      all: 'All',
      /* Index-aligned with `STATUSES` in `adminMessages.tsx`. */
      statuses: ['New', 'Read', 'Done'],
      empty: 'Nothing here.',
      markRead: 'Mark read',
      markDone: 'Mark done',
      signedIn: 'Has an account',
      wroteIn: 'Wrote in {language}',
    },
    website: {
      title: 'The website',
      lede: 'Visitors, pages and activity, {from} to {to}.',
      loading: 'Asking the server…',
      empty: 'Nothing recorded yet.',
      /* Index-aligned with the six tiles in `adminWebsite.tsx`. */
      kpis: [
        'Visitors (daily, summed)',
        'Visits',
        'Page views',
        'Actions',
        'Signed-in visits',
        'Returning accounts',
      ],
      privacy:
        'A visitor is a hash that changes every day, so nobody is followed between days and no address is stored. That is why there is no “returning visitors” figure for anonymous traffic — it is not measurable, rather than zero.',
      trend: 'Visitors per day',
      pages: 'Most-read pages',
      referrers: 'Where they came from',
      countries: 'Countries',
      devices: 'Devices',
      actions: 'What they did',

      people: {
        title: 'Accounts on the server',
        lede: 'Everyone the backend knows about, newest first.',
        columns: ['Name', 'City', 'Role', 'Points', 'Scans', 'Joined'],
      },

      feed: {
        title: 'Activity',
        lede: 'Everything that has happened across the platform, newest first.',
        kinds: {
          signup: 'Signed up',
          venue: 'New venue',
          transaction: 'Scan',
          voucher: 'Voucher',
          game: 'Game',
        } as Record<string, string>,
      },

      connect: {
        title: 'Connect to the backend',
        lede: 'This tab reads the live server, so it needs the operations account — the one PAYLEZ_ADMIN_EMAIL provisioned, not the demo sign-in.',
        email: 'Operations email',
        password: 'Password',
        submit: 'Connect',
        working: 'Connecting…',
        refused: 'That was refused. Check the address and password.',
        notAdmin: 'That account exists but is not an operator.',
        unreachable: 'No answer. Is the backend running (npm run server)?',
      },

        /* The session went stale. Not a password prompt — the console has no
           login of its own any more; this is the front door. */
        expired: {
          title: 'Your session has expired',
          body: 'Sign in again and the console picks up where it was.',
          again: 'Sign in',
        },
      down: {
        title: 'The backend is not answering',
        unreachable:
          'Nothing is listening. Start it with npm run server, or set VITE_API_URL if it lives somewhere else.',
        refused: 'The server answered, but refused this account.',
        retry: 'Try again',
        disconnect: 'Sign out of the API',
      },
    },

    /* ── one venue, five tabs ── */

    analytics: {
      back: 'All services',
      /* The three figures beside the venue name. */
      totals: ['Total engagement', 'Total vouchers', 'Total scans'],
      /* Index-aligned with `ADMIN_VIEW_TABS`. */
      tabs: ['Dashboard', 'Hot deals', 'Loyalty scans', 'Vouchers', 'Insights'],

      ranges: ['All time', 'Last 7 days', 'Last 30 days', 'Last 90 days'],
      rangesLabel: 'Time range',
      search: 'Search user, code, receipt…',
      records: '{n} records',
      export: 'Export CSV',
      noRows: 'Nothing matches those filters.',

      /*
       * Three sentences for states the seeded console could not be in. A screen
       * that derives a whole month from one number beside a venue's name never
       * has to say it has no source; this one does, per panel and once at the
       * top.
       */
      unmeasured: {
        /** A card, table or chart with no endpoint behind it. */
        noSource: 'Not measured — nothing an operator can read reports this yet.',
        /** The banner: what on this screen is real. */
        measured:
          'Visits and customers are counted, from GET /v1/admin/venues. Everything else on this screen is partner-scoped or not collected, and is shown as “not measured” rather than as a zero.',
      },

      states: { live: 'Active', paused: 'Paused' },
      status: { used: 'Used', active: 'Unused' },

      columns: {
        deals: ['Date', 'Deal', 'User', 'Code', 'Points', 'Discount', 'Status', 'Cheque'],
        scans: ['Date', 'User', 'Points', 'Purchase', 'Receipt', 'Where', 'To next reward'],
        vouchers: ['Date', 'Code', 'Type', 'User', 'Reward', 'Points', 'Status', 'Cheque'],
      },

      /* The nine Dashboard cards, index-aligned with `ADMIN_CARD_ICONS`. */
      cards: [
        { label: 'Google Maps clicks', note: 'Taps on the directions button' },
        { label: 'Website clicks', note: 'Visits sent from the listing' },
        { label: 'Phone clicks', note: 'Call attempts' },
        { label: 'Instagram clicks', note: 'Profile visits from the app' },
        { label: 'Total vouchers', note: '{used} used · {active} active' },
        { label: 'Loyalty vouchers', note: '{used} used · {active} active' },
        { label: 'Total discount value', note: 'Of the cheques it was used on' },
        { label: 'Total engagement', note: 'Every interaction, added up' },
        { label: 'Total scans', note: 'QR scans at the counter' },
      ],

      trend: {
        title: 'Engagement trend',
        lede: 'Last 30 days',
        empty: 'No trend data yet.',
      },

      hot: {
        title: 'Hot deals',
        lede: 'Time-bound offers this venue is running.',
        empty: 'This venue has not run an offer yet.',
        counts: ['Active', 'Redemptions', 'Paused'],
        points: '{n} pts',
        expires: 'Expires {date}',
        redemptions: '{n} redemptions',
        tableTitle: 'Hot deal redemptions',
      },

      loyalty: {
        settingsTitle: 'Loyalty scan settings',
        settingsLede: 'What a scan at the counter is worth, and how often it counts.',
        perVisit: 'points per visit',
        cooldown: 'between scans',
        hours: '{n}h',
        campaignsTitle: 'Loyalty voucher campaigns',
        campaignsLede: 'Automatic rewards for customers who keep coming back.',
        campaignsEmpty: 'No loyalty campaigns yet.',
        every: 'Every {n} visits',
        reward: '{n}% off the next one',
        tiles: [
          { label: 'Total scans', note: '{n} points awarded' },
          { label: 'Scan sales', note: 'from {n} scans' },
          { label: 'Average purchase', note: 'per scanned visit' },
        ],
        tableTitle: 'Loyalty scans',
        trendTitle: 'Daily scans',
        trendLede: 'Last 30 days',
        trendEmpty: 'No scans yet.',
      },

      vouchers: {
        campaignTitle: 'Discount voucher campaign',
        campaignKind: 'Budget-based · {n} issued',
        usage: 'Budget usage',
        used: '{used} of {total}',
        left: '{amount} left',
        points: 'Points',
        issued: 'Issued',
        cap: 'Monthly cap',
        tiles: [
          { label: 'Total sales', note: 'from {n} redemptions' },
          { label: 'Average basket', note: 'per voucher used' },
        ],
        tableTitle: 'Vouchers',
        types: { discount: 'Discount', loyalty: 'Loyalty' },
        dailyTitle: 'Daily sales trend',
        dailyLede: 'Last 30 days, cheque totals',
        dailyEmpty: 'No sales yet — cheque totals appear here once vouchers are used.',
        monthlyTitle: 'Sales generated',
        monthlyLede: 'Monthly cheque value from redemptions',
      },

      insights: {
        citiesTitle: 'Top cities',
        citiesLede: 'Where the customers come from',
        citiesEmpty: 'No city data yet.',
        langsTitle: 'Customer languages',
        langsLede: 'What they read the listing in',
        langsEmpty: 'No language data yet.',
        compareTitle: 'Against the country average',
        compareLede: 'How this venue compares to similar services',
        mine: 'This venue',
        avg: 'Country average',
        axis: ['Maps', 'Website', 'Phone'],
      },
    },
  },

  /* ────────────────────────────────────────────────────────── assistant ── */

  assistantPanel: {
    title: 'AI Assistant',
    close: 'Close the assistant',

    /* Signed out. */
    lockedTitle: 'Sign in to ask',
    lockedBody:
      'The assistant answers from your own points, vouchers and city. That needs an account.',
    lockedAction: 'Sign in',

    /* Signed in — the greeting takes the first name only. */
    greeting: 'Hello, {name}',
    lede: 'Ask about anything — points, vouchers, paperwork, or where to find something near you.',
    placeholder: 'Ask anything…',
    send: 'Send',
    suggestions: [
      'How many points do I need for a voucher?',
      'How do I register my address?',
      'What is open near me right now?',
    ],
    you: 'You',
    /* Honest rather than a canned answer that pretends to be one. See the
       note in `AssistantDock.tsx`. */
    stubReply:
      'The assistant is not connected to a model in this build, so I cannot answer that yet. Everything around this message — the thread, the composer, your account — is real and working.',
    /* A footnote under each reply, not a chip over it — see `.ai-note`.
       So it is a sentence now rather than a label. */
    stubTag: 'No model is connected in this build.',
  },

  /* ────────────────────────────────────────────────────────────── wallet ── */

  wallet: {
    title: 'Your vouchers',
    lede: 'Everything you have earned, and everything you have spent.',
    balance: 'Balance',
    points: 'pts',
    /* `{n}` is how many points short the cheapest card on the shelf is. */
    shortBy: '{n} points from your next gift card',
    canRedeem: 'Enough for a gift card',
    /* The shelf is empty. Not "you are 0 points short" — there is nothing to be
       short of, and saying so is the difference between a wallet that is
       waiting for you and one that is waiting for us. */
    noShelf: 'Nothing on the shelf yet — your points are safe until there is.',

    loading: 'Asking the server…',

    /* When the request itself did not come back. A catalogue that renders
       "nothing available" because the backend is down has told somebody the
       product is empty, which is the one thing this page must never do. */
    down: {
      unreachable: 'We could not reach the server, so this is not "nothing" — it is "we could not ask". Try again in a moment.',
      refused: 'The server answered but refused the request. Signing in again usually fixes it.',
      retry: 'Try again',
    },

    tabs: ['Active', 'Used'],

    valid: 'Valid until {date}',
    cost: '{n} pts',

    emptyActive: 'Nothing in the wallet yet. Play a round and spend the points here.',
    emptyUsed: 'Nothing spent yet.',
    play: 'Play a round',

    /* A discount voucher has no venue name on it — the row stores an id and
       nothing else — so the card is named by what it *is*. */
    voucherTitle: 'Discount voucher',
    noVouchers: 'No vouchers yet. They are issued at a venue when you spend points there.',

    catalogue: 'What you can get',
    catalogueLede: 'Gift cards bought with points. What is here is what the platform has stocked.',
    redeem: 'Redeem',
    short: 'Not enough points',
    soldOut: 'Out of stock',
    /* `{n}` is how many are left. There is no "of" — the shelf records stock,
       not an allocation, so a bar has no denominator to draw against. */
    left: '{n} left',
    buying: 'Buying…',
    buyFailed: 'That did not go through, and nothing was charged. Try again.',
    priorityOnly: 'On a paid plan only',
    noShelfYet: 'No gift cards stocked yet. Points keep — this fills up as brands come on.',

    atCounter: 'A code is read at the counter. Nothing here is spent until somebody scans it.',

    /* ── stamp cards ──
       Visits, not points. The distinction is the one sentence about this
       section that has to survive every rewrite — a player who reads a stamp as
       a second currency will try to spend it at the next venue on the list. */
    stamps: {
      title: 'Stamp cards',
      lede: 'Each card counts visits to one venue. Visits are not points and cannot be spent anywhere else.',
      progress: '{done} of {of}',
      /* Three states, not two: a card nobody has visited yet reads differently
         from one in progress, and it is the state a new card is always in. */
      empty: 'No visits yet — {of} visits earn {reward}',
      going: '{left} more for {reward}',
      goingOne: 'One more visit for {reward}',
      full: 'Complete — {reward} is waiting at the counter',
      cycles: 'Filled {n}× before',
      none: 'No stamp cards yet. One starts on your first scanned visit to a venue running a card.',
    },

    /* ── hot deals ──
       The board at the top of the page: what is on offer, read from the server.
       Nothing here is claimed from a web page — see `claimAtCounter`. */
    deals: {
      title: 'Hot deals',
      lede: 'Live offers from venues near you. Most cost nothing — the venue is paying for them.',

      /* The category strip. `all` is deliberately not one of the chips: it is
         the absence of a filter rather than something a venue can be. The chips
         themselves are built from the categories the offers actually carry, so
         there is no list of them here. */
      all: 'All',
      filter: 'Filter by category',
      /* `{category}` is whichever chip is selected. */
      noneHere: 'Nothing under {category} right now.',
      showAll: 'Show every offer',
      /* No offers at all — which is what a new market looks like, and is not
         the same sentence as the filter coming up empty. */
      noneAtAll: 'No live offers yet. They appear here as venues join and publish them.',

      until: 'Until {date}',
      free: 'Free to claim',
      /* `{n}` is the shortfall, not the price — the app's own wording, because
         "500 pts" on a line a balance cannot reach says the wrong half. */
      shortBy: '{n} more points to go',
      code: 'Your code',

      /* The board is read-only, and the button says what the offer requires
         instead of pretending to hold it. A claim is written by the venue's
         scan; nothing a browser can post makes one. */
      howToClaim: 'How to claim',
      hideTerms: 'Close',
      claimAtCounter: 'Show the offer at the counter and the venue scans it. That scan is what claims it — nothing on this page can.',
    },

    /* ── what you have already taken ──
       Everything below the board: the discount vouchers issued at a venue and
       the gift cards bought with points. Both are things you hold rather than
       things on offer, which is the whole reason they are down here. */
    redeemed: {
      title: 'Redeemed',
      lede: 'What you have already taken. Show the code at the counter — each one is used once.',
      vouchersTitle: 'Discount vouchers',
      vouchersLede: 'Points spent at one venue. The venue reads the code at the till.',
    },

    /* The gift-card section's own heading. The holdings below it were the whole
       page once, which is why the tabs above them have no heading of their own. */
    giftsTitle: 'Gift cards',
    giftsLede: 'Paid for by Paylez. A fixed amount, spent like money at the place named on the card.',
  },

  /* ────────────────────────────────────────────────────────────── games ── */

  games: {
    title: 'Brain Games',
    lede: 'Challenge yourself, earn points and convert them into discount vouchers.',

    score: 'Score',
    streak: 'Streak',
    /* The gauge on the Play screen. The pool was called lives while a round
       could be survived; it bounds a day now, so it is energy — and the word
       had to move with the mechanic, or the screen would explain itself with a
       noun nothing else on it uses. */
    energy: 'Energy',
    freezes: 'Freezes',
    answered: 'Answered',
    correctLabel: 'Correct',
    /* The reward connection, in two words: what the balance is for. */
    toVoucher: 'To a voucher',

    redeemTitle: 'Turn points into rewards',
    redeemAction: 'Redeem now',

    /*
     * The points panel at the top of the screen.
     *
     * `pointsGoal` and `pointsHave` are alternatives, not halves — the balance
     * either does or does not reach the next rung of the voucher ladder, and
     * exactly one of them is shown. Each carries its whole clause rather than a
     * fragment glued to `pointsUnit`, because "60 more for" does not sit in the
     * same order in five languages.
     *
     * `pointsGoal` **names the rung**, and that is the whole of the change from
     * what it used to say — "39 more for the next discount". What a discount
     * costs is the number the player is actually working toward, and the
     * sentence was the only place on the screen it could have appeared; the bar
     * underneath already says "you are partway to a thing", which is the half
     * the words were repeating.
     */
    pointsKicker: 'Your points',
    pointsUnit: '{points} points',
    pointsGoal: '{points} more to reach {target}',
    pointsHave: 'enough for a discount already',

    /* The stats strip. Five figures behind one disclosure now: the streak and
       the freezes that were in its top line have a section of their own, at the
       size of things a player actually looks at, and the balance is the
       headline of the panel above. What is left here is the history — the
       readings that are worth having and are worth nobody's first glance. */
    statsToggle: 'Your stats',
    accuracy: 'Accuracy',

    /*
     * The badge on the featured game. It says what the card is *for* — any
     * round keeps the streak, but this is the one the screen puts first, so it
     * is the one that has to say so out loud.
     */
    featured: 'Today’s game · keeps your streak',

    /*
     * ── the streak row ──
     *
     * Seven circles, one per day of this week, and a currency mark in every one
     * that was kept. The words are few on purpose: the row is a picture, and
     * the two hints below it are the only things it cannot draw — what keeps a
     * streak, and what a freeze is for.
     *
     * There are **no weekday names here**, and that is deliberate rather than
     * missing. A weekday belongs to the reader's language and `Intl` already
     * knows all five of them; five dictionaries carrying seven initials each is
     * thirty-five strings to keep in step for something the platform hands over
     * correct. Compare `untilNextEnergy` in `games.tsx`, which takes the same
     * side for the same reason — and `fx.ts`, which refuses `Intl` for money on
     * the opposite ground.
     */
    /*
     * The local quiz, named per country rather than per language.
     *
     * A **map, not a template**. "{country} Quiz" would need the country in
     * whatever case the sentence governs, and Russian wants "Викторина о
     * Польше" against "Викторина об Узбекистане" — a preposition that changes
     * with the word after it. Each entry is a whole, grammatical name instead,
     * which is the same call `wordGame.lists` makes for the same reason.
     *
     * Keyed by ISO country code, and the keys are `QUIZ_BANK_FOR_COUNTRY`'s in
     * `games/banks.ts`. A country in that table with no name here falls back to
     * `names`' own slot rather than rendering nothing.
     */
    localQuiz: { PL: 'Poland Quiz', UZ: 'Uzbekistan Quiz' },

    streakHint: 'One round a day keeps it',
    freezesHint: 'Each one covers a day you miss',
    /* The three states a circle can be in, for the label a screen reader gets.
       Lower case because they are read as a fragment after the day's name. */
    streakKept: 'kept',
    streakMissed: 'missed',
    streakAhead: 'still to come',

    /*
     * Index-aligned with `GAMES` in `content.ts`, which means **this is the
     * order the screen draws them in** — the first is the featured card and the
     * rest fill the grid. Reordering here without reordering there renames
     * every game on the page.
     *
     * The last entry carries a `{language}` hole rather than a language: it is
     * the local Word Builder, and which list that is depends on the country on
     * the player's profile (`wordListFor` in `games/banks.ts`). Every name is
     * run through `fill()` at the call site, so the seven without a hole are
     * unaffected.
     */
    names: [
      'Memory Match',
      'Squawk’s Flight',
      'Guess the Flag',
      'Country & Capital',
      'Brain Games',
      /* The local quiz's name is not here — it depends on the country on the
         profile, so it comes from `localQuiz` below. The slot is kept so the
         array stays index-aligned with `GAMES`, and it is what a reader sees if
         a country somehow resolves to no name at all. */
      'Local Quiz',
      'Word Builder · English',
      'Word Builder · {language}',
    ],
    /* `{questions}`, `{seconds}`, `{points}` and `{mistakes}` are filled from the
       game's own row, so a rules line never disagrees with the game it labels. */
    rule: '{questions} questions · {seconds} sec each',
    /*
     * What a round pays, in the order it pays it.
     *
     * The old line led with the mistake allowance — "1 mistake allowed" — which
     * was the first thing a player read about a quiz and is now not a rule at
     * all: every round runs to the fifth question however many go wrong. What
     * replaced it is the thing worth aiming at. `{bonus}` is the perfect bonus
     * and the fastest speed band added together, because they are only ever
     * earned together and two numbers here would be a sum a card asked the
     * reader to do.
     */
    reward: '+{points} per correct answer · +{bonus} for a fast clean sweep',
    start: 'Start game',
    /* The short label, for the cards in the grid — six of them side by side,
       where "Start game" wraps and the surrounding card already says which. */
    play: 'Play',
    /* The state only, never the wait: energy comes back one at a time rather
       than all of it at midnight, and the screen already prints the real
       countdown under the gauge (`+1 in 3 hours`, plural-correct per
       language). A "come back tomorrow" here was both wrong and a second,
       disagreeing answer to the question the countdown is already answering. */
    noEnergy: 'Out of energy',
    /*
     * ── practice ──
     *
     * What the Play button says on an empty tank. It used to say `noEnergy` on
     * a button that was switched off, which is a card refusing to be pressed
     * and explaining why — and the explanation is already under the gauge, in
     * words and with a countdown. The press exists now, so the label is the
     * offer rather than the refusal.
     *
     * One word, because it sits where "Play" sits on seven other cards and the
     * grid does not resize itself for the state of the tank.
     */
    practice: 'Practice',
    /* The gauge, once the tank is empty: what running out actually costs now
       that it no longer costs the round. Under `noEnergy`, which still says the
       state, because "you have none" and "here is what that means" are two
       sentences and only the first is a heading. */
    practiceFree: 'Rounds are free while it refills — they just don’t pay.',
    /* The banner across a round being played for nothing. Present on every
       question rather than shown once at the start: a player who pressed Play
       on a full tank yesterday and an empty one today is looking at the same
       screen, and the difference has to be on it. */
    practiceRound: 'Practice round — no points',
    /*
     * The result card's line under a zero, replacing `resultNone`: this round
     * was never going to pay, which is a different thing from a round that
     * scored nothing.
     *
     * It deliberately does **not** quote what the round would have been worth.
     * That is a second figure on a card whose whole design is one — the "scored
     * versus banked" pair this screen already carried once and lost — and it
     * would have to be a number the server does not send, invented on the one
     * path where the client is not allowed to score.
     */
    practiceResult: 'Practice round — nothing banked. The next energy pays again.',
    /* The gauge's line when the tank is full and there is nothing to count to. */
    energyFull: 'Full — nothing to wait for',
    /*
     * The countdown, beside the count rather than under the gauge.
     *
     * `{time}` arrives already written — "3h 12m", or "45m" under the hour —
     * from `untilNextEnergy` in `games.tsx`, which builds it out of `Intl` in
     * the reader's own language. So this string is only the frame around it,
     * and the frame is what has to translate: the "in" belongs to a sentence
     * and the number does not.
     *
     * It says **hours and minutes**, which reverses a rule that used to be
     * written here: one unit, never two, on the grounds that "in 3 hours 12
     * minutes" is a stopwatch where a player only wants to know whether to wait.
     * That was right about the sentence under the gauge and wrong beside the
     * figure — this is the line somebody reads when they have decided to wait
     * and want to know for how long, and "in 3 hours" leaves them checking back
     * at a quarter past.
     */
    energyNext: '+1 in {time}',
    /* What a round costs, said once on the screen rather than on seven cards.
       It is the rule the whole page turns on and it was nowhere on it: a player
       met the cost by running out. Deliberately unitless — the noun is the
       gauge's own heading two lines above. */
    energyCost: '1 per round',
    /* The banks are fetched on first play; this is the beat before a round. */
    loading: 'Dealing…',

    /*
     * ── the card previews ──
     *
     * The words in the working miniature a card plays when it is hovered. The
     * structural half — the flag's code, the deck cards, the words — is
     * `PREVIEW` in `content.ts`, and its comment carries the reasoning.
     *
     * These are **real questions of the kind the banks ask**, and they are fixed
     * samples rather than draws from them: the general bank is 220 kB and a
     * pointer crossing a card must not fetch it. What a sample can promise that
     * a draw cannot is that it is short enough to read at preview size, which
     * is the constraint that actually decides these.
     *
     * `options[0]` is the right answer everywhere here — the preview lights the
     * first one — so a translation must keep the order, not just the words.
     *
     * The two prompts that already exist are reused rather than restated:
     * `whichCountry` and `whichCapital` are what the real rounds ask, so the
     * flag and capital previews ask them too and cannot drift from the game.
     */
    preview: {
      /* The three answers under the flag. The first names `PREVIEW.flagCode`,
         which is `PL` — translate the country, not the code. */
      flag: ['Poland', 'Ukraine', 'Spain'],
      /* `country` is filled into `whichCapital`; the first option answers it. */
      capital: { country: 'Poland', options: ['Warsaw', 'Kraków', 'Gdańsk'] },
      brain: {
        q: 'Which planet is called the Red Planet?',
        options: ['Mars', 'Venus', 'Jupiter'],
      },
      /*
       * One sample per local bank, because the card is a different quiz per
       * country and a preview asking about Poland on an Uzbek player's card
       * would be advertising the wrong game — which is the exact failure the
       * previews were built to stop.
       *
       * The Uzbekistan sample is **a real row from the export**, questions 88 of
       * `updates/Uzbekistan_Quiz_Questions_data_part2.csv`, already written in
       * all five languages by whoever wrote the bank. Nothing here was invented
       * for the preview, which is the whole rule `PREVIEW` states in
       * `content.ts` — and it is also why this one needed no translator.
       */
      local: {
        PL: {
          q: 'What is the currency of Poland?',
          options: ['Złoty', 'Euro', 'Koruna'],
        },
        UZ: {
          q: 'How many countries does Uzbekistan share a land border with?',
          options: ['Five', 'Three', 'Seven'],
        },
      },
    },

    /* In play. */
    question: 'Question {n} of {total}',
    whichCountry: 'Which country is this?',
    whichCapital: 'What is the capital of {country}?',
    quit: 'Give up',
    timeUp: 'Time',

    /* The result card. */
    wonTitle: 'Round won',
    lostTitle: 'Round over',
    resultScore: '{correct} of {total} correct',
    resultPoints: '+{points} points',
    resultNone: 'No points this round.',
    /* Never a bare score: what the points are *for* is the reason to play the
       next round, so the card always says how far off the nearest reward is. */
    resultToward: '{points} more and the first voucher is yours.',
    resultAfford: 'You have enough for a voucher — go and spend it.',
    resultSpend: 'Spend points',
    resultStreak: 'Streak: {streak} days',
    again: 'Play again',
    backToGames: 'Back to the games',

    boardTitle: 'Leaderboard',
    boardTabs: ['Correct answers', 'Points earned'],
    boardTop: 'Top 10',
      /* The three scopes, index-aligned with `SCOPES` in `api/board.ts`. */
      boardScopes: ['My city', 'My country', 'Everyone'],
      boardLoading: 'Reading the board…',
      boardOffline: 'We cannot reach the board right now. It is not that nobody is playing — we just cannot ask.',
      boardHidden: 'You are {rank} this week. You are not listed because you have not turned that on — you can, in your profile.',
    /* The signed-in player's own row on the leaderboard. Everybody else is a
       derived PY-code; this one is the second person, because a board you are
       on should say so in words rather than in a code you have to recognise. */
    boardYou: 'You',
    boardStreak: '{n} day streak',
    boardCorrect: 'correct',
    boardPoints: 'points',
    boardEmpty: 'No players yet. Be the first!',
    boardShowAll: 'Show all top 10',
    boardShowLess: 'Show fewer',

    /*
     * The arcade round. Nested rather than flat so the other four dictionaries
     * fail to compile until they carry it — `Dictionary` is `typeof en`, which
     * catches a missing key but would say nothing about a missing array entry.
     */
    flight: {
      rule: 'Fly as far as Squawk can · it speeds up as you go',
      reward: 'One crash ends it · +{points} a gap · up to {max} a flight',
      goal: '{target} to bank the round',
      hint: 'Tap the screen to flap',
      resume: 'Tap to pick up where you left off',
      aria: 'Flight game. Tap the stage to flap.',
      crashed: 'Squawk clipped a column',
      resultScore: '{cleared} gaps flown',
      motionTitle: 'This one moves',
      motionBody:
        'Your device asks for less motion, and this game is continuous movement across the screen — there is no still version of it. The other games are quizzes and puzzles, and they stay put. If you would rather fly anyway, everything that is not the game itself will hold still.',
      motionPlay: 'Play anyway',
      motionBack: 'Back to the games',
    },

    /*
     * Memory Match. Nested for the same reason the flight round is: a missing
     * key is a build error in the other four dictionaries, a missing array entry
     * would not be.
     *
     * The question banks the four quizzes used to read from are gone from here —
     * five hardcoded questions each. They now come from the generated banks in
     * `games/data/`, which is 2102 general questions, 98 on Poland, 196 flags and
     * 196 capitals, drawn through a bag that exhausts before it repeats.
     */
    memory: {
      rule: '{pairs} pairs · the clock counts up',
      /* Both figures come from `MEMORY_BANDS` — the top band's ceiling and what
         it pays. A card that stated the seconds itself would be the one place
         the bands could move without the copy noticing. */
      reward: 'Under {seconds} seconds pays {points} · slower pays less',
      pairs: 'Pairs {found} / {total}',
      moves: '{n} moves',
      facedown: 'Face-down card',
      /* A card that has been turned and whose face has not arrived. Only a
         server board has one: it holds the layout, so a face is something this
         screen is told rather than something it knows. */
      turning: 'Turning over…',
      hint: 'Turn two cards over. Match them and you keep the word.',
      /* The same line for a board dealt by the server, which has no word to
         keep — its faces are symbols. Promising one and paying out nothing is
         the version of this that reads as a bug. */
      serverHint: 'Turn two cards over. Both faces show — remember where they were.',
      resultScore: '{pairs} pairs found',
    },

    /*
     * Word Builder. `wordGame` and not `word`, because `word` reads like a
     * string and this is a screen.
     *
     * `lists` names the language being *practised*, which is not the language
     * the site is being read in — hence its own picker on the card.
     */
    wordGame: {
      rule: '{words} words · easy to hard',
      reward: 'A word pays its difficulty · a hint halves it',
      /* Names the list being practised, which is what tells the catalogue's two
         Word Builder cards apart — one is always English, the other is the
         language of the city on the profile. It is *not* the language the site
         is being read in. The picker this used to label is gone: the choice is
         two cards now, so every card in the grid is one press. */
      lists: { pl: 'Polish', en: 'English' },
      tier: 'Level {n}',
      undo: 'Undo',
      clear: 'Clear',
      reveal: 'Hint',
      next: 'Next word',
      finish: 'See the result',
      correct: 'Correct · +{points} points',
      resultScore: '{solved} of {total} words built',

      /*
       * ── the three the server round needs ──
       *
       * A round played on the server does not know whether the word is right
       * until it asks, and these are the three answers a local round never has
       * to give.
       */
      /* The beat between the last letter landing and the verdict. It exists
         because the board goes still while the request is in the air, and a
         board that goes still on its own reads as a press that missed. */
      checking: 'Checking…',
      /* The day's hints are a plan entitlement (`word_hints_per_day`) and the
         server refuses past it. It says the allowance rather than the failure:
         the rule is working, and "something went wrong" would be a lie about it.
         No letter is revealed and the word is not charged for one. */
      hintsSpent: 'No hints left today',
      /* A move that never reached the server — a guess or a hint. The server's
         own tally is what pays, so the honest thing to say is that this one is
         not in it. Deliberately says nothing about the *word*: it covers a
         refused hint too, where nothing was submitted at all. */
      unsent: 'That did not reach us',
    },
  },

  /* ──────────────────────────────────────────────────────────── listing ── */

  listing: {
    setupEyebrow: 'Set up your venue',
    setupTitle: 'Tell us about your business.',
    setupLede:
      'Everything here goes straight into your listing in the Paylez app. Fields marked with a star are needed before it can go live.',

    screenTitle: 'Business profile',
    screenLede: 'Your listing in the Paylez app, translated for every customer.',

    sections: {
      basic: 'Basic information',
      where: 'Where you are',
      reach: 'How customers reach you',
      service: 'Service and hours',
    },

    fields: {
      name: 'Business name',
      namePlaceholder: 'The name above your door',
      category: 'Category',
      subcategory: 'Subcategory',
      description: 'Description',
      descriptionPlaceholder: 'Two or three lines on what you do and who comes to you.',
      descriptionHelp: 'Paylez translates this for customers reading in another language.',
      price: 'Typical price',
      pricePlaceholder: '25–45 zł',
      priceHelp: 'What one customer usually spends.',
      logo: 'Logo',
      logoHelp: 'Square, at least 512 px.',
      logoChoose: 'Choose a file',
      logoReplace: 'Replace',
      logoRemove: 'Remove',

      country: 'Country',
      city: 'City',
      cityPlaceholder: 'Kraków',
      street: 'Street address',
      streetPlaceholder: 'Street and building number',
      maps: 'Google Maps link',
      mapsHelp: 'The tap-to-navigate button in the app uses this.',

      phone: 'Phone',
      phonePlaceholder: '+48 123 456 789',
      email: 'Email',
      emailPlaceholder: 'contact@business.com',
      emailError: 'That does not look like an email address.',
      website: 'Website',
      instagram: 'Instagram',
      appStore: 'App Store link',
      googlePlay: 'Google Play link',
      appLinksShow: 'Add App Store and Google Play links',
      appLinksHide: 'Hide app links',

      spoken: 'Languages your staff speak',
      hours: 'Opening hours',
    },

    /* Index-aligned with `BUSINESS_CATEGORIES` in `content.ts`. */
    categories: [
      'Café',
      'Restaurant',
      'Barbershop',
      'Beauty salon',
      'Dental clinic',
      'Language school',
      'Fitness',
    ],
    /* One array per category, in the same order. */
    subcategories: [
      ['Specialty coffee', 'Bakery café', 'Brunch spot', 'Tea house'],
      ['Polish', 'Georgian', 'Turkish', 'Pizza', 'Sushi'],
      ['Classic barber', 'Beard and shave', 'Kids cuts'],
      ['Nails', 'Hair', 'Brows and lashes', 'Massage'],
      ['General dentistry', 'Orthodontics', 'Implants'],
      ['Polish for foreigners', 'English', 'Exam prep'],
      ['Gym', 'Yoga studio', 'Boxing club'],
    ],
    countries: ['Poland', 'Ukraine', 'Georgia', 'Turkey', 'Uzbekistan', 'Azerbaijan'],
    spokenLanguages: ['Polish', 'English', 'Ukrainian', 'Russian', 'Turkish', 'Uzbek'],
    hoursDays: ['Monday to Friday', 'Saturday', 'Sunday'],

    ready: {
      title: 'Ready to go live',
      /* `{percent}` is a whole number; the sentence carries the sign. */
      progress: '{percent}% complete',
      stillNeeded: 'Still needed:',
      done: 'Everything required is filled in. Your listing is live in the app.',
    },

    preview: {
      title: 'How it looks in the app',
      cover: 'Cover photo',
      name: 'Your business name',
      address: 'Add your address',
      price: 'Price on request',
      description: 'Write a short description so customers know what you do.',
      reviews: '312 reviews',
      note: 'Your rating and review count come from customers in the app. You cannot edit them here.',
    },

    save: 'Save and continue',
    saved: 'Saved.',
    saveProfile: 'Save changes',
  },

  /* ────────────────────────────────────────────────────────── dashboard ── */

  dashboard: {
    tag: 'Partner',
    groups: { grow: 'Grow', workspace: 'Workspace' },
    /* Index-aligned with `DASH_SCREENS` in `content.ts`. */
    screens: [
      { name: 'Overview', lede: 'What Paylez did for you, and what it cost.' },
      { name: 'Hot deals', lede: 'Time-bound offers shown in the Paylez app feed.' },
      { name: 'Loyalty campaigns', lede: 'Recurring rewards your regulars earn by coming back.' },
      { name: 'Vouchers', lede: 'How points turn into discounts, and what that costs you.' },
      { name: 'Customers', lede: 'Who comes in, when they come, and whether they come back.' },
      {
        name: 'Assistant',
        lede: 'Say what you want to happen. I set it up, you decide whether it goes live.',
      },
      { name: 'Scan activity', lede: 'Every QR scan at your counter, newest first.' },
      { name: 'Business profile', lede: 'Your listing in the Paylez app, translated for every customer.' },
    ],
    /* Every screen but the profile has nothing in it until a venue starts
       trading, so each says what would fill it and what to do about it. */
    empty: [
      {
        title: 'Nothing is running in your venue yet',
        body: 'Customers only see you in the Paylez app once something is live. A hot deal is the quickest start — an open offer with a start and end date, running in the hours you choose.',
        action: 'Create your first hot deal',
      },
      {
        title: 'Run an offer anyone can use',
        body: 'A hot deal appears in the app feed for the audience and hours you choose, and stops on the date you set. Nothing is charged until someone claims one.',
        action: 'Create hot deal',
      },
      {
        title: 'Reward your regulars for coming back',
        body: 'A campaign counts visits and hands out a reward when someone reaches the number you set. A good first one for a café: four visits, a free filter coffee.',
        action: 'Set up a campaign',
      },
      {
        title: 'Set a discount budget to start giving vouchers',
        body: 'A discount budget is the most you will give away in one month. Vouchers stop when it runs out, so you can never spend more than you planned.',
        action: 'Set a budget',
      },
      {
        title: 'Put your QR code on the counter',
        body: 'Nothing on this page can fill in until customers start scanning. Print your code, stand it next to the till, and ask staff to point at it with the bill. The first numbers show up the same day.',
        action: 'Get your QR code',
      },
      {
        title: 'Tell me what you want to happen',
        body: 'I read your quiet hours, your budgets and what works at venues like yours, then set the whole thing up for you to check. Nothing goes live until you press publish.',
        action: 'Start a conversation',
      },
      {
        title: 'No scans yet',
        body: 'Every scan at your counter lands here within seconds — who came in, what they spent, and how close they are to a reward.',
        action: 'Get your QR code',
      },
    ],
    /*
     * Every control that reaches the server, and every ending a press can have.
     *
     * This block replaced `notWired` — one honest line standing in for forty
     * buttons that did nothing. It is not that sentence translated forty times;
     * it is what is left once each of those buttons does the thing its own
     * label says. Six verbs, six confirmations and two failures, shared by the
     * deals table, the campaigns table, the voucher ladder, the budget and the
     * queue at the counter, because the same act must not be called two things
     * on two screens.
     *
     * The two failures are two because they have two different fixes: the
     * server was not there, or it was there and refused. Only the second is
     * worth reading a reason for, and `{why}` is the server’s own words.
     */
    acts: {
      column: 'Actions',

      publish: 'Publish',
      pause: 'Pause',
      resume: 'Resume',
      extend: 'Extend',
      end: 'End it',
      /* One accent means a button cannot be red, so the one change that cannot
         be undone asks its question in words instead. */
      endSure: 'Sure?',
      notify: 'Notify',
      send: 'Schedule it',
      save: 'Save',
      close: 'Close',
      refresh: 'Refresh',
      until: 'New end date',
      sendAt: 'When it goes out',

      published: 'Published. It is live in the app.',
      paused: 'Paused. Customers can no longer see it.',
      resumed: 'Running again.',
      extended: 'The end date moved.',
      ended: 'Ended. That one is not coming back.',
      notified: 'The notification is scheduled.',

      offline: 'We could not reach the server. Nothing changed — try again in a minute.',
      refused: 'The server would not do that: {why}',

      /* ── the month’s money ── */
      budgetTitle: 'Set your monthly budget',
      budgetLede:
        'One total for the month, split between loyalty rewards and voucher discounts. It cannot go below what you have already spent or set aside.',
      budgetTotal: 'Total for this month',
      budgetShare: 'Share for loyalty',
      shareUnit: '% to loyalty',
      budgetShareNote: '{loyalty} for loyalty rewards, {voucher} for voucher discounts.',
      budgetSaved: 'Your budget is saved.',
      moveTitle: 'Move money between the two pools',
      moveAmount: 'How much to move',
      moveDo: 'Move it',
      moveDir: '{from} → {to}',
      moveNote:
        'Only money that is still available moves. Anything set aside belongs to a customer who has already earned it.',
      moved: 'Moved.',
      hint: 'Your {to} pool is nearly out and {from} has room. About {amount} is worth moving.',
      pools: { loyalty: 'Loyalty', voucher: 'Vouchers' },

      /* ── what points buy ── */
      ladderEdit: 'Change what points buy',
      ladderDone: 'Done',
      tierPct: 'Discount',
      tierPoints: 'Points it costs',
      tierCap: 'Most off one bill',
      pctUnit: '% off',
      tierAdd: 'Add a tier',
      tierRetire: 'Retire',
      tierRetired: 'That tier is retired. Vouchers already given out at it still work.',
      tiersSaved: 'Your point tiers are saved.',
      tierDuplicate:
        'Two tiers cannot offer the same discount — the second would replace the first.',

      /* ── the counter ── */
      queueTitle: 'Waiting to be confirmed',
      queueLede:
        'A customer has scanned and nothing has been given yet. Confirm it and the points, stamps and discounts all happen at once.',
      queueEmpty:
        'Nothing is waiting. A scan appears here within seconds of a customer holding up their phone.',
      confirm: 'Confirm',
      turnAway: 'Turn it away',
      confirmed: 'Confirmed. The customer has their points.',
      turnedAway: 'Turned away. Nothing was given.',
      /* Not a figure and not a 0: at a venue where the cashier enters the
         bill this is the field, and where the customer does it this is what
         the row is waiting on. Neither is 'they bought nothing'. */
      billLabel: 'Bill total',
      waitingCustomer: 'Waiting for the customer to enter the bill',
      openedAt: 'Scanned at {at}',
      intents: {
        earn: 'Earning',
        voucher_redeem: 'Voucher',
        reward_redeem: 'Reward',
      },

      /* ── the two buttons above every screen ── */
      exportLocked: 'A CSV export is not included on this venue’s plan.',
      previewTitle: 'Your listing, as customers see it',
      previewLede:
        'Read back from the server, so this is the version that was saved rather than the one in the form.',
      previewVouchers: 'Points accepted here',
      previewNoVouchers: 'Points not accepted here yet',
    },

    /*
     * What a panel says when the figure behind it cannot be read.
     *
     * Every one of these describes a state the seeded dashboard could not be
     * in: a screen that invents its own numbers never has to say it could not
     * read any. **None of them is a zero.** "We could not ask" and "we asked,
     * and the answer is nothing" are different findings, and the union
     * `useApi` returns exists so a screen cannot confuse them.
     */
    unmeasured: {
      /** Why every figure on the screen is missing, in the normal case. */
      noSession:
        'This device is not signed in to the Paylez API, so none of these figures can be read. The site’s own sign-in does not yet create an API session — until it does, only the operator console can connect.',
      /** The other reason: there is a session, and the server did not answer. */
      serverSilent:
        'The server did not answer, so nothing here can be shown. This is not a zero — we could not ask.',
      /** While the request is in flight. */
      asking: 'Reading your figures from the server…',
      /** A metric the min-cohort floor withheld. Never render this as 0. */
      withheld: 'Withheld — too few people for this to be reported without identifying them.',
      /** A panel whose question the API does not answer yet. */
      noSource: 'The server does not report this yet, so this panel has nothing to show.',
      /** A panel gated behind the venue’s plan rather than behind its data. */
      planLocked: 'Not included on this venue’s plan.',
      /** The server reports by calendar month; the bar’s picker is a rolling day count. */
      monthOnly:
        'Figures are reported for a whole calendar month, which is the window the server counts in — the range picker above does not move them yet.',
      /** The server had nothing worth ranking this period. */
      noFindings: 'Nothing stood out this month.',
      /** Half of `vouchers.tierDetail` — the half we can stand behind. */
      tierUnit: 'Each one takes {unit} off a bill.',
      /** The rail's plan card, with no budget to draw a bar from. */
      plan: 'No budget to report — this device is not signed in to the Paylez API.',
      /** The assistant, which will not compose around a figure it cannot read. */
      assistant:
        'I read your quiet hours, your budgets and what works at venues like yours before I suggest anything — and this device is not signed in to the Paylez API, so I cannot read any of it. I will not guess at a number and put your name on it.',
      /** The create drawer: the server sizes an audience per published deal. */
      audience:
        'How many people this would reach is not something we can tell you yet — the server sizes an audience per published deal, and this one is still a draft.',
      /** The create drawer: how much of the notification quota is left. */
      quota:
        'How many notifications this plan has left cannot be read — this device is not signed in to the Paylez API.',
    },

    /*
     * `analytics.findings` returns at most three keys, already ranked by how
     * much they deserve attention. The keys are stable; the `detail` payload
     * differs per key and is deliberately **not** dumped, because a JSON blob on
     * an owner's dashboard is worse than saying less. Until each has a sentence
     * with the right holes, this is the whole of what a finding says.
     */
    findings: {
      quiet_window: 'You have a quiet stretch worth filling.',
      cost_per_new_customer: 'Your cost per new customer moved.',
      second_visit_rate: 'Your second-visit rate moved.',
      new_customers: 'You saw customers who had never been in before.',
    },

    /** The month every screen reports on. */
    month: 'August',
    /* The four windows the picker offers, index-aligned with `PD_RANGES`.
       `rangeLabels` is the form that goes *into* a sentence and `ranges` the
       form that stands alone on the button, which is why both exist: only
       English can make one from the other by capitalising it. */
    rangeLabels: ['last 7 days', 'last 14 days', 'last 30 days', 'last quarter'],

    /*
     * Words that appear on more than one screen. Kept in one place because the
     * prototype uses the same six verbs throughout and translating "Edit" four
     * times is four chances for four different words.
     */
    words: {
      edit: 'Edit',
      pause: 'Pause',
      remind: 'Remind them',
      ask: 'Ask the assistant',
      open: 'Open it',
      priority: 'Priority {n}',
      each: '{amount} each',
      spent: 'Spent',
      aside: 'Set aside',
      available: 'Available',
      costSoFar: 'Cost so far',
      returned: '{amount} came back this month from rewards that expired unused.',
    },

    /*
     * The venue's month, in words. Every figure comes from `partnerMetrics.ts`,
     * which is the prototype's own seed data run through the prototype's own
     * arithmetic — so the sentences here can be specific without inventing
     * anything, and stay true if a seed moves.
     */
    overview: {
      kicker: 'What Paylez did for you · {range}',
      countedLabel: 'Counted',
      counted: 'visits through Paylez',
      countedNew: '{n} of them were customers new to your venue',
      estimateTag: 'Estimate',
      /* The hole is money in the reader's currency, set inside the phrase
         because "about £X in sales" does not keep its word order everywhere. */
      estimate: 'about {amount} in sales',
      estimateNote:
        'An estimate. Every visit through Paylez multiplied by an average spend of {avg}, taken from your own sales.',
      claimTitle: 'What we can fairly claim',
      claim: '{visits} visits · about {amount}',
      claimNote:
        'Visits from customers new to your venue, plus visits with a deal claim or a notification behind them. The rest were regulars who may have come anyway.',
      /* Index-aligned with the three tiles beside the headline. */
      support: [
        { label: 'Visits through Paylez', note: 'counted from QR scans' },
        { label: 'Average spend per visit', note: 'from your sales, last 30 days' },
        { label: 'Customers new to your venue', note: 'first scan at your counter' },
      ],
      /* ── reach ──
         Seen and clicked, above everything else on this screen — because every
         other figure here starts at a *visit*, and a venue nobody has seen and a
         venue everybody ignores produce the same screen without it. */
      reachTitle: 'Who saw you',
      reachSeen: 'Impressions',
      reachSeenNote: 'times your venue or one of your offers appeared on a screen',
      reachClicks: 'Clicks',
      reachClicksNote: 'times somebody opened it to read more',
      reachRate: 'Click rate',
      reachRateNote: 'clicks per hundred impressions',
      reachSplit: 'Where they came from',
      reachListing: 'Your listing',
      reachDeals: 'Your live offers',
      reachFunnel: '{seen} saw you · {clicks} opened it · {claims} claimed something',
      reachEmpty: 'Nothing has been seen yet. Publishing an offer is what puts you in the app feed.',
      reachLive: 'Live figures, counted from your listing and your offers.',
      reachSample: 'Sample figures — this device is not reading reach from the server.',
      budgetAlert:
        'Your loyalty budget is forecast to run out before the end of {month}. You have {amount} unused in vouchers — move some across?',
      budgetAction: 'Open loyalty budget',

      costTitle: 'What Paylez cost you',
      /* Index-aligned with `PD_COST_ROWS`. */
      costRows: [
        'Paylez fees',
        'Loyalty rewards given',
        'Voucher discounts given',
        'Hot deal discounts',
      ],
      costTotal: 'Total',
      returnLabel: 'Sales we can tie back to Paylez',
      roiGood:
        'Paylez cost you {cost} in {month} and can be tied to about {revenue} in sales. That is {n}× back for every 1 you spend.',
      roiBad:
        'Paylez cost you {cost} in {month} and can be tied to about {revenue} in sales. That is {gap} more than we can show back. Most of your visits were regulars who may have come anyway.',

      tiles: ['Visits', 'Deals claimed', 'Vouchers used', 'Rewards used'],
      since: 'vs previous period',
      inMonth: 'in {month}',

      proofTitle: 'The one thing we can prove',
      /* One hole, and it is a *multiple* rather than a rate.
         `analytics.repeatMultiple` averages every campaign member's own visit
         rate after joining over their rate before it, so the figure is a
         ratio and its baseline is 1 by construction. The old sentence read it
         as visits per month and quoted a literal '1.0' beside it, which was a
         number nobody had measured standing next to one somebody had. */
      proof:
        'Customers in your loyalty campaigns come in {n}× as often as they did before they joined.',
      proofNote: 'Counted from your own QR scans, not estimated. No till integration needed.',
      before: 'before',
      now: 'now',

      chartTitle: 'Visits and voucher redemptions',
      chartNote:
        'Every QR scan at the counter, against the vouchers customers actually spent',
      chartVisits: 'Visits',
      chartRedeemed: 'Vouchers redeemed',

      holdingTitle: 'Money you are holding',
      holding:
        '{rewards} rewards and {vouchers} vouchers are sitting unused, holding {amount} of your budget.',
      holdingNote:
        'Every one of them is a customer who qualified and has not come back yet. If they expire, the money returns to your budget.',

      noticed: 'What we noticed',
      insights: [
        {
          text: 'Visits are up 12% but voucher use is down 4%. People are coming in — the rewards are not pulling them back.',
          detail:
            'Only {reached} customers reached the {pct}% tier this month because it needs {points} points. At {lower} points, {more} more of your regulars would have qualified.',
          action: 'Change the 10% tier',
        },
        {
          text: 'Your free-item deals get 2.4× more claims than your percentage discounts.',
          detail:
            '“Free filter with any bake” was claimed {itemClaims} times from {itemSeen} views. “Morning flat white” at {pctBadge} off was claimed {pctClaims} times from {pctSeen} views.',
          action: 'Look at your deals',
        },
        {
          text: '{n} loyalty rewards are earned and sitting unused, holding {amount}.',
          detail:
            'Those customers qualified and did not come back. A reminder usually brings about a third of them in within a week.',
          action: 'Remind them',
        },
      ],

      runningTitle: 'Running right now',
      runningNote: 'Everything customers can see or earn in your venue today',
      quota: '{n} of {total} notifications left this month',
      quotaOut: 'No notifications left this month',
      kinds: { deal: 'Hot deal', campaign: 'Campaign', vouchers: 'Vouchers' },
      claims: 'claims',
      usedEarned: 'used / earned',
      givenAway: 'given away',
      notifySent: 'Notification sent',
      notifySet: 'Notification set',
      tierBundle: 'Three point tiers',
      tierBundleRule: '5% · 10% · 15% off · one monthly budget',
    },

    deals: {
      columns: [
        'Deal',
        'State',
        'Seen',
        'Opened',
        'Claimed',
        'Claim rate',
        'Cost',
        'Last 7 days',
      ],
      rows: [
        'Morning flat white',
        'Student Tuesdays',
        'Free filter with any bake',
        'Rainy day double stamp',
        'Neighbour discount',
        'Lunch bundle',
      ],
      /* Index-aligned with `PD_DEALS`: when each one runs, and between which
         dates. Words, not structure — a month is spelled differently in five
         languages and a date range is a sentence in some of them. */
      when: [
        'Mon–Fri, 07:00–10:00',
        'Tue, 12:00–17:00',
        'Every day',
        'Every day',
        'Every day',
        'Mon–Fri, 11:00–15:00',
      ],
      windows: [
        '3 Aug – 31 Aug',
        '1 Jul – 30 Sep',
        '12 Jul – 12 Aug',
        '15 Aug – 15 Oct',
        '5 Jul – 5 Sep',
        '2 Jun – 30 Jun',
      ],
      /* Index-aligned with `PD_AUDIENCES`. */
      audiences: [
        'Everyone',
        'Newcomers',
        'Lapsed customers',
        'New to your venue',
        'Russian speakers',
      ],
      /* Keyed by `PartnerDeal['state']`, which is six wide, and keyed by the
         *server's* words: `archived` and not `ended`. `draft` and `archived`
         arrived with the API — a seeded deal was never either — and a missing
         key here is a blank chip where a venue owner is looking for the reason
         their offer is no longer in the app. */
      states: {
        draft: 'Draft',
        live: 'Live',
        scheduled: 'Scheduled',
        paused: 'Paused',
        expired: 'Expired',
        archived: 'Ended',
      },
      search: 'Search your deals',
      filters: ['All', 'Live', 'Scheduled', 'Paused', 'Expired'],
      count: '{n} of {total} deals',
      sortNote: 'Sorted by claim rate, best first. Live and scheduled deals come first.',
      insight:
        'Your free-item deals get 2.4× more claims than your percentage discounts. The 5% lunch bundle underperformed — small discounts rarely move people.',
      langsAll: 'Written in all five languages',
      langsSome: 'Written in {n} of 5 languages — losing about {pct}% of reach',
      notify: {
        none: 'No notification',
        scheduled: 'Notification scheduled',
        sent: 'Notification sent',
      },
      reach: '{n} of {total} people can be notified',
      limit: '{claimed} of {limit} claims',
      limitAllowed: 'of {limit} allowed',
      noLimit: 'No claim limit',

      /* Index-aligned with `PD_AUDIENCES`, and only the drawer reads them: the
         table shows an audience by name, the form has to say what the name
         means before an owner picks one. */
      audienceNotes: [
        'Anyone using the Paylez app near you.',
        'People who arrived in Poland in the last 60 days.',
        'Came to you before, but not in the last 30 days.',
        'App users nearby who have never visited you.',
        'People whose app language is Russian.',
      ],

      /*
       * The expanded row. Three panels: where the people went, what the one
       * notification did, and what stops the deal. Every figure is filled from
       * `PD_DEALS` and `dealNotify`, so a row cannot describe a funnel its own
       * columns disagree with.
       */
      funnelTitle: 'What happened, step by step',
      funnel: ['Seen', 'Opened', 'Claimed'],
      funnelNotes: [
        'in the app feed',
        '{pct}% of people who saw it',
        '{pct}% of people who opened it came in',
      ],
      notStarted: 'not started',
      drop: '{seen} people saw it and did not open it. {opened} opened it and did not come in.',
      dropNone: 'This deal has not started yet, so there is nothing to measure.',

      notifyTitle: 'What the notification did',
      notifySteps: ['Notified', 'Opened', 'Came in'],
      notifyStepNotes: [
        'people with notifications switched on',
        '{pct}% of the people notified',
        '{pct}% of the people who opened it',
      ],
      notifySplit:
        '{camein} of this deal’s {claims} claims came from the notification. The other {alone} found it in the app on their own.',
      notifyBlocked:
        'Sent to {n} people. {blocked} more matched but had recently received other notifications, so they did not get this one.',
      notifyScheduled:
        'A notification goes out at {at} to {n} people who have notifications switched on.',
      notifyNone:
        'No notification on this deal. {n} of the {total} people who match it have notifications switched on.',
      notifyChange: 'Change the time',
      notifyCancel: 'Cancel it',
      whoTitle: 'Who sees it, and when',

      /* The claim ceiling, from the two sides it can be seen from. Only the
         first deal has one, so both are written for that case. */
      limitForecast: 'At this pace, this deal hits its {limit}-claim limit around {date}.',
      limitDates: ['22 August', '', '', '', '', ''],
      retro:
        'This ran for {weeks} weeks and got {claims} claims — about a third of what your 15% deals average. Try a deeper discount or a free item.',

      /* What a row's second button does, by state. A paused deal resumes; a
         draft is picked back up; an expired or ended one is copied rather than
         restarted, because its dates are gone. Six states, six labels — the
         same union `states` above is keyed by. */
      act: {
        draft: 'Edit',
        live: 'Pause',
        paused: 'Resume',
        scheduled: 'Pause',
        expired: 'Copy',
        archived: 'Copy',
      },
      pointsNote: 'Points offer — costs you nothing at the till',
      costEstimate: 'estimate',
      costNone: 'no discount cost',
      notifyChips: {
        none: 'No notification',
        scheduled: 'Notification set for {at}',
        sent: 'Notification sent · {n} came in',
      },
      sortBy: 'Sort by {column}',
      clearFilters: 'Clear filters',
      emptyFiltered: 'Nothing matches that',
      emptyFilteredBody:
        'No deal in your list matches the search and filter you have set. Clear them to see all six again.',
    },

    campaigns: {
      rows: ['Regulars’ reward', 'Coffee streak', 'Lunch club', 'Winter comeback'],
      /* Index-aligned with `PD_CAMPAIGNS`: what a member gets, and since when. */
      rewards: [
        'a free filter coffee',
        'a free cake slice',
        '{amount} off lunch',
        'a free hot chocolate',
      ],
      since: [
        'Running since 12 January',
        'Running since 4 April',
        'Started 2 June',
        'Paused on 28 March',
      ],
      rule: '{visits} visits → {reward}',
      visitRule: 'One visit counts per day. A reward expires 60 days after it is earned.',
      earned: 'Earned',
      used: 'Used',
      unused: '{n} earned but never used',
      usedRate: '{pct}% used',
      gapTitle: 'The gap is the number to watch',
      gapLede:
        'A reward that was earned but never used means a customer qualified and did not come back.',
      gap: 'Right now “{name}” has the widest gap: {n} rewards sitting unused.',
      totals: ['Earned', 'Used', 'Waiting'],
      remindLabel: 'Remind {n} customers',
      remindNote: 'They earned a reward and have not come back for it.',
      remindResult: 'Last time, {back} of {of} came in within a week.',
      remindSetup: 'Set this up for me',
      near: '{n} regulars are one visit away from their next reward.',
      rebalance:
        'Your loyalty budget is forecast to run out on {date}. Vouchers have {amount} unused — move some across?',
      rebalanceAction: 'Move budget across',
      budgetTitle: 'Loyalty budget',
      budgetLede:
        'What you have set aside this month for loyalty rewards. Hot deals do not come out of it.',
      spentNote: 'Rewards customers actually took.',
      asideNote:
        'Money held for rewards customers have earned but have not used yet. If they expire, it comes back.',
      availableNote: 'Free for new rewards right now.',
      forecast: 'At this rate the loyalty budget lasts until {date}.',
      forecastOut: 'The loyalty budget is spent. New rewards stop being handed out.',
      forecastSafe: 'At this rate the loyalty budget lasts the whole of {month}.',
      pausedNote: 'Paused. Members keep what they have earned, and nothing new is counted.',
    },

    vouchers: {
      alertTitle: 'Your discount budget is running low',
      alertBody:
        'At the current rate it runs out on {date}, and vouchers stop being given out until next month.',
      alertAction: 'Increase the budget',
      budgetTitle: 'Vouchers budget',
      budgetLede:
        'One pool for all three tiers. This is real money leaving your till, and you set the total for both features here.',
      budgetLabel: 'Total discount budget',
      allocNote:
        'The bar shows what has gone out and what is committed. Only the pale part is still yours to spend.',
      spent: 'Spent',
      spentNote: 'Gone. Discounts on vouchers customers actually used.',
      held: 'Set aside',
      heldNote:
        'Money held for vouchers customers have earned but have not used yet. If they expire, it comes back.',
      free: 'Available',
      freeNote: 'Free to spend on new vouchers right now.',
      forecast: 'At this rate the budget lasts until {date}.',
      forecastOut: 'The budget is spent. No new vouchers are being given out.',
      forecastSafe: 'At this rate the budget lasts the whole of {month}.',
      buysTitle: 'What is left buys',
      buys: 'about {n} more vouchers',
      buysNote: 'At the mix of tiers your customers are reaching now.',
      avgTitle: 'Average transaction',
      avgNote: 'Taken from your own sales over the last 30 days. Change it if it looks wrong.',
      maxTitle: 'Most off one voucher',
      maxNote:
        'No single voucher takes more than this off a bill, however large the order.',
      tiersTitle: 'Who reaches each tier',
      tiersLede:
        'Tiers do not hold money. Points decide who gets there, so raising a number sends less of the budget that way.',
      columns: ['Tier', 'Points needed', 'Given out', 'Used', 'Cost so far'],
      tier: '{n}% off',
      /* The line under the ladder. Deliberately not a restatement of the row
         above it: the unit cost and the share of the pool are the two things a
         row has no space for, and they are what tie this panel to "where the
         money went" beside it. Both holes are figures. */
      tierDetail: 'Each one takes {unit} off a bill. This tier is {pct}% of what the pool has spent so far.',
      pointsUnit: 'pts',
      /* Weighted rather than red: the palette has one accent, so an error is
         said in weight and wording (root `CLAUDE.md`, the forms block). */
      pointsOrder: 'A deeper discount cannot cost fewer points than a shallower one.',
      /* The honest limit of the three fields above. They recompute this screen
         and nothing else — there is no server to save a setting to, and the
         thresholds decide who qualifies, which is a question about customers
         that no counted figure here can answer. */
      tryNote:
        'Type over any of these to see what it would do to the pool. Nothing is saved, and the figures go back to your real ones when you reload.',
      points: '{n} pts',
      mixTitle: 'Where the money went',
      returnedTitle: 'Money returned',
      returnedNote:
        'Came back this month from vouchers that expired unused. It is free to spend again.',
      suggestion: 'Suggestion',
      insight:
        'Your {n}% tier is using most of the budget. Raise its points threshold if you would rather save the money for loyal customers.',
    },

    customers: {
      costKicker: 'What a new customer costs you',
      costUnit: 'each, in {month}',
      costLine:
        'You spent {cost} in {month} and gained {n} customers new to your venue. That is {each} each.',
      costBreakdown: [
        'Paylez fees',
        'Loyalty rewards',
        'Voucher discounts',
        'Hot deal discounts',
      ],
      costFinding:
        'Each new customer cost you {now} in {month}, down from {then} in June. Most of that fall came from your free-item deal.',
      costAction: 'See your deals',
      trendTitle: 'Last three months',
      trendMonths: ['June', 'July', 'August'],
      spendByMonth: 'Spend with you, by month',
      benchmark:
        'The average Kraków café on Paylez pays {amount} for each new customer. This is an estimate from venues like yours, not a promise.',

      rosterTitle: 'Your customers',
      rosterIntro:
        '{n} of your {total} customers turned on profile sharing, so you can see these ones by name. Everyone else stays in the grouped figures below.',
      rosterCount: '{n} sharing',
      rosterColumns: ['Customer', 'Spent', 'Visits', 'Last seen', 'Status'],
      rosterFilters: ['Everyone', 'Regulars', 'Lapsed', 'New'],
      withdrew:
        'Someone can turn sharing off at any time. When they do, they drop off this list and their history stops being visible to you.',
      statuses: { regular: 'Regular', lapsed: 'Lapsed', new: 'New' },
      today: 'Today',
      daysAgo: '{n} days ago',
      dayAgo: '1 day ago',
      stamps: '{done} of {of} stamps',
      tierProgress: '{n}% tier',

      whenTitle: 'When they come in',
      whenLede: 'Every QR scan at the counter, in an average week. Darker means busier.',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      heatCell: 'about {n} visits in a normal week',
      quietFinding:
        'Tuesday and Wednesday, 14:00 to 16:00, are your quietest hours — about 60% below your weekly average.',
      quietAction: 'Set this up for me',
      quietSelf: 'I will do it myself',
      peakFinding:
        'Your busiest hours are weekdays 08:00 to 10:00. Your morning deal already runs then, so there is little to gain from discounting deeper there.',

      nationCount: '{n} customers · {pct}%',
      readTitle: 'What language your customers use',
      readLede:
        'These bars are counted across groups of customers, never one person. Groups smaller than 10 are rolled into “other”.',
      langKicker: 'The language they use in Paylez',
      langs: ['Russian', 'Ukrainian', 'Polish', 'English', 'Other'],
      langFinding:
        '42% of your customers use the app in Russian, but none of your live deals is written in Russian.',
      langAction: 'Create a deal for them',
      privacy:
        'Everything here is counted across groups. Paylez never shows you a single person, and groups smaller than ten are rolled into “other”.',

      backTitle: 'Do they come back',
      backLede: 'First-time visitors, and how many returned within 30 days',
      months: ['April', 'May', 'June', 'July'],
      monthNames: [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ],
      cohort: '{back} of {first} · {pct}%',
      backFinding:
        '{first} people visited you for the first time in {month}. {back} came back within 30 days — {pct}%.',
      lapsedFinding:
        '{n} of your regulars have not visited in 30 days. They used to come about once a week.',

      compareTitle: 'How you compare',
      compareNote:
        'Compared with {n} other Kraków cafés on Paylez. Numbers are averaged across venues, never shown per venue.',
      compareRows: ['Deal claim rate', 'Second visit within 30 days', 'Cost per new customer'],
      compareThem: 'others average {amount}',
      roiTitle: 'Where your money works',
      roiLede: 'What each of your three tools cost in {month}, and what it bought',
      roiRows: ['Loyalty campaigns', 'Hot deals', 'Vouchers'],
      roiUnits: ['repeat visits', 'claims', 'vouchers used'],
      roiPer: ['per repeat visit', 'per claim', 'per use'],
      roiLine: '{cost} spent · {n} {unit}',

      /* One line per roster entry, index-aligned with `PD_ROSTER.pattern`. */
      patterns: [
        'Weekday mornings, often before 9',
        'Weekday mornings',
        'Weekends, late morning',
        'Used to come Friday afternoons',
        'Two visits, both afternoons',
        'Weekday lunch',
        'Weekend mornings',
        'Afternoons, mixed days',
        'Most weekday mornings',
        'Three visits, afternoons',
        'Was a Tuesday regular',
        'Weekends',
        'First visit two days ago',
        'Thursday afternoons, less lately',
      ],
      /* …and with `PD_ROSTER.reward`. */
      rewards: [
        '15% tier — your top spender',
        'One stamp from a free coffee',
        '10% tier',
        '10% tier — going cold',
        '1 of 4 stamps',
        'Free coffee ready to redeem',
        '2 of 4 stamps',
        '15% tier',
        '10% tier — lapsed',
        '10% tier — slowing down',
      ],
    },

    scans: {
      columns: [
        'When',
        'Customer',
        'First visit?',
        'Spent',
        'Points',
        'Receipt',
        'Where',
        'Progress to reward',
      ],
      filters: ['Everyone', 'First visit', 'Came back'],
      first: 'First visit',
      again: 'Came back',
      today: 'Today',
      noCampaign: 'No campaign running',
      progress: '{done}/{need} scans',
      toGo: '{n} to go',
      ready: 'reward ready',
      count: '{n} scans',
      showing: 'Showing {n} of {total}',
      /* The pager. Honest now that `PD_SCANS` builds all forty-eight rather
         than the first page — the generator is a pure function of the row
         index, so the twelve you are not looking at cost nothing. */
      page: 'Showing {from}–{to} of {total}',
      prev: 'Previous',
      next: 'Next',
      coords: 'Counter',
    },

    /*
     * The two buttons above every screen.
     *
     * The prototype puts a primary and a secondary there and changes both by
     * screen — create a deal from four screens, create a campaign from two, and
     * a secondary that is "preview the listing" on the profile and "export"
     * everywhere else. Index-aligned with `DASH_SCREENS`.
     */
    actions: {
      newDeal: 'Create hot deal',
      newCampaign: 'Create campaign',
      exportCsv: 'Export CSV',
      preview: 'Preview listing',
      exported: 'Your CSV is downloading.',
      previewing: 'Opening your listing preview.',
    },

    /*
     * The create panel, shared by both things a partner can make.
     *
     * One drawer with two bodies rather than two drawers: the header, the
     * footer, the validation line and the way it slides in are the same, and the
     * prototype builds it that way for the same reason.
     */
    drawer: {
      close: 'Close',
      cancel: 'Cancel',
      later: 'Save and finish later',
      deal: {
        kicker: 'New hot deal',
        title: 'Create a hot deal',
        sub: 'A time-bound offer in the app feed. Nothing is charged until somebody claims one.',
        publish: 'Publish the deal',
        copyTitle: 'Title and description',
        titleLabel: 'Deal title',
        titlePlaceholder: 'Morning flat white',
        descLabel: 'Description',
        descPlaceholder: 'Say what the customer gets, in one or two short lines.',
        translateNote: 'Paylez translates this for customers reading in another language.',
        copyError: 'A deal needs a title and a description before it can go live.',
        kindTitle: 'What kind of deal',
        kinds: ['Percentage off', 'Free item', 'Money off', 'Extra stamp'],
        discountTitle: 'Discount and dates',
        badgeLabel: 'Discount text',
        badgeNote: 'Short and clear. Customers see this first. 14 characters at most.',
        from: 'Starts',
        to: 'Ends',
        windowError: 'The end date is before the start date.',
        whenTitle: 'Which days and hours',
        hourFrom: 'From',
        hourTo: 'To',
        whenNote: 'Runs {days}, {from}–{to}. Use this to fill your quiet hours.',
        everyDay: 'every day',
        noDays: 'no days yet',
        audienceTitle: 'Who sees it',
        audienceEstimate: 'About {n} people match this, and {notifiable} of them can be notified.',
        notifyTitle: 'Notify people',
        notifySwitch: 'Send a notification for this deal',
        notifyQuota: '{n} of {total} left this month.',
        notifyOutTitle: 'You have used all {total} this month',
        notifyOutBody:
          'The count resets on the first. The Growth plan carries more of them, and the deal still runs without one — it just waits for people to open the app.',
        notifyPlan: 'See the Growth plan',
        notifyWhen: 'When it goes out',
        notifySuggested: 'Your audience opens the app most around {at}.',
        useSuggested: 'Use {at}',
        quietNote: 'Nothing goes out between 21:00 and 08:00, whatever you set.',
        notifyWho: 'Who gets it',
        notifyReach: '{n} of {total} have notifications switched on.',
        notifyWhoNote: 'Change it in “Who sees it” above',
        notifyText: 'What it says',
        notifyTextNote:
          'Taken from your deal title. Shorten it if you like — 64 characters at most.',
        stopTitle: 'When should it stop',
        stopOptions: [
          { label: 'On the end date', note: 'It runs to the date you set and no further.' },
          { label: 'After a number of claims', note: 'Stops itself once enough people have used it.' },
          { label: 'Once it has cost enough', note: 'Stops itself once the discounts reach an amount.' },
        ],
        stopClaims: 'Most claims allowed',
        stopMoney: 'Stop once it has cost',
        claims: 'claims',
        stopNote:
          'Hot deals do not use your loyalty or voucher budgets. This limit is what stops them.',
        termsTitle: 'Rules for using the deal',
        termsPlaceholder: 'One claim per visit. Not valid with other deals.',
        previewTitle: 'How customers will see it',
        previewClaim: 'Claim deal',
        previewUntitled: 'Your deal title',
        previewNoDesc: 'Your description shows here.',
        previewLimitNone: 'No claim limit',
        previewLimitClaims: 'Stops after {n} claims',
        previewLimitMoney: 'Stops once it has cost {amount}',
        /* The six endings a press can have, now that it reaches a server. */
        filing: 'Filing…',
        published: 'Published. It is live in the app.',
        saved: 'Saved as a draft. Publish it whenever you like.',
        needsSession: 'This deal has nowhere to go yet — your venue is not on the server. Open Business setup and save your listing; that registers it, and this panel starts working.',
        filingOffline: 'We could not reach the server. Nothing was filed — try again in a minute.',
        filingRefused: 'The server would not take it: {why}',
        savedUnverified: 'Saved as a draft. It goes live once your venue is verified — we are on it.',
        savedNotLive: 'Saved as a draft, but we lost the server before it went live. Publish it from Hot deals.',
        savedNotLiveWhy: 'Saved as a draft. It did not go live: {why}',
        /* The refusal a free-plan owner meets first, and the only one worth
           its own sentence: `live_deals` is a capacity rather than a fault,
           and the fix is on the deals table — pause one — rather than here. */
        savedPlanFull: 'Saved as a draft. Your plan allows one live deal at a time, so pause the one that is running and publish this from Hot deals.',
        /* Three more endings, because the notification is a third call and
           its own decision: published-and-sent, published-and-not-sent, and
           a draft that deliberately carries no push. */
        savedNoPush: 'Saved as a draft. No notification goes out — a draft is not in the feed to be notified about.',
        publishedNotified: 'Published, and a notification goes out at {at}.',
        publishedNoPush: 'Published and live. The notification did not schedule: {why}',
      },
      campaign: {
        kicker: 'New loyalty campaign',
        title: 'Create a loyalty campaign',
        sub: 'A reward your regulars earn by coming back. It is held from your loyalty budget the moment somebody qualifies.',
        publish: 'Start the campaign',
        nameLabel: 'Campaign name',
        namePlaceholder: 'Coffee streak',
        nameNote: 'Only you see this name. Customers see the reward.',
        nameError: 'Give the campaign a name so you can find it later.',
        visitsTitle: 'How many visits',
        visits: 'visits',
        visitsHelp: 'A customer earns the reward on their {n}th visit, then starts again.',
        visitsMinus: 'One fewer visit',
        visitsPlus: 'One more visit',
        rewardTitle: 'What they get',
        rewardKinds: ['A free item', 'Money off'],
        rewardItemPlaceholder: 'a free filter coffee',
        rewardItemNote: 'Write it the way a customer would read it in the app.',
        rewardOff: 'off',
        rewardError: 'Say what the customer gets.',
        costTitle: 'What does this cost you',
        costEach: 'each',
        costNote:
          'We use this to track what your campaigns are costing you. It is the amount held from your loyalty budget each time somebody earns this reward.',
        project: 'customers',
        projection: 'If {n} customers finish it, that is {amount} out of your loyalty budget.',
        priorityTitle: 'When two campaigns match the same visit',
        priorityLede:
          'A customer can qualify for more than one campaign at the same visit. Only one reward is given: the one with the lower priority number.',
        priorityHelp: 'Priority {n} of 5. Lower wins.',
        rulesTitle: 'The small rules',
        expiry: 'Reward expires after',
        days: 'days',
        expiryNote: 'After that the reward is gone and the money returns to your budget.',
        minSpend: 'Minimum spend per visit',
        minSpendNote: 'Smaller visits do not count. One scan per customer per day.',
        summaryTitle: 'Your campaign in one line',
        summary: '{visits} visits, then {reward}. Costs you {amount} every time somebody finishes it.',
        summaryNote:
          'The money is held from your loyalty budget when a customer qualifies, not when they use it. If the reward expires, it comes back.',
        summaryReward: 'a reward',
        /* One ending, because a campaign has one button: the server inserts
           it active, so there is no draft to fall back to. */
        started: 'Running. It counts from the next visit.',
        costError: 'Say what one reward costs you — the money is held from your loyalty budget the moment somebody qualifies.',
      },
      valid: 'Fix the {n} thing above before publishing.',
      validPlural: 'Fix the {n} things above before publishing.',
    },

    /*
     * The assistant.
     *
     * The one screen that talks, and the largest single thing in the prototype:
     * a conversation, a draft it can defend, the deal text in five languages,
     * three named ways out of it, and four endings the conversation can reach
     * that are not a draft at all — an answer, a review, a hand-over to the
     * form, and a plain "I cannot do that".
     *
     * **It reads numbers, it does not invent them.** Every figure below arrives
     * through a hole filled from `partnerMetrics.ts`, which is what lets the
     * composer note promise exactly that. A number typed into a sentence here is
     * the bug this arrangement exists to prevent.
     *
     * **And nothing it drafts is live.** There is no server behind any of it, so
     * publishing shows what would happen and says so; the same rule the rest of
     * the dashboard follows with `notWired`.
     */
    assistant: {
      knowTitle: 'What I know about your venue',
      intro:
        'Tell me what you want to happen in your venue. I will set it up, show you what it costs, and leave it to you to publish. Nothing goes live until you press the button.',
      knows: [
        'Your quietest hours are {days}, {from} to {to} — about {pct}% below your weekly average.',
        '{pct}% of your customers use the app in Russian, but none of your live deals is written in Russian.',
        'Across {n} cafés in your city, free-item deals get about {x}× the claims of percentage discounts.',
        'You have {vouchers} unspent in vouchers and {loyalty} in loyalty this month.',
      ],

      optionsTitle: 'What you can do',
      optionsIntro: 'Focused starts, based on what I am seeing in your numbers. Tap one to talk it through.',
      options: [
        {
          name: 'Fill my quiet hours',
          desc: '{days}, {from} to {to} — about {pct}% below average.',
          seed: 'Fill my quiet Tuesday afternoons',
        },
        {
          name: 'Bring back customers who stopped coming',
          desc: '{n} regulars, last seen over 30 days ago.',
          seed: 'Get back the {n} regulars who stopped coming',
        },
        {
          name: 'Review everything I am running',
          desc: 'Three things worth changing this week.',
          seed: 'Review everything I am running and tell me what to fix',
        },
        {
          name: 'Why did voucher use drop?',
          desc: 'Down 4% this month — I can show you where.',
          seed: 'Why did voucher use drop this month?',
        },
      ],

      convTitle: 'Talk to your assistant',
      reset: 'Start over',
      opening:
        'Tell me what you want to happen in your venue — in your own words, in any of the five languages Paylez speaks. I will ask a couple of short questions, show you what it will cost, and leave it to you to publish.',
      chipsHint: 'Tap one, or type your answer below.',
      send: 'Send',
      placeholders: {
        idle: 'Tell me what you want to happen in your venue',
        reward: 'A free coffee, or a percentage off — or say it your way',
        budget: 'Around {a}, {b} or {c}?',
        duration: '2, 4 or 8 weeks?',
        notify: 'Yes or no?',
        ready: 'Change something before I show the draft?',
      },
      composerNote:
        'I read all five languages Paylez speaks. Every figure I use comes from your own numbers or from venues like yours — I will not make one up.',

      /* What it says when it has understood which of the three goals you mean. */
      goalOpen: {
        quiet:
          'Your quietest stretch is {days}, {from} to {to} — about {pct}% below your weekly average. I would run a short deal then. What should people get?',
        lapsed:
          '{n} of your regulars have not been in for over 30 days. A deal aimed at them can pull some back. What should they get?',
        new: 'New visitors mostly come from one clear, simple offer they see in the feed. What should first-time people get?',
      },
      /* The four questions, each answered by a chip or by typing. */
      askBudget: {
        item:
          'A free filter coffee, good. Free-item deals get about {x}× the claims of a percentage off at venues like yours, and each one costs you a fixed {amount}. How much do you want to put toward it this month?',
        percent:
          '20% off it is. That moves with the size of each bill, so I will add a stop once it has cost enough. How much do you want to put toward it this month?',
      },
      askDuration:
        '{amount}. Hot deals do not come out of your loyalty or voucher pools, so this is money off your margin. For how long should it run?',
      askNotify:
        '{n} weeks. You have {left} of your {total} notifications left this month — want me to send one when it starts? Without it, most people only see the deal if they open the app.',
      ready:
        'Here is what I would set up{notify}. Nothing is live yet — it goes out only when you press publish. Take a look at the draft.',
      readyNotify: ', with a notification when it starts',
      retry: {
        reward: 'I did not quite catch that — a free filter coffee, or a percentage off the bill?',
        budget: 'Roughly how much for the month — {a}, {b} or {c}?',
        duration: 'For how long — 2, 4 or 8 weeks?',
        notify: 'Should I send a notification when it starts — yes, or no?',
        other: 'You can change any of that on the draft. Want to see it?',
      },
      chips: {
        item: 'A free filter coffee',
        percent: '20% off the bill',
        weeks: '{n} weeks',
        yes: 'Yes, send one',
        no: 'No, just list it',
      },

      readyTitle: 'What I would set up',
      readyRows: ['The goal', 'What people get', 'Days and hours', 'Budget', 'Runs for', 'Notification'],
      showDraft: 'Show me the draft',

      /* The draft. */
      draftTag: 'Draft',
      draftNote: 'Nothing here is live. It goes out only when you publish it.',
      changedTitle: 'What I changed',
      changedNote: 'Nothing else moved. Every other field is the same as before.',
      sentence: {
        item: 'A free filter coffee with any bake, {days} {from} to {to}, for the next {weeks} weeks.',
        percent: '20% off the bill, {days} {from} to {to}, for the next {weeks} weeks.',
      },
      whyTitle: 'Why I chose this',
      reasons: {
        quietDays:
          'I chose {days}, {from} to {to}, because those are your quietest hours — about {pct}% below your weekly average.',
        movedDays:
          'You asked for {days}, so I moved it. Your quietest hours are still {quiet}, {from} to {to}, if you want to go back.',
        item:
          'I chose a free item because free-item deals get about {x}× the claims of percentage discounts across {n} venues in your city, and the cost is a fixed {amount} each time.',
        percent:
          'You asked for a percentage discount, so I set 20%. The cost moves with the size of each bill, so I added a stopping condition.',
        budget: 'I set the budget at {amount} because that is what you told me you can spend this month.',
        budgetTight:
          'I set the budget at {amount} because that is what is left before hot deals start eating into your margin this month.',
      },
      dealTag: 'Hot deal',
      dealNew: 'New — this will be created',
      dealFields: ['What it is', 'Days and hours', 'Runs', 'Who sees it'],
      dealValues: {
        item: 'Free item — a filter coffee with any bake',
        percent: 'Percentage off — 20% off the bill',
      },
      stopAfter: 'Stops after',
      claims: 'claims',
      fieldNote:
        'Days, hours, dates and audience are set the way I explained above. Change any of them in the full form.',
      notifyTag: 'Notification',
      notifyAttached: 'Attached to the deal above',
      goesOut: 'Goes out',
      notifyFields: ['Reaches', 'Uses'],
      notifyReach: '{n} people with notifications switched on',
      notifyUses: '1 of your {n} remaining notifications this month',
      costTitle: 'What it will cost',
      costLine: {
        item: 'If {n} people claim this, it costs you about {amount}. That is an estimate, based on a fixed {each} per claim.',
        percent:
          'If {n} people claim this, it costs you about {amount}. That is an estimate, based on your average spend of {avg} per visit.',
      },
      costNote:
        'Hot deals have no budget pool of their own, so this comes straight off your margin. The stopping condition above is what limits it.',
      budgetWarn:
        'You asked for {asked}. You have {room} of room this month, so I made a smaller version rather than refusing — {n} claims instead of {wanted}.',
      readTitle: 'What customers will read',
      readWarn: 'Written by me — check before publishing',
      titleIn: 'Title in {lang}',
      bodyIn: 'Description in {lang}',
      termsTitle: 'Rules for using it',
      termsTag: 'Standard terms',
      terms: 'One claim per visit. Not valid with other deals. The venue may end the offer early.',
      reviseTitle: 'Change something? Tell me what',
      revisePlaceholder: 'Make it Thursday instead, and I do not want students getting it.',
      reviseAction: 'Change the draft',
      reviseNote:
        'I change only what you name, and show you what moved. The rest of the draft stays as it is.',
      publish: 'Publish it',
      notRight: 'This is not what I need',
      exitsIntro:
        'Three ways out. None of them is worse than the others — pick whichever suits how wrong it is.',
      exits: [
        {
          title: 'Tell me what is wrong',
          note: 'I change this draft. Everything you have already approved stays.',
          label: 'Write it below',
        },
        {
          title: 'Open it in the normal form',
          note: 'You take over. Everything I got right is already filled in.',
          label: 'Take over',
        },
        {
          title: 'Start over',
          note: 'Throws away this draft and the text in five languages.',
          label: 'Throw it away',
        },
      ],
      /* What a revision recognises, and what it writes in the change list. */
      revisions: {
        days: 'Days',
        hours: 'Hours',
        audience: 'Who sees it',
        thursday: 'Thursday',
        friday: 'Friday',
        morning: '07:00–10:00',
        noStudents: 'Everyone except students — about {n} people',
      },

      publishedTitle: 'Two things are ready',
      publishedOne: 'One thing is ready',
      publishedDeal: '{days}, {from}–{to} · stops after {n} claims',
      publishedNotify: 'Goes out at {at}',
      publishedNotifyNote: 'To {n} people',
      watch:
        'Check back in two days. If fewer than 10 people have claimed it by then, the hours are probably right and the offer is not strong enough.',
      again: 'Set up something else',

      reviewTitle: 'What I would change this week',
      reviewIntro: 'Three things are worth changing this week. I have left everything else alone.',
      review: [
        {
          text: 'Your {pct}% voucher tier needs {points} points. Only {reached} customers reached it this month. At {lower} points, {more} more of your regulars would have qualified.',
          label: 'Change the tier',
        },
        {
          text: '“{name}” is paused but still holding {amount}. {n} rewards were earned and never used, and they stay valid until they expire.',
          label: 'Open the campaign',
        },
        {
          text: '“{name}” ran for {weeks} weeks at 5% off and got {claims} claims — about a third of what your 15% deals average. Small discounts rarely move people.',
          label: 'Look at your deals',
        },
      ],

      asked: 'You asked: “{q}”',
      answerLine:
        'Voucher use is down {down}%, from {from} to {to}. The drop is all in the {pct}% tier — {now} customers reached it this month against {before} last month, because the points threshold went up to {points}.',
      answerNote:
        'Visits are up 12% over the same period, so people are coming in. Fewer of them are reaching a tier worth using.',
      answerLabel: 'Open the tiers',
      answerMore:
        'Where the money went, tier by tier, is on the Vouchers page. I have not rebuilt it here.',
      askElse: 'Ask something else',

      handedTitle: 'It is yours now',
      handedNote:
        'I filled in what I was confident about. Check the two at the bottom — I guessed those.',
      handedFields: [
        'Days and hours',
        'What people get',
        'Runs for',
        'Stops after',
        'Who sees it',
        'Text in five languages',
      ],
      handedWeeks: '{n} weeks',
      handedCopy: 'Written by me — check before publishing',
      filledIn: 'Filled in',
      checkThis: 'Check this',
      openForm: 'Open the form',
      backToDraft: 'Go back to the draft',

      cantLine: 'I cannot target people by how much they usually spend. Paylez does not track that yet.',
      cantAlt:
        'I can target people who have visited you before — {n} of them have been in at least twice. Want that instead?',
      cantYes: 'Yes, use that instead',
      cantNo: 'Ask for something else',
      cantElsewhere:
        'If you want to see what people spend, the average per visit is on the Customers page.',
      cantOpen: 'Open Customers',

      missedTitle: 'I did not understand that one',
      missedBody:
        'I got as far as: a deal on {days} afternoons. I could not work out the offer or the budget, and I would rather hand it over than keep asking.',
      loopNote:
        'That is twice now. I am not going to keep guessing — the form will be quicker, and I have put in the days and hours I did understand.',
      missedAction: 'Open the normal form',
      tryAgain: 'Try again',

      /* The three days it can be moved to, and the days it starts on. Written
         out rather than assembled from weekday names: "Tuesday and Wednesday"
         is one phrase in English and joins differently in the other four. */
      dayChoices: ['Tuesday and Wednesday', 'Thursday', 'Friday'],
      goals: [
        'Fill my quiet hours',
        'Bring back customers who stopped coming',
        'Get more first-time visitors',
        'Review everything I am running',
      ],
      notifyYes: 'Yes, when it starts',
      notifyNo: 'No, listed only',
      weeksValue: '{n} weeks',
      /* Nothing behind it can actually publish, and the screen says so rather
         than pretending. */
      published: 'Nothing was published — there is no server behind this build.',
      draftUpdated: 'Draft updated. Everything else is unchanged.',
      handedOver: 'Opened the form with everything carried across.',
    },

    collapse: 'Collapse menu',
    expand: 'Expand menu',
    backToSite: 'Back to paylez',

    plan: {
      name: 'Growth plan',
      state: 'Active',
      caption: 'Loyalty and voucher budgets this month. Hot deals are not in here.',
      /* Both halves are money in the reader's currency. */
      usage: '{used} of {total}',
    },

    ranges: ['Last 7 days', 'Last 14 days', 'Last 30 days', 'Last quarter'],
    rangeMenu: 'Reporting window',
    notifications: 'Notifications',
  },

  hero: {
    lines: ['Play & Earn.', 'Exclusive deals.'],
    lede: 'Discover, play and get rewarded.',
    primary: 'Play & Earn',
    secondary: 'How it works',
    stats: ['Buys a voucher', 'Partner stores', 'Cities live'],
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
        body: 'Scan partner QR codes in-store to add points to your balance without answering a single question — right from your phone.',
      },
      {
        title: 'AI Assistant',
        body: 'Your digital companion — ask it anything, any time.',
      },
    ],
  },

  value: {
    eyebrow: 'Play & Earn',
    title: 'Your points are real money.',
    lede: "No gimmicks. Play to earn points, then cash them in for gift cards and discounts you'll actually use.",
    /*
     * A picture of a voucher, and every word on it is copy.
     *
     * `meta` used to carry an `{amount}` hole filled from the catalogue in
     * `content.ts` — which made the illustration a price quote for a card the
     * page could not confirm exists. The brand is generic for the same reason:
     * what is actually stocked is a row on the server, and `#/vouchers` is the
     * page that lists it.
     */
    card: {
      merchant: 'Partner gift card',
      meta: 'Spent like money at the store',
      title: 'Redeem your points for a real voucher.',
      price: 'Points',
      revealed: 'Voucher ready',
      action: 'Redeem your points',
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
        body: 'Invite friends, keep your streak alive and climb the monthly board. It starts from zero on the first, so the top is never far off.',
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
      lede: 'A few quick questions a day. Points that turn into vouchers at shops you already use.',
      primary: 'Start playing',
      secondary: 'See the games',
      /* Index-aligned with `LEARN_STATS`. Two, not three: the third was "buys a
         voucher", read off a catalogue this file no longer has. */
      stats: ['Best round', 'Earns a freeze'],
    },

    steps: {
      eyebrow: 'How it works',
      title: 'Four steps, about two minutes.',
      lede: 'Short enough for a tram ride, which is where most of it gets played.',
      items: [
        {
          title: 'Pick a game',
          body: 'Capitals, flags, or life in Poland. Five questions a round, and none of them take long.',
        },
        {
          title: 'Answer',
          body: 'Every correct answer scores, and getting the whole round right pays a bonus on top of them.',
        },
        {
          title: 'Keep the streak',
          body: 'Come back tomorrow. One round a day keeps the streak alive, and seven days running earns a freeze that covers the day you miss.',
        },
        {
          title: 'Redeem',
          body: 'Turn points into a voucher and scan it in store. Nothing to print, nothing to wait for.',
        },
      ],
    },

    games: {
      eyebrow: 'The games',
      title: 'Pick your game.',
      lede: 'Every one of them is translated into every language on this site, so you are never playing in your second one unless you want to.',
    },

    streak: {
      eyebrow: 'Streaks',
      title: 'The streak is where the points are.',
      lede: 'One round every 24 hours keeps it alive. Miss that window and the streak goes back to zero — your points stay exactly where they are — unless you are holding a freeze. A freeze covers one missed day, you earn one every seventh, and you can hold two. That is the whole rule.',
      card: {
        label: 'Current streak',
        unit: 'days',
        reward: 'A freeze on day seven',
        freeze: 'Freezes held · each covers one missed day',
      },
      benefits: [
        {
          title: 'Every round is worth the same',
          body: 'No game pays less for being played twice, and no round today is worth less than yesterday’s. What bounds a day is energy: four in the tank, one round each, and one back every four hours.',
        },
        {
          title: 'Day seven: a freeze',
          body: 'A week of showing up buys you a day off. A freeze absorbs one missed day and the streak carries on as if you had played.',
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
      lede: 'Everyone starts at zero on the first. The top three finish the month named at the top of the board; everyone else starts the next one on the same footing.',
      columns: { rank: '#', player: 'Player', points: 'Points' },
      note: 'Sample board — yours resets on the 1st.',
    },

    faq: {
      eyebrow: 'Questions',
      title: 'The short answers.',
      items: [
        {
          q: 'Do points expire?',
          a: 'No. Your balance keeps what it has earned, even through a week off — it is the streak that has a clock on it. Miss that window and the streak goes back to zero; the points are still yours to spend.',
        },
        {
          q: 'How many rounds can I play a day?',
          a: 'Four on a full tank, and more as it fills. Every finished round spends one energy whether you win or lose, and energy comes back on its own — one every four hours, up to four. Nothing pays less for being repeated: the tenth round of the day is worth exactly what the first was.',
        },
        {
          q: 'What is a voucher actually worth?',
          a: 'It depends on the voucher and on what the partner business decides. Gift cards are priced in points and every one on the shelf shows what it costs and what it is worth — the Vouchers page lists what is stocked right now.',
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
    /* The three charts on this page are invented figures, and legitimately so:
       it is a marketing page, and a worked example is how you show somebody
       what a report looks like before they have one. What was missing is the
       label — the hero panel names the signed-in owner's venue, and three
       charts of confident numbers under it read as *that venue's* month. */
    exampleNote:
      'Example figures, to show the shape of the report. Your own numbers are on your dashboard.',
    hero: {
      eyebrow: 'Partner Analytics',
      lines: ['Every scan,', 'accounted for.'],
      lede: 'See what the campaign actually did — impressions, clicks, redemptions and what they were worth, for every deal you run.',
      primary: 'Open the dashboard',
      secondary: 'See what you get',
      venueLabel: 'Your venue',
      venueNone: 'No listing on this account yet',
      venueNote: 'Nothing to type in. You are signed in, so the dashboard already knows which venue is yours — the Service ID is ours, and it is what support asks for.',
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
      lede: 'Every partner deal has been collecting this since the day it went live. The dashboard is already yours, one click away.',
      primary: 'Open the dashboard',
      secondary: 'Talk to us about partnering',
      note: 'Included with every partner account · No extra fee',
    },
  },

  /* ─────────────────────────────────────────────────────────── business ── */

  business: {
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
              body: 'Push, limited offers, promo codes, gift cards, in-store QR codes and email.',
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
          body: 'The full marketing toolkit, per-site logins and in-store QR campaigns.',
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
      trust: 'No card details · Free to start · Available across Poland',
    },

    /*
     * An illustration of the wallet, not a wallet.
     *
     * It used to print "3 active · 11 used" and a face value read off the
     * catalogue in `content.ts` — a picture making a claim about stock. Every
     * word on it is copy now, and `example` says out loud what it is. The real
     * shelf is a section further down and asks the server.
     */
    wallet: {
      title: 'Your vouchers',
      example: 'An example',
      tabs: { active: 'Active', used: 'Used' },
      note: 'A voucher counts as used the moment you generate its QR code — so generate it at the counter, not on the tram.',
      card: {
        brand: 'A partner store',
        meta: 'Gift card, spent like money',
        cost: '500 pts',
        action: 'Show QR code',
        code: 'PLZ-9F3K',
        expires: 'Valid until the date on the card',
      },
    },

    steps: {
      eyebrow: 'How a voucher happens',
      title: 'Four steps, and none of them cost you money.',
      lede: 'The whole loop, from a spare two minutes on the tram to a discount at the counter.',
      items: [
        {
          title: 'Answer a few questions',
          body: 'A couple of minutes on the tram. Every correct answer is points, and every round pays full whichever game it is and however many you have played today — what limits a day is energy, not repetition.',
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
      lede: 'Read live from the platform. What is here is what is actually stocked, at the price points buy it for.',
      cost: 'pts',
      /* `{n}` is how many are left. The old copy said "{left} of {of}", which
         needed an allocation the shelf does not record. */
      left: '{n} left',
      everywhere: 'Any store · online too',
      soldOut: 'Out of stock',
      action: 'Browse the full list',
      loading: 'Asking the server…',
      /* Empty, and honestly empty. */
      none: 'No gift cards stocked yet. Points keep — this fills up as brands come on.',
      /* Not empty: unanswered. Never the same sentence. */
      down: 'We could not reach the server, so this is not an empty catalogue — it is one we could not read.',
      retry: 'Try again',
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
          title: 'The streak resets if you stop playing',
          body: 'Play at least one round every 24 hours and the streak carries on. Miss that window and it goes back to zero — your points do not. Vouchers you have already claimed carry their own expiry date, printed on the card before you spend anything.',
        },
      ],
    },

    faq: {
      eyebrow: 'Questions',
      title: 'The ones people actually ask.',
      items: [
        {
          q: 'What does a voucher cost me?',
          a: 'Points, and nothing else. There is no delivery fee and no card on file — you never enter payment details to redeem one.',
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
      title: 'Your next voucher is a handful of rounds away.',
      lede: 'A few minutes a day, spread across a few different games. Start today and the streak starts counting too.',
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
      lede: 'Where to open an account, how the rent deposit works, which clinic takes your insurance, what your money is actually worth back home. Nine subjects, fourteen countries.',
      primary: 'Open the guide',
      secondary: 'Check a rate',
      stats: ['Subjects covered', 'Countries live', 'Markup on our rate'],
      trust: 'Free · No account needed to read · Updated as the rules change',
    },

    rates: {
      eyebrow: 'What your money is worth',
      title: 'Know the real rate before anyone quotes you one.',
      lede: 'The mid-market rate for the currencies people here actually deal in, with no spread of ours on top. Paylez converts — it does not move money — so there is nothing between you and the number. Save the pairs you check and they open first.',
      send: 'Amount',
      gets: 'Converts to',
      rate: 'Rate',
      swap: 'Swap the two currencies',
      result: '{from} = {to}',
      enter: 'Type an amount to convert.',
      /*
       * Two rows and two different claims, which is the point.
       *
       * `saved` sits over the pairs this reader pinned and `common` over the
       * four the card offers everyone reading in this language. One label used
       * to cover the second row while saying the first, which is a promise with
       * no store behind it — see the header of `savedPairs.ts`.
       *
       * `savedNote` went with it: it said the pairs were "pinned to the top of
       * the screen", which is now true and is demonstrated by the row rather
       * than asserted under it, and nothing had ever rendered the string.
       */
      saved: 'Your pairs',
      common: 'Most used',
      /* The toggle under the two amounts. `pinned` is a state, not a
         confirmation — it is what the button says while the pair is up there,
         and pressing it again takes it down. */
      pin: 'Pin this pair',
      pinned: 'Pinned',
      unpin: 'Unpin {pair}',
      /* The picker. `pick` is read out by a screen reader with the chosen
         currency after it, so it is a noun phrase rather than a sentence. */
      pick: 'Currency',
      search: 'Search 19 currencies',
      noMatch: 'Nothing matches “{query}”.',
      /*
       * Keyed by ISO 4217 code, and the keys are the ones in `i18n/fx.ts` —
       * `relocate.tsx` indexes this with `FxCode`, so a currency added to the
       * table without a name here is a build error rather than a blank row.
       */
      names: {
        EUR: 'Euro',
        USD: 'US dollar',
        GBP: 'British pound',
        PLN: 'Polish złoty',
        UAH: 'Ukrainian hryvnia',
        RUB: 'Russian rouble',
        UZS: 'Uzbek soum',
        KZT: 'Kazakh tenge',
        TRY: 'Turkish lira',
        CZK: 'Czech koruna',
        CHF: 'Swiss franc',
        BYN: 'Belarusian rouble',
        MDL: 'Moldovan leu',
        GEL: 'Georgian lari',
        AMD: 'Armenian dram',
        AZN: 'Azerbaijani manat',
        TMT: 'Turkmen manat',
        KGS: 'Kyrgyz som',
        TJS: 'Tajik somoni',
      },
      bullets: [
        {
          title: 'The mid-market rate, unmarked',
          body: 'What the currency is worth, not what someone would give you for it. Nothing is sent and nothing is charged here, so there is no spread of ours sitting between the two numbers.',
        },
        {
          title: 'Both directions, one card',
          body: 'Every pair converts either way at the same rate, on the amount you actually typed rather than on a headline example.',
        },
        {
          title: 'Your pairs first',
          body: 'Pin the currencies you check and they are at the top every time, with the rate already loaded.',
        },
      ],
    },

    guide: {
      eyebrow: 'Help and guidance',
      title: 'Pick a country. Open a subject.',
      lede: 'The guide is written per country, and each subject opens into the places that actually handle it — with their address, their phone number and whichever of them are on Paylez.',
      /* The two filters' own labels, read out rather than shown — the flag, the
         map pin and the chosen value are the visible half. */
      country: 'Choose a country',
      cities: 'All cities',
      city: 'Filter by city',
      count: '{n} places listed',
      /* A city with nothing under this subject *yet*, and a subject with nothing
         under it anywhere. Two different sentences, because "nothing in Gdańsk"
         and "nothing at all" are different things to be told. */
      none: 'Nothing under this in {city} yet. Try all cities.',
      soon: 'This one is still being written. The assistant below can answer in the meantime.',
      /*
       * The three states of a read, and they are three on purpose.
       *
       * `empty` is a true and useful answer — a country whose guide nobody has
       * written yet — and `failed` is not an answer at all. Rendering one as the
       * other is the lie the console's `loading | ready | error` union exists to
       * prevent, and this page has the same reason for it.
       */
      loading: 'Fetching the guide…',
      empty: 'The guide has nothing for this country yet. Pick another, or ask below.',
      failed: 'We could not reach the guide just now. Nothing has gone missing — try again in a moment.',
      /* A directory listing that is also a Paylez venue: the same place further
         along, with tiers and a stamp card behind it. */
      onPaylez: 'On Paylez',
      visit: 'Website',
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
  },

  /* ──────────────────────────────────────────────────────────── contact ── */

  /**
   * The seventh page, and the one every "Support" link on the site now lands
   * on.
   *
   * It is written around the fact that there is no server here: the form does
   * not post anywhere, it composes a message and hands it to the reader's own
   * mail app. Saying so in `form.note` is the whole reason the form is allowed
   * to exist — a contact form that quietly swallows what you typed is worse
   * than no form at all.
   */
  contact: {
    back: 'Back to paylez',
    form: {
      eyebrow: 'Send a message',
      title: 'Tell us what happened.',
      lede: 'The more specific the better — which screen, what you expected, and what it did instead. If it is about an account, the email address on it saves us a round trip.',
      topic: 'What is this about?',
      topics: ['Support', 'Feedback', 'Partnership', 'Something else'],
      name: 'Your name',
      namePlaceholder: 'First and last name',
      email: 'Your email',
      emailPlaceholder: 'you@email.com',
      message: 'Message',
      messagePlaceholder: 'What happened, and what you expected instead.',
      submit: 'Submit the message',
      note: 'It goes straight to the Paylez team — no mail app, and nothing to press twice. We answer to the address you gave.',
      error: 'Fill in your name, your email address and a message.',
      sending: 'Sending…',
      sent: 'We have it. We answer to the address you gave.',
      offline: 'We could not reach the server just now. Try again in a minute — nothing you typed has been lost.',
      refused: 'That did not go through. Check the email address, and if you have written several times in the last hour, give it a few minutes.',
    },

    hours: {
      title: 'When we answer',
      body: 'Monday to Friday, 09:00–18:00 Central European Time. Most messages get a reply the same working day. Anything that arrives over the weekend is answered on Monday morning.',
      address: 'Kraków, Poland',
    },
  },

  /*
   * The chrome around the two legal documents — not the documents themselves.
   *
   * Their bodies stay in English in every language, because a machine-translated
   * liability cap or GDPR legal basis is a different promise from the one the
   * company made, and a reader cannot tell which they are looking at. These four
   * strings are what makes that honest rather than lazy: the page says, in the
   * reader's own language, what it is holding and why it is in English.
   */
  legal: {
    contents: 'Contents',
    english:
      'This document is published in English. The English text is the authoritative version.',
    privacyVersion: 'Version 1.1 · Effective 28 August 2026 · GDPR compliant',
    termsVersion: 'Version 1.0 · Effective 24 April 2025',
  },
  /* ──────────────────────────────────────────────────────────── profile ── */

  /**
   * `#/profile` — the seven things a person tells us about themselves.
   *
   * The page says out loud that **nothing here is verified**: no code goes to
   * the number, no link to the address. That sentence is dictionary copy rather
   * than a component's business precisely because it is a promise, and a
   * promise kept in one language is made to one reader.
   *
   * Three of the seven carry a rule that is not "is it a string", and all three
   * state it before it is broken rather than on refusal. The figures in those
   * sentences — the username's bounds, how many cities the backend knows —
   * arrive through `{min}` / `{max}` / `{n}` holes from `auth/users.ts` and from
   * the served list itself, so a constant that moves cannot leave five
   * dictionaries quoting the old one.
   *
   * Two of the labels deliberately do not match the field behind them. **Status**
   * is the column `occupation`, because `status` on an account already means
   * whether it is live; and **Country** under an unknown city asks for a country
   * rather than for a code, because the write needs a place and not an entry in
   * a table. A label is what a reader is asked; a column is what the row is
   * called, and they are allowed to differ.
   */
  profile: {
    eyebrow: 'Your account',
    title: 'Your profile',
    lede: 'This is what other players see, and where we know you are. None of it is checked against anything — there is no code sent to your phone and no link to click in your inbox.',

    whoLegend: 'Who you are',
    whereLegend: 'Where you are, and how to reach you',

    photo: 'Photo',
    photoChoose: 'Choose a photo',
    photoHelp: 'Square works best. It is shrunk to a thumbnail and kept on this device.',
    photoRemove: 'Remove photo',

    username: 'Username',
    usernameHelp:
      'Letters, digits and single underscores, {min}–{max} characters. It has to be yours alone — this is the name on a leaderboard row.',
    usernamePlaceholder: 'dilnoza',
    /* Keyed by `UsernameError`. A clash comes back naming the field, the way a
       409 does. */
    usernameErrors: {
      length: 'A username is {min} to {max} characters.',
      shape: 'Letters, digits and single underscores between them — nothing at either end.',
      reserved: 'That username is reserved.',
      taken: 'That username is taken.',
    },

    /* The label is "Status" and the column is `occupation`. See the note above
       the block: the two are allowed to differ, and here they have to. */
    status: 'Status',
    statusHelp: 'Roughly what you do. It is what tells a venue who is in the room.',
    statusChoose: 'Choose one',
    /* The menu's accessible name. The trigger says the chosen value, so without
       this the listbox that opens has no name of its own. */
    statusMenu: 'Status',
    /* Keyed by the five stored values rather than positional, because the menu
       reads them by key and a reordered array would silently relabel everybody
       who had already answered. */
    occupations: {
      student: 'Student',
      worker: 'Worker',
      business: 'Business owner',
      freelancer: 'Freelancer',
      other: 'Other',
    },

    city: 'City',
    cityPlaceholder: 'Start typing your city',
    /* The count is a hole because the list is served, not shipped: a sentence
       claiming 114 cities is a sentence that goes stale the day a 115th is
       added on the other side of the wire. */
    cityHelp:
      'Type, then pick from the list — Paylez knows {n} cities across Poland, Germany and Uzbekistan. If yours is not one of them, say so and write it yourself.',
    cityMenu: 'Matching cities',
    cityOther: 'My city is not on the list',
    cityOtherHelp: 'Write the city the way you would say it, and the country with it.',
    cityNoMatch: 'Nothing matches that — choose “My city is not on the list” and write it yourself.',
    cityNeeded:
      'Pick a city from the list, or choose “My city is not on the list” and write the country too.',
    cityLoading: 'Loading the list of cities…',
    /* The short one goes under the field and the long one in the panel beside
       it. Both said the whole sentence at first, which is the same paragraph
       twice on one row. */
    cityDown: 'Suggestions are not available — write your city and its country.',
    cityOffline:
      'The list of cities comes from the Paylez backend, and it is not answering. You can still write your city and country yourself; the suggestions come back when it does.',
    cityRetry: 'Try again',
    country: 'Country',
    countryPlaceholder: 'Poland',
    /* Why it is being asked at all, because it is not asked of anybody else.
       A country is a *fact* about a city we know, and a question only about one
       we do not. */
    countryHelp: 'Asked only because your city is not on our list. The name or the two-letter code.',
    /* The same field, for the case where the list never arrived. The sentence
       above would be a claim we cannot make — we have not checked the city
       against anything, so "not on our list" is not what happened. */
    countryUnchecked:
      'Asked because we cannot reach the list of cities to look yours up. The name or the two-letter code.',
    countryNeeded: 'A city we do not know needs the country with it.',
    /* Keyed by ISO code rather than an array, because a suggestion carries its
       country as a code and the card in the rail reads it back the same way. A
       country typed by hand is printed as written — there is no table to look
       it up in, and inventing one would be a second, worse city list. */
    countries: { PL: 'Poland', DE: 'Germany', UZ: 'Uzbekistan' },

    phone: 'Phone',
    phoneHelp: 'Nobody calls it and no code is sent to it. It is how a venue reaches you about a claim.',
    phonePlaceholder: '+48 600 000 000',
    phoneShape: 'That does not look like a phone number.',

    birthday: 'Birthday',
    birthdayUnset: 'You can set this once and correct it once. After that it takes a message to support.',
    birthdayOneLeft: 'You can correct this once more.',
    birthdaySpent:
      'You have used both writes on this. Changing it again is a message to support, because a third change is a decision about who somebody is.',
    /* Keyed by `BirthDateError`. */
    birthdayErrors: {
      format: 'A birthday is a date.',
      nonexistent: 'That day does not exist.',
      future: 'A birthday is in the past.',
      young: 'An account holder has to be at least 13.',
      old: 'That birthday does not look right.',
    },
    birthdayNoWrites: 'A birthday can be corrected once — contact support to have it changed again.',

    email: 'Email',
    emailHelp: 'What signs you in. Changing it is not something this build can do.',

    save: 'Save profile',
    saved: 'Saved',

    cardTitle: 'What others see',
    cardNoName: 'No username yet',
    cardNoRole: 'No status yet',
    cardNowhere: 'No city yet',

    meterTitle: 'Profile',
    meterDone: 'All seven answered.',
    meterStill: 'Still blank',
    /* The percentage sits inside the sentence: "60% answered" and "wypełnione w
       60%" do not agree about which side of the word the figure goes. */
    meterProgress: '{pct}% answered',
    meterReward: 'Fill all seven and earn {points} points.',
    meterRewardPaid: '{points} points earned for finishing it.',
    wonTitle: 'Profile complete',
    wonBody: 'Nice one. {points} points are in your balance.',
    wonClose: 'Great',
    /* Keyed by `ProfileField`, so a field added to the form is a build error
       here rather than a blank row in the panel beside it. */
    fieldNames: {
      avatar: 'Photo',
      username: 'Username',
      occupation: 'Status',
      city: 'City',
      email: 'Email',
      phone: 'Phone',
      birthDate: 'Birthday',
    },
  },

  /* ───────────────────────────────────────────────────────── onboarding ── */

  /**
   * `#/welcome` — the first minute: a language, three rounds of flags, and what
   * they paid.
   *
   * One string is deliberately **not** here. The language names in step one are
   * `LANGUAGES[code].label`, read out of each dictionary, because a picker has
   * to write every option in its own language rather than in the one currently
   * selected.
   *
   * The three counted sentences carry their figures as holes rather than as
   * words either side of a number. "Step 2 of 3" and "Krok 2 z 3" only agree
   * because the whole sentence is one string.
   */
  onboarding: {
    step: 'Step {n} of {total}',

    langTitle: 'Pick a language',
    langLede: 'You can change it later — it is the switcher in the header.',
    langNext: 'Continue',
      /* Step one and a half: where you play, and whether to be listed. */
      placeTitle: 'Where do you play?',
      placeLede: 'The leaderboard is ranked by city and by country. You can skip this — you will still play, still earn, and still appear on the worldwide board.',
      placeCity: 'Your city',
      placeCityPlaceholder: 'Start typing…',
      placeListed: 'Show me on the leaderboard',
      placeListedNote: 'Your name and your weekly points, visible to other players. Off unless you turn it on, and you can change it any time in your profile.',
      placeSaving: 'Saving…',
      back: 'Back',

    gameTitle: 'Which country is this?',
    gameRound: 'Round {n} of {total}',
    gamePts: 'pts',
    gameNext: 'Next',
    gameLast: 'See what you won',
    gameBack: 'Back',
    gameLoading: 'Getting the flags…',
    gameFailed: 'The flags did not load.',
    gameRetry: 'Try again',
    gameRight: 'Right',
    gameWrong: 'Not this time',

    payTitle: 'That is yours to keep',
    payEarned: 'From the flags',
    payGift: 'Welcome gift',
    payTotal: 'points',
    /* The first rung worth having, as one sentence rather than a number with
       half a clause on either side of it. */
    payTier: 'The first thing worth having is at {n} points.',
    /* Points do not expire, on any plan. The line that stood here said
       "nothing here expires this week", which promised that something
       eventually does. */
    payLede:
      'Points come from playing and from turning up at the venues in your city. They do not expire — they wait for you.',
    payGo: 'Start playing',
    payProfile: 'Finish your profile first',
    /* The way out of the round. Quiet on purpose -- the alternative, not the offer. */
    /* The offer, shown before the first flag. `{n}` is the question count and
       `{points}` the round's total -- both summed from `ROUND_POINTS`, so the
       promise and the payout are one number. */
    introTitle: 'Win your first points',
    introLede: 'Answer {n} questions about flags and earn up to {points} points. Skip any you do not know — a skipped question just pays nothing.',
    introGo: 'Next',
    gameSkip: 'Skip this question',
    /* The payoff screen's offer of the rest of the product. `{n}` is a count
       of the other games, filled from `GAMES` so the number cannot drift. */
    moreTitle: '{n} more games are waiting',
    moreLede: 'Quizzes, word puzzles, memory and a flight run — all of them pay points, all of them are in L-Earn.',
    moreGo: 'See the games',
    /**
     * The reel's two arrows, read out rather than shown.
     *
     * Both are `aria-label`s on buttons whose visible content is a chevron, so
     * these are the only words a screen reader gets for them — which is exactly
     * why they are dictionary copy and not typed into the component.
     */
    reelPrev: 'Previous game',
    reelNext: 'Next game',
  },

  /* ─────────────────────────────────────────────────────── subscription ── */

  /**
   * What a plan costs, and what each one is.
   *
   * **No string here carries a currency symbol or an amount.** Every price on
   * the section arrives through `useMoney`; `billed.term` takes the total as a
   * `{total}` hole already written in the reader's currency.
   *
   * `plans` is index-aligned with `SUB_PLANS` in `content.ts`, `rows` with
   * `SUB_ROWS`, and `badges` with the `badge` row's values 1 and 2. **The unit
   * lives in the row label** — "Hours to refill one energy", never an "h"
   * welded to the figure — so the unit stays translatable copy instead of a
   * letter typed into a component.
   */
  subscription: {
    eyebrow: 'Plans',
    title: 'Play free. Pay for headroom.',
    lede: 'Every plan plays the same games and spends at the same venues. What a paid one buys is room to move — more energy, longer to spend a voucher, and more points for the same round.',
    term: {
      /** Names the rung picker for a screen reader. */
      label: 'How long you commit for',
      one: '1 month',
      many: '{n} months',
      save: 'Save {pct}%',
      /** The chip on the rung that is not a commitment at all. */
      rolling: 'No commitment',
    },
    perMonth: 'a month',
    free: 'Free',
    billed: {
      free: 'Free for as long as you use it. No card, and no trial to expire.',
      monthly: 'Billed every month, and stopped whenever you like.',
      term: '{total} charged once, for {n} months.',
    },
    unlimited: 'Unlimited',
    /** Read instead of the tick and the dash, which say nothing out loud. */
    included: 'Included',
    notIncluded: 'Not included',
    /**
     * The one control on this site that takes money.
     *
     * `{plan}` is the plan's own name as the card already spells it, so the
     * button and the heading above it cannot disagree.
     */
    get: 'Get {plan}',
    /** Shown instead of the button on the plan somebody is already paying for. */
    current: 'Your plan',
    opening: 'Opening…',
    failed: 'The payment page did not open. Try again.',
    /** Index-aligned with the `badge` row's values 1 and 2. */
    badges: ['Star', 'Crown'],
    /**
     * The strip's labels, index-aligned with the first `SUB_HERO` rows.
     *
     * Short on purpose, and short is why they are not `rows` reused: these sit
     * under a figure at display size in a third of a card, where "Hours to
     * refill one energy" wraps to three lines and stops being a label. The unit
     * still lives in the label rather than welded to the number — that rule is
     * about where a translator can reach it, not about how long the words are.
     */
    heroRows: ['Energy a day', 'Refill, minutes', 'Points a round'],
    /**
     * The band under the price: what a day on this plan actually holds.
     *
     * Every figure in it is derived — `subRoundsPerDay` multiplies the two rows
     * printed directly beneath it — because this is the one line on the card
     * that answers the question a reader is actually asking, and a number typed
     * here would be a claim rather than a consequence.
     */
    day: {
      /** The unit for that figure. It lives in the label, like every other. */
      rounds: 'rounds a day',
      /** Which reading it is: the tank counts, so the day starts full. */
      from: 'from a full tank',
      /**
       * The paid cards' step up on the free column. `{n}` is a count of rounds
       * and `{plan}` is the free plan's own name, so the chip cannot start
       * calling it something the card above it does not.
       */
      vs: '+{n} vs {plan}',
      /** The free card's own slot, which is what those two chips are measured from. */
      base: 'The plan every figure beside it is measured against.',
    },
    /** Heads the nine rows under the strip. */
    more: 'Everything else',
    /** Names the seal for a screen reader: "Star plan mark". */
    mark: '{name} plan mark',
    /** Index-aligned with `SUB_PLANS`. */
    plans: [
      { name: 'Free', note: 'The whole loop, unaided.' },
      { name: 'Pro', note: 'For the player who is on it daily.' },
      { name: 'Premium', note: 'For the one who cashes out.' },
    ],
    /** Index-aligned with `SUB_ROWS`. The unit lives here; see the note above. */
    rows: [
      'Energy a day',
      'Minutes to refill one energy',
      'Points on a game round',
      'Days a voucher stays spendable',
      'Word Builder hints a day',
      'Assistant questions a day',
      'Streak freezes',
      'Exclusive deals',
      'Hours’ head start on a deal',
      'Priority on gift cards',
      'Points credited every month',
      'Priority support',
      'Mark beside your name',
    ],
    action: 'Create an account',
    note: 'No plan has a trial — the free tier is the trial, and it does not expire. Plans are chosen in the app once you have an account.',
  },

  footer: {
    blurb:
      'Play & Earn. Exclusive deals. Real rewards. Discover, save and get rewarded.',
    location: 'Kraków, Poland',
    /* One string for both channels — the label differs only by the name. */
    social: 'paylez on {channel}',
    columns: [
      {
        heading: 'Product',
        links: ['Play & Earn', 'Discounts', 'Relocate', 'AI Assistant'],
      },
      {
        heading: 'Company',
        links: ['Support', 'Share Your Feedback', 'Hot Deals'],
      },
    ],
    news: {
      heading: 'Get the best deals first',
      body: 'One short email a week — the new drops and partner deals worth your time.',
      success: 'Your mail app is open — send it and you are on the list ✦',
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
