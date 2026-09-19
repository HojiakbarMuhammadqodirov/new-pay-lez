/**
 * `src/site/legal/<lang>.tsx` → `src/site/legal/export/<lang>.json`.
 *
 * The Privacy Policy and the Terms of Use are the only two documents on this
 * site that the Flutter app has to reproduce word for word, and they are the
 * two written as JSX. The phone cannot run React, so the text has to leave the
 * components — but it has to leave them *as the site renders them*, because a
 * privacy policy is a binding statement and a second transcription of one is a
 * second document that starts drifting the day either is edited.
 *
 * Run with `npm run legal`. Like `banks` and `pg:schema` it is **not** part of
 * `dev` or `build`: the output is committed, it only changes when a legal
 * module does, and a build that silently regenerated a legal text would make
 * "what did the app show on that date" unanswerable. Edit a clause in
 * `legal/<lang>.tsx`, re-run this, commit what it writes.
 *
 * ## Why render rather than read the source
 *
 * The obvious cheap version is a regex over the `.tsx` files. It cannot work:
 * the text is JSX, so a reader of the source has to understand `{' '}`, entity
 * escapes, `<strong>` spanning a line break, prop objects passed to `<Table>`,
 * and JSX's own whitespace collapsing — which is to say it has to be a JSX
 * compiler. React already is one. Rendering each body with
 * `renderToStaticMarkup` and parsing the result means the export is derived
 * from exactly the markup a visitor's browser gets, and any future change to
 * `parts.tsx` is picked up for free.
 *
 * ## Why the HTML parser here is hand-written
 *
 * This is not arbitrary web HTML. It is the output of eight components in
 * `legal/parts.tsx` plus five plain tags, it is well-formed by construction,
 * and the survey below is the complete list of elements it can contain. Pulling
 * in a DOM implementation to walk 30kB of known markup would add a dependency
 * to a repo that has none for this, and would not make the walk any more
 * correct. What the walk does instead is **throw on anything it does not
 * recognise**: an element added to `parts.tsx` that nobody taught this script
 * about fails the generator rather than vanishing quietly out of the app's copy
 * of a legal document.
 *
 * ## The block format
 *
 * Flutter gets a flat list of typed blocks rather than a tree, because a flat
 * list is what a `ListView.builder` wants and the documents' nesting is only
 * ever one level deep. Six kinds cover both documents entirely:
 *
 *     { kind: 'section',   id, n, title }
 *     { kind: 'paragraph', text }
 *     { kind: 'bullet',    text }
 *     { kind: 'notice',    text }
 *     { kind: 'meta',      rows: [[term, value], …] }
 *     { kind: 'table',     head: […], rows: [[…], …] }
 *
 * Inline markup is flattened to plain text. `<strong>` and `<em>` carry
 * emphasis the phone can live without, and the single `<a>` in either document
 * links to `https://ec.europa.eu/consumers/odr` using that URL as its own link
 * text — so flattening it loses the anchor and keeps the address, which is the
 * part a reader needs. If a link is ever added whose text is *not* its href,
 * this is the decision to revisit.
 *
 * Two shapes in the markup have no kind of their own and are mapped onto one:
 *
 *   - **`<h3>` subheadings become `section` blocks.** There are 24 of them per
 *     language ("2.1 Identity & Authentication Data" and friends) and they are
 *     headings, so the heading kind is where they belong. Their `n` is the
 *     number they are written with and their `id` is derived from the section
 *     they sit in — `privacy-2` + `.1` → `privacy-2-1`. That id is *not* an
 *     anchor on the website; it exists so the app has a stable key per heading,
 *     and it can never collide with a contents-list id because the contents
 *     only ever name whole sections.
 *   - **A `<Notice>` with several paragraphs becomes several `notice` blocks.**
 *     All three notices are one paragraph today. Joining them instead would
 *     mean inventing a paragraph separator inside a field that the schema says
 *     is a single run of text, and the collapsing below would eat it anyway.
 *
 * ## What is taken from outside the language modules
 *
 * The documents' titles and effective dates are not in `legal/<lang>.tsx` at
 * all — `legal.tsx` renders them from the dictionary (`copy.footer.privacy`,
 * `copy.legal.privacyVersion`, …) so they can be shown before the text chunk
 * has finished downloading. They are part of the document as far as a reader is
 * concerned, so they are pulled from the same dictionaries here and written
 * alongside the blocks. `english` comes with them: it is the line stating that
 * the English text prevails where a translation differs, and shipping a
 * translated legal document without it is exactly the situation that line
 * exists to prevent.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { LANGUAGES } from '../src/site/i18n/context';
import { LOADERS } from '../src/site/legal/load';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'src', 'site', 'legal', 'export');

/**
 * The two documents, named as they are keyed on `LegalText`. The key doubles as
 * the section-id prefix (`privacy-3`, `terms-11`), which the id checks below
 * rely on.
 */
