/**
 * The parts every language's legal documents are built from, and the shape a
 * translation has to fill.
 *
 * Split out of `legal.tsx` when the documents stopped being English-only. The
 * page shell stayed there; each language's text is its own module beside this
 * one (`en.tsx` is the authoritative one), and `load.ts` fetches only the module
 * the reader's language needs. Two long documents in five languages are a lot to
 * put in front of a visitor who reads one of them, and most visitors never open
 * either.
 */
import type { ReactNode } from 'react';

/** What a language module default-exports. */
export interface LegalText {
  /**
   * The contents lists, id first. The ids are shared by every language — they
   * are the anchors `ANCHOR_ROUTES` files under the two routes, and a reader who
   * switches language mid-document keeps their place — so only the labels are
   * translated.
   */
  privacyContents: Array<[id: string, label: string]>;
  termsContents: Array<[id: string, label: string]>;
  /**
   * The bodies, as plain functions the shell calls during render rather than as
   * components. A module holding two components *and* two arrays is the mix
   * fast refresh refuses (`react/only-export-components`), and neither body uses
   * a hook, so there is nothing a component boundary would buy.
   */
  privacy: () => ReactNode;
  terms: () => ReactNode;
}

/** The key-value block both documents open with. */
export function Meta({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="legal-meta">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A data table.
 *
 * Wrapped in its own scroll container: four columns of retention periods do not
 * fit a phone, and the rule the whole sheet follows is that the page body never
 * scrolls sideways — the table does.
 */
export function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The boxed notices both documents use for the things that are easy to miss. */
export function Notice({ children }: { children: ReactNode }) {
  return <div className="legal-notice">{children}</div>;
}

export function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="legal-section" id={id}>
      <h2>
        <span className="legal-n">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
