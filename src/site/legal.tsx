/**
 * The two legal documents — Privacy Policy and Terms of Use.
 *
 * Both are transcriptions of the PDFs delivered for them (`landing/`), and the
 * English wording is theirs rather than this file's. That is the whole rule
 * here: a privacy policy is a binding statement about what a company does with
 * people's data, and paraphrasing one to fit a layout changes what was promised.
 * Where a clause reads awkwardly on screen it still reads exactly as written.
 *
 * **They are translated, and the English text still binds.** They used to stay
 * in English in every language, on the argument that a translated liability cap
 * is a different document from the one the company signed and the reader has no
 * way to tell which they are holding. The owner chose full translations instead,
 * and the argument survives as the line under the version: `copy.legal.english`
 * says, in the reader's own language, that where a translation and the English
 * differ, the English prevails. The reader *can* tell now, which was the whole
 * objection.
 *
 * This file is the shell. The text is `legal/<code>.tsx`, one module per
 * language, fetched by `legal/load.ts` for the language being read — see
 * `legal/parts.tsx` for why they are split that way.
 *
 * **The head is outside the boundary and the text is inside it**, which is the
 * one structural decision here. A reader who lands on `#/privacy` cold has to
 * wait for a chunk, and the thing worth showing them while they wait is *which
 * document they are on* — the title, the version and the line saying the English
 * prevails are all in the dictionary and need no fetch at all. Putting the
 * `Suspense` around the whole page would have traded that for a blank screen.
 * A language switch holds the previous text rather than blanking it, because
 * `setLanguage` marks the change as a transition.
 *
 * Section ids are prefixed `privacy-` / `terms-` because both pages are long
 * enough to want a table of contents, and `ANCHOR_ROUTES` in `router.ts` needs
 * the prefix or every jump inside the document resolves to the landing page —
 * dropping a reader onto marketing copy from the middle of a clause. The ids are
 * the same in every language, so a reader who switches language keeps the
 * section they were reading.
 */
import { Suspense, use } from 'react';
import { useCopy, useLanguage } from './i18n/context';
import { legalText } from './legal/load';

/** The contents list and the document itself, once this language has arrived. */
function Body({ which }: { which: 'privacy' | 'terms' }) {
  const copy = useCopy();
  const [language] = useLanguage();
  /*
   * Suspends until this language's text is here. `legalText` caches the promise
   * per language, which `use()` requires — a fresh `import()` on every render
   * would suspend for ever, never resolving to the same promise twice.
   */
  const text = use(legalText(language));
  const privacy = which === 'privacy';
  const contents = privacy ? text.privacyContents : text.termsContents;

  return (
    <>
      <nav className="legal-toc" aria-label={copy.legal.contents}>
        <h2>{copy.legal.contents}</h2>
        <ol>
          {contents.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="legal-body">{privacy ? text.privacy() : text.terms()}</div>
    </>
  );
}

/** The shell: title, effective date, the prevailing-language line, contents. */
function Doc({ which }: { which: 'privacy' | 'terms' }) {
  const copy = useCopy();
  const privacy = which === 'privacy';

  return (
    <main className="legal">
      <div className="legal-inner">
        <header className="legal-head">
          <h1>{privacy ? copy.footer.privacy : copy.footer.terms}</h1>
          <p className="legal-version">
            {privacy ? copy.legal.privacyVersion : copy.legal.termsVersion}
          </p>
          <p className="legal-english">{copy.legal.english}</p>
        </header>

        <Suspense fallback={<p className="legal-loading">{copy.legal.loading}</p>}>
          <Body which={which} />
        </Suspense>
      </div>
    </main>
  );
}

export function PrivacyPage() {
  return <Doc which="privacy" />;
}

export function TermsPage() {
  return <Doc which="terms" />;
}
