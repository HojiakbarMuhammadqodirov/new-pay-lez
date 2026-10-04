/**
 * The console's **Gift cards** tab — the shelf players buy with points, and
 * everything that happens to a card after it is bought.
 *
 * ## Two kinds, by market
 *
 * Poland sells **real brand codes**: the operator buys them from the brand and
 * loads them here, by pasting or from a CSV. Uzbekistan sells **one venue's own
 * card**, whose codes the server generates. The kind is chosen when a card is
 * created and never changes, because a code means something different under
 * each — see `server/domain/giftCards.ts`.
 *
 * ## What this screen will not do
 *
 * Edit a card somebody already holds. A shelf row's face value and price can
 * change, and the cards already bought keep what they were bought at — the
 * server copies both onto the card. The one write here that reaches the ledger
 * is **cancel and refund**, and it is a new entry giving the points back, never
 * an edit of the spend; the code stays burned, because the player has seen it
 * and may already have used it at the brand. That is why it is behind a
 * dialogue that says so, and "mark used" is not.
 *
 * Every class is the console's own kit (`.adm-block`, `.adm-table`,
 * `.adm-edit-*`, `.adm-tabs`, `.field`); `.adm-gift*` is grepped and free, and
 * claims only the two things the kit has no shape for — the logo chip in a
 * table cell and the code paste box.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import {
  ADMIN_GIFT_CARDS_PATH,
  GIFT_POLICY_PATH,
  cancelIssued,
  createGiftCard,
  generateGiftCodes,
  issuedGiftCardsPath,
  loadGiftCodes,
  markIssuedUsed,
  removeGiftCard,
  saveGiftPolicy,
  setGiftCardActive,
  updateGiftCard,
  type AdminGiftCard,
  type GiftCardInput,
  type GiftPolicy,
  type GiftPool,
  type IssuedGiftCard,
} from './api/admin';
import { faceValue } from './api/wallet';
import { useApi } from './api/useApi';
import type { Write } from './adminWrite';
import { ConfirmDialog } from './adminControls';
import { day } from './adminFormat';
import { initialOf, type AdminVenueRow } from './adminMetrics';
import { isPicture } from './auth/picture';
import { Icon } from './icons';
import { LOGO_PX, toSquareDataUrl } from './imageFile';
import { useCopy, useGroupSeparator, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';

const CURRENCIES = ['PLN', 'UZS', 'EUR', 'USD'] as const;
/** Each market's own money, picked for the operator when they pick the market. */
const CURRENCY_OF: Record<'PL' | 'UZ', string> = { PL: 'PLN', UZ: 'UZS' };

