/**
 * The two legal documents in Polish.
 *
 * A translation of `en.tsx`, which is the authoritative text: where this module
 * and that one differ, that one prevails, and `copy.legal.english` tells the
 * reader so in Polish at the top of the page. Edit a clause in `en.tsx` and this
 * file is out of date until it is edited too.
 *
 * The section ids are `en.tsx`'s own and are never translated — they are the
 * anchors `ANCHOR_ROUTES` files under the two routes, and a reader who switches
 * language mid-document keeps their place only because every language agrees
 * about them. Company name, addresses, the e-mail address and the two web
 * addresses are left exactly as they are for the same reason a name is: they
 * identify something rather than describe it.
 *
 * GDPR is cited the way Polish law cites it — RODO, `art. 6 ust. 1 lit. b` —
 * because the reader who needs the citation is the one who would look it up.
 */
import { Meta, Notice, Section, Table, type LegalText } from './parts';

/* ══════════════════════════════════════════════════════ privacy policy ══ */

const PRIVACY_CONTENTS: Array<[string, string]> = [
  ['privacy-1', 'Kim jesteśmy'],
  ['privacy-2', 'Jakie dane zbieramy i dlaczego'],
  ['privacy-3', 'Szczególne kategorie danych'],
  ['privacy-4', 'Jak udostępniamy Twoje dane'],
  ['privacy-5', 'Międzynarodowe przekazywanie danych'],
  ['privacy-6', 'Twoje prawa na gruncie RODO'],
  ['privacy-7', 'Pliki cookie i pamięć lokalna'],
  ['privacy-8', 'Bezpieczeństwo danych'],
  ['privacy-9', 'Dane dzieci'],
  ['privacy-10', 'Zmiany w niniejszej Polityce prywatności'],
  ['privacy-11', 'Kontakt i dane administratora'],
];