const DOCS = ['privacy', 'terms'];

/* ───────────────────────────────────────────────────────────────── text ── */

/**
 * The named entities worth knowing about.
 *
 * React only ever emits five of these (`&amp; &lt; &gt; &quot; &#x27;`), so
 * most of this table is for the day somebody renders one of these documents
 * through something else. The numeric forms are handled generically below,
 * which covers `&#39;` and `&#x27;` without either being listed.
 */
const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  bull: '•',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  times: '×',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
};

/**
 * Entities → characters, in one pass.
 *
 * One pass matters: text authored as the literal string `&hellip;` reaches the
 * markup as `&amp;hellip;`, and the correct result is the literal `&hellip;`
 * again. A decoder that looped until nothing changed would turn it into an
 * ellipsis — quietly rewriting the document.
 *
 * An entity this does not know throws rather than passing through, because a
 * raw `&something;` shipped into the app is a defect nobody would notice until
 * a reader saw it.
 */
function decodeEntities(text) {
  return text.replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
        throw new Error(`unrepresentable character reference: ${whole}`);
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED[body];
    if (named === undefined) throw new Error(`unknown HTML entity: ${whole}`);
    return named;
  });
}

/**
 * Collapse the whitespace JSX left behind, and only that.
 *
 * The runs being collapsed are indentation in the `.tsx` source that survived
 * into the markup, so **only ASCII whitespace is touched**. A non-breaking
 * space is a character the author chose — it is there to stop a break between a
 * number and its unit — and folding it into an ordinary space would undo the
 * one thing it was written for. `\s` in JavaScript matches it, which is why the
 * class here is spelled out instead.
 */
function collapse(text) {
  return text.replace(/[\t\n\r\f\v ]+/g, ' ').replace(/^[\t\n\r\f\v ]+|[\t\n\r\f\v ]+$/g, '');
}

/* ─────────────────────────────────────────────────────────────── parser ── */

/**
 * Elements with no closing tag. None of them appear in either document today;
 * the set is here so that the day a `<br />` is added to a translation the
 * parser does not go looking for a `</br>` and unbalance everything after it.
 */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Tags and text, in document order.
 *
 * The attribute part of the pattern steps over quoted values so that a `>`
 * inside an `href` cannot be mistaken for the end of the tag. React escapes `&`
 * and `"` in attribute values but not `>`, so that case is reachable with an
 * ordinary query string.
 */
const TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /([A-Za-z][A-Za-z0-9-]*)="([^"]*)"/g;

function parseAttrs(source) {
  const attrs = {};
  for (const [, name, value] of source.matchAll(ATTR)) attrs[name] = decodeEntities(value);
  return attrs;
}

/**
 * Markup → a tree of `{ tag, attrs, children }` and `{ text }` nodes.
 *
 * Deliberately strict: a stray close tag or an element left open at the end is
 * thrown on rather than repaired. Browsers repair such things because they have
 * to accept the whole web; this parser has one producer and a repair here would
 * only ever hide a bug in it.
 */
