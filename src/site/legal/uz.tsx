/**
 * The two legal documents in Uzbek.
 *
 * A translation of `en.tsx`, which is the authoritative text: where this module
 * and that one differ, that one prevails, and `copy.legal.english` tells the
 * reader so in Uzbek at the top of the page. Edit a clause in `en.tsx` and this
 * file is out of date until it is edited too.
 *
 * The section ids are `en.tsx`'s own and are never translated — they are the
 * anchors `ANCHOR_ROUTES` files under the two routes, and a reader who switches
 * language mid-document keeps their place only because every language agrees
 * about them. Company name, addresses, the e-mail address and the two web
 * addresses are left exactly as they are for the same reason a name is: they
 * identify something rather than describe it.
 *
 * The letters are written the way `i18n/uz.ts` writes them — `o‘` and `g‘` with
 * U+2018, the tutuq belgisi as `’` (U+2019) — rather than with the typewriter
 * apostrophe. Both are curly, so none of them closes a TypeScript string, and
 * the two documents read as the same language as the rest of the site.
 *
 * `GDPR` is left in its Latin form rather than transliterated: it is how the
 * regulation is referred to in Uzbek-language practice, and the reader who needs
 * the citation is the one who would look it up.
 */
import { Meta, Notice, Section, Table, type LegalText } from './parts';

/* ══════════════════════════════════════════════════════ privacy policy ══ */

const PRIVACY_CONTENTS: Array<[string, string]> = [
  ['privacy-1', 'Biz kimmiz'],
  ['privacy-2', 'Qanday ma’lumotlarni va nima uchun yig‘amiz'],
  ['privacy-3', 'Ma’lumotlarning maxsus toifalari'],
  ['privacy-4', 'Ma’lumotlaringizni qanday ulashamiz'],
  ['privacy-5', 'Ma’lumotlarni xalqaro uzatish'],
  ['privacy-6', 'GDPR bo‘yicha huquqlaringiz'],
  ['privacy-7', 'Cookie fayllar va lokal xotira'],
  ['privacy-8', 'Ma’lumotlar xavfsizligi'],
  ['privacy-9', 'Bolalar ma’lumotlari'],
  ['privacy-10', 'Ushbu Maxfiylik siyosatiga o‘zgartirishlar'],
  ['privacy-11', 'Aloqa va nazoratchi haqida ma’lumot'],
];

