import type { Dictionary } from './en';

/** Uzbek (Latin script). Structurally identical to `en` — the type enforces it. */
export const uz: Dictionary = {
  code: 'uz',
  label: "O‘zbekcha",
  short: 'UZ',
  region: 'UZ',

  nav: {
    home: 'Bosh sahifa',
    learn: 'L-Earn',
    analytics: 'Tahlil',
    business: 'Biznes',
    /* The same route as `learn`, under the word an owner needs. See
       `NAV_LABEL_BUSINESS` in `content.ts`. */
    games: 'O‘yinlar',
    wallet: 'Hamyon',
    contact: 'Aloqa',
    relocate: 'Ko‘chish',
  },
  /** The phone burger's label. There is no visible text beside it. */
  menu: 'Menyu',
  signIn: 'Kirish',
  assistant: 'AI yordamchini ochish',
  languageMenu: "Tilni o‘zgartirish",
  theme: {
    label: 'Ko‘rinish',
    toLight: "Yorug‘ rejimga o‘tish",
    toDark: "Qorong‘i rejimga o‘tish",
  },

  auth: {
    eyebrow: 'Xush kelibsiz',
    title: 'paylez’ga kirish.',
    lede: 'Ballaringiz, vaucherlaringiz va yo‘riqnomangiz — qaysi qurilmani qo‘lga olgan bo‘lsangiz, o‘sha yerda.',
    email: 'Elektron pochta manzili',
    emailPlaceholder: 'siz@email.com',
    password: 'Parol',
    passwordPlaceholder: 'Parolingiz',
    submit: 'Kirish',
    errors: {
      email: 'Bu manzil bilan hisobimiz yo‘q.',
      password: 'Bu parol to‘g‘ri kelmadi.',
      empty: 'Manzil va parolni kiriting.',
    },

    signUpEyebrow: 'Bu yerda yangimisiz?',
    signUpTitle: 'paylez hisobingizni yarating.',
    signUpLede:
      'Ikkita maydon va bitta tanlov. Tanlaganingiz keyingi ekrandan boshlab nimani ko‘rishingizni belgilaydi.',
    name: 'To‘liq ism',
    namePlaceholder: 'Ism va familiya',
    newPasswordPlaceholder: 'Kamida {n} ta belgi',
    typeQuestion: 'Siz kimsiz?',
    typeNote: 'Hozircha faqat bir marta tanlanadi, shuning uchun mos kelganini tanlang.',
    signUpSubmit: 'Hisob yaratish',
    orDivider: 'yoki',
    googleContinue: 'Google bilan davom etish',
    googleWorking: 'Kirilmoqda…',
    googleUnreachable:
      'Google orqali kirish hozir ishlamayapti. Quyidagi e-pochta va paroldan foydalaning.',
    googleRefused:
      'Google orqali kirib bo‘lmadi. Qayta urinib ko‘ring.',
    signUpErrors: {
      name: 'Ismingizni yozing.',
      email: 'Bu elektron pochta manziliga o‘xshamaydi.',
      taken: 'Bu manzil bilan hisob allaqachon bor. Kirib ko‘ring.',
      password: 'Kamida {n} ta belgidan foydalaning.',
      type: 'Bu yerda shaxs sifatidami yoki biznes sifatidami — tanlang.',
    },
    noAccount: 'Hali hisobingiz yo‘qmi?',
    toSignUp: 'Yarating',
    haveAccount: 'Hisobingiz bormi?',
    toSignIn: 'Kirish',

    typeEyebrow: 'Yana bitta narsa',
    typeTitle: 'paylez’dan qanday foydalanasiz, {name}?',
    typeLede: 'Bu nimani ko‘rishingizni belgilaydi. Hozircha faqat bir marta tanlanadi, shuning uchun mos kelganini tanlang.',
    types: [
      {
        name: 'Jismoniy shaxs',
        blurb: 'O‘ynang, ball yig‘ing, ularni vaucherlarga almashtiring va yo‘riqnomani o‘qing.',
      },
      {
        name: 'Biznes egasi',
        blurb: 'Joyingizni qo‘shing, taklifingizni o‘yinchilarga ko‘rsating va u nima berganini ko‘ring.',
      },
    ],
    typeSubmit: 'Davom etish',
    typeHint: 'Davom etish uchun bittasini tanlang.',

    signOut: 'Chiqish',
    accountMenu: 'Hisobingiz',
    dashboard: 'Panel',
    roles: { individual: 'Foydalanuvchi', business: 'Biznes', admin: 'Administrator' },
  },

  admin: {
    tag: 'Konsol',
    title: 'Butun platforma.',
    lede: 'Har bir joy, har bir taklif va har bir hisob — hamda ularning ortidagi tahlil.',
    back: 'paylez’ga qaytish',
    search: 'Joy, xizmat ID’si, taklif yoki odamni qidirish…',
    noMatch: 'Bu so‘rovga hech narsa mos kelmadi.',
    kpis: [
      'Jami xizmatlar',
      'Faol xizmatlar',
      'Jami takliflar',
      'Faol takliflar',
      'Hisoblar',
      'O‘yinchilar',
    ],
    tabs: ['Xizmatlar', 'Takliflar', 'Odamlar', 'Sayt'],

    services: {
      title: 'Biznes xizmatlari',
      lede: 'paylez’dagi har bir joy. Tahlilini ko‘rish uchun birini oching.',
      serviceId: 'Xizmat ID',
      copy: 'Nusxa',
      copied: 'Nusxalandi',
      analytics: 'Tahlil',
      active: 'Faol',
      paused: 'To‘xtatilgan',
      vouchers: 'Vaucherlar',
      live: 'Haqiqiy e’lon',
    },

    deals: {
      title: 'Takliflar va sovg‘a kartalari',
      lede: 'Bu oy ilova butun mamlakat bo‘ylab nimani ko‘rsatyapti.',
      kinds: { gift: 'Sovg‘a kartasi', deal: 'Qaynoq taklif' },
      until: '{date} gacha',
    },

    people: {
      title: 'Odamlar',
      lede: 'Uchta tayyor hisob va undan keyin ro‘yxatdan o‘tganlarning hammasi.',
      columns: ['Ism', 'Pochta', 'Rol', 'Qo‘shilgan', 'Holat'],
    },

    state: {
      player: '{points} ball · {streak} kunlik seriya',
      listing: '{percent}% to‘ldirilgan',
      live: 'Faol',
      noListing: 'Boshlanmagan',
      undecided: 'Tanlanmagan',
      none: '—',
    },

    note: 'Bu hisoblar ro‘yxati shu brauzerda saqlanadi. Hali server yo‘q, shuning uchun konsol tahrirlamaydi, faqat o‘qiydi — auth/users.ts’ga qarang.',

    /* ── to‘rtinchi bo‘lim: saytning o‘zi, serverdan so‘raydigan yagonasi ── */
    website: {
      title: 'Sayt',
      lede: 'Tashrifchilar, sahifalar va faollik, {from} – {to}.',
      loading: 'Serverdan so‘ralmoqda…',
      empty: 'Hali hech narsa yozilmagan.',
      kpis: [
        'Tashrifchilar (kunlik, yig‘indi)',
        'Tashriflar',
        'Sahifa ko‘rishlar',
        'Amallar',
        'Kirgan foydalanuvchi tashriflari',
        'Qaytgan hisoblar',
      ],
      privacy:
        'Tashrifchi — har kuni o‘zgaradigan xesh, shuning uchun hech kim kunlar oralig‘ida kuzatilmaydi va manzil saqlanmaydi. Shu sababli anonim trafik uchun “qaytgan tashrifchilar” ko‘rsatkichi yo‘q — u nol emas, uni o‘lchab bo‘lmaydi.',
      trend: 'Kunlik tashrifchilar',
      pages: 'Eng ko‘p o‘qilgan sahifalar',
      referrers: 'Qayerdan kelishgan',
      countries: 'Davlatlar',
      devices: 'Qurilmalar',
      actions: 'Nima qilishdi',

      people: {
        title: 'Serverdagi hisoblar',
        lede: 'Backend biladigan hamma, eng yangisidan boshlab.',
        columns: ['Ism', 'Shahar', 'Rol', 'Ballar', 'Skanlar', 'Qo‘shilgan'],
      },

      feed: {
        title: 'Faollik',
        lede: 'Platformada sodir bo‘lgan hamma narsa, eng yangisidan boshlab.',
        kinds: {
          signup: 'Ro‘yxatdan o‘tdi',
          venue: 'Yangi joy',
          transaction: 'Skan',
          voucher: 'Vaucher',
          game: 'O‘yin',
        } as Record<string, string>,
      },

      connect: {
        title: 'Backendga ulanish',
        lede: 'Bu bo‘lim jonli serverni o‘qiydi, shuning uchun operatsion hisob kerak — PAYLEZ_ADMIN_EMAIL bergan hisob, demo kirish emas.',
        email: 'Operatsion e-pochta',
        password: 'Parol',
        submit: 'Ulanish',
        working: 'Ulanmoqda…',
        refused: 'Rad etildi. Manzil va parolni tekshiring.',
        notAdmin: 'Bu hisob bor, lekin operator emas.',
        unreachable: 'Javob yo‘q. Backend ishlayaptimi (npm run server)?',
      },

      down: {
        title: 'Backend javob bermayapti',
        unreachable:
          'Hech narsa tinglamayapti. npm run server bilan ishga tushiring yoki server boshqa joyda bo‘lsa VITE_API_URL ni belgilang.',
        refused: 'Server javob berdi, lekin bu hisobni rad etdi.',
        retry: 'Qayta urinish',
        disconnect: 'API dan chiqish',
      },
    },

    analytics: {
      back: 'Barcha xizmatlar',
      totals: ['Jami faollik', 'Jami vaucherlar', 'Jami skanlar'],
      tabs: ['Boshqaruv', 'Qaynoq takliflar', 'Sodiqlik skanlari', 'Vaucherlar', 'Xulosalar'],

      ranges: ['Butun davr', 'Oxirgi 7 kun', 'Oxirgi 30 kun', 'Oxirgi 90 kun'],
      rangesLabel: 'Vaqt oralig‘i',
      search: 'Foydalanuvchi, kod, chek bo‘yicha qidirish…',
      records: '{n} ta yozuv',
      export: 'CSV yuklab olish',
      noRows: 'Bu filtrlarga hech narsa mos kelmadi.',

      unmeasured: {
        noSource: 'O‘lchanmagan — operator o‘qiy oladigan hech narsa buni hali xabar qilmaydi.',
        measured:
          'Tashriflar va mijozlar sanaladi, GET /v1/admin/venues dan. Bu ekrandagi qolgan hamma narsa hamkorga tegishli yoki umuman yig‘ilmaydi va nol emas, «o‘lchanmagan» deb ko‘rsatiladi.',
        notConnected:
          'Backend javob bermayapti, shuning uchun hatto tashrif va mijoz sonlarini ham o‘qib bo‘lmaydi. Bu nol emas — biz so‘rab ololmadik.',
      },

      states: { live: 'Faol', paused: 'To‘xtatilgan' },
      status: { used: 'Ishlatilgan', active: 'Ishlatilmagan' },

      columns: {
        deals: ['Sana', 'Taklif', 'Foydalanuvchi', 'Kod', 'Ball', 'Chegirma', 'Holat', 'Chek'],
        scans: ['Sana', 'Foydalanuvchi', 'Ball', 'Xarid', 'Chek', 'Qayerda', 'Mukofotgacha'],
        vouchers: ['Sana', 'Kod', 'Turi', 'Foydalanuvchi', 'Mukofot', 'Ball', 'Holat', 'Chek'],
      },

      cards: [
        { label: 'Google Xarita bosishlari', note: 'Yo‘nalish tugmasi bosilishi' },
        { label: 'Sayt bosishlari', note: 'E’londan kelgan tashriflar' },
        { label: 'Telefon bosishlari', note: 'Qo‘ng‘iroq urinishlari' },
        { label: 'Instagram bosishlari', note: 'Ilovadan profilga tashrif' },
        { label: 'Jami vaucherlar', note: '{used} ishlatilgan · {active} faol' },
        { label: 'Sodiqlik vaucherlari', note: '{used} ishlatilgan · {active} faol' },
        { label: 'Jami chegirma qiymati', note: 'U ishlatilgan cheklarga nisbatan' },
        { label: 'Jami faollik', note: 'Barcha harakatlar yig‘indisi' },
        { label: 'Jami skanlar', note: 'Kassadagi QR skanlar' },
      ],

      trend: {
        title: 'Faollik dinamikasi',
        lede: 'Oxirgi 30 kun',
        empty: 'Hali dinamika ma’lumoti yo‘q.',
      },

      hot: {
        title: 'Qaynoq takliflar',
        lede: 'Bu joy o‘tkazayotgan muddatli takliflar.',
        empty: 'Bu joy hali biror taklif o‘tkazmagan.',
        counts: ['Faol', 'Foydalanishlar', 'To‘xtatilgan'],
        points: '{n} ball',
        expires: '{date} da tugaydi',
        redemptions: '{n} marta ishlatilgan',
        tableTitle: 'Qaynoq takliflardan foydalanish',
      },

      loyalty: {
        settingsTitle: 'Sodiqlik skani sozlamalari',
        settingsLede: 'Kassadagi skan necha ball beradi va qanchalik tez-tez hisoblanadi.',
        perVisit: 'har tashrif uchun ball',
        cooldown: 'skanlar orasida',
        hours: '{n} soat',
        campaignsTitle: 'Sodiqlik vaucher kampaniyalari',
        campaignsLede: 'Qaytib keladigan mijozlar uchun avtomatik mukofotlar.',
        campaignsEmpty: 'Hali sodiqlik kampaniyasi yo‘q.',
        every: 'Har {n} tashrifda',
        reward: 'keyingisiga {n}% chegirma',
        tiles: [
          { label: 'Jami skanlar', note: '{n} ball berildi' },
          { label: 'Skanlardan savdo', note: '{n} ta skandan' },
          { label: 'O‘rtacha xarid', note: 'har skanlangan tashrifga' },
        ],
        tableTitle: 'Sodiqlik skanlari',
        trendTitle: 'Kunlik skanlar',
        trendLede: 'Oxirgi 30 kun',
        trendEmpty: 'Hali skan yo‘q.',
      },

      vouchers: {
        campaignTitle: 'Chegirma vaucher kampaniyasi',
        campaignKind: 'Byudjetga asoslangan · {n} ta berilgan',
        usage: 'Byudjet sarfi',
        used: '{total} dan {used}',
        left: '{amount} qoldi',
        points: 'Ball',
        issued: 'Berilgan',
        cap: 'Oylik chegara',
        tiles: [
          { label: 'Jami savdo', note: '{n} marta ishlatilishidan' },
          { label: 'O‘rtacha savat', note: 'har ishlatilgan vaucherga' },
        ],
        tableTitle: 'Vaucherlar',
        types: { discount: 'Chegirma', loyalty: 'Sodiqlik' },
        dailyTitle: 'Kunlik savdo dinamikasi',
        dailyLede: 'Oxirgi 30 kun, chek summalari',
        dailyEmpty: 'Hali savdo yo‘q — vaucherlar ishlatilgach chek summalari shu yerda chiqadi.',
        monthlyTitle: 'Yaratilgan savdo',
        monthlyLede: 'Vaucherlardan oylik chek qiymati',
      },

      insights: {
        citiesTitle: 'Asosiy shaharlar',
        citiesLede: 'Mijozlar qayerdan kelmoqda',
        citiesEmpty: 'Hali shahar ma’lumoti yo‘q.',
        langsTitle: 'Mijoz tillari',
        langsLede: 'E’lonni qaysi tilda o‘qishmoqda',
        langsEmpty: 'Hali til ma’lumoti yo‘q.',
        compareTitle: 'Mamlakat o‘rtachasiga nisbatan',
        compareLede: 'Bu joy shunga o‘xshash xizmatlar bilan qanday taqqoslanadi',
        mine: 'Shu joy',
        avg: 'Mamlakat o‘rtachasi',
        axis: ['Xarita', 'Sayt', 'Telefon'],
      },
    },
  },

  assistantPanel: {
    title: 'AI yordamchi',
    close: 'Yordamchini yopish',

    lockedTitle: 'So‘rash uchun kiring',
    lockedBody:
      'Yordamchi sizning ballaringiz, vaucherlaringiz va shahringizga tayanib javob beradi. Buning uchun hisob kerak.',
    lockedAction: 'Kirish',

    greeting: 'Salom, {name}',
    lede: 'Istalgan narsani so‘rang — ballar, vaucherlar, hujjatlar yoki yaqin atrofdan nimadir topish haqida.',
    placeholder: 'Istalgan narsani so‘rang…',
    send: 'Yuborish',
    suggestions: [
      'Vaucher uchun qancha ball kerak?',
      'Manzilimni qanday ro‘yxatdan o‘tkazaman?',
      'Hozir yaqin atrofda nima ochiq?',
    ],
    you: 'Siz',
    stubReply:
      'Bu versiyada yordamchi modelga ulanmagan, shuning uchun hozircha javob bera olmayman. Bu xabar atrofidagi hamma narsa — suhbat, matn maydoni, hisobingiz — haqiqatan ishlaydi.',
    stubTag: 'Ulanmagan',
  },

  wallet: {
    title: 'Vaucherlaringiz',
    lede: 'Yig‘gan hamma narsangiz va sarflagan hamma narsangiz.',
    balance: 'Balans',
    points: 'ball',
    shortBy: 'Keyingi vaucherga {n} ball yetmayapti',
    canRedeem: 'Vaucherga yetadi',

    tabs: ['Faol', 'Ishlatilgan'],
    counts: '{active} faol · {used} ishlatilgan',

    valid: '{date} gacha amal qiladi',
    usedOn: '{date} da ishlatilgan',
    cost: '{n} ball',
    show: 'QR kodni ko‘rsatish',
    shown: 'Kod yaratilishi bilan vaucher «Ishlatilgan»ga o‘tadi — buni kassada bajaring.',

    emptyActive: 'Hozircha bo‘sh. Bitta raund o‘ynang va ballarni shu yerda sarflang.',
    emptyUsed: 'Hozircha hech narsa sarflanmagan.',
    play: 'Raund o‘ynash',

    catalogue: 'Nima olishingiz mumkin',
    catalogueLede: 'Har oy yangilanadi. Har bir kartaning zaxirasi cheklangan.',
    redeem: 'Olish',
    short: 'Ball yetarli emas',
    soldOut: '1-sanada qaytadi',
    left: '{of} dan {left} qoldi',

    stamps: {
      title: 'Shtamp kartalari',
      lede: 'Har bir karta bitta joyga tashriflarni sanaydi. Tashriflar ball emas va boshqa joyda sarflanmaydi.',
      progress: '{of} tadan {done} ta',
      empty: 'Hali tashrif yo‘q — {of} ta tashrif {reward} beradi',
      going: '{reward} uchun yana {left} ta',
      goingOne: '{reward} uchun yana bitta tashrif',
      full: 'To‘ldi — {reward} kassada kutmoqda',
      cycles: 'Avval {n}× to‘ldirilgan',
      none: 'Hali karta yo‘q. Birinchisi karta ishlatadigan joyga birinchi tashrifda boshlanadi.',
      noneHere: '{category} bo‘limida shtamp kartalari yo‘q.',
      visit: 'Tashrif qo‘shish',
    },

    deals: {
      title: 'Qaynoq takliflar',
      lede: 'Yaqin atrofdagi takliflar. Ko‘pchiligi bepul — joyning o‘zi to‘laydi.',

      all: 'Hammasi',
      categories: ['Qahva', 'Taom', 'Nonvoyxona', 'Xizmatlar', 'Go‘zallik'],
      filter: 'Toifa bo‘yicha filtr',
      noneHere: 'Yaqin atrofda {category} bo‘yicha hozircha hech narsa yo‘q.',
      showAll: 'Barcha takliflarni ko‘rsatish',

      openNow: 'Hozir ochiq',
      closedNow: 'Hozir yopiq',
      held: 'Hamyoningizda',

      everyDay: 'Har kuni, {hours}',
      until: '{date} gacha',
      reviews: '{n} ta sharh',

      free: 'Bepul',
      claim: 'Olish',
      shortBy: 'Yana {n} ball kerak',
      claimed: '{date} olingan',
      justClaimed: 'Olindi — bu kodni kassada ko‘rsating',
      code: 'Sizning kodingiz',

      offers: [
        'Ikkita qahva, uchinchisi esa muassasa hisobidan.',
        'Butun buyurtmaga kun bo‘yi o‘n foiz chegirma.',
        'Peshtaxtadagi hamma narsaga yigirma foiz chegirma.',
        'Uchta non oling, to‘rtinchisi bepul.',
        'Zaldagi istalgan rastada tushlikka o‘n besh foiz chegirma.',
        'Ikkita taom, uchinchisi esa muassasa hisobidan.',
        'Har qanday kitob xaridiga bepul filtr qahva.',
        'Soch olish va soqol tekislashga o‘n besh foiz chegirma.',
        'Birinchi muolajangizga yigirma besh foiz chegirma.',
      ],

      none: 'Hali hech narsa olinmagan.',
    },

    redeemed: {
      title: 'Olinganlar',
      lede: 'Siz allaqachon olganlaringiz. Kodni kassada ko‘rsating — har biri bir marta ishlaydi.',
      dealsTitle: 'Siz olgan qaynoq takliflar',
      dealsLede: 'Taklif tugaguncha sizniki. Muassasa kodni kassada o‘qiydi.',
    },

    giftsTitle: 'Sovg‘a kartalari',
    giftsLede: 'Paylez to‘laydi. Belgilangan summa, kartada ko‘rsatilgan joyda pul kabi sarflanadi.',
  },

  games: {
    title: 'Aql o‘yinlari',
    lede: 'O‘zingizni sinang, ball yig‘ing va ularni chegirma vaucherlariga almashtiring.',

    score: 'Hisob',
    streak: 'Ketma-ketlik',
    energy: 'Energiya',
    roundMistakes: 'Qolgan xatolar',
    freezes: 'Muzlatishlar',
    answered: 'Javoblar',
    correctLabel: 'To‘g‘ri',
    toVoucher: 'Vaucherga',

    redeemTitle: 'Ballarni mukofotga almashtiring',
    redeemAction: 'Hoziroq almashtirish',

    pointsKicker: 'Sizning ballaringiz',
    pointsUnit: '{points} ball',
    pointsGoal: '{target} gacha yana {points}',
    pointsHave: 'chegirma uchun allaqachon yetarli',

    statsToggle: 'Statistikangiz',
    accuracy: 'Aniqlik',

    featured: 'Bugungi o‘yin · ketma-ketlikni saqlaydi',

    streakHint: 'Kuniga bitta raund uni saqlaydi',
    freezesHint: 'Har biri o‘tkazib yuborilgan bir kunni qoplaydi',
    streakKept: 'saqlandi',
    streakMissed: 'o‘tkazib yuborildi',
    streakAhead: 'hali oldinda',

    names: [
      'Juftini top',
      'Squawk parvozi',
      'Bayroqni top',
      'Davlat va poytaxt',
      'Aql o‘yinlari',
      'Polsha viktorinasi',
      'So‘z yig‘ · Inglizcha',
      'So‘z yig‘ · {language}',
    ],
    rule: '{questions} savol · har biri {seconds} soniya',
    reward: '{mistakes} xatoga ruxsat · har to‘g‘ri javob uchun +{points}',
    start: 'O‘yinni boshlash',
    play: 'O‘ynash',
    noEnergy: 'Energiya tugadi',
    energyFull: 'To‘la — kutadigan narsa yo‘q',
    energyNext: '+1 yana {time}',
    energyCost: 'Har raundga 1 ta',
    loading: 'Tarqatilmoqda…',

    /* Fixed samples of the kind of question each bank asks — short enough to
       read at preview size. `options[0]` is the right answer everywhere here,
       so keep the order; `capital.country` is filled into `whichCapital`. */
    preview: {
      flag: ['Polsha', 'Ukraina', 'Ispaniya'],
      capital: { country: 'Polsha', options: ['Varshava', 'Krakov', 'Gdansk'] },
      brain: {
        q: 'Qaysi sayyora Qizil sayyora deyiladi?',
        options: ['Mars', 'Venera', 'Yupiter'],
      },
      poland: {
        q: 'Polsha valyutasi qaysi?',
        options: ['Zlotiy', 'Yevro', 'Krona'],
      },
    },

    question: '{total} dan {n}-savol',
    whichCountry: 'Bu qaysi davlat?',
    whichCapital: '{country} poytaxti qaysi?',
    quit: 'Taslim bo‘lish',
    timeUp: 'Vaqt',

    wonTitle: 'Raund yutildi',
    lostTitle: 'Raund tugadi',
    resultScore: '{total} dan {correct} tasi to‘g‘ri',
    resultPoints: '+{points} ball',
    resultNone: 'Bu raundda ball yo‘q.',
    resultToward: 'Yana {points} ball va birinchi vaucher sizniki.',
    resultAfford: 'Vaucher uchun yetarli — borib oling.',
    resultSpend: 'Ballarni sarflash',
    resultStreak: 'Ketma-ketlik: {streak} kun',
    again: 'Yana o‘ynash',
    backToGames: 'O‘yinlarga qaytish',

    boardTitle: 'Reyting',
    boardTabs: ['To‘g‘ri javoblar', 'Yig‘ilgan ballar'],
    boardTop: 'Top 10',
    boardStreak: '{n} kunlik ketma-ketlik',
    boardCorrect: 'to‘g‘ri',
    boardPoints: 'ball',
    boardEmpty: 'Hali o‘yinchi yo‘q. Birinchi bo‘ling!',
    boardShowAll: 'Butun top 10 ni ko‘rsatish',
    boardShowLess: 'Kamroq ko‘rsatish',

    flight: {
      rule: 'Squawk qancha uchsa, shuncha · {gaps} ta darvoza raundni hisobga oladi',
      reward: 'Bitta to‘qnashuv o‘yinni tugatadi · har darvoza uchun +{points} · bir parvozda {max} gacha',
      goal: '{target} ta raundni hisobga oladi',
      hint: 'Qanot qoqish uchun ekranga bosing',
      resume: 'Davom ettirish uchun bosing',
      aria: 'Uchish o‘yini. Qanot qoqish uchun maydonga bosing.',
      crashed: 'Squawk ustunga urildi',
      resultScore: 'O‘tilgan darvozalar: {cleared}',
      motionTitle: 'Bu o‘yin harakatlanadi',
      motionBody:
        'Qurilmangiz kamroq harakat so‘raydi, bu o‘yin esa ekran bo‘ylab uzluksiz harakatdir — uning harakatsiz varianti yo‘q. Qolgan o‘yinlar viktorina va boshqotirma bo‘lib, joyida turadi. Baribir uchishni istasangiz, o‘yinning o‘zidan tashqari hamma narsa qimirlamaydi.',
      motionPlay: 'Baribir o‘ynash',
      motionBack: 'O‘yinlarga qaytish',
    },

    memory: {
      rule: '{pairs} juftlik · vaqt cheklovi yo‘q',
      reward: 'Tezroq yig‘sangiz ko‘proq ball · {points} gacha',
      pairs: 'Juftliklar {found} / {total}',
      moves: '{n} harakat',
      facedown: 'Yopiq karta',
      hint: 'Ikkita kartani ochib ko‘ring. Juftini topsangiz, so‘z sizniki.',
      resultScore: '{pairs} juftlik topildi',
    },

    wordGame: {
      rule: '{words} so‘z · osondan qiyingacha',
      reward: 'Qiyinroq so‘z ko‘proq ball beradi · maslahat bonusni oladi',
      lists: { pl: 'Polyakcha', en: 'Inglizcha' },
      tier: '{n}-daraja',
      undo: 'Orqaga',
      clear: 'Tozalash',
      reveal: 'Maslahat',
      next: 'Keyingi so‘z',
      finish: 'Natijani ko‘rish',
      correct: 'To‘g‘ri · +{points} ball',
      resultScore: '{total} dan {solved} ta so‘z yig‘ildi',
    },
  },

  listing: {
    setupEyebrow: 'Joyingizni sozlang',
    setupTitle: 'Biznesingiz haqida gapirib bering.',
    setupLede:
      'Bu yerdagi hamma narsa to‘g‘ridan-to‘g‘ri Paylez ilovasidagi kartangizga tushadi. Yulduzcha bilan belgilangan maydonlar karta ko‘rinishidan oldin to‘ldirilishi kerak.',

    screenTitle: 'Biznes profili',
    screenLede: 'Paylez ilovasidagi kartangiz, har bir mijoz uchun tarjima qilingan.',

    sections: {
      basic: 'Asosiy ma’lumot',
      where: 'Qayerdasiz',
      reach: 'Mijozlar sizga qanday bog‘lanadi',
      service: 'Xizmat va ish vaqti',
    },

    fields: {
      name: 'Biznes nomi',
      namePlaceholder: 'Eshigingiz ustidagi nom',
      category: 'Turkum',
      subcategory: 'Kichik turkum',
      description: 'Tavsif',
      descriptionPlaceholder: 'Nima qilishingiz va kim kelishi haqida ikki-uch qator.',
      descriptionHelp: 'Paylez buni boshqa tilda o‘qiydigan mijozlar uchun tarjima qiladi.',
      price: 'Odatdagi narx',
      pricePlaceholder: '25–45 zł',
      priceHelp: 'Bitta mijoz odatda qancha sarflaydi.',
      logo: 'Logotip',
      logoHelp: 'Kvadrat, kamida 512 px.',
      logoChoose: 'Fayl tanlash',

      country: 'Davlat',
      city: 'Shahar',
      cityPlaceholder: 'Krakov',
      street: 'Manzil',
      streetPlaceholder: 'Ko‘cha va bino raqami',
      maps: 'Google Maps havolasi',
      mapsHelp: 'Ilovadagi navigatsiya tugmasi shundan foydalanadi.',

      phone: 'Telefon',
      phonePlaceholder: '+48 123 456 789',
      email: 'Elektron pochta',
      emailPlaceholder: 'contact@business.com',
      emailError: 'Bu elektron pochta manziliga o‘xshamaydi.',
      website: 'Veb-sayt',
      instagram: 'Instagram',
      appStore: 'App Store havolasi',
      googlePlay: 'Google Play havolasi',
      appLinksShow: 'App Store va Google Play havolalarini qo‘shish',
      appLinksHide: 'Ilova havolalarini yashirish',

      spoken: 'Xodimlaringiz gapiradigan tillar',
      hours: 'Ish vaqti',
    },

    categories: [
      'Kafe',
      'Restoran',
      'Sartaroshxona',
      'Go‘zallik saloni',
      'Stomatologiya',
      'Til maktabi',
      'Fitnes',
    ],
    subcategories: [
      ['Maxsus qahva', 'Novvoyxona-kafe', 'Branch joyi', 'Choyxona'],
      ['Polyakcha', 'Gruzincha', 'Turkcha', 'Pitsa', 'Sushi'],
      ['Klassik sartarosh', 'Soqol va olish', 'Bolalar soch turmagi'],
      ['Tirnoq', 'Soch', 'Qosh va kiprik', 'Massaj'],
      ['Umumiy stomatologiya', 'Ortodontiya', 'Implantlar'],
      ['Chet elliklar uchun polyak tili', 'Ingliz tili', 'Imtihonga tayyorgarlik'],
      ['Sport zali', 'Yoga studiyasi', 'Boks klubi'],
    ],
    countries: ['Polsha', 'Ukraina', 'Gruziya', 'Turkiya', 'O‘zbekiston', 'Ozarbayjon'],
    spokenLanguages: ['Polyakcha', 'Inglizcha', 'Ukraincha', 'Ruscha', 'Turkcha', 'O‘zbekcha'],
    hoursDays: ['Dushanbadan jumagacha', 'Shanba', 'Yakshanba'],

    ready: {
      title: 'Ishga tushirishga tayyor',
      progress: '{percent}% to‘ldirilgan',
      stillNeeded: 'Yana kerak:',
      done: 'Barcha majburiy maydonlar to‘ldirilgan. Kartangiz ilovada ko‘rinmoqda.',
    },

    preview: {
      title: 'Ilovada qanday ko‘rinadi',
      cover: 'Muqova rasmi',
      name: 'Biznesingiz nomi',
      address: 'Manzilingizni qo‘shing',
      price: 'Narx so‘rov bo‘yicha',
      description: 'Mijozlar nima qilishingizni bilishi uchun qisqa tavsif yozing.',
      reviews: '312 sharh',
      note: 'Reyting va sharhlar soni ilovadagi mijozlardan keladi. Ularni bu yerda o‘zgartirib bo‘lmaydi.',
    },

    save: 'Saqlash va davom etish',
    saved: 'Saqlandi.',
    saveProfile: 'O‘zgarishlarni saqlash',
  },

  dashboard: {
    tag: 'Hamkor',
    groups: { grow: 'O‘sish', workspace: 'Ish maydoni' },
    screens: [
      { name: 'Umumiy ko‘rinish', lede: 'Paylez siz uchun nima qildi va bu qanchaga tushdi.' },
      { name: 'Qaynoq takliflar', lede: 'Paylez ilovasi lentasida ko‘rsatiladigan muddatli takliflar.' },
      { name: 'Sodiqlik kampaniyalari', lede: 'Doimiy mijozlar qaytib kelib yig‘adigan takrorlanuvchi mukofotlar.' },
      { name: 'Vaucherlar', lede: 'Ballar chegirmaga qanday aylanadi va bu sizga qanchaga tushadi.' },
      { name: 'Mijozlar', lede: 'Kim keladi, qachon keladi va qaytadimi.' },
      {
        name: 'Yordamchi',
        lede: 'Nima bo‘lishini ayting. Men sozlayman, ishga tushirishni siz hal qilasiz.',
      },
      { name: 'Skanerlashlar', lede: 'Kassangizdagi har bir QR skani, eng yangisidan boshlab.' },
      { name: 'Biznes profili', lede: 'Paylez ilovasidagi kartangiz, har bir mijoz uchun tarjima qilingan.' },
    ],
    empty: [
      {
        title: 'Joyingizda hali hech narsa ishlamayapti',
        body: 'Mijozlar sizni Paylez ilovasida faqat biror narsa faol bo‘lgandagina ko‘radi. Eng tez boshlash yo‘li — qaynoq taklif: boshlanish va tugash sanasi bo‘lgan, siz tanlagan soatlarda ishlaydigan ochiq taklif.',
        action: 'Birinchi taklifni yaratish',
      },
      {
        title: 'Hamma foydalana oladigan taklif ishga tushiring',
        body: 'Qaynoq taklif siz tanlagan auditoriya va soatlar uchun ilova lentasida paydo bo‘ladi va belgilangan kunda tugaydi. Kimdir uni olgandagina to‘laysiz.',
        action: 'Qaynoq taklif yaratish',
      },
      {
        title: 'Doimiy mijozlarni qaytgani uchun mukofotlang',
        body: 'Kampaniya tashriflarni sanaydi va siz belgilagan songa yetganda mukofot beradi. Kafe uchun yaxshi birinchi variant: to‘rt tashrif, bepul filtr qahva.',
        action: 'Kampaniya sozlash',
      },
      {
        title: 'Vaucher berishni boshlash uchun chegirma byudjetini belgilang',
        body: 'Chegirma byudjeti — bir oyda chegirmalarga beradigan eng katta summangiz. U tugagach vaucherlar to‘xtaydi, ya’ni rejalashtirganingizdan ko‘proq sarflay olmaysiz.',
        action: 'Byudjet belgilash',
      },
      {
        title: 'QR kodni kassaga qo‘ying',
        body: 'Mijozlar skanerlay boshlamaguncha bu sahifada hech narsa to‘lmaydi. Kodni chop eting, kassa yoniga qo‘ying va xodimlardan hisob bilan birga unga ishora qilishni so‘rang. Birinchi raqamlar o‘sha kuniyoq paydo bo‘ladi.',
        action: 'QR kodni olish',
      },
      {
        title: 'Nima bo‘lishini ayting',
        body: 'Men sizning tinch soatlaringizni, byudjetlaringizni va sizga o‘xshash joylarda nima ishlashini o‘qiyman, so‘ng hammasini tekshirishingiz uchun tayyorlab qo‘yaman. Siz nashr tugmasini bosmaguningizcha hech narsa ishga tushmaydi.',
        action: 'Suhbatni boshlash',
      },
      {
        title: 'Hozircha skanerlash yo‘q',
        body: 'Kassangizdagi har bir skanerlash bir necha soniyada shu yerga tushadi — kim kelgani, qancha sarflagani va mukofotga qanchalik yaqinligi.',
        action: 'QR kodni olish',
      },
    ],
    notWired: 'Bu versiyada ulanmagan.',

    unmeasured: {
      noSession:
        'Bu qurilma Paylez API’siga kirmagan, shuning uchun bu raqamlarning birortasini ham o‘qib bo‘lmaydi. Saytning o‘z kirishi hali API seansini yaratmaydi — shu paytgacha faqat operator konsoli ulana oladi.',
      serverSilent:
        'Server javob bermadi, shuning uchun bu yerda ko‘rsatadigan narsa yo‘q. Bu nol emas — biz so‘rab ololmadik.',
      asking: 'Raqamlaringiz serverdan o‘qilmoqda…',
      withheld: 'Berilmadi — buni kimligini oshkor qilmasdan aytish uchun odam juda kam.',
      noSource: 'Server buni hali xabar qilmaydi, shuning uchun bu panelda ko‘rsatadigan narsa yo‘q.',
      planLocked: 'Bu joyning tarifiga kirmagan.',
      monthOnly:
        'Raqamlar butun kalendar oy uchun beriladi — server shu oynada sanaydi. Yuqoridagi oraliq tanlagichi ularni hali qimirlatmaydi.',
      noFindings: 'Bu oy hech narsa ajralib turmadi.',
      tierUnit: 'Ularning har biri hisobdan {unit} chegiradi.',
      plan: 'Ko‘rsatadigan byudjet yo‘q — bu qurilma Paylez API’siga kirmagan.',
      assistant:
        'Biror narsa taklif qilishdan oldin men sizning tinch soatlaringizni, byudjetlaringizni va sizga o‘xshash joylarda nima ishlashini o‘qiyman — bu qurilma esa Paylez API’siga kirmagan, shuning uchun ularning hech birini o‘qiy olmayman. Men raqamni taxmin qilib, ostiga sizning nomingizni qo‘ymayman.',
      audience:
        'Bu qancha odamga yetib borishini hali ayta olmaymiz — server auditoriyani e’lon qilingan aksiya uchun hisoblaydi, bu esa hali qoralama.',
      quota:
        'Bu tarifda nechta bildirishnoma qolganini o‘qib bo‘lmaydi — bu qurilma Paylez API’siga kirmagan.',
    },

    findings: {
      quiet_window: 'Kuningizda to‘ldirishga arziydigan tinch oraliq bor.',
      cost_per_new_customer: 'Yangi mijoz narxingiz o‘zgardi.',
      second_visit_rate: 'Ikkinchi tashrif ulushingiz o‘zgardi.',
      new_customers: 'Ilgari hech qachon kelmagan mijozlar keldi.',
    },

    month: 'avgust',
    rangeLabels: ['oxirgi 7 kun', 'oxirgi 14 kun', 'oxirgi 30 kun', 'oxirgi chorak'],

    words: {
      edit: 'Tahrirlash',
      pause: 'To‘xtatish',
      remind: 'Ularga eslatish',
      ask: 'Yordamchidan so‘rash',
      open: 'Ochish',
      priority: '{n}-darajali',
      each: 'har biri {amount}',
      spent: 'Sarflangan',
      aside: 'Ajratilgan',
      available: 'Mavjud',
      costSoFar: 'Hozirgi xarajat',
      returned: 'Muddati o‘tib ishlatilmagan mukofotlardan shu oyda {amount} qaytdi.',
    },

    overview: {
      kicker: 'Paylez siz uchun nima qildi · {range}',
      countedLabel: 'Hisoblangan',
      counted: 'ta tashrif Paylez orqali',
      countedNew: 'shundan {n} tasi shu joyingizga birinchi marta kelgan mijozlar',
      estimateTag: 'Taxmin',
      estimate: 'savdoda taxminan {amount}',
      estimateNote:
        'Bu taxmin. Paylez orqali har bir tashrif sizning o‘z savdongizdan olingan {avg} o‘rtacha chekka ko‘paytirilgan.',
      claimTitle: 'Halol ravishda o‘zimizga yozib olishimiz mumkin bo‘lgani',
      claim: '{visits} ta tashrif · taxminan {amount}',
      claimNote:
        'Sizga birinchi marta kelgan mijozlarning tashriflari, ustiga olingan taklif yoki bildirishnoma turgan tashriflar. Qolganlari — baribir kelishi mumkin bo‘lgan doimiy mijozlar.',
      support: [
        { label: 'Paylez orqali tashriflar', note: 'QR skanlardan hisoblangan' },
        { label: 'Bir tashrifga o‘rtacha chek', note: 'savdongizdan, oxirgi 30 kun' },
        { label: 'Siz uchun yangi mijozlar', note: 'kassangizdagi birinchi skanerlash' },
      ],
      reachTitle: 'Sizni kim ko‘rdi',
      reachSeen: 'Ko‘rsatishlar',
      reachSeenNote: 'joyingiz yoki taklifingiz ekranda necha marta chiqdi',
      reachClicks: 'Bosishlar',
      reachClicksNote: 'batafsil o‘qish uchun necha marta ochildi',
      reachRate: 'Bosish darajasi',
      reachRateNote: 'yuz ko‘rsatishga necha bosish',
      reachSplit: 'Qayerdan kelgan',
      reachListing: 'Sizning e’loningiz',
      reachDeals: 'Faol takliflaringiz',
      reachFunnel: '{seen} ko‘rdi · {clicks} ochdi · {claims} foydalandi',
      reachEmpty: 'Hali hech kim ko‘rmadi. Taklif e’lon qilsangiz, ilova lentasiga tushasiz.',
      reachLive: 'Jonli raqamlar — e’loningiz va takliflaringiz bo‘yicha sanaldi.',
      reachSample: 'Namuna raqamlar — bu qurilma serverdan qamrovni o‘qimayapti.',
      budgetAlert:
        'Sodiqlik byudjetingiz {month} oyi tugashidan oldin tugashi kutilmoqda. Vaucherlarda {amount} ishlatilmay turibdi — bir qismini ko‘chiraymi?',
      budgetAction: 'Sodiqlik byudjetini ochish',

      costTitle: 'Paylez sizga qanchaga tushdi',
      costRows: [
        'Paylez to‘lovlari',
        'Berilgan sodiqlik mukofotlari',
        'Berilgan vaucher chegirmalari',
        'Qaynoq takliflar chegirmalari',
      ],
      costTotal: 'Jami',
      returnLabel: 'Paylez bilan bog‘lay oladigan savdo',
      roiGood:
        'Paylez {month} oyida sizga {cost} ga tushdi va taxminan {revenue} savdo bilan bog‘lanadi. Bu har sarflangan birlikka {n}× qaytim.',
      roiBad:
        'Paylez {month} oyida sizga {cost} ga tushdi va taxminan {revenue} savdo bilan bog‘lanadi. Bu ko‘rsata oladiganimizdan {gap} ko‘proq. Tashriflaringizning ko‘pi — baribir kelishi mumkin bo‘lgan doimiy mijozlar.',

      tiles: ['Tashriflar', 'Olingan takliflar', 'Ishlatilgan vaucherlar', 'Ishlatilgan mukofotlar'],
      since: 'oldingi davrga nisbatan',
      inMonth: '{month} oyida',

      proofTitle: 'Isbotlay oladigan yagona narsa',
      proof:
        'Sodiqlik kampaniyalaringizdagi mijozlar oyiga {after} marta keladi — qo‘shilishdan oldingi {before} martaga qarshi.',
      proofNote:
        'Sizning o‘z QR skanlaringizdan hisoblangan, taxmin emas. Kassa integratsiyasi kerak emas.',
      before: 'oldin',
      now: 'hozir',

      chartTitle: 'Tashriflar va vaucher ishlatilishi',
      chartNote:
        'Kassadagi har bir QR skanerlash mijozlar haqiqatan sarflagan vaucherlarga qarshi',
      chartVisits: 'Tashriflar',
      chartRedeemed: 'Ishlatilgan vaucherlar',

      holdingTitle: 'Siz ushlab turgan pul',
      holding:
        '{rewards} ta mukofot va {vouchers} ta vaucher ishlatilmay turibdi va byudjetingizning {amount} ini ushlab turibdi.',
      holdingNote:
        'Ularning har biri ortida shartni bajargan va hali qaytmagan mijoz turibdi. Muddati o‘tsa, pul byudjetga qaytadi.',

      noticed: 'Biz nimani sezdik',
      insights: [
        {
          text: 'Tashriflar 12% oshdi, lekin vaucher ishlatilishi 4% tushdi. Odamlar kelmoqda — ularni qaytarayotgani mukofotlar emas.',
          detail:
            'Shu oyda {pct}% bosqichiga atigi {reached} mijoz yetdi, chunki u {points} ball talab qiladi. {lower} ballda yana {more} doimiy mijozingiz shartni bajargan bo‘lardi.',
          action: '10% bosqichini o‘zgartirish',
        },
        {
          text: 'Bepul mahsulotli takliflaringiz foizli chegirmalarga qaraganda 2,4 barobar ko‘p olinadi.',
          detail:
            '«Pishiriqqa bepul filtr» {itemSeen} ko‘rishdan {itemClaims} marta olindi. {pctBadge} chegirmali «Ertalabki flat white» esa {pctSeen} ko‘rishdan {pctClaims} marta.',
          action: 'Takliflaringizni ko‘rish',
        },
        {
          text: '{n} ta sodiqlik mukofoti yig‘ilgan-u ishlatilmay turibdi, {amount} ni ushlab.',
          detail:
            'Bu mijozlar shartni bajarib, qaytib kelmadi. Eslatma odatda bir hafta ichida ularning uchdan birini olib keladi.',
          action: 'Ularga eslatish',
        },
      ],

      runningTitle: 'Hozir ishlab turgani',
      runningNote: 'Mijozlar bugun joyingizda ko‘ra oladigan yoki yig‘a oladigan hamma narsa',
      quota: 'Shu oyda {total} tadan {n} ta bildirishnoma qoldi',
      quotaOut: 'Shu oyda bildirishnoma qolmadi',
      kinds: { deal: 'Qaynoq taklif', campaign: 'Kampaniya', vouchers: 'Vaucherlar' },
      claims: 'olindi',
      usedEarned: 'ishlatilgan / yig‘ilgan',
      givenAway: 'tarqatilgan',
      notifySent: 'Bildirishnoma yuborildi',
      notifySet: 'Bildirishnoma rejalashtirildi',
      tierBundle: 'Uchta ball bosqichi',
      tierBundleRule: '5% · 10% · 15% chegirma · bitta oylik byudjet',
    },

    deals: {
      columns: [
        'Taklif',
        'Holat',
        'Ko‘rildi',
        'Ochildi',
        'Olindi',
        'Olish ulushi',
        'Xarajat',
        'Oxirgi 7 kun',
      ],
      rows: [
        'Ertalabki flat white',
        'Talabalar seshanbasi',
        'Pishiriqqa bepul filtr',
        'Yomg‘irli kunda ikki barobar shtamp',
        'Qo‘shni chegirmasi',
        'Tushlik to‘plami',
      ],
      when: [
        'Du–Ju, 07:00–10:00',
        'Se, 12:00–17:00',
        'Har kuni',
        'Har kuni',
        'Har kuni',
        'Du–Ju, 11:00–15:00',
      ],
      windows: [
        '3 avg – 31 avg',
        '1 iyul – 30 sen',
        '12 iyul – 12 avg',
        '15 avg – 15 okt',
        '5 iyul – 5 sen',
        '2 iyun – 30 iyun',
      ],
      audiences: [
        'Hamma',
        'Yaqinda kelganlar',
        'Kelishdan to‘xtaganlar',
        'Joyingiz uchun yangilar',
        'Rus tilida gaplashuvchilar',
      ],
      states: {
        draft: 'Qoralama',
        live: 'Faol',
        scheduled: 'Rejalashtirilgan',
        paused: 'To‘xtatilgan',
        expired: 'Muddati tugagan',
        ended: 'Yakunlangan',
      },
      search: 'Takliflaringiz orasidan qidirish',
      filters: ['Hammasi', 'Faol', 'Rejalashtirilgan', 'To‘xtatilgan', 'Muddati tugagan'],
      count: '{total} tadan {n} ta taklif',
      sortNote:
        'Olish ulushi bo‘yicha saralangan, eng yaxshisi yuqorida. Faol va rejalashtirilganlar birinchi turadi.',
      insight:
        'Bepul mahsulotli takliflaringiz foizli chegirmalarga qaraganda 2,4 barobar ko‘p olinadi. 5% li tushlik to‘plami sust ishladi — kichik chegirmalar odamlarni kamdan-kam qo‘zg‘atadi.',
      langsAll: 'Beshala tilda yozilgan',
      langsSome: '5 tildan {n} tasida yozilgan — qamrovning taxminan {pct}% i yo‘qolmoqda',
      notify: {
        none: 'Bildirishnomasiz',
        scheduled: 'Bildirishnoma rejalashtirilgan',
        sent: 'Bildirishnoma yuborilgan',
      },
      reach: '{total} odamdan {n} tasiga xabar berish mumkin',
      limit: '{limit} tadan {claimed} tasi olingan',
      limitAllowed: 'ruxsat etilgan {limit} tadan',
      noLimit: 'Olish chegarasi yo‘q',

      audienceNotes: [
        'Yaqin atrofda Paylez ilovasidan foydalanadigan har kim.',
        'So‘nggi 60 kun ichida Polshaga kelgan odamlar.',
        'Ilgari sizda bo‘lgan, lekin so‘nggi 30 kunda kelmagan.',
        'Yaqin atrofdagi, sizga hech qachon kelmagan ilova foydalanuvchilari.',
        'Ilova tili rus tili bo‘lgan odamlar.',
      ],

      funnelTitle: 'Nima bo‘ldi, bosqichma-bosqich',
      funnel: ['Ko‘rdi', 'Ochdi', 'Oldi'],
      funnelNotes: [
        'ilova lentasida',
        'ko‘rganlarning {pct}% i',
        'ochganlarning {pct}% i keldi',
      ],
      notStarted: 'hali boshlanmagan',
      drop: '{seen} kishi ko‘rdi va ochmadi. {opened} kishi ochdi va kelmadi.',
      dropNone: 'Bu taklif hali boshlanmagan, shuning uchun o‘lchaydigan narsa yo‘q.',

      notifyTitle: 'Bildirishnoma nima qildi',
      notifySteps: ['Xabar berildi', 'Ochdi', 'Keldi'],
      notifyStepNotes: [
        'bildirishnomalari yoqilgan odam',
        'xabar berilganlarning {pct}% i',
        'uni ochganlarning {pct}% i',
      ],
      notifySplit:
        'Bu taklifning {claims} ta olinishidan {camein} tasi bildirishnomadan keldi. Qolgan {alone} tasi uni ilovadan o‘zi topdi.',
      notifyBlocked:
        '{n} kishiga yuborildi. Yana {blocked} kishi mos kelgan, lekin yaqinda boshqa bildirishnomalar olgani uchun bunisini olmadi.',
      notifyScheduled:
        'Bildirishnoma soat {at} da bildirishnomalari yoqilgan {n} kishiga chiqadi.',
      notifyNone:
        'Bu taklifda bildirishnoma yo‘q. Mos keladigan {total} kishidan {n} tasining bildirishnomalari yoqilgan.',
      notifyChange: 'Vaqtni o‘zgartirish',
      notifyCancel: 'Bekor qilish',
      whoTitle: 'Kim ko‘radi va qachon',

      limitForecast: 'Shu sur’atda bu taklif {limit} ta olish chegarasiga taxminan {date} da yetadi.',
      limitDates: ['22-avgust', '', '', '', '', ''],
      retro:
        'U {weeks} hafta davom etdi va {claims} ta olinish berdi — 15% li takliflaringiz o‘rtachasining taxminan uchdan biri. Kattaroq chegirma yoki bepul mahsulotni sinab ko‘ring.',

      act: {
        draft: 'Tahrirlash',
        live: 'Pauza',
        paused: 'Davom ettirish',
        scheduled: 'Pauza',
        expired: 'Nusxalash',
        ended: 'Nusxalash',
      },
      pointsNote: 'Ball taklifi — kassada sizga hech narsaga tushmaydi',
      costEstimate: 'taxmin',
      costNone: 'chegirma xarajatisiz',
      notifyChips: {
        none: 'Bildirishnomasiz',
        scheduled: 'Bildirishnoma {at} ga',
        sent: 'Bildirishnoma yuborildi · {n} kishi keldi',
      },
      sortBy: 'Saralash: {column}',
      clearFilters: 'Filtrlarni tozalash',
      emptyFiltered: 'Hech narsa mos kelmadi',
      emptyFilteredBody:
        'Ro‘yxatingizdagi hech bir taklif siz qo‘ygan qidiruv va filtrga mos kelmadi. Oltalasini yana ko‘rish uchun ularni tozalang.',
    },

    campaigns: {
      rows: ['Doimiylar mukofoti', 'Qahva ketma-ketligi', 'Tushlik klubi', 'Qishki qaytish'],
      rewards: [
        'bepul filtrli qahva',
        'bepul tort bo‘lagi',
        'tushlikka {amount} chegirma',
        'bepul issiq shokolad',
      ],
      since: [
        '12-yanvardan beri ishlaydi',
        '4-apreldan beri ishlaydi',
        '2-iyunda boshlangan',
        '28-martda to‘xtatilgan',
      ],
      rule: '{visits} tashrif → {reward}',
      visitRule:
        'Kuniga bitta tashrif hisobga olinadi. Mukofot yig‘ilgandan 60 kun keyin kuchini yo‘qotadi.',
      earned: 'Yig‘ilgan',
      used: 'Ishlatilgan',
      unused: '{n} tasi yig‘ilgan-u hech ishlatilmagan',
      usedRate: '{pct}% ishlatilgan',
      gapTitle: 'Kuzatish kerak bo‘lgan raqam — bu farq',
      gapLede:
        'Yig‘ilgan-u ishlatilmagan mukofot mijoz shartni bajarib, qaytib kelmaganini bildiradi.',
      gap: 'Hozir eng katta farq «{name}»da: {n} ta ishlatilmagan mukofot.',
      totals: ['Yig‘ilgan', 'Ishlatilgan', 'Kutmoqda'],
      remindLabel: '{n} mijozga eslatish',
      remindNote: 'Ular mukofot yig‘ib, uni olishga qaytmadi.',
      remindResult: 'O‘tgan safar {of} tadan {back} tasi bir hafta ichida keldi.',
      remindSetup: 'Buni men uchun sozlang',
      near: '{n} doimiy mijoz keyingi mukofotidan bitta tashrif narida.',
      rebalance:
        'Sodiqlik byudjetingiz {date} da tugashi kutilmoqda. Vaucherlarda {amount} ishlatilmay turibdi — bir qismini ko‘chiraymi?',
      rebalanceAction: 'Byudjetni ko‘chirish',
      budgetTitle: 'Sodiqlik byudjeti',
      budgetLede:
        'Shu oyda sodiqlik mukofotlari uchun ajratganingiz. Qaynoq takliflar bunga kirmaydi.',
      spentNote: 'Mijozlar haqiqatan olgan mukofotlar.',
      asideNote:
        'Mijozlar yig‘gan-u hali ishlatmagan mukofotlar uchun ajratilgan pul. Muddati o‘tsa, u qaytadi.',
      availableNote: 'Yangi mukofotlar uchun hozir bo‘sh.',
      forecast: 'Shu sur’atda sodiqlik byudjeti {date} gacha yetadi.',
      forecastOut: 'Sodiqlik byudjeti tugadi. Yangi mukofotlar berilmay qoladi.',
      forecastSafe: 'Shu sur’atda sodiqlik byudjeti butun {month} oyiga yetadi.',
      pausedNote:
        'To‘xtatilgan. A’zolar yig‘ganini saqlab qoladi, yangisi hisobga olinmaydi.',
    },

    vouchers: {
      alertTitle: 'Chegirma byudjetingiz tugab bormoqda',
      alertBody:
        'Hozirgi sur’atda u {date} da tugaydi va keyingi oygacha vaucherlar berilmay qoladi.',
      alertAction: 'Byudjetni oshirish',
      budgetTitle: 'Vaucherlar byudjeti',
      budgetLede:
        'Uchala bosqich uchun bitta umumiy jamg‘arma. Bu kassangizdan chiqadigan haqiqiy pul, ikkala funksiya uchun umumiy summani shu yerda belgilaysiz.',
      budgetLabel: 'Umumiy chegirma byudjeti',
      allocNote:
        'Chiziq nima ketganini va nima ajratilganini ko‘rsatadi. Faqat och qismi hali sizniki.',
      spent: 'Sarflangan',
      spentNote: 'Ketdi. Mijozlar haqiqatan ishlatgan vaucherlardagi chegirmalar.',
      held: 'Ajratilgan',
      heldNote:
        'Mijozlar yig‘gan-u hali ishlatmagan vaucherlar uchun ajratilgan pul. Muddati o‘tsa, u qaytadi.',
      free: 'Mavjud',
      freeNote: 'Yangi vaucherlar uchun hozir bo‘sh.',
      forecast: 'Shu sur’atda byudjet {date} gacha yetadi.',
      forecastOut: 'Byudjet tugadi. Yangi vaucherlar berilmayapti.',
      forecastSafe: 'Shu sur’atda byudjet butun {month} oyiga yetadi.',
      buysTitle: 'Qolgani nimaga yetadi',
      buys: 'yana taxminan {n} ta vaucher',
      buysNote: 'Mijozlaringiz hozir yetayotgan bosqichlar nisbatida.',
      avgTitle: 'O‘rtacha tranzaksiya',
      avgNote: 'Oxirgi 30 kunlik savdongizdan olingan. Noto‘g‘ri ko‘rinsa, o‘zgartiring.',
      maxTitle: 'Bitta vaucherdan eng ko‘pi',
      maxNote:
        'Buyurtma qanchalik katta bo‘lmasin, birorta vaucher hisobdan bundan ko‘pini olmaydi.',
      tiersTitle: 'Kim qaysi bosqichga yetadi',
      tiersLede:
        'Bosqichlar pul ushlab turmaydi. Bosqichga ballar olib boradi, ya’ni raqamni oshirsangiz, u yoqqa byudjet kamroq ketadi.',
      columns: ['Bosqich', 'Kerakli ball', 'Berilgan', 'Ishlatilgan', 'Hozirgi xarajat'],
      tier: '{n}% chegirma',
      tierDetail: 'Har biri hisobdan {unit} oladi. Bu bosqich puldan hozirgacha sarflanganining {pct}% qismi.',
      pointsUnit: 'ball',
      pointsOrder: 'Kattaroq chegirma kichikrog‘idan kam ball turishi mumkin emas.',
      tryNote:
        'Puldan nima bo‘lishini ko‘rish uchun bu yerga boshqa qiymat yozing. Hech narsa saqlanmaydi — sahifani yangilasangiz, haqiqiy raqamlaringiz qaytadi.',
      points: '{n} ball',
      mixTitle: 'Pul qayerga ketdi',
      returnedTitle: 'Qaytgan pul',
      returnedNote:
        'Muddati o‘tib ishlatilmagan vaucherlardan shu oyda qaytdi. Uni yana sarflash mumkin.',
      suggestion: 'Taklif',
      insight:
        '{n}% bosqichingiz byudjetning ko‘p qismini yeydi. Pulni sodiq mijozlar uchun saqlamoqchi bo‘lsangiz, uning ball chegarasini ko‘taring.',
    },

    customers: {
      costKicker: 'Yangi mijoz sizga qanchaga tushadi',
      costUnit: 'har biri, {month} oyida',
      costLine:
        '{month} oyida {cost} sarfladingiz va joyingiz uchun yangi bo‘lgan {n} ta mijoz oldingiz. Bu har biriga {each}.',
      costBreakdown: [
        'Paylez to‘lovlari',
        'Sodiqlik mukofotlari',
        'Vaucher chegirmalari',
        'Qaynoq takliflar chegirmalari',
      ],
      costFinding:
        'Har bir yangi mijoz {month} oyida sizga {now} ga tushdi — iyundagi {then} ga qarshi. Bu pasayishning ko‘p qismi bepul mahsulotli taklifingizdan.',
      costAction: 'Takliflaringizni ko‘rish',
      trendTitle: 'Oxirgi uch oy',
      trendMonths: ['Iyun', 'Iyul', 'Avgust'],
      spendByMonth: 'Sizdagi xarajatlar, oylar bo‘yicha',
      benchmark:
        'Paylezdagi o‘rtacha Krakov kafesi har bir yangi mijoz uchun {amount} to‘laydi. Bu sizga o‘xshash joylardan olingan taxmin, va’da emas.',

      rosterTitle: 'Mijozlaringiz',
      rosterIntro:
        '{total} mijozingizdan {n} tasi profil ulashishni yoqdi, shuning uchun ularni ism bilan ko‘rasiz. Qolganlarning hammasi quyidagi umumiy raqamlarda qoladi.',
      rosterCount: '{n} tasi ulashmoqda',
      rosterColumns: ['Mijoz', 'Sarfladi', 'Tashriflar', 'Oxirgi marta', 'Holat'],
      rosterFilters: ['Hamma', 'Doimiylar', 'Ketganlar', 'Yangilar'],
      withdrew:
        'Ulashishni istalgan vaqtda o‘chirish mumkin. Shunda odam bu ro‘yxatdan tushadi va uning tarixi sizga ko‘rinmay qoladi.',
      statuses: { regular: 'Doimiy', lapsed: 'Ketgan', new: 'Yangi' },
      today: 'Bugun',
      daysAgo: '{n} kun oldin',
      dayAgo: 'kecha',
      stamps: '{of} tadan {done} ta shtamp',
      tierProgress: '{n}% bosqichi',

      whenTitle: 'Ular qachon keladi',
      whenLede:
        'O‘rtacha bir haftadagi kassadagi har bir QR skanerlash. To‘qroq — gavjumroq degani.',
      days: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
      heatCell: 'oddiy haftada taxminan {n} ta tashrif',
      quietFinding:
        'Seshanba va chorshanba, 14:00 dan 16:00 gacha — eng tinch soatlaringiz, haftalik o‘rtachadan taxminan 60% past.',
      quietAction: 'Buni men uchun sozlang',
      quietSelf: 'O‘zim qilaman',
      peakFinding:
        'Eng gavjum soatlar — ish kunlari 08:00 dan 10:00 gacha. Ertalabki taklifingiz allaqachon shunda ishlaydi, shuning uchun u yerda chegirmani chuqurlashtirishdan foyda kam.',

      nationCount: '{n} ta mijoz · {pct}%',
      readTitle: 'Mijozlaringiz qaysi tilda gaplashadi',
      readLede:
        'Bu chiziqlar mijozlar guruhlari bo‘yicha hisoblanadi, hech qachon bitta odam bo‘yicha emas. 10 tadan kichik guruhlar «boshqalar»ga qo‘shiladi.',
      langKicker: 'Ular Paylezda ishlatadigan til',
      langs: ['Ruscha', 'Ukraincha', 'Polyakcha', 'Inglizcha', 'Boshqa'],
      langFinding:
        'Mijozlaringizning 42 foizi ilovadan ruscha foydalanadi, lekin faol takliflaringizdan birortasi ham rus tilida yozilmagan.',
      langAction: 'Ular uchun taklif yaratish',
      privacy:
        'Bu yerdagi hamma narsa guruhlar bo‘yicha hisoblanadi. Paylez hech qachon alohida odamni ko‘rsatmaydi, o‘ntadan kichik guruhlar esa «boshqalar»ga qo‘shiladi.',

      backTitle: 'Ular qaytadimi',
      backLede: 'Birinchi marta kelganlar va ulardan nechtasi 30 kun ichida qaytgani',
      months: ['Aprel', 'May', 'Iyun', 'Iyul'],
      monthNames: [
        'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
        'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
      ],
      cohort: '{first} dan {back} tasi · {pct}%',
      backFinding:
        '{month} oyida {first} kishi sizga birinchi marta keldi. {back} tasi 30 kun ichida qaytdi — {pct}%.',
      lapsedFinding:
        'Doimiy mijozlaringizdan {n} tasi 30 kundan beri kelmadi. Ilgari ular haftada bir marta kelardi.',

      compareTitle: 'Boshqalar bilan qanday ko‘rinasiz',
      compareNote:
        'Paylezdagi boshqa {n} ta Krakov kafesi bilan solishtirildi. Raqamlar joylar bo‘yicha o‘rtachalanadi, hech qachon bittalab ko‘rsatilmaydi.',
      compareRows: [
        'Taklif olish ulushi',
        '30 kun ichida ikkinchi tashrif',
        'Yangi mijoz narxi',
      ],
      compareThem: 'boshqalarda o‘rtacha {amount}',
      roiTitle: 'Pulingiz qayerda ishlaydi',
      roiLede: 'Uchta vositangizning har biri {month} oyida qanchaga tushdi va nima sotib oldi',
      roiRows: ['Sodiqlik kampaniyalari', 'Qaynoq takliflar', 'Vaucherlar'],
      roiUnits: ['takroriy tashrif', 'olingan taklif', 'ishlatilgan vaucher'],
      roiPer: ['bir takroriy tashrifga', 'bir olishga', 'bir ishlatishga'],
      roiLine: '{cost} sarflangan · {n} {unit}',

      patterns: [
        'Ish kunlari ertalab, ko‘pincha 9 gacha',
        'Ish kunlari ertalab',
        'Dam olish kunlari, kech ertalab',
        'Ilgari juma kunlari tushdan keyin kelardi',
        'Ikki tashrif, ikkalasi ham tushdan keyin',
        'Ish kunlari tushlik',
        'Dam olish kunlari ertalab',
        'Tushdan keyin, turli kunlarda',
        'Deyarli har ish kuni ertalab',
        'Uch tashrif, tushdan keyin',
        'Seshanba doimiysi edi',
        'Dam olish kunlari',
        'Birinchi tashrif ikki kun oldin',
        'Payshanba tushdan keyin, so‘nggi paytda kamroq',
      ],
      rewards: [
        '15% bosqichi — eng ko‘p sarflovchingiz',
        'Bepul qahvagacha bitta shtamp',
        '10% bosqichi',
        '10% bosqichi — sovumoqda',
        '4 tadan 1 ta shtamp',
        'Bepul qahva olishga tayyor',
        '4 tadan 2 ta shtamp',
        '15% bosqichi',
        '10% bosqichi — ketgan',
        '10% bosqichi — sekinlashmoqda',
      ],
    },

    scans: {
      columns: [
        'Qachon',
        'Mijoz',
        'Birinchi tashrifmi?',
        'Sarfladi',
        'Ballar',
        'Chek',
        'Qayerda',
        'Mukofotgacha jarayon',
      ],
      filters: ['Hamma', 'Birinchi tashrif', 'Qaytib keldi'],
      first: 'Birinchi tashrif',
      again: 'Qaytib keldi',
      today: 'Bugun',
      places: ['Bratislavska 6', 'Bratislavska 6', 'Kleparz kioski'],
      noCampaign: 'Kampaniya ishlamayapti',
      progress: '{need} tadan {done} ta skanerlash',
      toGo: 'yana {n} ta',
      ready: 'mukofot tayyor',
      count: '{n} ta skanerlash',
      showing: '{total} tadan {n} tasi ko‘rsatilmoqda',
      page: '{total} tadan {from}–{to} ko‘rsatilmoqda',
      prev: 'Oldingi',
      next: 'Keyingi',
      coords: 'Kassa',
    },
    actions: {
      newDeal: 'Qaynoq taklif yaratish',
      newCampaign: 'Kampaniya yaratish',
      exportCsv: 'CSV eksport',
      preview: 'Kartani ko‘rish',
      exported: 'CSV faylingiz yuklanmoqda.',
      previewing: 'Kartangiz ko‘rinishini ochyapman.',
    },

    drawer: {
      close: 'Yopish',
      cancel: 'Bekor qilish',
      later: 'Saqlab, keyinroq tugatish',
      deal: {
        kicker: 'Yangi qaynoq taklif',
        title: 'Qaynoq taklif yaratish',
        sub: 'Ilova lentasidagi muddatli taklif. Kimdir uni olmaguncha hech narsa yechilmaydi.',
        publish: 'Taklifni nashr qilish',
        copyTitle: 'Sarlavha va tavsif',
        titleLabel: 'Taklif sarlavhasi',
        titlePlaceholder: 'Ertalabki flat white',
        descLabel: 'Tavsif',
        descPlaceholder: 'Mijoz nima olishini bir-ikki qisqa qatorda yozing.',
        translateNote: 'Paylez buni boshqa tilda o‘qiydigan mijozlar uchun tarjima qiladi.',
        copyError: 'Taklif ishga tushishidan oldin unga sarlavha va tavsif kerak.',
        kindTitle: 'Qanday taklif',
        kinds: ['Foizli chegirma', 'Bepul mahsulot', 'Summali chegirma', 'Qo‘shimcha shtamp'],
        discountTitle: 'Chegirma va sanalar',
        badgeLabel: 'Chegirma matni',
        badgeNote: 'Qisqa va aniq. Mijozlar avval shuni ko‘radi. Ko‘pi bilan 14 belgi.',
        from: 'Boshlanish',
        to: 'Tugash',
        windowError: 'Tugash sanasi boshlanish sanasidan oldin.',
        whenTitle: 'Qaysi kunlar va soatlar',
        hourFrom: 'Dan',
        hourTo: 'Gacha',
        whenNote: '{days}, {from}–{to} ishlaydi. Buni tinch soatlaringizni to‘ldirish uchun ishlating.',
        everyDay: 'har kuni',
        noDays: 'hali kun tanlanmagan',
        audienceTitle: 'Kim ko‘radi',
        audienceEstimate: 'Bunga taxminan {n} kishi mos keladi, ulardan {notifiable} tasiga xabar berish mumkin.',
        notifyTitle: 'Odamlarga xabar berish',
        notifySwitch: 'Bu taklif bo‘yicha bildirishnoma yuborish',
        notifyQuota: 'Bu oyda {total} tadan {n} tasi qoldi.',
        notifyOutTitle: 'Bu oyda {total} tasini ham ishlatib bo‘ldingiz',
        notifyOutBody:
          'Hisob oyning birinchi kuni nolga tushadi. Growth tarifida ular ko‘proq, taklif esa bildirishnomasiz ham ishlaydi — shunchaki kimdir ilovani ochishini kutadi.',
        notifyPlan: 'Growth tarifini ko‘rish',
        notifyWhen: 'Qachon chiqadi',
        notifySuggested: 'Auditoriyangiz ilovani ko‘pincha taxminan {at} da ochadi.',
        useSuggested: '{at} ni qo‘yish',
        quietNote: 'Nima qo‘ysangiz ham, 21:00 dan 08:00 gacha hech narsa chiqmaydi.',
        notifyWho: 'Kim oladi',
        notifyReach: '{total} tadan {n} tasining bildirishnomalari yoqilgan.',
        notifyWhoNote: 'Buni yuqoridagi “Kim ko‘radi” bo‘limida o‘zgartiring',
        notifyText: 'Unda nima yozilgan',
        notifyTextNote: 'Taklif sarlavhasidan olingan. Xohlasangiz qisqartiring — ko‘pi bilan 64 belgi.',
        stopTitle: 'Qachon to‘xtashi kerak',
        stopOptions: [
          { label: 'Tugash sanasida', note: 'Belgilangan sanagacha ishlaydi, bir kun ham ortiq emas.' },
          { label: 'Ma’lum sondagi olishdan keyin', note: 'Yetarlicha odam foydalangach o‘zi to‘xtaydi.' },
          { label: 'Summaga yetganda', note: 'Chegirmalar belgilangan summaga yetgach o‘zi to‘xtaydi.' },
        ],
        stopClaims: 'Eng ko‘p olish soni',
        stopMoney: 'Shu summaga yetganda to‘xtatish',
        claims: 'olish',
        stopNote:
          'Qaynoq takliflar sodiqlik yoki vaucher byudjetidan foydalanmaydi. Ularni aynan shu chegara to‘xtatadi.',
        termsTitle: 'Taklifdan foydalanish qoidalari',
        termsPlaceholder: 'Bir tashrifga bitta olish. Boshqa takliflar bilan qo‘shilmaydi.',
        previewTitle: 'Mijozlar buni qanday ko‘radi',
        previewClaim: 'Olish',
        previewUntitled: 'Taklifingiz sarlavhasi',
        previewNoDesc: 'Tavsifingiz shu yerda chiqadi.',
        previewLimitNone: 'Olish chegarasi yo‘q',
        previewLimitClaims: '{n} ta olishdan keyin to‘xtaydi',
        previewLimitMoney: '{amount} ga yetganda to‘xtaydi',
      },
      campaign: {
        kicker: 'Yangi sodiqlik kampaniyasi',
        title: 'Sodiqlik kampaniyasini yaratish',
        sub: 'Doimiy mijozlar qaytib kelib yig‘adigan mukofot. Kimdir shartni bajargan zahoti summa sodiqlik byudjetidan ajratib qo‘yiladi.',
        publish: 'Kampaniyani boshlash',
        nameLabel: 'Kampaniya nomi',
        namePlaceholder: 'Qahva seriyasi',
        nameNote: 'Bu nomni faqat siz ko‘rasiz. Mijozlar mukofotni ko‘radi.',
        nameError: 'Keyin topa olishingiz uchun kampaniyaga nom bering.',
        visitsTitle: 'Nechta tashrif',
        visits: 'tashrif',
        visitsHelp: 'Mijoz mukofotni {n}-tashrifda oladi, so‘ng yangidan boshlaydi.',
        visitsMinus: 'Bitta kam tashrif',
        visitsPlus: 'Bitta ko‘p tashrif',
        rewardTitle: 'Ular nima oladi',
        rewardKinds: ['Bepul mahsulot', 'Summali chegirma'],
        rewardItemPlaceholder: 'bepul filtrli qahva',
        rewardItemNote: 'Mijoz ilovada o‘qiydigan tarzda yozing.',
        rewardOff: 'chegirma',
        rewardError: 'Mijoz nima olishini yozing.',
        costTitle: 'Bu sizga qanchaga tushadi',
        costEach: 'har safar',
        costNote:
          'Kampaniyalaringiz qanchaga tushayotganini kuzatish uchun shundan foydalanamiz. Bu kimdir shu mukofotni yig‘gan har safar sodiqlik byudjetingizdan ajratiladigan summa.',
        project: 'mijoz',
        projection: 'Agar {n} mijoz uni tugatsa, bu sodiqlik byudjetingizdan {amount} bo‘ladi.',
        priorityTitle: 'Ikki kampaniya bitta tashrifga mos kelganda',
        priorityLede:
          'Mijoz bitta tashrifda bir nechta kampaniyaga mos kelishi mumkin. Faqat bitta mukofot beriladi: ustuvorlik raqami kichigi.',
        priorityHelp: '5 tadan {n}-ustuvorlik. Kichigi yutadi.',
        rulesTitle: 'Mayda qoidalar',
        expiry: 'Mukofot muddati',
        days: 'kun',
        expiryNote: 'Shundan keyin mukofot yo‘qoladi, pul esa byudjetingizga qaytadi.',
        minSpend: 'Bir tashrifdagi eng kam summa',
        minSpendNote: 'Kichikroq tashriflar hisoblanmaydi. Kuniga bir mijozga bitta skanerlash.',
        summaryTitle: 'Kampaniyangiz bir qatorda',
        summary: '{visits} ta tashrif, so‘ng {reward}. Kimdir uni tugatgan har safar sizga {amount} ga tushadi.',
        summaryNote:
          'Pul mijoz shartni bajargan paytda sodiqlik byudjetidan ajratiladi, u mukofotdan foydalanganda emas. Mukofot muddati o‘tsa, pul qaytadi.',
        summaryReward: 'mukofot',
      },
      valid: 'Nashrdan oldin yuqoridagi {n} ta narsani tuzating.',
      validPlural: 'Nashrdan oldin yuqoridagi {n} ta narsani tuzating.',
    },

    assistant: {
      knowTitle: 'Joyingiz haqida nimalarni bilaman',
      intro:
        'Joyingizda nima bo‘lishini ayting. Men buni sozlayman, qanchaga tushishini ko‘rsataman va nashrni sizga qoldiraman. Tugmani bosmaguningizcha hech narsa ishga tushmaydi.',
      knows: [
        'Eng tinch soatlaringiz — {days}, {from}–{to}, haftalik o‘rtachadan taxminan {pct}% past.',
        'Mijozlaringizning {pct}% i ilovadan rus tilida foydalanadi, ammo faol takliflaringizdan birortasi ham rus tilida yozilmagan.',
        'Shahringizdagi {n} ta qahvaxonada bepul mahsulotli takliflar foizli chegirmalarga qaraganda taxminan {x}× ko‘proq olinadi.',
        'Bu oyda vaucherlarda {vouchers} va sodiqlikda {loyalty} sarflanmagan holda turibdi.',
      ],

      optionsTitle: 'Nima qila olasiz',
      optionsIntro: 'Raqamlaringizda ko‘rayotganimga asoslangan aniq boshlanishlar. Muhokama qilish uchun bosing.',
      options: [
        {
          name: 'Tinch soatlarni to‘ldirish',
          desc: '{days}, {from}–{to} — o‘rtachadan taxminan {pct}% past.',
          seed: 'Tinch seshanba kunlarini to‘ldiring',
        },
        {
          name: 'Kelishdan to‘xtagan mijozlarni qaytarish',
          desc: '{n} ta doimiy mijoz, oxirgi marta 30 kundan avval kelgan.',
          seed: 'Kelishdan to‘xtagan {n} ta doimiy mijozni qaytaring',
        },
        {
          name: 'Ishlab turgan hamma narsani ko‘rib chiqish',
          desc: 'Shu hafta o‘zgartirishga arzigulik uchta narsa.',
          seed: 'Ishlab turgan hamma narsani ko‘rib chiqing va nimani tuzatish kerakligini ayting',
        },
        {
          name: 'Nega vaucherlardan foydalanish kamaydi?',
          desc: 'Bu oyda 4% ga — qayerdaligini ko‘rsata olaman.',
          seed: 'Nega bu oyda vaucherlardan foydalanish kamaydi?',
        },
      ],

      convTitle: 'Yordamchi bilan gaplashing',
      reset: 'Boshidan boshlash',
      opening:
        'Joyingizda nima bo‘lishini ayting — o‘z so‘zlaringiz bilan, Paylez biladigan besh tildan istalganida. Bir-ikki qisqa savol beraman, qanchaga tushishini ko‘rsataman va nashrni sizga qoldiraman.',
      chipsHint: 'Bittasini bosing yoki javobingizni quyida yozing.',
      send: 'Yuborish',
      placeholders: {
        idle: 'Joyingizda nima bo‘lishini ayting',
        reward: 'Bepul qahva yoki foizli chegirma — yoki o‘zingizcha ayting',
        budget: 'Taxminan {a}, {b} yoki {c}?',
        duration: '2, 4 yoki 8 hafta?',
        notify: 'Ha yoki yo‘q?',
        ready: 'Qoralamani ko‘rsatishimdan oldin biror narsani o‘zgartiraymi?',
      },
      composerNote:
        'Men Paylez biladigan besh tilning hammasida o‘qiyman. Ishlatadigan har bir raqamim sizning ma’lumotlaringizdan yoki sizga o‘xshash joylardan olinadi — hech birini o‘ylab topmayman.',

      goalOpen: {
        quiet:
          'Eng tinch payt — {days}, {from}–{to}, haftalik o‘rtachadan taxminan {pct}% past. Men o‘shanda qisqa taklif ishga tushirardim. Odamlar nima olishi kerak?',
        lapsed:
          'Doimiy mijozlaringizdan {n} tasi 30 kundan ortiq vaqtdan beri kelmagan. Ularga qaratilgan taklif bir qismini qaytarishi mumkin. Ular nima olishi kerak?',
        new: 'Yangi mehmonlar ko‘pincha lentada ko‘rgan bitta aniq va sodda taklif tufayli keladi. Yangi odamlar nima olishi kerak?',
      },
      askBudget: {
        item:
          'Bepul filtrli qahva, yaxshi. Sizga o‘xshash joylarda bepul mahsulotli takliflar foizli chegirmaga qaraganda taxminan {x}× ko‘proq olinadi va har biri sizga qat’iy {amount} ga tushadi. Bu oyda bunga qancha ajratmoqchisiz?',
        percent:
          'Mayli, 20% chegirma. U hisob kattaligiga bog‘liq, shuning uchun summa bo‘yicha to‘xtatishni qo‘shaman. Bu oyda bunga qancha ajratmoqchisiz?',
      },
      askDuration:
        '{amount}. Qaynoq takliflar sodiqlik yoki vaucher jamg‘armasidan chiqmaydi, ya’ni bu sizning marjangizdan ketadigan pul. U qancha davom etsin?',
      askNotify:
        '{n} hafta. Bu oyda {total} tadan {left} tasi bildirishnoma qoldi — boshlanishida bittasini yuboraymi? Usiz ko‘pchilik taklifni faqat ilovani ochsagina ko‘radi.',
      ready:
        'Mana men sozlaydigan narsa{notify}. Hozircha hech narsa faol emas — u faqat siz nashrni bosganingizda chiqadi. Qoralamaga qarang.',
      readyNotify: ', boshlanishida bildirishnoma bilan',
      retry: {
        reward: 'Yaxshi tushunmadim — bepul filtrli qahvami yoki hisobdan foizmi?',
        budget: 'Oyiga taxminan qancha — {a}, {b} yoki {c}?',
        duration: 'Qancha davom etsin — 2, 4 yoki 8 hafta?',
        notify: 'Boshlanishida bildirishnoma yuboraymi — ha yoki yo‘q?',
        other: 'Bularning hammasini qoralamada o‘zgartira olasiz. Ko‘rsataymi?',
      },
      chips: {
        item: 'Bepul filtrli qahva',
        percent: 'Hisobdan 20%',
        weeks: '{n} hafta',
        yes: 'Ha, yuboring',
        no: 'Yo‘q, shunchaki joylashtiring',
      },

      readyTitle: 'Men nimani sozlagan bo‘lardim',
      readyRows: ['Maqsad', 'Odamlar nima oladi', 'Kunlar va soatlar', 'Byudjet', 'Davomiyligi', 'Bildirishnoma'],
      showDraft: 'Qoralamani ko‘rsat',

      draftTag: 'Qoralama',
      draftNote: 'Bu yerda hech narsa faol emas. U faqat siz nashr qilganingizda chiqadi.',
      changedTitle: 'Men nimani o‘zgartirdim',
      changedNote: 'Boshqa hech narsa qimirlamadi. Qolgan hamma maydon avvalgidek.',
      sentence: {
        item: 'Har qanday pishiriqqa bepul filtrli qahva, {days} {from}–{to}, keyingi {weeks} hafta davomida.',
        percent: 'Hisobdan 20% chegirma, {days} {from}–{to}, keyingi {weeks} hafta davomida.',
      },
      whyTitle: 'Nega shuni tanladim',
      reasons: {
        quietDays:
          'Men {days}, {from}–{to} ni tanladim, chunki bu sizning eng tinch soatlaringiz — haftalik o‘rtachadan taxminan {pct}% past.',
        movedDays:
          'Siz {days} ni so‘radingiz, men ko‘chirdim. Eng tinch soatlaringiz hamon {quiet}, {from}–{to}, agar qaytmoqchi bo‘lsangiz.',
        item:
          'Bepul mahsulotni tanladim, chunki bunday takliflar shahringizdagi {n} ta joyda foizli chegirmalarga qaraganda taxminan {x}× ko‘proq olinadi va har safar qat’iy {amount} ga tushadi.',
        percent:
          'Siz foizli chegirma so‘radingiz, men 20% qo‘ydim. Xarajat hisob kattaligiga bog‘liq, shuning uchun to‘xtatish shartini qo‘shdim.',
        budget: 'Byudjetni {amount} qilib qo‘ydim, chunki bu oyda shuncha sarflay olishingizni aytdingiz.',
        budgetTight:
          'Byudjetni {amount} qilib qo‘ydim, chunki bu oyda qaynoq takliflar marjangizni yey boshlaguncha shuncha qoladi.',
      },
      dealTag: 'Qaynoq taklif',
      dealNew: 'Yangi — yaratiladi',
      dealFields: ['Bu nima', 'Kunlar va soatlar', 'Davomiyligi', 'Kim ko‘radi'],
      dealValues: {
        item: 'Bepul mahsulot — har qanday pishiriqqa filtrli qahva',
        percent: 'Foizli chegirma — hisobdan 20%',
      },
      stopAfter: 'Shundan keyin to‘xtaydi',
      claims: 'olish',
      fieldNote:
        'Kunlar, soatlar, sanalar va auditoriya men yuqorida tushuntirganday qo‘yilgan. Ularning istalganini to‘liq shaklda o‘zgartiring.',
      notifyTag: 'Bildirishnoma',
      notifyAttached: 'Yuqoridagi taklifga biriktirilgan',
      goesOut: 'Chiqadi',
      notifyFields: ['Yetib boradi', 'Sarflaydi'],
      notifyReach: 'bildirishnomalari yoqilgan {n} kishi',
      notifyUses: 'bu oyda qolgan {n} ta bildirishnomangizdan 1 tasi',
      costTitle: 'Bu qanchaga tushadi',
      costLine: {
        item: 'Agar buni {n} kishi olsa, sizga taxminan {amount} ga tushadi. Bu taxmin, har bir olish uchun qat’iy {each} ga asoslangan.',
        percent:
          'Agar buni {n} kishi olsa, sizga taxminan {amount} ga tushadi. Bu taxmin, bir tashrifdagi o‘rtacha {avg} hisobingizga asoslangan.',
      },
      costNote:
        'Qaynoq takliflarning o‘z byudjet jamg‘armasi yo‘q, shuning uchun bu to‘g‘ridan-to‘g‘ri marjangizdan ketadi. Uni yuqoridagi to‘xtatish sharti cheklaydi.',
      budgetWarn:
        'Siz {asked} so‘radingiz. Bu oyda {room} zaxirangiz bor, shuning uchun rad etish o‘rniga kichikroq variant qildim — {wanted} o‘rniga {n} ta olish.',
      readTitle: 'Mijozlar nimani o‘qiydi',
      readWarn: 'Men yozdim — nashrdan oldin tekshiring',
      titleIn: 'Sarlavha, {lang}',
      bodyIn: 'Tavsif, {lang}',
      termsTitle: 'Foydalanish qoidalari',
      termsTag: 'Standart shartlar',
      terms: 'Bir tashrifga bitta olish. Boshqa takliflar bilan qo‘shilmaydi. Joy taklifni muddatidan oldin tugatishi mumkin.',
      reviseTitle: 'Biror narsani o‘zgartiraymi? Nimani ayting',
      revisePlaceholder: 'Payshanba qiling, va talabalar buni olishini istamayman.',
      reviseAction: 'Qoralamani o‘zgartirish',
      reviseNote:
        'Men faqat siz aytgan narsani o‘zgartiraman va nima qimirlaganini ko‘rsataman. Qoralamaning qolgani o‘z holicha qoladi.',
      publish: 'Nashr qilish',
      notRight: 'Bu menga kerak narsa emas',
      exitsIntro:
        'Uchta chiqish yo‘li. Hech biri boshqasidan yomon emas — xatoning kattaligiga qarab tanlang.',
      exits: [
        {
          title: 'Nima noto‘g‘riligini ayting',
          note: 'Men shu qoralamani o‘zgartiraman. Siz tasdiqlagan hamma narsa qoladi.',
          label: 'Quyida yozing',
        },
        {
          title: 'Oddiy shaklda ochish',
          note: 'Siz boshqaruvni olasiz. Men to‘g‘ri topgan hamma narsa allaqachon to‘ldirilgan.',
          label: 'O‘zim qilaman',
        },
        {
          title: 'Boshidan boshlash',
          note: 'Bu qoralamani va besh tildagi matnni tashlab yuboradi.',
          label: 'Tashlab yuborish',
        },
      ],
      revisions: {
        days: 'Kunlar',
        hours: 'Soatlar',
        audience: 'Kim ko‘radi',
        thursday: 'Payshanba',
        friday: 'Juma',
        morning: '07:00–10:00',
        noStudents: 'Talabalardan tashqari hamma — taxminan {n} kishi',
      },

      publishedTitle: 'Ikki narsa tayyor',
      publishedOne: 'Bir narsa tayyor',
      publishedDeal: '{days}, {from}–{to} · {n} ta olishdan keyin to‘xtaydi',
      publishedNotify: 'Soat {at} da chiqadi',
      publishedNotifyNote: '{n} kishiga',
      watch:
        'Ikki kundan keyin qarang. Agar o‘shangacha 10 kishidan kam olsa, soatlar to‘g‘ri, taklif esa kuchsiz.',
      again: 'Yana nimadir sozlash',

      reviewTitle: 'Shu hafta nimani o‘zgartirardim',
      reviewIntro: 'Shu hafta uchta narsani o‘zgartirishga arziydi. Qolganiga tegmadim.',
      review: [
        {
          text: '{pct}% li vaucher bosqichingiz {points} ball talab qiladi. Bu oyda unga faqat {reached} mijoz yetdi. {lower} ballda yana {more} ta doimiy mijozingiz shartni bajargan bo‘lardi.',
          label: 'Bosqichni o‘zgartirish',
        },
        {
          text: '“{name}” pauzada, lekin hamon {amount} ushlab turibdi. {n} ta mukofot yig‘ilgan va hech qachon ishlatilmagan — ular muddati o‘tguncha amal qiladi.',
          label: 'Kampaniyani ochish',
        },
        {
          text: '“{name}” 5% chegirma bilan {weeks} hafta ishladi va {claims} ta olinish berdi — 15% li takliflaringiz o‘rtachasining taxminan uchdan biri. Kichik chegirmalar odamni kamdan-kam qo‘zg‘atadi.',
          label: 'Takliflarni ko‘rish',
        },
      ],

      asked: 'Siz so‘radingiz: “{q}”',
      answerLine:
        'Vaucherlardan foydalanish {down}% ga, {from} dan {to} ga tushdi. Butun pasayish {pct}% li bosqichda — bu oyda unga {now} mijoz yetdi, o‘tgan oyda {before} tasi, chunki ball chegarasi {points} gacha ko‘tarildi.',
      answerNote:
        'Shu davrda tashriflar 12% ga o‘sdi, ya’ni odamlar kelyapti. Faqat ularning kamrog‘i foydalanishga arzigulik bosqichga yetyapti.',
      answerLabel: 'Bosqichlarni ochish',
      answerMore:
        'Pul qayerga ketgani, bosqichma-bosqich, Vaucherlar sahifasida. Men buni bu yerda qayta qurmadim.',
      askElse: 'Boshqa narsa so‘rash',

      handedTitle: 'Endi bu sizniki',
      handedNote:
        'Ishonchim komil bo‘lgan narsalarni to‘ldirdim. Oxirgi ikkitasini tekshiring — ularni taxmin qildim.',
      handedFields: [
        'Kunlar va soatlar',
        'Odamlar nima oladi',
        'Davomiyligi',
        'Shundan keyin to‘xtaydi',
        'Kim ko‘radi',
        'Besh tildagi matn',
      ],
      handedWeeks: '{n} hafta',
      handedCopy: 'Men yozdim — nashrdan oldin tekshiring',
      filledIn: 'To‘ldirildi',
      checkThis: 'Buni tekshiring',
      openForm: 'Shaklni ochish',
      backToDraft: 'Qoralamaga qaytish',

      cantLine: 'Odamlarni odatda qancha sarflashiga qarab tanlay olmayman. Paylez buni hali kuzatmaydi.',
      cantAlt:
        'Sizda allaqachon bo‘lgan odamlarni tanlay olaman — ulardan {n} tasi kamida ikki marta kelgan. Shunday qilaymi?',
      cantYes: 'Ha, shunday qiling',
      cantNo: 'Boshqa narsa so‘rash',
      cantElsewhere:
        'Odamlar qancha sarflashini ko‘rmoqchi bo‘lsangiz, bir tashrifdagi o‘rtacha Mijozlar sahifasida.',
      cantOpen: 'Mijozlarni ochish',

      missedTitle: 'Buni tushunmadim',
      missedBody:
        'Shu yergacha yetdim: {days} kunlari tushdan keyingi taklif. Taklif va byudjetni ajrata olmadim, tinmay so‘rayverganimdan ko‘ra topshirganim yaxshi.',
      loopNote:
        'Bu ikkinchi marta. Taxmin qilishda davom etmayman — shakl tezroq bo‘ladi, tushungan kunlar va soatlarni esa unga yozib qo‘ydim.',
      missedAction: 'Oddiy shaklni ochish',
      tryAgain: 'Yana urinish',

      dayChoices: ['Seshanba va chorshanba', 'Payshanba', 'Juma'],
      goals: [
        'Tinch soatlarni to‘ldirish',
        'Kelishdan to‘xtagan mijozlarni qaytarish',
        'Ko‘proq yangi mehmon jalb qilish',
        'Ishlab turgan hamma narsani ko‘rib chiqish',
      ],
      notifyYes: 'Ha, boshlanishida',
      notifyNo: 'Yo‘q, faqat joylashtirilsin',
      weeksValue: '{n} hafta',
      published: 'Hech narsa nashr qilinmadi — bu versiyada server yo‘q.',
      draftUpdated: 'Qoralama yangilandi. Qolgani o‘zgarmadi.',
      handedOver: 'Ko‘chirib bo‘ladigan hamma narsa bilan shaklni ochdim.',
    },

    collapse: 'Menyuni yig‘ish',
    expand: 'Menyuni ochish',
    backToSite: 'paylez’ga qaytish',

    plan: {
      name: 'Growth rejasi',
      state: 'Faol',
      caption: 'Shu oydagi sodiqlik va vaucher byudjetlari. Qaynoq takliflar bunga kirmaydi.',
      usage: '{total} dan {used}',
    },

    ranges: ['Oxirgi 7 kun', 'Oxirgi 14 kun', 'Oxirgi 30 kun', 'Oxirgi chorak'],
    rangeMenu: 'Hisobot davri',
    notifications: 'Bildirishnomalar',
  },

  hero: {
    lines: ["O‘yna va yutib ol.", 'Eksklyuziv takliflar.'],
    lede: 'Kashf eting, o‘ynang va mukofot oling.',
    primary: "O‘yna va yutib ol",
    secondary: 'Bu qanday ishlaydi',
    stats: ['Vaucherga yetadi', "Hamkor do‘konlar", 'Faol shaharlar'],
  },

  proof: "Ballaringizni yetakchi hamkor do‘konlarda ishlating",

  guide: {
    eyebrow: 'Shahringizda',
    title: 'Shahringizdagi xizmatlarni kashf eting.',
    lede: 'Qaynoq chegirmalar, ishonchli joylar va mahalliy sevimlilar — barchasi bir joyda.',
    services: [
      { name: 'Novvoyxona', blurb: 'Yaqin atrofdagi yangi pishirilgan mahsulotlar' },
      { name: 'Qahva', blurb: 'Mukammal qahvangiz — qayerda bo‘lsangiz ham' },
      { name: 'Xarid', blurb: 'Mahalliylar kabi xarid qilish uchun eng yaxshi joylar' },
      { name: 'Restoran', blurb: 'Eng yaxshi mahalliy taomlarni kashf eting' },
      { name: 'Halol', blurb: 'Halol sertifikatiga ega, ishonsa bo‘ladigan joylar' },
      { name: 'Dam olish', blurb: 'Atrofingizdagi qiziqarli mashg‘ulotlar' },
      { name: "Go‘zallik", blurb: "O‘zingizga g‘amxo‘rlik va go‘zallik" },
      { name: 'Uy-joy', blurb: 'Chet elda yangi uyingizni toping' },
    ],
  },

  features: {
    eyebrow: 'paylez qanday ishlaydi',
    title: 'Ozgina o‘yna. Ko‘p yut.',
    lede: 'Tezkor savollarga javob bering, ketma-ketlik yig‘ing va ballarni haqiqiy vaucherlarga aylantiring.',
    cards: [
      {
        title: 'Savollarga javob bering. Ketma-ketlik yig‘ing. Mukofot yutib oling.',
        body: "Play & Earn miya o‘yini bilan har kuni aqlingizni mashq qildiring. Har bir to‘g‘ri javob hamkor do‘konlarda chegirma vaucherlariga almashtiriladigan ball keltiradi.",
      },
      {
        title: 'Eksklyuziv takliflar',
        body: "Hamkorlar tarmog‘idan tanlangan sovg‘a kartalari va chegirmalar, muntazam yangilanadi.",
      },
      {
        title: 'Tezkor mobil vaucherlar',
        body: "To‘g‘ridan-to‘g‘ri telefoningizdan foydalaning va do‘konda skanerlang — hech narsani chop etish shart emas.",
      },
      {
        title: 'QR kodlarni skanerlang, qo‘shimcha ball oling',
        body: "Do‘konda hamkor QR kodlarini skanerlang va bitta ham savolga javob bermay balansingizga ball qo‘shing — to‘g‘ridan-to‘g‘ri telefoningizdan.",
      },
      {
        title: 'AI yordamchi',
        body: 'Sizning raqamli hamrohingiz — istalgan vaqtda, istalgan savolni bering.',
      },
    ],
  },

  value: {
    eyebrow: "O‘yna va yutib ol",
    title: 'Ballaringiz — haqiqiy pul.',
    lede: "Hiyla yo‘q. Ball yig‘ish uchun o‘ynang, so‘ng ularni haqiqatan foydalanadigan sovg‘a kartalari va chegirmalarga almashtiring.",
    card: {
      merchant: "Zalando sovg‘a kartasi",
      meta: "Hamkor do‘kon · {amount} qiymat",
      title: 'Ballaringizni haqiqiy vaucherga almashtiring.',
      price: '500 ball',
      revealed: 'Vaucher tayyor · PLZ-9F3K',
      action: '100 ballni almashtirish',
    },
    benefits: [
      {
        title: "Shunchaki o‘ynab ball yig‘ing",
        body: "Kuniga bir nechta tezkor savolga javob bering, ketma-ketligingizni oshiring va tramvayda, navbatda — istalgan joyda ball to‘plang.",
      },
      {
        title: "Sovg‘a kartalari va chegirmalarga almashtiring",
        body: "Ballarni Zalando, Douglas va Media Expert kabi hamkor do‘konlarning vaucherlariga aylantiring — to‘g‘ridan-to‘g‘ri telefoningizdan.",
      },
      {
        title: 'Paylez Champions jadvalida ko‘tariling',
        body: "Do‘stlaringizni taklif qiling, ketma-ketligingizni saqlang va oylik reytingda ko‘tariling. Jadval har oyning birinchi kuni noldan boshlanadi, shuning uchun cho‘qqi hech qachon uzoq emas.",
      },
    ],
  },

  voices: {
    eyebrow: 'Hamkorlar paylez haqida',
    title: 'paylez bilan mahalliy biznes tezroq o‘sadi.',
    items: [
      {
        quote:
          "Seshanba kuni vaucherni umumiy to‘plamga qo‘ydik, payshanbaga navbat paydo bo‘ldi. Kimdir kirib uni ishlatmaguncha bu bizga hech narsaga tushmaydi.",
        name: 'Kawiarnia Wisła',
        meta: 'Qahvaxona · Krakov',
      },
      {
        quote:
          "Aynan jim soatlar to‘lib boryapti. Ish kunlarining ertalabi o‘lik edi — endi bu qo‘shimcha odam qo‘yadigan smenamiz.",
        name: 'Studio Barber 9',
        meta: 'Barbershop · Varshava',
      },
      {
        quote:
          "Mijozlar bizniki, yetkazib berish ilovasiniki emas. Bir oydan beri kelmaganlarga o‘zimiz murojaat qila olamiz va ular qaytadi.",
        name: 'Zielony Market',
        meta: 'Oziq-ovqat · Vrotslav',
      },
      {
        quote:
          "Xodimlar QR skanerlashni bir smenada o‘rgandi. Yangi jihoz ham, peshtaxtada ortiqcha narsa ham, ikki marta tushuntirish ham yo‘q.",
        name: 'Pracownia Ceramiki',
        meta: 'Ustaxona · Gdansk',
      },
      {
        quote:
          "Nihoyat qaytadigan mijoz birinchi marta kelganiga nisbatan qanchaga arzishini bilamiz. Shu bitta hisobotning o‘zi narxlarimizni o‘zgartirdi.",
        name: 'Fit Klub Nowa',
        meta: 'Fitnes klub · 4 filial',
      },
    ],
  },

  learn: {
    back: 'paylez sahifasiga qaytish',
    hero: {
      eyebrow: 'L-Earn',
      lines: ['Yangi narsa o‘rganing.', 'Haqiqiy narsa yutib oling.'],
      lede: "Kuniga bir nechta tezkor savol. Siz allaqachon foydalanadigan do‘konlarda vaucherga aylanadigan ballar.",
      primary: "O‘ynashni boshlash",
      secondary: "O‘yinlarni ko‘rish",
      stats: ['Eng yaxshi raund', 'Muzlatish beradi', 'Vaucherga yetadi'],
    },

    steps: {
      eyebrow: 'Bu qanday ishlaydi',
      title: "To‘rt qadam, taxminan ikki daqiqa.",
      lede: "Tramvaydagi bir yo‘lga yetadigan darajada qisqa — o‘yinning ko‘p qismi aynan o‘sha yerda o‘ynaladi.",
      items: [
        {
          title: "O‘yin tanlang",
          body: "Poytaxtlar, bayroqlar yoki Polshadagi hayot. Har raundda beshta savol va ularning hech biri uzoq davom etmaydi.",
        },
        {
          title: 'Javob bering',
          body: "Har bir to‘g‘ri javob ball keltiradi, butun raundni xatosiz yopsangiz esa ustiga bonus qo‘shiladi.",
        },
        {
          title: 'Ketma-ketlikni saqlang',
          body: "Ertaga qayting. Kuniga bitta raund ketma-ketlikni tirik saqlaydi, ketma-ket yetti kun esa o‘tkazib yuborilgan kunni qoplaydigan muzlatish beradi.",
        },
        {
          title: 'Almashtiring',
          body: "Ballarni vaucherga aylantiring va do‘konda skanerlang. Chop etish ham, kutish ham shart emas.",
        },
      ],
    },

    games: {
      eyebrow: "O‘yinlar",
      title: "O‘yiningizni tanlang.",
      lede: "Ularning har biri saytdagi barcha tillarga tarjima qilingan, shuning uchun o‘zingiz xohlamasangiz, hech qachon ikkinchi tilingizda o‘ynamaysiz.",
    },

    streak: {
      eyebrow: 'Ketma-ketlik',
      title: 'Ballar aynan ketma-ketlikda.',
      lede: "Har 24 soatda bitta raund uni tirik saqlaydi. Shu oraliqni o‘tkazib yuborsangiz, ketma-ketlik nolga qaytadi — ballaringiz esa turgan joyida qoladi — agar muzlatishingiz bo‘lmasa. Muzlatish bitta o‘tkazib yuborilgan kunni qoplaydi, uni har yettinchi kuni olasiz va ikkitagacha saqlab turishingiz mumkin. Qoida shu, xolos.",
      card: {
        label: 'Joriy ketma-ketlik',
        unit: 'kun',
        reward: "Yettinchi kuni muzlatish",
        freeze: "Zaxiradagi muzlatishlar · har biri bitta kunni qoplaydi",
      },
      benefits: [
        {
          title: 'Har bir raund bir xil qiymatda',
          body: "Hech bir o‘yin ikkinchi marta o‘ynalgani uchun kamroq to‘lamaydi va bugungi raund kechagisidan arzon emas. Kunni cheklaydigan narsa — energiya: zaxirada to‘rtta, har raundga bittadan, va har to‘rt soatda bittasi qaytadi.",
        },
        {
          title: 'Yettinchi kun: muzlatish',
          body: "Bir haftalik davomiylik sizga bir kun dam sotib beradi. Muzlatish bitta o‘tkazib yuborilgan kunni yutadi, ketma-ketlik esa o‘ynagandek davom etadi.",
        },
        {
          title: "O‘yin emas, kun hisoblanadi",
          body: "Istalgan o‘yindagi istalgan raund ketma-ketlikni davom ettiradi, shuning uchun poytaxtlar o‘yinidagi yomon tong tufayli hech narsa yo‘qotmaysiz.",
        },
      ],
    },

    board: {
      eyebrow: 'Paylez Champions',
      title: 'Oylik jadval.',
      lede: "Oyning birinchi kuni hamma noldan boshlaydi. Uchta eng yaxshisi oyni jadval boshida yakunlaydi; qolganlar keyingi oyni teng sharoitda boshlaydi.",
      columns: { rank: '#', player: "O‘yinchi", points: 'Ballar' },
      note: "Namunaviy jadval — sizniki har oyning 1-kunida noldan boshlanadi.",
    },

    faq: {
      eyebrow: 'Savollar',
      title: 'Qisqa javoblar.',
      items: [
        {
          q: 'Ballarning muddati tugaydimi?',
          a: "Yo‘q. Bir hafta tanaffus qilsangiz ham balansingiz yig‘ganini saqlaydi — soat ketma-ketlikka tegishli, ballarga emas. Shu oraliqni o‘tkazib yuborsangiz, ketma-ketlik nolga qaytadi; ballar esa sarflash uchun sizniki bo‘lib qoladi.",
        },
        {
          q: "Kuniga nechta raund o‘ynay olaman?",
          a: "To‘la zaxira bilan to‘rtta, keyin esa qancha tiklansa shuncha. Har bir tugagan raund bitta energiya oladi — yutdingizmi, yutqazdingizmi, farqi yo‘q — energiya esa o‘zi tiklanadi: har to‘rt soatda bittadan, ko‘pi bilan to‘rttagacha. Takrorlangani uchun hech narsa kamroq to‘lamaydi: kunning o‘ninchi raundi birinchisi qancha bo‘lsa, shuncha turadi.",
        },
        {
          q: 'Vaucher aslida qanchaga arziydi?',
          a: "Bu vaucher turiga va hamkor korxona qaroriga bog‘liq. Paylez o‘zi beradigan sovg‘a kartasi — masalan, Zalando yoki Zara uchun — 100 o‘yin balliga tushadi va {amount} qiymatga ega.",
        },
        {
          q: 'Savollar qaysi tillarda?',
          a: "Shu saytdagi barcha beshtasida — ingliz, polyak, o‘zbek, rus va ukrain tillarida. Tilni o‘zgartirsangiz, savollar ham u bilan birga o‘zgaradi.",
        },
      ],
    },

    cta: {
      title: 'Kuniga ikki daqiqa.',
      lede: "Butun majburiyat shu. Bir raund o‘ynang, ketma-ketlikni saqlang va ballarni baribir sotib olmoqchi bo‘lgan narsangizga sarflang.",
      primary: "O‘ynashni boshlash",
      secondary: 'paylez bilan tanishish',
      note: "O‘ynash bepul · Butun Polshada mavjud",
    },
  },

  /* ────────────────────────────────────────────────────────── analytics ── */

  analytics: {
    back: "paylez’ga qaytish",
    exampleNote:
      'Namuna raqamlar — hisobot qanday ko‘rinishini ko‘rsatish uchun. O‘zingizniki boshqaruv panelingizda.',
    hero: {
      eyebrow: 'Hamkor tahlili',
      lines: ['Har bir skan —', 'hisobda.'],
      lede: "Kampaniya aslida nima qilganini ko‘ring: ko‘rsatishlar, bosishlar, foydalanishlar va ularning qiymati — har bir taklif bo‘yicha.",
      primary: 'Panelni ochish',
      secondary: "Nima olishingizni ko‘ring",
      venueLabel: 'Sizning joyingiz',
      venueNone: 'Bu hisobda hali e’lon yo‘q',
      venueNote: "Hech narsa kiritish shart emas. Siz tizimga kirgansiz, shuning uchun panel qaysi joy sizniki ekanini biladi — Service ID bizniki va uni qo‘llab-quvvatlash so‘raydi.",
    },

    kpis: {
      eyebrow: "Asosiy ko‘rsatkichlar",
      title: "To‘rt raqam, bitta davr.",
      lede: "Har bir hamkor panelining tepasidagi o‘sha to‘rtta raqam — oldingi davr bilan solishtirilgan.",
      items: [
        "Ko‘rsatishlar",
        'Noyob bosganlar',
        'Konversiya darajasi',
        'Foydalanishlar',
      ],
      since: 'oldingi davrga nisbatan',
    },

    funnel: {
      eyebrow: 'Jalb qilish varonkasi',
      title: "Yo‘qotish qayerda.",
      lede: "Uch bosqich, va faqat ular orasidagi farqni yaxshilash mantiqli. Ko‘rilib bosilmagan taklifning muammosi bosilib, ishlatilmaganidan boshqa.",
      stages: [
        {
          name: "Ko‘rsatishlar",
          note: 'Taklifingiz lentada yoki qidiruv natijasida korindi.',
        },
        {
          name: 'Bosishlar',
          note: "Kimdir uni ochdi. Har bir bosish emas, har bir odam bir marta sanaladi.",
        },
        { name: 'Foydalanishlar', note: "Kassangizda vaucher skanerdan o‘tkazildi." },
      ],
    },

    week: {
      eyebrow: "Kunlar bo‘yicha",
      title: 'Bir hafta — bir qarashda.',
      lede: "Foydalanishlar siz kutgan kunlarga tushadi, va aynan shuning uchun kutmagan kunlaringizga qarash arziydi.",
      days: ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Yak'],
      peak: 'Eng band kun',
      total: 'Shu haftada ishlatilgan',
    },

    reports: {
      eyebrow: 'Nima olasiz',
      title: 'Asosiy raqamlardan keyin.',
      items: [
        {
          title: 'Geografik taqsimot',
          body: "Foydalanishlar qaysi shahar va tumanlardan kelgani — ikkinchi filial taxmin emas, qaror bo‘lishi uchun.",
        },
        {
          title: 'Oylik hisob-kitob qiymati',
          body: "Oy davomida vaucher foydalanishlari qancha bo‘lgani — hisobingizga tushadigan raqam.",
        },
        {
          title: 'Foydalanishlar tarixi',
          body: "Har bir foydalanish holati va vaqti bilan, filtrlanadi va buxgalter so‘raganda CSV’ga chiqariladi.",
        },
        {
          title: 'Qaytish darajasi',
          body: 'Qancha odam ikkinchi taklif uchun qaytgani. Mijoz sotib oldingizmi yoki chegirmami — shu raqam aytadi.',
        },
      ],
    },

    cta: {
      title: 'U allaqachon ishlayapti.',
      lede: "Har bir hamkor taklifi ishga tushgan kunidan buyon shu ma’lumotni yig‘moqda. Panel allaqachon sizniki — bir bosish narida.",
      primary: 'Panelni ochish',
      secondary: 'Hamkorlik haqida gaplashamiz',
      note: "Har bir hamkor hisobida · Qo‘shimcha to‘lovsiz",
    },
  },

  /* ─────────────────────────────────────────────────────────── business ── */

  business: {
    back: "paylez’ga qaytish",
    hero: {
      eyebrow: 'Mukofot, vaucher, marketing va tahlil — bitta platformada',
      lines: ['Har tashrifni', 'odatga aylantiring.', 'Mijoz sizniki bo‘lsin.'],
      lede: "Sodiqlik, vaucherlar, marketing va hisobotlar bitta mijoz yozuvi ustida — taklifingiz esa minglab odam har tong ochadigan o‘yin ichida turadi. Siz faqat kimdir kirib, vaucherni ishlatganda to‘laysiz.",
      primary: 'Savdo bilan bog‘lanish',
      secondary: 'Panelni ko‘rish',
      stats: [
        'Qayta tashrif o‘sishi',
        'Ishlatilgunga qadar xarajat',
        'Shartnomadan ishga tushishgacha',
      ],
      trust: 'Bizga 500+ joy ishonadi · Jihozsiz · Boshlash uchun shartnomasiz',
    },

    why: {
      eyebrow: 'Nega o‘tishadi',
      title: 'Bor mijozlaringizdan daromadni oshirish uchun kerak bo‘lgan hamma narsa.',
      lede: "Ko‘p joylar alohida sotib oladigan to‘rt tizim — sodiqlik, vaucherlar, marketing va tahlil — bitta mijoz yozuvi ustida ishlaydi.",
      items: [
        {
          title: 'Ishlamaguncha — hech narsa',
          body: "Vaucheringiz minglab o‘yinchiga boradi. Siz faqat kimdir kirib uni ishlatganda to‘laysiz. Ballar vaucher ishlatilmagunicha sizga hech narsaga tushmaydi — hech kimga yetib bormagan kampaniya ham shunday.",
          stat: '{amount} — vaucher ishlatilgunga qadar',
        },
        {
          title: 'Mijoz — sizniki',
          body: "Har bir o‘yin, ishlatish va tashrif siz to‘g‘ridan-to‘g‘ri bog‘lana oladigan profil yig‘adi — birovning ilovasi ichida qulflangan ko‘rsatkich emas va bittalab push evaziga ijaraga olinadigan ro‘yxat ham emas.",
          stat: 'Mijoz yozuvining 100 foizi',
        },
        {
          title: '48 soatda ishga tushadi',
          body: "Kerak joyda kassa bilan integratsiya, kerak bo‘lmasa — usiz. Xodim kassada QR skanerlaydi, bir smenada o‘rganadi, jihoz sotib olish yoki peshtaxtadan joy ajratish shart emas.",
          stat: 'Imzodan birinchi skangacha 48 soat',
        },
        {
          title: 'To‘rt vosita, bitta kirish',
          body: "Sodiqlik, vaucherlar, kampaniyalar va hisobotlar endi to‘rtta shartnoma, to‘rtta eksport va mijozingiz kimligi haqidagi to‘rtta versiya emas. Bitta yozuv, bitta hisob, bitta ekran.",
          stat: '4 tizim, 1 mijoz yozuvi',
        },
      ],
    },

    dashboard: {
      eyebrow: 'Sizning panelingiz',
      title: 'Dushanba tongida ochadigan ekraningiz.',
      lede: "Menejerdan keladigan oylik PDF emas. Barcha joylaringizdagi har bir skan, vaucher va kampaniya — va u grafikdan emas, oddiy gapdan boshlanadi.",
      bullets: [
        {
          title: 'Oddiy so‘zlardan boshlanadi',
          body: "Nechta yangi mijoz olib kelganimiz va ular taxminan qancha qoldirgani — siz birorta o‘qqa qaramasingizdan oldin.",
        },
        {
          title: 'Bitta filial yoki hammasi birdan',
          body: "Filial, kanal va sana bo‘yicha filtr. Menejer o‘z filialini ko‘radi va guruh raqamlarini hech qachon ko‘rmaydi.",
        },
        {
          title: 'O‘zi nima sezganini aytadi',
          body: "Jim kunlar, olingan-u ishlatilmagan mukofotlar, hech kim yetib bormaydigan chegirma bosqichi — va tayyor o‘zgartirish taklifi bilan.",
        },
      ],
      action: 'Namoyishga yozilish',
      mock: {
        business: 'Sablewski & Para',
        screen: 'Umumiy ko‘rinish',
        range: 'Oxirgi 30 kun',
        user: 'MK',
        kicker: 'paylez siz uchun nima qildi',
        headline:
          'Sizga {customers} ta yangi mijoz olib keldik va ular sizda taxminan {revenue} qoldirdi.',
        tiles: [
          { name: 'Tashriflar', note: 'Kassadagi QR skanlari' },
          { name: 'Ishlatilgan vaucherlar', note: 'Sizda sarflangan ballar' },
          { name: 'Qaytish ulushi', note: '30 kun ichida qaytdi' },
          { name: 'O‘rtacha chek', note: 'Hisobga olingan tashrifga' },
        ],
        since: 'oldingi 30 kunga nisbatan',
        chart: {
          title: 'Tashriflar va ishlatilgan vaucherlar',
          note: "Kassadagi har bir QR skani mijozlar haqiqatan sarflagan vaucherlarga qarshi qo‘yilgan.",
          visits: 'Tashriflar',
          redeemed: 'Ishlatilgan',
        },
        insight: {
          kicker: 'Biz nimani sezdik',
          text: "Seshanba — eng jim kuningiz, va o‘tgan oy olingan mukofotlarning 38 foizi hech qachon ishlatilmagan.",
          action: 'Seshanba uchun taklif tayyorlash',
          dismiss: 'Hozir emas',
        },
        live: {
          title: 'Hozir ishlayapti',
          note: "Bugun joylaringizda mijozlar ko‘radigan va yig‘a oladigan hamma narsa.",
          rows: [
            {
              kind: 'Play & Earn',
              name: 'Asosiy menyuga −20%',
              rule: '500 ball · to‘rtala filial',
              statLabel: 'puldda',
            },
            {
              kind: 'Issiq taklif',
              name: 'Soat 11 gacha qahva bepul',
              rule: 'Du–Ju · Kazimierz',
              statLabel: 'olingan',
            },
            {
              kind: 'Kampaniya',
              name: '30 kun jim · push',
              rule: '1 840 mijoz',
              statLabel: 'ochilgan',
            },
          ],
          on: 'Faol',
          off: 'To‘xtatilgan',
          edit: 'Tahrirlash',
        },
      },
    },

    pillars: {
      eyebrow: 'Platforma',
      title: 'Uch qism, bitta mijoz yozuvi.',
      items: [
        {
          eyebrow: 'Paylez Portal',
          title: 'Barcha filiallaringiz uchun bitta panel.',
          body: "Tushum, o‘yinlar, ishlatishlar va qaytuvchi mijoz ulushi — barcha manzillar bo‘yicha, filial, kanal va sana filtri bilan. Jadvalsiz va kassa ta’minotchisini kutmasdan.",
          bullets: [
            {
              title: 'Guruh jamlari filiallarga ochiladi',
              body: "Butun biznes uchun bitta raqam va uni tushuntiradigan qator — bir bosish pastda.",
            },
            {
              title: 'Bu oyni qaysi guruh ko‘tarayotgani ko‘rinadi',
              body: "Qaytadiganlar cheki birinchi marta kelganlarga qarshi — filial va kanal kesimida.",
            },
            {
              title: 'Menejer o‘z filialini ko‘radi, guruhingizni emas',
              body: "O‘z doirasiga ega alohida kirishlar, toki smena boshlig‘i o‘z raqamlarini o‘zi ko‘rsin.",
            },
          ],
          action: 'Portalni ko‘rish',
        },
        {
          eyebrow: 'Play & Earn',
          title: "Taklifingiz — har kuni ochiladigan o‘yin ichida.",
          body: "Mijozlar qisqa savollarga javob beradi, seriya to‘playdi va ball yig‘adi — keyin o‘sha ballarni faqat sizda ishlatiladigan vaucherga sarflaydi.",
          bullets: [
            {
              title: 'Vaucheringiz kundalik puldda',
              body: "U allaqachon nimadir yutish uchun ilovani ochgan o‘yinchilar oldida turadi.",
            },
            {
              title: 'Har bir raqamni siz belgilaysiz',
              body: 'Ball narxi, chegirma, muddat, haftalik limit va uni qabul qiladigan filiallar.',
            },
            {
              title: 'Kassada bitta QR skan',
              body: "Jihozsiz, integratsiyasiz va xodim uchun bir smenalik o‘rganish bilan.",
            },
          ],
          action: 'Play & Earn qanday ishlaydi',
        },
        {
          eyebrow: 'Ma’lumot va marketing',
          title: 'Jim mijozlarni oyiga o‘n daqiqada qaytaring.',
          body: "Xarajat, chastota, manzil yoki kelmagan kunlar bo‘yicha segmentlang — va o‘sha auditoriyaga push, taklif yoki promokodni to‘g‘ridan-to‘g‘ri yuboring.",
          bullets: [
            {
              title: 'Ularga yetib borishning olti yo‘li',
              body: 'Push, muddatli takliflar, promokodlar, sovg‘a kartalari, do‘kondagi QR kodlar va e-pochta.',
            },
            {
              title: 'Allaqachon yig‘ilgan auditoriyalar',
              body: 'Jim qolganlar, katta cheklar, shu oyning yangilari va bitta filial — yuborishga tayyor.',
            },
            {
              title: 'Daromad kampaniya kesimida',
              body: "Har bir xabar eshikdan nimani qaytarganini ko‘rsatadi, uni necha kishi ochganini emas.",
            },
          ],
          action: 'Vositalarni ko‘rish',
        },
      ],
      portal: {
        label: 'Guruh tushumi',
        period: 'Shu oy',
        columns: { site: 'Filial', repeat: 'Qaytganlar' },
      },
      cohort: {
        label: 'Guruhlar bo‘yicha o‘rtacha chek',
        returning: 'Qaytadiganlar',
        first: 'Birinchi marta',
      },
      game: {
        label: 'Vaucheringiz puldda',
        prize: '−20% sizda',
        cost: '500 ball',
        note: "To‘g‘ri! Ball oldingiz.",
      },
      campaign: {
        label: 'Yangi kampaniya',
        audiences: [
          '30 kun kelmagan',
          'Katta cheklar',
          'Shu oyda yangi',
          'Faqat bitta filial',
        ],
        send: 'Keyingi tashrifga −20% yuborish',
        estimate: 'Taxminan {amount} qaytgan tushum',
      },
    },

    rollout: {
      eyebrow: 'Qanday boshlanadi',
      title: 'Dushanbada imzo, chorshanbada ish.',
      lede: "Jihozsiz, integratsiya loyihasisiz, o‘quv kunisiz. To‘rt qadam, va uzuni bizning zimmamizda.",
      items: [
        {
          title: 'Yigirma daqiqalik suhbat',
          body: "Filiallaringiz, o‘rtacha chekingiz, bugun ishlatayotgan narsangiz. Biz qayta tashriflardan keladigan daromadning oddiy prognozi bilan qaytamiz — taqdimot bilan emas.",
        },
        {
          title: 'Kartochkangizni biz yig‘amiz',
          body: "Suratlar, ish vaqti, toifalar va xodimlaringiz gapiradigan tillar — ilovaning beshala tilida yozilgan holda.",
        },
        {
          title: 'Vaucheringiz puldga tushadi',
          body: "Ball narxi, chegirma, muddat va haftalik limitni siz belgilaysiz. O‘sha kuniyoq o‘yinchilar oldida turadi.",
        },
        {
          title: 'Xodim kassada skanerlaydi',
          body: "Bitta QR kod, bir smenalik o‘rganish. Ishlatishlar sodir bo‘lgani sayin panelingizga tushadi.",
        },
      ],
      note: 'Shartnoma imzolanganidan birinchi ishlatilgan vaucherga qadar o‘rtacha vaqt — 48 soat.',
    },

    operators: {
      eyebrow: 'Egalar paylez haqida',
      title: 'Dasturni emas, joyni boshqaradigan odamlar.',
      items: [
        {
          quote:
            "Biz o‘z mijozlarimizni yetkazib berish ilovalaridan ijaraga olishni to‘xtatdik. Vaucherimiz minglab odam ertalab ochadigan o‘yinda turadi, ishlatishlar esa eshikdan kirib keladi.",
          name: 'Sablewski & Para',
          role: 'Egasi — 4 filial, Krakov',
        },
        {
          quote:
            "Dushanbada o‘n daqiqa. Uch hafta kelmaganlarning hammasiga bitta push. Shu bitta xabar platforma narxini bir necha barobar qoplaydi.",
          name: 'Kawiarnia Hermanos',
          role: 'Operatsion direktor — 11 filial',
        },
        {
          quote:
            "Birinchi vaucherimiz shartnoma imzolangan haftaning o‘zida o‘yinda edi. Xodim kassada QR skanerlaydi — butun jarayon shu, shuning uchun ham barcha filiallarda ildiz otdi.",
          name: 'Poke Yard',
          role: 'Asoschisi — 6 filial, Varshava',
        },
        {
          quote:
            "Qaytadigan va birinchi marta kelgan mijozlarning chekini alohida ko‘rish narx siyosatimizni o‘zgartirdi. Shu bitta hisobotning o‘zi o‘tishni oqladi.",
          name: 'Piekarnia Northline',
          role: 'Boshqaruvchi direktor — 9 filial',
        },
      ],
    },

    pricing: {
      eyebrow: 'Narxlar',
      title: 'Siz ishlatilganiga to‘laysiz, o‘ringa emas.',
      lede: "Har bir tarifga portal va cheksiz mijoz yozuvi kiradi. Oylik to‘lov — bu marketing vositalari; vaucherlarning o‘zini esa faqat ishlatilganda moliyalashtirasiz.",
      perMonth: '/ oyiga',
      quoted: 'So‘rov bo‘yicha',
      tiers: [
        {
          name: 'Bitta filial',
          note: 'Bitta joy',
          body: "Play & Earn’da joylashuv, vaucherlar va haqiqatan kerakli hisobotlar.",
          features: [
            'Vaucheringiz kundalik puldda',
            'Ega paneli va asosiy hisobotlar',
            'Cheksiz mijoz yozuvlari',
            'Kassada QR orqali ishlatish',
          ],
          action: 'Bepul boshlash',
        },
        {
          name: 'Growth',
          note: '5 tagacha filial',
          body: "To‘liq marketing to‘plami, filial kirishlari va do‘kondagi QR kampaniyalar.",
          features: [
            '«Bitta filial»dagi hamma narsa',
            'Push, takliflar, promokodlar va sovg‘a kartalari',
            'Tayyor auditoriyalar va kampaniya daromadi',
            'Menejerlar uchun alohida kirishlar',
          ],
          action: 'Savdo bilan bog‘lanish',
        },
        {
          name: 'Guruh',
          note: '6 va undan ortiq filial',
          body: "Ko‘p filialli ishga tushirish, kassa integratsiyasi va shaxsiy menejer.",
          features: [
            'Growth’dagi hamma narsa',
            'Kassa integratsiyasi va ishga tushirishda yordam',
            'Guruh darajasidagi hisobot va eksportlar',
            'Biriktirilgan menejer',
          ],
          action: 'Savdo bilan bog‘lanish',
        },
      ],
      featured: 'Eng ko‘p tanlanadi',
      footnote:
        "Vaucherlar har qanday tarifda, jumladan bepulida ham, ishlatilganda moliyalashtiriladi. Narxlar QQSsiz.",
    },
    cta: {
      title: 'Doimiy mijozlaringiz qanchaligini bilib oling.',
      lede: "Yigirma daqiqalik suhbat, sizning raqamlaringiz va Paylez filiallaringizda ochadigan qayta tashrif daromadining ochiq prognozi. Boshlash uchun shartnoma shart emas.",
      primary: 'Savdo bilan bog‘lanish',
      secondary: 'paylez’ni ko‘rish',
      note: "Bir nechta filialli guruhmisiz? Ishga tushirishda yordam va kassa integratsiyasi haqida so‘rang.",
    },
  },

  /* ─────────────────────────────────────────────────────────── vouchers ── */

  vouchers: {
    back: "paylez’ga qaytish",
    hero: {
      eyebrow: 'Kirishda ball, chiqishda haqiqiy vaucher',
      lines: ['Ball uchun o‘ynang.', 'Ularni sarflang', 'haqiqiy narsaga.'],
      lede: "Har bir yig‘gan vaucheringiz bitta hamyonga tushadi: siz allaqachon boradigan do‘konlardagi sovg‘a kartalari va chegirmalar kerak bo‘lgunicha turadi, sarflash esa kassada QR kodni ko‘rsatish bilan bo‘ladi.",
      primary: 'Yig‘ishni boshlash',
      secondary: 'Nima borligini ko‘rish',
      stats: ['Hamkor brend', 'Eng arzon vaucher', 'Ishlatish narxi'],
      trust: "Karta ma’lumotisiz · Boshlash bepul · Butun Polshada ishlaydi",
    },

    wallet: {
      title: 'Vaucherlaringiz',
      counts: '{active} faol · {used} ishlatilgan',
      tabs: { active: 'Faol', used: 'Ishlatilgan' },
      note: "Vaucher QR kod yaratilgan zahoti ishlatilgan hisoblanadi — uni tramvayda emas, kassada yarating.",
      card: {
        meta: "Hamkor do‘kon · {amount} qiymat",
        cost: '500 ball',
        action: 'QR kodni ko‘rsatish',
        code: 'PLZ-9F3K',
        expires: '31.08 gacha amal qiladi',
      },
    },

    steps: {
      eyebrow: 'Vaucher qanday paydo bo‘ladi',
      title: 'To‘rt qadam, va ularning birortasi pul talab qilmaydi.',
      lede: "Butun yo‘l — tramvaydagi ikki bo‘sh daqiqadan kassadagi chegirmagacha.",
      items: [
        {
          title: 'Bir necha savolga javob bering',
          body: "Tramvayda bir-ikki daqiqa. Har bir to‘g‘ri javob — ball, har bir raund esa qaysi o‘yin va kunning nechanchi marta bo‘lishidan qat’i nazar to‘liq to‘laydi — kunni takror emas, energiya cheklaydi.",
        },
        {
          title: 'Vaucher tanlang',
          body: "Hamyon balansingiz nimaga yetishini va qolganiga qancha yetmayotganini ko‘rsatadi. Hech narsa siz ko‘rmaydigan bosqich ortiga yashirilmagan.",
        },
        {
          title: 'Kassada QR yarating',
          body: "Bitta tegish vaucherni kodga aylantiradi. Bu bir marta ishlatiladigan bitta kod — shuning uchun ham u oldindan emas, kassada yaratiladi.",
        },
        {
          title: 'Chegirma hisobdan tushadi',
          body: "Xodim kodni skanerlaydi, chegirma hisobdan tushadi, vaucher esa sana va do‘kon nomi bilan «Ishlatilgan» bo‘limiga o‘tadi.",
        },
      ],
    },

    catalogue: {
      eyebrow: 'Hamyonda nima bor',
      title: "Siz allaqachon bormoqchi bo‘lgan do‘konlarning sovg‘a kartalari.",
      lede: "Ro‘yxat har oy yangilanadi va har bir kartaning zaxirasi cheklangan — oylik zaxira tugasa, karta oyning birinchi kunida qaytadi.",
      cost: 'ball',
      left: '{of} tadan {left} tasi qoldi',
      everywhere: "Istalgan do‘kon · onlayn ham",
      soldOut: '1-sanada qaytadi',
      action: 'To‘liq ro‘yxatni ochish',
    },

    rules: {
      eyebrow: 'Mayda shrift — oddiy so‘zlarda',
      title: 'Sarflashdan oldin bilib qo‘yish kerak bo‘lgan uch narsa.',
      items: [
        {
          title: 'Bitta kod, bitta ishlatish',
          body: "Yaratilgan QR ni qayta yaratib, keyinga saqlab yoki do‘stga berib bo‘lmaydi. Vaucherni kassada qabul qilishga arziydigan qiladigan narsa ham shu.",
        },
        {
          title: 'Uni kassa oldida yarating',
          body: "Kod paydo bo‘lgan zahoti vaucher «Ishlatilgan»ga o‘tadi — kimdir uni skanerladimi yoki yo‘qmi, farqi yo‘q. Avval kassaga yeting.",
        },
        {
          title: "O‘ynashni to‘xtatsangiz, ketma-ketlik yonadi",
          body: "Har 24 soatda kamida bitta raund o‘ynang — ketma-ketligingiz davom etadi. Shu oraliqni o‘tkazib yuborsangiz, u nolga qaytadi — ballaringiz esa qoladi. Allaqachon olingan vaucherlarning esa o‘z muddati bor va u siz biror narsa sarflashdan oldin kartada yozilgan turadi.",
        },
      ],
    },

    faq: {
      eyebrow: 'Savollar',
      title: 'Haqiqatan so‘raladiganlari.',
      items: [
        {
          q: 'Vaucher menga qancha turadi?',
          a: "Ball, boshqa hech narsa. Yetkazib berish to‘lovi ham, tizimdagi karta ham yo‘q — ishlatishda siz hech qachon to‘lov ma’lumotini kiritmaysiz.",
        },
        {
          q: "Vaucherni do‘konning o‘z aksiyasi bilan qo‘shsa bo‘ladimi?",
          a: "Odatda ha, va karta buni ishlatishdan oldin aytadi. Agar hamkor chegirmadagi mahsulotlarni chiqarib tashlasa, bu istisno kassada emas, vaucherning o‘zida yozilgan bo‘ladi.",
        },
        {
          q: 'Kodni tasodifan yaratib yubordim. Uni qaytarib bo‘ladimi?',
          a: "Avtomatik — yo‘q, o‘sha paytda kod allaqachon amal qiladi. Vaucher raqami bilan qo‘llab-quvvatlashga yozing, ko‘rib chiqamiz, lekin halol javob shu: bu tugmani faqat kassa oldida turib bosing.",
        },
        {
          q: 'Nega vaucherlar tugab qoladi?',
          a: "Har bir hamkor oyiga belgilangan zaxirani moliyalashtiradi. U tugagach, karta so‘nadi va oyning birinchi kunida qaytadi — shuning uchun ham ommabop kartalar erta ketadi.",
        },
      ],
    },

    cta: {
      title: 'Keyingi vaucheringizgacha bir necha raund.',
      lede: "Kuniga bir necha daqiqa, bir necha xil o‘yinga bo‘lib. Bugun boshlang, seriya ham sanashni boshlaydi.",
      primary: 'Play & Earn',
      secondary: 'O‘yinlarni ko‘rish',
      note: 'Boshlash bepul · Butun Polshada mavjud',
    },
  },

  /* ─────────────────────────────────────────────────────────── relocate ── */

  relocate: {
    back: "paylez’ga qaytish",
    hero: {
      eyebrow: 'Hayot bo‘yicha yo‘riqnoma',
      lines: ['Yangi davlat.', 'Yuzta savol.', 'Bitta yo‘riqnoma.'],
      lede: "Qayerda hisob ochish, kafolat puli qanday ishlaydi, qaysi klinika sug‘urtangizni qabul qiladi va pulingiz vatanda aslida qancha turadi. To‘qqiz mavzu, o‘n to‘rt davlat.",
      primary: 'Yo‘riqnomani ochish',
      secondary: 'Kursni tekshirish',
      stats: ['Mavzu', 'Davlat', 'Bizning kursimizga ustama'],
      trust: "Bepul · O‘qish uchun hisob kerak emas · Qoidalar o‘zgarishi bilan yangilanadi",
    },

    rates: {
      eyebrow: 'Pulingiz qanchaga arziydi',
      title: 'Sizga kurs taklif qilinishidan oldin haqiqiysini biling.',
      lede: "Bu yerdagi odamlar haqiqatan foydalanadigan valyutalar uchun banklararo kurs — ustiga bizning ustamamiz qo‘shilmagan holda. Paylez faqat hisoblab beradi, pul o‘tkazmaydi, shuning uchun siz bilan bu raqam orasida hech narsa yo‘q. Tekshiradigan juftliklaringizni saqlang, ular birinchi bo‘lib ochiladi.",
      send: 'Summa',
      gets: 'Bu shuncha',
      rate: 'Kurs',
      swap: 'Valyutalarni almashtirish',
      result: '{from} = {to}',
      enter: 'Hisoblash uchun summa kiriting.',
      saved: 'Saqlangan juftliklar',
      savedNote: "Ekranning tepasiga mahkamlangan, shuning uchun kursni tekshirish qidiruv emas, bitta tegish.",
      pick: 'Valyuta',
      search: '19 ta valyuta ichidan qidiring',
      noMatch: '"{query}" bo\'yicha hech narsa topilmadi.',
      names: {
        EUR: 'Yevro',
        USD: 'AQSH dollari',
        GBP: 'Britaniya funti',
        PLN: 'Polsha zlotiysi',
        UAH: 'Ukraina grivnasi',
        RUB: 'Rossiya rubli',
        UZS: "O'zbekiston so'mi",
        KZT: "Qozog'iston tengesi",
        TRY: 'Turkiya lirasi',
        CZK: 'Chexiya kronasi',
        CHF: 'Shveytsariya franki',
        BYN: 'Belarus rubli',
        MDL: 'Moldova leyi',
        GEL: 'Gruziya larisi',
        AMD: 'Armaniston drami',
        AZN: 'Ozarbayjon manati',
        TMT: 'Turkmaniston manati',
        KGS: "Qirg'iziston somi",
        TJS: 'Tojikiston somoniysi',
      },
      bullets: [
        {
          title: 'Banklararo kurs, ustamasiz',
          body: "Valyuta qanchaga arziydi — kimdir uning uchun qancha berishi emas. Bu yerda hech narsa yuborilmaydi va hech narsa uchun haq olinmaydi, ya’ni bu ikki raqam orasida bizning ustamamiz yo‘q.",
        },
        {
          title: 'Ikki tomonga, bitta kartada',
          body: "Har bir juftlik bir xil kurs bo‘yicha ikki tomonga hisoblanadi — reklamadagi misol uchun emas, siz kiritgan summa uchun.",
        },
        {
          title: 'Sizning juftliklaringiz tepada',
          body: "Tekshiradigan valyutalaringizni mahkamlang — ular har safar tepada, kursi allaqachon yuklangan holda turadi.",
        },
      ],
    },

    guide: {
      eyebrow: 'Yordam va yo‘l-yo‘riq',
      title: "To‘qqiz mavzu. Bittasini oching.",
      lede: "Uy-joy va hujjatlar birinchi o‘rinda, chunki birinchi oy aynan shular haqida. Har bir mavzu shu ish bilan shug‘ullanadigan joylar ro‘yxatiga ochiladi — shahringiz bo‘yicha filtr bilan.",
      cities: 'Barcha shaharlar',
      city: "Shahar bo‘yicha filtr",
      count: "Ro‘yxatdagi joylar: {n}",
      speaks: 'Tillari:',
      none: "{city} shahrida bu mavzu bo‘yicha hozircha hech nima yo‘q. Barcha shaharlarni sinab ko‘ring.",
      soon: "Bu mavzu hali yozilmoqda. Shu orada quyidagi yordamchi javob beradi.",
      items: [
        { name: 'Joylar', blurb: "Borishga arziydigan do‘konlar, restoranlar va xizmatlar" },
        { name: 'Bank va moliya', blurb: 'Hisoblar, kartalar, kredit va IBAN nima uchun kerak' },
        { name: 'Uy-joy', blurb: 'Kvartira topish, zakalat, shartnoma va ro‘yxatdan o‘tish' },
        { name: 'Sog‘liq', blurb: "Sug‘urta, klinikaga biriktirilish, shoshilinch holatlar" },
        { name: 'Huquq va viza', blurb: 'Ruxsatnomalar, yashash huquqi, uzaytirish va hujjatlar' },
        { name: 'Ish', blurb: 'Ish topish, shartnomalar va ular bilan keladigan huquqlar' },
        { name: 'Ta’lim', blurb: 'Maktablar, universitetlar, til kurslari va diplom tan olinishi' },
        { name: 'Transport', blurb: 'Chiptalar, abonementlar, guvohnoma va yurish-turish' },
        { name: 'Madaniyat va integratsiya', blurb: 'Til, urf-odatlar, bayramlar va o‘zingnikilarni topish' },
      ],
    },

    countries: {
      eyebrow: 'Qayerda ishlaydi',
      title: 'O‘n to‘rt davlat, va yo‘riqnoma har biri uchun mahalliy.',
      lede: "Krakovdagi yashash guvohnomasi bilan Rotterdamdagisining nomidan boshqa umumiyligi yo‘q. Yo‘riqnoma davlat va shahar bo‘yicha yoziladi, bittasidan tarjima qilinib qolganlariga tortilmaydi.",
      note: "Yangi davlatlar shu tartibdan haqiqatan o‘tgan odamlarni topganimizda qo‘shiladi.",
    },

    ask: {
      eyebrow: 'Yo‘riqnoma buni qamrab olmasa',
      title: 'O‘z tilingizda so‘rang.',
      lede: "Yordamchi o‘sha materiallardan javob beradi — beshta tilning qaysi birida so‘ragan bo‘lsangiz, o‘shanda — va javob sizning aniq holatingizga bog‘liq bo‘lsa, buni ochiq aytadi.",
      placeholder: 'Krakovda manzilni qanday ro‘yxatdan o‘tkazaman?',
      action: 'So‘rash',
      samples: [
        'Bankda hisob ochish uchun nima kerak?',
        'Kvartira uchun qancha zakalat odatiy hisoblanadi?',
        'Qaysi klinika Yevropa Ittifoqi sug‘urtasini qabul qiladi?',
      ],
    },

    cta: {
      title: 'Qiyini — birinchi oy.',
      lede: "Kerak bo‘lishidan oldin kerakligini o‘qing, kursni kuzatib boring va yo‘lda yig‘gan ballaringizni sarflang.",
      primary: 'Yo‘riqnomani ochish',
      secondary: 'Play & Earn',
      note: "Bepul · Yo‘riqnomani o‘qish uchun hisob kerak emas",
    },
  },

  cta: {
    title: "O‘yna. Yut. Joylashib ol.",
    lede: "Yangi mamlakatni uyga aylantirayotgan minglab odamlarga qo‘shiling — o‘ynang, haqiqiy mukofotlar oling va har qadamda ekspert yordamiga ega bo‘ling. Boshlash bepul.",
    primary: "O‘yna va yutib ol",
    secondary: "Living Guide’ni ko‘rish",
  },

  contact: {
    back: 'paylezga qaytish',
    form: {
      eyebrow: 'Xabar yuborish',
      title: 'Nima bo‘lganini yozing.',
      lede: 'Qanchalik aniq bo‘lsa, shunchalik yaxshi — qaysi ekran, nimani kutgansiz va uning o‘rniga nima bo‘ldi. Agar bu hisobga tegishli bo‘lsa, undagi e-pochta manzili bizga bitta yozishmani tejaydi.',
      topic: 'Bu nima haqida?',
      topics: ['Yordam', 'Fikr', 'Hamkorlik', 'Boshqa narsa'],
      name: 'Ismingiz',
      namePlaceholder: 'Ism va familiya',
      email: 'E-pochtangiz',
      emailPlaceholder: 'siz@email.com',
      message: 'Xabar',
      messagePlaceholder: 'Nima bo‘ldi va nimani kutgan edingiz.',
      submit: 'Pochta ilovasida ochish',
      note: 'Bu sahifada hech narsa saqlanmaydi. Tugma sizning o‘z pochta ilovangizni tayyor va manzillangan xabar bilan ochadi — yuborishni siz bosasiz.',
      error: 'Ismingizni, e-pochta manzilingizni va xabarni to‘ldiring.',
    },

    hours: {
      title: 'Qachon javob beramiz',
      body: 'Dushanbadan jumagacha, Markaziy Yevropa vaqti bilan 09:00–18:00. Ko‘pchilik xabarlar o‘sha ish kunining o‘zida javob oladi. Dam olish kunlari kelgan xabarlarga dushanba tongida javob beriladi.',
      address: 'Krakov, Polsha',
    },
  },

  legal: {
    contents: 'Mundarija',
    english:
      'Ushbu hujjat ingliz tilida chop etilgan. Ingliz tilidagi matn asosiy hisoblanadi.',
    privacyVersion: 'Versiya 1.1 · 2026-yil 28-avgustdan kuchga kiradi · GDPR talablariga muvofiq',
    termsVersion: 'Versiya 1.0 · 2025-yil 24-apreldan kuchga kiradi',
  },
  profile: {
    eyebrow: 'Hisobingiz',
    title: 'Profilingiz',
    lede: 'Buni boshqa o‘yinchilar ko‘radi va biz sizning qayerdaligingizni shundan bilamiz. Bularning hech biri hech narsa bilan tekshirilmaydi — telefoningizga kod yubormaymiz, pochtangizga bosiladigan havola ham kelmaydi.',

    whoLegend: 'Siz kimsiz',
    whereLegend: 'Qayerdasiz va sizga qanday bog‘lanish mumkin',

    photo: 'Surat',
    photoChoose: 'Surat tanlang',
    photoHelp: 'Kvadrat eng yaxshisi. U kichik nusxaga siqiladi va shu qurilmada saqlanadi.',
    photoRemove: 'Suratni olib tashlash',

    username: 'Foydalanuvchi nomi',
    usernameHelp:
      'Harflar, raqamlar va yakka pastki chiziqlar, {min}–{max} belgi. U faqat sizniki bo‘lishi kerak — bu reyting qatoridagi nom.',
    usernamePlaceholder: 'dilnoza',
    usernameErrors: {
      length: 'Foydalanuvchi nomi {min} tadan {max} tagacha belgi bo‘ladi.',
      shape: 'Harflar, raqamlar va ular orasidagi yakka pastki chiziqlar — ikki chetida hech narsa bo‘lmaydi.',
      reserved: 'Bu nom band qilingan.',
      taken: 'Bu nom allaqachon olingan.',
    },

    status: 'Maqom',
    statusHelp: 'Taxminan nima bilan shug‘ullanasiz. Shu orqali joy kim kelganini biladi.',
    statusChoose: 'Bittasini tanlang',
    statusMenu: 'Maqom',
    occupations: {
      student: 'Talaba',
      worker: 'Ishchi',
      business: 'Biznes egasi',
      freelancer: 'Frilanser',
      other: 'Boshqa',
    },

    city: 'Shahar',
    cityPlaceholder: 'Shahringizni yoza boshlang',
    cityHelp:
      'Yoza boshlang va ro‘yxatdan tanlang — Paylez Polsha, Germaniya va O‘zbekistondagi {n} ta shaharni biladi. Sizniki ular orasida bo‘lmasa, shuni belgilang va o‘zingiz yozing.',
    cityMenu: 'Mos keladigan shaharlar',
    cityOther: 'Mening shahrim ro‘yxatda yo‘q',
    cityOtherHelp: 'Shaharni o‘zingiz aytadigan tarzda yozing va yoniga mamlakatni qo‘shing.',
    cityNoMatch:
      'Hech narsa mos kelmadi — «Mening shahrim ro‘yxatda yo‘q»ni belgilang va o‘zingiz yozing.',
    cityNeeded:
      'Ro‘yxatdan shahar tanlang yoki «Mening shahrim ro‘yxatda yo‘q»ni belgilab, mamlakatni ham yozing.',
    cityLoading: 'Shaharlar ro‘yxati yuklanmoqda…',
    cityDown: 'Takliflar mavjud emas — shahar va uning mamlakatini o‘zingiz yozing.',
    cityOffline:
      'Shaharlar ro‘yxati Paylez backendidan keladi, u esa javob bermayapti. Shahar va mamlakatni o‘zingiz yozishingiz mumkin; u qaytganda takliflar ham qaytadi.',
    cityRetry: 'Qayta urinib ko‘ring',
    country: 'Mamlakat',
    countryPlaceholder: 'Polsha',
    countryHelp:
      'Faqat shahringiz ro‘yxatimizda bo‘lmagani uchun so‘raymiz. Nomi yoki ikki harfli kodi.',
    countryUnchecked:
      'So‘raymiz, chunki shahringizni tekshirish uchun shaharlar ro‘yxatiga ulana olmayapmiz. Nomi yoki ikki harfli kodi.',
    countryNeeded: 'Biz bilmagan shaharga mamlakat ham kerak bo‘ladi.',
    countries: { PL: 'Polsha', DE: 'Germaniya', UZ: 'O‘zbekiston' },

    phone: 'Telefon',
    phoneHelp: 'Unga hech kim qo‘ng‘iroq qilmaydi va kod ham yuborilmaydi. Bu — joy olingan aksiya yuzasidan siz bilan bog‘lanadigan yo‘l.',
    phonePlaceholder: '+48 600 000 000',
    phoneShape: 'Bu telefon raqamiga o‘xshamaydi.',

    birthday: 'Tug‘ilgan sana',
    birthdayUnset: 'Buni bir marta qo‘yasiz va bir marta tuzatasiz. Undan keyin qo‘llab-quvvatlashga yozish kerak bo‘ladi.',
    birthdayOneLeft: 'Buni yana bir marta tuzata olasiz.',
    birthdaySpent:
      'Ikkala yozuvni ham ishlatib bo‘ldingiz. Yana o‘zgartirish — qo‘llab-quvvatlashga xat, chunki uchinchi o‘zgarish odamning kimligi haqidagi qaror.',
    birthdayErrors: {
      format: 'Tug‘ilgan sana — bu sana.',
      nonexistent: 'Bunday kun mavjud emas.',
      future: 'Tug‘ilgan sana o‘tmishda bo‘ladi.',
      young: 'Hisob egasi kamida 13 yoshda bo‘lishi kerak.',
      old: 'Bu tug‘ilgan sana to‘g‘riga o‘xshamaydi.',
    },
    birthdayNoWrites: 'Tug‘ilgan sanani bir marta tuzatish mumkin — yana o‘zgartirish uchun qo‘llab-quvvatlashga yozing.',

    email: 'E-pochta',
    emailHelp: 'Siz shu bilan kirasiz. Uni o‘zgartirishni bu versiya uddalay olmaydi.',

    save: 'Profilni saqlash',
    saved: 'Saqlandi',

    cardTitle: 'Boshqalar nimani ko‘radi',
    cardNoName: 'Hali nom yo‘q',
    cardNoRole: 'Hali maqom yo‘q',
    cardNowhere: 'Hali shahar yo‘q',

    meterTitle: 'Profil',
    meterDone: 'Yettitasiga ham javob berilgan.',
    meterStill: 'Hamon bo‘sh',
    meterProgress: '{pct}% to‘ldirilgan',
    fieldNames: {
      avatar: 'Surat',
      username: 'Foydalanuvchi nomi',
      occupation: 'Maqom',
      city: 'Shahar',
      email: 'E-pochta',
      phone: 'Telefon',
      birthDate: 'Tug‘ilgan sana',
    },
  },

  onboarding: {
    step: '{total} qadamdan {n}-si',

    langTitle: 'Til tanlang',
    langLede: 'Keyinroq o‘zgartirsangiz bo‘ladi — u sarlavhadagi almashtirgich.',
    langNext: 'Davom etish',

    gameTitle: 'Bu qaysi mamlakat?',
    gameRound: '{total} raunddan {n}-si',
    gamePts: 'ball',
    gameNext: 'Keyingisi',
    gameLast: 'Nima yutganingizni ko‘ring',
    gameBack: 'Orqaga',
    gameLoading: 'Bayroqlar olinmoqda…',
    gameFailed: 'Bayroqlar yuklanmadi.',
    gameRetry: 'Qayta urinib ko‘ring',
    gameRight: 'To‘g‘ri',
    gameWrong: 'Bu safar emas',

    payTitle: 'Bu sizniki bo‘lib qoladi',
    payEarned: 'Bayroqlardan',
    payGift: 'Xush kelibsiz sovg‘asi',
    payTotal: 'ball',
    payTier: 'Arziydigan birinchi narsa {n} balldan boshlanadi.',
    payLede:
      'Ballar o‘yindan va shahringizdagi joylarga borishdan yig‘iladi. Ularning muddati tugamaydi — ular sizni kutib turadi.',
    payGo: 'O‘ynashni boshlash',
    payProfile: 'Avval profilingizni to‘ldiring',
  },

  subscription: {
    eyebrow: 'Tariflar',
    title: 'Bepul o‘ynang. Kengroq joy uchun to‘lang.',
    lede: 'Har bir tarif bir xil o‘yinlarni o‘ynaydi va bir xil joylarda sarflaydi. Pullisi qo‘shimcha erkinlik beradi — ko‘proq energiya, vaucherni sarflashga uzoqroq muddat va o‘sha raund uchun ko‘proq ball.',
    term: {
      label: 'Qancha muddatga majburiyat olasiz',
      one: '1 oy',
      many: '{n} oy',
      save: '{pct}% tejang',
      rolling: 'Majburiyatsiz',
    },
    perMonth: 'oyiga',
    free: 'Bepul',
    billed: {
      free: 'Foydalanganingizcha bepul. Karta ham, tugaydigan sinov muddati ham yo‘q.',
      monthly: 'Har oy hisoblanadi va xohlagan paytingizda to‘xtatiladi.',
      term: '{n} oy uchun bir marta {total} yechiladi.',
    },
    unlimited: 'Cheksiz',
    included: 'Kiradi',
    notIncluded: 'Kirmaydi',
    badges: ['Yulduzcha', 'Toj'],
    heroRows: ['Kuniga energiya', 'Tiklanish, soat', 'Raund balli'],
    more: 'Qolgan hammasi',
    mark: '{name} reja belgisi',
    plans: [
      { name: 'Free', note: 'Butun aylanma, yordamsiz.' },
      { name: 'Pro', note: 'Har kuni o‘ynaydigan uchun.' },
      { name: 'Premium', note: 'Ballarini naqdga aylantiradigan uchun.' },
    ],
    rows: [
      'Kuniga energiya',
      'Bitta energiya tiklanadigan soatlar',
      'O‘yin raundidagi ballar',
      'Vaucher amal qiladigan kunlar',
      'Kuniga «So‘z yig‘» maslahatlari',
      'Kuniga yordamchiga savollar',
      'Ketma-ketlik muzlatishlari',
      'Faqat obunachilar uchun aksiyalar',
      'Yangi aksiyada ustunlik soatlari',
      'Sovg‘a kartalarida navbatsizlik',
      'Har oy yoziladigan ballar',
      'Ustuvor qo‘llab-quvvatlash',
      'Nomingiz yonidagi belgi',
    ],
    action: 'Hisob yarating',
    note: 'Hech bir tarifda sinov muddati yo‘q — bepul tarifning o‘zi sinov muddati va u hech qachon tugamaydi. Tarif hisob ochilgach ilovada tanlanadi.',
  },

  footer: {
    blurb:
      "O‘yna va yutib ol. Eksklyuziv takliflar. Haqiqiy mukofotlar. Kashf eting, tejang va mukofot oling.",
    location: 'Krakov, Polsha',
    social: '{channel}dagi paylez',
    columns: [
      {
        heading: 'Mahsulot',
        links: ["O‘yna va yutib ol", 'Chegirmalar', "Ko‘chish", 'AI yordamchi'],
      },
      {
        heading: 'Kompaniya',
        links: ['Yordam', 'Fikr bildirish', 'Qaynoq takliflar'],
      },
    ],
    news: {
      heading: "Eng yaxshi takliflarni birinchi bo‘lib oling",
      body: "Haftasiga bitta qisqa xat — vaqtingizga arziydigan yangi takliflar va hamkor chegirmalari.",
      success: 'Pochta ilovangiz ochildi — xatni yuboring va ro‘yxatdasiz ✦',
      placeholder: 'you@email.com',
      emailLabel: 'Elektron pochta manzili',
      subscribe: 'Obuna bo‘lish',
    },
    legal: '© 2026 Paylez. Barcha huquqlar himoyalangan.',
    privacy: 'Maxfiylik siyosati',
    terms: 'Foydalanish shartlari',
  },
};
