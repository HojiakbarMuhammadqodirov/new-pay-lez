import type { Dictionary } from './en';

/**
 * Polish. Structurally identical to `en` — the type enforces it.
 *
 * The product ships in Poland, so this is the dictionary the largest share of
 * visitors will actually read; the copy is written rather than transliterated.
 */
export const pl: Dictionary = {
  code: 'pl',
  label: 'Polski',
  short: 'PL',
  region: 'PL',

  nav: {
    home: 'Start',
    learn: 'L-Earn',
    analytics: 'Analityka',
    business: 'Dla firm',
    /* The same route as `learn`, under the word an owner needs. See
       `NAV_LABEL_BUSINESS` in `content.ts`. */
    games: 'Gry',
    wallet: 'Portfel',
    contact: 'Kontakt',
    relocate: 'Przeprowadzka',
  },
  /** The phone burger's label. There is no visible text beside it. */
  menu: 'Menu',
  signIn: 'Zaloguj się',
  assistant: 'Otwórz asystenta AI',
  languageMenu: 'Zmień język',
  theme: {
    label: 'Motyw',
    toLight: 'Przełącz na jasny motyw',
    toDark: 'Przełącz na ciemny motyw',
  },

  auth: {
    eyebrow: 'Witaj ponownie',
    title: 'Zaloguj się do paylez.',
    lede: 'Twoje punkty, vouchery i przewodnik — na urządzeniu, po które właśnie sięgnąłeś.',
    email: 'Adres e-mail',
    emailPlaceholder: 'ty@email.com',
    password: 'Hasło',
    passwordPlaceholder: 'Twoje hasło',
    submit: 'Zaloguj się',
    errors: {
      email: 'Nie mamy konta z tym adresem e-mail.',
      password: 'To hasło się nie zgadza.',
      empty: 'Podaj adres e-mail i hasło.',
    },

    signUpEyebrow: 'Pierwszy raz?',
    signUpTitle: 'Załóż konto paylez.',
    signUpLede:
      'Dwa pola i jeden wybór. To, co wybierzesz, decyduje o tym, co zobaczysz od następnego ekranu.',
    name: 'Imię i nazwisko',
    namePlaceholder: 'Imię i nazwisko',
    newPasswordPlaceholder: 'Co najmniej {n} znaków',
    typeQuestion: 'Kim jesteś?',
    typeNote: 'Na razie wybierasz tylko raz, więc wybierz to, co pasuje.',
    signUpSubmit: 'Załóż konto',
    orDivider: 'lub',
    googleContinue: 'Kontynuuj z Google',
    googleWorking: 'Logowanie…',
    googleUnreachable:
      'Logowanie Google jest chwilowo niedostępne. Użyj adresu e-mail i hasła poniżej.',
    googleRefused:
      'Nie udało się zalogować przez Google. Spróbuj ponownie.',
    signUpErrors: {
      name: 'Podaj swoje imię i nazwisko.',
      email: 'To nie wygląda na adres e-mail.',
      taken: 'Konto z tym adresem już istnieje. Zaloguj się.',
      password: 'Użyj co najmniej {n} znaków.',
      type: 'Wybierz, czy jesteś tu jako osoba, czy jako firma.',
    },
    noAccount: 'Nie masz jeszcze konta?',
    toSignUp: 'Załóż je',
    haveAccount: 'Masz już konto?',
    toSignIn: 'Zaloguj się',

    typeEyebrow: 'Jeszcze jedno',
    typeTitle: 'Jak będziesz korzystać z paylez, {name}?',
    typeLede: 'To decyduje, co zobaczysz. Na razie wybierasz tylko raz, więc wybierz to, co pasuje.',
    types: [
      {
        name: 'Osoba prywatna',
        blurb: 'Graj, zbieraj punkty, wymieniaj je na vouchery i czytaj przewodnik.',
      },
      {
        name: 'Właściciel firmy',
        blurb: 'Dodaj swój lokal, pokaż ofertę graczom i sprawdź, co przyniosła.',
      },
    ],
    typeSubmit: 'Dalej',
    typeHint: 'Wybierz jedną opcję, aby przejść dalej.',

    signOut: 'Wyloguj się',
    accountMenu: 'Twoje konto',
    dashboard: 'Panel',
    roles: { individual: 'Użytkownik', business: 'Firma', admin: 'Administrator' },
  },

  admin: {
    tag: 'Konsola',
    title: 'Cała platforma.',
    lede: 'Każdy lokal, każda oferta i każde konto — oraz analityka za każdym z nich.',
    back: 'Wróć do paylez',
    search: 'Szukaj lokalu, ID usługi, oferty lub osoby…',
    noMatch: 'Nic nie pasuje do tego wyszukiwania.',
    kpis: [
      'Wszystkie usługi',
      'Aktywne usługi',
      'Wszystkie oferty',
      'Aktywne oferty',
      'Konta',
      'Gracze',
    ],
    tabs: ['Usługi', 'Oferty', 'Ludzie', 'Witryna', 'Wiadomości'],

    services: {
      title: 'Usługi biznesowe',
      lede: 'Każdy lokal na paylez. Otwórz jeden, aby zobaczyć jego analitykę.',
      serviceId: 'ID usługi',
      copy: 'Kopiuj',
      copied: 'Skopiowano',
      analytics: 'Analityka',
      active: 'Aktywna',
      paused: 'Wstrzymana',
      vouchers: 'Vouchery',
      live: 'Prawdziwa wizytówka',
    },

    deals: {
      title: 'Oferty i karty podarunkowe',
      lede: 'Co aplikacja pokazuje w całym kraju w tym miesiącu.',
      kinds: { gift: 'Karta podarunkowa', deal: 'Gorąca oferta' },
      until: 'Do {date}',
    },

    people: {
      title: 'Ludzie',
      lede: 'Trzy konta wbudowane i wszyscy, którzy zarejestrowali się później.',
      columns: ['Imię i nazwisko', 'E-mail', 'Rola', 'Dołączenie', 'Stan'],
    },

    state: {
      player: '{points} pkt · seria {streak} dni',
      listing: 'ukończono {percent}%',
      live: 'Aktywna',
      noListing: 'Nie rozpoczęto',
      undecided: 'Nie wybrano',
      none: '—',
    },

    note: 'Ta baza kont jest w tej przeglądarce. Nie ma jeszcze serwera, więc konsola czyta, a nie edytuje — zobacz auth/users.ts.',

    /* ── czwarta zakładka: sama witryna, jedyna pytająca serwer ── */
    messages: {
      title: 'Co napisali ludzie',
      lede: 'Wiadomości ze strony Kontakt. Odpowiadasz z własnego programu pocztowego — adres jest linkiem.',
      filter: 'Filtruj po statusie',
      all: 'Wszystkie',
      statuses: ['Nowe', 'Przeczytane', 'Załatwione'],
      empty: 'Nic tu nie ma.',
      markRead: 'Oznacz jako przeczytane',
      markDone: 'Oznacz jako załatwione',
      signedIn: 'Ma konto',
      wroteIn: 'Napisał(a) po {language}',
    },
    website: {
      title: 'Witryna',
      lede: 'Odwiedzający, strony i aktywność, {from} – {to}.',
      loading: 'Pytamy serwer…',
      empty: 'Nic jeszcze nie zapisano.',
      kpis: [
        'Odwiedzający (dziennie, suma)',
        'Wizyty',
        'Odsłony',
        'Akcje',
        'Wizyty zalogowanych',
        'Powracające konta',
      ],
      privacy:
        'Odwiedzający to skrót zmieniany każdego dnia, więc nikt nie jest śledzony między dniami i żaden adres nie jest zapisywany. Dlatego dla ruchu anonimowego nie ma liczby „powracających” — jej nie da się zmierzyć, a nie jest ona zerem.',
      trend: 'Odwiedzający dziennie',
      pages: 'Najczęściej czytane strony',
      referrers: 'Skąd przyszli',
      countries: 'Kraje',
      devices: 'Urządzenia',
      actions: 'Co zrobili',

      people: {
        title: 'Konta na serwerze',
        lede: 'Wszyscy, o których wie backend, od najnowszych.',
        columns: ['Nazwa', 'Miasto', 'Rola', 'Punkty', 'Skany', 'Dołączył'],
      },

      feed: {
        title: 'Aktywność',
        lede: 'Wszystko, co wydarzyło się na platformie, od najnowszych.',
        kinds: {
          signup: 'Rejestracja',
          venue: 'Nowy lokal',
          transaction: 'Skan',
          voucher: 'Voucher',
          game: 'Gra',
        } as Record<string, string>,
      },

      connect: {
        title: 'Połącz z backendem',
        lede: 'Ta zakładka czyta działający serwer, więc potrzebuje konta operacyjnego — tego z PAYLEZ_ADMIN_EMAIL, nie demonstracyjnego logowania.',
        email: 'E-mail operacyjny',
        password: 'Hasło',
        submit: 'Połącz',
        working: 'Łączenie…',
        refused: 'Odmowa. Sprawdź adres i hasło.',
        notAdmin: 'To konto istnieje, ale nie jest kontem operatora.',
        unreachable: 'Brak odpowiedzi. Czy backend działa (npm run server)?',
      },

      down: {
        title: 'Backend nie odpowiada',
        unreachable:
          'Nic nie nasłuchuje. Uruchom npm run server albo ustaw VITE_API_URL, jeśli serwer jest gdzie indziej.',
        refused: 'Serwer odpowiedział, ale odmówił temu kontu.',
        retry: 'Spróbuj ponownie',
        disconnect: 'Wyloguj z API',
      },
    },

    analytics: {
      back: 'Wszystkie usługi',
      totals: ['Łączne zaangażowanie', 'Wszystkie vouchery', 'Wszystkie skany'],
      tabs: ['Pulpit', 'Gorące oferty', 'Skany lojalnościowe', 'Vouchery', 'Wnioski'],

      ranges: ['Cały czas', 'Ostatnie 7 dni', 'Ostatnie 30 dni', 'Ostatnie 90 dni'],
      rangesLabel: 'Zakres czasu',
      search: 'Szukaj użytkownika, kodu, paragonu…',
      records: '{n} rekordów',
      export: 'Eksport CSV',
      noRows: 'Nic nie pasuje do tych filtrów.',

      unmeasured: {
        noSource: 'Nie mierzone — nic, co operator mógłby odczytać, jeszcze tego nie raportuje.',
        measured:
          'Wizyty i klienci są liczone, z GET /v1/admin/venues. Wszystko inne na tym ekranie należy do partnera albo nie jest zbierane i pokazujemy to jako „nie mierzone”, a nie jako zero.',
        notConnected:
          'Backend nie odpowiada, więc nawet liczby wizyt i klientów nie da się odczytać. To nie jest zero — nie udało się zapytać.',
      },

      states: { live: 'Aktywna', paused: 'Wstrzymana' },
      status: { used: 'Wykorzystany', active: 'Niewykorzystany' },

      columns: {
        deals: ['Data', 'Oferta', 'Użytkownik', 'Kod', 'Punkty', 'Rabat', 'Status', 'Rachunek'],
        scans: ['Data', 'Użytkownik', 'Punkty', 'Zakup', 'Paragon', 'Gdzie', 'Do nagrody'],
        vouchers: ['Data', 'Kod', 'Typ', 'Użytkownik', 'Nagroda', 'Punkty', 'Status', 'Rachunek'],
      },

      cards: [
        { label: 'Kliknięcia w Mapy Google', note: 'Kliknięcia przycisku nawigacji' },
        { label: 'Kliknięcia w stronę', note: 'Wejścia z wizytówki' },
        { label: 'Kliknięcia w telefon', note: 'Próby połączenia' },
        { label: 'Kliknięcia w Instagram', note: 'Wejścia na profil z aplikacji' },
        { label: 'Wszystkie vouchery', note: '{used} wykorzystanych · {active} aktywnych' },
        { label: 'Vouchery lojalnościowe', note: '{used} wykorzystanych · {active} aktywnych' },
        { label: 'Łączna wartość rabatu', note: 'Na rachunkach, na których go użyto' },
        { label: 'Łączne zaangażowanie', note: 'Wszystkie interakcje razem' },
        { label: 'Wszystkie skany', note: 'Skany QR przy kasie' },
      ],

      trend: {
        title: 'Trend zaangażowania',
        lede: 'Ostatnie 30 dni',
        empty: 'Brak danych o trendzie.',
      },

      hot: {
        title: 'Gorące oferty',
        lede: 'Oferty czasowe, które prowadzi ten lokal.',
        empty: 'Ten lokal nie prowadził jeszcze żadnej oferty.',
        counts: ['Aktywne', 'Realizacje', 'Wstrzymane'],
        points: '{n} pkt',
        expires: 'Wygasa {date}',
        redemptions: '{n} realizacji',
        tableTitle: 'Realizacje gorących ofert',
      },

      loyalty: {
        settingsTitle: 'Ustawienia skanów lojalnościowych',
        settingsLede: 'Ile wart jest skan przy kasie i jak często się liczy.',
        perVisit: 'punktów za wizytę',
        cooldown: 'między skanami',
        hours: '{n} godz.',
        campaignsTitle: 'Kampanie voucherów lojalnościowych',
        campaignsLede: 'Automatyczne nagrody dla klientów, którzy wracają.',
        campaignsEmpty: 'Brak kampanii lojalnościowych.',
        every: 'Co {n} wizyt',
        reward: '{n}% zniżki na kolejną',
        tiles: [
          { label: 'Wszystkie skany', note: 'przyznano {n} punktów' },
          { label: 'Sprzedaż ze skanów', note: 'z {n} skanów' },
          { label: 'Średni zakup', note: 'na zeskanowaną wizytę' },
        ],
        tableTitle: 'Skany lojalnościowe',
        trendTitle: 'Skany dzienne',
        trendLede: 'Ostatnie 30 dni',
        trendEmpty: 'Brak skanów.',
      },

      vouchers: {
        campaignTitle: 'Kampania voucherów rabatowych',
        campaignKind: 'Na budżecie · wydano {n}',
        usage: 'Wykorzystanie budżetu',
        used: '{used} z {total}',
        left: 'zostało {amount}',
        points: 'Punkty',
        issued: 'Wydane',
        cap: 'Limit miesięczny',
        tiles: [
          { label: 'Łączna sprzedaż', note: 'z {n} realizacji' },
          { label: 'Średni koszyk', note: 'na wykorzystany voucher' },
        ],
        tableTitle: 'Vouchery',
        types: { discount: 'Rabat', loyalty: 'Lojalność' },
        dailyTitle: 'Dzienny trend sprzedaży',
        dailyLede: 'Ostatnie 30 dni, sumy rachunków',
        dailyEmpty: 'Brak sprzedaży — sumy rachunków pojawią się po użyciu voucherów.',
        monthlyTitle: 'Wygenerowana sprzedaż',
        monthlyLede: 'Miesięczna wartość rachunków z realizacji',
      },

      insights: {
        citiesTitle: 'Główne miasta',
        citiesLede: 'Skąd przychodzą klienci',
        citiesEmpty: 'Brak danych o miastach.',
        langsTitle: 'Języki klientów',
        langsLede: 'W jakim języku czytają wizytówkę',
        langsEmpty: 'Brak danych o językach.',
        compareTitle: 'Na tle średniej krajowej',
        compareLede: 'Jak ten lokal wypada na tle podobnych usług',
        mine: 'Ten lokal',
        avg: 'Średnia krajowa',
        axis: ['Mapy', 'Strona', 'Telefon'],
      },
    },
  },

  assistantPanel: {
    title: 'Asystent AI',
    close: 'Zamknij asystenta',

    lockedTitle: 'Zaloguj się, aby zapytać',
    lockedBody:
      'Asystent odpowiada na podstawie Twoich punktów, voucherów i miasta. Do tego potrzebne jest konto.',
    lockedAction: 'Zaloguj się',

    greeting: 'Cześć, {name}',
    lede: 'Zapytaj o cokolwiek — punkty, vouchery, formalności albo gdzie coś znaleźć w pobliżu.',
    placeholder: 'Zapytaj o cokolwiek…',
    send: 'Wyślij',
    suggestions: [
      'Ile punktów potrzebuję na voucher?',
      'Jak zameldować się pod adresem?',
      'Co jest teraz otwarte w pobliżu?',
    ],
    you: 'Ty',
    stubReply:
      'W tej wersji asystent nie jest podłączony do modelu, więc nie odpowiem jeszcze na to pytanie. Wszystko dookoła tej wiadomości — rozmowa, pole tekstowe, Twoje konto — działa naprawdę.',
    stubTag: 'Bez połączenia',
  },

  wallet: {
    title: 'Twoje vouchery',
    lede: 'Wszystko, co zdobyłeś, i wszystko, co wydałeś.',
    balance: 'Saldo',
    points: 'pkt',
    shortBy: 'Do kolejnego vouchera brakuje {n} punktów',
    canRedeem: 'Wystarczy na voucher',

    tabs: ['Aktywne', 'Wykorzystane'],
    counts: '{active} aktywnych · {used} wykorzystanych',

    valid: 'Ważny do {date}',
    usedOn: 'Wykorzystany {date}',
    cost: '{n} pkt',
    show: 'Pokaż kod QR',
    shown: 'Voucher przechodzi do „Wykorzystanych” w chwili wygenerowania kodu — zrób to przy kasie.',

    emptyActive: 'Nic tu jeszcze nie ma. Zagraj rundę i wydaj punkty tutaj.',
    emptyUsed: 'Nic jeszcze nie wykorzystano.',
    play: 'Zagraj rundę',

    catalogue: 'Co możesz dostać',
    catalogueLede: 'Odświeżane co miesiąc. Każda karta ma ograniczoną pulę.',
    redeem: 'Odbierz',
    short: 'Za mało punktów',
    soldOut: 'Wraca 1. dnia miesiąca',
    left: 'zostało {left} z {of}',

    stamps: {
      title: 'Karty pieczątek',
      lede: 'Każda karta liczy wizyty w jednym lokalu. Wizyty to nie punkty i nie można ich wydać gdzie indziej.',
      progress: '{done} z {of}',
      empty: 'Jeszcze bez wizyt — {of} wizyt daje {reward}',
      going: 'Jeszcze {left} do {reward}',
      goingOne: 'Jeszcze jedna wizyta do {reward}',
      full: 'Komplet — {reward} czeka przy kasie',
      cycles: 'Wypełniona {n}× wcześniej',
      none: 'Nie masz jeszcze kart. Pierwsza zaczyna się przy pierwszej wizycie w lokalu z kartą.',
      noneHere: 'Brak kart pieczątek w kategorii {category}.',
      visit: 'Dodaj wizytę',
    },

    deals: {
      title: 'Gorące oferty',
      lede: 'Oferty w pobliżu. Większość nie kosztuje nic — płaci za nie lokal.',

      all: 'Wszystkie',
      categories: ['Kawa', 'Jedzenie', 'Piekarnia', 'Usługi', 'Uroda'],
      filter: 'Filtruj według kategorii',
      noneHere: 'W kategorii {category} nie ma jeszcze nic w pobliżu.',
      showAll: 'Pokaż wszystkie oferty',

      openNow: 'Otwarte teraz',
      closedNow: 'Zamknięte teraz',
      held: 'W Twoim portfelu',

      everyDay: 'Codziennie, {hours}',
      until: 'Do {date}',
      reviews: '{n} opinii',

      free: 'Za darmo',
      claim: 'Odbierz',
      shortBy: 'Brakuje jeszcze {n} punktów',
      claimed: 'Odebrano {date}',
      justClaimed: 'Odebrano — pokaż ten kod przy kasie',
      code: 'Twój kod',

      offers: [
        'Dwie kawy, a trzecia na koszt lokalu.',
        'Dziesięć procent zniżki na całe zamówienie, przez cały dzień.',
        'Dwadzieścia procent zniżki na wszystko na ladzie.',
        'Kup trzy bochenki, a czwarty dostaniesz za darmo.',
        'Piętnaście procent zniżki na lunch w każdym stoisku w hali.',
        'Dwa dania, a trzecie na koszt lokalu.',
        'Darmowa kawa przelewowa do każdej kupionej książki.',
        'Piętnaście procent zniżki na strzyżenie i podcięcie brody.',
        'Dwadzieścia pięć procent zniżki na pierwszy zabieg.',
      ],

      none: 'Nic jeszcze nie odebrano.',
    },

    redeemed: {
      title: 'Odebrane',
      lede: 'To, co już odebrałeś. Pokaż kod przy kasie — każdy działa tylko raz.',
      dealsTitle: 'Odebrane gorące oferty',
      dealsLede: 'Twoje aż do końca oferty. Lokal odczytuje kod przy kasie.',
    },

    giftsTitle: 'Karty podarunkowe',
    giftsLede: 'Opłacone przez Paylez. Stała kwota, wydawana jak pieniądze w miejscu na karcie.',
  },

  games: {
    title: 'Gry na rozum',
    lede: 'Sprawdź się, zbieraj punkty i zamieniaj je na vouchery rabatowe.',

    score: 'Wynik',
    streak: 'Seria',
    energy: 'Energia',
    roundMistakes: 'Pozostałe błędy',
    freezes: 'Zamrożenia',
    answered: 'Odpowiedzi',
    correctLabel: 'Poprawnych',
    toVoucher: 'Do vouchera',

    redeemTitle: 'Zamień punkty na nagrody',
    redeemAction: 'Odbierz teraz',

    pointsKicker: 'Twoje punkty',
    pointsUnit: '{points} pkt',
    pointsGoal: 'jeszcze {points} do {target}',
    pointsHave: 'masz już dość na zniżkę',

    statsToggle: 'Twoje statystyki',
    accuracy: 'Skuteczność',

    featured: 'Dzisiejsza gra · podtrzymuje serię',

    streakHint: 'Jedna runda dziennie ją podtrzymuje',
    freezesHint: 'Każde pokrywa jeden opuszczony dzień',
    streakKept: 'zaliczone',
    streakMissed: 'opuszczone',
    streakAhead: 'jeszcze przed nami',

    names: [
      'Znajdź parę',
      'Lot Squawka',
      'Zgadnij flagę',
      'Kraj i stolica',
      'Gry na rozum',
      'Quiz o Polsce',
      'Ułóż słowo · Angielski',
      'Ułóż słowo · {language}',
    ],
    rule: '{questions} pytań · po {seconds} sek.',
    reward: '{mistakes} błąd dozwolony · +{points} za poprawną odpowiedź',
    start: 'Zacznij grę',
    play: 'Zagraj',
    noEnergy: 'Koniec energii',
    energyFull: 'Pełna — nie ma na co czekać',
    energyNext: '+1 za {time}',
    energyCost: '1 na rundę',
    loading: 'Rozdajemy…',

    /* Fixed samples of the kind of question each bank asks — short enough to
       read at preview size. `options[0]` is the right answer everywhere here,
       so keep the order; `capital.country` is filled into `whichCapital`. */
    preview: {
      flag: ['Polska', 'Ukraina', 'Hiszpania'],
      capital: { country: 'Polski', options: ['Warszawa', 'Kraków', 'Gdańsk'] },
      brain: {
        q: 'Którą planetę nazywamy Czerwoną Planetą?',
        options: ['Mars', 'Wenus', 'Jowisz'],
      },
      poland: {
        q: 'Jaka jest waluta Polski?',
        options: ['Złoty', 'Euro', 'Korona'],
      },
    },

    question: 'Pytanie {n} z {total}',
    whichCountry: 'Jaki to kraj?',
    whichCapital: 'Jaka jest stolica kraju {country}?',
    quit: 'Poddaj się',
    timeUp: 'Czas',

    wonTitle: 'Runda wygrana',
    lostTitle: 'Koniec rundy',
    resultScore: '{correct} z {total} poprawnie',
    resultPoints: '+{points} punktów',
    resultNone: 'W tej rundzie bez punktów.',
    resultToward: 'Jeszcze {points} i pierwszy voucher jest Twój.',
    resultAfford: 'Masz już dość na voucher — idź go odebrać.',
    resultSpend: 'Wydaj punkty',
    resultStreak: 'Seria: {streak} dni',
    again: 'Zagraj jeszcze raz',
    backToGames: 'Wróć do gier',

    boardTitle: 'Ranking',
    boardTabs: ['Poprawne odpowiedzi', 'Zdobyte punkty'],
    boardTop: 'Top 10',
    /* The signed-in player's own row on the leaderboard. Everybody else is a
       derived PY-code; this one is the second person, because a board you are
       on should say so in words rather than in a code you have to recognise. */
    boardYou: 'Ty',
    boardStreak: 'seria {n} dni',
    boardCorrect: 'poprawnych',
    boardPoints: 'punktów',
    boardEmpty: 'Jeszcze nikt nie gra. Bądź pierwszy!',
    boardShowAll: 'Pokaż całe top 10',
    boardShowLess: 'Pokaż mniej',

    flight: {
      rule: 'Leć tak daleko, jak zdoła Squawk · {gaps} bram zalicza rundę',
      reward: 'Jedno zderzenie kończy grę · +{points} za bramę · do {max} za lot',
      goal: '{target} zalicza rundę',
      hint: 'Dotknij ekranu, aby zamachać skrzydłami',
      resume: 'Dotknij, aby wrócić do gry',
      aria: 'Gra zręcznościowa. Dotknij planszy, aby zamachać skrzydłami.',
      crashed: 'Squawk zahaczył o słupek',
      resultScore: 'Przeleciane bramy: {cleared}',
      motionTitle: 'Ta gra się porusza',
      motionBody:
        'Twoje urządzenie prosi o mniej ruchu, a ta gra to nieprzerwany ruch przez cały ekran — nie ma jej wersji nieruchomej. Pozostałe gry to quizy i łamigłówki — stoją w miejscu. Jeśli mimo to wolisz polatać, wszystko poza samą grą pozostanie nieruchome.',
      motionPlay: 'Zagraj mimo to',
      motionBack: 'Wróć do gier',
    },

    memory: {
      rule: '{pairs} par · bez limitu czasu',
      reward: 'Szybsze ułożenie to więcej punktów · do {points}',
      pairs: 'Pary {found} / {total}',
      moves: 'Ruchy: {n}',
      facedown: 'Zakryta karta',
      hint: 'Odkryj dwie karty. Dopasuj je, a słowo zostaje z Tobą.',
      resultScore: 'Znalezione pary: {pairs}',
    },

    wordGame: {
      rule: '{words} słów · od łatwych do trudnych',
      reward: 'Trudniejsze słowa dają więcej · podpowiedź kosztuje bonus',
      lists: { pl: 'Polski', en: 'Angielski' },
      tier: 'Poziom {n}',
      undo: 'Cofnij',
      clear: 'Wyczyść',
      reveal: 'Podpowiedź',
      next: 'Następne słowo',
      finish: 'Zobacz wynik',
      correct: 'Dobrze · +{points} punktów',
      resultScore: 'Ułożone słowa: {solved} z {total}',
    },
  },

  listing: {
    setupEyebrow: 'Skonfiguruj swój lokal',
    setupTitle: 'Opowiedz nam o swojej firmie.',
    setupLede:
      'Wszystko stąd trafia prosto do Twojej wizytówki w aplikacji Paylez. Pola oznaczone gwiazdką są potrzebne, zanim wizytówka będzie widoczna.',

    screenTitle: 'Profil firmy',
    screenLede: 'Twoja wizytówka w aplikacji Paylez, przetłumaczona dla każdego klienta.',

    sections: {
      basic: 'Podstawowe informacje',
      where: 'Gdzie jesteście',
      reach: 'Jak klienci mogą się skontaktować',
      service: 'Obsługa i godziny',
    },

    fields: {
      name: 'Nazwa firmy',
      namePlaceholder: 'Nazwa nad Twoimi drzwiami',
      category: 'Kategoria',
      subcategory: 'Podkategoria',
      description: 'Opis',
      descriptionPlaceholder: 'Dwa albo trzy zdania o tym, co robicie i kto do Was przychodzi.',
      descriptionHelp: 'Paylez tłumaczy to dla klientów czytających w innym języku.',
      price: 'Typowa cena',
      pricePlaceholder: '25–45 zł',
      priceHelp: 'Ile zwykle wydaje jeden klient.',
      logo: 'Logo',
      logoHelp: 'Kwadratowe, co najmniej 512 px.',
      logoChoose: 'Wybierz plik',
      logoReplace: 'Zmień',
      logoRemove: 'Usuń',

      country: 'Kraj',
      city: 'Miasto',
      cityPlaceholder: 'Kraków',
      street: 'Adres',
      streetPlaceholder: 'Ulica i numer budynku',
      maps: 'Link do Map Google',
      mapsHelp: 'Z tego korzysta przycisk nawigacji w aplikacji.',

      phone: 'Telefon',
      phonePlaceholder: '+48 123 456 789',
      email: 'E-mail',
      emailPlaceholder: 'kontakt@firma.com',
      emailError: 'To nie wygląda na adres e-mail.',
      website: 'Strona internetowa',
      instagram: 'Instagram',
      appStore: 'Link do App Store',
      googlePlay: 'Link do Google Play',
      appLinksShow: 'Dodaj linki do App Store i Google Play',
      appLinksHide: 'Ukryj linki do aplikacji',

      spoken: 'Języki, którymi mówi Twój zespół',
      hours: 'Godziny otwarcia',
    },

    categories: [
      'Kawiarnia',
      'Restauracja',
      'Barbershop',
      'Salon kosmetyczny',
      'Gabinet stomatologiczny',
      'Szkoła językowa',
      'Fitness',
    ],
    subcategories: [
      ['Kawa specialty', 'Kawiarnia z piekarnią', 'Miejsce na brunch', 'Herbaciarnia'],
      ['Polska', 'Gruzińska', 'Turecka', 'Pizza', 'Sushi'],
      ['Klasyczny barber', 'Broda i golenie', 'Strzyżenie dzieci'],
      ['Paznokcie', 'Włosy', 'Brwi i rzęsy', 'Masaż'],
      ['Stomatologia ogólna', 'Ortodoncja', 'Implanty'],
      ['Polski dla obcokrajowców', 'Angielski', 'Przygotowanie do egzaminów'],
      ['Siłownia', 'Studio jogi', 'Klub bokserski'],
    ],
    countries: ['Polska', 'Ukraina', 'Gruzja', 'Turcja', 'Uzbekistan', 'Azerbejdżan'],
    spokenLanguages: ['Polski', 'Angielski', 'Ukraiński', 'Rosyjski', 'Turecki', 'Uzbecki'],
    hoursDays: ['Poniedziałek – piątek', 'Sobota', 'Niedziela'],

    ready: {
      title: 'Gotowe do publikacji',
      progress: 'Uzupełnione w {percent}%',
      stillNeeded: 'Jeszcze potrzebne:',
      done: 'Wszystkie wymagane pola są uzupełnione. Twoja wizytówka jest widoczna w aplikacji.',
    },

    preview: {
      title: 'Jak to wygląda w aplikacji',
      cover: 'Zdjęcie główne',
      name: 'Nazwa Twojej firmy',
      address: 'Dodaj swój adres',
      price: 'Cena na zapytanie',
      description: 'Napisz krótki opis, żeby klienci wiedzieli, czym się zajmujecie.',
      reviews: '312 opinii',
      note: 'Ocena i liczba opinii pochodzą od klientów w aplikacji. Nie można ich tu zmienić.',
    },

    save: 'Zapisz i przejdź dalej',
    saved: 'Zapisano.',
    saveProfile: 'Zapisz zmiany',
  },

  dashboard: {
    tag: 'Partner',
    groups: { grow: 'Rozwój', workspace: 'Obszar roboczy' },
    screens: [
      { name: 'Przegląd', lede: 'Co Paylez dla Ciebie zrobił i ile to kosztowało.' },
      { name: 'Gorące okazje', lede: 'Czasowe oferty pokazywane w kanale aplikacji Paylez.' },
      { name: 'Kampanie lojalnościowe', lede: 'Powtarzalne nagrody, na które zapracowują stali klienci.' },
      { name: 'Vouchery', lede: 'Jak punkty zamieniają się w rabaty i ile Cię to kosztuje.' },
      { name: 'Klienci', lede: 'Kto przychodzi, kiedy przychodzi i czy wraca.' },
      {
        name: 'Asystent',
        lede: 'Powiedz, co ma się wydarzyć. Ja to przygotuję, Ty decydujesz, czy ruszy.',
      },
      { name: 'Skanowania', lede: 'Każde skanowanie QR przy Twojej kasie, od najnowszego.' },
      { name: 'Profil firmy', lede: 'Twoja wizytówka w aplikacji Paylez, przetłumaczona dla każdego klienta.' },
    ],
    empty: [
      {
        title: 'W Twoim lokalu nic jeszcze nie działa',
        body: 'Klienci zobaczą Cię w aplikacji Paylez dopiero wtedy, gdy coś będzie aktywne. Najszybszy start to gorąca okazja — otwarta oferta z datą początku i końca, działająca w wybranych godzinach.',
        action: 'Stwórz pierwszą okazję',
      },
      {
        title: 'Uruchom ofertę dla każdego',
        body: 'Gorąca okazja pojawia się w kanale aplikacji dla wybranej grupy i godzin, a kończy się w ustalonym dniu. Płacisz dopiero, gdy ktoś ją odbierze.',
        action: 'Stwórz gorącą okazję',
      },
      {
        title: 'Nagradzaj stałych klientów za powroty',
        body: 'Kampania liczy wizyty i przyznaje nagrodę po osiągnięciu ustalonej liczby. Dobra pierwsza dla kawiarni: cztery wizyty, kawa z przelewu gratis.',
        action: 'Skonfiguruj kampanię',
      },
      {
        title: 'Ustaw budżet rabatowy, żeby zacząć dawać vouchery',
        body: 'Budżet rabatowy to maksimum, jakie oddasz w rabatach w jednym miesiącu. Vouchery kończą się, gdy budżet się wyczerpie, więc nigdy nie wydasz więcej, niż zaplanowałeś.',
        action: 'Ustaw budżet',
      },
      {
        title: 'Postaw kod QR przy kasie',
        body: 'Nic na tej stronie nie może się wypełnić, dopóki klienci nie zaczną skanować. Wydrukuj kod, postaw go obok kasy i poproś obsługę, by wskazywała go razem z rachunkiem. Pierwsze liczby pojawią się tego samego dnia.',
        action: 'Pobierz swój kod QR',
      },
      {
        title: 'Powiedz, co ma się wydarzyć',
        body: 'Czytam Twoje ciche godziny, Twoje budżety i to, co działa w lokalach takich jak Twój, a potem przygotowuję całość do sprawdzenia. Nic nie ruszy, dopóki nie klikniesz publikacji.',
        action: 'Zacznij rozmowę',
      },
      {
        title: 'Jeszcze żadnych skanowań',
        body: 'Każde skanowanie przy Twojej kasie pojawia się tutaj w kilka sekund — kto przyszedł, ile wydał i jak blisko jest nagrody.',
        action: 'Pobierz swój kod QR',
      },
    ],
    notWired: 'Niepodłączone w tej wersji.',

    unmeasured: {
      noSession:
        'To urządzenie nie jest zalogowane do API Paylez, więc żadnej z tych liczb nie da się odczytać. Logowanie na samej stronie nie zakłada jeszcze sesji API — do tego czasu połączyć się może tylko konsola operatora.',
      serverSilent:
        'Serwer nie odpowiedział, więc nie ma tu czego pokazać. To nie jest zero — nie udało się zapytać.',
      asking: 'Wczytujemy Twoje liczby z serwera…',
      withheld: 'Wstrzymane — zbyt mało osób, by podać to bez ujawnienia, kim są.',
      noSource: 'Serwer jeszcze tego nie raportuje, więc ten panel nie ma czego pokazać.',
      planLocked: 'Poza planem tego lokalu.',
      monthOnly:
        'Liczby są raportowane za cały miesiąc kalendarzowy — to okno, w którym liczy serwer. Wybór zakresu powyżej jeszcze nimi nie porusza.',
      noFindings: 'W tym miesiącu nic się nie wyróżniło.',
      tierUnit: 'Każdy z nich zdejmuje {unit} z rachunku.',
      plan: 'Brak budżetu do pokazania — to urządzenie nie jest zalogowane do API Paylez.',
      assistant:
        'Zanim cokolwiek zaproponuję, czytam Twoje ciche godziny, Twoje budżety i to, co działa w lokalach podobnych do Twojego — a to urządzenie nie jest zalogowane do API Paylez, więc nie mogę odczytać niczego z tego. Nie będę zgadywać liczby i podpisywać jej Twoim nazwiskiem.',
      audience:
        'Ilu ludzi to obejmie, nie jesteśmy jeszcze w stanie powiedzieć — serwer wylicza grupę odbiorców dla opublikowanej oferty, a ta jest wciąż szkicem.',
      quota:
        'Ile powiadomień zostało w tym planie, nie da się odczytać — to urządzenie nie jest zalogowane do API Paylez.',
    },

    findings: {
      quiet_window: 'Masz cichy fragment dnia, który warto zapełnić.',
      cost_per_new_customer: 'Twój koszt nowego klienta się zmienił.',
      second_visit_rate: 'Twój odsetek drugich wizyt się zmienił.',
      new_customers: 'Pojawili się klienci, których wcześniej u Ciebie nie było.',
    },

    month: 'sierpień',
    rangeLabels: ['ostatnie 7 dni', 'ostatnie 14 dni', 'ostatnie 30 dni', 'ostatni kwartał'],

    words: {
      edit: 'Edytuj',
      pause: 'Wstrzymaj',
      remind: 'Przypomnij im',
      ask: 'Zapytaj asystenta',
      open: 'Otwórz',
      priority: 'Priorytet {n}',
      each: 'po {amount}',
      spent: 'Wydane',
      aside: 'Zarezerwowane',
      available: 'Dostępne',
      costSoFar: 'Koszt dotąd',
      returned: '{amount} wróciło w tym miesiącu z nagród, które wygasły niewykorzystane.',
    },

    overview: {
      kicker: 'Co Paylez dla Ciebie zrobił · {range}',
      countedLabel: 'Policzone',
      counted: 'wizyt przez Paylez',
      countedNew: '{n} z nich to klienci nowi w Twoim lokalu',
      estimateTag: 'Szacunek',
      estimate: 'około {amount} w sprzedaży',
      estimateNote:
        'Szacunek. Każda wizyta przez Paylez pomnożona przez średni wydatek {avg}, wzięty z Twojej własnej sprzedaży.',
      claimTitle: 'Co możemy uczciwie przypisać sobie',
      claim: '{visits} wizyt · około {amount}',
      claimNote:
        'Wizyty klientów nowych w Twoim lokalu oraz wizyty, za którymi stoi odebrana okazja albo powiadomienie. Reszta to stali bywalcy, którzy i tak mogli przyjść.',
      support: [
        { label: 'Wizyty przez Paylez', note: 'policzone ze skanów QR' },
        { label: 'Średni wydatek na wizytę', note: 'z Twojej sprzedaży, ostatnie 30 dni' },
        { label: 'Klienci nowi w Twoim lokalu', note: 'pierwsze skanowanie przy Twojej kasie' },
      ],
      reachTitle: 'Kto Cię zobaczył',
      reachSeen: 'Wyświetlenia',
      reachSeenNote: 'ile razy Twój lokal lub oferta pojawiły się na ekranie',
      reachClicks: 'Kliknięcia',
      reachClicksNote: 'ile razy ktoś otworzył je, żeby przeczytać więcej',
      reachRate: 'Wskaźnik kliknięć',
      reachRateNote: 'kliknięć na sto wyświetleń',
      reachSplit: 'Skąd pochodzą',
      reachListing: 'Twoja wizytówka',
      reachDeals: 'Twoje aktywne oferty',
      reachFunnel: '{seen} zobaczyło · {clicks} otworzyło · {claims} skorzystało',
      reachEmpty: 'Nikt Cię jeszcze nie zobaczył. Opublikowanie oferty umieszcza Cię w kanale aplikacji.',
      reachLive: 'Dane na żywo, zliczone z Twojej wizytówki i Twoich ofert.',
      reachSample: 'Dane przykładowe — to urządzenie nie pobiera zasięgu z serwera.',
      budgetAlert:
        'Prognozujemy, że Twój budżet lojalnościowy skończy się przed końcem miesiąca ({month}). Masz {amount} niewykorzystane w voucherach — przenieść część?',
      budgetAction: 'Otwórz budżet lojalnościowy',

      costTitle: 'Ile kosztował Cię Paylez',
      costRows: [
        'Opłaty Paylez',
        'Wydane nagrody lojalnościowe',
        'Udzielone rabaty voucherowe',
        'Rabaty gorących okazji',
      ],
      costTotal: 'Razem',
      returnLabel: 'Sprzedaż, którą możemy powiązać z Paylez',
      roiGood:
        'Paylez kosztował Cię {cost} w miesiącu {month} i można go powiązać z około {revenue} sprzedaży. To {n}× zwrotu z każdej wydanej złotówki.',
      roiBad:
        'Paylez kosztował Cię {cost} w miesiącu {month} i można go powiązać z około {revenue} sprzedaży. To o {gap} więcej, niż potrafimy wykazać. Większość wizyt to stali bywalcy, którzy i tak mogli przyjść.',

      tiles: ['Wizyty', 'Odebrane okazje', 'Użyte vouchery', 'Użyte nagrody'],
      since: 'wobec poprzedniego okresu',
      inMonth: 'w miesiącu {month}',

      proofTitle: 'Jedyna rzecz, którą możemy udowodnić',
      proof:
        'Klienci w Twoich kampaniach lojalnościowych przychodzą {after} razy w miesiącu, wobec {before} razy przed dołączeniem.',
      proofNote: 'Policzone z Twoich własnych skanów QR, nie oszacowane. Bez integracji z kasą.',
      before: 'przedtem',
      now: 'teraz',

      chartTitle: 'Wizyty i realizacje voucherów',
      chartNote:
        'Każde skanowanie QR przy kasie zestawione z voucherami, które klienci naprawdę wykorzystali',
      chartVisits: 'Wizyty',
      chartRedeemed: 'Zrealizowane vouchery',

      holdingTitle: 'Pieniądze, które trzymasz',
      holding:
        '{rewards} nagród i {vouchers} voucherów leży niewykorzystanych, blokując {amount} Twojego budżetu.',
      holdingNote:
        'Za każdym z nich stoi klient, który się zakwalifikował i jeszcze nie wrócił. Jeśli wygasną, pieniądze wracają do budżetu.',

      noticed: 'Co zauważyliśmy',
      insights: [
        {
          text: 'Wizyt jest o 12% więcej, ale użycie voucherów spadło o 4%. Ludzie przychodzą — to nagrody ich nie przyciągają z powrotem.',
          detail:
            'Tylko {reached} klientów sięgnęło w tym miesiącu progu {pct}%, bo wymaga on {points} punktów. Przy {lower} punktach zakwalifikowałoby się {more} kolejnych stałych klientów.',
          action: 'Zmień próg 10%',
        },
        {
          text: 'Twoje okazje z darmowym produktem są odbierane 2,4× częściej niż rabaty procentowe.',
          detail:
            '„Darmowy przelew do wypieku” odebrano {itemClaims} razy przy {itemSeen} wyświetleniach. „Poranną flat white” z rabatem {pctBadge} odebrano {pctClaims} razy przy {pctSeen} wyświetleniach.',
          action: 'Zobacz swoje okazje',
        },
        {
          text: '{n} nagród lojalnościowych jest zdobytych i leży nieużytych, blokując {amount}.',
          detail:
            'Ci klienci się zakwalifikowali i nie wrócili. Przypomnienie zwykle sprowadza około jednej trzeciej z nich w ciągu tygodnia.',
          action: 'Przypomnij im',
        },
      ],

      runningTitle: 'Działa właśnie teraz',
      runningNote: 'Wszystko, co klienci mogą dziś zobaczyć albo zdobyć w Twoim lokalu',
      quota: 'Zostało {n} z {total} powiadomień w tym miesiącu',
      quotaOut: 'Brak powiadomień w tym miesiącu',
      kinds: { deal: 'Gorąca okazja', campaign: 'Kampania', vouchers: 'Vouchery' },
      claims: 'odebrań',
      usedEarned: 'użyte / zdobyte',
      givenAway: 'rozdane',
      notifySent: 'Powiadomienie wysłane',
      notifySet: 'Powiadomienie zaplanowane',
      tierBundle: 'Trzy progi punktowe',
      tierBundleRule: '5% · 10% · 15% rabatu · jeden miesięczny budżet',
    },

    deals: {
      columns: [
        'Okazja',
        'Stan',
        'Wyświetlenia',
        'Otwarcia',
        'Odebrane',
        'Odsetek odebrań',
        'Koszt',
        'Ostatnie 7 dni',
      ],
      rows: [
        'Poranna flat white',
        'Studenckie wtorki',
        'Darmowy przelew do wypieku',
        'Deszczowa podwójna pieczątka',
        'Zniżka sąsiedzka',
        'Zestaw lunchowy',
      ],
      when: [
        'Pn–Pt, 07:00–10:00',
        'Wt, 12:00–17:00',
        'Codziennie',
        'Codziennie',
        'Codziennie',
        'Pn–Pt, 11:00–15:00',
      ],
      windows: [
        '3 sie – 31 sie',
        '1 lip – 30 wrz',
        '12 lip – 12 sie',
        '15 sie – 15 paź',
        '5 lip – 5 wrz',
        '2 cze – 30 cze',
      ],
      audiences: [
        'Wszyscy',
        'Nowo przybyli',
        'Klienci, którzy przestali przychodzić',
        'Nowi w Twoim lokalu',
        'Rosyjskojęzyczni',
      ],
      states: {
        draft: 'Szkic',
        live: 'Aktywna',
        scheduled: 'Zaplanowana',
        paused: 'Wstrzymana',
        expired: 'Wygasła',
        ended: 'Zakończona',
      },
      search: 'Szukaj wśród swoich okazji',
      filters: ['Wszystkie', 'Aktywne', 'Zaplanowane', 'Wstrzymane', 'Wygasłe'],
      count: '{n} z {total} okazji',
      sortNote:
        'Sortowane po odsetku odebrań, najlepsze u góry. Aktywne i zaplanowane okazje idą pierwsze.',
      insight:
        'Twoje okazje z darmowym produktem są odbierane 2,4× częściej niż rabaty procentowe. Zestaw lunchowy z 5% wypadł słabo — małe rabaty rzadko kogoś ruszają.',
      langsAll: 'Napisana we wszystkich pięciu językach',
      langsSome: 'Napisana w {n} z 5 języków — tracisz około {pct}% zasięgu',
      notify: {
        none: 'Bez powiadomienia',
        scheduled: 'Powiadomienie zaplanowane',
        sent: 'Powiadomienie wysłane',
      },
      reach: '{n} z {total} osób można powiadomić',
      limit: '{claimed} z {limit} odebrań',
      limitAllowed: 'z {limit} dozwolonych',
      noLimit: 'Bez limitu odebrań',

      audienceNotes: [
        'Każdy, kto korzysta z aplikacji Paylez w Twojej okolicy.',
        'Osoby, które przyjechały do Polski w ciągu ostatnich 60 dni.',
        'Byli u Ciebie wcześniej, ale nie w ciągu ostatnich 30 dni.',
        'Użytkownicy aplikacji w pobliżu, którzy nigdy Cię nie odwiedzili.',
        'Osoby, których językiem aplikacji jest rosyjski.',
      ],

      funnelTitle: 'Co się wydarzyło, krok po kroku',
      funnel: ['Zobaczyli', 'Otworzyli', 'Odebrali'],
      funnelNotes: [
        'w kanale aplikacji',
        '{pct}% osób, które to zobaczyły',
        '{pct}% osób, które otworzyły, przyszło',
      ],
      notStarted: 'jeszcze nie ruszyło',
      drop: '{seen} osób zobaczyło i nie otworzyło. {opened} otworzyło i nie przyszło.',
      dropNone: 'Ta okazja jeszcze nie ruszyła, więc nie ma czego mierzyć.',

      notifyTitle: 'Co zrobiło powiadomienie',
      notifySteps: ['Powiadomieni', 'Otworzyli', 'Przyszli'],
      notifyStepNotes: [
        'osób z włączonymi powiadomieniami',
        '{pct}% powiadomionych osób',
        '{pct}% osób, które je otworzyły',
      ],
      notifySplit:
        '{camein} z {claims} odebrań tej okazji przyszło z powiadomienia. Pozostałe {alone} znalazły ją w aplikacji same.',
      notifyBlocked:
        'Wysłane do {n} osób. Kolejne {blocked} pasowały, ale niedawno dostały inne powiadomienia, więc tego nie otrzymały.',
      notifyScheduled:
        'Powiadomienie wyjdzie o {at} do {n} osób z włączonymi powiadomieniami.',
      notifyNone:
        'Ta okazja nie ma powiadomienia. {n} z {total} pasujących osób ma włączone powiadomienia.',
      notifyChange: 'Zmień godzinę',
      notifyCancel: 'Anuluj je',
      whoTitle: 'Kto to widzi i kiedy',

      limitForecast: 'W tym tempie ta okazja osiągnie limit {limit} odebrań około {date}.',
      limitDates: ['22 sierpnia', '', '', '', '', ''],
      retro:
        'Trwała {weeks} tygodni i dała {claims} odebrań — mniej więcej jedną trzecią tego, co średnio dają Twoje okazje 15%. Spróbuj większego rabatu albo darmowej pozycji.',

      act: {
        draft: 'Edytuj',
        live: 'Wstrzymaj',
        paused: 'Wznów',
        scheduled: 'Wstrzymaj',
        expired: 'Skopiuj',
        ended: 'Skopiuj',
      },
      pointsNote: 'Oferta punktowa — nic Cię nie kosztuje przy kasie',
      costEstimate: 'szacunek',
      costNone: 'bez kosztu rabatu',
      notifyChips: {
        none: 'Bez powiadomienia',
        scheduled: 'Powiadomienie na {at}',
        sent: 'Powiadomienie wysłane · przyszło {n}',
      },
      sortBy: 'Sortuj według: {column}',
      clearFilters: 'Wyczyść filtry',
      emptyFiltered: 'Nic nie pasuje',
      emptyFilteredBody:
        'Żadna okazja z Twojej listy nie pasuje do ustawionego wyszukiwania i filtra. Wyczyść je, aby znów zobaczyć wszystkie sześć.',
    },

    campaigns: {
      rows: ['Nagroda dla stałych', 'Kawowa seria', 'Klub lunchowy', 'Zimowy powrót'],
      rewards: [
        'darmowa kawa przelewowa',
        'darmowy kawałek ciasta',
        '{amount} zniżki na lunch',
        'darmowa gorąca czekolada',
      ],
      since: [
        'Działa od 12 stycznia',
        'Działa od 4 kwietnia',
        'Ruszyła 2 czerwca',
        'Wstrzymana 28 marca',
      ],
      rule: '{visits} wizyty → {reward}',
      visitRule: 'Liczy się jedna wizyta dziennie. Nagroda wygasa 60 dni po zdobyciu.',
      earned: 'Zdobyte',
      used: 'Wykorzystane',
      unused: '{n} zdobytych i nigdy nieużytych',
      usedRate: '{pct}% wykorzystanych',
      gapTitle: 'To różnica jest liczbą, którą warto śledzić',
      gapLede:
        'Nagroda zdobyta, ale nieużyta, znaczy, że klient się zakwalifikował i nie wrócił.',
      gap: 'Największą różnicę ma teraz „{name}”: {n} nieużytych nagród.',
      totals: ['Zdobyte', 'Użyte', 'Czekają'],
      remindLabel: 'Przypomnij {n} klientom',
      remindNote: 'Zdobyli nagrodę i nie wrócili po nią.',
      remindResult: 'Ostatnim razem {back} z {of} przyszło w ciągu tygodnia.',
      remindSetup: 'Ustaw to za mnie',
      near: '{n} stałych klientów dzieli jedna wizyta od kolejnej nagrody.',
      rebalance:
        'Prognozujemy, że Twój budżet lojalnościowy skończy się {date}. W voucherach leży niewykorzystane {amount} — przenieść część?',
      rebalanceAction: 'Przenieś budżet',
      budgetTitle: 'Budżet lojalnościowy',
      budgetLede:
        'Ile odłożyłeś w tym miesiącu na nagrody lojalnościowe. Gorące okazje nie wchodzą w to.',
      spentNote: 'Nagrody, które klienci naprawdę odebrali.',
      asideNote:
        'Pieniądze odłożone na nagrody, które klienci zdobyli, ale jeszcze nie wykorzystali. Jeśli wygasną, wracają.',
      availableNote: 'Wolne na nowe nagrody już teraz.',
      forecast: 'W tym tempie budżet lojalnościowy wystarczy do {date}.',
      forecastOut: 'Budżet lojalnościowy jest wyczerpany. Nowe nagrody przestają być wydawane.',
      forecastSafe: 'W tym tempie budżet lojalnościowy wystarczy na cały {month}.',
      pausedNote:
        'Wstrzymana. Uczestnicy zachowują to, co zdobyli, a nic nowego nie jest liczone.',
    },

    vouchers: {
      alertTitle: 'Twój budżet rabatowy się kończy',
      alertBody:
        'W obecnym tempie skończy się {date}, a vouchery przestaną być wydawane do przyszłego miesiąca.',
      alertAction: 'Zwiększ budżet',
      budgetTitle: 'Budżet voucherów',
      budgetLede:
        'Jedna pula na wszystkie trzy progi. To prawdziwe pieniądze wychodzące z Twojej kasy, a łączną kwotę dla obu funkcji ustawiasz tutaj.',
      budgetLabel: 'Łączny budżet rabatowy',
      allocNote:
        'Pasek pokazuje, co już wyszło i co jest zarezerwowane. Tylko jasna część jest jeszcze Twoja do wydania.',
      spent: 'Wydane',
      spentNote: 'Przepadło. Rabaty na voucherach, których klienci naprawdę użyli.',
      held: 'Zarezerwowane',
      heldNote:
        'Pieniądze odłożone na vouchery, które klienci zdobyli, ale jeszcze nie wykorzystali. Jeśli wygasną, wracają.',
      free: 'Dostępne',
      freeNote: 'Wolne na nowe vouchery już teraz.',
      forecast: 'W tym tempie budżet wystarczy do {date}.',
      forecastOut: 'Budżet jest wyczerpany. Nowe vouchery nie są wydawane.',
      forecastSafe: 'W tym tempie budżet wystarczy na cały {month}.',
      buysTitle: 'To, co zostało, kupi',
      buys: 'około {n} kolejnych voucherów',
      buysNote: 'Przy takim rozkładzie progów, jaki osiągają teraz Twoi klienci.',
      avgTitle: 'Średnia transakcja',
      avgNote:
        'Wzięta z Twojej własnej sprzedaży z ostatnich 30 dni. Zmień, jeśli wygląda źle.',
      maxTitle: 'Najwięcej z jednego vouchera',
      maxNote:
        'Żaden pojedynczy voucher nie zdejmuje z rachunku więcej niż tyle, jakkolwiek duże byłoby zamówienie.',
      tiersTitle: 'Kto sięga którego progu',
      tiersLede:
        'Progi nie trzymają pieniędzy. O dotarciu decydują punkty, więc podniesienie liczby kieruje tam mniej budżetu.',
      columns: ['Próg', 'Potrzebne punkty', 'Wydane', 'Użyte', 'Koszt dotąd'],
      tier: '{n}% rabatu',
      tierDetail: 'Każdy zabiera {unit} z rachunku. Ten próg to {pct}% tego, co pula wydała do tej pory.',
      pointsUnit: 'pkt',
      pointsOrder: 'Większy rabat nie może kosztować mniej punktów niż mniejszy.',
      tryNote:
        'Wpisz tu inne wartości, aby zobaczyć, co stałoby się z pulą. Nic nie jest zapisywane — po odświeżeniu wracają Twoje prawdziwe liczby.',
      points: '{n} pkt',
      mixTitle: 'Gdzie poszły pieniądze',
      returnedTitle: 'Zwrócone pieniądze',
      returnedNote:
        'Wróciły w tym miesiącu z voucherów, które wygasły niewykorzystane. Można je wydać ponownie.',
      suggestion: 'Sugestia',
      insight:
        'Twój próg {n}% zużywa większość budżetu. Podnieś jego wymóg punktowy, jeśli wolisz zachować pieniądze dla lojalnych klientów.',
    },

    customers: {
      costKicker: 'Ile kosztuje Cię nowy klient',
      costUnit: 'każdy, w miesiącu {month}',
      costLine:
        'Wydałeś {cost} w miesiącu {month} i zyskałeś {n} klientów nowych w Twoim lokalu. To {each} za każdego.',
      costBreakdown: [
        'Opłaty Paylez',
        'Nagrody lojalnościowe',
        'Rabaty voucherowe',
        'Rabaty gorących okazji',
      ],
      costFinding:
        'Każdy nowy klient kosztował Cię {now} w miesiącu {month}, wobec {then} w czerwcu. Większość tego spadku wzięła się z Twojej okazji z darmowym produktem.',
      costAction: 'Zobacz swoje okazje',
      trendTitle: 'Ostatnie trzy miesiące',
      trendMonths: ['Czerwiec', 'Lipiec', 'Sierpień'],
      spendByMonth: 'Wydatki u Ciebie, miesiąc po miesiącu',
      benchmark:
        'Przeciętna krakowska kawiarnia w Paylez płaci {amount} za każdego nowego klienta. To szacunek z lokali podobnych do Twojego, nie obietnica.',

      rosterTitle: 'Twoi klienci',
      rosterIntro:
        '{n} z Twoich {total} klientów włączyło udostępnianie profilu, więc tych widzisz z imienia. Wszyscy pozostali zostają w zbiorczych liczbach poniżej.',
      rosterCount: '{n} udostępnia',
      rosterColumns: ['Klient', 'Wydał', 'Wizyty', 'Ostatnio', 'Status'],
      rosterFilters: ['Wszyscy', 'Stali', 'Odeszli', 'Nowi'],
      withdrew:
        'Każdy może wyłączyć udostępnianie w dowolnej chwili. Wtedy znika z tej listy, a jego historia przestaje być dla Ciebie widoczna.',
      statuses: { regular: 'Stały', lapsed: 'Odszedł', new: 'Nowy' },
      today: 'Dziś',
      daysAgo: '{n} dni temu',
      dayAgo: 'wczoraj',
      stamps: '{done} z {of} pieczątek',
      tierProgress: 'próg {n}%',

      whenTitle: 'Kiedy przychodzą',
      whenLede:
        'Każde skanowanie QR przy kasie, w przeciętnym tygodniu. Ciemniej znaczy tłoczniej.',
      days: ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'],
      heatCell: 'około {n} wizyt w normalnym tygodniu',
      quietFinding:
        'Wtorek i środa, 14:00–16:00, to Twoje najspokojniejsze godziny — około 60% poniżej tygodniowej średniej.',
      quietAction: 'Ustaw to za mnie',
      quietSelf: 'Zrobię to sam',
      peakFinding:
        'Najwięcej masz w dni robocze między 08:00 a 10:00. Twoja poranna okazja już wtedy działa, więc głębszy rabat niewiele tam da.',

      nationCount: '{n} klientów · {pct}%',
      readTitle: 'W jakim języku mówią Twoi klienci',
      readLede:
        'Te paski są liczone na grupach klientów, nigdy na jednej osobie. Grupy mniejsze niż 10 trafiają do „innych”.',
      langKicker: 'Język, którego używają w Paylez',
      langs: ['Rosyjski', 'Ukraiński', 'Polski', 'Angielski', 'Inny'],
      langFinding:
        '42% Twoich klientów używa aplikacji po rosyjsku, ale żadna z Twoich aktywnych okazji nie jest napisana po rosyjsku.',
      langAction: 'Stwórz okazję dla nich',
      privacy:
        'Wszystko tutaj jest liczone na grupach. Paylez nigdy nie pokazuje pojedynczej osoby, a grupy mniejsze niż dziesięć trafiają do „innych”.',

      backTitle: 'Czy wracają',
      backLede: 'Pierwsze wizyty i ilu z nich wróciło w ciągu 30 dni',
      months: ['Kwiecień', 'Maj', 'Czerwiec', 'Lipiec'],
      monthNames: [
        'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
        'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
      ],
      cohort: '{back} z {first} · {pct}%',
      backFinding:
        '{first} osób odwiedziło Cię po raz pierwszy w miesiącu {month}. {back} wróciło w ciągu 30 dni — {pct}%.',
      lapsedFinding:
        '{n} Twoich stałych klientów nie było od 30 dni. Wcześniej przychodzili mniej więcej raz w tygodniu.',

      compareTitle: 'Jak wypadasz na tle innych',
      compareNote:
        'Porównanie z {n} innymi krakowskimi kawiarniami w Paylez. Liczby są uśredniane po lokalach, nigdy pokazywane per lokal.',
      compareRows: [
        'Odsetek odebrań okazji',
        'Druga wizyta w ciągu 30 dni',
        'Koszt nowego klienta',
      ],
      compareThem: 'inni średnio {amount}',
      roiTitle: 'Gdzie pracują Twoje pieniądze',
      roiLede: 'Ile kosztowało Cię każde z trzech narzędzi w miesiącu {month} i co za to kupiłeś',
      roiRows: ['Kampanie lojalnościowe', 'Gorące okazje', 'Vouchery'],
      roiUnits: ['powtórnych wizyt', 'odebrań', 'użytych voucherów'],
      roiPer: ['za powtórną wizytę', 'za odebranie', 'za użycie'],
      roiLine: '{cost} wydane · {n} {unit}',

      patterns: [
        'Poranki w dni robocze, często przed 9',
        'Poranki w dni robocze',
        'Weekendy, późny poranek',
        'Przychodził w piątkowe popołudnia',
        'Dwie wizyty, obie po południu',
        'Lunch w dni robocze',
        'Weekendowe poranki',
        'Popołudnia, różne dni',
        'Prawie każdy roboczy poranek',
        'Trzy wizyty, popołudnia',
        'Był wtorkowym stałym bywalcem',
        'Weekendy',
        'Pierwsza wizyta dwa dni temu',
        'Czwartkowe popołudnia, ostatnio rzadziej',
      ],
      rewards: [
        'próg 15% — Twój najlepszy klient',
        'Jedna pieczątka od darmowej kawy',
        'próg 10%',
        'próg 10% — stygnie',
        '1 z 4 pieczątek',
        'Darmowa kawa gotowa do odbioru',
        '2 z 4 pieczątek',
        'próg 15%',
        'próg 10% — odszedł',
        'próg 10% — zwalnia',
      ],
    },

    scans: {
      columns: [
        'Kiedy',
        'Klient',
        'Pierwsza wizyta?',
        'Wydał',
        'Punkty',
        'Paragon',
        'Gdzie',
        'Postęp do nagrody',
      ],
      filters: ['Wszyscy', 'Pierwsza wizyta', 'Wrócił'],
      first: 'Pierwsza wizyta',
      again: 'Wrócił',
      today: 'Dziś',
      places: ['Bratysławska 6', 'Bratysławska 6', 'Kiosk Kleparz'],
      noCampaign: 'Żadna kampania nie działa',
      progress: '{done}/{need} skanowań',
      toGo: 'jeszcze {n}',
      ready: 'nagroda gotowa',
      count: '{n} skanowań',
      showing: 'Pokazano {n} z {total}',
      page: 'Pokazano {from}–{to} z {total}',
      prev: 'Poprzednia',
      next: 'Następna',
      coords: 'Kasa',
    },
    actions: {
      newDeal: 'Stwórz gorącą okazję',
      newCampaign: 'Stwórz kampanię',
      exportCsv: 'Eksport CSV',
      preview: 'Podejrzyj wizytówkę',
      exported: 'Twój plik CSV się pobiera.',
      previewing: 'Otwieram podgląd Twojej wizytówki.',
    },

    drawer: {
      close: 'Zamknij',
      cancel: 'Anuluj',
      later: 'Zapisz i dokończ później',
      deal: {
        kicker: 'Nowa gorąca okazja',
        title: 'Stwórz gorącą okazję',
        sub: 'Czasowa oferta w kanale aplikacji. Nic nie jest naliczane, dopóki ktoś jej nie odbierze.',
        publish: 'Opublikuj okazję',
        copyTitle: 'Tytuł i opis',
        titleLabel: 'Tytuł okazji',
        titlePlaceholder: 'Poranna flat white',
        descLabel: 'Opis',
        descPlaceholder: 'Napisz, co dostaje klient, w jednym–dwóch krótkich zdaniach.',
        translateNote: 'Paylez przetłumaczy to dla klientów czytających w innym języku.',
        copyError: 'Okazja potrzebuje tytułu i opisu, zanim ruszy.',
        kindTitle: 'Jaki to rodzaj okazji',
        kinds: ['Rabat procentowy', 'Darmowa pozycja', 'Kwota zniżki', 'Dodatkowa pieczątka'],
        discountTitle: 'Rabat i daty',
        badgeLabel: 'Tekst rabatu',
        badgeNote: 'Krótko i jasno. Klienci widzą to najpierw. Najwyżej 14 znaków.',
        from: 'Start',
        to: 'Koniec',
        windowError: 'Data końca jest wcześniejsza niż data startu.',
        whenTitle: 'Które dni i godziny',
        hourFrom: 'Od',
        hourTo: 'Do',
        whenNote: 'Działa {days}, {from}–{to}. Wykorzystaj to na swoje ciche godziny.',
        everyDay: 'codziennie',
        noDays: 'jeszcze żadnych dni',
        audienceTitle: 'Kto to widzi',
        audienceEstimate: 'Pasuje do tego około {n} osób, a {notifiable} z nich można powiadomić.',
        notifyTitle: 'Powiadom ludzi',
        notifySwitch: 'Wyślij powiadomienie o tej okazji',
        notifyQuota: 'Zostało {n} z {total} w tym miesiącu.',
        notifyOutTitle: 'Wykorzystałeś wszystkie {total} w tym miesiącu',
        notifyOutBody:
          'Licznik zeruje się pierwszego. Plan Growth ma ich więcej, a okazja działa i bez powiadomienia — po prostu czeka, aż ktoś otworzy aplikację.',
        notifyPlan: 'Zobacz plan Growth',
        notifyWhen: 'Kiedy wychodzi',
        notifySuggested: 'Twoi odbiorcy otwierają aplikację najczęściej około {at}.',
        useSuggested: 'Ustaw {at}',
        quietNote: 'Nic nie wychodzi między 21:00 a 08:00, cokolwiek ustawisz.',
        notifyWho: 'Kto je dostanie',
        notifyReach: '{n} z {total} ma włączone powiadomienia.',
        notifyWhoNote: 'Zmień to wyżej, w „Kto to widzi”',
        notifyText: 'Co w nim jest',
        notifyTextNote: 'Wzięte z tytułu okazji. Możesz skrócić — najwyżej 64 znaki.',
        stopTitle: 'Kiedy ma się zatrzymać',
        stopOptions: [
          { label: 'W dacie końca', note: 'Działa do ustawionej daty i ani dnia dłużej.' },
          { label: 'Po liczbie odebrań', note: 'Zatrzyma się, gdy wystarczająco wiele osób jej użyje.' },
          { label: 'Gdy dojdzie do kwoty', note: 'Zatrzyma się, gdy rabaty osiągną daną kwotę.' },
        ],
        stopClaims: 'Maksymalna liczba odebrań',
        stopMoney: 'Zatrzymaj, gdy kosztuje',
        claims: 'odebrań',
        stopNote:
          'Gorące okazje nie korzystają z budżetu lojalnościowego ani voucherowego. Zatrzymuje je właśnie ten limit.',
        termsTitle: 'Zasady korzystania z okazji',
        termsPlaceholder: 'Jedno odebranie na wizytę. Nie łączy się z innymi okazjami.',
        previewTitle: 'Jak zobaczą to klienci',
        previewClaim: 'Odbierz',
        previewUntitled: 'Tytuł Twojej okazji',
        previewNoDesc: 'Tutaj pojawi się Twój opis.',
        previewLimitNone: 'Bez limitu odebrań',
        previewLimitClaims: 'Zatrzymuje się po {n} odebraniach',
        previewLimitMoney: 'Zatrzymuje się, gdy kosztuje {amount}',
        filing: 'Zapisywanie…',
        published: 'Opublikowano. Jest już w aplikacji.',
        saved: 'Zapisano jako wersję roboczą. Opublikujesz, kiedy zechcesz.',
        needsSession: 'Ta przeglądarka nie jest połączona z API Paylez, więc nie ma gdzie tego zapisać. Połącz się najpierw z konsoli administratora.',
        filingOffline: 'Nie udało się połączyć z serwerem. Nic nie zapisano — spróbuj za minutę.',
        filingRefused: 'Serwer tego nie przyjął: {why}',
        savedUnverified: 'Zapisano jako wersję roboczą. Trafi do aplikacji, gdy Twój lokal zostanie zweryfikowany — zajmujemy się tym.',
        savedNotLive: 'Zapisano jako wersję roboczą, ale straciliśmy połączenie przed publikacją. Opublikuj z listy Hot deals.',
        savedNotLiveWhy: 'Zapisano jako wersję roboczą. Nie trafiło do aplikacji: {why}',
      },
      campaign: {
        kicker: 'Nowa kampania lojalnościowa',
        title: 'Stwórz kampanię lojalnościową',
        sub: 'Nagroda, na którą zapracowują stali klienci wracając. Kwota jest rezerwowana z budżetu lojalnościowego w chwili, gdy ktoś się kwalifikuje.',
        publish: 'Uruchom kampanię',
        nameLabel: 'Nazwa kampanii',
        namePlaceholder: 'Kawowa passa',
        nameNote: 'Tę nazwę widzisz tylko Ty. Klienci widzą nagrodę.',
        nameError: 'Nadaj kampanii nazwę, żeby ją później znaleźć.',
        visitsTitle: 'Ile wizyt',
        visits: 'wizyt',
        visitsHelp: 'Klient zdobywa nagrodę przy {n}. wizycie, a potem zaczyna od nowa.',
        visitsMinus: 'O jedną wizytę mniej',
        visitsPlus: 'O jedną wizytę więcej',
        rewardTitle: 'Co dostają',
        rewardKinds: ['Darmowa pozycja', 'Kwota zniżki'],
        rewardItemPlaceholder: 'darmowa kawa przelewowa',
        rewardItemNote: 'Napisz tak, jak przeczyta to klient w aplikacji.',
        rewardOff: 'zniżki',
        rewardError: 'Napisz, co dostaje klient.',
        costTitle: 'Ile Cię to kosztuje',
        costEach: 'za każdym razem',
        costNote:
          'Używamy tego, by śledzić koszt Twoich kampanii. To kwota rezerwowana z budżetu lojalnościowego za każdym razem, gdy ktoś zdobędzie tę nagrodę.',
        project: 'klientów',
        projection: 'Jeśli {n} klientów ją ukończy, to {amount} z Twojego budżetu lojalnościowego.',
        priorityTitle: 'Gdy dwie kampanie pasują do tej samej wizyty',
        priorityLede:
          'Klient może kwalifikować się do więcej niż jednej kampanii przy tej samej wizycie. Przyznawana jest tylko jedna nagroda: ta o niższym numerze priorytetu.',
        priorityHelp: 'Priorytet {n} z 5. Wygrywa niższy.',
        rulesTitle: 'Drobne zasady',
        expiry: 'Nagroda wygasa po',
        days: 'dniach',
        expiryNote: 'Po tym czasie nagroda przepada, a pieniądze wracają do budżetu.',
        minSpend: 'Minimalna kwota na wizytę',
        minSpendNote: 'Mniejsze wizyty się nie liczą. Jedno skanowanie na klienta dziennie.',
        summaryTitle: 'Twoja kampania w jednym zdaniu',
        summary: '{visits} wizyt, a potem {reward}. Kosztuje Cię {amount} za każdym razem, gdy ktoś ją ukończy.',
        summaryNote:
          'Pieniądze są rezerwowane z budżetu lojalnościowego, gdy klient się kwalifikuje, a nie gdy odbiera nagrodę. Jeśli nagroda wygaśnie, wracają.',
        summaryReward: 'nagroda',
      },
      valid: 'Popraw {n} rzecz powyżej przed publikacją.',
      validPlural: 'Popraw {n} rzeczy powyżej przed publikacją.',
    },

    assistant: {
      knowTitle: 'Co wiem o Twoim lokalu',
      intro:
        'Powiedz, co ma się wydarzyć w Twoim lokalu. Przygotuję to, pokażę, ile kosztuje, i zostawię Tobie decyzję o publikacji. Nic nie ruszy, dopóki nie klikniesz przycisku.',
      knows: [
        'Twoje najcichsze godziny to {days}, {from}–{to} — około {pct}% poniżej tygodniowej średniej.',
        '{pct}% Twoich klientów korzysta z aplikacji po rosyjsku, ale żadna z Twoich aktywnych okazji nie jest napisana po rosyjsku.',
        'W {n} kawiarniach w Twoim mieście okazje z darmową pozycją mają około {x}× więcej odebrań niż rabaty procentowe.',
        'Masz {vouchers} niewykorzystane w voucherach i {loyalty} w lojalności w tym miesiącu.',
      ],

      optionsTitle: 'Co możesz zrobić',
      optionsIntro: 'Konkretne początki, oparte na tym, co widzę w Twoich liczbach. Kliknij, żeby to omówić.',
      options: [
        {
          name: 'Zapełnij ciche godziny',
          desc: '{days}, {from}–{to} — około {pct}% poniżej średniej.',
          seed: 'Zapełnij ciche wtorkowe popołudnia',
        },
        {
          name: 'Odzyskaj klientów, którzy przestali przychodzić',
          desc: '{n} stałych klientów, ostatnio widzianych ponad 30 dni temu.',
          seed: 'Odzyskaj {n} stałych klientów, którzy przestali przychodzić',
        },
        {
          name: 'Przejrzyj wszystko, co prowadzę',
          desc: 'Trzy rzeczy warte zmiany w tym tygodniu.',
          seed: 'Przejrzyj wszystko, co prowadzę, i powiedz, co poprawić',
        },
        {
          name: 'Dlaczego spadło korzystanie z voucherów?',
          desc: 'W tym miesiącu o 4% — mogę pokazać gdzie.',
          seed: 'Dlaczego w tym miesiącu spadło korzystanie z voucherów?',
        },
      ],

      convTitle: 'Porozmawiaj z asystentem',
      reset: 'Zacznij od nowa',
      opening:
        'Powiedz, co ma się wydarzyć w Twoim lokalu — własnymi słowami, w dowolnym z pięciu języków Paylez. Zadam kilka krótkich pytań, pokażę, ile to będzie kosztować, i zostawię Tobie publikację.',
      chipsHint: 'Kliknij jedno albo wpisz odpowiedź poniżej.',
      send: 'Wyślij',
      placeholders: {
        idle: 'Powiedz, co ma się wydarzyć w Twoim lokalu',
        reward: 'Darmowa kawa albo rabat procentowy — albo powiedz to po swojemu',
        budget: 'Około {a}, {b} czy {c}?',
        duration: '2, 4 czy 8 tygodni?',
        notify: 'Tak czy nie?',
        ready: 'Zmienić coś, zanim pokażę projekt?',
      },
      composerNote:
        'Czytam we wszystkich pięciu językach Paylez. Każda liczba, której używam, pochodzi z Twoich danych albo z lokali takich jak Twój — żadnej nie wymyślam.',

      goalOpen: {
        quiet:
          'Twój najcichszy czas to {days}, {from}–{to} — około {pct}% poniżej tygodniowej średniej. Uruchomiłbym wtedy krótką okazję. Co mają dostać?',
        lapsed:
          '{n} Twoich stałych klientów nie było u Ciebie od ponad 30 dni. Okazja skierowana do nich może część ściągnąć z powrotem. Co mają dostać?',
        new: 'Nowi goście przychodzą najczęściej po jednej jasnej, prostej ofercie, którą zobaczą w kanale. Co mają dostać nowe osoby?',
      },
      askBudget: {
        item:
          'Darmowa kawa przelewowa, dobrze. Okazje z darmową pozycją mają w lokalach takich jak Twój około {x}× więcej odebrań niż rabat procentowy, a każda kosztuje Cię stałe {amount}. Ile chcesz na to przeznaczyć w tym miesiącu?',
        percent:
          'Niech będzie 20% zniżki. To zależy od wielkości rachunku, więc dodam limit kosztu. Ile chcesz na to przeznaczyć w tym miesiącu?',
      },
      askDuration:
        '{amount}. Gorące okazje nie idą z puli lojalnościowej ani voucherowej, więc to pieniądze z Twojej marży. Jak długo ma trwać?',
      askNotify:
        '{n} tygodni. Zostało Ci {left} z {total} powiadomień w tym miesiącu — mam wysłać jedno na starcie? Bez niego większość ludzi zobaczy okazję tylko wtedy, gdy otworzy aplikację.',
      ready:
        'Oto co bym przygotował{notify}. Nic jeszcze nie jest aktywne — ruszy dopiero, gdy klikniesz publikację. Zajrzyj do projektu.',
      readyNotify: ', z powiadomieniem na starcie',
      retry: {
        reward: 'Nie do końca zrozumiałem — darmowa kawa przelewowa czy procent od rachunku?',
        budget: 'Mniej więcej ile na miesiąc — {a}, {b} czy {c}?',
        duration: 'Jak długo — 2, 4 czy 8 tygodni?',
        notify: 'Mam wysłać powiadomienie na starcie — tak czy nie?',
        other: 'Wszystko to możesz zmienić w projekcie. Chcesz go zobaczyć?',
      },
      chips: {
        item: 'Darmowa kawa przelewowa',
        percent: '20% od rachunku',
        weeks: '{n} tygodni',
        yes: 'Tak, wyślij',
        no: 'Nie, tylko wystaw',
      },

      readyTitle: 'Co bym przygotował',
      readyRows: ['Cel', 'Co dostają ludzie', 'Dni i godziny', 'Budżet', 'Trwa', 'Powiadomienie'],
      showDraft: 'Pokaż projekt',

      draftTag: 'Projekt',
      draftNote: 'Nic tutaj nie jest aktywne. Ruszy dopiero, gdy to opublikujesz.',
      changedTitle: 'Co zmieniłem',
      changedNote: 'Nic innego się nie ruszyło. Każde inne pole jest takie jak wcześniej.',
      sentence: {
        item: 'Darmowa kawa przelewowa do każdego wypieku, {days} {from}–{to}, przez najbliższe {weeks} tygodni.',
        percent: '20% zniżki na rachunek, {days} {from}–{to}, przez najbliższe {weeks} tygodni.',
      },
      whyTitle: 'Dlaczego tak wybrałem',
      reasons: {
        quietDays:
          'Wybrałem {days}, {from}–{to}, bo to Twoje najcichsze godziny — około {pct}% poniżej tygodniowej średniej.',
        movedDays:
          'Poprosiłeś o {days}, więc przeniosłem. Twoje najcichsze godziny to nadal {quiet}, {from}–{to}, jeśli chcesz wrócić.',
        item:
          'Wybrałem darmową pozycję, bo takie okazje mają około {x}× więcej odebrań niż rabaty procentowe w {n} lokalach w Twoim mieście, a koszt to stałe {amount} za każdym razem.',
        percent:
          'Poprosiłeś o rabat procentowy, więc ustawiłem 20%. Koszt zależy od wielkości rachunku, więc dodałem warunek zatrzymania.',
        budget: 'Ustawiłem budżet na {amount}, bo tyle powiedziałeś, że możesz wydać w tym miesiącu.',
        budgetTight:
          'Ustawiłem budżet na {amount}, bo tyle zostaje, zanim gorące okazje zaczną zjadać Twoją marżę w tym miesiącu.',
      },
      dealTag: 'Gorąca okazja',
      dealNew: 'Nowa — zostanie utworzona',
      dealFields: ['Co to jest', 'Dni i godziny', 'Trwa', 'Kto to widzi'],
      dealValues: {
        item: 'Darmowa pozycja — kawa przelewowa do każdego wypieku',
        percent: 'Rabat procentowy — 20% od rachunku',
      },
      stopAfter: 'Zatrzymuje się po',
      claims: 'odebraniach',
      fieldNote:
        'Dni, godziny, daty i odbiorcy są ustawione tak, jak wyjaśniłem wyżej. Każde z nich zmienisz w pełnym formularzu.',
      notifyTag: 'Powiadomienie',
      notifyAttached: 'Dołączone do okazji powyżej',
      goesOut: 'Wychodzi',
      notifyFields: ['Dociera do', 'Zużywa'],
      notifyReach: '{n} osób z włączonymi powiadomieniami',
      notifyUses: '1 z Twoich {n} pozostałych powiadomień w tym miesiącu',
      costTitle: 'Ile to będzie kosztować',
      costLine: {
        item: 'Jeśli odbierze to {n} osób, kosztuje Cię to około {amount}. To szacunek, oparty na stałych {each} za odebranie.',
        percent:
          'Jeśli odbierze to {n} osób, kosztuje Cię to około {amount}. To szacunek, oparty na Twoim średnim rachunku {avg} na wizytę.',
      },
      costNote:
        'Gorące okazje nie mają własnej puli budżetowej, więc to idzie prosto z Twojej marży. Ogranicza je warunek zatrzymania powyżej.',
      budgetWarn:
        'Poprosiłeś o {asked}. Masz w tym miesiącu {room} zapasu, więc zamiast odmawiać przygotowałem mniejszą wersję — {n} odebrań zamiast {wanted}.',
      readTitle: 'Co przeczytają klienci',
      readWarn: 'Napisane przeze mnie — sprawdź przed publikacją',
      titleIn: 'Tytuł po {lang}',
      bodyIn: 'Opis po {lang}',
      termsTitle: 'Zasady korzystania',
      termsTag: 'Standardowe warunki',
      terms: 'Jedno odebranie na wizytę. Nie łączy się z innymi okazjami. Lokal może zakończyć ofertę wcześniej.',
      reviseTitle: 'Zmienić coś? Powiedz co',
      revisePlaceholder: 'Niech będzie czwartek, i nie chcę, żeby dostawali to studenci.',
      reviseAction: 'Zmień projekt',
      reviseNote:
        'Zmieniam tylko to, co wskażesz, i pokazuję, co się ruszyło. Reszta projektu zostaje bez zmian.',
      publish: 'Opublikuj',
      notRight: 'To nie jest to, czego potrzebuję',
      exitsIntro:
        'Trzy wyjścia. Żadne nie jest gorsze od pozostałych — wybierz to, które pasuje do skali pomyłki.',
      exits: [
        {
          title: 'Powiedz mi, co jest nie tak',
          note: 'Zmieniam ten projekt. Wszystko, co już zaakceptowałeś, zostaje.',
          label: 'Napisz poniżej',
        },
        {
          title: 'Otwórz to w zwykłym formularzu',
          note: 'Przejmujesz stery. Wszystko, co trafiłem, jest już wypełnione.',
          label: 'Przejmuję',
        },
        {
          title: 'Zacznij od nowa',
          note: 'Wyrzuca ten projekt i teksty w pięciu językach.',
          label: 'Wyrzuć to',
        },
      ],
      revisions: {
        days: 'Dni',
        hours: 'Godziny',
        audience: 'Kto to widzi',
        thursday: 'Czwartek',
        friday: 'Piątek',
        morning: '07:00–10:00',
        noStudents: 'Wszyscy poza studentami — około {n} osób',
      },

      publishedTitle: 'Dwie rzeczy są gotowe',
      publishedOne: 'Jedna rzecz jest gotowa',
      publishedDeal: '{days}, {from}–{to} · zatrzymuje się po {n} odebraniach',
      publishedNotify: 'Wychodzi o {at}',
      publishedNotifyNote: 'Do {n} osób',
      watch:
        'Zajrzyj za dwa dni. Jeśli do tego czasu odbierze to mniej niż 10 osób, godziny są raczej dobre, a oferta za słaba.',
      again: 'Przygotuj coś jeszcze',

      reviewTitle: 'Co zmieniłbym w tym tygodniu',
      reviewIntro: 'Trzy rzeczy są warte zmiany w tym tygodniu. Resztę zostawiłem w spokoju.',
      review: [
        {
          text: 'Twój próg vouchera {pct}% wymaga {points} punktów. W tym miesiącu sięgnęło po niego tylko {reached} klientów. Przy {lower} punktach zakwalifikowałoby się o {more} stałych klientów więcej.',
          label: 'Zmień próg',
        },
        {
          text: '„{name}” jest wstrzymana, ale wciąż trzyma {amount}. {n} nagród zostało zdobytych i nigdy nieodebranych — są ważne aż do wygaśnięcia.',
          label: 'Otwórz kampanię',
        },
        {
          text: '„{name}” trwała {weeks} tygodni przy 5% zniżki i dała {claims} odebrań — mniej więcej jedną trzecią tego, co średnio dają Twoje okazje 15%. Małe rabaty rzadko kogoś ruszają.',
          label: 'Zobacz swoje okazje',
        },
      ],

      asked: 'Zapytałeś: „{q}”',
      answerLine:
        'Korzystanie z voucherów spadło o {down}%, ze {from} do {to}. Cały spadek jest w progu {pct}% — w tym miesiącu sięgnęło po niego {now} klientów wobec {before} w poprzednim, bo próg punktowy wzrósł do {points}.',
      answerNote:
        'Wizyty w tym samym okresie wzrosły o 12%, więc ludzie przychodzą. Mniej z nich dochodzi do progu, który warto wykorzystać.',
      answerLabel: 'Otwórz progi',
      answerMore:
        'Gdzie poszły pieniądze, próg po progu, jest na stronie Vouchery. Nie odtwarzałem tego tutaj.',
      askElse: 'Zapytaj o coś innego',

      handedTitle: 'Teraz to Twoje',
      handedNote:
        'Wypełniłem to, czego byłem pewien. Sprawdź dwie ostatnie pozycje — te zgadywałem.',
      handedFields: [
        'Dni i godziny',
        'Co dostają ludzie',
        'Trwa',
        'Zatrzymuje się po',
        'Kto to widzi',
        'Tekst w pięciu językach',
      ],
      handedWeeks: '{n} tygodni',
      handedCopy: 'Napisane przeze mnie — sprawdź przed publikacją',
      filledIn: 'Wypełnione',
      checkThis: 'Sprawdź to',
      openForm: 'Otwórz formularz',
      backToDraft: 'Wróć do projektu',

      cantLine: 'Nie potrafię celować w ludzi po tym, ile zwykle wydają. Paylez tego jeszcze nie śledzi.',
      cantAlt:
        'Mogę celować w osoby, które już u Ciebie były — {n} z nich odwiedziło Cię co najmniej dwa razy. Chcesz tak zamiast tego?',
      cantYes: 'Tak, użyj tego',
      cantNo: 'Poproś o coś innego',
      cantElsewhere:
        'Jeśli chcesz zobaczyć, ile ludzie wydają, średnia na wizytę jest na stronie Klienci.',
      cantOpen: 'Otwórz Klientów',

      missedTitle: 'Tego nie zrozumiałem',
      missedBody:
        'Doszedłem do tego: okazja w popołudnia {days}. Nie udało mi się ustalić oferty ani budżetu, a wolę przekazać to dalej, niż dopytywać w kółko.',
      loopNote:
        'To już drugi raz. Nie będę dalej zgadywał — formularz pójdzie szybciej, a wpisałem w niego dni i godziny, które zrozumiałem.',
      missedAction: 'Otwórz zwykły formularz',
      tryAgain: 'Spróbuj jeszcze raz',

      dayChoices: ['Wtorek i środa', 'Czwartek', 'Piątek'],
      goals: [
        'Zapełnij ciche godziny',
        'Odzyskaj klientów, którzy przestali przychodzić',
        'Przyciągnij więcej nowych gości',
        'Przejrzyj wszystko, co prowadzę',
      ],
      notifyYes: 'Tak, na starcie',
      notifyNo: 'Nie, tylko wystawione',
      weeksValue: '{n} tygodni',
      published: 'Nic nie zostało opublikowane — w tej wersji nie ma serwera.',
      draftUpdated: 'Projekt zaktualizowany. Reszta bez zmian.',
      handedOver: 'Otworzyłem formularz ze wszystkim, co udało się przenieść.',
    },

    collapse: 'Zwiń menu',
    expand: 'Rozwiń menu',
    backToSite: 'Wróć do paylez',

    plan: {
      name: 'Plan Growth',
      state: 'Aktywny',
      caption: 'Budżety na lojalność i vouchery w tym miesiącu. Gorące okazje nie wchodzą w to.',
      usage: '{used} z {total}',
    },

    ranges: ['Ostatnie 7 dni', 'Ostatnie 14 dni', 'Ostatnie 30 dni', 'Ostatni kwartał'],
    rangeMenu: 'Okres raportowania',
    notifications: 'Powiadomienia',
  },

  hero: {
    lines: ['Graj i zarabiaj.', 'Ekskluzywne oferty.'],
    lede: 'Odkrywaj, graj i zgarniaj nagrody.',
    primary: 'Graj i zarabiaj',
    secondary: 'Jak to działa',
    stats: ['Wystarczy na voucher', 'Sklepów partnerskich', 'Miast dostępnych'],
  },

  proof: 'Wymieniaj punkty w czołowych sklepach partnerskich',

  guide: {
    eyebrow: 'W Twoim mieście',
    title: 'Odkryj usługi w swoim mieście.',
    lede: 'Gorące okazje, sprawdzone miejsca i lokalne ulubieńce — wszystko w jednym miejscu.',
    services: [
      { name: 'Piekarnia', blurb: 'Świeże wypieki tuż obok' },
      { name: 'Kawa', blurb: 'Twoja idealna kawa, gdziekolwiek jesteś' },
      { name: 'Zakupy', blurb: 'Najlepsze miejsca na zakupy jak miejscowi' },
      { name: 'Restauracje', blurb: 'Odkryj najlepsze lokalne smaki' },
      { name: 'Halal', blurb: 'Miejsca z certyfikatem halal, którym możesz zaufać' },
      { name: 'Rozrywka', blurb: 'Ciekawe rzeczy do zrobienia w okolicy' },
      { name: 'Uroda', blurb: 'Pielęgnacja i uroda' },
      { name: 'Mieszkanie', blurb: 'Znajdź swój nowy dom za granicą' },
    ],
  },

  features: {
    eyebrow: 'Jak działa paylez',
    title: 'Graj chwilę. Zarabiaj sporo.',
    lede: 'Odpowiadaj na szybkie pytania, buduj serię i zamieniaj punkty na prawdziwe vouchery.',
    cards: [
      {
        title: 'Odpowiadaj na pytania. Buduj serie. Wygrywaj nagrody.',
        body: 'Ćwicz umysł codziennie w grze Play & Earn. Każda poprawna odpowiedź to punkty, które wymienisz na vouchery rabatowe w sklepach partnerskich.',
      },
      {
        title: 'Ekskluzywne oferty',
        body: 'Ręcznie wybrane karty podarunkowe i rabaty z naszej sieci partnerów, regularnie aktualizowane.',
      },
      {
        title: 'Natychmiastowe vouchery w telefonie',
        body: 'Realizuj prosto z telefonu i skanuj w sklepie — niczego nie musisz drukować.',
      },
      {
        title: 'Skanuj kody QR, zgarniaj dodatkowe punkty',
        body: 'Skanuj kody QR partnerów w sklepie, żeby dopisać punkty do salda bez ani jednego pytania — prosto z telefonu.',
      },
      {
        title: 'Asystent AI',
        body: 'Twój cyfrowy towarzysz — zapytaj o wszystko, o dowolnej porze.',
      },
    ],
  },

  value: {
    eyebrow: 'Graj i zarabiaj',
    title: 'Twoje punkty to prawdziwe pieniądze.',
    lede: 'Żadnych sztuczek. Graj, zbieraj punkty i wymieniaj je na karty podarunkowe oraz rabaty, z których naprawdę skorzystasz.',
    card: {
      merchant: 'Karta podarunkowa Zalando',
      meta: 'Sklep partnerski · wartość {amount}',
      title: 'Wymień punkty na prawdziwy voucher.',
      price: '500 pkt',
      revealed: 'Voucher gotowy · PLZ-9F3K',
      action: 'Wymień 100 punktów',
    },
    benefits: [
      {
        title: 'Zarabiaj punkty, po prostu grając',
        body: 'Odpowiedz na kilka szybkich pytań dziennie, buduj serię i zbieraj punkty w tramwaju, w kolejce, gdziekolwiek.',
      },
      {
        title: 'Wymieniaj na karty podarunkowe i rabaty',
        body: 'Zamieniaj punkty na vouchery w sklepach partnerskich, takich jak Zalando, Douglas czy Media Expert — realizowane prosto z telefonu.',
      },
      {
        title: 'Wspinaj się w rankingu Paylez Champions',
        body: 'Zapraszaj znajomych, utrzymuj serię i pnij się w miesięcznym rankingu. Pierwszego dnia miesiąca startuje od zera, więc do czołówki nigdy nie jest daleko.',
      },
    ],
  },

  voices: {
    eyebrow: 'Partnerzy o paylez',
    title: 'Z paylez lokalne firmy rosną szybciej.',
    items: [
      {
        quote:
          'Wrzuciliśmy voucher do puli we wtorek, a w czwartek mieliśmy kolejkę. Nic nas to nie kosztuje, dopóki ktoś nie wejdzie i go nie zrealizuje.',
        name: 'Kawiarnia Wisła',
        meta: 'Kawiarnia · Kraków',
      },
      {
        quote:
          'Zapełniają się właśnie te ciche godziny. Poranki w tygodniu były martwe — teraz to zmiana, na którą bierzemy dodatkową osobę.',
        name: 'Studio Barber 9',
        meta: 'Barber · Warszawa',
      },
      {
        quote:
          'Klienci są nasi, a nie aplikacji dostawczej. Możemy odezwać się do tych, którzy nie byli od miesiąca, i oni wracają.',
        name: 'Zielony Market',
        meta: 'Sklep spożywczy · Wrocław',
      },
      {
        quote:
          'Obsługa nauczyła się skanowania QR na jednej zmianie. Bez nowego sprzętu, bez niczego dodatkowego na ladzie, bez tłumaczenia dwa razy.',
        name: 'Pracownia Ceramiki',
        meta: 'Pracownia · Gdańsk',
      },
      {
        quote:
          'Wreszcie wiemy, ile wart jest klient powracający wobec nowego. Sam ten raport zmienił nasze ceny.',
        name: 'Fit Klub Nowa',
        meta: 'Klub fitness · 4 lokale',
      },
    ],
  },

  learn: {
    back: 'Wróć do paylez',
    hero: {
      eyebrow: 'L-Earn',
      lines: ['Naucz się czegoś nowego.', 'Zarób coś prawdziwego.'],
      lede: 'Kilka szybkich pytań dziennie. Punkty, które zamieniają się w vouchery w sklepach, z których i tak korzystasz.',
      primary: 'Zacznij grać',
      secondary: 'Zobacz gry',
      stats: ['Najlepsza runda', 'Daje zamrożenie', 'Wystarczy na voucher'],
    },

    steps: {
      eyebrow: 'Jak to działa',
      title: 'Cztery kroki, jakieś dwie minuty.',
      lede: 'Na tyle krótko, że starczy jazda tramwajem — i tam najczęściej się w to gra.',
      items: [
        {
          title: 'Wybierz grę',
          body: 'Stolice, flagi albo życie w Polsce. Pięć pytań na rundę i żadne nie zajmuje długo.',
        },
        {
          title: 'Odpowiadaj',
          body: 'Każda poprawna odpowiedź daje punkty, a cała runda bez pomyłki daje bonus na dokładkę.',
        },
        {
          title: 'Utrzymaj serię',
          body: 'Wróć jutro. Jedna runda dziennie utrzymuje serię, a siedem dni z rzędu daje zamrożenie, które pokrywa opuszczony dzień.',
        },
        {
          title: 'Wymień punkty',
          body: 'Zamień punkty na voucher i zeskanuj go w sklepie. Nic nie drukujesz, na nic nie czekasz.',
        },
      ],
    },

    games: {
      eyebrow: 'Gry',
      title: 'Wybierz swoją grę.',
      lede: 'Każda z nich jest przetłumaczona na wszystkie języki tego serwisu, więc nigdy nie grasz w swoim drugim języku — chyba że sam chcesz.',
    },

    streak: {
      eyebrow: 'Serie',
      title: 'To w serii są punkty.',
      lede: 'Jedna runda co 24 godziny utrzymuje ją przy życiu. Przegapisz to okno, a seria wraca do zera — punkty zostają dokładnie tam, gdzie są — chyba że masz zamrożenie. Zamrożenie pokrywa jeden opuszczony dzień, dostajesz je co siódmy dzień i możesz mieć dwa. To cała zasada.',
      card: {
        label: 'Aktualna seria',
        unit: 'dni',
        reward: 'Zamrożenie siódmego dnia',
        freeze: 'Zamrożenia w zapasie · każde pokrywa jeden opuszczony dzień',
      },
      benefits: [
        {
          title: 'Każda runda warta tyle samo',
          body: 'Żadna gra nie płaci mniej za drugie podejście i żadna dzisiejsza runda nie jest warta mniej niż wczorajsza. Dzień ogranicza energia: cztery w zapasie, po jednej na rundę, i jedna wraca co cztery godziny.',
        },
        {
          title: 'Dzień siódmy: zamrożenie',
          body: 'Tydzień obecności kupuje Ci dzień wolnego. Zamrożenie wchłania jeden opuszczony dzień, a seria leci dalej, jakbyś zagrał.',
        },
        {
          title: 'Liczy się dzień, nie gra',
          body: 'Serię podtrzymuje dowolna runda w dowolnej grze, więc słaby poranek ze stolicami nic nie kosztuje.',
        },
      ],
    },

    board: {
      eyebrow: 'Paylez Champions',
      title: 'Ranking miesiąca.',
      lede: 'Pierwszego dnia miesiąca wszyscy zaczynają od zera. Najlepsza trójka kończy miesiąc na szczycie rankingu; reszta zaczyna kolejny miesiąc na tych samych zasadach.',
      columns: { rank: '#', player: 'Gracz', points: 'Punkty' },
      note: 'Przykładowy ranking — Twój zeruje się 1. dnia miesiąca.',
    },

    faq: {
      eyebrow: 'Pytania',
      title: 'Krótkie odpowiedzi.',
      items: [
        {
          q: 'Czy punkty tracą ważność?',
          a: 'Nie. Saldo zachowuje to, co już zdobyłeś, nawet przez tydzień przerwy — zegar tyka serii, nie punktom. Przegapisz to okno, a seria wraca do zera; punkty dalej są Twoje do wydania.',
        },
        {
          q: 'Ile rund mogę zagrać dziennie?',
          a: 'Cztery przy pełnym zapasie, a potem tyle, ile zdąży wrócić. Każda skończona runda kosztuje jedną energię — wszystko jedno, wygrana czy przegrana — a energia wraca sama, po jednej co cztery godziny, maksymalnie do czterech. Nic nie płaci mniej za powtórzenie: dziesiąta runda dnia jest warta dokładnie tyle, co pierwsza.',
        },
        {
          q: 'Ile naprawdę wart jest voucher?',
          a: 'To zależy od rodzaju vouchera i od tego, co zdecyduje partner. Karta podarunkowa od samego paylez — na przykład do Zalando czy Zary — kosztuje 100 punktów z gry i jest warta {amount}.',
        },
        {
          q: 'W jakich językach są pytania?',
          a: 'We wszystkich pięciu z tej strony — po angielsku, polsku, uzbecku, rosyjsku i ukraińsku. Zmieniasz język, a pytania zmieniają się razem z nim.',
        },
      ],
    },

    cta: {
      title: 'Dwie minuty dziennie.',
      lede: 'To całe zobowiązanie. Zagraj rundę, utrzymaj serię i wydaj punkty na coś, co i tak zamierzałeś kupić.',
      primary: 'Zacznij grać',
      secondary: 'Poznaj paylez',
      note: 'Gra za darmo · Dostępne w całej Polsce',
    },
  },

  /* ────────────────────────────────────────────────────────── analytics ── */

  analytics: {
    back: 'Wróć do paylez',
    exampleNote:
      'Liczby przykładowe, żeby pokazać kształt raportu. Twoje własne są na Twoim panelu.',
    hero: {
      eyebrow: 'Analityka partnera',
      lines: ['Każde skanowanie,', 'rozliczone.'],
      lede: 'Zobacz, co naprawdę zrobiła kampania — wyświetlenia, kliknięcia, realizacje i ich wartość, dla każdej prowadzonej oferty.',
      primary: 'Otwórz panel',
      secondary: 'Zobacz, co dostajesz',
      venueLabel: 'Twój lokal',
      venueNone: 'To konto nie ma jeszcze wizytówki',
      venueNote: 'Nie trzeba nic wpisywać. Jesteś zalogowany, więc panel już wie, który lokal jest Twój — Service ID jest nasz i pyta o niego wsparcie.',
    },

    kpis: {
      eyebrow: 'Najważniejsze',
      title: 'Cztery liczby, jeden okres.',
      lede: 'Te same cztery na górze każdego panelu partnera, w zestawieniu z poprzednim okresem.',
      items: [
        'Wyświetlenia',
        'Unikalni klikający',
        'Współczynnik konwersji',
        'Realizacje',
      ],
      since: 'wzgl. poprzedniego okresu',
    },

    funnel: {
      eyebrow: 'Lejek zaangażowania',
      title: 'Gdzie tracisz ludzi.',
      lede: 'Trzy etapy, a jedyne, co warto optymalizować, to różnice między nimi. Oferta widziana i nieklikana ma inny problem niż klikana i niezrealizowana.',
      stages: [
        {
          name: 'Wyświetlenia',
          note: 'Twoja oferta pojawiła się w kanale lub w wynikach wyszukiwania.',
        },
        {
          name: 'Kliknięcia',
          note: 'Ktoś ją otworzył. Liczone raz na osobę, nie na dotknięcie.',
        },
        { name: 'Realizacje', note: 'Voucher został zeskanowany przy Twojej kasie.' },
      ],
    },

    week: {
      eyebrow: 'Realizacje wg dni',
      title: 'Tydzień na jeden rzut oka.',
      lede: 'Realizacje wypadają w dniach, których się spodziewasz — i właśnie dlatego warto przyjrzeć się tym, których się nie spodziewasz.',
      days: ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'],
      peak: 'Najlepszy dzień',
      total: 'Zrealizowano w tym tygodniu',
    },

    reports: {
      eyebrow: 'Co dostajesz',
      title: 'Poza nagłówkowymi liczbami.',
      items: [
        {
          title: 'Podział geograficzny',
          body: 'Z których miast i dzielnic pochodzą realizacje, żeby druga lokalizacja była decyzją, a nie zgadywaniem.',
        },
        {
          title: 'Miesięczna wartość rozliczenia',
          body: 'Ile złożyły się realizacje voucherów w skali miesiąca — kwota, która trafia na Twoje konto.',
        },
        {
          title: 'Historia realizacji',
          body: 'Każda realizacja ze statusem i znacznikiem czasu, z filtrami i eksportem do CSV, kiedy poprosi księgowość.',
        },
        {
          title: 'Powracalność',
          body: 'Ilu realizujących wróciło po drugą ofertę. Liczba, która mówi, czy kupiłeś klienta, czy rabat.',
        },
      ],
    },

    cta: {
      title: 'To już działa.',
      lede: 'Każda oferta partnerska zbiera te dane od dnia uruchomienia. Panel jest już Twój — o jedno kliknięcie stąd.',
      primary: 'Otwórz panel',
      secondary: 'Porozmawiajmy o współpracy',
      note: 'W każdym koncie partnera · Bez dodatkowej opłaty',
    },
  },

  /* ─────────────────────────────────────────────────────────── business ── */

  business: {
    back: 'Wróć do paylez',
    hero: {
      eyebrow: 'Nagrody, vouchery, marketing i analityka w jednej platformie',
      lines: ['Zamień każdą wizytę', 'w nawyk.', 'Miej klientów na własność.'],
      lede: 'Lojalność, vouchery, marketing i raporty na jednym rekordzie klienta — a Twoja oferta siedzi w grze, którą tysiące osób otwierają każdego ranka. Płacisz dopiero wtedy, gdy ktoś wejdzie i zrealizuje voucher.',
      primary: 'Porozmawiaj z nami',
      secondary: 'Zobacz panel',
      stats: ['Wzrost powrotów', 'Koszt do realizacji', 'Od umowy do startu'],
      trust: 'Zaufało nam 500+ lokali · Bez sprzętu · Bez umowy na start',
    },

    why: {
      eyebrow: 'Dlaczego operatorzy się przenoszą',
      title: 'Wszystko, czego potrzebujesz, by zarabiać więcej na klientach, których już masz.',
      lede: 'Cztery systemy, które większość lokali kupuje osobno — lojalność, vouchery, marketing i analityka — działające na jednym rekordzie klienta.',
      items: [
        {
          title: 'Nic, dopóki nie zadziała',
          body: 'Twój voucher trafia do tysięcy graczy. Płacisz dopiero wtedy, gdy ktoś wejdzie i go zrealizuje. Punkty nic nie kosztują, dopóki voucher nie zostanie użyty — kampania, która nie trafi do nikogo, też nic nie kosztuje.',
          stat: '{amount} do momentu realizacji vouchera',
        },
        {
          title: 'Klient jest Twój',
          body: 'Każda gra, realizacja i wizyta buduje profil, z którym możesz kontaktować się bezpośrednio — a nie wskaźnik zamknięty w cudzej aplikacji ani listę wynajmowaną po jednym pushu.',
          stat: '100% rekordu klienta',
        },
        {
          title: 'Start w 48 godzin',
          body: 'Integracja z POS tam, gdzie chcesz, i praca bez niej tam, gdzie nie chcesz. Obsługa skanuje QR przy kasie, uczy się tego na jednej zmianie, a sprzętu nie trzeba kupować ani stawiać na ladzie.',
          stat: '48 h od podpisu do pierwszego skanu',
        },
        {
          title: 'Cztery narzędzia, jedno logowanie',
          body: 'Lojalność, vouchery, kampanie i raporty przestają być czterema umowami, czterema eksportami i czterema wersjami tego, kim jest Twój klient. Jeden rekord, jedna faktura, jeden ekran.',
          stat: '4 systemy, 1 rekord klienta',
        },
      ],
    },

    dashboard: {
      eyebrow: 'Twój panel',
      title: 'Ekran, który otwierasz w poniedziałek rano.',
      lede: 'Nie miesięczny PDF od opiekuna klienta. Każdy skan, voucher i kampania we wszystkich Twoich lokalach — i zaczyna się od zdania, a nie od wykresu.',
      bullets: [
        {
          title: 'Zaczyna się od zwykłych słów',
          body: 'Ilu nowych klientów przyprowadziliśmy i mniej więcej ile zostawili — zanim spojrzysz na jakąkolwiek oś.',
        },
        {
          title: 'Jeden lokal albo wszystkie naraz',
          body: 'Filtruj po lokalu, kanale i dacie. Menedżer widzi swój lokal i nigdy nie widzi liczb całej grupy.',
        },
        {
          title: 'Sam mówi, co zauważył',
          body: 'Ciche dni, nagrody zdobyte i nigdy nieużyte, próg rabatowy, do którego nikt nie dochodzi — z gotową propozycją zmiany.',
        },
      ],
      action: 'Umów prezentację',
      mock: {
        business: 'Sablewski & Para',
        screen: 'Przegląd',
        range: 'Ostatnie 30 dni',
        user: 'MK',
        kicker: 'Co paylez dla Ciebie zrobił',
        headline:
          'Przyprowadziliśmy do Ciebie {customers} nowych klientów, którzy zostawili u Ciebie około {revenue}.',
        tiles: [
          { name: 'Wizyty', note: 'Skany QR przy kasie' },
          { name: 'Zrealizowane vouchery', note: 'Punkty wydane u Ciebie' },
          { name: 'Wskaźnik powrotów', note: 'Powrót w ciągu 30 dni' },
          { name: 'Średni koszyk', note: 'Na przypisaną wizytę' },
        ],
        since: 'wobec poprzednich 30 dni',
        chart: {
          title: 'Wizyty i zrealizowane vouchery',
          note: 'Każdy skan QR przy ladzie zestawiony z voucherami, które klienci faktycznie wydali.',
          visits: 'Wizyty',
          redeemed: 'Zrealizowane',
        },
        insight: {
          kicker: 'Co zauważyliśmy',
          text: 'Wtorek to Twój najcichszy dzień, a 38% nagród zdobytych w zeszłym miesiącu nigdy nie zostało użytych.',
          action: 'Przygotuj ofertę na wtorek',
          dismiss: 'Nie teraz',
        },
        live: {
          title: 'Działa teraz',
          note: 'Wszystko, co klienci widzą i mogą zdobyć w Twoich lokalach dzisiaj.',
          rows: [
            {
              kind: 'Play & Earn',
              name: '−20% na menu główne',
              rule: '500 pkt · cztery lokale',
              statLabel: 'w puli',
            },
            {
              kind: 'Gorąca oferta',
              name: 'Kawa gratis do 11:00',
              rule: 'Pn–Pt · Kazimierz',
              statLabel: 'odebranych',
            },
            {
              kind: 'Kampania',
              name: 'Cisi od 30 dni · push',
              rule: '1 840 klientów',
              statLabel: 'otwarć',
            },
          ],
          on: 'Aktywne',
          off: 'Wstrzymane',
          edit: 'Edytuj',
        },
      },
    },

    pillars: {
      eyebrow: 'Platforma',
      title: 'Trzy części, jeden rekord klienta.',
      items: [
        {
          eyebrow: 'Paylez Portal',
          title: 'Jeden panel dla wszystkich Twoich lokali.',
          body: 'Obrót, rozgrywki, realizacje i udział powracających klientów we wszystkich lokalizacjach — z filtrem po lokalu, kanale i dacie. Bez arkuszy i bez czekania na dostawcę POS.',
          bullets: [
            {
              title: 'Sumy grupy, które rozwijają się do lokali',
              body: 'Jedna liczba dla całego biznesu i wiersz, który ją tłumaczy, o jedno kliknięcie niżej.',
            },
            {
              title: 'Widać, która grupa niesie ten miesiąc',
              body: 'Koszyk powracających wobec pierwszorazowych, na lokal i na kanał.',
            },
            {
              title: 'Menedżer widzi swój lokal, nie Twoją grupę',
              body: 'Osobne logowania z własnym zakresem, żeby kierownik zmiany sam sprawdził swoje liczby.',
            },
          ],
          action: 'Zobacz portal',
        },
        {
          eyebrow: 'Play & Earn',
          title: 'Twoja oferta w grze, którą otwierają codziennie.',
          body: 'Klienci odpowiadają na krótkie pytania, budują serie i zdobywają punkty — a potem wydają je na voucher, który mogą zrealizować tylko u Ciebie.',
          bullets: [
            {
              title: 'Twój voucher jest w codziennej puli',
              body: 'Stoi przed graczami, którzy i tak otwierają aplikację, żeby coś wygrać.',
            },
            {
              title: 'Ty ustalasz każdą liczbę',
              body: 'Koszt w punktach, rabat, ważność, limit tygodniowy i lokale, które go honorują.',
            },
            {
              title: 'Jedno skanowanie QR przy kasie',
              body: 'Bez sprzętu, bez integracji i z jedną zmianą na naukę dla obsługi.',
            },
          ],
          action: 'Zobacz, jak działa Play & Earn',
        },
        {
          eyebrow: 'Dane i marketing',
          title: 'Odzyskaj cichych klientów w dziesięć minut miesięcznie.',
          body: 'Segmentuj po wydatkach, częstotliwości, lokalizacji lub dniach nieobecności — i wyślij push, ofertę albo kod promocyjny prosto do tej grupy.',
          bullets: [
            {
              title: 'Sześć sposobów dotarcia',
              body: 'Push, oferty czasowe, kody promocyjne, karty podarunkowe, kody QR w lokalu i e-mail.',
            },
            {
              title: 'Grupy, które są już zbudowane',
              body: 'Nieaktywni, wysokie koszyki, nowi w tym miesiącu i pojedyncze lokale — gotowe do wysyłki.',
            },
            {
              title: 'Przychód raportowany na kampanię',
              body: 'Ile każda wiadomość przyprowadziła z powrotem, a nie przez ilu została otwarta.',
            },
          ],
          action: 'Przejrzyj narzędzia',
        },
      ],
      portal: {
        label: 'Obrót grupy',
        period: 'Ten miesiąc',
        columns: { site: 'Lokal', repeat: 'Powracający' },
      },
      cohort: {
        label: 'Wartość koszyka wg grupy',
        returning: 'Powracający',
        first: 'Pierwszy raz',
      },
      game: {
        label: 'Twój voucher w puli',
        prize: '−20% u Ciebie',
        cost: '500 pkt',
        note: 'Dobrze! Masz punkty.',
      },
      campaign: {
        label: 'Nowa kampania',
        audiences: [
          'Nieaktywni 30 dni',
          'Wysokie koszyki',
          'Nowi w tym miesiącu',
          'Jeden lokal',
        ],
        send: 'Wyślij −20% na następną wizytę',
        estimate: 'Szac. {amount} odzyskanego obrotu',
      },
    },

    rollout: {
      eyebrow: 'Pierwsze kroki',
      title: 'Podpis w poniedziałek, start w środę.',
      lede: 'Bez sprzętu, bez projektu integracyjnego, bez dnia szkoleń. Cztery kroki, a ten długi jest po naszej stronie.',
      items: [
        {
          title: 'Dwudziestominutowa rozmowa',
          body: 'Twoje lokale, Twój średni koszyk, to, co masz dzisiaj. Wracamy z prostą prognozą przychodu z powrotów — nie z prezentacją.',
        },
        {
          title: 'Budujemy Twoją wizytówkę',
          body: 'Zdjęcia, godziny, kategorie i języki, którymi mówi Twoja obsługa — opisane we wszystkich pięciu językach aplikacji.',
        },
        {
          title: 'Twój voucher trafia do puli',
          body: 'Ustalasz koszt w punktach, rabat, ważność i limit tygodniowy. Tego samego dnia stoi przed graczami.',
        },
        {
          title: 'Obsługa skanuje przy kasie',
          body: 'Jeden kod QR, jedna zmiana na naukę. Realizacje pojawiają się w panelu na bieżąco.',
        },
      ],
      note: 'Średni czas od podpisania umowy do pierwszego zrealizowanego vouchera: 48 godzin.',
    },

    operators: {
      eyebrow: 'Operatorzy o paylez',
      title: 'Ludzie, którzy prowadzą lokale, a nie oprogramowanie.',
      items: [
        {
          quote:
            'Przestaliśmy wynajmować własnych klientów od aplikacji dostawczych. Nasz voucher jest w grze, którą tysiące osób otwierają rano, a realizacje wchodzą drzwiami.',
          name: 'Sablewski & Para',
          role: 'Właściciel — 4 lokale, Kraków',
        },
        {
          quote:
            'Dziesięć minut w poniedziałek. Jeden push do wszystkich, którzy nie byli od trzech tygodni. Ta jedna wiadomość zwraca koszt platformy kilka razy.',
          name: 'Kawiarnia Hermanos',
          role: 'Dyrektor operacyjny — 11 lokali',
        },
        {
          quote:
            'Nasz pierwszy voucher był w grze w tym samym tygodniu, w którym podpisaliśmy. Obsługa skanuje QR przy kasie — to cały proces, i dlatego naprawdę się przyjął we wszystkich lokalach.',
          name: 'Poke Yard',
          role: 'Założyciel — 6 lokali, Warszawa',
        },
        {
          quote:
            'Możliwość zobaczenia wartości koszyka powracających i nowych klientów zmieniła nasze ceny. Sam ten raport uzasadnił zmianę.',
          name: 'Piekarnia Northline',
          role: 'Dyrektor zarządzający — 9 lokali',
        },
      ],
    },

    pricing: {
      eyebrow: 'Cennik',
      title: 'Płacisz za realizacje, nie za stanowiska.',
      lede: 'Każdy plan zawiera portal i nielimitowaną liczbę rekordów klientów. Opłata miesięczna to narzędzia marketingowe — same vouchery finansujesz dopiero wtedy, gdy ktoś ich użyje.',
      perMonth: '/ miesiąc',
      quoted: 'Wycena',
      tiers: [
        {
          name: 'Jeden lokal',
          note: 'Jeden lokal',
          body: 'Obecność w Play & Earn, vouchery i raporty, które mają znaczenie.',
          features: [
            'Twój voucher w codziennej puli',
            'Panel właściciela i podstawowe raporty',
            'Nielimitowane rekordy klientów',
            'Realizacja QR przy kasie',
          ],
          action: 'Zacznij za darmo',
        },
        {
          name: 'Growth',
          note: 'Do 5 lokali',
          body: 'Pełne narzędzia marketingowe, logowania dla lokali i kampanie z kodem QR w lokalu.',
          features: [
            'Wszystko z planu Jeden lokal',
            'Push, oferty, kody promocyjne i karty podarunkowe',
            'Gotowe grupy i przychód na kampanię',
            'Osobne logowania dla menedżerów',
          ],
          action: 'Porozmawiaj z nami',
        },
        {
          name: 'Grupa',
          note: 'Od 6 lokali',
          body: 'Wdrożenie wielu lokali, integracja z POS i wyznaczony opiekun.',
          features: [
            'Wszystko z planu Growth',
            'Integracja z POS i wsparcie przy wdrożeniu',
            'Raporty i eksporty na poziomie grupy',
            'Wyznaczony opiekun klienta',
          ],
          action: 'Porozmawiaj z nami',
        },
      ],
      featured: 'Najczęściej wybierany',
      footnote:
        'Vouchery finansujesz przy realizacji w każdym planie, także w darmowym. Ceny nie zawierają VAT.',
    },
    cta: {
      title: 'Zobacz, ile są warci Twoi stali klienci.',
      lede: 'Dwudziestominutowa rozmowa, Twoje liczby i prosta prognoza przychodu z powrotów, który Paylez odblokuje w Twoich lokalach. Bez umowy na start.',
      primary: 'Porozmawiaj z nami',
      secondary: 'Poznaj paylez',
      note: 'Grupa wielolokalowa? Zapytaj o wsparcie przy wdrożeniu i integrację z POS.',
    },
  },

  /* ─────────────────────────────────────────────────────────── vouchers ── */

  vouchers: {
    back: 'Wróć do paylez',
    hero: {
      eyebrow: 'Punkty w środku, prawdziwe vouchery na wyjściu',
      lines: ['Graj o punkty.', 'Wydaj je', 'na coś prawdziwego.'],
      lede: 'Każdy zdobyty voucher trafia do jednego portfela: karty podarunkowe i rabaty w sklepach, z których i tak korzystasz, czekają do momentu, aż będą Ci potrzebne, a płacisz nimi, pokazując kod QR przy kasie.',
      primary: 'Zacznij zbierać',
      secondary: 'Zobacz, co jest dostępne',
      stats: ['Marek partnerskich', 'Najtańszy voucher', 'Koszt realizacji'],
      trust: 'Bez danych karty · Start za darmo · Dostępne w całej Polsce',
    },

    wallet: {
      title: 'Twoje vouchery',
      counts: '{active} aktywne · {used} wykorzystane',
      tabs: { active: 'Aktywne', used: 'Wykorzystane' },
      note: 'Voucher liczy się jako wykorzystany w chwili wygenerowania kodu QR — generuj go przy kasie, a nie w tramwaju.',
      card: {
        meta: 'Sklep partnerski · wartość {amount}',
        cost: '500 pkt',
        action: 'Pokaż kod QR',
        code: 'PLZ-9F3K',
        expires: 'Ważny do 31.08',
      },
    },

    steps: {
      eyebrow: 'Jak powstaje voucher',
      title: 'Cztery kroki i żaden z nich nic nie kosztuje.',
      lede: 'Cała pętla — od dwóch wolnych minut w tramwaju do rabatu przy kasie.',
      items: [
        {
          title: 'Odpowiedz na kilka pytań',
          body: 'Kilka minut w tramwaju. Każda poprawna odpowiedź to punkty, a każda runda płaci pełną stawkę — obojętne, w którą grę i który raz dziennie. Dzień ogranicza energia, nie powtórki.',
        },
        {
          title: 'Wybierz voucher',
          body: 'Portfel pokazuje, na co już Cię stać, a do czego ile brakuje. Nic nie chowa się za progiem, którego nie widzisz.',
        },
        {
          title: 'Wygeneruj QR przy kasie',
          body: 'Jedno dotknięcie zamienia voucher w kod. To jeden kod do jednorazowego użycia — dlatego generuje się go przy kasie, a nie wcześniej.',
        },
        {
          title: 'Rabat schodzi z rachunku',
          body: 'Obsługa skanuje kod, rabat schodzi z rachunku, a voucher przechodzi do zakładki Wykorzystane z datą i nazwą sklepu.',
        },
      ],
    },

    catalogue: {
      eyebrow: 'Co jest w portfelu',
      title: 'Karty podarunkowe do sklepów, do których i tak się wybierałeś.',
      lede: 'Lista odświeża się co miesiąc, a każda karta ma ograniczoną pulę — kiedy miesięczna pula się skończy, wraca pierwszego.',
      cost: 'pkt',
      left: 'zostało {left} z {of}',
      everywhere: 'Każdy sklep · także online',
      soldOut: 'Wraca pierwszego',
      action: 'Zobacz pełną listę',
    },

    rules: {
      eyebrow: 'Drobny druk, normalnymi słowami',
      title: 'Trzy rzeczy, które warto wiedzieć przed wydaniem.',
      items: [
        {
          title: 'Jeden kod, jedno użycie',
          body: 'Wygenerowanego kodu QR nie da się wygenerować ponownie, zapisać na później ani przekazać znajomemu. To dlatego voucher jest wart honorowania przy kasie.',
        },
        {
          title: 'Generuj go przy kasie',
          body: 'Voucher przechodzi do Wykorzystanych w chwili, gdy kod powstaje — niezależnie od tego, czy ktoś go zeskanował. Najpierw stań przy kasie.',
        },
        {
          title: 'Seria przepada, jeśli przestaniesz grać',
          body: 'Zagraj co najmniej jedną rundę w ciągu 24 godzin, a seria leci dalej. Przegapisz to okno i wraca do zera — punkty nie. Odebrane już vouchery mają własną datę ważności, wypisaną na karcie, zanim cokolwiek wydasz.',
        },
      ],
    },

    faq: {
      eyebrow: 'Pytania',
      title: 'Te, które padają naprawdę.',
      items: [
        {
          q: 'Ile kosztuje mnie voucher?',
          a: 'Punkty i nic poza tym. Nie ma opłaty za dostarczenie ani karty w systemie — przy realizacji nigdy nie podajesz danych płatniczych.',
        },
        {
          q: 'Czy mogę połączyć voucher z promocją sklepu?',
          a: 'Zwykle tak, i karta mówi o tym przed realizacją. Jeśli partner wyłącza produkty przecenione, to wyłączenie jest napisane na voucherze, a nie odkrywane przy kasie.',
        },
        {
          q: 'Wygenerowałem kod przez przypadek. Da się go odzyskać?',
          a: 'Nie automatycznie — w tym momencie kod już działa. Napisz do wsparcia z numerem vouchera, a sprawdzimy, ale uczciwa odpowiedź brzmi: dotykaj tego przycisku dopiero przy kasie.',
        },
        {
          q: 'Dlaczego vouchery się kończą?',
          a: 'Każdy partner finansuje stałą pulę na miesiąc. Kiedy się wyczerpie, karta szarzeje i wraca pierwszego — dlatego te najpopularniejsze znikają wcześnie.',
        },
      ],
    },

    cta: {
      title: 'Twój następny voucher jest kilka rund stąd.',
      lede: 'Kilka minut dziennie, rozłożonych na kilka różnych gier. Zacznij dzisiaj, a seria zacznie się liczyć od razu.',
      primary: 'Play & Earn',
      secondary: 'Zobacz gry',
      note: 'Start za darmo · Dostępne w całej Polsce',
    },
  },

  /* ─────────────────────────────────────────────────────────── relocate ── */

  relocate: {
    back: 'Wróć do paylez',
    hero: {
      eyebrow: 'Przewodnik po życiu',
      lines: ['Nowy kraj.', 'Sto pytań.', 'Jeden przewodnik.'],
      lede: 'Gdzie założyć konto, jak działa kaucja, która przychodnia przyjmie Twoje ubezpieczenie i ile naprawdę są warte Twoje pieniądze w kraju. Dziewięć tematów, czternaście krajów.',
      primary: 'Otwórz przewodnik',
      secondary: 'Sprawdź kurs',
      stats: ['Tematów', 'Krajów', 'Marży na naszym kursie'],
      trust: 'Za darmo · Do czytania nie trzeba konta · Aktualizowane wraz z przepisami',
    },

    rates: {
      eyebrow: 'Ile są warte Twoje pieniądze',
      title: 'Poznaj prawdziwy kurs, zanim ktoś Ci go zaproponuje.',
      lede: 'Kurs międzybankowy dla walut, którymi ludzie stąd naprawdę się posługują, bez naszej marży na wierzchu. Paylez przelicza — nie przesyła pieniędzy — więc między Tobą a tą liczbą nie ma nic. Zapisz pary, które sprawdzasz, a otworzą się pierwsze.',
      send: 'Kwota',
      gets: 'To daje',
      rate: 'Kurs',
      swap: 'Zamień waluty miejscami',
      result: '{from} = {to}',
      enter: 'Wpisz kwotę do przeliczenia.',
      saved: 'Zapisane pary',
      savedNote: 'Przypięte na górze ekranu, więc sprawdzenie kursu to jedno dotknięcie, a nie wyszukiwanie.',
      pick: 'Waluta',
      search: 'Szukaj wśród 19 walut',
      noMatch: 'Nic nie pasuje do „{query}”.',
      names: {
        EUR: 'Euro',
        USD: 'Dolar amerykański',
        GBP: 'Funt brytyjski',
        PLN: 'Złoty polski',
        UAH: 'Hrywna ukraińska',
        RUB: 'Rubel rosyjski',
        UZS: 'Sum uzbecki',
        KZT: 'Tenge kazachskie',
        TRY: 'Lira turecka',
        CZK: 'Korona czeska',
        CHF: 'Frank szwajcarski',
        BYN: 'Rubel białoruski',
        MDL: 'Lej mołdawski',
        GEL: 'Lari gruzińskie',
        AMD: 'Dram armeński',
        AZN: 'Manat azerbejdżański',
        TMT: 'Manat turkmeński',
        KGS: 'Som kirgiski',
        TJS: 'Somoni tadżyckie',
      },
      bullets: [
        {
          title: 'Kurs międzybankowy, bez narzutu',
          body: 'Ile waluta jest warta, a nie ile ktoś za nią da. Nic tu nie jest wysyłane i za nic nie pobieramy opłaty, więc między tymi dwiema liczbami nie siedzi żadna nasza marża.',
        },
        {
          title: 'W obie strony, na jednej karcie',
          body: 'Każda para przelicza się w obie strony po tym samym kursie — dla kwoty, którą faktycznie wpisałeś, a nie dla przykładu z reklamy.',
        },
        {
          title: 'Twoje pary na górze',
          body: 'Przypnij waluty, które sprawdzasz, a za każdym razem będą na górze z już wczytanym kursem.',
        },
      ],
    },

    guide: {
      eyebrow: 'Pomoc i wskazówki',
      title: 'Dziewięć tematów. Otwórz jeden.',
      lede: 'Mieszkanie i papiery są na przedzie, bo pierwszy miesiąc jest właśnie o nich. Każdy temat otwiera się w listę miejsc, które się tym zajmują — z filtrem na Twoje miasto.',
      cities: 'Wszystkie miasta',
      city: 'Filtruj po mieście',
      count: 'Miejsc na liście: {n}',
      speaks: 'Mówią:',
      none: 'Na razie nic w tym temacie w mieście {city}. Spróbuj wszystkich miast.',
      soon: 'Ten temat wciąż powstaje. Asystent poniżej odpowie w międzyczasie.',
      items: [
        { name: 'Miejsca', blurb: 'Sklepy, restauracje i usługi warte drogi' },
        { name: 'Bankowość i finanse', blurb: 'Konta, karty, kredyt i po co komu IBAN' },
        { name: 'Mieszkanie', blurb: 'Szukanie, kaucje, umowy i meldunek' },
        { name: 'Zdrowie', blurb: 'Ubezpieczenie, zapisanie się do przychodni, nagłe przypadki' },
        { name: 'Prawo i wizy', blurb: 'Zezwolenia, pobyt, przedłużenia i dokumenty' },
        { name: 'Praca', blurb: 'Szukanie pracy, umowy i prawa, które z nich wynikają' },
        { name: 'Edukacja', blurb: 'Szkoły, uczelnie, kursy językowe i nostryfikacja' },
        { name: 'Transport', blurb: 'Bilety, karty miejskie, prawo jazdy i poruszanie się' },
        { name: 'Kultura i integracja', blurb: 'Język, zwyczaje, święta i poznawanie ludzi' },
      ],
    },

    countries: {
      eyebrow: 'Gdzie to działa',
      title: 'Czternaście krajów, a wskazówki są lokalne dla każdego.',
      lede: 'Karta pobytu w Krakowie i w Rotterdamie mają wspólną tylko nazwę. Przewodnik jest pisany dla kraju i dla miasta, a nie tłumaczony z jednego i naciągany na resztę.',
      note: 'Kolejne kraje dochodzą wtedy, gdy znajdziemy ludzi, którzy naprawdę przez tę procedurę przeszli.',
    },

    ask: {
      eyebrow: 'Kiedy przewodnik tego nie obejmuje',
      title: 'Zapytaj w swoim języku.',
      lede: 'Asystent odpowiada z tych samych materiałów, w tym z pięciu języków, w którym zapytasz — i mówi wprost, kiedy odpowiedź zależy od Twojej konkretnej sytuacji.',
      placeholder: 'Jak zameldować się w Krakowie?',
      action: 'Zapytaj',
      samples: [
        'Czego potrzebuję, żeby założyć konto w banku?',
        'Jaka kaucja za mieszkanie jest normalna?',
        'Która przychodnia przyjmuje ubezpieczenie z UE?',
      ],
    },

    cta: {
      title: 'Pierwszy miesiąc jest tym trudnym.',
      lede: 'Przeczytaj, czego potrzebujesz, zanim będzie potrzebne, miej oko na kurs i wydawaj punkty, które po drodze zbierzesz.',
      primary: 'Otwórz przewodnik',
      secondary: 'Play & Earn',
      note: 'Za darmo · Do czytania przewodnika nie trzeba konta',
    },
  },

  cta: {
    title: 'Graj. Zarabiaj. Zadomów się.',
    lede: 'Dołącz do tysięcy osób, dla których nowy kraj stał się domem — graj, zdobywaj prawdziwe nagrody i korzystaj z pomocy ekspertów na każdym kroku. Start jest darmowy.',
    primary: 'Graj i zarabiaj',
    secondary: 'Poznaj Living Guide',
  },

  contact: {
    back: 'Wróć do paylez',
    form: {
      eyebrow: 'Wyślij wiadomość',
      title: 'Napisz, co się stało.',
      lede: 'Im konkretniej, tym lepiej — który ekran, czego się spodziewałeś i co zrobiła aplikacja zamiast tego. Jeśli sprawa dotyczy konta, adres e-mail z tego konta oszczędza nam jedną wymianę wiadomości.',
      topic: 'Czego dotyczy sprawa?',
      topics: ['Pomoc', 'Opinia', 'Współpraca', 'Coś innego'],
      name: 'Imię i nazwisko',
      namePlaceholder: 'Imię i nazwisko',
      email: 'Twój e-mail',
      emailPlaceholder: 'ty@email.com',
      message: 'Wiadomość',
      messagePlaceholder: 'Co się stało i czego się spodziewałeś.',
      submit: 'Wyślij wiadomość',
      note: 'Trafia prosto do zespołu Paylez — bez aplikacji pocztowej i bez drugiego kliknięcia. Odpowiadamy na podany adres.',
      error: 'Podaj imię, adres e-mail i treść wiadomości.',
      sending: 'Wysyłanie…',
      sent: 'Mamy ją. Odpowiemy na podany adres.',
      offline: 'Nie udało się połączyć z serwerem. Spróbuj za minutę — nic z tego, co napisałeś, nie zginęło.',
      refused: 'Nie udało się wysłać. Sprawdź adres e-mail, a jeśli pisałeś już kilka razy w ciągu godziny, odczekaj chwilę.',
    },

    hours: {
      title: 'Kiedy odpowiadamy',
      body: 'Od poniedziałku do piątku, 09:00–18:00 czasu środkowoeuropejskiego. Większość wiadomości dostaje odpowiedź tego samego dnia roboczego. Na to, co przyjdzie w weekend, odpowiadamy w poniedziałek rano.',
      address: 'Kraków, Polska',
    },
  },

  legal: {
    contents: 'Spis treści',
    english:
      'Ten dokument jest publikowany w języku angielskim. Tekst angielski jest wersją wiążącą.',
    privacyVersion: 'Wersja 1.1 · Obowiązuje od 28 sierpnia 2026 · Zgodna z RODO',
    termsVersion: 'Wersja 1.0 · Obowiązuje od 24 kwietnia 2025',
  },
  profile: {
    eyebrow: 'Twoje konto',
    title: 'Twój profil',
    lede: 'To widzą inni gracze i stąd wiemy, gdzie jesteś. Nic z tego nie jest z niczym weryfikowane — nie wysyłamy kodu na telefon ani linku do kliknięcia na skrzynkę.',

    whoLegend: 'Kim jesteś',
    whereLegend: 'Gdzie jesteś i jak Cię złapać',

    photo: 'Zdjęcie',
    photoChoose: 'Wybierz zdjęcie',
    photoHelp: 'Najlepiej kwadratowe. Zmniejszamy je do miniatury i trzymamy na tym urządzeniu.',
    photoRemove: 'Usuń zdjęcie',

    username: 'Nazwa użytkownika',
    usernameHelp:
      'Litery, cyfry i pojedyncze podkreślniki, od {min} do {max} znaków. Musi być tylko Twoja — to nazwa w wierszu rankingu.',
    usernamePlaceholder: 'dilnoza',
    usernameErrors: {
      length: 'Nazwa użytkownika ma od {min} do {max} znaków.',
      shape: 'Litery, cyfry i pojedyncze podkreślniki pomiędzy nimi — nic na żadnym końcu.',
      reserved: 'Ta nazwa jest zastrzeżona.',
      taken: 'Ta nazwa jest zajęta.',
    },

    status: 'Status',
    statusHelp: 'Mniej więcej to, czym się zajmujesz. Po tym lokal wie, kto u niego siedzi.',
    statusChoose: 'Wybierz jedno',
    statusMenu: 'Status',
    occupations: {
      student: 'Uczeń lub student',
      worker: 'Pracownik',
      business: 'Właściciel firmy',
      freelancer: 'Freelancer',
      other: 'Inne',
    },

    city: 'Miasto',
    cityPlaceholder: 'Zacznij pisać nazwę miasta',
    cityHelp:
      'Zacznij pisać i wybierz z listy — Paylez zna {n} miast w Polsce, Niemczech i Uzbekistanie. Jeśli Twojego nie ma, zaznacz to i wpisz je samodzielnie.',
    cityMenu: 'Pasujące miasta',
    cityOther: 'Mojego miasta nie ma na liście',
    cityOtherHelp: 'Wpisz miasto tak, jak je nazywasz, i kraj razem z nim.',
    cityNoMatch:
      'Nic nie pasuje — zaznacz „Mojego miasta nie ma na liście” i wpisz je samodzielnie.',
    cityNeeded:
      'Wybierz miasto z listy albo zaznacz „Mojego miasta nie ma na liście” i dopisz kraj.',
    cityLoading: 'Wczytujemy listę miast…',
    cityDown: 'Podpowiedzi są niedostępne — wpisz miasto i jego kraj.',
    cityOffline:
      'Lista miast pochodzi z backendu Paylez, a on nie odpowiada. Miasto i kraj możesz wpisać samodzielnie; podpowiedzi wrócą razem z nim.',
    cityRetry: 'Spróbuj ponownie',
    country: 'Kraj',
    countryPlaceholder: 'Polska',
    countryHelp:
      'Pytamy tylko dlatego, że Twojego miasta nie ma na naszej liście. Nazwa albo dwuliterowy kod.',
    countryUnchecked:
      'Pytamy, bo nie możemy sięgnąć do listy miast, żeby sprawdzić Twoje. Nazwa albo dwuliterowy kod.',
    countryNeeded: 'Miasto, którego nie znamy, potrzebuje kraju obok siebie.',
    countries: { PL: 'Polska', DE: 'Niemcy', UZ: 'Uzbekistan' },

    phone: 'Telefon',
    phoneHelp: 'Nikt na niego nie dzwoni i nie wysyłamy na niego żadnego kodu. Tak lokal skontaktuje się z Tobą w sprawie odebranej oferty.',
    phonePlaceholder: '+48 600 000 000',
    phoneShape: 'To nie wygląda na numer telefonu.',

    birthday: 'Data urodzenia',
    birthdayUnset: 'Możesz ją ustawić raz i raz poprawić. Potem trzeba już napisać do wsparcia.',
    birthdayOneLeft: 'Możesz to poprawić jeszcze jeden raz.',
    birthdaySpent:
      'Wykorzystałeś oba zapisy. Kolejna zmiana to wiadomość do wsparcia, bo trzecia zmiana jest decyzją o tym, kim ktoś jest.',
    birthdayErrors: {
      format: 'Data urodzenia to data.',
      nonexistent: 'Taki dzień nie istnieje.',
      future: 'Data urodzenia jest w przeszłości.',
      young: 'Właściciel konta musi mieć co najmniej 13 lat.',
      old: 'Ta data urodzenia nie wygląda poprawnie.',
    },
    birthdayNoWrites: 'Datę urodzenia można poprawić raz — kolejną zmianę zgłoś do wsparcia.',

    email: 'E-mail',
    emailHelp: 'To, czym się logujesz. Zmiany tego ta wersja nie potrafi.',

    save: 'Zapisz profil',
    saved: 'Zapisano',

    cardTitle: 'Co widzą inni',
    cardNoName: 'Jeszcze bez nazwy',
    cardNoRole: 'Statusu jeszcze nie ma',
    cardNowhere: 'Jeszcze bez miasta',

    meterTitle: 'Profil',
    meterDone: 'Wszystkie siedem uzupełnione.',
    meterStill: 'Wciąż puste',
    meterProgress: 'Uzupełnione w {pct}%',
    fieldNames: {
      avatar: 'Zdjęcie',
      username: 'Nazwa użytkownika',
      occupation: 'Status',
      city: 'Miasto',
      email: 'E-mail',
      phone: 'Telefon',
      birthDate: 'Data urodzenia',
    },
  },

  onboarding: {
    step: 'Krok {n} z {total}',

    langTitle: 'Wybierz język',
    langLede: 'Możesz go później zmienić — to przełącznik w nagłówku.',
    langNext: 'Dalej',

    gameTitle: 'Jaki to kraj?',
    gameRound: 'Runda {n} z {total}',
    gamePts: 'pkt',
    gameNext: 'Dalej',
    gameLast: 'Zobacz, co wygrałeś',
    gameBack: 'Wstecz',
    gameLoading: 'Pobieramy flagi…',
    gameFailed: 'Flagi się nie wczytały.',
    gameRetry: 'Spróbuj ponownie',
    gameRight: 'Dobrze',
    gameWrong: 'Tym razem nie',

    payTitle: 'To już Twoje',
    payEarned: 'Za flagi',
    payGift: 'Prezent na start',
    payTotal: 'punktów',
    payTier: 'Pierwsza rzecz warta zachodu jest za {n} punktów.',
    payLede:
      'Punkty biorą się z grania i z pojawiania się w lokalach w Twoim mieście. Nie tracą ważności — czekają na Ciebie.',
    payGo: 'Zacznij grać',
    payProfile: 'Najpierw uzupełnij profil',
  },

  subscription: {
    eyebrow: 'Plany',
    title: 'Graj za darmo. Płać za zapas.',
    lede: 'Każdy plan gra w te same gry i wydaje w tych samych lokalach. Płatny kupuje zapas ruchu — więcej energii, więcej czasu na wydanie vouchera i więcej punktów za tę samą rundę.',
    term: {
      label: 'Na jak długo się zobowiązujesz',
      one: '1 mies.',
      many: '{n} mies.',
      save: 'Oszczędzasz {pct}%',
      rolling: 'Bez zobowiązań',
    },
    perMonth: 'miesięcznie',
    free: 'Za darmo',
    billed: {
      free: 'Za darmo tak długo, jak z niego korzystasz. Bez karty i bez okresu próbnego, który się kończy.',
      monthly: 'Rozliczane co miesiąc i przerywane, kiedy zechcesz.',
      term: 'Jednorazowo {total} za {n} mies.',
    },
    unlimited: 'Bez limitu',
    included: 'W pakiecie',
    notIncluded: 'Poza pakietem',
    badges: ['Gwiazdka', 'Korona'],
    heroRows: ['Energia dziennie', 'Odnowa, godziny', 'Punkty za rundę'],
    more: 'Wszystko inne',
    mark: 'Oznaczenie planu: {name}',
    plans: [
      { name: 'Free', note: 'Cała pętla, bez wspomagania.' },
      { name: 'Pro', note: 'Dla grającego codziennie.' },
      { name: 'Premium', note: 'Dla tego, kto wypłaca.' },
    ],
    rows: [
      'Energia na dzień',
      'Godziny na odnowienie jednej energii',
      'Punkty za rundę gry',
      'Dni ważności vouchera',
      'Podpowiedzi w Ułóż słowo dziennie',
      'Pytania do asystenta dziennie',
      'Zamrożenia serii',
      'Oferty na wyłączność',
      'Godziny przewagi przy nowej ofercie',
      'Pierwszeństwo przy kartach podarunkowych',
      'Punkty dopisywane co miesiąc',
      'Wsparcie priorytetowe',
      'Znak przy Twojej nazwie',
    ],
    action: 'Załóż konto',
    note: 'Żaden plan nie ma okresu próbnego — plan darmowy jest okresem próbnym i nigdy się nie kończy. Plan wybiera się w aplikacji, gdy masz już konto.',
  },

  footer: {
    blurb:
      'Graj i zarabiaj. Ekskluzywne oferty. Prawdziwe nagrody. Odkrywaj, oszczędzaj i zgarniaj nagrody.',
    location: 'Kraków, Polska',
    social: 'paylez na {channel}',
    columns: [
      {
        heading: 'Produkt',
        links: ['Graj i zarabiaj', 'Rabaty', 'Przeprowadzka', 'Asystent AI'],
      },
      {
        heading: 'Firma',
        links: ['Wsparcie', 'Podziel się opinią', 'Gorące okazje'],
      },
    ],
    news: {
      heading: 'Poznaj najlepsze oferty jako pierwszy',
      body: 'Jeden krótki e-mail w tygodniu — nowe okazje i oferty partnerów warte Twojego czasu.',
      success: 'Twój program pocztowy jest otwarty — wyślij wiadomość i jesteś na liście ✦',
      placeholder: 'ty@email.com',
      emailLabel: 'Adres e-mail',
      subscribe: 'Subskrybuj',
    },
    legal: '© 2026 Paylez. Wszelkie prawa zastrzeżone.',
    privacy: 'Polityka prywatności',
    terms: 'Regulamin',
  },
};
