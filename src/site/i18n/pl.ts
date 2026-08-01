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

  nav: ['Start', 'L-Earn', 'Analityka', 'B2B', 'Vouchery', 'Przeprowadzka'],
  signIn: 'Zaloguj się',
  assistant: 'Otwórz asystenta AI',
  languageMenu: 'Zmień język',
  theme: {
    label: 'Motyw',
    toLight: 'Przełącz na jasny motyw',
    toDark: 'Przełącz na ciemny motyw',
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
        body: 'Twój cyfrowy towarzysz w przeprowadzce za granicę — zapytaj o wszystko, o dowolnej porze.',
      },
    ],
  },

  value: {
    eyebrow: 'Graj i zarabiaj',
    title: 'Twoje punkty to prawdziwe pieniądze.',
    lede: 'Żadnych sztuczek ani pułapek z terminem ważności. Graj, zbieraj punkty i wymieniaj je na karty podarunkowe oraz rabaty, z których naprawdę skorzystasz.',
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
      lede: 'Kilka szybkich pytań dziennie. Punkty, które zamieniają się w vouchery w sklepach, z których i tak korzystasz. Bez abonamentu, bez haczyków.',
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
      title: 'Trzy sposoby na punkty.',
      lede: 'Wszystkie trzy są przetłumaczone na każdy język tej strony, więc nigdy nie grasz w swoim drugim języku, chyba że sam chcesz.',
      items: [
        {
          name: 'Capital Game',
          blurb: 'Podaj stolicę. Zaczyna się łatwo i przestaje być łatwo mniej więcej w czwartej rundzie.',
          meta: '10 pytań · do 100 pkt',
        },
        {
          name: 'Flag Game',
          blurb: 'Dopasuj flagę do kraju. Najszybsza z trzech i ta, w którą gra się w kolejce.',
          meta: '10 pytań · do 100 pkt',
        },
        {
          name: 'Życie w Polsce',
          blurb: 'Ta praktyczna: urzędy, transport, najem — rzeczy, o których nikt nie mówi. Warta punktów i warta wiedzy.',
          meta: '10 pytań · do 150 pkt',
        },
      ],
    },

    streak: {
      eyebrow: 'Serie',
      title: 'To w serii są punkty.',
      lede: 'Jedna runda dziennie utrzymuje ją przy życiu. Opuścisz dzień i wraca do jednego — to cała zasada.',
      card: {
        label: 'Aktualna seria',
        unit: 'dni',
        reward: '+250 pkt siódmego dnia',
      },
      benefits: [
        {
          title: 'Dzień trzeci: 1,5×',
          body: 'Każdy zdobyty punkt jest wart o połowę więcej, we wszystkich trzech grach.',
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
      lede: 'Pierwszego dnia miesiąca wszyscy zaczynają od zera. Najlepsza trójka dzieli pulę nagród; reszta po prostu zatrzymuje swoje punkty.',
      columns: { rank: '#', player: 'Gracz', points: 'Punkty' },
      note: 'Przykładowy ranking — Twój zeruje się 1. dnia miesiąca.',
    },

    faq: {
      eyebrow: 'Pytania',
      title: 'Krótkie odpowiedzi.',
      items: [
        {
          q: 'Czy punkty tracą ważność?',
          a: 'Nie. Zostają na Twoim koncie, dopóki ich nie wydasz. Nie mają daty ważności ani miesięcznego resetu — od nowa startuje tylko ranking.',
        },
        {
          q: 'Ile rund mogę zagrać dziennie?',
          a: 'Trzy punktowane rundy, po jednej na grę. Później możesz grać dalej dla treningu, ale to już nie dodaje punktów.',
        },
        {
          q: 'Ile naprawdę wart jest voucher?',
          a: '500 punktów to karta podarunkowa o wartości {amount} w sklepach partnerskich, takich jak Zalando, Douglas czy Media Expert. Mniejsze rabaty zaczynają się od 100 punktów.',
        },
        {
          q: 'Czy to za darmo?',
          a: 'Tak. Bez abonamentu, bez opłaty wpisowej i bez niczego, co trzeba kupić, żeby zagrać.',
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
      trust: 'Bez abonamentu · Bez danych karty · Punkty nie tracą ważności',
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
          title: 'Punkty zostają, vouchery tracą ważność',
          body: 'Twoje saldo nie ma daty ważności ani miesięcznego resetu. Pojedynczy voucher ma — i data jest na karcie, zanim cokolwiek wydasz.',
        },
      ],
    },

    faq: {
      eyebrow: 'Pytania',
      title: 'Te, które padają naprawdę.',
      items: [
        {
          q: 'Ile kosztuje mnie voucher?',
          a: 'Punkty i nic poza tym. Nie ma abonamentu, opłaty za dostarczenie ani karty w systemie — przy realizacji nigdy nie podajesz danych płatniczych.',
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
      lede: 'Gdzie założyć konto, jak działa kaucja, która przychodnia przyjmie Twoje ubezpieczenie, ile naprawdę kosztuje przelew do domu. Dziewięć tematów, czternaście krajów, pisane przez ludzi, którzy przez to przeszli.',
      primary: 'Otwórz przewodnik',
      secondary: 'Sprawdź kurs',
      stats: ['Tematów', 'Krajów', 'Marży na naszym kursie'],
      trust: 'Za darmo · Do czytania nie trzeba konta · Aktualizowane wraz z przepisami',
    },

    rates: {
      eyebrow: 'Pieniądze do domu',
      title: 'Poznaj prawdziwy kurs, zanim ktoś Ci go zaproponuje.',
      lede: 'Kurs międzybankowy dla kierunków, którymi ludzie stąd naprawdę wysyłają — bez naszej marży na wierzchu. Zapisz pary, których używasz, a otworzą się pierwsze.',
      send: 'Wysyłasz',
      gets: 'Odbiorca dostaje',
      rate: 'Kurs',
      action: 'Porównaj dostawców',
      saved: 'Zapisane pary',
      savedNote: 'Przypięte na górze ekranu, więc sprawdzenie kursu to jedno dotknięcie, a nie wyszukiwanie.',
      bullets: [
        {
          title: 'Kurs międzybankowy, bez narzutu',
          body: 'Ile waluta jest warta, a nie ile ktoś za nią da. Różnica między jednym a drugim to właśnie to, czego warto szukać.',
        },
        {
          title: 'Dostawcy obok siebie',
          body: 'Opłata, kurs i czas dotarcia dla każdego — policzone dla kwoty, którą faktycznie wpisałeś, a nie dla przykładu z reklamy.',
        },
        {
          title: 'Twoje kierunki na górze',
          body: 'Przypnij pary, którymi wysyłasz, a za każdym razem będą na górze z już wczytanym kursem.',
        },
      ],
    },

    guide: {
      eyebrow: 'Pomoc i wskazówki',
      title: 'Dziewięć tematów, a potrzebny zawsze okazuje się inny niż ten spodziewany.',
      lede: 'Każdy otwiera się w instrukcję krok po kroku dla Twojego miasta — jaki dokument, gdzie go wydają, ile kosztuje i ile trwa.',
      cities: 'Wszystkie miasta',
      search: 'Szukaj w przewodniku',
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
    note: 'Bez abonamentu · Dostępne w całej Polsce',
  },

  footer: {
    blurb:
      'Graj i zarabiaj. Ekskluzywne oferty. Prawdziwe nagrody. Odkrywaj, oszczędzaj i zgarniaj nagrody.',
    location: 'Kraków, Polska',
    columns: [
      {
        heading: 'Produkt',
        links: ['Graj i zarabiaj', 'Rabaty', 'Przeprowadzka', 'Asystent AI'],
      },
      {
        heading: 'Firma',
        links: ['Wsparcie', 'Podziel się opinią', 'Gorące okazje', 'Społeczność'],
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
