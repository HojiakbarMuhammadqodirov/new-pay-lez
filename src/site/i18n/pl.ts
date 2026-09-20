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

  seo: {
    site: 'Paylez — Graj i zarabiaj',
    description:
      'Graj w szybkie gry, zbieraj punkty i wymieniaj je na prawdziwe vouchery w sklepach w Twoim mieście.',
    pages: {
      landing: {
        title: 'Paylez — Graj i zarabiaj. Ekskluzywne oferty w Twoim mieście.',
        description:
          'Odkrywaj, graj i zgarniaj nagrody. Kilka szybkich pytań dziennie, punkty za każdą rundę i vouchery w sklepach partnerskich w Twoim mieście.',
      },
      learn: {
        title: 'L-Earn: graj w quizy, zdobywaj prawdziwe vouchery — Paylez',
        description:
          'Kilka szybkich pytań dziennie. Osiem gier, punkty za każdą rundę i vouchery w sklepach, z których i tak korzystasz. Za darmo, bez danych karty.',
      },
      business: {
        title: 'Paylez dla firm: zamień każdą wizytę w nawyk',
        description:
          'Lojalność, vouchery, marketing i raporty na jednym rekordzie klienta, a Twoja oferta siedzi w grze otwieranej każdego ranka. Płacisz dopiero za realizację.',
      },
      vouchers: {
        title: 'Vouchery: wydaj punkty na coś prawdziwego — Paylez',
        description:
          'Każdy zdobyty voucher trafia do jednego portfela: karty podarunkowe i rabaty w sklepach, z których i tak korzystasz, realizowane kodem QR przy kasie.',
      },
      relocate: {
        title: 'Relocate: przewodnik po życiu w nowym kraju — Paylez',
        description:
          'Gdzie założyć konto, jak działa kaucja, która przychodnia przyjmie Twoje ubezpieczenie i ile naprawdę są warte Twoje pieniądze. Dziewięć tematów, czternaście krajów.',
      },
      contact: {
        title: 'Kontakt — Paylez',
        description:
          'Pytania o punkty, wizytówkę lokalu albo współpracę? Napisz, który ekran i co się stało, a my wrócimy z odpowiedzią.',
      },
      privacy: {
        title: 'Polityka prywatności — Paylez',
        description:
          'Jak Paylez zbiera, wykorzystuje i chroni Twoje dane osobowe, jakie masz do nich prawa zgodnie z RODO i jak z nich skorzystać.',
      },
      terms: {
        title: 'Regulamin — Paylez',
        description:
          'Warunki korzystania z Paylez: Twoje konto, Twoje punkty, vouchery i sposób ich realizacji oraz zasady dla lokali partnerskich.',
      },
    },
  },

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
  currencyMenu: 'Waluta',
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
    showPassword: 'Pokaż hasło',
    hidePassword: 'Ukryj hasło',
    passwordPlaceholder: 'Twoje hasło',
    submit: 'Zaloguj się',
    errors: {
      email: 'Nie mamy konta z tym adresem e-mail.',
      password: 'To hasło się nie zgadza.',
      empty: 'Podaj adres e-mail i hasło.',
      offline: 'Nie udało się połączyć z serwerem. To nie jest błąd w tym, co wpisałeś — spróbuj za minutę.',
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
    agreeLead: 'Akceptuję',
    agreeTerms: 'Regulamin',
    agreeAnd: 'oraz',
    agreePrivacy: 'Politykę prywatności',
    agreeTail: '.',
    orDivider: 'lub',
    googleContinue: 'Kontynuuj z Google',
    googleWorking: 'Logowanie…',
    googleUnreachable:
      'Logowanie Google jest chwilowo niedostępne. Użyj adresu e-mail i hasła poniżej.',
    googleRefused:
      'Nie udało się zalogować przez Google. Spróbuj ponownie.',
    signUpErrors: {
      terms: 'Zaakceptuj Regulamin i Politykę prywatności.',
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
    cancel: 'Anuluj',
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
      'Lokale',
      'Aktywne lokale',
      'Aktywne oferty',
      'Karty w magazynie',
      'Konta',
    ],
    tabs: ['Usługi', 'Oferty', 'Ludzie', 'Witryna', 'Wiadomości', 'Plany'],

    tiers: {
      assignTitle: 'Przypisz konto do planu',
      assignLede:
        'Nadaj lub zdejmij plan ręcznie, teraz albo od wybranego dnia. Każda zmiana zostawia wpis w audycie z Twoim nazwiskiem.',
      subjectKind: 'Lokal albo osoba',
      aVenue: 'Lokal',
      aPerson: 'Osoba',
      venueId: 'Id lokalu',
      userId: 'Id konta',
      idHelp: 'Skopiuj je z zakładki Usługi albo Osoby.',
      plan: 'Plan',
      pickPlan: 'Wybierz plan…',
      from: 'Wchodzi w życie',
      fromNow: 'Dziś — obowiązuje od chwili naciśnięcia.',
      fromLater: 'Zaplanowane. Nic się nie zmieni, dopóki nie zacznie się ten dzień.',
      note: 'Dlaczego',
      notePlaceholder: 'Rozmowa z właścicielem',
      noteHelp: 'Zapisane we wpisie audytu. To jedyna rzecz, której wiersz nie powie sam.',
      assign: 'Przypisz plan',
      schedule: 'Zaplanuj',
      working: 'Pracuję…',
      didAssign: 'Na planie {plan} od teraz.',
      didSchedule: 'Na planie {plan} od {from}.',
      propagation:
        'Serwer od razu odpowiada nowym planem — między nim a bramkami nie ma żadnego cache. Przeglądarka, którą ta osoba ma już otwartą, dogoni to przy następnym wczytaniu strony albo powrocie do karty.',
      liveTitle: 'Kto ma jaki plan',
      liveLede: 'Każdy plan obowiązujący teraz, niezależnie od tego, kto go nadał.',
      loading: 'Czytam subskrypcje…',
      noneLive: {
        title: 'Nikt nie ma płatnego planu',
        body: 'Każde konto jest na darmowym planie swojej drabinki — tam wszyscy zaczynają. Plan kupiony w kasie też się tu pojawi, nie tylko nadany ręcznie.',
      },
      scheduledTitle: 'Zmiany z datą',
      scheduledLede: 'Jeszcze nie obowiązują. Każda wchodzi w życie z początkiem swojego dnia.',
      columns: ['Konto', 'Plan', 'Nadane przez', 'Od', 'Do'],
      act: 'Usuń',
      drop: 'Usuń',
      sources: {
        manual: 'Ręcznie',
        stripe: 'Stripe',
        apple: 'App Store',
        google: 'Play',
      },
    },

    services: {
      title: 'Usługi biznesowe',
      lede: 'Każdy lokal na serwerze. Otwórz jeden, aby zobaczyć, co jest o nim mierzone.',
      serviceId: 'ID usługi',
      copy: 'Kopiuj',
      copied: 'Skopiowano',
      analytics: 'Analityka',
      active: 'Aktywna',
      paused: 'Wstrzymana',
      live: 'Prawdziwa wizytówka',
      none: {
        title: 'Nie ma jeszcze lokali',
        body: 'Lokal pojawia się tutaj, gdy właściciel wypełni wizytówkę. Zweryfikuj go w zakładce „Ludzie”, a jego oferty będą mogły wejść na antenę.',
      },
    },

    deals: {
      title: 'Oferty i karty podarunkowe',
      lede: 'Wszystkie oferty platformy i cała półka z kartami podarunkowymi — łącznie ze wstrzymanymi ofertami i szkicami, których katalog klienta pokazać nie może.',
      kinds: { gift: 'Karta podarunkowa', deal: 'Gorąca oferta' },
      until: 'Do {date}',
      cost: '{n} pkt',
      stock: '{n} w magazynie',
      states: {
        draft: 'Szkic',
        scheduled: 'Zaplanowana',
        live: 'Aktywna',
        paused: 'Wstrzymana',
        expired: 'Wygasła',
      } as Record<string, string>,
      untitled: 'Bez tytułu',
      none: {
        title: 'Nie ma jeszcze ofert',
        body: 'Gorące oferty przychodzą od zweryfikowanych lokali; karty podarunkowe wystawia platforma.',
      },
    },

    manage: {
      working: 'Chwileczkę…',
      cancel: 'Anuluj',
      dismiss: 'Zamknij',
      failed: 'To się nie udało.',


      suspend: 'Zawieś',
      restore: 'Przywróć',

      pause: 'Wstrzymaj',
      resume: 'Wznów',
      cardRemoved: 'Zdjęte z półki.',
      cardDelisted:
        'Zdjęte z półki, ale wiersz zostaje: {n} takich kart już kupiono, a kody w tych portfelach muszą dalej wskazywać markę.',

      ban: 'Zawieś',
      letBackIn: 'Przywróć dostęp',
      password: 'Hasło',
      passwordFor: 'Ustaw hasło dla: {who}',
      passwordBody:
        'Może się nim zalogować od razu, a wszystkie urządzenia, na których jest zalogowany, zostaną wylogowane. Sposób pierwotnej rejestracji się nie zmienia.',
      newPassword: 'Nowe hasło',
      passwordHelp: 'Co najmniej {n} znaków. Przekaż je osobiście — nic tutaj nigdzie go nie wysyła.',
      setPassword: 'Ustaw',
      passwordSet: 'Hasło ustawione. Wszystkie sesje tego konta zostały wylogowane.',
      operatorRow: 'Operator',
      closedRow: 'Zamknięte',

      edit: 'Edytuj',
      editOn: 'Zakończ edycję',
      editHint: 'Każdy wiersz można poprawić lub usunąć.',
      editRow: 'Edytuj',
      deleteRow: 'Usuń',
      save: 'Zapisz',
      saved: 'Zapisano.',

      deleteTitle: 'Usunąć {what}?',
      deleteVenue:
        'Lokal i wszystko, co do niego należy — oferty, kampanie, budżety, tagi i wizyty — zostaną usunięte z bazy danych. Zawieszenie to wersja odwracalna.',
      deleteDeal:
        'Oferta oraz zebrane przez nią wyświetlenia i odbiory zostaną usunięte z bazy danych. Wstrzymanie to wersja odwracalna.',
      deleteUser:
        'Imię, adres i profil zostaną wymazane. Jeśli konto nigdy nic nie zarobiło ani nie wydało, zniknie też jego wiersz; jeśli zarobiło, zostanie jako anonimowe wiersze, bo rachunki lokalu muszą się dalej zgadzać.',
      deleteCard: 'Marka znika z półki.',
      deleteYes: 'Tak, usuń',
      deleted: 'Usunięto: {what}.',
      venueDeleted: 'Lokal usunięty. Zniknęło z nim {n} ofert.',
      userDeleted: 'Konto zamknięte — nie został po nim żaden wiersz.',
      userAnonymised:
        'Konto zamknięte. Jego wiersze zostają, anonimowe, bo rachunki lokalu są z nich wyliczane.',

      fields: {
        name: 'Nazwa',
        city: 'Miasto',
        country: 'Kraj',
        category: 'Kategoria',
        address: 'Adres',
        phone: 'Telefon',
        email: 'E-mail',
        title: 'Tytuł',
        description: 'Opis',
        terms: 'Warunki',
        until: 'Trwa do',
        occupation: 'Status',
      },
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

    note: 'Każda liczba w tej konsoli jest odczytana z serwera i nic tutaj nie jest wpisane z góry. To, co ten ekran może zmienić, może tylko zabrać albo oddać: lokal, ofertę, konto, hasło. Żadnej liczby, na którą ktoś się powołuje, nie da się stąd edytować, a każde naciśnięcie trafia do dziennika audytu z Twoim nazwiskiem.',

    /* ── czwarta zakładka: sama witryna, jedyna pytająca serwer ── */
    database: {
      title: 'Na serwerze',
      lede: 'Wszyscy zarejestrowani i wszystkie lokale na platformie. To żywa baza danych, nie ta przeglądarka.',
      switch: 'Którą tabelę pokazać',
      counts: { users: 'aktywne konta', venues: 'aktywne lokale', issued: 'przyznane punkty' },
      tables: { users: 'Ludzie', venues: 'Lokale' },
      userColumns: ['Imię i nazwisko', 'E-mail', 'Rejestracja przez', 'Miasto', 'Punkty', 'Status', 'Dołączył', 'Działania'],
      venueColumns: ['Lokal', 'Miasto', 'Kategoria', 'Właściciel', 'Wizyty', 'Zweryfikowany'],
      review: {
        title: 'Czeka na Ciebie',
        lede: 'Te lokale skończyły wizytówkę i nie mogą opublikować oferty, dopóki ktoś ich nie sprawdzi.',
        approve: 'Zweryfikuj',
        reject: 'Odrzuć',
      },
      unnamed: 'Bez nazwy',
      verified: 'Zweryfikowany',
      unverified: 'Jeszcze nie',
      noUsers: 'Nikt się jeszcze nie zarejestrował.',
      noVenues: 'Brak lokali.',
      note: 'Pokazano {n} kont. Zawieszenie konta, jego zamknięcie i ustawienie hasła trafiają do dziennika audytu z Twoim nazwiskiem — a własnego wiersza operatora nie da się stąd zmienić w ogóle.',
    },
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

        expired: {
          title: 'Sesja wygasła',
          body: 'Zaloguj się ponownie, a konsola wróci tam, gdzie była.',
          again: 'Zaloguj się',
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
    thinking: 'Myślę…',
    limitReached:
      'To już wszystkie pytania na dziś. Limit odnawia się jutro, a płatny plan go podnosi.',
    offline: 'Nie udało mi się połączyć z serwerem, więc jeszcze nie odpowiedziałem.',
    failed: 'To nie przeszło.',
    retry: 'Zapytaj ponownie',
  },

  wallet: {
    title: 'Twoje vouchery',
    lede: 'Wszystko, co zdobyłeś, i wszystko, co wydałeś.',
    balance: 'Saldo',
    points: 'pkt',
    shortBy: 'Do kolejnej karty podarunkowej brakuje {n} punktów',
    canRedeem: 'Wystarczy na kartę podarunkową',
    noShelf: 'Na półce nie ma jeszcze nic — punkty nigdzie nie znikną.',

    loading: 'Pytamy serwer…',

    down: {
      unreachable: 'Nie udało się połączyć z serwerem, więc to nie jest „nic” — to „nie udało się zapytać”. Spróbuj za chwilę.',
      refused: 'Serwer odpowiedział, ale odrzucił żądanie. Zwykle pomaga ponowne zalogowanie.',
      retry: 'Spróbuj ponownie',
    },

    tabs: ['Aktywne', 'Wykorzystane'],

    valid: 'Ważny do {date}',
    cost: '{n} pkt',

    emptyActive: 'Nic tu jeszcze nie ma. Zagraj rundę i wydaj punkty tutaj.',
    emptyUsed: 'Nic jeszcze nie wykorzystano.',
    play: 'Zagraj rundę',

    voucherTitle: 'Voucher rabatowy',
    noVouchers: 'Nie masz jeszcze voucherów. Wydaje je lokal, gdy wydasz tam punkty.',

    catalogue: 'Co możesz dostać',
    catalogueLede: 'Karty podarunkowe za punkty. Tutaj jest to, co platforma faktycznie ma w magazynie.',
    redeem: 'Odbierz',
    short: 'Za mało punktów',
    soldOut: 'Brak w magazynie',
    left: 'zostało {n}',
    buying: 'Kupujemy…',
    buyFailed: 'Nie udało się i nic nie zostało pobrane. Spróbuj ponownie.',
    priorityOnly: 'Tylko w planie płatnym',
    noShelfYet: 'Nie ma jeszcze kart podarunkowych. Punkty zostają — lista wypełni się, gdy dołączą marki.',

    atCounter: 'Kod odczytuje się przy kasie. Nic tutaj nie jest wydane, dopóki ktoś go nie zeskanuje.',

    stamps: {
      title: 'Karty pieczątek',
      lede: 'Każda karta liczy wizyty w jednym lokalu. Wizyty to nie punkty i nie można ich wydać gdzie indziej.',
      progress: '{done} z {of}',
      empty: 'Jeszcze bez wizyt — {of} wizyt daje {reward}',
      going: 'Jeszcze {left} do {reward}',
      goingOne: 'Jeszcze jedna wizyta do {reward}',
      full: 'Komplet — {reward} czeka przy kasie',
      cycles: 'Wypełniona {n}× wcześniej',
      none: 'Nie masz jeszcze kart pieczątek. Pierwsza zaczyna się przy pierwszej zeskanowanej wizycie w lokalu z kartą.',
    },

    deals: {
      title: 'Gorące oferty',
      lede: 'Oferty lokali w pobliżu. Większość nie kosztuje nic — płaci za nie lokal.',

      all: 'Wszystkie',
      filter: 'Filtruj według kategorii',
      noneHere: 'W kategorii {category} nie ma teraz nic.',
      showAll: 'Pokaż wszystkie oferty',
      noneAtAll: 'Nie ma jeszcze aktywnych ofert. Pojawią się, gdy lokale dołączą i je opublikują.',

      until: 'Do {date}',
      free: 'Za darmo',
      shortBy: 'Brakuje jeszcze {n} punktów',
      code: 'Twój kod',

      howToClaim: 'Jak odebrać',
      hideTerms: 'Zamknij',
      claimAtCounter: 'Pokaż ofertę przy kasie, a lokal ją zeskanuje. To właśnie ten skan jest odebraniem — żadna strona internetowa go nie zastąpi.',
    },

    redeemed: {
      title: 'Odebrane',
      lede: 'To, co już wziąłeś. Pokaż kod przy kasie — każdy działa tylko raz.',
      vouchersTitle: 'Vouchery rabatowe',
      vouchersLede: 'Punkty wydane w jednym lokalu. Lokal odczytuje kod przy kasie.',
    },

    giftsTitle: 'Karty podarunkowe',
    giftsLede: 'Opłacone przez Paylez. Stała kwota, wydawana jak pieniądze w miejscu na karcie.',

    counter: {
      title: 'Twój kod przy kasie',
      lede: 'Obsługa wpisuje go przy kasie, żeby zapisać Twoją wizytę.',
      none: 'Nie masz jeszcze nazwy użytkownika — to właśnie ją obsługa wpisuje przy kasie. Wybierz ją w profilu.',
      setUp: 'Wybierz nazwę użytkownika',
    },

    code: {
      show: 'Pokaż ten kod przy kasie',
      copy: 'Kopiuj',
      copied: 'Skopiowano',
      copyLabel: 'Kopiuj {code}',
    },

    see: 'Zobacz lokal',

    places: {
      title: 'Lokale w pobliżu',
      lede: 'Lokale na Paylez w mieście {city}. Otwórz jeden, żeby zobaczyć, co tam dostaniesz za punkty.',
      noCity: 'Dodaj swoje miasto w profilu, a pojawią się tu lokale z tego miasta.',
      setCity: 'Dodaj miasto',
      none: 'Żaden lokal w mieście {city} jeszcze nie dołączył. Pojawią się tutaj, gdy się zarejestrują i przejdą weryfikację.',
      vouchers: 'Przyjmuje vouchery',
    },

    rewards: {
      title: 'Nagrody',
      lede: 'Zdobyte za wypełnioną kartę pieczątek. Pokaż kod, a lokal wyda nagrodę.',
      none: 'Nie masz jeszcze nagród. Pełna karta pieczątek daje jedną.',
    },

    sheet: {
      close: 'Zamknij',
      loading: 'Pytamy serwer…',
      unreachable: 'Nie udało się połączyć z serwerem, więc nie możemy teraz pokazać tego lokalu.',
      refused: 'Serwer odpowiedział, ale nie pokazał tego lokalu.',
      gone: 'Tego lokalu nie ma już na liście.',
      retry: 'Spróbuj ponownie',

      hoursToday: 'Dziś: {from}–{to}',
      closedToday: 'Dziś zamknięte',
      hoursOn: '{day}: {from}–{to}',
      closedOn: '{day}: zamknięte',

      ladder: 'Vouchery w tym lokalu',
      ladderLede: 'Wymień punkty na rabat w tym lokalu. Obsługa odliczy go od rachunku.',
      tier: '{pct}% zniżki, do {cap}',
      get: 'Odbierz za {points} pkt',
      getting: 'Odbieramy…',
      short: 'Brakuje {n} pkt',
      notIssued: 'Obecnie niewydawany',
      noVouchers: 'Ten lokal obecnie nie przyjmuje voucherów.',
      got: 'Twój voucher jest gotowy',

      failed: {
        insufficientBy: 'Na ten voucher brakuje Ci {n} pkt, więc nic nie zostało pobrane.',
        insufficient: 'Masz za mało punktów na ten voucher, więc nic nie zostało pobrane.',
        exhausted: 'Lokal właśnie przestał wydawać ten voucher. Nic nie zostało pobrane.',
        closed: 'Ten lokal nie przyjmuje teraz voucherów. Nic nie zostało pobrane.',
        gone: 'Ten voucher nie jest już tu oferowany. Nic nie zostało pobrane.',
        signedOut: 'Sesja wygasła. Zaloguj się ponownie, aby odebrać voucher.',
        unreachable: 'Nie udało się połączyć z serwerem, więc nie wiemy, czy to przeszło. Ponowna próba nie pobierze punktów dwa razy.',
        other: 'Nie udało się i nic nie zostało pobrane.',
      },

      stamps: 'Twoje karty pieczątek tutaj',
      rewards: 'Twoje nagrody tutaj',
      deals: 'Aktywne oferty tutaj',

      share: 'Udostępnij mój profil lokalowi {venue}',
      shareWhat: 'Gdy to jest włączone, {venue} widzi Twoje imię i zdjęcie oraz Twoje wizyty i wydatki w tym lokalu — nigdy Twoich punktów i nic o innych miejscach. Możesz to wyłączyć w każdej chwili.',
      shareFailed: 'Nie udało się zapisać. Spróbuj za chwilę.',
    },
  },

  games: {
    title: 'Gry na rozum',
    lede: 'Sprawdź się, zbieraj punkty i zamieniaj je na vouchery rabatowe.',

    score: 'Wynik',
    streak: 'Seria',
    energy: 'Energia',
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

    /* ── dzisiejsza lista ── Zobacz `en.ts` po uzasadnienie. */
    tasks: {
      title: 'Dzisiejsza lista',
      allDone: 'Wszystko z dzisiejszej listy jest zrobione. Graj dalej po punkty.',
      loading: 'Pobieramy dzisiejszą listę…',
      offline: 'Dzisiejsza lista jest teraz niedostępna.',
      exact: '{points} pkt',
      upTo: 'do {points} pkt',
      checkIn: 'Wejdź dziś do Paylez i odbierz obecność — {reward}',
      playRound: 'Zagraj dziś jedną rundę — {reward}',
      profile: 'Uzupełnij profil — {reward}',
      invite: 'Zaproś znajomego — {reward}, gdy odwiedzi lokal',
    },
    accuracy: 'Skuteczność',

    featured: 'Gra dnia · podtrzymuje serię',

    /* Keyed by country code, not a template: the country's case changes with
       the sentence around it, so each name is written whole. */
    localQuiz: { PL: 'Quiz o Polsce', UZ: 'Quiz o Uzbekistanie' },

    streakHint: 'Jedna runda dziennie ją podtrzymuje',
    freezesHint: 'Każde pokrywa jeden opuszczony dzień',
    streakKept: 'zaliczone',
    streakMissed: 'opuszczone',
    streakAhead: 'jeszcze przed nami',

    names: [
      'Lot Squawka',
      'Znajdź parę',
      'Zgadnij flagę',
      'Kraj i stolica',
      'Gry na rozum',
      'Quiz lokalny',
      'Ułóż słowo · Angielski',
      'Ułóż słowo · {language}',
    ],
    rule: '{questions} pytań · po {seconds} sek.',
    reward: '+{points} za poprawną odpowiedź · +{bonus} za szybki komplet',
    start: 'Zacznij grę',
    play: 'Zagraj',
    noEnergy: 'Koniec energii',
    practice: 'Trening',
    practiceFree: 'Dopóki energia się odnawia, rundy są za darmo — po prostu nie dają punktów.',
    practiceRound: 'Runda treningowa — bez punktów',
    practiceResult: 'Runda treningowa — nic nie zapisano. Kolejna energia znów płaci.',
    energyFull: 'Pełna — nie ma na co czekać',
    energyNext: '+1 za {time}',
    energyCost: '1 na rundę',
    loading: 'Rozdajemy…',
    startFailed: 'Nie udało się rozpocząć tej rundy. Spróbuj ponownie za chwilę.',

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
      /* One sample per local bank — the card is a different quiz per country.
         The Uzbekistan row is the export's own, already written in every
         language, so it is transcribed rather than translated. */
      local: {
        PL: {
          q: 'Jaka jest waluta Polski?',
          options: ['Złoty', 'Euro', 'Korona'],
        },
        UZ: {
          q: 'Z iloma krajami Uzbekistan graniczy lądowo?',
          options: ['Pięcioma', 'Trzema', 'Siedmioma'],
        },
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
      boardScopes: ['Mój kraj', 'Wszyscy'],
      boardLoading: 'Wczytujemy ranking…',
      boardOffline: 'Nie możemy teraz pobrać rankingu. To nie znaczy, że nikt nie gra — po prostu nie możemy zapytać.',
      boardHidden: 'Jesteś na {rank} miejscu w tym tygodniu. Nie jesteś na liście, bo tego nie włączyłeś — możesz to zrobić w profilu.',
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
      rule: 'Leć tak daleko, jak zdoła Squawk · z czasem przyspiesza',
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
      rule: '{pairs} par · liczy się czas',
      reward: 'Poniżej {seconds} sek. daje {points} · wolniej mniej punktów',
      pairs: 'Pary {found} / {total}',
      moves: 'Ruchy: {n}',
      facedown: 'Zakryta karta',
      turning: 'Odkrywanie…',
      hint: 'Odkryj dwie karty. Dopasuj je, a słowo zostaje z Tobą.',
      serverHint: 'Odkryj dwie karty. Obie strony są widoczne — zapamiętaj, gdzie były.',
      resultScore: 'Znalezione pary: {pairs}',
    },

    wordGame: {
      rule: '{words} słów · od łatwych do trudnych',
      reward: 'Słowo daje swój poziom · podpowiedź dzieli to na pół',
      lists: { pl: 'Polski', en: 'Angielski', ru: 'Rosyjski' },
      tier: 'Poziom {n}',
      undo: 'Cofnij',
      clear: 'Wyczyść',
      reveal: 'Podpowiedź',
      next: 'Następne słowo',
      finish: 'Zobacz wynik',
      correct: 'Dobrze · +{points} punktów',
      resultScore: 'Ułożone słowa: {solved} z {total}',
      checking: 'Sprawdzamy…',
      hintsSpent: 'Na dziś nie ma już podpowiedzi',
      unsent: 'To do nas nie dotarło',
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

    view: {
      edit: 'Edytuj',
      cancel: 'Anuluj',
      saving: 'Zapisywanie…',
      saved: 'Wizytówka zapisana.',
      savedDevice:
        'Zapisano tylko na tym urządzeniu — nie udało się połączyć z serwerem. Zapisz ponownie, gdy wrócisz do sieci.',
      refused: 'Serwer tego nie przyjął: {why}',
      notAdded: 'Jeszcze nie dodano',
      about: 'O firmie',
      where: 'Gdzie Cię znaleźć',
      reach: 'Jak klienci mogą się z Tobą skontaktować',
      openMaps: 'Otwórz w Mapach Google',
      status: {
        live: 'Widoczna w aplikacji',
        review: 'Czeka na weryfikację',
        draft: 'Szkic',
        rejected: 'Nie zatwierdzono',
        suspended: 'Zawieszona',
        archived: 'W archiwum',
      },
      statusNote: {
        live: 'Klienci znajdą Cię w aplikacji Paylez.',
        review: 'Sprawdzamy Twój lokal. Oferty mogą ruszyć, gdy zostanie zatwierdzony.',
        draft: 'Jeszcze nie ma Cię w aplikacji. Zapisz wizytówkę, żeby wysłać ją do weryfikacji.',
        rejected: 'Twoja wizytówka nie została zatwierdzona. Napisz do nas, a powiemy, co zmienić.',
        suspended: 'Twoja wizytówka jest ukryta przed klientami. Napisz do nas, żeby dowiedzieć się dlaczego.',
        archived: 'Twoja wizytówka nie jest już pokazywana klientom.',
      },
      statusChecking: 'Sprawdzamy, czy wizytówka jest widoczna…',
      statusUnknown: 'Nie udało się połączyć z serwerem, żeby sprawdzić, czy wizytówka jest widoczna.',
      statusLocal:
        'Ta wizytówka jest na razie tylko na tym urządzeniu — trafi do aplikacji, gdy zapiszesz ją z dostępem do sieci.',
      readyDone: 'Wszystkie wymagane pola są uzupełnione.',
      logoKept: 'Obecne logo zostaje. Wybierz plik, żeby je zmienić.',
    },
  },

  dashboard: {
    tag: 'Partner',
    groups: { grow: 'Rozwój', workspace: 'Obszar roboczy' },
    screens: [
      { name: 'Przegląd', lede: 'Co Paylez dla Ciebie zrobił i ile to kosztowało.' },
      { name: 'Gorące okazje', lede: 'Czasowe oferty pokazywane w kanale aplikacji Paylez.' },
      { name: 'Kampanie lojalnościowe', lede: 'Powtarzalne nagrody, na które zapracowują stali klienci.' },
      { name: 'Vouchery', lede: 'Jak punkty zamieniają się w rabaty i ile Cię to kosztuje.' },
      { name: 'Wydane vouchery', lede: 'Każdy voucher w rękach Twoich klientów i co się z nim stało.' },
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
        title: 'Nikt jeszcze nie wziął vouchera',
        body: 'Voucher pojawia się tutaj w chwili, gdy klient wyda punkty na jednym z Twoich progów. Ustaw budżet rabatowy i drabinka się otworzy; wszystko dalej trafia tu z kodem, okresem ważności i statusem.',
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

    register: {
      totals: {
        issued: 'Wzięte vouchery',
        active: 'Jeszcze niewykorzystane',
        redeemed: 'Wykorzystane u Ciebie',
        expired: 'Przepadły niewykorzystane',
        lapsing: '{n} przepada w ciągu tygodnia — to ostatni moment, w którym przypomnienie jeszcze do nich dotrze.',
      },
      caps: {
        kicker: 'Limity',
        title: 'Ile każdego wydasz',
        lede: 'Budżet rabatowy ogranicza, ile vouchery mogą Cię kosztować. To ogranicza, ile ich jest — hamulec na tydzień otwarcia, na małą kuchnię albo po prostu na to, żeby jedna osoba nie zabrała całej oferty.',
        rung: '{pct}% taniej',
        taken: 'wzięte {n} z {total}',
        takenNoCap: 'wzięte: {n}, brak limitu',
        total: 'Łącznie',
        perUser: 'Na klienta',
        unit: 'voucherów',
        noLimit: 'Bez limitu',
        remove: 'Usuń limit',
        noLimitNote: 'Puste pole znaczy brak limitu. Voucher, który przepadł niewykorzystany, nadal liczy się jako wzięty — inaczej limit da się obejść, po prostu czekając.',
        retired: 'Wycofany',
        save: 'Zapisz limity',
        saving: 'Zapisywanie…',
        saved: 'Limity zapisane.',
      },
      list: {
        kicker: 'Rejestr',
        title: 'Każdy voucher w rękach klientów',
        search: 'Szukaj kodu lub nazwy',
        count: 'Widzisz {n} z {total}',
        empty: 'Nikt jeszcze nie wziął vouchera. Pojawi się tutaj w chwili, gdy klient wyda punkty na progu powyżej — z kodem, oboma końcami okresu ważności i tym, co się z nim stało.',
        emptyFiltered: 'Nic nie pasuje. Wyczyść wyszukiwanie albo wybierz inny status.',
      },
      table: {
        code: 'Kod',
        rung: 'Rabat',
        holder: 'W rękach',
        issued: 'Wzięty',
        expires: 'Ważny do',
        status: 'Status',
        redeemed: 'Wykorzystany',
        withheld: 'Ukryte — ten klient nie zgodził się udostępnić profilu Twojemu lokalowi.',
        notRedeemed: 'jeszcze nie',
      },
      status: {
        all: 'Wszystkie',
        active: 'Niewykorzystane',
        redeemed: 'Wykorzystane',
        expired: 'Przepadłe',
        cancelled: 'Anulowane',
      },
    },

    acts: {
      column: 'Działania',

      publish: 'Opublikuj',

      /** The row's own control: open this deal in the create panel. */

      edit: 'Edytuj',
      pause: 'Wstrzymaj',
      resume: 'Wznów',
      extend: 'Przedłuż',
      end: 'Zakończ',
      /* "End it" retires a deal and keeps its history; this removes the row.
         They are two different acts and the overview's rows offer both, so
         they must not translate to the same word. */
      delete: 'Usuń',
      endSure: 'Na pewno?',
      notify: 'Powiadom',
      send: 'Zaplanuj',
      save: 'Zapisz',
      close: 'Zamknij',
      refresh: 'Odśwież',
      until: 'Nowa data końca',
      sendAt: 'Kiedy wyjdzie',

      published: 'Opublikowane. Jest już w aplikacji.',
      paused: 'Wstrzymane. Klienci już tego nie widzą.',
      resumed: 'Znowu działa.',
      extended: 'Data końca przesunięta.',
      ended: 'Zakończone. Tego już nie cofniesz.',
      notified: 'Powiadomienie zaplanowane.',

      offline: 'Nie udało się połączyć z serwerem. Nic się nie zmieniło — spróbuj za minutę.',
      refused: 'Serwer tego nie przyjął: {why}',

      budgetTitle: 'Ustaw budżet na miesiąc',
      budgetLede:
        'Jedna kwota na miesiąc, podzielona między nagrody lojalnościowe i zniżki na bony. Nie może spaść poniżej tego, co już wydane lub odłożone.',
      budgetTotal: 'Łącznie w tym miesiącu',
      budgetShare: 'Część na lojalność',
      shareUnit: '% na lojalność',
      budgetShareNote: '{loyalty} na nagrody lojalnościowe, {voucher} na zniżki z bonów.',
      budgetSaved: 'Budżet zapisany.',
      moveTitle: 'Przenieś pieniądze między pulami',
      moveAmount: 'Ile przenieść',
      moveDo: 'Przenieś',
      moveDir: '{from} → {to}',
      moveNote:
        'Przenosi się tylko to, co wciąż dostępne. To, co odłożone, należy do klienta, który już na to zapracował.',
      moved: 'Przeniesione.',
      hint: 'Pula „{to}” jest prawie pusta, a „{from}” ma zapas. Warto przenieść około {amount}.',
      pools: { loyalty: 'Lojalność', voucher: 'Bony' },

      ladderEdit: 'Zmień, co dają punkty',
      ladderDone: 'Gotowe',
      tierPct: 'Zniżka',
      tierPoints: 'Ile kosztuje punktów',
      tierCap: 'Najwięcej z jednego rachunku',
      pctUnit: '% zniżki',
      tierAdd: 'Dodaj próg',
      tierRetire: 'Wycofaj',
      tierRetired: 'Próg wycofany. Bony już wydane w tym progu nadal działają.',
      tiersSaved: 'Progi punktowe zapisane.',
      tierDuplicate:
        'Dwa progi nie mogą mieć tej samej zniżki — drugi zastąpiłby pierwszy.',

      queueTitle: 'Czeka na potwierdzenie',
      queueLede:
        'Klient zeskanował kod i nic jeszcze nie zostało przyznane. Potwierdź, a punkty, pieczątki i zniżki wykonają się naraz.',
      queueEmpty:
        'Nic nie czeka. Skan pojawia się tutaj w kilka sekund po tym, jak klient podniesie telefon.',
      confirm: 'Potwierdź',
      turnAway: 'Odmów',
      confirmed: 'Potwierdzone. Klient ma swoje punkty.',
      turnedAway: 'Odmówione. Nic nie zostało przyznane.',
      billLabel: 'Kwota rachunku',
      waitingCustomer: 'Czekamy, aż klient wpisze kwotę',
      openedAt: 'Zeskanowano o {at}',
      intents: {
        earn: 'Zbieranie',
        voucher_redeem: 'Bon',
        reward_redeem: 'Nagroda',
      },

      exportLocked: 'Eksport CSV nie jest częścią planu tego lokalu.',
      previewTitle: 'Twoja wizytówka oczami klienta',
      previewLede:
        'Odczytane z serwera, więc to wersja zapisana, a nie ta wpisana w formularzu.',
      previewVouchers: 'Punkty akceptowane',
      previewNoVouchers: 'Punkty jeszcze nieakceptowane',
    },

    unmeasured: {
      noSession:
        'To urządzenie nie jest zalogowane do API Paylez, więc żadnej z tych liczb nie da się odczytać. Wyloguj się i zaloguj ponownie kontem swojego lokalu, żeby je połączyć.',
      serverSilent:
        'Serwer nie odpowiedział, więc nie ma tu czego pokazać. To nie jest zero — nie udało się zapytać.',
      asking: 'Wczytujemy Twoje liczby z serwera…',
      withheld: 'Wstrzymane — zbyt mało osób, by podać to bez ujawnienia, kim są.',
      noSource: 'Serwer jeszcze tego nie raportuje, więc ten panel nie ma czego pokazać.',
      planLocked: 'Poza planem tego lokalu.',
      monthOnly:
        'Liczby są raportowane za cały miesiąc kalendarzowy — to okno, w którym liczy serwer. Wybór zakresu powyżej jeszcze nimi nie porusza.',
      noFindings: 'W tym miesiącu nic się nie wyróżniło.',
      /** A panel drawn from the reference design's figures rather than
          from measured ones, so the layout can be seen while the endpoint
          behind it does not exist. Never shown when `PD_SEED` is off. */
      sample: 'Dane poglądowe',
      tierUnit: 'Każdy z nich zdejmuje {unit} z rachunku.',
      plan: 'Brak budżetu do pokazania — to urządzenie nie jest zalogowane do API Paylez.',
      assistant:
        'Zanim cokolwiek zaproponuję, czytam Twoje ciche godziny, Twoje budżety i to, co działa w lokalach podobnych do Twojego — a to urządzenie nie jest zalogowane do API Paylez, więc nie mogę odczytać niczego z tego. Nie będę zgadywać liczby i podpisywać jej Twoim nazwiskiem.',
      audience: 'Ilu osób to dotyczy, nie da się teraz odczytać — serwer nie odpowiedział.',
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
      /* A column beside Wyświetlenia and Kliknięcia — the one figure in the
         funnel that is an *outcome*. */
      reachClaims: 'Odebrania',
      reachClaimsNote: 'ile razy ktoś odebrał jedną z Twoich ofert',
      /* The surfaces a venue is seen on. Keyed by the server's own strings —
         do not translate or reorder the keys; an unknown one falls back to
         itself. */
      reachSources: {
        feed: 'W kanale aplikacji',
        search: 'Z wyszukiwania',
        map: 'Z mapy',
        direct: 'Otwarte bezpośrednio',
        share: 'Udostępnione przez klienta',
        unknown: 'Skądś indziej',
      },
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
      deltaNew: 'Nowe',
      sinceNone: 'w poprzednim okresie nic',
      quietBoth: 'nic w tym ani w poprzednim okresie',

      proofTitle: 'Jedyna rzecz, którą możemy udowodnić',
      proof:
        'Klienci w Twoich kampaniach lojalnościowych przychodzą {n}× częściej niż przed dołączeniem.',
      proofNote: 'Policzone z Twoich własnych skanów QR, nie oszacowane. Bez integracji z kasą.',
      before: 'przedtem',
      now: 'teraz',

      chartTitle: 'Wizyty i realizacje voucherów',
      chartNote:
        'Każde skanowanie QR przy kasie zestawione z voucherami, które klienci naprawdę wykorzystali',
      chartVisits: 'Wizyty',
      chartRedeemed: 'Zrealizowane vouchery',
      /** The right-hand end of the chart's date axis. */
      chartToday: 'dziś',

      holdingTitle: 'Pieniądze, które trzymasz',
      holding:
        '{rewards} nagród i {vouchers} voucherów leży niewykorzystanych, blokując {amount} Twojego budżetu.',
      holdingNote:
        'Za każdym z nich stoi klient, który się zakwalifikował i jeszcze nie wrócił. Jeśli wygasną, pieniądze wracają do budżetu.',

      noticed: 'Co zauważyliśmy',
      /* Offered beside every finding: the insight rows argue for one specific
         next step, this is the way to ask about the rest of it. */
      askAssistant: 'Zapytaj asystenta',
      /* What "Przypomnij im" becomes once it has been pressed. A past-tense
         word rather than a second instruction, because the button is now a
         statement of what happened. */
      reminded: 'Przypomniano',
      insights: {
        visitsUp: 'Wizyt jest o {pct}% więcej niż w te same dni zeszłego miesiąca.',
        visitsDown: 'Wizyt jest o {pct}% mniej niż w te same dni zeszłego miesiąca.',
        visitsFlat: 'Wizyt jest tyle samo co w te same dni zeszłego miesiąca.',
        vouchersUp: 'Użycie voucherów wzrosło o {pct}%.',
        vouchersDown: 'Użycie voucherów spadło o {pct}%.',
        vouchersFlat: 'Użycie voucherów się nie zmieniło.',
        pulling: 'Ludzie przychodzą — to nagrody nie ściągają ich z powrotem.',
        tierText: 'Twój próg {pct}% jest poza zasięgiem większości ostatnich klientów.',
        tierDetail:
          'Tylko {reached} z {eligible} klientów, którzy byli u Ciebie w ciągu ostatnich 30 dni, ma {points} punktów, których wymaga. Przy {lower} punktach zakwalifikowałoby się jeszcze {more} z nich.',
        tierAction: 'Zmień próg {pct}%',
        itemText:
          'Twoja najlepsza oferta, która nie jest rabatem procentowym, jest odbierana {multiple}× częściej na wyświetlenie niż Twój najlepszy rabat procentowy.',
        percentText:
          'Twój najlepszy rabat procentowy jest odbierany {multiple}× częściej na wyświetlenie niż Twoja najlepsza inna oferta.',
        sameText:
          'Twój najlepszy rabat procentowy i Twoja najlepsza inna oferta są odbierane mniej więcej równie często.',
        itemDetail:
          '„{itemTitle}” ({itemBadge}) odebrano {itemClaims} razy przy {itemSeen} wyświetleniach. „{pctTitle}” ({pctBadge}) odebrano {pctClaims} razy przy {pctSeen} wyświetleniach.',
        itemAction: 'Zobacz swoje okazje',
        unusedText: '{n} nagród lojalnościowych jest zdobytych i leży nieużytych, blokując {amount}.',
        unusedDetail: 'Ci klienci się zakwalifikowali i jeszcze po nie nie wrócili.',
      },

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
        archived: 'Zakończona',
      },
      search: 'Szukaj wśród swoich okazji',
      filters: ['Wszystkie', 'Aktywne', 'Zaplanowane', 'Wstrzymane', 'Wygasłe'],
      count: '{n} z {total} okazji',
      sortNote:
        'Sortowane po odsetku odebrań, najlepsze u góry. Aktywne i zaplanowane okazje idą pierwsze.',
      /** A deal published with no discount text on it yet. */
      untitled: 'Brak tytułu',
      /** Half of the sent-notification chip: people it reached who then scanned. */
      cameIn: '{n} przyszło',
      insight:
        'Twoje okazje z darmowym produktem są odbierane 2,4× częściej niż rabaty procentowe. Zestaw lunchowy z 5% wypadł słabo — małe rabaty rzadko kogoś ruszają.',
      langsAll: 'Napisana we wszystkich pięciu językach',
      langsSome: 'Napisana w {n} z 5 języków — tracisz około {pct}% zasięgu',
      notify: {
        none: 'Bez powiadomienia',
        scheduled: 'Powiadomienie zaplanowane',
        sent: 'Powiadomienie wysłane',
        stopped: 'Powiadomienie zatrzymane',
      },
      reach: '{n} z {total} osób można powiadomić',
      limit: '{claimed} z {limit} odebrań',
      limitAllowed: 'z {limit} dozwolonych',
      noLimit: 'Bez limitu odebrań',

      audienceNotes: [
        'Każdy, kto otwiera aplikację Paylez w Twojej okolicy.',
        'Osoby, które dołączyły do Paylez w ciągu ostatnich sześciu miesięcy.',
        'Byli u Ciebie wcześniej, ale nie w ciągu ostatnich 60 dni.',
        'Osoby, które jeszcze nigdy u Ciebie nie były.',
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
      notifyVenueTitle: 'Co zrobiły Twoje powiadomienia w tym miesiącu',
      notifyVenueSent: 'Na podstawie {n} powiadomień wysłanych w tym miesiącu.',
      notifyVenueNone: 'W tym miesiącu nie wyszło żadne powiadomienie, więc nie ma jeszcze czego mierzyć.',
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
      /* The two fallbacks in the expanded row's targeting card. A deal
         with no window runs whenever it is live, and one with no audience
         is shown to everyone — both are real states rather than gaps, so
         they are named rather than left blank. */
      anytime: 'Codziennie',
      everyone: 'Wszyscy',

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
        archived: 'Skopiuj',
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
      remindNext: 'Kolejne przypomnienie można wysłać {date}.',
      remindSent: 'Przypomnienie wysłane do {n} klientów — {queued} jako powiadomienie, reszta do skrzynki w Paylez.',
      remindTooSoon: 'W tym tygodniu przypomnienie już wyszło. Kolejne można wysłać {date}.',
      remindNobody: 'Nikt nie ma teraz niewykorzystanej nagrody ani vouchera, więc nie ma komu przypominać.',
      near: '{n} stałych klientów dzieli jedna wizyta od kolejnej nagrody.',
      cooldown: 'Skany liczą się raz na {n} godz.',
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
      stillOut: '{n} wciąż u klientów',
      retired: 'Wycofany',
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
      rosterFilters: ['Wszyscy', 'Stali', 'Najcenniejsi', 'Mogą odejść', 'Odeszli', 'Nowi'],
      withdrew:
        'Każdy może wyłączyć udostępnianie w dowolnej chwili. Wtedy znika z tej listy, a jego historia przestaje być dla Ciebie widoczna.',
      statuses: {
        regular: 'Stały',
        high_value: 'Najcenniejszy',
        at_risk: 'Może odejść',
        lapsed: 'Odszedł',
        new: 'Nowy',
      },
      today: 'Dziś',
      daysAgo: '{n} dni temu',
      dayAgo: 'wczoraj',
      stamps: '{done} z {of} pieczątek',
      tierProgress: 'próg {n}%',

      detail: {
        open: 'Pokaż: {name}',
        close: 'Zamknij',
        spent: 'Wydał u Ciebie',
        visits: 'Wizyty',
        firstSeen: 'Pierwsza wizyta',
        lastSeen: 'Ostatnia wizyta',
        language: 'Język aplikacji',
        months: 'Wizyty w kolejnych miesiącach',
        cards: 'Karty pieczątek',
        card: '{done} z {need} pieczątek',
        offers: 'Oferty, które otworzył lub odebrał',
        events: { open: 'Otwarcie', claim: 'Odebranie', click: 'Otwarcie' },
        none: 'Jeszcze nic.',
        gone: 'Ten klient już nie udostępnia Ci swojego profilu, więc nie ma czego pokazać.',
      },

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
      noCampaign: 'Bez kampanii',
      progress: '{done}/{need} skanowań',
      toGo: 'jeszcze {n}',
      ready: 'nagroda zdobyta',
      anonymous: 'Klient — nie udostępnia',
      anonymousNote: 'Ten klient nie udostępnił swojego imienia Twojemu lokalowi.',
      notCounted: 'Nie wliczono',
      notCountedNote: 'Poniżej minimalnego rachunku, za szybko po poprzednim skanie albo już policzony tego dnia.',
      discount: '{amount} zniżki',
      emptyWindow: 'W tym okresie nie ma jeszcze skanowań.',
      emptySegment: 'Żadne skanowanie nie pasuje do tego filtra.',
      todayTitle: 'Dziś przy kasie',
      count: '{n} skanowań',
      showing: 'Pokazano {n} z {total}',
      page: 'Pokazano {from}–{to} z {total}',
      prev: 'Poprzednia',
      next: 'Następna',
      coords: 'Kasa',

      counter: {
        title: 'Zapisz wizytę przy kasie',
        lede: 'Wpisz @nazwę klienta albo kod z jego vouchera lub nagrody, a potem kwotę rachunku z kasy.',
        codeLabel: 'Klient albo kod',
        codePlaceholder: '@nazwa, kod vouchera lub nagrody',
        lookup: 'Sprawdź',
        looking: 'Sprawdzam…',
        clear: 'Zacznij od nowa',
        noHandle: 'Bez nazwy użytkownika',
        notShared: 'Imię nieudostępnione',
        firstVisit: 'Pierwsza wizyta tutaj',
        returning: 'Był już wcześniej',
        stamps: '{done} z {need} pieczątek',
        noCampaigns: 'Żadna kampania nie działa, więc pieczątki nie są liczone.',
        voucherTitle: 'Voucher',
        voucher: '{pct}% zniżki, najwyżej {cap}',
        rewardTitle: 'Nagroda',
        rewardWorth: 'kosztuje Cię {amount}',
        expires: 'Wygasa {date}',
        billLabel: 'Kwota rachunku',
        billNote: 'W {currency}, dokładnie tak, jak wydrukowała kasa — bez przeliczania.',
        billCeiling: 'Najwyżej {amount} za jeden rachunek.',
        confirm: 'Zapisz wizytę',
        recording: 'Zapisuję…',
        receiptTitle: 'Zapisano',
        receiptBill: 'Rachunek {amount}',
        points: '{n} pkt dla klienta',
        noPoints: 'Bez punktów za tę wizytę',
        discount: '{amount} zdjęte z rachunku',
        stamped: 'Na karcie przybyła pieczątka.',
        rewardEarned: 'Zdobył nagrodę: {label} — kod {code}.',
        notCounted:
          'Ta wizyta nie liczy się do punktów ani pieczątek: rachunek był poniżej Twojego minimum, klient skanował zbyt niedawno albo został już dziś policzony.',
        notFound: 'Nic tu nie pasuje. Sprawdź pisownię albo poproś klienta, żeby jeszcze raz pokazał kod.',
        pending:
          'Ten klient ma już tutaj skan czekający na potwierdzenie. Zniknie sam, jeśli nikt go nie potwierdzi — spróbuj za kilka minut.',
        tooHigh: 'To więcej, niż może tu wynosić jeden rachunek — najwyżej {amount}. Sprawdź kwotę.',
        badAmount: 'Wpisz kwotę rachunku z kasy.',
        budget:
          'Twój budżet rabatowy nie pokryje teraz tego vouchera. Zapisz wizytę z @nazwą klienta albo zwiększ budżet w zakładce Vouchery.',
        expired: 'Ten kod wygasł.',
        used: 'Ten kod został już użyty.',
        notLive: 'Twój lokal nie jest jeszcze aktywny, więc wizyt nie da się zapisywać.',
        notStaff: 'To konto nie należy do obsługi tego lokalu, więc nie może tu zapisywać wizyt.',
        needsVenue:
          'Zapisanie wizyty wymaga lokalu zalogowanego do API Paylez. To urządzenie nie jest zalogowane, więc nic tu nie zostanie zapisane.',
      },
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

      /* The panel's heading when it was opened on an existing deal. One

         panel does both jobs and the heading is what says which. */

      editDeal: 'Edytuj gorącą ofertę',
      editCampaign: 'Edytuj kampanię',
      close: 'Zamknij',
      cancel: 'Anuluj',
      later: 'Zapisz i dokończ później',
      deal: {
        kicker: 'Nowa gorąca okazja',
        editKicker: 'Gorąca okazja',
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
        reachLabel: 'osób w tej grupie dziś',
        notifiableLabel: 'można powiadomić',
        reachLanguage: 'Serwer nie wylicza grupy odbiorców według języka aplikacji, więc ta nie ma liczby.',
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
        quietNote: 'Nic nie wychodzi przed 07:00 ani po 21:00 czasu Twojego lokalu, cokolwiek ustawisz.',
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
        needsSession: 'Ta oferta nie ma jeszcze gdzie trafić — Twojego lokalu nie ma na serwerze. Otwórz konfigurację firmy i zapisz wizytówkę; to ją rejestruje i ten panel zacznie działać.',
        filingOffline: 'Nie udało się połączyć z serwerem. Nic nie zapisano — spróbuj za minutę.',
        filingRefused: 'Serwer tego nie przyjął: {why}',
        savedUnverified: 'Zapisano jako wersję roboczą. Trafi do aplikacji, gdy Twój lokal zostanie zweryfikowany — zajmujemy się tym.',
        savedNotLive: 'Zapisano jako wersję roboczą, ale straciliśmy połączenie przed publikacją. Opublikuj z listy Hot deals.',
        savedNotLiveWhy: 'Zapisano jako wersję roboczą. Nie trafiło do aplikacji: {why}',
        savedPlanFull: 'Zapisano jako wersję roboczą. Twój plan pozwala na jedną aktywną ofertę naraz — wstrzymaj tę, która działa, i opublikuj tę z listy ofert.',
        savedNoPush: 'Zapisano jako wersję roboczą. Powiadomienie nie wyjdzie — wersji roboczej nie ma w aplikacji.',
        publishedNotified: 'Opublikowane, a powiadomienie wyjdzie o {at}.',
        publishedNoPush: 'Opublikowane i działa. Powiadomienia nie udało się zaplanować: {why}',
      },
      campaign: {
        kicker: 'Nowa kampania lojalnościowa',
        editKicker: 'Kampania lojalnościowa',
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
          'Klient może kwalifikować się do więcej niż jednej kampanii przy tej samej wizycie. Przyznawana jest tylko jedna nagroda: ta o wyższym numerze priorytetu.',
        priorityHelp: 'Priorytet {n} z 5. Wygrywa wyższy.',
        rulesTitle: 'Drobne zasady',
        expiry: 'Nagroda wygasa po',
        days: 'dniach',
        expiryNote: 'Po tym czasie nagroda przepada, a pieniądze wracają do budżetu.',
        minSpend: 'Minimalna kwota na wizytę',
        minSpendNote: 'Mniejsze wizyty nie liczą się do tej kampanii.',
        summaryTitle: 'Twoja kampania w jednym zdaniu',
        summary: '{visits} wizyt, a potem {reward}. Kosztuje Cię {amount} za każdym razem, gdy ktoś ją ukończy.',
        summaryNote:
          'Pieniądze są rezerwowane z budżetu lojalnościowego, gdy klient się kwalifikuje, a nie gdy odbiera nagrodę. Jeśli nagroda wygaśnie, wracają.',
        summaryReward: 'nagroda',
        started: 'Działa. Liczy od następnej wizyty.',
        save: 'Zapisz zmiany',
        saved: 'Zapisano. Już zdobyte nagrody zachowują swój koszt; zmiana działa od następnej wizyty.',
        minSpendVenue: 'Ta kampania korzysta z minimum Twojego lokalu, dopóki nie wpiszesz tu kwoty.',
        costError: 'Podaj, ile kosztuje Cię jedna nagroda — pieniądze są rezerwowane z budżetu lojalnościowego w chwili, gdy ktoś ją zdobędzie.',
      },
      valid: 'Popraw {n} rzecz powyżej przed publikacją.',
      validPlural: 'Popraw {n} rzeczy powyżej przed publikacją.',
    },

    assistant: {
      knowTitle: 'Co wiem o lokalu „{venue}”',
      knowEmpty:
        'Nic tu jeszcze nie jest zmierzone. Uczę się, gdy klienci skanują kod przy Twojej ladzie — do tego czasu to wszystko, co widzę.',
      knowNote: 'Każda liczba, którą podaję, pochodzi z danych Twojego lokalu. Żadnej nie wymyślam.',
      facts: {
        visits: 'Wizyty w tym miesiącu',
        customers: 'Klienci w tym miesiącu',
        newCustomers: 'Nowi klienci w tym miesiącu',
        budgetAvailable: 'Wciąż dostępny budżet',
        budgetUnspent: 'Jeszcze niewydany budżet',
        spend: 'Wydane w tym miesiącu',
        listing: 'Twój wpis',
        quietest: 'Najcichsza godzina otwarcia',
        topLanguage: 'Język większości klientów',
      },
      statuses: {
        draft: 'Szkic — jeszcze nie w aplikacji',
        pending_review: 'Czeka na weryfikację',
        live: 'Widoczny w aplikacji',
        suspended: 'Zawieszony',
        archived: 'Zarchiwizowany',
      },
      receipt: 'Liczby, z których powstała ta odpowiedź',

      attentionTitle: 'Wymaga Twojej uwagi',
      attentionNone: 'W tej chwili nic nie wymaga Twojej uwagi.',
      attentionFailed: 'Nie udało mi się odczytać, co wymaga Twojej uwagi.',
      review: {
        dealStuck:
          'Okazję „{title}” wyświetlono już {n} razy i nikt jej nie odebrał. Coś jest nie tak z ofertą albo z godzinami.',
        dealStuckPlain:
          'Jedna z Twoich aktywnych okazji jest oglądana, ale nikt jej nie odbiera. Coś jest nie tak z ofertą albo z godzinami.',
        toLoyalty:
          'Pula lojalnościowa jest prawie pusta, a pula voucherowa ma jeszcze wolne środki: {amount}.',
        toVoucher:
          'Pula voucherowa jest prawie pusta, a pula lojalnościowa ma jeszcze wolne środki: {amount}.',
        poolsPlain:
          'Jedna z Twoich pul budżetowych jest prawie pusta, a w drugiej zostało sporo wolnych środków.',
        noCampaign:
          'Nie masz aktywnej karty pieczątek. To najtańszy sposób, żeby klient wrócił drugi raz.',
      },
      actions: {
        editDeal: 'Edytuj okazję',
        moveBudget: 'Przesuń budżet',
        startCampaign: 'Załóż kartę pieczątek',
        dealThen: 'Utwórz okazję na tę godzinę',
      },

      startTitle: 'Od czego zacząć',
      suggestions: {
        first_deal: {
          label: 'Uruchom pierwszą okazję',
          detail:
            'Oferta ograniczona w czasie, którą może odebrać każdy. Ja przygotuję projekt, Ty sprawdzisz go w formularzu.',
        },
        stamp_card: {
          label: 'Załóż kartę pieczątek',
          detail:
            'Określona liczba wizyt i jedna stała nagroda. Ty decydujesz, ile ta nagroda Cię kosztuje.',
        },
        points_discount: {
          label: 'Ustaw rabat za punkty',
          detail: 'Trzy progi, na które klienci wydają punkty, w ramach jednego miesięcznego budżetu.',
        },
        quiet_hours: {
          label: 'Powiedz mi, kiedy masz mało ruchu',
          detail:
            'Nauczę się tego z wizyt klientów, ale Ty wiesz to już dziś — ustaw dni i godziny w formularzu okazji.',
        },
        fill_quiet_hour: {
          label: 'Zapełnij najcichszą godzinę',
          detail: 'Okazja skierowana na Twoją najcichszą godzinę otwarcia: {when}.',
        },
        rebalance: {
          label: 'Przesuń budżet między pulami',
          detail: 'Jedna pula jest prawie pusta, a w drugiej zostało sporo wolnych środków.',
        },
        translate: {
          label: 'Dotrzyj do klientów w ich języku',
          detail: 'Część Twoich klientów czyta aplikację w innym języku niż ten najczęstszy.',
        },
      },
      quietPlain: 'Okazja skierowana na godzinę, w której masz najmniej ruchu.',
      askTitle: 'Pytania, na które odpowiem',
      questions: {
        quiet: 'Kiedy w moim lokalu jest najciszej?',
        cost: 'Ile kosztował mnie każdy nowy klient?',
        month: 'Jak idzie ten miesiąc?',
      },

      convTitle: 'Porozmawiaj z asystentem',
      reset: 'Zacznij od nowa',
      opening:
        'Zapytaj mnie o wizyty, najcichsze godziny albo wydatki. Możesz też przełączyć na Projekt, napisać, co ma się wydarzyć, a ja przygotuję to do sprawdzenia w formularzu.',
      modeLabel: 'Co zrobić z Twoją wiadomością',
      modes: { ask: 'Pytanie', draft: 'Projekt' },
      fieldLabel: { ask: 'Twoje pytanie', draft: 'Co ma się wydarzyć' },
      placeholders: {
        ask: 'Kiedy w moim lokalu jest najciszej?',
        draft: 'Na przykład: żeby stali klienci częściej wracali',
      },
      budgetLabel: 'Budżet (opcjonalnie)',
      budgetShown: 'Budżet: {amount}',
      send: 'Wyślij',
      composerNote:
        'Odpowiadam na podstawie liczb Twojego lokalu i niczego nie publikuję — projekt otwiera się w formularzu, a opublikować możesz go tylko Ty.',
      thinking: 'Asystent czyta Twoje dane…',

      answers: {
        empty:
          'Nie mam jeszcze żadnych pomiarów dla tego lokalu — uczę się, gdy przychodzą klienci. Oto, co możesz uruchomić już dziś.',
        quiet: 'Twoja najcichsza godzina otwarcia: {when}. Wizyty w tej godzinie w tym miesiącu: {n}.',
        quietNone: 'Jest jeszcze za mało wizyt, żeby wskazać cichą godzinę.',
        busiest: 'Godzina największego ruchu',
        busiestVisits: 'Wizyty w tej godzinie w tym miesiącu',
        counted: 'Wizyty policzone w tym miesiącu',
        cost: 'Wydatki w tym miesiącu: {spend}, czyli {each} na każdego nowego klienta. Nowi klienci w tym miesiącu: {n}.',
        costWithheld:
          'W tym miesiącu jest za mało nowych klientów, żeby podać koszt na klienta bez ryzyka ich zidentyfikowania.',
        parts: {
          subscription: 'Abonament',
          loyalty: 'Nagrody lojalnościowe',
          vouchers: 'Rabaty z voucherów',
          deals: 'Rabaty z okazji',
        },
        overview: 'Ten miesiąc do tej pory — wizyty: {visits}, klienci: {customers}.',
        overviewWithheld:
          'Ten miesiąc do tej pory — wizyty: {visits}. Liczba klientów jest ukryta: jest ich za mało, żeby ją podać bez ryzyka identyfikacji.',
        newCustomers: 'Nowi klienci',
        returning: 'Powracający klienci',
        sales: 'Sprzedaż',
        averageCheck: 'Średni rachunek',
      },

      draftTag: 'Projekt',
      draftNote: 'Nic tutaj nie jest aktywne. Otworzy się w formularzu, a opublikować możesz to tylko Ty.',
      goal: 'Twoja prośba: „{goal}”',
      kinds: {
        hot_deal: 'Gorąca okazja',
        campaign: 'Kampania lojalnościowa',
        voucher_tiers: 'Progi voucherów',
      },
      fields: {
        offer: 'Oferta',
        when: 'Kiedy obowiązuje',
        daysHours: '{days}, {hours}',
        everyDay: 'Codziennie, {hours}',
        whenever: 'Zawsze, gdy jest aktywna',
        capClaims: 'Odebrania do zatrzymania',
        name: 'Nazwa',
        visits: 'Wizyty do nagrody',
        reward: 'Nagroda',
        rewardCost: 'Koszt jednej nagrody',
        minSpend: 'Minimalny rachunek',
        validDays: 'Ważność nagrody w dniach',
      },
      english:
        'Treść oferty i nagrody asystent napisał po angielsku. Zmień ją w formularzu przed publikacją.',
      costTitle: 'Ile to będzie kosztować',
      cost: {
        campaign:
          'Szacunek dla takiej liczby zdobytych nagród: {n}. Z puli lojalnościowej zostałoby odłożone {amount}, po {each} za każdą. Nic nie jest rezerwowane, dopóki ktoś nie zdobędzie nagrody.',
        budget:
          'Podany budżet: {amount}. Projekt sam nie ogranicza wydatków — ustaw limit kwoty w formularzu, jeśli okazja ma się na nim zatrzymać.',
        deal: 'Nie podano budżetu. Gorąca okazja idzie z Twojej marży, a zatrzymuje ją limit odebrań powyżej.',
        none: 'Koszt zależy od tego, co ustawisz w formularzu.',
      },
      whyTitle: 'Dlaczego to proponuję',
      reasons: {
        campaign:
          'Powracających klientów przynosi kampania oparta na wizytach; rabat procentowy to voucher.',
        campaignCost:
          'Każda nagroda kosztuje Cię {each} — tyle pula lojalnościowa odkłada na każdą zdobytą nagrodę.',
        quietHour: 'Twoja najcichsza godzina otwarcia: {when}.',
        narrow: 'Okno jest celowo wąskie: rabat przez cały tydzień to zwykła obniżka ceny.',
        startingPoint:
          'Dla tego lokalu nic jeszcze nie jest zmierzone, więc ten projekt to punkt wyjścia, a nie wniosek z danych.',
        hourUnmeasured:
          'Bez wizyt każda godzina jest tak samo cicha, więc godzina w projekcie to po prostu pierwsza, w której masz otwarte. Ustaw własną w formularzu.',
        unmatched:
          'Nie udało mi się powiązać tego celu z niczym, co mierzę, więc to prosty punkt wyjścia. Wszystko zmienisz w formularzu.',
      },
      openForm: 'Otwórz w formularzu',
      openVouchers: 'Otwórz vouchery',

      states: {
        title: 'Asystent czyta dane Twojego lokalu',
        body: 'Odpowiada na podstawie wizyt, budżetu i cichych godzin tego lokalu, a okazje i karty pieczątek przygotowuje do sprawdzenia w formularzu.',
        noVenue:
          'To konto nie ma jeszcze lokalu na serwerze, więc nie mam czego czytać. Najpierw uzupełnij profil firmy.',
        failed: 'Serwer nie mógł odczytać danych Twojego lokalu: {why}',
        retry: 'Spróbuj ponownie',
        lockedTitle: 'Twój plan nie obejmuje asystenta',
        lockedBody:
          'Asystent czyta wizyty, budżet i ciche godziny tego lokalu i przygotowuje dla Ciebie okazje oraz karty pieczątek. Cała reszta tego panelu działa bez niego.',
        lockedAction: 'Zapytaj nas o plany',
        lockedSubject: 'Asystent dla lokalu {venue}',
        turnLocked: 'Plan tego lokalu nie obejmuje asystenta, więc nie mogę odpowiedzieć.',
        turnOffline: 'Nie udało się połączyć z serwerem, więc na razie nie ma odpowiedzi.',
        turnFailed: 'Serwer nie mógł na to odpowiedzieć.',
      },

      dayChoices: ['Wtorek i środa', 'Czwartek', 'Piątek'],
    },

    collapse: 'Zwiń menu',
    expand: 'Rozwiń menu',
    backToSite: 'Wróć do paylez',

    plan: {
      name: 'Plan Growth',
      state: 'Aktywny',
      unknown: 'Twój plan',
      open: 'Zobacz plany',
      caption: 'Budżety na lojalność i vouchery w tym miesiącu. Gorące okazje nie wchodzą w to.',
      usage: '{used} z {total}',
    },

    planPanel: {
      kicker: 'Twoja subskrypcja',
      title: 'Twój plan i trzy poziomy',
      lede: 'Na czym jesteś, ile z tego wykorzystujesz i co zawierają pozostałe.',
      mineKicker: 'Obowiązuje teraz',
      noSubscription: 'Poziom darmowy',
      freeNote:
        'Jesteś na poziomie darmowym, od którego zaczyna każdy lokal. Nic nie wygasa i nic nie jest należne.',
      usage: '{used} z {total}',
      renews: 'Odnawia się {date}.',
      until: 'Zmienia się {date}.',
      notIncluded: 'Nie zawiera',
      compareKicker: 'Porównanie',
      compareTitle: 'Co zawiera każdy poziom',
      whatYouGet: 'Co otrzymujesz',
      yours: 'Twój',
      freePrice: 'Bezpłatnie',
      perMonth: '{amount} miesięcznie',
      howToMove:
        'Zmianę poziomu ustalamy z nami, a nie z tego ekranu — dzięki temu wdrożenie jest wycenione według tego, co faktycznie prowadzisz. Napisz na',
      sources: {
        manual: 'Nadane przez Paylez',
        stripe: 'Opłacone kartą',
        apple: 'Opłacone w App Store',
        google: 'Opłacone w Google Play',
      },
      rows: [
        'Jednocześnie aktywnych gorących okazji',
        'Działających kampanii lojalnościowych',
        'Powiadomień push na miesiąc',
        'Miejsc w zespole',
        'Lokali na koncie',
        'Zaawansowana analityka',
        'Klienci z imienia',
        'Asystent',
        'Porównania z Twoim miastem',
        'Eksport CSV',
      ],
    },

    ranges: ['Ostatnie 7 dni', 'Ostatnie 14 dni', 'Ostatnie 30 dni', 'Ostatni kwartał'],
    rangeMenu: 'Okres raportowania',
    notifications: 'Powiadomienia',
    inbox: {
      unread: '{n} nieprzeczytanych',
      empty: 'Na razie nic tu nie ma. Tutaj trafią Twoje miesięczne podsumowanie i uwagi o lokalu.',
      markAll: 'Oznacz wszystkie jako przeczytane',
      markRead: 'Oznacz jako przeczytane',
      sample: 'Przykładowe powiadomienia — to urządzenie nie jest zalogowane do API Paylez.',
      failed: 'Nie udało się odczytać powiadomień — serwer nie odpowiedział.',
    },
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
      merchant: 'Partnerska karta podarunkowa',
      meta: 'Wydawana jak pieniądze w sklepie',
      title: 'Wymień punkty na prawdziwy voucher.',
      price: 'Punkty',
      revealed: 'Voucher gotowy',
      action: 'Wymień punkty',
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
      stats: ['Najlepsza runda', 'Daje zamrożenie'],
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
          a: 'To zależy od vouchera i od tego, co zdecyduje partner. Karty podarunkowe wyceniane są w punktach i każda na półce pokazuje, ile kosztuje i ile jest warta — strona „Vouchery” wypisuje to, co jest w magazynie teraz.',
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
      example: 'Przykład',
      tabs: { active: 'Aktywne', used: 'Wykorzystane' },
      note: 'Voucher liczy się jako wykorzystany w chwili wygenerowania kodu QR — generuj go przy kasie, a nie w tramwaju.',
      card: {
        brand: 'Sklep partnerski',
        meta: 'Karta podarunkowa, wydawana jak pieniądze',
        cost: '500 pkt',
        action: 'Pokaż kod QR',
        code: 'PLZ-9F3K',
        expires: 'Ważny do daty na karcie',
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
      lede: 'Czytane z platformy na żywo. Tutaj jest to, co naprawdę jest w magazynie, w cenie, za jaką kupują to punkty.',
      cost: 'pkt',
      left: 'zostało {n}',
      everywhere: 'Każdy sklep · także online',
      soldOut: 'Brak w magazynie',
      action: 'Zobacz pełną listę',
      loading: 'Pytamy serwer…',
      none: 'Nie ma jeszcze kart podarunkowych. Punkty zostają — lista wypełni się, gdy dołączą marki.',
      down: 'Nie udało się połączyć z serwerem, więc to nie jest pusty katalog, tylko katalog, którego nie udało się odczytać.',
      retry: 'Spróbuj ponownie',
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
      /* ── wiek kursów, trzy stany. Uzasadnienie w `en.ts`. */
      updated: 'Kursy zaktualizowane {when}',
      stale: 'Te kursy nie odświeżyły się od {when}',
      builtIn: 'Pokazujemy wbudowaną tabelę kursów',
      swap: 'Zamień waluty miejscami',
      result: '{from} = {to}',
      enter: 'Wpisz kwotę do przeliczenia.',
      saved: 'Twoje pary',
      common: 'Najczęstsze',
      pin: 'Przypnij tę parę',
      pinned: 'Przypięta',
      unpin: 'Odepnij {pair}',
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
      title: 'Wybierz kraj. Otwórz temat.',
      lede: 'Przewodnik pisany jest osobno dla każdego kraju, a każdy temat otwiera się w listę miejsc, które naprawdę się tym zajmują — z adresem, telefonem i informacją, które z nich są na Paylez.',
      country: 'Wybierz kraj',
      cities: 'Wszystkie miasta',
      city: 'Filtruj po mieście',
      count: 'Miejsc na liście: {n}',
      none: 'Na razie nic w tym temacie w mieście {city}. Spróbuj wszystkich miast.',
      soon: 'Ten temat wciąż powstaje. Asystent poniżej odpowie w międzyczasie.',
      loading: 'Pobieramy przewodnik…',
      empty: 'Dla tego kraju przewodnik jest jeszcze pusty. Wybierz inny albo zapytaj poniżej.',
      failed: 'Nie udało się teraz połączyć z przewodnikiem. Nic nie zginęło — spróbuj za chwilę.',
      onPaylez: 'Na Paylez',
      visit: 'Strona',
      reviews: '({n} opinii)',
      takesVouchers: 'Przyjmuje vouchery Paylez',
      about: 'O miejscu',
      pricing: 'Ceny',
      contact: 'Kontakt',
      close: 'Zamknij',
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
      'Ten dokument jest tłumaczeniem. W razie rozbieżności z wersją angielską rozstrzygający jest tekst angielski.',
    loading: 'Pobieranie dokumentu…',
    privacyVersion: 'Wersja 1.1 · Obowiązuje od 28 sierpnia 2026 · Zgodna z RODO',
    termsVersion: 'Wersja 1.0 · Obowiązuje od 24 kwietnia 2025',
  },
  profile: {
    sharing: {
      title: 'Udostępniaj mój profil lokalom, w których bywam',
      help: 'Lokal, w którym rzeczywiście byłeś, widzi Twoje imię, zdjęcie i ile tam wydałeś — nigdy salda i nigdy lokal, w którym nie byłeś. Wyłączenie zatrzymuje nowe lokale; te, które już widzą, wyłączasz na ich własnej karcie.',
      failed: 'Nie udało się zapisać. Spróbuj za chwilę.',
    },
    board: {
      title: 'Pokazuj mnie w tygodniowym rankingu',
      help: 'Twoja nazwa, awatar i punkty z tygodnia. Po wyłączeniu nadal widzisz ranking i swoje miejsce — tylko inni nie widzą tam Ciebie.',
      failed: 'Nie udało się zapisać. Spróbuj za chwilę.',
    },
    eyebrow: 'Twoje konto',
    title: 'Twój profil',
    lede: 'To widzą inni gracze i stąd wiemy, gdzie jesteś. Nic z tego nie jest z niczym weryfikowane — nie wysyłamy kodu na telefon ani linku do kliknięcia na skrzynkę.',

    whoLegend: 'Kim jesteś',
    whereLegend: 'Gdzie jesteś i jak Cię złapać',

    photo: 'Zdjęcie',
    photoChoose: 'Wybierz zdjęcie',
    photoHelp: 'Najlepiej kwadratowe. Zanim je zapiszemy, zmniejszamy je do miniatury.',
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
    countryPlaceholder: 'PL',
    countryHelp:
      'Pytamy tylko dlatego, że Twojego miasta nie ma na naszej liście. Dwuliterowy kod kraju, np. PL albo DE.',
    countryUnchecked:
      'Pytamy, bo nie możemy sięgnąć do listy miast, żeby sprawdzić Twoje. Dwuliterowy kod kraju, np. PL albo DE.',
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
    meterReward: 'Uzupełnij wszystkie siedem i zdobądź {points} punktów.',
    meterRewardPaid: 'Zdobyto {points} punktów za uzupełnienie profilu.',
    wonTitle: 'Profil uzupełniony',
    wonBody: 'Brawo. {points} punktów trafiło na Twoje konto.',
    wonClose: 'Świetnie',
    fieldNames: {
      avatar: 'Zdjęcie',
      username: 'Nazwa użytkownika',
      occupation: 'Status',
      city: 'Miasto',
      email: 'E-mail',
      phone: 'Telefon',
      birthDate: 'Data urodzenia',
    },

    edit: 'Edytuj',
    cancel: 'Anuluj',
    saving: 'Zapisywanie…',
    savedServer: 'Profil zapisany.',
    savedDevice:
      'Zapisano tylko na tym urządzeniu — nie udało się połączyć z serwerem. Zapisz ponownie, gdy wrócisz do sieci, a zmiany zostaną wysłane.',
    saveFailed: 'Nie udało się zapisać profilu. Spróbuj ponownie za minutę.',
    sessionExpired: 'Twoja sesja wygasła. Zaloguj się ponownie i zapisz.',
    cityShape: 'To nie wygląda na nazwę miasta.',
    countryShape: 'Wpisz dwuliterowy kod kraju, np. PL albo DE.',
    notAdded: 'Jeszcze nie dodano',
    memberSince: 'Konto założone: {date}',
    aboutTitle: 'O Tobie',
    stripPoints: 'Punkty',
    stripStreak: 'Seria dni',
    stripEnergy: 'Energia',
    stripEnergyValue: '{n} z {max}',
    gapsView: 'Jeszcze puste: {fields}.',
    sharingTitle: 'Udostępnianie lokalom',
    sharingLede:
      'Te lokale widzą, kim jesteś — Twoje imię i zdjęcie — gdy u nich płacisz. Wstrzymanie działa od razu.',
    sharingNone: 'Nie udostępniasz swoich danych żadnemu lokalowi.',
    sharingSince: 'Od {date}',
    sharingStop: 'Przestań udostępniać',
    sharingAsk: 'Przestać udostępniać dane lokalowi {venue}?',
    sharingYes: 'Przestań',
    sharingKeep: 'Udostępniaj dalej',
    sharingStopped: 'Udostępnianie lokalowi {venue} zostało wstrzymane.',
    sharingLoading: 'Sprawdzamy, które lokale Cię widzą…',
    sharingOffline: 'Nie udało się połączyć z serwerem, żeby to sprawdzić.',
    sharingRetry: 'Spróbuj ponownie',
    sharingFailed: 'To się nie udało. Spróbuj ponownie.',
  },

  onboarding: {
    step: 'Krok {n} z {total}',

    langTitle: 'Wybierz język',
    langLede: 'Możesz go później zmienić — to przełącznik w nagłówku.',
    langNext: 'Dalej',
      placeTitle: 'Gdzie grasz?',
      placeLede: 'Ranking jest według miasta i kraju. Możesz to pominąć — nadal będziesz grać, zbierać punkty i pojawiać się w rankingu światowym.',
      placeCity: 'Twoje miasto',
      placeCityPlaceholder: 'Zacznij pisać…',
      placeListed: 'Pokaż mnie w rankingu',
      placeListedNote: 'Twoje imię i tygodniowe punkty, widoczne dla innych graczy. Wyłączone, dopóki nie włączysz — możesz to zmienić w profilu.',
      placeSaving: 'Zapisywanie…',
      back: 'Wstecz',

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
    payProfileWorth: 'Uzupełnienie profilu to kolejne {points} punktów.',

    introTitle: 'Zdobądź pierwsze punkty',
    introLede: 'Odpowiedz na {n} pytań o flagi i zdobądź nawet {points} punktów. Pomiń te, których nie znasz — pominięte pytanie po prostu nic nie daje.',
    introGo: 'Dalej',
    gameSkip: 'Pomiń to pytanie',
    moreTitle: 'Czeka {n} kolejnych gier',
    moreLede: 'Quizy, gry słowne, pamięć i lot — każda z nich daje punkty i wszystkie są w L-Earn.',
    moreGo: 'Zobacz gry',
    reelPrev: 'Poprzednia gra',
    reelNext: 'Następna gra',
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
    get: 'Wybierz {plan}',
    current: 'Twój plan',
    opening: 'Otwieram…',
    failed: 'Strona płatności się nie otworzyła. Spróbuj ponownie.',
    badges: ['Gwiazdka', 'Korona'],
    heroRows: ['Energia dziennie', 'Odnowa, minuty', 'Punkty za rundę'],
    day: {
      rounds: 'rund dziennie',
      from: 'z pełnego zapasu',
      vs: '+{n} wobec {plan}',
      base: 'Plan, do którego porównywana jest każda liczba obok.',
    },
    more: 'Wszystko inne',
    mark: 'Oznaczenie planu: {name}',
    plans: [
      { name: 'Free', note: 'Cała pętla, bez wspomagania.' },
      { name: 'Pro', note: 'Dla grającego codziennie.' },
      { name: 'Premium', note: 'Dla tego, kto wypłaca.' },
    ],
    rows: [
      'Energia na dzień',
      'Minuty na odnowienie jednej energii',
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