function privacyBody() {
  return (
    <>
      <Meta
        rows={[
          ['Administrator danych', 'Paylez Sp. z o.o.'],
          ['Kontakt', 'usepaylez@gmail.com'],
          [
            'Prawo właściwe',
            'Rozporządzenie (UE) 2016/679 (RODO) · Ustawa o ochronie danych osobowych',
          ],
          ['Organ nadzorczy', 'Urząd Ochrony Danych Osobowych (UODO) · www.uodo.gov.pl'],
        ]}
      />

      <Section id="privacy-1" n="1." title="Kim jesteśmy">
        <p>
          Paylez jest prowadzony przez Paylez Sp. z o.o., spółkę zarejestrowaną w Polsce.
          Udostępniamy przewodnik oraz platformę do wyszukiwania usług dla obcokrajowców, studentów
          zagranicznych i osób nowo przybyłych do Polski, łącząc ich ze sprawdzonymi lokalnymi
          usługodawcami.
        </p>
        <p>
          Występujemy jako administrator wszystkich danych osobowych zbieranych za pośrednictwem
          naszej platformy, aplikacji mobilnej i strony internetowej (www.pay-lez.com).
        </p>
      </Section>

      <Section id="privacy-2" n="2." title="Jakie dane zbieramy i dlaczego">
        <p>
          Zbieramy wyłącznie dane niezbędne do świadczenia i ulepszania naszych usług. Poniżej
          znajduje się pełny opis każdej kategorii przetwarzanych danych, podstawy prawnej ich
          przetwarzania oraz okresu przechowywania.
        </p>

        <h3>2.1 Dane tożsamości i uwierzytelniania</h3>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Adres e-mail', 'Założenie konta, logowanie, komunikacja', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta + 3 lata'],
            ['Imię i nazwisko', 'Identyfikacja konta', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta + 3 lata'],
            ['Nazwa wyświetlana', 'Personalizacja profilu publicznego', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta'],
            ['Rola (użytkownik/administrator)', 'Kontrola dostępu i uprawnień', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', 'Czas trwania konta'],
            ['Status uzupełnienia profilu', 'Proces wdrożenia użytkownika', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', 'Czas trwania konta'],
          ]}
        />

        <h3>2.2 Dane profilowe</h3>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Kraj i miasto zamieszkania', 'Lokalne rekomendacje usług', 'Zgoda (art. 6 ust. 1 lit. a)', 'Do wycofania zgody + 1 rok'],
            ['Opis i informacje o pracy', 'Personalizacja profilu', 'Zgoda (art. 6 ust. 1 lit. a)', 'Do wycofania zgody'],
            ['Znane języki, zainteresowania', 'Dostarczanie spersonalizowanych treści', 'Zgoda (art. 6 ust. 1 lit. a)', 'Do wycofania zgody'],
            ['Numer WhatsApp', 'Opcjonalna funkcja kontaktu', 'Zgoda (art. 6 ust. 1 lit. a)', 'Do wycofania zgody'],
            ['Nazwa użytkownika Telegram', 'Opcjonalna funkcja kontaktu', 'Zgoda (art. 6 ust. 1 lit. a)', 'Do wycofania zgody'],
            ['Ustawienia widoczności profilu', 'Kontrola prywatności', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta'],
          ]}
        />

        <h3>2.3 Dane finansowe (nieaktywne — funkcja przyszła)</h3>
        <Notice>
          <p>
            <strong>WAŻNA INFORMACJA:</strong> Funkcja międzynarodowych przelewów pieniężnych nie
            jest obecnie uruchomiona. Wymienione poniżej pola danych istnieją w architekturze
            naszego systemu, ale NIE są przetwarzane żadne transakcje finansowe, NIE przepływają
            żadne rzeczywiste środki i NIE są na tym etapie aktywnie zbierane żadne dane płatnicze.
            Niniejsza sekcja dokumentuje wyłącznie zamierzenia dotyczące przyszłego przetwarzania
            danych. Przed uruchomieniem tej funkcji zaktualizujemy niniejszą Politykę prywatności i
            uzyskamy odpowiednie zgody.
          </p>
        </Notice>
        <p>Gdy funkcja zostanie uruchomiona, przetwarzane będą następujące dane:</p>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Kwoty transakcji, kursy wymiany, opłaty', 'Realizacja przelewów', 'Umowa (art. 6 ust. 1 lit. b)', '7 lat (obowiązek prawny)'],
            ['Dane metody płatności (zamaskowana karta, 4 ostatnie cyfry IBAN)', 'Obsługa płatności', 'Umowa (art. 6 ust. 1 lit. b)', '7 lat (obowiązek prawny)'],
            ['Imię i nazwisko odbiorcy, telefon, dane bankowe', 'Wykonanie przelewu', 'Umowa (art. 6 ust. 1 lit. b)', '7 lat (obowiązek prawny)'],
            ['Hasz transakcji blockchain', 'Weryfikacja przelewu kryptowalutowego', 'Umowa (art. 6 ust. 1 lit. b)', '7 lat (obowiązek prawny)'],
            ['Identyfikator metody płatności Stripe', 'Bezpieczna tokenizacja płatności', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania relacji'],
            ['Salda portfeli EUR i USDT', 'Zarządzanie portfelem', 'Umowa (art. 6 ust. 1 lit. b)', '7 lat (obowiązek prawny)'],
          ]}
        />

        <h3>2.4 Dane grywalizacyjne i behawioralne</h3>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Odpowiedzi i wyniki w quizach', 'Działanie gier i śledzenie postępów', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta'],
            ['Serie i życia', 'Mechanika grywalizacji', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta'],
            ['Historia wyników (gry: wiedza, flagi, stolice)', 'Rankingi i śledzenie postępów', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', 'Czas trwania konta'],
            ['Postęp poziomu trudności', 'Spersonalizowana rozgrywka', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', 'Czas trwania konta'],
            ['Znaczniki czasu ostatniej gry', 'Obliczanie serii i powiadomienia', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', 'Czas trwania konta'],
          ]}
        />

        <h3>2.5 Nagrody, kupony i polecenia</h3>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Kod polecający i tożsamość polecającego', 'Obsługa programu poleceń', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta + 2 lata'],
            ['Zdobyte i wykorzystane punkty', 'Śledzenie programu lojalnościowego', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta + 2 lata'],
            ['Kody kuponów i wysokość rabatów', 'Wydawanie i weryfikacja kuponów', 'Umowa (art. 6 ust. 1 lit. b)', '2 lata po wygaśnięciu'],
            ['Status wykorzystania kuponu', 'Przeciwdziałanie nadużyciom', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '2 lata po wykorzystaniu'],
            ['Znaczniki czasu skanowania kodu QR', 'Weryfikacja kuponu', 'Umowa (art. 6 ust. 1 lit. b)', '2 lata'],
            ['Informacje o urządzeniu przy skanowaniu QR (user agent)', 'Wykrywanie nadużyć i bezpieczeństwo', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '1 rok'],
            ['Kwoty rachunków przy realizacji kuponu', 'Rozliczenia z partnerami i audyt', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '3 lata'],
          ]}
        />

        <h3>2.6 Dane analityczne i dane o interakcjach</h3>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Kliknięcia w usługi partnerów (Mapy, strona, telefon, Instagram)', 'Analityka platformy i raporty dla partnerów', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '2 lata (agregowane po 90 dniach)'],
            ['Język użytkownika w chwili kliknięcia', 'Ulepszanie lokalizacji językowej', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '2 lata (agregowane po 90 dniach)'],
            ['Kraj i miasto interakcji z usługą', 'Analityka geograficzna', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '2 lata (agregowane po 90 dniach)'],
            ['Znaczniki czasu skanów lojalnościowych i odwiedzona usługa', 'Raportowanie wyników partnera', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '2 lata'],
          ]}
        />

        <h3>2.7 Wsparcie i treści tworzone przez użytkowników</h3>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Komentarze zwrotne i oceny w gwiazdkach', 'Ulepszanie usług', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '3 lata'],
            ['Kategoria zgłoszenia', 'Klasyfikacja wsparcia', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '3 lata'],
            ['Imię i e-mail w zgłoszeniu', 'Odpowiedź wsparcia', 'Umowa (art. 6 ust. 1 lit. b)', '3 lata'],
            ['Rekomendacje firm zgłaszane przez użytkowników', 'Ulepszanie treści platformy', 'Zgoda (art. 6 ust. 1 lit. a)', 'Do wycofania zgody lub 3 lata'],
          ]}
        />

        <h3>2.8 Dane techniczne i dane pozyskiwane automatycznie</h3>
        <Table
          head={['Rodzaj danych', 'Cel', 'Podstawa prawna', 'Okres przechowywania']}
          rows={[
            ['Adres IP (przetwarzany przez nasze serwery i logi serwera WWW)', 'Bezpieczeństwo, przeciwdziałanie nadużyciom, zgodność z prawem', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '90 dni'],
            ['User agent / informacje o urządzeniu (zapisywane przy skanach QR)', 'Bezpieczeństwo i wykrywanie nadużyć', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', '1 rok'],
            ['Tokeny sesji (wydawane i przechowywane przez nas)', 'Uwierzytelnianie i zarządzanie sesją', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania sesji'],
            ['Identyfikator konta Google i zweryfikowany e-mail (tylko przy logowaniu przez Google)', 'Uwierzytelnianie', 'Umowa (art. 6 ust. 1 lit. b)', 'Czas trwania konta'],
            ['localStorage — wybór motywu i języka', 'Personalizacja doświadczenia użytkownika', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', 'Do usunięcia przez użytkownika'],
            ['localStorage — zalogowana sesja i token sesji', 'Utrzymanie zalogowania między wizytami', 'Umowa (art. 6 ust. 1 lit. b)', 'Do wylogowania lub usunięcia'],
            ['localStorage — stan postępu w grze', 'Zapewnienie, że pytania quizowe się nie powtarzają', 'Prawnie uzasadniony interes (art. 6 ust. 1 lit. f)', 'Do usunięcia przez użytkownika'],
          ]}
        />
        <h3>2.9 Pomiar ruchu na stronie</h3>
        <p>
          Mierzymy sposób korzystania ze strony własnym oprogramowaniem, działającym na naszych
          własnych serwerach. Nie korzystamy z Google Analytics ani żadnej innej zewnętrznej usługi
          analitycznej, nie ustawiamy żadnego pliku cookie analitycznego ani żadnego identyfikatora
          odwiedzającego. Wizyta jest liczona przy użyciu wartości pochodzącej z połączenia, która
          zmienia się każdego dnia i nigdy nie jest przechowywana jako identyfikator — co oznacza,
          że powracający anonimowi odwiedzający są dla nas celowo niemierzalni.
        </p>
      </Section>

      <Section id="privacy-3" n="3." title="Szczególne kategorie danych">
        <p>
          Nie zbieramy celowo szczególnych kategorii danych osobowych w rozumieniu art. 9 RODO (w
          tym danych o zdrowiu, pochodzeniu rasowym lub etnicznym, poglądach politycznych,
          przekonaniach religijnych ani danych biometrycznych).
        </p>
        <p>
          Zaznaczamy, że dane o narodowości (kraj zamieszkania) zbierane w profilu mogą w pewnych
          kontekstach być uznane za wrażliwe etnicznie. Przetwarzamy te dane wyłącznie w celu
          dostarczania lokalnych rekomendacji usług i nie wykorzystujemy ich do jakiegokolwiek
          dyskryminującego profilowania. Możesz w każdej chwili usunąć te dane ze swojego profilu.
        </p>
      </Section>

      <Section id="privacy-4" n="4." title="Jak udostępniamy Twoje dane">
        <p>
          Nie sprzedajemy Twoich danych osobowych. Udostępniamy dane wyłącznie w następujących
          okolicznościach:
        </p>

        <h3>4.1 Partnerzy usługowi (firmy z katalogu)</h3>
        <p>
          Gdy wchodzisz w interakcję z wizytówką partnera (kliknięcie, wizyta, realizacja kuponu),
          udostępniamy temu partnerowi zagregowaną i zanonimizowaną analitykę. Dane na poziomie
          indywidualnym udostępniamy partnerom wyłącznie wtedy, gdy:
        </p>
        <ul>
          <li>Wyraźnie wysyłasz zapytanie lub formularz kontaktowy skierowany do tego partnera</li>
          <li>Realizacja kuponu wymaga weryfikacji Twojego konta</li>
          <li>Wyraziłeś zgodę na przekazanie konkretnemu partnerowi swoich danych kontaktowych</li>
        </ul>

        <h3>4.2 Podmioty przetwarzające (technologia)</h3>
        <Table
          head={['Podmiot przetwarzający', 'Cel', 'Lokalizacja', 'Zabezpieczenie']}
          rows={[
            ['IONOS SE', 'Hosting serwerów, infrastruktura bazy danych i dostarczanie aplikacji', 'Frankfurt, Niemcy (EOG)', 'Umowa powierzenia przetwarzania'],
            ['Google Ireland Limited', 'Logowanie przez Google — wyłącznie weryfikacja tożsamości, dla użytkowników, którzy je wybiorą', 'Irlandia (EOG)', 'Umowa powierzenia przetwarzania'],
            ['Stripe (w przyszłości)', 'Obsługa płatności (nieaktywne)', 'USA', 'Standardowe klauzule umowne (SCC)'],
          ]}
        />
        <p>
          Sami hostujemy naszą aplikację i bazę danych. Uwierzytelnianie, zarządzanie sesjami i
          wszystkie dane użytkowników są obsługiwane na infrastrukturze, którą prowadzimy, i żaden
          podmiot trzeci nie przechowuje ani nie przetwarza danych kont w naszym imieniu poza
          wymienionymi powyżej.
        </p>

        <h3>4.3 Wymogi prawne</h3>
        <p>
          Możemy ujawnić dane osobowe organom ścigania lub organom nadzorczym (w tym UODO), gdy
          wymaga tego obowiązujące prawo, orzeczenie sądu, lub w celu ochrony praw platformy bądź
          jej użytkowników.
        </p>
      </Section>

      <Section id="privacy-5" n="5." title="Międzynarodowe przekazywanie danych">
        <p>
          Całe nasze obecne przetwarzanie danych odbywa się na terenie Europejskiego Obszaru
          Gospodarczego (EOG). Nasze serwery i baza danych są hostowane we Frankfurcie w Niemczech,
          a jedynym innym aktywnym podmiotem przetwarzającym jest Google Ireland Limited. Obecnie
          żadne dane osobowe nie są przekazywane poza EOG.
        </p>
        <p>
          Gdyby w przyszłości dane miały być przekazywane poza EOG (na przykład w razie uruchomienia
          obsługi płatności opisanej w sekcji 2.3), zapewnimy odpowiednie zabezpieczenia, w tym:
        </p>
        <ul>
          <li>Standardowe klauzule umowne (SCC) zatwierdzone przez Komisję Europejską</li>
          <li>Decyzje o odpowiednim stopniu ochrony, tam gdzie mają zastosowanie</li>
          <li>Umowy powierzenia przetwarzania ze wszystkimi podmiotami przetwarzającymi</li>
        </ul>
        <p>
          <strong>Użytkownicy przebywający w Uzbekistanie:</strong> Działamy w oparciu o prawo
          polskie i unijne jako nasze ramy prawne. Jeżeli w Twojej sytuacji zastosowanie ma prawo
          uzbeckie, zachęcamy do zasięgnięcia niezależnej porady prawnej.
        </p>
      </Section>

      <Section id="privacy-6" n="6." title="Twoje prawa na gruncie RODO">
        <p>
          Jako osobie, której dane dotyczą, przysługują Ci na gruncie RODO następujące prawa. Aby
          skorzystać z któregokolwiek z nich, skontaktuj się z nami pod adresem usepaylez@gmail.com.
          Odpowiemy w ciągu 30 dni.
        </p>
        <Table
          head={['Prawo', 'Co oznacza', 'Jak z niego skorzystać']}
          rows={[
            ['Prawo dostępu (art. 15)', 'Żądanie kopii wszystkich danych, które o Tobie przechowujemy', 'E-mail na usepaylez@gmail.com z tematem: „Żądanie dostępu do danych”'],
            ['Prawo do sprostowania (art. 16)', 'Poprawienie nieprawidłowych lub niekompletnych danych', 'Zmiana w ustawieniach aplikacji lub e-mail do nas'],
            ['Prawo do usunięcia (art. 17)', 'Żądanie usunięcia Twoich danych („prawo do bycia zapomnianym”)', 'E-mail na usepaylez@gmail.com z tematem: „Żądanie usunięcia danych”'],
            ['Prawo do ograniczenia przetwarzania (art. 18)', 'Ograniczenie sposobu, w jaki wykorzystujemy Twoje dane w określonych sytuacjach', 'E-mail na usepaylez@gmail.com'],
            ['Prawo do przenoszenia danych (art. 20)', 'Otrzymanie swoich danych w formacie nadającym się do odczytu maszynowego', 'E-mail na usepaylez@gmail.com z tematem: „Żądanie przeniesienia danych”'],
            ['Prawo do sprzeciwu (art. 21)', 'Sprzeciw wobec przetwarzania opartego na prawnie uzasadnionym interesie', 'E-mail na usepaylez@gmail.com'],
            ['Prawo do wycofania zgody', 'Wycofanie zgody w dowolnym momencie w przypadku przetwarzania opartego na zgodzie', 'Ustawienia aplikacji lub e-mail do nas'],
            ['Prawo do wniesienia skargi', 'Skarga do polskiego organu nadzorczego', 'www.uodo.gov.pl'],
          ]}
        />
      </Section>

      <Section id="privacy-7" n="7." title="Pliki cookie i pamięć lokalna">
        <p>
          <strong>Nie używamy plików cookie.</strong> Na Twoim urządzeniu przechowujemy przy użyciu
          localStorage następujące dane:
        </p>
        <ul>
          <li>Wybór motywu (jasny/ciemny) — nigdy nie wysyłany na nasze serwery</li>
          <li>Wybór języka — aby zachować ustawienie języka między sesjami</li>
          <li>Twoją zalogowaną sesję i token sesji — abyś pozostał zalogowany między wizytami</li>
          <li>Stan postępu w grze — aby pytania quizowe się nie powtarzały</li>
          <li>Informację, czy animacja otwierająca stronę już się odtworzyła</li>
        </ul>
        <p>
          Żadna z tych wartości nie jest identyfikatorem reklamowym ani śledzącym, żadna nie jest
          udostępniana podmiotom trzecim, a dwie pierwsze i ostatnia nigdy nie są w ogóle wysyłane
          na nasze serwery. Wartości sesji są usuwane po wylogowaniu. Możesz w każdej chwili
          wyczyścić localStorage w ustawieniach przeglądarki lub urządzenia.
        </p>
        <p>
          Jeżeli w przyszłości wprowadzimy pliki cookie albo jakąkolwiek zewnętrzną technologię
          analityczną lub reklamową, zaktualizujemy niniejszą politykę i wdrożymy mechanizm zgody na
          pliki cookie przed ich zastosowaniem.
        </p>
      </Section>

      <Section id="privacy-8" n="8." title="Bezpieczeństwo danych">
        <p>
          Stosujemy odpowiednie środki techniczne i organizacyjne w celu ochrony Twoich danych
          osobowych przed nieuprawnionym dostępem, zmianą, ujawnieniem lub zniszczeniem. Środki te
          obejmują:
        </p>
        <ul>
          <li>Szyfrowaną transmisję danych (HTTPS/TLS) na wszystkich połączeniach</li>
          <li>Hasła przechowywane wyłącznie jako solone skróty scrypt, nigdy w czytelnej postaci</li>
          <li>Podpisane, wygasające tokeny sesji, unieważniane przy wylogowaniu</li>
          <li>Kontrolę dostępu ograniczającą dostęp do danych wyłącznie do upoważnionych osób</li>
          <li>Regularne przeglądy bezpieczeństwa naszej infrastruktury i podmiotów przetwarzających</li>
          <li>Zamaskowane przechowywanie wrażliwych identyfikatorów finansowych (tylko 4 ostatnie cyfry karty i IBAN)</li>
        </ul>
        <p>
          W przypadku naruszenia ochrony danych osobowych, które powoduje ryzyko naruszenia Twoich
          praw i wolności, powiadomimy właściwy organ nadzorczy w ciągu 72 godzin, a użytkowników,
          których to dotyczy — bez zbędnej zwłoki, zgodnie z art. 33–34 RODO.
        </p>
      </Section>

      <Section id="privacy-9" n="9." title="Dane dzieci">
        <p>
          Nasza platforma nie jest skierowana do dzieci poniżej 16. roku życia. Nie zbieramy
          świadomie danych osobowych dzieci. Jeżeli sądzisz, że dziecko przekazało nam dane osobowe
          bez odpowiedniej zgody, skontaktuj się z nami pod adresem usepaylez@gmail.com, a
          niezwłocznie usuniemy te dane.
        </p>
      </Section>

      <Section id="privacy-10" n="10." title="Zmiany w niniejszej Polityce prywatności">
        <p>
          Możemy okresowo aktualizować niniejszą Politykę prywatności. Gdy wprowadzimy istotne
          zmiany, powiadomimy Cię poprzez:
        </p>
        <ul>
          <li>Wiadomość e-mail na zarejestrowany adres</li>
          <li>Powiadomienie w aplikacji</li>
          <li>Wyraźną informację na naszej stronie internetowej</li>
        </ul>
        <p>
          Zaktualizowana polityka wchodzi w życie 30 dni po powiadomieniu, co daje Ci czas na
          zapoznanie się ze zmianami oraz — tam gdzie podstawą prawną jest zgoda — na jej wycofanie,
          jeżeli się z nimi nie zgadzasz.
        </p>
      </Section>

      <Section id="privacy-11" n="11." title="Kontakt i dane administratora">
        <Meta
          rows={[
            ['Administrator danych', 'Paylez Sp. z o.o.'],
            ['E-mail', 'usepaylez@gmail.com'],
            ['Strona internetowa', 'www.pay-lez.com'],
            ['Organ nadzorczy', 'Urząd Ochrony Danych Osobowych (UODO)'],
            ['Strona UODO', 'www.uodo.gov.pl'],
            ['Adres UODO', 'ul. Stawki 2, 00-193 Warszawa, Polska'],
          ]}
        />
      </Section>
    </>
  );
}

/* ══════════════════════════════════════════════════════ terms of use ══ */

const TERMS_CONTENTS: Array<[string, string]> = [
  ['terms-1', 'O platformie'],
  ['terms-2', 'Uprawnienie do korzystania i rejestracja konta'],
  ['terms-3', 'Zasady postępowania użytkownika'],
  ['terms-4', 'System punktów i kuponów'],
  ['terms-5', 'Program poleceń'],
  ['terms-6', 'Wizytówki partnerów i treści'],
  ['terms-7', 'Grywalizacja'],
  ['terms-8', 'Międzynarodowe przelewy pieniężne (funkcja nieaktywna)'],
  ['terms-9', 'Własność intelektualna'],
  ['terms-10', 'Wyłączenia i ograniczenie odpowiedzialności'],
  ['terms-11', 'Zawieszenie i zamknięcie konta'],
  ['terms-12', 'Zmiany niniejszego Regulaminu'],
  ['terms-13', 'Prawo właściwe i rozstrzyganie sporów'],
  ['terms-14', 'Kontakt'],
];

function termsBody() {
  return (
    <>
      <Meta
        rows={[
          ['Operator', 'Paylez Sp. z o.o.'],
          ['Kontakt', 'usepaylez@gmail.com'],
          ['Strona internetowa', 'www.pay-lez.com'],
          ['Prawo właściwe', 'Prawo polskie · Jurysdykcja: sądy polskie'],
        ]}
      />

      <p className="legal-lede">
        Prosimy o uważne zapoznanie się z niniejszym Regulaminem przed rozpoczęciem korzystania z
        platformy Paylez. Zakładając konto lub korzystając z naszych usług, zgadzasz się być
        związanym niniejszym Regulaminem. Jeżeli się z nim nie zgadzasz, nie korzystaj z platformy.
      </p>

      <Section id="terms-1" n="1." title="O platformie">
        <p>
          Paylez to cyfrowy przewodnik i platforma do wyszukiwania usług prowadzona przez Paylez Sp.
          z o.o.. Łączymy obcokrajowców, studentów zagranicznych i osoby nowo przybyłe do Polski ze
          sprawdzonymi lokalnymi usługodawcami w wielu kategoriach, w tym gastronomii, opiece
          zdrowotnej, legalizacji pobytu, edukacji i usługach stylu życia.
        </p>
        <p>Platforma obejmuje:</p>
        <ul>
          <li>Wyselekcjonowany katalog firm partnerskich i usługodawców</li>
          <li>Praktyczne treści przewodnika dotyczące życia w Polsce</li>
          <li>System grywalizacji obejmujący edukacyjne mini-gry</li>
          <li>Program lojalnościowy oparty na punktach i kuponach</li>
          <li>Program poleceń</li>
          <li>
            Funkcje przyszłe, w tym międzynarodowe przelewy pieniężne (obecnie nieaktywne — zob.
            sekcja 8)
          </li>
        </ul>
      </Section>

      <Section id="terms-2" n="2." title="Uprawnienie do korzystania i rejestracja konta">
        <h3>2.1 Uprawnienie do korzystania</h3>
        <p>Możesz korzystać z platformy, jeżeli:</p>
        <ul>
          <li>Masz ukończone co najmniej 16 lat</li>
          <li>Posiadasz zdolność prawną do zawarcia wiążącej umowy</li>
          <li>Nie zostałeś wcześniej zablokowany ani zawieszony na platformie</li>
        </ul>

        <h3>2.2 Założenie konta</h3>
        <p>
          Aby uzyskać dostęp do pełnej funkcjonalności platformy, musisz zarejestrować konto.
          Zobowiązujesz się do:
        </p>
        <ul>
          <li>Podawania dokładnych, kompletnych i aktualnych informacji</li>
          <li>Dbania o bezpieczeństwo danych logowania do swojego konta</li>
          <li>Niezwłocznego informowania nas o każdym nieuprawnionym dostępie do konta</li>
          <li>Przyjęcia odpowiedzialności za wszelką aktywność na Twoim koncie</li>
        </ul>
        <p>
          Zastrzegamy sobie prawo do odmowy rejestracji lub zawieszenia kont według własnego
          uznania, w tym gdy mamy podstawy sądzić, że podane informacje są fałszywe, wprowadzające w
          błąd lub naruszają niniejszy Regulamin.
        </p>
      </Section>

      <Section id="terms-3" n="3." title="Zasady postępowania użytkownika">
        <p>Korzystając z platformy, zobowiązujesz się nie:</p>
        <ul>
          <li>Wykorzystywać platformy do celów niezgodnych z prawem ani z naruszeniem obowiązującego prawa polskiego lub unijnego</li>
          <li>Zakładać fałszywych kont ani podawać się za inną osobę</li>
          <li>Podejmować prób uzyskania nieuprawnionego dostępu do jakiejkolwiek części platformy lub jej infrastruktury</li>
          <li>Pobierać, kopiować ani powielać treści platformy bez naszej wyraźnej pisemnej zgody</li>
          <li>Publikować ani przesyłać treści szkodliwych, obraźliwych, zniesławiających lub oszukańczych</li>
          <li>Manipulować systemem punktów, kuponów lub poleceń ani go nadużywać</li>
          <li>Zakłócać prawidłowego działania platformy</li>
          <li>Korzystać z narzędzi automatycznych do interakcji z platformą bez naszej uprzedniej pisemnej zgody</li>
        </ul>
      </Section>

      <Section id="terms-4" n="4." title="System punktów i kuponów">
        <h3>4.1 Punkty</h3>
        <p>
          System punktów lojalnościowych Paylez pozwala użytkownikom zdobywać punkty poprzez
          aktywność na platformie, w tym:
        </p>
        <ul>
          <li>Granie w mini-gry i utrzymywanie serii</li>
          <li>Odwiedzanie firm partnerskich i interakcję z nimi (wyłącznie partnerzy poziomu 2)</li>
          <li>Uzupełnianie profilu i zadań wdrożeniowych</li>
          <li>Polecanie platformy nowym użytkownikom</li>
        </ul>
        <Notice>
          <p>
            <strong>WAŻNE:</strong> Punkty nie mają wartości pieniężnej i nie mogą być wymieniane na
            gotówkę. Punkty są wyłącznie mechanizmem lojalnościowym i nie mogą być przenoszone,
            sprzedawane, darowane ani wykorzystywane poza platformą. Punkty wygasają po 12
            miesiącach od daty ich zdobycia, o ile nie zostaną wykorzystane.
          </p>
        </Notice>

        <h3>4.2 Kupony</h3>
        <p>
          Punkty mogą zostać wymienione na kupony rabatowe ważne w uczestniczących firmach
          partnerskich. Obowiązują następujące warunki:
        </p>
        <ul>
          <li>Kupony są ważne wyłącznie w konkretnej lokalizacji partnera wskazanej na kuponie</li>
          <li>Kupony mają datę ważności podaną w chwili wydania — kuponów, które wygasły, nie można zrealizować</li>
          <li>Kuponów nie można łączyć z innymi ofertami promocyjnymi, chyba że wyraźnie wskazano inaczej</li>
          <li>Wartość rabatu jest finansowana przez firmę partnerską — Paylez nie jest podmiotem udzielającym rabatu</li>
          <li>Kuponów nie można sprzedawać, przenosić ani wymieniać na gotówkę</li>
          <li>Zastrzegamy sobie prawo do anulowania kuponów w przypadku podejrzenia oszustwa lub nadużycia</li>
        </ul>

        <h3>4.3 Platforma jako pośrednik</h3>
        <p>
          Paylez działa jako pośrednik technologiczny między użytkownikami a firmami partnerskimi.
          Nie jesteśmy stroną jakiejkolwiek transakcji między użytkownikiem a partnerem. Spory
          dotyczące realizacji kuponów, reklamacje jakości usług i żądania zwrotu środków należy
          kierować do właściwej firmy partnerskiej. Dołożymy uzasadnionych starań, aby w stosownych
          przypadkach mediować w sporach, ale nie ponosimy odpowiedzialności za jakość ani wykonanie
          usług partnera.
        </p>
      </Section>

      <Section id="terms-5" n="5." title="Program poleceń">
        <p>
          Użytkownicy mogą polecać platformę nowym użytkownikom przy użyciu osobistego kodu
          polecającego. Punkty za polecenie są przyznawane, gdy polecony użytkownik:
        </p>
        <ul>
          <li>Zakłada zweryfikowane konto przy użyciu kodu polecającego</li>
          <li>Spełnia minimalne wymagania wdrożeniowe określone w aplikacji</li>
        </ul>
        <p>
          Zastrzegamy sobie prawo do zmiany, zawieszenia lub zakończenia programu poleceń w dowolnym
          momencie. Punkty za polecenie przyznane omyłkowo lub w wyniku działań oszukańczych zostaną
          cofnięte. Samopolecenia (polecenie siebie przez drugie konto) są surowo zabronione i
          skutkują zawieszeniem konta.
        </p>
      </Section>

      <Section id="terms-6" n="6." title="Wizytówki partnerów i treści">
        <h3>6.1 Rzetelność informacji partnera</h3>
        <p>
          Wizytówki partnerów na platformie są dostarczane przez firmy zewnętrzne. Choć dokładamy
          uzasadnionych starań, aby weryfikować informacje o partnerach, nie gwarantujemy ich
          dokładności, kompletności ani aktualności, w tym godzin otwarcia, cen, oferowanych usług
          czy danych kontaktowych. Zawsze potwierdzaj szczegóły bezpośrednio u partnera przed
          wizytą.
        </p>

        <h3>6.2 Relacje z partnerami</h3>
        <p>
          Niektórzy partnerzy są prezentowani na różnych poziomach widoczności w zależności od
          poziomu ich subskrypcji w Paylez. Istnienie płatnego partnerstwa nie wpływa na nasze
          redakcyjne treści przewodnika ani na nasze standardy bezpieczeństwa użytkowników. Płatne
          umiejscowienia są wyraźnie oznaczone jako wyróżnione lub sponsorowane.
        </p>

        <h3>6.3 Rekomendacje zgłaszane przez użytkowników</h3>
        <p>
          Użytkownicy mogą zgłaszać na platformę rekomendacje firm. Zgłaszając rekomendację,
          udzielasz nam niewyłącznej, nieodpłatnej licencji na wykorzystanie, publikowanie i
          wyświetlanie zgłoszonych treści na platformie. Potwierdzasz, że zgłoszenie jest zgodne z
          Twoją najlepszą wiedzą i nie narusza praw osób trzecich.
        </p>
      </Section>

      <Section id="terms-7" n="7." title="Grywalizacja">
        <p>
          Platforma obejmuje edukacyjne mini-gry z zakresu geografii, języków i wiedzy ogólnej.
          Mechanika gier obejmuje:
        </p>
        <ul>
          <li>Systemy punktów i wyników</li>
          <li>Śledzenie serii (kolejnych dni aktywności)</li>
          <li>System żyć (ograniczona liczba prób na sesję)</li>
          <li>Rankingi prezentujące najlepsze wyniki</li>
        </ul>
        <p>
          Zastrzegamy sobie prawo do zmiany, zresetowania lub wycofania dowolnego elementu
          grywalizacji w dowolnym momencie. Najlepsze wyniki i serie nie stanowią praw majątkowych i
          mogą zostać skorygowane w przypadku błędu technicznego, nadużycia lub przebudowy
          platformy.
        </p>
      </Section>

      <Section id="terms-8" n="8." title="Międzynarodowe przelewy pieniężne (funkcja nieaktywna)">
        <Notice>
          <p>
            Funkcja międzynarodowych przelewów pieniężnych NIE jest obecnie uruchomiona. W tej
            chwili za pośrednictwem platformy nie można zainicjować, przetworzyć ani zrealizować
            żadnych transakcji finansowych. Interfejs istnieje wyłącznie w celach demonstracyjnych i
            rozwojowych. Korzystając z platformy, przyjmujesz do wiadomości i zgadzasz się, że nie
            będziesz próbować wykorzystywać tej funkcji do inicjowania rzeczywistych transakcji
            finansowych. Przed uruchomieniem tej funkcji powiadomimy użytkowników i zaktualizujemy
            niniejszy Regulamin.
          </p>
        </Notice>
        <p>
          Po uruchomieniu usługi przelewów pieniężnych będą podlegać dodatkowym warunkom,
          obowiązującym przepisom finansowym oraz wymogom zgodności KYC/AML. Uruchomienie nie
          nastąpi bez uprzedniego powiadomienia użytkowników i zaktualizowanego Regulaminu.
        </p>
      </Section>

      <Section id="terms-9" n="9." title="Własność intelektualna">
        <h3>9.1 Treści platformy</h3>
        <p>
          Wszystkie treści na platformie — w tym artykuły przewodnika, projekt graficzny, logotypy,
          oprogramowanie i teksty oryginalne — stanowią własność intelektualną Paylez Sp. z o.o. lub
          jej licencjodawców. Nie możesz kopiować, powielać, rozpowszechniać ani tworzyć utworów
          zależnych na podstawie treści platformy bez naszej wyraźnej pisemnej zgody.
        </p>

        <h3>9.2 Treści użytkownika</h3>
        <p>
          Zachowujesz własność treści, które zgłaszasz (opinie, rekomendacje, informacje
          profilowe). Zgłaszając treści, udzielasz Paylez ogólnoświatowej, niewyłącznej,
          nieodpłatnej licencji na wykorzystanie, wyświetlanie i rozpowszechnianie tych treści
          wyłącznie w celu prowadzenia i ulepszania platformy. Licencja ta wygasa z chwilą usunięcia
          przez Ciebie treści lub zamknięcia konta, z zastrzeżeniem wszelkich prawnych wymogów
          przechowywania.
        </p>
      </Section>

      <Section id="terms-10" n="10." title="Wyłączenia i ograniczenie odpowiedzialności">
        <p>
          Platforma jest udostępniana „w stanie, w jakim jest” i „w miarę dostępności”. W
          najszerszym zakresie dozwolonym przez obowiązujące prawo:
        </p>
        <ul>
          <li>Nie gwarantujemy, że platforma będzie działać nieprzerwanie, bezbłędnie ani zawsze bezpiecznie</li>
          <li>Nie ponosimy odpowiedzialności za jakość, bezpieczeństwo ani legalność usług świadczonych przez firmy partnerskie</li>
          <li>Nie ponosimy odpowiedzialności za jakiekolwiek szkody pośrednie, uboczne lub następcze wynikające z korzystania przez Ciebie z platformy</li>
          <li>Nasza łączna odpowiedzialność z tytułu jakiegokolwiek roszczenia wynikającego z niniejszego Regulaminu nie przekroczy kwoty zapłaconej nam przez Ciebie w ciągu 3 miesięcy poprzedzających roszczenie</li>
        </ul>
        <p>
          Żadne postanowienie niniejszego Regulaminu nie ogranicza naszej odpowiedzialności za
          śmierć, szkodę na osobie spowodowaną niedbalstwem, oszustwo ani jakiejkolwiek innej
          odpowiedzialności, której nie można wyłączyć na gruncie prawa polskiego lub unijnego.
        </p>
      </Section>

      <Section id="terms-11" n="11." title="Zawieszenie i zamknięcie konta">
        <h3>11.1 Przez Ciebie</h3>
        <p>
          Możesz zamknąć swoje konto w dowolnym momencie, kontaktując się z nami pod adresem
          usepaylez@gmail.com. Po zamknięciu dane Twojego profilu zostaną usunięte w ciągu 30 dni, z
          zastrzeżeniem danych, które jesteśmy zobowiązani przechowywać na mocy prawa.
          Niewykorzystane punkty i niezrealizowane kupony przepadają z chwilą zamknięcia konta.
        </p>

        <h3>11.2 Przez nas</h3>
        <p>
          Możemy zawiesić lub zamknąć Twoje konto natychmiast i bez uprzedzenia, jeżeli:
        </p>
        <ul>
          <li>Naruszysz którekolwiek postanowienie niniejszego Regulaminu</li>
          <li>Podejmiesz działania oszukańcze, w tym manipulację systemem punktów lub poleceń</li>
          <li>Podasz fałszywe dane tożsamości</li>
          <li>Założysz wiele kont w celu obejścia ograniczeń</li>
        </ul>
        <p>
          Możemy również zawiesić platformę lub określone funkcje w celach konserwacyjnych, zgodności
          z prawem lub z przyczyn biznesowych, w miarę możliwości z rozsądnym wyprzedzeniem.
        </p>
      </Section>

      <Section id="terms-12" n="12." title="Zmiany niniejszego Regulaminu">
        <p>
          Możemy okresowo aktualizować niniejszy Regulamin. O istotnych zmianach powiadomimy Cię
          poprzez:
        </p>
        <ul>
          <li>Wiadomość e-mail na zarejestrowany adres, co najmniej 14 dni przed wejściem zmiany w życie</li>
          <li>Powiadomienie w aplikacji</li>
        </ul>
        <p>
          Dalsze korzystanie przez Ciebie z platformy po dacie wejścia w życie zaktualizowanego
          Regulaminu oznacza jego akceptację. Jeżeli nie zgadzasz się na zaktualizowany Regulamin,
          musisz zaprzestać korzystania z platformy i możesz zamknąć swoje konto.
        </p>
      </Section>

      <Section id="terms-13" n="13." title="Prawo właściwe i rozstrzyganie sporów">
        <p>
          Niniejszy Regulamin podlega prawu polskiemu. Wszelkie spory wynikające z niniejszego
          Regulaminu lub z korzystania przez Ciebie z platformy będą w pierwszej kolejności
          przedmiotem negocjacji prowadzonych przez strony w dobrej wierze. Jeżeli negocjacje nie
          przyniosą rezultatu, spory podlegają wyłącznej jurysdykcji właściwych sądów w Polsce.
        </p>
        <p>
          Jeżeli jesteś konsumentem zamieszkałym w UE, masz również prawo skorzystać z
          unijnej platformy internetowego rozstrzygania sporów pod adresem:{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer noopener">
            https://ec.europa.eu/consumers/odr
          </a>
        </p>
      </Section>

      <Section id="terms-14" n="14." title="Kontakt">
        <Meta
          rows={[
            ['Operator', 'Paylez Sp. z o.o.'],
            ['E-mail', 'usepaylez@gmail.com'],
            ['Strona internetowa', 'www.pay-lez.com'],
          ]}
        />
        <p>W sprawach dotyczących ochrony danych zapoznaj się z naszą Polityką prywatności.</p>
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