function privacyBody() {
  return (
    <>
      <Meta
        rows={[
          ['Ma’lumotlar nazoratchisi', 'Paylez Sp. z o.o.'],
          ['Aloqa', 'usepaylez@gmail.com'],
          [
            'Amaldagi qonunchilik',
            'Reglament (Yevropa Ittifoqi) 2016/679 (GDPR) · Polshaning shaxsiy ma’lumotlarni himoya qilish to‘g‘risidagi qonuni',
          ],
          ['Nazorat organi', 'Urząd Ochrony Danych Osobowych (UODO) · www.uodo.gov.pl'],
        ]}
      />

      <Section id="privacy-1" n="1." title="Biz kimmiz">
        <p>
          Paylez Polshada ro‘yxatdan o‘tgan Paylez Sp. z o.o. kompaniyasi tomonidan boshqariladi. Biz
          chet elliklar, xalqaro talabalar va Polshaga yangi kelganlar uchun qo‘llanma va xizmatlarni
          topish platformasini taqdim etamiz hamda ularni ishonchli mahalliy xizmat ko‘rsatuvchilar
          bilan bog‘laymiz.
        </p>
        <p>
          Biz platformamiz, mobil ilovamiz va veb-saytimiz (www.pay-lez.com) orqali yig‘iladigan
          barcha shaxsiy ma’lumotlar uchun nazoratchi sifatida ish yuritamiz.
        </p>
      </Section>

      <Section id="privacy-2" n="2." title="Qanday ma’lumotlarni va nima uchun yig‘amiz">
        <p>
          Biz faqat xizmatlarimizni taqdim etish va yaxshilash uchun zarur bo‘lgan ma’lumotlarni
          yig‘amiz. Quyida qayta ishlanadigan ma’lumotlarning har bir toifasi, ularni qayta ishlash
          uchun huquqiy asos va saqlash muddati to‘liq tavsiflangan.
        </p>

        <h3>2.1 Shaxsni aniqlash va autentifikatsiya ma’lumotlari</h3>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['Elektron pochta manzili', 'Hisob yaratish, kirish, aloqa', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati + 3 yil'],
            ['Ism va familiya', 'Hisobni aniqlash', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati + 3 yil'],
            ['Ko‘rsatiladigan ism', 'Ommaviy profilni shaxsiylashtirish', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati'],
            ['Rol (foydalanuvchi/administrator)', 'Kirish va ruxsatlarni nazorat qilish', 'Qonuniy manfaat (6(1)(f)-modda)', 'Hisob amal qilish muddati'],
            ['Profil to‘ldirilganlik holati', 'Platforma bilan tanishtirish jarayoni', 'Qonuniy manfaat (6(1)(f)-modda)', 'Hisob amal qilish muddati'],
          ]}
        />

        <h3>2.2 Profil ma’lumotlari</h3>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['Yashash mamlakati va shahri', 'Mahalliy xizmat tavsiyalari', 'Rozilik (6(1)(a)-modda)', 'Rozilik qaytarilgunga qadar + 1 yil'],
            ['Tavsif va ish haqida ma’lumot', 'Profilni shaxsiylashtirish', 'Rozilik (6(1)(a)-modda)', 'Rozilik qaytarilgunga qadar'],
            ['Biladigan tillar, qiziqishlar', 'Shaxsiylashtirilgan kontent yetkazish', 'Rozilik (6(1)(a)-modda)', 'Rozilik qaytarilgunga qadar'],
            ['WhatsApp raqami', 'Ixtiyoriy aloqa imkoniyati', 'Rozilik (6(1)(a)-modda)', 'Rozilik qaytarilgunga qadar'],
            ['Telegram foydalanuvchi nomi', 'Ixtiyoriy aloqa imkoniyati', 'Rozilik (6(1)(a)-modda)', 'Rozilik qaytarilgunga qadar'],
            ['Profil ko‘rinishi sozlamasi', 'Maxfiylikni nazorat qilish', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati'],
          ]}
        />

        <h3>2.3 Moliyaviy ma’lumotlar (faol emas — kelajakdagi imkoniyat)</h3>
        <Notice>
          <p>
            <strong>MUHIM OGOHLANTIRISH:</strong> Xalqaro pul o‘tkazmalari imkoniyati hozirda
            ishlamaydi. Quyida sanab o‘tilgan ma’lumot maydonlari tizimimiz arxitekturasida mavjud,
            biroq HECH QANDAY moliyaviy amaliyot qayta ishlanmaydi, HECH QANDAY haqiqiy pul
            harakatlanmaydi va bu bosqichda HECH QANDAY to‘lov ma’lumoti faol ravishda yig‘ilmaydi.
            Ushbu bo‘lim faqat kelajakdagi ma’lumotlarni qayta ishlash niyatlarini hujjatlashtiradi.
            Bu imkoniyatni ishga tushirishdan oldin ushbu Maxfiylik siyosatini yangilaymiz va tegishli
            roziliklarni olamiz.
          </p>
        </Notice>
        <p>Imkoniyat ishga tushganda quyidagi ma’lumotlar qayta ishlanadi:</p>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['Amaliyot summalari, valyuta kurslari, komissiyalar', 'O‘tkazmalarni amalga oshirish', 'Shartnoma (6(1)(b)-modda)', '7 yil (qonuniy majburiyat)'],
            ['To‘lov usuli ma’lumotlari (niqoblangan karta, IBAN oxirgi 4 raqami)', 'To‘lovlarni qayta ishlash', 'Shartnoma (6(1)(b)-modda)', '7 yil (qonuniy majburiyat)'],
            ['Qabul qiluvchining ismi, telefoni, bank rekvizitlari', 'O‘tkazmani bajarish', 'Shartnoma (6(1)(b)-modda)', '7 yil (qonuniy majburiyat)'],
            ['Blokcheyn amaliyoti xeshi', 'Kripto o‘tkazmani tekshirish', 'Shartnoma (6(1)(b)-modda)', '7 yil (qonuniy majburiyat)'],
            ['Stripe to‘lov usuli identifikatori', 'To‘lovlarni xavfsiz tokenlashtirish', 'Shartnoma (6(1)(b)-modda)', 'Munosabatlar davomida'],
            ['EUR va USDT hamyon qoldiqlari', 'Hamyonni boshqarish', 'Shartnoma (6(1)(b)-modda)', '7 yil (qonuniy majburiyat)'],
          ]}
        />

        <h3>2.4 O‘yin va xulq-atvor ma’lumotlari</h3>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['Viktorina javoblari va natijalari', 'O‘yinlarning ishlashi va taraqqiyot', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati'],
            ['Ketma-ketliklar va jonlar', 'O‘yin mexanikasi', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati'],
            ['Natijalar tarixi (bilim, bayroqlar, poytaxtlar o‘yinlari)', 'Reytinglar va taraqqiyotni kuzatish', 'Qonuniy manfaat (6(1)(f)-modda)', 'Hisob amal qilish muddati'],
            ['Murakkablik darajasidagi o‘sish', 'Shaxsiylashtirilgan o‘yin tajribasi', 'Qonuniy manfaat (6(1)(f)-modda)', 'Hisob amal qilish muddati'],
            ['Oxirgi o‘yin vaqt belgilari', 'Ketma-ketlikni hisoblash va bildirishnomalar', 'Qonuniy manfaat (6(1)(f)-modda)', 'Hisob amal qilish muddati'],
          ]}
        />

        <h3>2.5 Mukofotlar, vaucherlar va tavsiyalar</h3>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['Tavsiya kodi va taklif qilgan shaxs', 'Tavsiya dasturini boshqarish', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati + 2 yil'],
            ['Yig‘ilgan va sarflangan ballar', 'Sodiqlik dasturini hisobga olish', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati + 2 yil'],
            ['Vaucher kodlari va chegirma miqdorlari', 'Vaucherlarni chiqarish va tekshirish', 'Shartnoma (6(1)(b)-modda)', 'Muddati tugagach 2 yil'],
            ['Vaucherdan foydalanish holati', 'Firibgarlikning oldini olish', 'Qonuniy manfaat (6(1)(f)-modda)', 'Foydalanilgach 2 yil'],
            ['QR kodni skanerlash vaqt belgilari', 'Vaucherni tekshirish', 'Shartnoma (6(1)(b)-modda)', '2 yil'],
            ['QR skanerlashdagi qurilma ma’lumoti (user agent)', 'Firibgarlikni aniqlash va xavfsizlik', 'Qonuniy manfaat (6(1)(f)-modda)', '1 yil'],
            ['Vaucherdan foydalanishdagi chek summalari', 'Hamkorlar bilan hisob-kitob va audit', 'Qonuniy manfaat (6(1)(f)-modda)', '3 yil'],
          ]}
        />

        <h3>2.6 Tahliliy va o‘zaro aloqa ma’lumotlari</h3>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['Hamkor xizmatlariga bosishlar (Xaritalar, sayt, telefon, Instagram)', 'Platforma tahlili va hamkorlar uchun hisobot', 'Qonuniy manfaat (6(1)(f)-modda)', '2 yil (90 kundan so‘ng umumlashtiriladi)'],
            ['Bosish paytidagi foydalanuvchi tili', 'Til moslashuvini yaxshilash', 'Qonuniy manfaat (6(1)(f)-modda)', '2 yil (90 kundan so‘ng umumlashtiriladi)'],
            ['Xizmat bilan aloqa qilingan mamlakat va shahar', 'Geografik tahlil', 'Qonuniy manfaat (6(1)(f)-modda)', '2 yil (90 kundan so‘ng umumlashtiriladi)'],
            ['Sodiqlik skanerlari vaqt belgilari va tashrif buyurilgan xizmat', 'Hamkor natijalari bo‘yicha hisobot', 'Qonuniy manfaat (6(1)(f)-modda)', '2 yil'],
          ]}
        />

        <h3>2.7 Qo‘llab-quvvatlash va foydalanuvchi yaratgan kontent</h3>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['Fikr-mulohazalar va yulduzli baholar', 'Xizmatlarni yaxshilash', 'Qonuniy manfaat (6(1)(f)-modda)', '3 yil'],
            ['Murojaat toifasi', 'Qo‘llab-quvvatlashni tasniflash', 'Qonuniy manfaat (6(1)(f)-modda)', '3 yil'],
            ['Murojaatdagi ism va elektron pochta', 'Qo‘llab-quvvatlash javobi', 'Shartnoma (6(1)(b)-modda)', '3 yil'],
            ['Foydalanuvchilar yuborgan biznes tavsiyalari', 'Platforma kontentini yaxshilash', 'Rozilik (6(1)(a)-modda)', 'Rozilik qaytarilgunga qadar yoki 3 yil'],
          ]}
        />

        <h3>2.8 Texnik va avtomatik olinadigan ma’lumotlar</h3>
        <Table
          head={['Ma’lumot turi', 'Maqsad', 'Huquqiy asos', 'Saqlash muddati']}
          rows={[
            ['IP manzil (serverlarimiz va veb-server jurnallari tomonidan qayta ishlanadi)', 'Xavfsizlik, firibgarlikning oldini olish, qonunga rioya qilish', 'Qonuniy manfaat (6(1)(f)-modda)', '90 kun'],
            ['User agent / qurilma ma’lumoti (QR skanerlashda olinadi)', 'Xavfsizlik va firibgarlikni aniqlash', 'Qonuniy manfaat (6(1)(f)-modda)', '1 yil'],
            ['Sessiya tokenlari (biz tomonidan beriladi va saqlanadi)', 'Autentifikatsiya va sessiyani boshqarish', 'Shartnoma (6(1)(b)-modda)', 'Sessiya davomida'],
            ['Google hisob identifikatori va tasdiqlangan pochta (faqat Google orqali kirsangiz)', 'Autentifikatsiya', 'Shartnoma (6(1)(b)-modda)', 'Hisob amal qilish muddati'],
            ['localStorage — mavzu va til tanlovi', 'Foydalanuvchi tajribasini shaxsiylashtirish', 'Qonuniy manfaat (6(1)(f)-modda)', 'Foydalanuvchi tozalagunga qadar'],
            ['localStorage — kirgan sessiya va sessiya tokeni', 'Tashriflar orasida tizimda qolish', 'Shartnoma (6(1)(b)-modda)', 'Chiqish yoki tozalashgacha'],
            ['localStorage — o‘yin taraqqiyoti holati', 'Viktorina savollari takrorlanmasligi uchun', 'Qonuniy manfaat (6(1)(f)-modda)', 'Foydalanuvchi tozalagunga qadar'],
          ]}
        />
        <h3>2.9 Sayt tashriflarini o‘lchash</h3>
        <p>
          Saytdan qanday foydalanilayotganini o‘z serverlarimizda ishlaydigan o‘z dasturiy
          ta’minotimiz bilan o‘lchaymiz. Biz Google Analytics yoki boshqa har qanday uchinchi tomon
          tahlil xizmatidan foydalanmaymiz hamda hech qanday tahliliy cookie fayl va hech qanday
          tashrifchi identifikatorini o‘rnatmaymiz. Tashrif har kuni o‘zgaradigan va hech qachon
          identifikator sifatida saqlanmaydigan, ulanishdan olingan qiymat yordamida hisoblanadi —
          bu esa qaytib kelgan anonim tashrifchilar biz uchun ataylab o‘lchab bo‘lmaydigan
          bo‘lishini anglatadi.
        </p>
      </Section>

      <Section id="privacy-3" n="3." title="Ma’lumotlarning maxsus toifalari">
        <p>
          Biz GDPR 9-moddasida belgilangan shaxsiy ma’lumotlarning maxsus toifalarini (jumladan,
          sog‘liq, irqiy yoki etnik kelib chiqish, siyosiy qarashlar, diniy e’tiqodlar yoki biometrik
          ma’lumotlarni) ataylab yig‘maymiz.
        </p>
        <p>
          Shuni qayd etamizki, profilingizda yig‘iladigan millat ma’lumoti (yashash mamlakati) ayrim
          kontekstlarda etnik jihatdan nozik deb hisoblanishi mumkin. Biz bu ma’lumotni faqat
          mahalliy xizmat tavsiyalarini taqdim etish maqsadida qayta ishlaymiz va undan hech qanday
          kamsituvchi profillashtirish uchun foydalanmaymiz. Siz bu ma’lumotni istalgan vaqtda
          profilingizdan o‘chirishingiz mumkin.
        </p>
      </Section>

      <Section id="privacy-4" n="4." title="Ma’lumotlaringizni qanday ulashamiz">
        <p>
          Biz shaxsiy ma’lumotlaringizni sotmaymiz. Ma’lumotlarni faqat quyidagi hollarda ulashamiz:
        </p>

        <h3>4.1 Xizmat hamkorlari (katalogdagi bizneslar)</h3>
        <p>
          Siz hamkorning e’loni bilan o‘zaro aloqada bo‘lganingizda (bosish, tashrif, vaucherdan
          foydalanish) biz o‘sha hamkorga umumlashtirilgan va anonimlashtirilgan tahlilni beramiz.
          Shaxs darajasidagi ma’lumotni hamkorlarga faqat quyidagi hollarda beramiz:
        </p>
        <ul>
          <li>Siz o‘sha hamkorga yo‘naltirilgan so‘rov yoki murojaat shaklini aniq yuborganingizda</li>
          <li>Vaucherdan foydalanish hisobingizni tekshirishni talab qilganda</li>
          <li>Siz muayyan hamkorga aloqa ma’lumotlaringizni berishga rozilik bildirganingizda</li>
        </ul>

        <h3>4.2 Texnologik quyi qayta ishlovchilar</h3>
        <Table
          head={['Quyi qayta ishlovchi', 'Maqsad', 'Joylashuv', 'Kafolat']}
          rows={[
            ['IONOS SE', 'Server xostingi, ma’lumotlar bazasi infratuzilmasi va ilovani yetkazish', 'Frankfurt, Germaniya (YeIH)', 'Ma’lumotlarni qayta ishlash shartnomasi'],
            ['Google Ireland Limited', 'Google orqali kirish — faqat shaxsni tasdiqlash, uni tanlagan foydalanuvchilar uchun', 'Irlandiya (YeIH)', 'Ma’lumotlarni qayta ishlash shartnomasi'],
            ['Stripe (kelajakda)', 'To‘lovlarni qayta ishlash (faol emas)', 'AQSh', 'Standart shartnoma bandlari (SCC)'],
          ]}
        />
        <p>
          Ilovamiz va ma’lumotlar bazamizni o‘zimiz joylashtiramiz. Autentifikatsiya, sessiyalarni
          boshqarish va barcha foydalanuvchi ma’lumotlari biz boshqaradigan infratuzilmada qayta
          ishlanadi va yuqorida sanab o‘tilganlardan boshqa hech bir uchinchi tomon hisob
          ma’lumotlarini bizning nomimizdan saqlamaydi va qayta ishlamaydi.
        </p>

        <h3>4.3 Qonuniy talablar</h3>
        <p>
          Amaldagi qonun yoki sud qarori talab qilgan hollarda, yoxud platforma yoki uning
          foydalanuvchilarining qonuniy huquqlarini himoya qilish maqsadida biz shaxsiy
          ma’lumotlarni huquqni muhofaza qiluvchi yoki nazorat organlariga (jumladan UODOga)
          oshkor qilishimiz mumkin.
        </p>
      </Section>

      <Section id="privacy-5" n="5." title="Ma’lumotlarni xalqaro uzatish">
        <p>
          Hozirgi barcha ma’lumotlarni qayta ishlashimiz Yevropa Iqtisodiy Hududi (YeIH) doirasida
          amalga oshiriladi. Serverlarimiz va ma’lumotlar bazamiz Germaniyaning Frankfurt shahrida
          joylashgan, yagona boshqa faol quyi qayta ishlovchi esa Google Ireland Limited. Hozirda
          hech qanday shaxsiy ma’lumot YeIH tashqarisiga uzatilmaydi.
        </p>
        <p>
          Agar kelajakda ma’lumotlar YeIH tashqarisiga uzatiladigan bo‘lsa (masalan, 2.3-bo‘limda
          tasvirlangan to‘lovlarni qayta ishlash ishga tushirilsa), biz tegishli kafolatlar
          mavjudligini ta’minlaymiz, jumladan:
        </p>
        <ul>
          <li>Yevropa Komissiyasi tomonidan tasdiqlangan standart shartnoma bandlari (SCC)</li>
          <li>Qo‘llaniladigan hollarda adekvatlik to‘g‘risidagi qarorlar</li>
          <li>Barcha quyi qayta ishlovchilar bilan ma’lumotlarni qayta ishlash shartnomalari</li>
        </ul>
        <p>
          <strong>O‘zbekistonda joylashgan foydalanuvchilar:</strong> Biz Polsha va Yevropa Ittifoqi
          qonunchiligi doirasida ish yuritamiz. Agar sizning aniq holatingizga O‘zbekiston
          qonunchiligi tatbiq etilsa, mustaqil yuridik maslahat olishingizni tavsiya qilamiz.
        </p>
      </Section>

      <Section id="privacy-6" n="6." title="GDPR bo‘yicha huquqlaringiz">
        <p>
          GDPR bo‘yicha ma’lumotlar subyekti sifatida sizda quyidagi huquqlar mavjud. Ulardan
          birortasidan foydalanish uchun usepaylez@gmail.com manziliga murojaat qiling. Biz 30 kun
          ichida javob beramiz.
        </p>
        <Table
          head={['Huquq', 'Bu nimani anglatadi', 'Qanday foydalanish mumkin']}
          rows={[
            ['Kirish huquqi (15-modda)', 'Siz haqingizda saqlanadigan barcha ma’lumotlar nusxasini so‘rash', 'usepaylez@gmail.com manziliga «Ma’lumotlarga kirish so‘rovi» mavzusida xat'],
            ['Tuzatish huquqi (16-modda)', 'Noaniq yoki to‘liq bo‘lmagan ma’lumotlarni tuzatish', 'Ilova sozlamalarida o‘zgartiring yoki bizga yozing'],
            ['O‘chirish huquqi (17-modda)', 'Ma’lumotlaringizni o‘chirishni so‘rash («unutilish huquqi»)', 'usepaylez@gmail.com manziliga «O‘chirish so‘rovi» mavzusida xat'],
            ['Qayta ishlashni cheklash huquqi (18-modda)', 'Ayrim hollarda ma’lumotlaringizdan foydalanishimizni cheklash', 'usepaylez@gmail.com manziliga xat'],
            ['Ma’lumotlarni ko‘chirish huquqi (20-modda)', 'Ma’lumotlaringizni mashina o‘qiy oladigan formatda olish', 'usepaylez@gmail.com manziliga «Ko‘chirish so‘rovi» mavzusida xat'],
            ['E’tiroz bildirish huquqi (21-modda)', 'Qonuniy manfaatga asoslangan qayta ishlashga e’tiroz bildirish', 'usepaylez@gmail.com manziliga xat'],
            ['Rozilikni qaytarib olish huquqi', 'Rozilikka asoslangan qayta ishlash uchun rozilikni istalgan vaqtda qaytarib olish', 'Ilova sozlamalari yoki bizga xat'],
            ['Shikoyat berish huquqi', 'Polsha nazorat organiga shikoyat qilish', 'www.uodo.gov.pl'],
          ]}
        />
      </Section>

      <Section id="privacy-7" n="7." title="Cookie fayllar va lokal xotira">
        <p>
          <strong>Biz cookie fayllardan foydalanmaymiz.</strong> Qurilmangizda localStorage
          yordamida quyidagilarni saqlaymiz:
        </p>
        <ul>
          <li>Mavzu tanlovi (yorug‘/qorong‘i) — hech qachon serverlarimizga yuborilmaydi</li>
          <li>Til tanlovi — til sozlamasini sessiyalar orasida saqlash uchun</li>
          <li>Kirgan sessiyangiz va sessiya tokeni — tashriflar orasida tizimda qolishingiz uchun</li>
          <li>O‘yin taraqqiyoti holati — viktorina savollari takrorlanmasligi uchun</li>
          <li>Saytning ochilish animatsiyasi allaqachon ko‘rsatilgan-ko‘rsatilmagani</li>
        </ul>
        <p>
          Bularning hech biri reklama yoki kuzatuv identifikatori emas, hech biri uchinchi tomonlarga
          berilmaydi, dastlabki ikkitasi va oxirgisi esa umuman serverlarimizga yuborilmaydi. Sessiya
          qiymatlari tizimdan chiqqaningizda o‘chiriladi. Siz localStorage’ni brauzer yoki qurilma
          sozlamalari orqali istalgan vaqtda tozalashingiz mumkin.
        </p>
        <p>
          Agar kelajakda cookie fayllarni yoki biror uchinchi tomon tahliliy yoxud reklama
          texnologiyasini joriy qilsak, ushbu siyosatni yangilaymiz va uni joriy qilishdan oldin
          cookie roziligi mexanizmini amalga oshiramiz.
        </p>
      </Section>

      <Section id="privacy-8" n="8." title="Ma’lumotlar xavfsizligi">
        <p>
          Shaxsiy ma’lumotlaringizni ruxsatsiz kirish, o‘zgartirish, oshkor qilish yoki yo‘q
          qilishdan himoya qilish uchun tegishli texnik va tashkiliy choralarni qo‘llaymiz. Bu
          choralar quyidagilarni o‘z ichiga oladi:
        </p>
        <ul>
          <li>Barcha ulanishlarda shifrlangan ma’lumot uzatish (HTTPS/TLS)</li>
          <li>Parollar faqat tuzlangan scrypt xeshlari sifatida saqlanadi, hech qachon o‘qiladigan ko‘rinishda emas</li>
          <li>Imzolangan, muddati tugaydigan sessiya tokenlari, chiqishda bekor qilinadi</li>
          <li>Ma’lumotlarga kirishni faqat vakolatli xodimlar bilan cheklovchi nazorat</li>
          <li>Infratuzilmamiz va quyi qayta ishlovchilarning muntazam xavfsizlik tekshiruvlari</li>
          <li>Nozik moliyaviy identifikatorlarni niqoblangan holda saqlash (karta va IBAN uchun faqat oxirgi 4 raqam)</li>
        </ul>
        <p>
          Huquq va erkinliklaringizga xavf tug‘diradigan shaxsiy ma’lumotlar buzilishi yuz berganda,
          GDPR 33–34-moddalari talab qilganidek, biz tegishli nazorat organini 72 soat ichida, ta’sir
          ko‘rgan foydalanuvchilarni esa asossiz kechikishsiz xabardor qilamiz.
        </p>
      </Section>

      <Section id="privacy-9" n="9." title="Bolalar ma’lumotlari">
        <p>
          Platformamiz 16 yoshga to‘lmagan bolalarga mo‘ljallanmagan. Biz bolalarning shaxsiy
          ma’lumotlarini bila turib yig‘maymiz. Agar bola bizga tegishli rozilikisiz shaxsiy
          ma’lumot bergan deb hisoblasangiz, usepaylez@gmail.com manzili orqali biz bilan
          bog‘laning, biz bu ma’lumotni zudlik bilan o‘chiramiz.
        </p>
      </Section>

      <Section id="privacy-10" n="10." title="Ushbu Maxfiylik siyosatiga o‘zgartirishlar">
        <p>
          Biz ushbu Maxfiylik siyosatini vaqti-vaqti bilan yangilashimiz mumkin. Muhim
          o‘zgartirishlar kiritganimizda sizni quyidagi yo‘llar bilan xabardor qilamiz:
        </p>
        <ul>
          <li>Ro‘yxatdan o‘tgan manzilingizga elektron xat</li>
          <li>Ilova ichidagi bildirishnoma</li>
          <li>Veb-saytimizdagi ko‘zga tashlanadigan e’lon</li>
        </ul>
        <p>
          Yangilangan siyosat xabardor qilingandan 30 kun o‘tib kuchga kiradi — bu sizga
          o‘zgartirishlar bilan tanishish va huquqiy asos rozilik bo‘lgan hollarda, agar rozi
          bo‘lmasangiz, uni qaytarib olish uchun vaqt beradi.
        </p>
      </Section>

      <Section id="privacy-11" n="11." title="Aloqa va nazoratchi haqida ma’lumot">
        <Meta
          rows={[
            ['Ma’lumotlar nazoratchisi', 'Paylez Sp. z o.o.'],
            ['Elektron pochta', 'usepaylez@gmail.com'],
            ['Veb-sayt', 'www.pay-lez.com'],
            ['Nazorat organi', 'Urząd Ochrony Danych Osobowych (UODO)'],
            ['UODO sayti', 'www.uodo.gov.pl'],
            ['UODO manzili', 'ul. Stawki 2, 00-193 Varshava, Polsha'],
          ]}
        />
      </Section>
    </>
  );
}

