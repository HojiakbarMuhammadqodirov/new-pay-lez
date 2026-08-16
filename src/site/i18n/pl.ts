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
    b2b: 'B2B',
    wallet: 'Portfel',
    contact: 'Kontakt',
    relocate: 'Przeprowadzka',
  },
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
    tabs: ['Usługi', 'Oferty', 'Ludzie', 'Witryna'],

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
  },

  games: {
    title: 'Gry na rozum',
    lede: 'Sprawdź się, zbieraj punkty i zamieniaj je na vouchery rabatowe.',

    score: 'Wynik',
    streak: 'Seria',
    lives: 'Życia',
    freezes: 'Zamrożenia',
    answered: 'Odpowiedzi',
    correctLabel: 'Poprawnych',
    toVoucher: 'Do vouchera',

    redeemTitle: 'Zamień punkty na nagrody',
    redeemAction: 'Odbierz teraz',

    pointsKicker: 'Twoje punkty',
    pointsUnit: '{points} pkt',
    pointsGoal: 'jeszcze {points} do następnej zniżki',
    pointsHave: 'masz już dość na zniżkę',
    pointsTarget: '{points} odblokowuje kolejną',

    statsToggle: 'Twoje statystyki',
    accuracy: 'Skuteczność',

    featured: 'Dzisiejsza gra · podtrzymuje serię',

    names: [
      'Gry na rozum',
      'Zgadnij flagę',
      'Kraj i stolica',
      'Quiz o Polsce',
      'Lot Squawka',
      'Znajdź parę',
      'Ułóż słowo',
    ],
    rule: '{questions} pytań · po {seconds} sek.',
    reward: '{mistakes} błąd dozwolony · +{points} za poprawną odpowiedź',
    start: 'Zacznij grę',
    play: 'Zagraj',
    noLives: 'Koniec żyć — wróć jutro',
    loading: 'Rozdajemy…',

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
    boardStreak: 'seria {n} dni',
    boardCorrect: 'poprawnych',
    boardPoints: 'punktów',
    boardEmpty: 'Jeszcze nikt nie gra. Bądź pierwszy!',
    boardShowAll: 'Pokaż całe top 10',
    boardShowLess: 'Pokaż mniej',

    flight: {
      rule: 'Leć tak daleko, jak zdoła Squawk · {gaps} bram zalicza rundę',
      reward: 'Jedno zderzenie kończy grę · +{points} za bramę',
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
      rule: '{pairs} par · bez zegara',
      reward: 'Mniej ruchów to więcej punktów · +{points} za parę',
      pairs: 'Pary {found} / {total}',
      moves: 'Ruchy: {n}',
      facedown: 'Zakryta karta',
      hint: 'Odkryj dwie karty. Dopasuj je, a słowo zostaje z Tobą.',
      resultScore: 'Znalezione pary: {pairs}',
    },

    wordGame: {
      rule: '{words} słów · od łatwych do trudnych',
      reward: 'Za pierwszym razem i szybko daje więcej · podpowiedź kosztuje bonus',
      list: 'Język do ćwiczenia',
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

  business: {
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
        title: 'Jeszcze żadnych skanowań',
        body: 'Każde skanowanie przy Twojej kasie pojawia się tutaj w kilka sekund — kto przyszedł, ile wydał i jak blisko jest nagrody.',
        action: 'Pobierz swój kod QR',
      },
    ],
    notWired: 'Niepodłączone w tej wersji.',

    month: 'sierpień',
    rangeLabel: 'ostatnie 30 dni',

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
            'Tylko 27 klientów sięgnęło w tym miesiącu progu 10%, bo wymaga on 600 punktów. Przy 450 punktach zakwalifikowałoby się 61 kolejnych stałych klientów.',
          action: 'Zmień próg 10%',
        },
        {
          text: 'Twoje okazje z darmowym produktem są odbierane 2,4× częściej niż rabaty procentowe.',
          detail:
            '„Darmowy przelew do wypieku” odebrano 186 razy przy 4 798 wyświetleniach. „Poranną flat white” z rabatem 20% odebrano 149 razy przy 8 412 wyświetleniach.',
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
        'Deszczowe podwójne punkty',
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
      states: { live: 'Aktywna', scheduled: 'Zaplanowana', paused: 'Wstrzymana', expired: 'Zakończona' },
      search: 'Szukaj wśród swoich okazji',
      filters: ['Wszystkie', 'Aktywne', 'Zaplanowane', 'Wstrzymane', 'Zakończone'],
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
      noLimit: 'Bez limitu odebrań',
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

      fromTitle: 'Skąd pochodzą',
      nations: ['Ukraińcy', 'Polacy', 'Białorusini', 'Gruzini', 'Turcy', 'Inni'],
      nationCount: '{n} klientów · {pct}%',
      nationHidden:
        '{n} mniejsze grupy są liczone w „innych”, więc nikogo nie da się wyłuskać.',
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

    range: 'Ostatnie 30 dni',
    notifications: 'Powiadomienia',
  },

  hero: {
    lines: ['Graj i zarabiaj.', 'Ekskluzywne oferty.'],
    lede: 'Odkrywaj, graj i zgarniaj nagrody.',
    primary: 'Graj i zarabiaj',
    secondary: 'Jak to działa',
    stats: ['Za wygraną w grze', 'Sklepów partnerskich', 'Miast dostępnych'],
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
        body: 'Skanuj kody QR partnerów w sklepie, aby odblokować punkty bonusowe i natychmiastowe vouchery — prosto z telefonu.',
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
        body: 'Zapraszaj znajomych, utrzymuj serię i pnij się w miesięcznym rankingu po większe nagrody.',
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
      stats: ['Za wygraną w grze', 'Bonus za serię', 'Wystarczy na voucher'],
    },

    steps: {
      eyebrow: 'Jak to działa',
      title: 'Cztery kroki, jakieś dwie minuty.',
      lede: 'Na tyle krótko, że starczy jazda tramwajem — i tam najczęściej się w to gra.',
      items: [
        {
          title: 'Wybierz grę',
          body: 'Stolice, flagi albo życie w Polsce. Dziesięć pytań na rundę i żadne nie zajmuje długo.',
        },
        {
          title: 'Odpowiadaj',
          body: 'Każda poprawna odpowiedź daje punkty, a szybka odpowiedź daje ich więcej — zegar jest częścią gry.',
        },
        {
          title: 'Utrzymaj serię',
          body: 'Wróć jutro. Seria mnoży wszystko, co zdobywasz, a siedem dni z rzędu to osobny bonus.',
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
      lede: 'Jedna runda co 24 godziny utrzymuje ją przy życiu. Przegapisz to okno, a seria — i punkty, które z nią zbudowałeś — wracają do zera, chyba że masz zamrożenie. Zamrożenie pokrywa jeden opuszczony dzień, dostajesz je co siódmy dzień i możesz mieć dwa. To cała zasada.',
      card: {
        label: 'Aktualna seria',
        unit: 'dni',
        reward: '+250 pkt siódmego dnia',
        freeze: 'Zamrożenia w zapasie · każde pokrywa jeden opuszczony dzień',
      },
      benefits: [
        {
          title: 'Dzień trzeci: 1,5×',
          body: 'Każdy zdobyty punkt jest wart o połowę więcej, we wszystkich grach na tej stronie.',
        },
        {
          title: 'Dzień siódmy: 250 pkt',
          body: 'Stały bonus ponad mnożnik, wypłacany w chwili zakończenia siódmej rundy.',
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
      lede: 'Pierwszego dnia miesiąca wszyscy zaczynają od zera. Najlepsza trójka dzieli pulę nagród; reszta zaczyna kolejny miesiąc na tych samych zasadach.',
      columns: { rank: '#', player: 'Gracz', points: 'Punkty' },
      note: 'Przykładowy ranking — Twój zeruje się 1. dnia miesiąca.',
    },

    faq: {
      eyebrow: 'Pytania',
      title: 'Krótkie odpowiedzi.',
      items: [
        {
          q: 'Czy punkty tracą ważność?',
          a: 'Tak. Zagraj co najmniej jedną rundę w ciągu 24 godzin, żeby je zachować — przegapisz to okno, a punkty i seria wracają do zera.',
        },
        {
          q: 'Ile rund mogę zagrać dziennie?',
          a: 'Tyle, na ile pozwalają Twoje życia. Każda runda kosztuje jedno życie, a życia odnawiają się z czasem — nie ma więc dziennego limitu, jest tylko tyle, ile Ci zostało.',
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
    hero: {
      eyebrow: 'Analityka partnera',
      lines: ['Każde skanowanie,', 'rozliczone.'],
      lede: 'Podaj swój Service ID i zobacz, co naprawdę zrobiła kampania — wyświetlenia, kliknięcia, realizacje i ich wartość, dla każdej prowadzonej oferty.',
      primary: 'Otwórz panel',
      secondary: 'Zobacz, co dostajesz',
      idLabel: 'Service ID',
      idNote: 'Twój unikalny identyfikator — znajdziesz go w umowie partnerskiej.',
      idAction: 'Pokaż analitykę',
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
      lede: 'Każda oferta partnerska zbiera te dane od dnia uruchomienia. Podaj Service ID, a panel jest na miejscu.',
      primary: 'Otwórz panel',
      secondary: 'Porozmawiajmy o współpracy',
      note: 'W każdym koncie partnera · Bez dodatkowej opłaty',
    },
  },

  /* ──────────────────────────────────────────────────────────────── b2b ── */

  b2b: {
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
              body: 'Push, oferty czasowe, kody promocyjne, karty podarunkowe, bonusy punktowe i e-mail.',
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
          body: 'Pełne narzędzia marketingowe, logowania dla lokali i bonusy punktowe.',
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
          body: 'Trzy punktowane rundy dziennie w trzech grach. Każda poprawna odpowiedź to punkty, a seria jest warta więcej niż jeden dobry dzień.',
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
          title: 'Punkty przepadają, jeśli przestaniesz grać',
          body: 'Zagraj co najmniej jedną rundę w ciągu 24 godzin, a punkty i seria lecą dalej. Przegapisz to okno i oba wracają do zera. Odebrane już vouchery mają własną datę ważności, wypisaną na karcie, zanim cokolwiek wydasz.',
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
      title: 'Twój następny voucher jest jakieś cztery minuty stąd.',
      lede: 'To trzy rundy pytań. Zacznij dzisiaj, a seria zacznie się liczyć od razu.',
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
    hero: {
      eyebrow: 'Kontakt',
      lines: ['Zapytaj o wszystko.', 'Odpowie człowiek.'],
      lede: 'Pomoc, współpraca, błąd albo coś, co przewodnik podaje źle — wszystko trafia do tego samego małego zespołu w Krakowie. Czytamy każdą wiadomość po polsku, angielsku, ukraińsku, rosyjsku i uzbecku.',
      stats: ['Dzień roboczy na odpowiedź', 'Języki obsługi', 'Sposoby kontaktu'],
    },

    channels: {
      eyebrow: 'Gdzie nas znaleźć',
      title: 'Cztery drogi do nas — i żadna nie jest kolejką zgłoszeń.',
      lede: 'Wybierz tę, która pasuje do sprawy. Dwie skrzynki trafiają do różnych osób i tak ma być: pytanie o wdrożenie to nie zgłoszenie pomocy technicznej i żadne z nich nie powinno czekać za drugim.',
      items: [
        {
          name: 'Pomoc',
          blurb: 'Punkty, które nie dotarły, voucher, którego nie dało się zeskanować, konto, do którego nie możesz wrócić. Wszystko, co dotyczy korzystania z paylez.',
          action: 'Napisz do pomocy',
        },
        {
          name: 'Współpraca',
          blurb: 'Prowadzisz lokal albo kilka i chcesz wiedzieć, jak wygląda wdrożenie paylez. Cennik, uruchomienie, pytania o POS.',
          action: 'Napisz do zespołu',
        },
        {
          name: 'YouTube',
          blurb: 'Jak działają gry, jak lokal się konfiguruje i co nowego — te same wyjaśnienia w formie, którą można obejrzeć zamiast czytać.',
          action: 'Oglądaj',
        },
        {
          name: 'Instagram',
          blurb: 'Nowe lokale, nowe vouchery i oferty, które szybko znikają. Najszybszy sposób, żeby zobaczyć, co pojawiło się w tym tygodniu.',
          action: 'Obserwuj',
        },
      ],
    },

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
      submit: 'Otwórz w programie pocztowym',
      note: 'Nic nie jest zapisywane na tej stronie. Przycisk otwiera Twój własny program pocztowy z gotową, zaadresowaną wiadomością — wysyłasz ją Ty.',
      error: 'Podaj imię, adres e-mail i treść wiadomości.',
    },

    hours: {
      title: 'Kiedy odpowiadamy',
      body: 'Od poniedziałku do piątku, 09:00–18:00 czasu środkowoeuropejskiego. Większość wiadomości dostaje odpowiedź tego samego dnia roboczego. Na to, co przyjdzie w weekend, odpowiadamy w poniedziałek rano.',
      address: 'Kraków, Polska',
    },
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
      body: 'Jeden krótki e-mail w tygodniu — nowe okazje i mnożniki punktów warte Twojego czasu.',
      success: 'Jesteś na liście — sprawdzaj skrzynkę ✦',
      placeholder: 'ty@email.com',
      emailLabel: 'Adres e-mail',
      subscribe: 'Subskrybuj',
    },
    legal: '© 2026 Paylez. Wszelkie prawa zastrzeżone.',
    privacy: 'Polityka prywatności',
    terms: 'Regulamin',
  },
};