function parseHtml(html) {
  const root = { tag: null, attrs: {}, children: [] };
  const stack = [root];
  let at = 0;

  const pushText = (raw) => {
    if (!raw) return;
    stack[stack.length - 1].children.push({ text: decodeEntities(raw) });
  };

  TAG.lastIndex = 0;
  let match;
  while ((match = TAG.exec(html)) !== null) {
    pushText(html.slice(at, match.index));
    at = TAG.lastIndex;

    const [whole, closing, tag, attrSource] = match;
    if (closing) {
      const open = stack.pop();
      if (stack.length === 0 || open.tag !== tag) {
        throw new Error(`</${tag}> closes <${open?.tag ?? 'nothing'}>`);
      }
      continue;
    }

    const node = { tag, attrs: parseAttrs(attrSource), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag) && !whole.endsWith('/>')) stack.push(node);
  }
  pushText(html.slice(at));

  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1].tag}>`);
  return root.children;
}

/** Every character under a node, inline markup dropped, whitespace collapsed. */
function flatten(node) {
  if (node.text !== undefined) return node.text;
  return collapse(node.children.map(flatten).join(''));
}

const hasClass = (node, name) => (node.attrs.class ?? '').split(/\s+/).includes(name);

/* ───────────────────────────────────────────────────────────────── walk ── */

/**
 * The tree → the flat block list.
 *
 * `push` is the single place a block is added, so the "never emit an empty
 * block" rule is enforced once rather than at each of the six call sites. An
 * empty block is not a harmless blank line on a phone: it is a gap in a
 * document that is supposed to read continuously, and the cause is always
 * something the walk got wrong upstream — so it throws instead of skipping.
 */
function walkDocument(nodes, doc) {
  const out = [];

  const push = (block) => {
    const empty =
      block.kind === 'meta' || block.kind === 'table'
        ? block.rows.length === 0
        : (block.text ?? block.title ?? '') === '';
    if (empty) throw new Error(`empty ${block.kind} block in ${doc}`);
    out.push(block);
  };

  /**
   * `<h2><span class="legal-n">3.</span>Special Categories of Data</h2>` — the
   * number is its own span precisely so the stylesheet can set it apart, which
   * makes taking the two halves back apart exact rather than a guess at where
   * the number ends.
   *
   * The trailing dot the source writes (`n="3."`) is dropped so that section
   * and subheading numbers are spelled the same way — `3` and `3.1` — and the
   * app can render one separator after both instead of special-casing the
   * level. The dot is presentation; the number is the content.
   */
  const heading = (h2) => {
    const span = h2.children.find((child) => child.tag === 'span' && hasClass(child, 'legal-n'));
    if (!span) throw new Error(`a section heading has no number: ${flatten(h2)}`);
    const rest = h2.children.filter((child) => child !== span);
    return {
      n: flatten(span).replace(/\.$/, ''),
      title: collapse(rest.map(flatten).join(' ')),
    };
  };

  /* The section a subheading belongs to, so `<h3>2.1 …</h3>` can be checked
     against it and can borrow its id. Five translations number these by hand;
     a `3.1` that ended up under section 2 in one of them is exactly the kind of
     mistake that survives review and this catches for free. */
  let section = null;

  const walk = (node) => {
    if (node.text !== undefined) {
      /* React emits no whitespace between block elements, so anything here is
         real text that escaped a paragraph — it would be dropped silently. */
      if (collapse(node.text) !== '') throw new Error(`loose text in ${doc}: ${node.text}`);
      return;
    }

    switch (node.tag) {
      case 'section': {
        const h2 = node.children.find((child) => child.tag === 'h2');
        if (!h2) throw new Error(`<section id="${node.attrs.id}"> has no heading`);
        const { n, title } = heading(h2);
        section = { id: node.attrs.id, n };
        push({ kind: 'section', id: node.attrs.id, n, title });
        for (const child of node.children) if (child !== h2) walk(child);
        return;
      }

      case 'h3': {
        /* "2.1 Identity & Authentication Data" — number, space, title. Every
           subheading in all five languages is written this way; one that is not
           has lost its place in the numbering and should be fixed at source
           rather than exported with a guess at what it meant. */
        const text = flatten(node);
        const split = /^(\d+)\.(\d+)\s+(.+)$/.exec(text);
        if (!split) throw new Error(`unnumbered subheading in ${doc}: ${text}`);
        const [, major, minor, title] = split;
        if (!section) throw new Error(`subheading ${major}.${minor} before any section`);
        if (major !== section.n) {
          throw new Error(`subheading ${major}.${minor} sits inside section ${section.n}`);
        }
        push({ kind: 'section', id: `${section.id}-${minor}`, n: `${major}.${minor}`, title });
        return;
      }

      case 'p':
        push({ kind: 'paragraph', text: flatten(node) });
        return;

      case 'ul':
        for (const item of node.children) {
          if (item.tag !== 'li') throw new Error(`<${item.tag ?? 'text'}> directly inside a <ul>`);
          push({ kind: 'bullet', text: flatten(item) });
        }
        return;

      case 'dl': {
        /* `<Meta>`: `<div><dt>term</dt><dd>value</dd></div>` per row. Kept as
           pairs rather than flattened into paragraphs because the app lays the
           two columns out itself, and "Supervisory Authority" run together with
           its value reads as one sentence. */
        const rows = node.children.map((row) => {
          const term = row.children.find((child) => child.tag === 'dt');
          const value = row.children.find((child) => child.tag === 'dd');
          if (!term || !value) throw new Error(`a meta row in ${doc} is not a dt/dd pair`);
          return [flatten(term), flatten(value)];
        });
        push({ kind: 'meta', rows });
        return;
      }

      case 'table': {
        const head = [];
        const rows = [];
        for (const part of node.children) {
          if (part.tag === 'thead') {
            for (const row of part.children) head.push(...row.children.map(flatten));
          } else if (part.tag === 'tbody') {
            for (const row of part.children) rows.push(row.children.map(flatten));
          } else {
            throw new Error(`<${part.tag}> inside a legal table`);
          }
        }
        /* A row whose cell count does not match the header means either the
           parse lost a `<td>` or the source has a ragged table; both are worth
           stopping for, because the app lays these out on a fixed column count
           and a short row would shift every cell after it. */
        for (const row of rows) {
          if (row.length !== head.length) {
            throw new Error(`table row has ${row.length} cells, header has ${head.length}`);
          }
        }
        push({ kind: 'table', head, rows });
        return;
      }

      case 'div': {
        if (hasClass(node, 'legal-notice')) {
          for (const child of node.children) push({ kind: 'notice', text: flatten(child) });
          return;
        }
        /* `legal-table-wrap` is the horizontal scroller `parts.tsx` puts round
           every table; it is layout and has nothing to contribute. */
        if (hasClass(node, 'legal-table-wrap')) {
          for (const child of node.children) walk(child);
          return;
        }
        throw new Error(`unrecognised <div class="${node.attrs.class ?? ''}"> in ${doc}`);
      }

      default:
        throw new Error(`no block kind for <${node.tag}> in ${doc}`);
    }
  };

  for (const node of nodes) walk(node);
  return out;
}

/* ─────────────────────────────────────────────────────────────── output ── */

/**
 * `JSON.stringify` with one deliberate difference: an array of nothing but
 * strings stays on a single line.
 *
 * These files are committed, and the thing people will do with them is read a
 * diff to check what changed in a legal document before it ships to phones.
 * Plain `JSON.stringify(…, null, 2)` puts every table cell on its own line,
 * which turns a four-word edit into a forty-line diff and makes a moved row
 * indistinguishable from a rewritten one. Keeping `["Email address", "Account
 * creation…", …]` intact makes a changed row exactly one changed line.
 *
 * Minifying instead — which is what `build-question-banks.mjs` does for the
 * game data — would be the right call for data nobody reads. Legal text is the
 * opposite case: it is read far more often than it is loaded.
 *
 * The output is ordinary JSON; every scalar goes through `JSON.stringify`, so
 * escaping is the platform's rather than this function's.
 */
function format(value, indent = '') {
  const inner = `${indent}  `;

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((item) => typeof item === 'string')) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }
    const items = value.map((item) => `${inner}${format(item, inner)}`);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([key, item]) => `${inner}${JSON.stringify(key)}: ${format(item, inner)}`,
    );
    return `{\n${entries.join(',\n')}\n${indent}}`;
  }

  return JSON.stringify(value);
}