/** The logo chip: the picture when there is one, the initial when there is not. */
function Mark({ logo, name }: { logo: string; name: string }) {
  return (
    <span className="adm-gift-mark" aria-hidden>
      {isPicture(logo) ? <img src={logo} alt="" /> : initialOf(name)}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────── the form ── */

interface Draft {
  brand: string;
  logo: string;
  countryCode: 'PL' | 'UZ';
  kind: 'brand' | 'venue';
  venueId: string;
  currency: string;
  /** In the currency's major unit, as typed. Sent as hundredths. */
  face: string;
  points: string;
  validity: string;
  priority: boolean;
  howTo: string;
}

const draftOf = (card: AdminGiftCard | null): Draft =>
  card
    ? {
        brand: card.brand,
        logo: card.logo,
        countryCode: card.country_code === 'UZ' ? 'UZ' : 'PL',
        kind: card.kind,
        venueId: card.venue_id ?? '',
        currency: card.currency,
        face: String(Number(card.face_minor) / 100),
        points: String(card.points_cost),
        validity: String(card.validity_days),
        priority: Number(card.priority_only) === 1,
        howTo: card.how_to_use,
      }
    : {
        brand: '',
        logo: '',
        countryCode: 'PL',
        kind: 'brand',
        venueId: '',
        currency: 'PLN',
        face: '',
        points: '',
        validity: '90',
        priority: false,
        howTo: '',
      };

function CardForm({
  card,
  venues,
  write,
  onDone,
  onClose,
}: {
  /** `null` creates. */
  card: AdminGiftCard | null;
  venues: AdminVenueRow[];
  write: Write;
  onDone: () => void;
  onClose: () => void;
}) {
  const copy = useCopy().admin.gifts;
  const [draft, setDraft] = useState<Draft>(() => draftOf(card));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((was) => ({ ...was, [key]: value }));
  const key = card ? `gift:${card.id}:edit` : 'gift:new';

  const face = Math.round(Number(draft.face.replace(',', '.')) * 100);
  const points = Number(draft.points);
  const validity = Number(draft.validity);
  const ready =
    draft.brand.trim() !== '' &&
    Number.isFinite(face) && face > 0 &&
    Number.isInteger(points) && points > 0 &&
    Number.isInteger(validity) && validity >= 1 && validity <= 3650 &&
    (draft.kind === 'brand' || draft.venueId !== '');

  const pickLogo = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const picture = await toSquareDataUrl(file, LOGO_PX);
    if (picture) set('logo', picture);
  };

  const submit = () => {
    if (!ready) return;
    const body: GiftCardInput = {
      brand: draft.brand.trim(),
      logo: draft.logo,
      faceMinor: face,
      currency: draft.currency,
      pointsCost: points,
      priorityOnly: draft.priority,
      countryCode: draft.countryCode,
      kind: draft.kind,
      venueId: draft.kind === 'venue' ? draft.venueId : null,
      validityDays: validity,
      howToUse: draft.howTo.trim(),
    };
    write.run(
      key,
      async () => {
        if (card) {
          const { kind: _kind, ...patch } = body;
          void _kind;
          await updateGiftCard(card.id, patch);
          onClose();
          return copy.saved;
        }
        await createGiftCard(body);
        onClose();
        return copy.created;
      },
      onDone,
    );
  };

  return (
    <form
      className="adm-edit-form adm-gift-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="adm-gift-form-title">{card ? fill(copy.form.titleEdit, { name: card.brand }) : copy.form.titleNew}</h3>
      <div className="adm-edit-grid">
        <label className="field">
          <span className="field-label">{copy.form.brand}</span>
          <input value={draft.brand} maxLength={80} onChange={(event) => set('brand', event.target.value)} />
        </label>

        <div className="field">
          <span className="field-label">{copy.form.logo}</span>
          <div className="logo-pick">
            {isPicture(draft.logo) && (
              <span className="logo-chip" aria-hidden>
                <img src={draft.logo} alt="" />
              </span>
            )}
            <label className="file-pick">
              <input type="file" accept="image/*" onChange={(event) => void pickLogo(event.target)} />
              <Icon name="card" size={15} />
              <span>{draft.logo ? copy.form.logoReplace : copy.form.logoChoose}</span>
            </label>
            {draft.logo && (
              <button type="button" className="link-btn" onClick={() => set('logo', '')}>
                {copy.form.logoRemove}
              </button>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field-label">{copy.form.country}</span>
          <select
            value={draft.countryCode}
            onChange={(event) => {
              const country = event.target.value === 'UZ' ? 'UZ' : 'PL';
              /* The market's own money comes with it; the operator can still
                 change it, but a Polish card priced in so'm is a slip, not a
                 choice, and should take a second deliberate press. */
              setDraft((was) => ({ ...was, countryCode: country, currency: CURRENCY_OF[country] }));
            }}
          >
            <option value="PL">{copy.countries.PL}</option>
            <option value="UZ">{copy.countries.UZ}</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">{copy.form.kind}</span>
          <select
            value={draft.kind}
            disabled={card !== null}
            onChange={(event) => set('kind', event.target.value === 'venue' ? 'venue' : 'brand')}
          >
            <option value="brand">{copy.kinds.brand}</option>
            <option value="venue">{copy.kinds.venue}</option>
          </select>
          <span className="field-help">{copy.form.kindHelp}</span>
        </label>

        {draft.kind === 'venue' && (
          <label className="field">
            <span className="field-label">{copy.form.venue}</span>
            <select value={draft.venueId} onChange={(event) => set('venueId', event.target.value)}>
              <option value="">{copy.form.pickVenue}</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.city ? `${venue.name} · ${venue.city}` : venue.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span className="field-label">{copy.form.currency}</span>
          <select value={draft.currency} onChange={(event) => set('currency', event.target.value)}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">{copy.form.face}</span>
          <input
            inputMode="decimal"
            value={draft.face}
            onChange={(event) => set('face', event.target.value)}
          />
          <span className="field-help">{copy.form.faceHelp}</span>
        </label>

        <label className="field">
          <span className="field-label">{copy.form.points}</span>
          <input inputMode="numeric" value={draft.points} onChange={(event) => set('points', event.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">{copy.form.validity}</span>
          <input inputMode="numeric" value={draft.validity} onChange={(event) => set('validity', event.target.value)} />
          <span className="field-help">{copy.form.validityHelp}</span>
        </label>

        <label className="field" data-wide="true">
          <span className="field-label">{copy.form.howTo}</span>
          <textarea rows={3} maxLength={600} value={draft.howTo} onChange={(event) => set('howTo', event.target.value)} />
          <span className="field-help">{copy.form.howToHelp}</span>
        </label>

        <label className="field adm-gift-check">
          <span>
            <input type="checkbox" checked={draft.priority} onChange={(event) => set('priority', event.target.checked)} />{' '}
            {copy.form.priority}
          </span>
          <span className="field-help">{copy.form.priorityHelp}</span>
        </label>
      </div>

      <div className="adm-edit-acts">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {copy.form.cancel}
        </button>
        <button type="submit" className="btn btn-solid" disabled={!ready || write.busy === key}>
          <Icon name="check" size={15} strokeWidth={2} />
          {write.busy === key ? copy.form.working : card ? copy.form.save : copy.form.create}
        </button>
      </div>
    </form>
  );
}

/* ───────────────────────────────────────────────── budget and rules ── */

/**
 * Who may buy a card and how much the platform spends on them — two modes,
 * the owner's request: **automatic**, where the operator types a percentage
 * and the server does the arithmetic (the rulebook's Pro and Premium, 60 days,
 * monthly), and **manual**, where every criterion is the operator's.
 *
 * The panel draws the pool the saved policy produces *right now* beside the
 * form, read back from the server rather than worked out here, so the effect
 * of a setting is something the operator sees and not something they trust.
 */
function PolicyPanel({ write, down }: { write: Write; down: (result: { reload: () => void }) => ReactNode }) {
  const gifts = useCopy().admin.gifts;
  const copy = gifts.policy;
  const separator = useGroupSeparator();
  const answer = useApi<{ policy: GiftPolicy; pool: GiftPool }>(GIFT_POLICY_PATH);
  const [draft, setDraft] = useState<GiftPolicy | null>(null);

  /* The form starts from what is saved, once; a re-read after a save resets it. */
  const saved = answer.state.status === 'ready' ? answer.state.data.policy : null;
  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  if (answer.state.status === 'error') return <>{down(answer)}</>;
  if (answer.state.status === 'loading' || !draft) return <p className="adm-empty">{gifts.loading}</p>;
  const pool = answer.state.data.pool;
  const money = (minor: number) => faceValue({ face_minor: minor, currency: pool.currency }, separator);

  const manual = draft.manual;
  const setManual = <K extends keyof GiftPolicy['manual']>(key: K, value: GiftPolicy['manual'][K]) =>
    setDraft({ ...draft, manual: { ...manual, [key]: value } });
  const numberOf = (raw: string) => (raw.trim() === '' ? 0 : Number(raw.replace(',', '.')));
  const percentOk = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  const ready =
    percentOk(draft.autoPercent) &&
    (draft.mode === 'auto' ||
      (percentOk(manual.percent) &&
        Number.isFinite(manual.amountMajor) && manual.amountMajor >= 0 &&
        Number.isInteger(manual.perUserEveryDays) && manual.perUserEveryDays >= 0 &&
        !(manual.from && manual.until && manual.until < manual.from)));

  const save = () => {
    if (!ready) return;
    const { updatedAt: _updatedAt, ...body } = draft;
    void _updatedAt;
    write.run(
      'gift:policy',
      async () => {
        await saveGiftPolicy(body);
        return copy.saved;
      },
      answer.reload,
    );
  };

  return (
    <section className="adm-block" data-reveal>
      <div className="adm-block-head">
        <h2>{copy.title}</h2>
        <p>{copy.lede}</p>
      </div>

      <form
        className="adm-edit-form adm-gift-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="adm-gift-modes" role="radiogroup" aria-label={copy.title}>
          {(['auto', 'manual'] as const).map((mode) => (
            <label key={mode} className="adm-gift-mode" data-on={draft.mode === mode ? 'true' : undefined}>
              <input
                type="radio"
                name="gift-policy-mode"
                checked={draft.mode === mode}
                onChange={() => setDraft({ ...draft, mode })}
              />
              <b>{mode === 'auto' ? copy.autoTitle : copy.manualTitle}</b>
              <span className="field-help">{mode === 'auto' ? copy.autoHelp : copy.manualHelp}</span>
            </label>
          ))}
        </div>

        {draft.mode === 'auto' ? (
          <div className="adm-edit-grid">
            <label className="field">
              <span className="field-label">{copy.percent}</span>
              <input
                inputMode="decimal"
                value={String(draft.autoPercent)}
                onChange={(event) => setDraft({ ...draft, autoPercent: numberOf(event.target.value) })}
              />
              <span className="field-help">{copy.percentHelp}</span>
            </label>
          </div>
        ) : (
          <div className="adm-edit-grid">
            <label className="field">
              <span className="field-label">{copy.audience}</span>
              <select value={manual.audience} onChange={(event) => setManual('audience', event.target.value as GiftPolicy['manual']['audience'])}>
                <option value="all">{copy.all}</option>
                <option value="paid">{copy.paid}</option>
                <option value="premium">{copy.premium}</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">{copy.budget}</span>
              <select value={manual.budgetKind} onChange={(event) => setManual('budgetKind', event.target.value === 'percent' ? 'percent' : 'amount')}>
                <option value="amount">{copy.amountKind}</option>
                <option value="percent">{copy.percentKind}</option>
              </select>
            </label>

            {manual.budgetKind === 'amount' ? (
              <label className="field">
                <span className="field-label">{copy.amount}</span>
                <input inputMode="decimal" value={String(manual.amountMajor)} onChange={(event) => setManual('amountMajor', numberOf(event.target.value))} />
              </label>
            ) : (
              <label className="field">
                <span className="field-label">{copy.percent}</span>
                <input inputMode="decimal" value={String(manual.percent)} onChange={(event) => setManual('percent', numberOf(event.target.value))} />
                <span className="field-help">{copy.percentHelp}</span>
              </label>
            )}

            <label className="field">
              <span className="field-label">{copy.repeat}</span>
              <select value={manual.repeat} onChange={(event) => setManual('repeat', event.target.value === 'once' ? 'once' : 'monthly')}>
                <option value="monthly">{copy.monthly}</option>
                <option value="once">{copy.once}</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">{copy.from}</span>
              <input type="date" value={manual.from ?? ''} onChange={(event) => setManual('from', event.target.value || null)} />
              <span className="field-help">{copy.dateHelp}</span>
            </label>

            <label className="field">
              <span className="field-label">{copy.until}</span>
              <input type="date" value={manual.until ?? ''} onChange={(event) => setManual('until', event.target.value || null)} />
              <span className="field-help">{copy.dateHelp}</span>
            </label>

            <label className="field">
              <span className="field-label">{copy.perUser}</span>
              <input inputMode="numeric" value={String(manual.perUserEveryDays)} onChange={(event) => setManual('perUserEveryDays', Math.floor(numberOf(event.target.value)))} />
              <span className="field-help">{copy.perUserHelp}</span>
            </label>
          </div>
        )}

        <div className="adm-edit-acts">
          <button type="submit" className="btn btn-solid" disabled={!ready || write.busy === 'gift:policy'}>
            <Icon name="check" size={15} strokeWidth={2} />
            {write.busy === 'gift:policy' ? copy.saving : copy.save}
          </button>
        </div>
      </form>

      {/* What the saved policy produces right now — the server's own figures. */}
      <div className="adm-gift-now">
        <h3 className="adm-gift-form-title">{copy.nowTitle}</h3>
        {!pool.open ? (
          <p className="adm-empty">{copy.closed}</p>
        ) : (
          <dl className="adm-gift-figures">
            <div>
              <dt>{copy.period}</dt>
              <dd>{pool.month}</dd>
            </div>
            <div>
              <dt>{copy.plans}</dt>
              <dd>{money(pool.revenueMinor)}</dd>
            </div>
            <div>
              <dt>{copy.pool}</dt>
              <dd>{money(pool.budgetMinor)}</dd>
            </div>
            <div>
              <dt>{copy.spent}</dt>
              <dd>{money(pool.spentMinor)}</dd>
            </div>
            <div>
              <dt>{copy.left}</dt>
              <dd>{money(pool.remainingMinor)}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── the codes ── */

/**
 * Lines out of a paste or a file. A CSV's first column is the code; a header
 * row that says so is skipped rather than loaded as a code called "code".
 */
function codesIn(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.split(/[,;\t]/)[0]?.trim().replace(/^"(.*)"$/, '$1') ?? '')
    .filter((line) => line !== '');
  if (lines.length > 0 && /^(codes?|kod|kody|код|коды|kodlar)$/i.test(lines[0])) lines.shift();
  return lines;
}

function CodesPanel({
  card,
  write,
  onDone,
  onClose,
}: {
  card: AdminGiftCard;
  write: Write;
  onDone: () => void;
  onClose: () => void;
}) {
  const copy = useCopy().admin.gifts.codes;
  const [text, setText] = useState('');
  const [count, setCount] = useState('100');
  const key = `gift:${card.id}:codes`;
  const pasted = codesIn(text);
  const howMany = Number(count);

  const readFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const body = await file.text();
    setText((was) => (was.trim() === '' ? body : `${was.trimEnd()}\n${body}`));
  };

  return (
    <div className="adm-edit-form adm-gift-form">
      <h3 className="adm-gift-form-title">
        {fill(card.kind === 'brand' ? copy.titleBrand : copy.titleVenue, { name: card.brand })}
      </h3>
      {card.kind === 'brand' ? (
        <>
          <label className="field">
            <span className="field-label">{copy.paste}</span>
            <textarea
              className="adm-gift-paste"
              rows={6}
              value={text}
              spellCheck={false}
              onChange={(event) => setText(event.target.value)}
            />
            <span className="field-help">{fill(copy.pasteHelp, { n: String(pasted.length) })}</span>
          </label>
          <div className="adm-edit-acts">
            <label className="file-pick">
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void readFile(event.target)} />
              <Icon name="card" size={15} />
              <span>{copy.file}</span>
            </label>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {copy.close}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              disabled={pasted.length === 0 || write.busy === key}
              onClick={() =>
                write.run(
                  key,
                  async () => {
                    const result = await loadGiftCodes(card.id, pasted);
                    setText('');
                    return fill(copy.loaded, {
                      added: String(result.added),
                      duplicates: String(result.duplicates),
                      rejected: String(result.rejected),
                    });
                  },
                  onDone,
                )
              }
            >
              <Icon name="check" size={15} strokeWidth={2} />
              {write.busy === key ? copy.working : copy.load}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">{copy.count}</span>
            <input inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} />
            <span className="field-help">{copy.countHelp}</span>
          </label>
          <div className="adm-edit-acts">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {copy.close}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              disabled={!Number.isInteger(howMany) || howMany < 1 || howMany > 1000 || write.busy === key}
              onClick={() =>
                write.run(
                  key,
                  async () => fill(copy.generated, { added: String((await generateGiftCodes(card.id, howMany)).added) }),
                  onDone,
                )
              }
            >
              <Icon name="check" size={15} strokeWidth={2} />
              {write.busy === key ? copy.working : copy.generate}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── the tab ── */

export function AdminGiftCards({
  write,
  down,
  onChanged,
}: {
  write: Write;
  /** The console's "we could not ask" panel — see `AdminTiers` for why it is handed in. */
  down: (result: { reload: () => void }) => ReactNode;
  /** The shell's re-read, so the Offers list and the tiles agree after a write here. */
  onChanged: () => void;
}) {
  const copy = useCopy().admin.gifts;
  const [language] = useLanguage();
  const separator = useGroupSeparator();
  const cards = useApi<AdminGiftCard[]>(ADMIN_GIFT_CARDS_PATH);
  const venues = useApi<AdminVenueRow[]>('/v1/admin/venues?limit=200');
  const [panel, setPanel] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const issued = useApi<IssuedGiftCard[]>(issuedGiftCardsPath(stockFilter || null, statusFilter || null));
  const [doomed, setDoomed] = useState<IssuedGiftCard | null>(null);
  /* A shelf row on its way out. The server decides between deleting it and
     delisting it — a card somebody holds must go on naming its brand — and the
     strip says which happened. */
  const [removing, setRemoving] = useState<AdminGiftCard | null>(null);
  const manage = useCopy().admin.manage;

  const rows = cards.state.status === 'ready' ? cards.state.data : [];
  const venueRows = venues.state.status === 'ready' ? [...venues.state.data].sort((a, b) => a.name.localeCompare(b.name)) : [];

  const reload = useCallback(() => {
    cards.reload();
    issued.reload();
    onChanged();
  }, [cards, issued, onChanged]);

  const states = copy.states as Record<string, string | undefined>;

  return (
    <>
      <PolicyPanel write={write} down={down} />

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.title}</h2>
          <p>{copy.lede}</p>
        </div>

        {panel === 'new' ? (
          <CardForm card={null} venues={venueRows} write={write} onDone={reload} onClose={() => setPanel(null)} />
        ) : (
          <div className="adm-edit-acts">
            <button type="button" className="btn btn-solid" onClick={() => setPanel('new')}>
              <Icon name="plus" size={15} strokeWidth={2.2} />
              {copy.add}
            </button>
          </div>
        )}

        {cards.state.status === 'error' ? (
          down(cards)
        ) : cards.state.status === 'loading' ? (
          <p className="adm-empty">{copy.loading}</p>
        ) : rows.length === 0 ? (
          <div className="adm-block-empty">
            <h3>{copy.none.title}</h3>
            <p>{copy.none.body}</p>
          </div>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-solid>
              <thead>
                <tr>
                  {copy.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                  <th data-align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((card) => {
                  const live = Number(card.active) === 1;
                  const editKey = `edit:${card.id}`;
                  const codesKey = `codes:${card.id}`;
                  return [
                    <tr key={card.id}>
                      <td>
                        <span className="adm-gift-name">
                          <Mark logo={card.logo} name={card.brand} />
                          <b>{card.brand}</b>
                        </span>
                        {card.venue_name && <em className="adm-gift-sub">{card.venue_name}</em>}
                      </td>
                      <td>
                        {copy.countries[card.country_code === 'UZ' ? 'UZ' : 'PL']}
                        <em className="adm-gift-sub">{copy.kinds[card.kind]}</em>
                      </td>
                      <td>{faceValue(card, separator)}</td>
                      <td>{fill(copy.points, { n: String(card.points_cost) })}</td>
                      <td>{fill(copy.codesOf, { left: String(card.stock), total: String(card.codes_total) })}</td>
                      <td>
                        {String(card.issued)}
                        <em className="adm-gift-sub">
                          {fill(copy.boughtSplit, {
                            used: String(card.used_cards),
                            active: String(card.active_cards),
                          })}
                        </em>
                      </td>
                      <td>{fill(copy.days, { n: String(card.validity_days) })}</td>
                      <td>
                        <span className="adm-badge adm-gift-state" data-on={live ? 'true' : undefined}>
                          {live ? copy.live : copy.paused}
                        </span>
                      </td>
                      <td data-align="right">
                        <span className="adm-gift-acts">
                          <button type="button" className="link-btn" onClick={() => setPanel(panel === editKey ? null : editKey)}>
                            {copy.acts.edit}
                          </button>
                          <button type="button" className="link-btn" onClick={() => setPanel(panel === codesKey ? null : codesKey)}>
                            {copy.acts.codes}
                          </button>
                          <button
                            type="button"
                            className="link-btn"
                            disabled={write.busy === `gift:${card.id}:active`}
                            onClick={() =>
                              write.run(
                                `gift:${card.id}:active`,
                                async () => {
                                  await setGiftCardActive(card.id, !live);
                                  return live ? copy.didPause : copy.didResume;
                                },
                                reload,
                              )
                            }
                          >
                            {live ? copy.acts.pause : copy.acts.resume}
                          </button>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setStockFilter(card.id);
                              setStatusFilter('');
                              document.getElementById('admin-gift-usage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                          >
                            {copy.acts.usage}
                          </button>
                          <button
                            type="button"
                            className="link-btn"
                            disabled={write.busy === `gift:${card.id}:remove`}
                            onClick={() => setRemoving(card)}
                          >
                            {copy.acts.remove}
                          </button>
                        </span>
                      </td>
                    </tr>,
                    panel === editKey || panel === codesKey ? (
                      <tr key={`${card.id}:panel`} className="adm-gift-panel">
                        <td colSpan={copy.columns.length + 1}>
                          {panel === editKey ? (
                            <CardForm card={card} venues={venueRows} write={write} onDone={reload} onClose={() => setPanel(null)} />
                          ) : (
                            <CodesPanel card={card} write={write} onDone={reload} onClose={() => setPanel(null)} />
                          )}
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-block" id="admin-gift-usage" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.usage.title}</h2>
          <p>{copy.usage.lede}</p>
        </div>

        <div className="adm-gift-filters">
          <label className="field">
            <span className="visually-hidden">{copy.usage.allCards}</span>
            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
              <option value="">{copy.usage.allCards}</option>
              {rows.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.brand}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="visually-hidden">{copy.usage.allStates}</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">{copy.usage.allStates}</option>
              {(['active', 'used', 'expired', 'cancelled'] as const).map((status) => (
                <option key={status} value={status}>
                  {copy.states[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {issued.state.status === 'error' ? (
          down(issued)
        ) : issued.state.status === 'loading' ? (
          <p className="adm-empty">{copy.loading}</p>
        ) : issued.state.data.length === 0 ? (
          <p className="adm-empty">{stockFilter || statusFilter ? copy.usage.noMatch : copy.usage.none}</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-solid>
              <thead>
                <tr>
                  {copy.usage.columns.map((column, index) => (
                    <th key={`${column}-${index}`} data-align={index === copy.usage.columns.length - 1 ? 'right' : undefined}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issued.state.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.display_name || row.email || row.user_id}</b>
                      {row.email && row.display_name && <em className="adm-gift-sub">{row.email}</em>}
                    </td>
                    <td>
                      {row.brand}
                      <em className="adm-gift-sub">{faceValue(row, separator)}</em>
                    </td>
                    <td>
                      <code className="adm-gift-code">{row.code}</code>
                    </td>
                    <td>{day(row.issued_at, language)}</td>
                    <td>{day(row.expires_at, language)}</td>
                    <td>
                      <span className="adm-badge adm-gift-state" data-on={row.status === 'active' ? 'true' : undefined}>
                        {states[row.status] ?? row.status}
                      </span>
                      {row.status === 'used' && row.used_by && (
                        <em className="adm-gift-sub">{row.used_by === 'admin' ? copy.usage.byAdmin : copy.usage.byPlayer}</em>
                      )}
                    </td>
                    <td data-align="right">
                      {row.status === 'active' ? (
                        <span className="adm-gift-acts">
                          <button
                            type="button"
                            className="link-btn"
                            disabled={write.busy === `issued:${row.id}`}
                            onClick={() =>
                              write.run(
                                `issued:${row.id}`,
                                async () => {
                                  await markIssuedUsed(row.id);
                                  return copy.usage.marked;
                                },
                                reload,
                              )
                            }
                          >
                            {copy.usage.markUsed}
                          </button>
                          <button
                            type="button"
                            className="link-btn"
                            disabled={write.busy === `issued:${row.id}`}
                            onClick={() => setDoomed(row)}
                          >
                            {copy.usage.cancel}
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {removing && (
        <ConfirmDialog
          title={fill(manage.deleteTitle, { what: removing.brand })}
          body={manage.deleteCard}
          action={manage.deleteYes}
          busy={write.busy === `gift:${removing.id}:remove`}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            const card = removing;
            setRemoving(null);
            write.run(
              `gift:${card.id}:remove`,
              async () => {
                const result = await removeGiftCard(card.id);
                return result.outcome === 'deleted'
                  ? manage.cardRemoved
                  : fill(manage.cardDelisted, { n: String(result.issued) });
              },
              reload,
            );
          }}
        />
      )}

      {doomed && (
        <ConfirmDialog
          title={fill(copy.usage.cancelTitle, { what: `${doomed.brand} · ${doomed.code}` })}
          body={fill(copy.usage.cancelBody, { n: String(doomed.points_spent) })}
          action={copy.usage.cancelYes}
          busy={write.busy === `issued:${doomed.id}`}
          onClose={() => setDoomed(null)}
          onConfirm={() => {
            const row = doomed;
            setDoomed(null);
            write.run(
              `issued:${row.id}`,
              async () => fill(copy.usage.refunded, { n: String((await cancelIssued(row.id)).refunded) }),
              reload,
            );
          }}
        />
      )}
    </>
  );
}
