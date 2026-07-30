import type { Dictionary } from './en';

/** Uzbek (Latin script). Structurally identical to `en` — the type enforces it. */
export const uz: Dictionary = {
  code: 'uz',
  label: "O'zbekcha",
  short: 'UZ',
  region: 'UZ',

  nav: ['Bosh sahifa', 'L-Earn', 'Tahlil', 'B2B', 'Vaucherlar', "Ko'chish"],
  signIn: 'Kirish',
  assistant: 'AI yordamchini ochish',
  languageMenu: "Tilni o'zgartirish",

  hero: {
    lines: ["O'yna va ishla.", 'Eksklyuziv takliflar.'],
    lede: 'Kashf eting, o‘ynang va mukofot oling.',
    primary: "O'yna va ishla",
    secondary: 'Bu qanday ishlaydi',
    stats: ["Har g'alaba uchun", "Hamkor do'konlar", 'Faol shaharlar'],
  },

  proof: "Ballaringizni yetakchi hamkor do'konlarda ishlating",

  guide: {
    eyebrow: 'Shahringizda',
    title: 'Shahringizdagi xizmatlarni kashf eting.',
    lede: 'Qaynoq chegirmalar, ishonchli joylar va mahalliy sevimlilar — barchasi bir joyda.',
    services: [
      { name: 'Novvoyxona', blurb: 'Yaqin atrofdagi yangi pishirilgan mahsulotlar' },
      { name: 'Qahva', blurb: "Sizning mukammal chashkangiz, qayerda bo'lmang" },
      { name: 'Xarid', blurb: 'Mahalliylar kabi xarid qilish uchun eng yaxshi joylar' },
      { name: 'Restoran', blurb: 'Eng yaxshi mahalliy taomlarni kashf eting' },
      { name: 'Halol', blurb: "Ishonch bildirish mumkin bo'lgan halol joylar" },
      { name: 'Dam olish', blurb: 'Atrofingizdagi qiziqarli mashg‘ulotlar' },
      { name: "Go'zallik", blurb: "O'zingizga g'amxo'rlik va go'zallik" },
      { name: 'Uy-joy', blurb: 'Chet elda yangi uyingizni toping' },
    ],
  },

  features: {
    eyebrow: 'paylez qanday ishlaydi',
    title: 'Ozgina o‘yna. Ko‘p ishla.',
    lede: 'Tezkor savollarga javob bering, ketma-ketlik yig‘ing va ballarni haqiqiy vaucherlarga aylantiring.',
    cards: [
      {
        title: 'Savollarga javob bering. Ketma-ketlik yig‘ing. Mukofot yutib oling.',
        body: "Play & Earn miya o'yini bilan har kuni aqlingizni mashq qildiring. Har bir to'g'ri javob hamkor do'konlarda chegirma vaucherlariga almashtiriladigan ball keltiradi.",
      },
      {
        title: 'Eksklyuziv takliflar',
        body: "Hamkorlar tarmog'idan tanlangan sovg'a kartalari va chegirmalar, muntazam yangilanadi.",
      },
      {
        title: 'Tezkor mobil vaucherlar',
        body: "To'g'ridan-to'g'ri telefoningizdan foydalaning va do'konda skanerlang — hech narsani chop etish shart emas.",
      },
      {
        title: 'QR kodlarni skanerlang, qo‘shimcha ball oling',
        body: "Bonus ballar va tezkor vaucherlar uchun do'konda hamkor QR kodlarini skanerlang — to'g'ridan-to'g'ri telefoningizdan.",
      },
      {
        title: 'AI yordamchi',
        body: "Chet elga ko'chish uchun raqamli hamrohingiz — istalgan vaqtda, istalgan savolni bering.",
      },
    ],
  },

  value: {
    eyebrow: "O'yna va ishla",
    title: 'Ballaringiz — haqiqiy pul.',
    lede: "Hiyla yo'q, muddat tuzoqlari yo'q. Ball ishlash uchun o'ynang, so'ng ularni haqiqatan foydalanadigan sovg'a kartalari va chegirmalarga almashtiring.",
    card: {
      merchant: "Zalando sovg'a kartasi",
      meta: "Hamkor do'kon · €25 qiymat",
      title: 'Ballaringizni haqiqiy voucherga almashtiring.',
      price: '500 ball',
      revealed: 'Voucher tayyor · PLZ-9F3K',
      action: 'yuz ballni almashtirish',
    },
    benefits: [
      {
        title: "Shunchaki o'ynab ball ishlang",
        body: "Kuniga bir nechta tezkor savolga javob bering, ketma-ketligingizni oshiring va tramvayda, navbatda — istalgan joyda ball to'plang.",
      },
      {
        title: "Sovg'a kartalari va chegirmalarga almashtiring",
        body: "Ballarni Zalando, Douglas va Media Expert kabi hamkor do'konlarning vaucherlariga aylantiring — to'g'ridan-to'g'ri telefoningizdan.",
      },
      {
        title: 'Paylez Champions jadvalida ko‘tariling',
        body: "Do'stlaringizni taklif qiling, ketma-ketligingizni saqlang va kattaroq sovrinlar uchun oylik reytingda ko'tariling.",
      },
    ],
  },

  voices: {
    eyebrow: 'Yangi kelganlar sevimlisi',
    title: 'paylez bilan odamlar tezroq moslashadi.',
    items: [
      {
        quote:
          "Paylez — yangi shaharda ochadigan birinchi ilovam: chegirmalar, ballar va joylashish uchun kerak bo'lgan hamma narsa bir joyda.",
        name: 'Mira D.',
        meta: "Krakov · 2025 yildan beri a'zo",
      },
      {
        quote:
          "Ikki haftada Zalando voucheri uchun yetarli ball to'pladim. Tramvayda tezkor viktorina o'ynash haqiqatan foyda keltirar ekan.",
        name: 'Ola K.',
        meta: 'Talaba, yaqinda kelgan',
      },
      {
        quote:
          "Ko'chib kelganimda Living Guide menga bank hisobi ochish va kvartira topishda yo'l ko'rsatdi. Haqiqatan ham qutqardi.",
        name: 'Mateush R.',
        meta: 'Lissabondan ko‘chib kelgan',
      },
      {
        quote:
          "Singlimning tug'ilgan kuniga Douglas sovg'a kartasini oldim — 100 ball, ikki marta bosish, tamom.",
        name: 'Priya S.',
        meta: "2024 yildan beri a'zo",
      },
      {
        quote:
          "Hamkor do'kon sifatida Paylez bizga brendimizni arzonlashtirmasdan qiziqqan mahalliy mijozlarni olib keladi. AI yordamchi savollarni ham hal qiladi.",
        name: 'Elena V.',
        meta: "Hamkor do'kon egasi",
      },
    ],
  },

  cta: {
    title: "O'yna. Ishla. Joylash.",
    lede: "Yangi mamlakatni uyga aylantirayotgan minglab odamlarga qo'shiling — o'ynang, haqiqiy mukofotlar oling va har qadamda ekspert yordamiga ega bo'ling. Boshlash bepul.",
    primary: "O'yna va ishla",
    secondary: "Living Guide'ni ko'rish",
    note: 'Obuna talab qilinmaydi · Butun Polshada mavjud',
  },

  footer: {
    blurb:
      "O'yna va ishla. Eksklyuziv takliflar. Haqiqiy mukofotlar. Kashf eting, tejang va mukofot oling.",
    location: 'Krakov, Polsha',
    columns: [
      {
        heading: 'Mahsulot',
        links: ["O'yna va ishla", 'Chegirmalar', "Ko'chish", 'AI yordamchi'],
      },
      {
        heading: 'Kompaniya',
        links: ['Yordam', 'Fikr bildirish', 'Qaynoq takliflar', 'Hamjamiyat'],
      },
    ],
    news: {
      heading: "Eng yaxshi takliflarni birinchi bo'lib oling",
      body: "Haftasiga bitta qisqa xat — vaqtingizga arziydigan yangi takliflar va ball ko'paytirgichlari.",
      success: 'Tayyor — pochtangizni kuzating ✦',
      placeholder: 'you@email.com',
      emailLabel: 'Elektron pochta manzili',
      subscribe: 'Obuna bo‘lish',
    },
    legal: '© 2026 Paylez. Barcha huquqlar himoyalangan.',
    privacy: 'Maxfiylik siyosati',
    terms: 'Foydalanish shartlari',
  },
};