/* ──────────────────────────────────────────────────────────────── build ── */

/**
 * The contents list is the app's table of contents *and* the site's, so the two
 * had better name the same sections in the same order. They are authored
 * separately — the array at the top of the module and the `<Section id>` props
 * below it — which is precisely why this is checked rather than assumed.
 */
function checkContents(contents, blocks, where) {
  const listed = contents.map(([id]) => id).join(' ');
  /* Top-level sections are the ones whose number has no dot in it; the
     subheadings folded into this kind all carry `major.minor`. */
  const body = blocks
    .filter((block) => block.kind === 'section' && !block.n.includes('.'))
    .map((block) => block.id)
    .join(' ');
  if (listed !== body) {
    throw new Error(`${where}: contents list [${listed}] does not match the body [${body}]`);
  }
}

mkdirSync(OUT, { recursive: true });

/** `kind` per block, in order — the fingerprint the languages are compared on. */
const shapeOf = (blocks) => blocks.map((b) => b.kind).join(' ');

const shapes = {};
const summary = [];

for (const [lang, load] of Object.entries(LOADERS)) {
  const text = (await load()).default;
  const copy = LANGUAGES[lang];

  const exported = {
    privacyTitle: copy.footer.privacy,
    termsTitle: copy.footer.terms,
    privacyVersion: copy.legal.privacyVersion,
    termsVersion: copy.legal.termsVersion,
    english: copy.legal.english,
    privacyContents: text.privacyContents,
    termsContents: text.termsContents,
  };

  const counts = {};
  for (const doc of DOCS) {
    const blocks = walkDocument(parseHtml(renderToStaticMarkup(text[doc]())), `${lang}/${doc}`);
    checkContents(exported[`${doc}Contents`], blocks, `${lang}/${doc}`);

    /* English is the authoritative text, so it is also the shape every other
       language is measured against — the same rule `en.tsx` states for the
       wording. A mismatch is reported rather than thrown: a translation is
       allowed to differ (a clause that needs two paragraphs in Polish and one
       in English is not a bug), but it should never differ by accident. */
    const shape = shapeOf(blocks);
    if (lang === 'en') shapes[doc] = shape;
    else if (shape !== shapes[doc]) {
      console.warn(`  ! ${lang}/${doc} has a different block sequence to English`);
    }

    exported[doc] = blocks;
    counts[doc] = blocks;
  }

  const json = `${format(exported)}\n`;
  /* The formatter is hand-rolled, so it is checked against the thing it is
     imitating rather than trusted: a parse of the output has to be identical to
     the object that went in. A bug here would corrupt a legal document. */
  if (JSON.stringify(JSON.parse(json)) !== JSON.stringify(exported)) {
    throw new Error(`${lang}.json does not round-trip`);
  }
  writeFileSync(join(OUT, `${lang}.json`), json);
  summary.push([lang, counts, Buffer.byteLength(json)]);
}

