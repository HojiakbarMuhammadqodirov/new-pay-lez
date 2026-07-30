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
      meta: 'Sklep partnerski · wartość 25 €',
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
    eyebrow: 'Pokochali nas nowo przybyli',
    title: 'Z paylez ludzie szybciej się odnajdują.',
    items: [
      {
        quote:
          'Paylez to pierwsza aplikacja, którą otwieram w nowym mieście — okazje, punkty i wszystko, czego potrzebuję, żeby się urządzić, w jednym miejscu.',
        name: 'Mira D.',
        meta: 'Kraków · Z nami od 2025',
      },
      {
        quote:
          'W dwa tygodnie uzbierałam dość punktów na voucher Zalando. Szybki quiz w tramwaju naprawdę się opłaca.',
        name: 'Ola K.',
        meta: 'Studentka, świeżo po przeprowadzce',
      },
      {
        quote:
          'Living Guide przeprowadził mnie przez założenie konta w banku i szukanie mieszkania po przeprowadzce. Naprawdę uratował mi skórę.',
        name: 'Mateusz R.',
        meta: 'Przeprowadził się z Lizbony',
      },
      {
        quote:
          'Wymieniłam kartę podarunkową Douglas na urodziny siostry — 100 punktów, dwa kliknięcia, gotowe.',
        name: 'Priya S.',
        meta: 'Z nami od 2024',
      },
      {
        quote:
          'Jako sklep partnerski dostajemy dzięki Paylez zmotywowanych lokalnych klientów bez psucia marki rabatami. Asystent AI odpowiada też na pytania.',
        name: 'Elena V.',
        meta: 'Właścicielka sklepu partnerskiego',
      },
    ],
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
