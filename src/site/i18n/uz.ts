import type { Dictionary } from './en';

/** Uzbek (Latin script). Structurally identical to `en` — the type enforces it. */
export const uz: Dictionary = {
  code: 'uz',
  label: "O‘zbekcha",
  short: 'UZ',
  region: 'UZ',

  nav: ['Bosh sahifa', 'L-Earn', 'Tahlil', 'B2B', 'Vaucherlar', "Ko‘chish"],
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
    demoTitle: 'Demo hisoblar',
    demoLine: '{role} — {email} · {password}',
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
    tabs: ['Xizmatlar', 'Takliflar', 'Odamlar'],

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
  },

  games: {
    title: 'Aql o‘yinlari',
    lede: 'O‘zingizni sinang, ball yig‘ing va ularni chegirma vaucherlariga almashtiring.',

    score: 'Hisob',
    streak: 'Ketma-ketlik',
    lives: 'Jonlar',
    answered: 'Javoblar',
    correctLabel: 'To‘g‘ri',

    redeemTitle: 'Ballarni mukofotga almashtiring',
    redeemAction: 'Hoziroq almashtirish',

    names: ['Aql o‘yinlari', 'Bayroqni top', 'Davlat va poytaxt', 'Polsha viktorinasi', 'Squawk parvozi'],
    rule: '{questions} savol · har biri {seconds} soniya',
    reward: '{mistakes} xatoga ruxsat · har to‘g‘ri javob uchun +{points}',
    start: 'O‘yinni boshlash',
    noLives: 'Jonlar tugadi — ertaga qayting',

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
      reward: 'Bitta to‘qnashuv o‘yinni tugatadi · har darvoza uchun +{points}',
      goal: '{target} ta raundni hisobga oladi',
      hint: 'Qanot qoqish uchun ekranga bosing',
      resume: 'Davom ettirish uchun bosing',
      aria: 'Uchish o‘yini. Qanot qoqish uchun maydonga bosing.',
      crashed: 'Squawk ustunga urildi',
      resultScore: 'O‘tilgan darvozalar: {cleared}',
      motionTitle: 'Bu o‘yin harakatlanadi',
      motionBody:
        'Qurilmangiz kamroq harakat so‘raydi, bu o‘yin esa ekran bo‘ylab uzluksiz harakatdir — uning harakatsiz varianti yo‘q. Qolgan to‘rtta o‘yin viktorina bo‘lib, joyida turadi. Baribir uchishni istasangiz, o‘yinning o‘zidan tashqari hamma narsa qimirlamaydi.',
      motionPlay: 'Baribir o‘ynash',
      motionBack: 'O‘yinlarga qaytish',
    },

    countries: [
      'Polsha', 'O‘zbekiston', 'Ukraina', 'Germaniya', 'Fransiya',
      'Italiya', 'Ispaniya', 'Niderlandiya', 'Turkiya', 'Buyuk Britaniya',
    ],
    capitals: [
      'Varshava', 'Toshkent', 'Kiyev', 'Berlin', 'Parij',
      'Rim', 'Madrid', 'Amsterdam', 'Anqara', 'London',
    ],

    brain: [
      { q: 'Bu sonlardan qaysi biri tub son?', options: ['91', '87', '83', '99'], a: 2 },
      { q: 'Yer yuzida nechta qit’a bor?', options: ['5', '6', '7', '8'], a: 2 },
      { q: 'Eng katta okean qaysi?', options: ['Atlantika', 'Hind', 'Shimoliy Muz', 'Tinch'], a: 3 },
      { q: 'Quyoshga eng yaqin sayyora qaysi?', options: ['Venera', 'Merkuriy', 'Mars', 'Yer'], a: 1 },
      { q: 'To‘liq bir kecha-kunduzda necha daqiqa bor?', options: ['1440', '1240', '960', '1800'], a: 0 },
    ],
    poland: [
      { q: 'Polshaning valyutasi qanday?', options: ['Yevro', 'Zlotiy', 'Krona', 'Forint'], a: 1 },
      { q: '180 kun ichida Shengen vizasi bilan necha kun qolish mumkin?', options: ['30 kun', '60 kun', '90 kun', '120 kun'], a: 2 },
      { q: 'PESEL raqami nima uchun kerak?', options: ['Bank hisobi uchun', 'Rezidentni aniqlash uchun', 'Haydovchilik guvohnomasi uchun', 'Ijara uchun'], a: 1 },
      { q: 'Polshada manzilingizni qaysi idora ro‘yxatga oladi?', options: ['Urząd Gminy', 'Poczta Polska', 'ZUS', 'NFZ'], a: 0 },
      { q: 'NFZ nimani ta’minlaydi?', options: ['Pensiyalarni', 'Davlat tibbiyotini', 'Soliq deklaratsiyalarini', 'Ish ruxsatnomalarini'], a: 1 },
    ],
  },

  business: {
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
        title: 'Hozircha skanerlash yo‘q',
        body: 'Kassangizdagi har bir skanerlash bir necha soniyada shu yerga tushadi — kim kelgani, qancha sarflagani va mukofotga qanchalik yaqinligi.',
        action: 'QR kodni olish',
      },
    ],
    notWired: 'Bu versiyada ulanmagan.',

    overview: {
      kicker: 'Paylez siz uchun nima qildi',
      headline:
        'Sizga {customers} ta yangi mijoz olib keldik va ular sizda taxminan {revenue} sarfladi.',
      estimate:
        'Bu taxmin. Paylez orqali har bir tashrif sizning o‘z savdongizdan olingan {avg} o‘rtacha chekka ko‘paytirilgan.',
      tiles: ['Tashriflar', 'Olingan takliflar', 'Ishlatilgan vaucherlar', 'Ishlatilgan mukofotlar'],
      since: 'oldingi 30 kunga nisbatan',
      costTitle: 'Paylez sizga qanchaga tushdi',
      costTotal: 'Shu oyda jami',
      roi: 'Har sarflangan birlikka {n}× qaytim.',
      proofTitle: 'Isbotlay oladigan yagona narsa',
      proof:
        'Sodiqlik kampaniyalaringizdagi mijozlar oyiga {after} marta keladi — qo‘shilishdan oldingi {before} martaga qarshi.',
      proofNote: 'Sizning o‘z QR skanlaringizdan hisoblangan, taxmin emas. Kassa integratsiyasi kerak emas.',
      before: 'Oldin',
      now: 'Hozir',
    },

    deals: {
      columns: ['Taklif', 'Holat', 'Ko‘rildi', 'Ochildi', 'Olindi', 'Xarajat'],
      rows: [
        'Ertalabki flat white',
        'Talabalar seshanbasi',
        'Pishiriqqa bepul filtr',
        'Yomg‘irli kunda ikki barobar ball',
        'Qo‘shni chegirmasi',
        'Tushlik to‘plami',
      ],
      states: { live: 'Faol', scheduled: 'Rejalashtirilgan', paused: 'To‘xtatilgan', expired: 'Tugagan' },
      insight:
        'Bepul mahsulotli takliflaringiz foizli chegirmalarga qaraganda 2,4 barobar ko‘p olinadi. 5% li tushlik to‘plami sust ishladi — kichik chegirmalar odamlarni kamdan-kam qo‘zg‘atadi.',
      count: '{n} ta taklif',
    },

    campaigns: {
      rows: ['Doimiylar mukofoti', 'Qahva ketma-ketligi', 'Tushlik klubi', 'Qishki qaytish'],
      rule: '{visits} tashrif → mukofot',
      each: 'har biri {amount}',
      earned: 'Yig‘ilgan',
      used: 'Ishlatilgan',
      unused: '{n} tasi yig‘ilgan-u hech ishlatilmagan',
      gapTitle: 'Kuzatish kerak bo‘lgan raqam — bu farq',
      gap: 'Yig‘ilgan-u ishlatilmagan mukofot mijoz shartni bajarib, qaytib kelmaganini bildiradi. Hozir eng katta farq «{name}»da: {n} ta ishlatilmagan mukofot.',
    },

    vouchers: {
      tiersTitle: 'Kim qaysi bosqichga yetadi',
      tiersLede: 'Bosqichga ballar olib boradi, ya’ni raqamni oshirsangiz, u yoqqa byudjet kamroq ketadi.',
      columns: ['Bosqich', 'Kerakli ball', 'Berilgan', 'Ishlatilgan', 'Hozirgi xarajat'],
      tier: '{n}% chegirma',
      budgetTitle: 'Chegirma byudjeti',
      spent: 'Sarflangan',
      held: 'Ajratilgan',
      free: 'Mavjud',
      heldNote:
        'Mijozlar yig‘gan-u hali ishlatmagan mukofotlar uchun ajratilgan pul. Muddati o‘tsa, u qaytadi.',
    },

    customers: {
      fromTitle: 'Ular qayerdan',
      nations: ['Ukrainlar', 'Polyaklar', 'Belaruslar', 'Gruzinlar', 'Turklar', 'Boshqalar'],
      readTitle: 'Ilovani qaysi tilda o‘qiydi',
      langs: ['Ruscha', 'Ukraincha', 'Polyakcha', 'Inglizcha', 'Boshqa'],
      privacy:
        'Bu yerdagi hamma narsa guruhlar bo‘yicha hisoblanadi. Paylez hech qachon alohida odamni ko‘rsatmaydi, o‘ntadan kichik guruhlar esa «boshqalar»ga qo‘shiladi.',
      backTitle: 'Ular qaytadimi',
      months: ['Aprel', 'May', 'Iyun', 'Iyul'],
      cohort: '{first} dan {back} tasi 30 kun ichida qaytdi',
      finding:
        'Mijozlaringizning 38 foizi ukrainlar, 42 foizi esa ilovani ruscha o‘qiydi. Faol takliflaringizdan birortasi ham rus tilida gaplashuvchilarga qaratilmagan.',
    },

    scans: {
      columns: ['Qachon', 'Mijoz', 'Sarfladi', 'Ballar', 'Chek', 'Jarayon'],
      first: 'Birinchi tashrif',
      again: 'Qaytib keldi',
      today: 'Bugun',
      count: '48 skanerlashdan {n} tasi ko‘rsatilmoqda',
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

    range: 'Oxirgi 30 kun',
    notifications: 'Bildirishnomalar',
  },

  hero: {
    lines: ["O‘yna va yutib ol.", 'Eksklyuziv takliflar.'],
    lede: 'Kashf eting, o‘ynang va mukofot oling.',
    primary: "O‘yna va yutib ol",
    secondary: 'Bu qanday ishlaydi',
    stats: ["Har g‘alaba uchun", "Hamkor do‘konlar", 'Faol shaharlar'],
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
        body: "Bonus ballar va tezkor vaucherlar uchun do‘konda hamkor QR kodlarini skanerlang — to‘g‘ridan-to‘g‘ri telefoningizdan.",
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
        body: "Do‘stlaringizni taklif qiling, ketma-ketligingizni saqlang va kattaroq sovrinlar uchun oylik reytingda ko‘tariling.",
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
      stats: ["Har g‘alaba uchun", 'Ketma-ketlik bonusi', 'Vaucherga yetadi'],
    },

    steps: {
      eyebrow: 'Bu qanday ishlaydi',
      title: "To‘rt qadam, taxminan ikki daqiqa.",
      lede: "Tramvaydagi bir yo‘lga yetadigan darajada qisqa — o‘yinning ko‘p qismi aynan o‘sha yerda o‘ynaladi.",
      items: [
        {
          title: "O‘yin tanlang",
          body: "Poytaxtlar, bayroqlar yoki Polshadagi hayot. Har raundda o‘nta savol va ularning hech biri uzoq davom etmaydi.",
        },
        {
          title: 'Javob bering',
          body: "Har bir to‘g‘ri javob ball keltiradi, tez javob esa ko‘proq — soat ham o‘yinning bir qismi.",
        },
        {
          title: 'Ketma-ketlikni saqlang',
          body: "Ertaga qayting. Ketma-ketlik yig‘gan ballaringizni ko‘paytiradi, ketma-ket yetti kun esa alohida bonus beradi.",
        },
        {
          title: 'Almashtiring',
          body: "Ballarni vaucherga aylantiring va do‘konda skanerlang. Chop etish ham, kutish ham shart emas.",
        },
      ],
    },

    games: {
      eyebrow: "O‘yinlar",
      title: "Ball to‘plashning uch yo‘li.",
      lede: "Uchalasi ham shu saytdagi har bir tilga tarjima qilingan, shuning uchun o‘zingiz xohlamasangiz, hech qachon ikkinchi tilingizda o‘ynamaysiz.",
      items: [
        {
          name: 'Capital Game',
          blurb: "Poytaxtni ayting. Oson boshlanadi va to‘rtinchi raund atrofida oson bo‘lishdan to‘xtaydi.",
          meta: "10 savol · 100 ballgacha",
        },
        {
          name: 'Flag Game',
          blurb: "Bayroqni davlatga moslang. Uchalasidan eng tezkori va navbatda o‘ynaladigani.",
          meta: '10 savol · 100 ballgacha',
        },
        {
          name: 'Polshadagi hayot',
          blurb: "Amaliyroq bo‘lgani: hujjatlar, transport, ijara — hech kim aytmaydigan narsalar. Ballga ham, bilishga ham arziydi.",
          meta: '10 savol · 150 ballgacha',
        },
      ],
    },

    streak: {
      eyebrow: 'Ketma-ketlik',
      title: 'Ballar aynan ketma-ketlikda.',
      lede: "Har 24 soatda bitta raund uni tirik saqlaydi. Shu oraliqni o‘tkazib yuborsangiz, ketma-ketlik ham, u bilan yig‘gan ballaringiz ham nolga qaytadi — qoida shu, xolos.",
      card: {
        label: 'Joriy ketma-ketlik',
        unit: 'kun',
        reward: "Yettinchi kuni +250 ball",
      },
      benefits: [
        {
          title: 'Uchinchi kun: 1,5×',
          body: "Yig‘gan har bir ballingiz bir yarim baravar qimmatga aylanadi — uchala o‘yinda ham.",
        },
        {
          title: 'Yettinchi kun: 250 ball',
          body: "Ko‘paytirgich ustiga qat’iy bonus, yettinchi raund tugagan zahoti beriladi.",
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
      lede: "Oyning birinchi kuni hamma noldan boshlaydi. Uchta eng yaxshisi oylik sovrin jamg‘armasini bo‘lishadi; qolganlar keyingi oyni teng sharoitda boshlaydi.",
      columns: { rank: '#', player: "O‘yinchi", points: 'Ballar' },
      note: "Namunaviy jadval — sizniki har oyning 1-kunida noldan boshlanadi.",
    },

    faq: {
      eyebrow: 'Savollar',
      title: 'Qisqa javoblar.',
      items: [
        {
          q: 'Ballarning muddati tugaydimi?',
          a: "Ha. Ularni saqlab qolish uchun har 24 soatda kamida bitta raund o‘ynang — shu oraliqni o‘tkazib yuborsangiz, ballaringiz ham, ketma-ketligingiz ham nolga qaytadi.",
        },
        {
          q: "Kuniga nechta raund o‘ynay olaman?",
          a: "Jonlaringiz yetgunicha. Har raund bitta jon oladi, jonlar esa vaqt o‘tishi bilan tiklanadi — ya’ni kunlik cheklov yo‘q, faqat qolgan jonlaringiz bor.",
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
    hero: {
      eyebrow: 'Hamkor tahlili',
      lines: ['Har bir skan —', 'hisobda.'],
      lede: "Service ID’ingizni kiriting va kampaniya aslida nima qilganini ko‘ring: ko‘rsatishlar, bosishlar, foydalanishlar va ularning qiymati — har bir taklif bo‘yicha.",
      primary: 'Panelni ochish',
      secondary: "Nima olishingizni ko‘ring",
      idLabel: 'Service ID',
      idNote: "Sizning noyob ID’ingiz — hamkorlik shartnomasida bor.",
      idAction: "Tahlilni ko‘rish",
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
      lede: "Har bir hamkor taklifi ishga tushgan kunidan buyon shu ma’lumotni yig‘moqda. Service ID’ni kiriting — panel joyida.",
      primary: 'Panelni ochish',
      secondary: 'Hamkorlik haqida gaplashamiz',
      note: "Har bir hamkor hisobida · Qo‘shimcha to‘lovsiz",
    },
  },

  /* ──────────────────────────────────────────────────────────────── b2b ── */

  b2b: {
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
              body: 'Push, muddatli takliflar, promokodlar, sovg‘a kartalari, bonus ballar va e-pochta.',
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
          body: "To‘liq marketing to‘plami, filial kirishlari va bonus ballar.",
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
          body: "Uchta o‘yinda kuniga uchta hisobli raund. Har bir to‘g‘ri javob — ball, seriya esa bitta yaxshi kundan qimmatroq.",
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
          title: "O‘ynashni to‘xtatsangiz, ballar yonadi",
          body: "Har 24 soatda kamida bitta raund o‘ynang — ballaringiz ham, ketma-ketligingiz ham davom etadi. Shu oraliqni o‘tkazib yuborsangiz, ikkalasi ham nolga qaytadi. Allaqachon olingan vaucherlarning esa o‘z muddati bor va u siz biror narsa sarflashdan oldin kartada yozilgan turadi.",
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
      title: 'Keyingi vaucheringizgacha taxminan to‘rt daqiqa.',
      lede: "Bu — uchta raund savol. Bugun boshlang, seriya ham sanashni boshlaydi.",
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
      lede: "Qayerda hisob ochish, kvartira zakalati qanday ishlaydi, qaysi klinika sug‘urtangizni qabul qiladi, pulingiz uyingizda aslida qanchaga arziydi. To‘qqiz mavzu, o‘n to‘rt davlat — buni boshidan kechirganlar yozgan.",
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
      title: 'To‘qqiz mavzu, va kerak bo‘lgani doim kutilmagani bo‘lib chiqadi.',
      lede: "Har biri shahringiz uchun bosqichma-bosqich yo‘riqnomaga ochiladi — qaysi hujjat, qayerda beriladi, qancha turadi va qancha vaqt oladi.",
      cities: 'Barcha shaharlar',
      search: 'Yo‘riqnomadan qidirish',
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

  footer: {
    blurb:
      "O‘yna va yutib ol. Eksklyuziv takliflar. Haqiqiy mukofotlar. Kashf eting, tejang va mukofot oling.",
    location: 'Krakov, Polsha',
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
      body: "Haftasiga bitta qisqa xat — vaqtingizga arziydigan yangi takliflar va ball ko‘paytirgichlari.",
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