/* ══════════════════════════════════════════════════════ terms of use ══ */

const TERMS_CONTENTS: Array<[string, string]> = [
  ['terms-1', 'Platforma haqida'],
  ['terms-2', 'Foydalanish huquqi va hisobni ro‘yxatdan o‘tkazish'],
  ['terms-3', 'Foydalanuvchi xulq-atvori'],
  ['terms-4', 'Ballar va vaucherlar tizimi'],
  ['terms-5', 'Tavsiya dasturi'],
  ['terms-6', 'Hamkor e’lonlari va kontent'],
  ['terms-7', 'Geymifikatsiya'],
  ['terms-8', 'Xalqaro pul o‘tkazmalari (faol bo‘lmagan imkoniyat)'],
  ['terms-9', 'Intellektual mulk'],
  ['terms-10', 'Kafolatlardan voz kechish va javobgarlikni cheklash'],
  ['terms-11', 'Hisobni to‘xtatib turish va yopish'],
  ['terms-12', 'Ushbu Shartlarga o‘zgartirishlar'],
  ['terms-13', 'Amaldagi qonunchilik va nizolarni hal qilish'],
  ['terms-14', 'Aloqa'],
];

function termsBody() {
  return (
    <>
      <Meta
        rows={[
          ['Operator', 'Paylez Sp. z o.o.'],
          ['Aloqa', 'usepaylez@gmail.com'],
          ['Veb-sayt', 'www.pay-lez.com'],
          ['Amaldagi qonunchilik', 'Polsha qonunchiligi · Yurisdiksiya: Polsha sudlari'],
        ]}
      />

      <p className="legal-lede">
        Iltimos, Paylez platformasidan foydalanishdan oldin ushbu Foydalanish shartlarini diqqat
        bilan o‘qing. Hisob yaratish yoki xizmatlarimizdan foydalanish orqali siz ushbu Shartlarga
        rioya qilishga rozilik bildirasiz. Agar rozi bo‘lmasangiz, platformadan foydalanmang.
      </p>

      <Section id="terms-1" n="1." title="Platforma haqida">
        <p>
          Paylez — Paylez Sp. z o.o. tomonidan boshqariladigan raqamli qo‘llanma va xizmatlarni
          topish platformasi. Biz chet elliklar, xalqaro talabalar va Polshaga yangi kelganlarni
          ovqatlanish, sog‘liqni saqlash, hujjatlarni rasmiylashtirish, ta’lim va maishiy xizmatlar
          kabi turli toifalardagi ishonchli mahalliy xizmat ko‘rsatuvchilar bilan bog‘laymiz.
        </p>
        <p>Platforma quyidagilarni o‘z ichiga oladi:</p>
        <ul>
          <li>Saralangan hamkor bizneslar va xizmat ko‘rsatuvchilar katalogi</li>
          <li>Polshadagi hayot haqida amaliy qo‘llanma materiallari</li>
          <li>Ta’limiy mini-o‘yinlarni o‘z ichiga olgan geymifikatsiya tizimi</li>
          <li>Ballar va vaucherlarga asoslangan sodiqlik dasturi</li>
          <li>Tavsiya dasturi</li>
          <li>
            Kelajakdagi imkoniyatlar, jumladan xalqaro pul o‘tkazmalari (hozirda faol emas —
            8-bo‘limga qarang)
          </li>
        </ul>
      </Section>

      <Section id="terms-2" n="2." title="Foydalanish huquqi va hisobni ro‘yxatdan o‘tkazish">
        <h3>2.1 Foydalanish huquqi</h3>
        <p>Siz platformadan foydalanishingiz mumkin, agar:</p>
        <ul>
          <li>Kamida 16 yoshga to‘lgan bo‘lsangiz</li>
          <li>Majburiy shartnoma tuzishga qonuniy layoqatli bo‘lsangiz</li>
          <li>Ilgari platformadan bloklanmagan yoki chetlatilmagan bo‘lsangiz</li>
        </ul>

        <h3>2.2 Hisob yaratish</h3>
        <p>
          Platformaning barcha imkoniyatlaridan foydalanish uchun hisob ro‘yxatdan o‘tkazishingiz
          kerak. Siz quyidagilarga rozilik bildirasiz:
        </p>
        <ul>
          <li>Aniq, to‘liq va dolzarb ma’lumot berish</li>
          <li>Hisobingiz kirish ma’lumotlari xavfsizligini ta’minlash</li>
          <li>Hisobingizga har qanday ruxsatsiz kirish haqida bizni darhol xabardor qilish</li>
          <li>Hisobingiz ostida sodir bo‘ladigan barcha harakatlar uchun javobgarlikni o‘z zimmangizga olish</li>
        </ul>
        <p>
          Biz o‘z ixtiyorimizga ko‘ra ro‘yxatdan o‘tkazishni rad etish yoki hisoblarni to‘xtatib
          turish huquqini saqlab qolamiz, jumladan taqdim etilgan ma’lumot yolg‘on, chalg‘ituvchi
          yoki ushbu Shartlarni buzadi deb hisoblashga asosimiz bo‘lgan hollarda.
        </p>
      </Section>

      <Section id="terms-3" n="3." title="Foydalanuvchi xulq-atvori">
        <p>Platformadan foydalanish orqali siz quyidagilarni qilmaslikka rozilik bildirasiz:</p>
        <ul>
          <li>Platformadan noqonuniy maqsadlarda yoki amaldagi Polsha yoxud Yevropa Ittifoqi qonunchiligini buzgan holda foydalanish</li>
          <li>Soxta hisoblar yaratish yoki shaxsingiz haqida noto‘g‘ri ma’lumot berish</li>
          <li>Platformaning biror qismiga yoki uning infratuzilmasiga ruxsatsiz kirishga urinish</li>
          <li>Platforma kontentini bizning aniq yozma ruxsatimizsiz yig‘ish, nusxalash yoki ko‘paytirish</li>
          <li>Zararli, haqoratli, tuhmat qiluvchi yoki firibgar kontent joylashtirish yoxud uzatish</li>
          <li>Ballar, vaucherlar yoki tavsiya tizimlarini manipulyatsiya qilish yoxud suiiste’mol qilish</li>
          <li>Platformaning to‘g‘ri ishlashiga xalaqit berish</li>
          <li>Bizning oldindan yozma roziligimizsiz platforma bilan ishlash uchun avtomatlashtirilgan vositalardan foydalanish</li>
        </ul>
      </Section>

      <Section id="terms-4" n="4." title="Ballar va vaucherlar tizimi">
        <h3>4.1 Ballar</h3>
        <p>
          Paylez sodiqlik ballari tizimi foydalanuvchilarga platformadagi faoliyat orqali ball
          to‘plash imkonini beradi, jumladan:
        </p>
        <ul>
          <li>Mini-o‘yinlarni o‘ynash va ketma-ketlikni saqlash</li>
          <li>Hamkor bizneslarga tashrif buyurish va ular bilan aloqada bo‘lish (faqat 2-daraja hamkorlar)</li>
          <li>Profil va tanishtiruv vazifalarini bajarish</li>
          <li>Platformaga yangi foydalanuvchilarni tavsiya qilish</li>
        </ul>
        <Notice>
          <p>
            <strong>MUHIM:</strong> Ballar pul qiymatiga ega emas va naqd pulga almashtirilmaydi.
            Ballar faqat sodiqlik mexanizmi bo‘lib, o‘tkazilishi, sotilishi, sovg‘a qilinishi yoki
            platformadan tashqarida ishlatilishi mumkin emas. Ballar, agar ishlatilmasa, to‘plangan
            sanadan 12 oy o‘tgach bekor bo‘ladi.
          </p>
        </Notice>

        <h3>4.2 Vaucherlar</h3>
        <p>
          Ballar dasturda ishtirok etuvchi hamkor bizneslarda amal qiladigan chegirma vaucherlariga
          almashtirilishi mumkin. Quyidagi shartlar qo‘llaniladi:
        </p>
        <ul>
          <li>Vaucherlar faqat vaucherda ko‘rsatilgan aniq hamkor manzilida amal qiladi</li>
          <li>Vaucherlarning berilish paytida ko‘rsatilgan amal qilish muddati bor — muddati o‘tgan vaucherlardan foydalanib bo‘lmaydi</li>
          <li>Aniq ko‘rsatilmagan bo‘lsa, vaucherlarni boshqa aksiyalar bilan birlashtirib bo‘lmaydi</li>
          <li>Chegirma qiymati hamkor biznes tomonidan moliyalashtiriladi — Paylez chegirmani beruvchi shaxs emas</li>
          <li>Vaucherlarni sotish, o‘tkazish yoki naqd pulga almashtirish mumkin emas</li>
          <li>Firibgarlik yoki suiiste’molga shubha qilingan hollarda vaucherlarni bekor qilish huquqini saqlab qolamiz</li>
        </ul>

        <h3>4.3 Platforma vositachi sifatida</h3>
        <p>
          Paylez foydalanuvchilar va hamkor bizneslar o‘rtasida texnologik vositachi sifatida ish
          yuritadi. Biz foydalanuvchi va hamkor o‘rtasidagi biror bitimning tarafi emasmiz. Vaucherdan
          foydalanish bo‘yicha nizolar, xizmat sifati bo‘yicha shikoyatlar va pulni qaytarish
          talablari tegishli hamkor biznesga yo‘naltirilishi kerak. Biz o‘rinli hollarda nizolarda
          vositachilik qilish uchun oqilona sa’y-harakatlarni amalga oshiramiz, biroq hamkor
          xizmatining sifati yoki bajarilishi uchun javobgarlikni o‘z zimmamizga olmaymiz.
        </p>
      </Section>

      <Section id="terms-5" n="5." title="Tavsiya dasturi">
        <p>
          Foydalanuvchilar shaxsiy tavsiya kodi yordamida platformaga yangi foydalanuvchilarni taklif
          qilishlari mumkin. Tavsiya ballari tavsiya qilingan foydalanuvchi quyidagilarni bajarganda
          beriladi:
        </p>
        <ul>
          <li>Tavsiya kodidan foydalanib tasdiqlangan hisob yaratadi</li>
          <li>Ilovada ko‘rsatilgan minimal tanishtiruv talablarini bajaradi</li>
        </ul>
        <p>
          Biz tavsiya dasturini istalgan vaqtda o‘zgartirish, to‘xtatib turish yoki tugatish huquqini
          saqlab qolamiz. Xato bilan yoki firibgarlik yo‘li bilan berilgan tavsiya ballari bekor
          qilinadi. O‘z-o‘zini tavsiya qilish (ikkinchi hisob orqali o‘zingizni taklif qilish) qat’iyan
          taqiqlanadi va hisobning to‘xtatilishiga olib keladi.
        </p>
      </Section>

      <Section id="terms-6" n="6." title="Hamkor e’lonlari va kontent">
        <h3>6.1 Hamkor ma’lumotlarining aniqligi</h3>
        <p>
          Platformadagi hamkor e’lonlari uchinchi tomon bizneslar tomonidan taqdim etiladi. Biz
          hamkor ma’lumotlarini tekshirish uchun oqilona sa’y-harakat qilsak-da, ularning aniqligi,
          to‘liqligi yoki dolzarbligini, jumladan ish vaqti, narxlar, taklif etilayotgan xizmatlar
          yoki aloqa ma’lumotlarini kafolatlamaymiz. Tashrifdan oldin tafsilotlarni har doim
          bevosita hamkordan aniqlang.
        </p>

        <h3>6.2 Hamkorlar bilan munosabatlar</h3>
        <p>
          Ayrim hamkorlar Paylezdagi obuna darajasiga qarab turli ko‘rinish darajalarida taqdim
          etiladi. Pullik hamkorlikning mavjudligi qo‘llanmadagi tahririy kontentimizga yoki
          foydalanuvchi xavfsizligi standartlarimizga ta’sir qilmaydi. Pullik joylashtirishlar tavsiya
          etilgan yoki homiylik qilingan sifatida aniq belgilanadi.
        </p>

        <h3>6.3 Foydalanuvchilar yuborgan tavsiyalar</h3>
        <p>
          Foydalanuvchilar platformaga biznes tavsiyalarini yuborishlari mumkin. Tavsiya yuborish
          orqali siz bizga yuborilgan kontentdan platformada foydalanish, uni nashr etish va
          ko‘rsatish uchun eksklyuziv bo‘lmagan, royaltisiz litsenziya berasiz. Siz yuborilgan
          ma’lumot bilganingizcha to‘g‘ri ekanini va uchinchi tomon huquqlarini buzmasligini
          tasdiqlaysiz.
        </p>
      </Section>

      <Section id="terms-7" n="7." title="Geymifikatsiya">
        <p>
          Platforma geografiya, tillar va umumiy bilimlar bo‘yicha ta’limiy mini-o‘yinlarni o‘z
          ichiga oladi. O‘yin mexanikasi quyidagilarni qamrab oladi:
        </p>
        <ul>
          <li>Ballar va natijalarni hisoblash tizimlari</li>
          <li>Ketma-ketlikni kuzatish (ketma-ket faol kunlar)</li>
          <li>Jonlar tizimi (sessiyaga cheklangan urinishlar)</li>
          <li>Eng yaxshi natijalarni ko‘rsatuvchi reytinglar</li>
        </ul>
        <p>
          Biz geymifikatsiyaning har qanday elementini istalgan vaqtda o‘zgartirish, qayta tiklash
          yoki to‘xtatish huquqini saqlab qolamiz. Yuqori natijalar va ketma-ketliklar mulkiy huquq
          hisoblanmaydi hamda texnik xato, suiiste’mol yoki platformani qayta ishlab chiqish
          hollarida tuzatilishi mumkin.
        </p>
      </Section>

      <Section id="terms-8" n="8." title="Xalqaro pul o‘tkazmalari (faol bo‘lmagan imkoniyat)">
        <Notice>
          <p>
            Xalqaro pul o‘tkazmalari funksiyasi hozirda ISHLAMAYDI. Ayni paytda platforma orqali
            hech qanday moliyaviy amaliyotni boshlash, qayta ishlash yoki yakunlash mumkin emas.
            Interfeys faqat namoyish va ishlab chiqish maqsadlarida mavjud. Platformadan foydalanish
            orqali siz bu imkoniyatdan haqiqiy moliyaviy amaliyotlarni boshlash uchun foydalanishga
            urinmasligingizni tan olasiz va rozilik bildirasiz. Bu imkoniyatni ishga tushirishdan
            oldin foydalanuvchilarni xabardor qilamiz va ushbu Shartlarni yangilaymiz.
          </p>
        </Notice>
        <p>
          Ishga tushirilgach, pul o‘tkazma xizmatlari qo‘shimcha shartlar, amaldagi moliyaviy
          qoidalar va KYC/AML talablariga bo‘ysunadi. Ishga tushirish foydalanuvchilarni oldindan
          xabardor qilmasdan va Foydalanish shartlarini yangilamasdan amalga oshirilmaydi.
        </p>
      </Section>

      <Section id="terms-9" n="9." title="Intellektual mulk">
        <h3>9.1 Platforma kontenti</h3>
        <p>
          Platformadagi barcha kontent — jumladan qo‘llanma maqolalari, dizayn, logotiplar, dasturiy
          ta’minot va original matnlar — Paylez Sp. z o.o. yoki uning litsenziarlarining intellektual
          mulki hisoblanadi. Siz platforma kontentini bizning aniq yozma ruxsatimizsiz nusxalay,
          ko‘paytira, tarqata yoki uning asosida hosila asarlar yarata olmaysiz.
        </p>

        <h3>9.2 Foydalanuvchi kontenti</h3>
        <p>
          Siz yuborgan kontentga (fikr-mulohaza, tavsiyalar, profil ma’lumotlari) egalik huquqi sizda
          qoladi. Kontent yuborish orqali siz Paylezga ushbu kontentdan faqat platformani yuritish va
          yaxshilash maqsadida foydalanish, uni ko‘rsatish va tarqatish uchun butun dunyo bo‘yicha
          eksklyuziv bo‘lmagan, royaltisiz litsenziya berasiz. Bu litsenziya siz kontentni
          o‘chirganingizda yoki hisobingizni yopganingizda, har qanday qonuniy saqlash talablarini
          hisobga olgan holda tugaydi.
        </p>
      </Section>

      <Section id="terms-10" n="10." title="Kafolatlardan voz kechish va javobgarlikni cheklash">
        <p>
          Platforma «qanday bo‘lsa, shundayligicha» va «mavjudligiga qarab» taqdim etiladi. Amaldagi
          qonun ruxsat bergan maksimal darajada:
        </p>
        <ul>
          <li>Platforma uzluksiz, xatosiz yoki har doim xavfsiz ishlashini kafolatlamaymiz</li>
          <li>Hamkor bizneslar ko‘rsatadigan xizmatlarning sifati, xavfsizligi yoki qonuniyligi uchun javobgar emasmiz</li>
          <li>Platformadan foydalanishingiz natijasida yuzaga keladigan har qanday bilvosita, tasodifiy yoki keyingi zararlar uchun javobgar emasmiz</li>
          <li>Ushbu Shartlardan kelib chiqadigan har qanday da’vo bo‘yicha umumiy javobgarligimiz da’vodan oldingi 3 oy ichida bizga to‘lagan summangizdan oshmaydi</li>
        </ul>
        <p>
          Ushbu Shartlardagi hech narsa o‘lim, e’tiborsizlik oqibatida yetkazilgan shaxsiy jarohat,
          firibgarlik yoki Polsha yoxud Yevropa Ittifoqi qonunchiligiga ko‘ra istisno qilib
          bo‘lmaydigan boshqa har qanday javobgarlik uchun javobgarligimizni cheklamaydi.
        </p>
      </Section>

      <Section id="terms-11" n="11." title="Hisobni to‘xtatib turish va yopish">
        <h3>11.1 Siz tomoningizdan</h3>
        <p>
          Siz istalgan vaqtda usepaylez@gmail.com manziliga murojaat qilib hisobingizni yopishingiz
          mumkin. Yopilgach, profil ma’lumotlaringiz 30 kun ichida o‘chiriladi, qonun bo‘yicha
          saqlashimiz shart bo‘lgan ma’lumotlar bundan mustasno. Ishlatilmagan ballar va
          foydalanilmagan vaucherlar hisob yopilishi bilan bekor bo‘ladi.
        </p>

        <h3>11.2 Biz tomonimizdan</h3>
        <p>
          Quyidagi hollarda hisobingizni darhol va ogohlantirishsiz to‘xtatib turishimiz yoki
          yopishimiz mumkin:
        </p>
        <ul>
          <li>Ushbu Shartlarning biror qoidasini buzsangiz</li>
          <li>Firibgarlik, jumladan ballar yoki tavsiya tizimini manipulyatsiya qilish bilan shug‘ullansangiz</li>
          <li>Shaxsingiz haqida yolg‘on ma’lumot bersangiz</li>
          <li>Cheklovlarni chetlab o‘tish uchun bir nechta hisob yaratsangiz</li>
        </ul>
        <p>
          Shuningdek, biz platformani yoki ayrim imkoniyatlarni texnik xizmat ko‘rsatish, qonunga
          rioya qilish yoki biznes sabablariga ko‘ra, iloji bo‘lsa oqilona muddatda oldindan
          xabardor qilgan holda to‘xtatib turishimiz mumkin.
        </p>
      </Section>

      <Section id="terms-12" n="12." title="Ushbu Shartlarga o‘zgartirishlar">
        <p>
          Biz ushbu Shartlarni vaqti-vaqti bilan yangilashimiz mumkin. Muhim o‘zgarishlar haqida
          sizni quyidagi yo‘llar bilan xabardor qilamiz:
        </p>
        <ul>
          <li>O‘zgarish kuchga kirishidan kamida 14 kun oldin ro‘yxatdan o‘tgan manzilingizga elektron xat</li>
          <li>Ilova ichidagi bildirishnoma</li>
        </ul>
        <p>
          Yangilangan Shartlar kuchga kirgan sanadan keyin platformadan foydalanishda davom etishingiz
          ularni qabul qilganingizni anglatadi. Agar yangilangan Shartlarga rozi bo‘lmasangiz,
          platformadan foydalanishni to‘xtatishingiz kerak va hisobingizni yopishingiz mumkin.
        </p>
      </Section>

      <Section id="terms-13" n="13." title="Amaldagi qonunchilik va nizolarni hal qilish">
        <p>
          Ushbu Shartlar Polsha qonunchiligi bilan tartibga solinadi. Ushbu Shartlardan yoki
          platformadan foydalanishingizdan kelib chiqadigan har qanday nizo avvalo taraflar
          o‘rtasidagi vijdonli muzokaralar predmeti bo‘ladi. Muzokaralar natija bermasa, nizolar
          Polshaning vakolatli sudlarining eksklyuziv yurisdiksiyasiga bo‘ysunadi.
        </p>
        <p>
          Agar siz Yevropa Ittifoqida yashovchi isteʼmolchi bo‘lsangiz, shuningdek Yevropa Ittifoqi
          onlayn nizolarni hal qilish platformasidan foydalanish huquqiga egasiz:{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer noopener">
            https://ec.europa.eu/consumers/odr
          </a>
        </p>
      </Section>

      <Section id="terms-14" n="14." title="Aloqa">
        <Meta
          rows={[
            ['Operator', 'Paylez Sp. z o.o.'],
            ['Elektron pochta', 'usepaylez@gmail.com'],
            ['Veb-sayt', 'www.pay-lez.com'],
          ]}
        />
        <p>Ma’lumotlarni himoya qilish bo‘yicha savollar uchun Maxfiylik siyosatimizga qarang.</p>
      </Section>
    </>
  );
}

const text: LegalText = {
  privacyContents: PRIVACY_CONTENTS,
  termsContents: TERMS_CONTENTS,
  privacy: privacyBody,
  terms: termsBody,
};

export default text;