/* The per-kind tally is the useful half of the output: a total that matches
   English proves nothing on its own, whereas "10 tables, 1060 cells" is the
   number that would move if the parse had swallowed a row. */
const KINDS = ['section', 'paragraph', 'bullet', 'notice', 'meta', 'table'];
const tally = (blocks, kind) => blocks.filter((block) => block.kind === kind).length;
const cells = (blocks) =>
  blocks
    .filter((block) => block.kind === 'table')
    .reduce((sum, table) => sum + table.rows.length * table.head.length, 0);

console.log(`legal export → src/site/legal/export/ · ${summary.length} languages`);
console.log(`  ${'lang doc'.padEnd(14)}${KINDS.map((k) => k.padStart(10)).join('')}${'total'.padStart(8)}${'cells'.padStart(8)}`);
for (const [lang, docs, bytes] of summary) {
  for (const doc of DOCS) {
    const blocks = docs[doc];
    console.log(
      `  ${`${lang} ${doc}`.padEnd(14)}` +
        KINDS.map((kind) => String(tally(blocks, kind)).padStart(10)).join('') +
        String(blocks.length).padStart(8) +
        String(cells(blocks)).padStart(8),
    );
  }
  console.log(`  ${lang}.json ${(bytes / 1024).toFixed(0)} kB`);
}
