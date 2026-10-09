/**
 * The pass drawer — create or edit (v3 §5.4): a live preview, then six numbered
 * sections, then Cancel · Save and finish later · Publish.
 *
 * ── the form speaks the reader's currency, the request the venue's ────────
 *
 * Every money field (price, most off one visit, cost per use) holds the
 * **reader's** currency, the dashboard rule for inputs; each crosses into the
 * venue's minor units through the euro only when the request is built, and an
 * edited pass comes back the same way. Nothing here divides by 100.
 *
 * ── what a template does ─────────────────────────────────────────────────
 *
 * Picking one applies its *rule* — cap, days, discount, accent — and leaves the
 * name, the item and the price exactly as typed: those are the venue's own
 * words and money, and the server's template refuses to write them for the
 * same reason (`TEMPLATE_DEFAULTS`). So a new pass opens with an empty price
 * rather than v3's 39 zł, which would be a number nobody at this venue chose.
 *
 * ── what is not drawn, and why ───────────────────────────────────────────
 *
 * - **"Connect payouts with Stripe".** There is no payment rail, so the button
 *   would lead nowhere. Section 6 says so instead, and publishing does not wait
 *   on it: a published pass shows in the app; subscribing opens with payouts.
 * - **The language and reach notes.** Passes carry no translations and no
 *   endpoint measures what share of customers read which language; "reaches
 *   about 68%" would be a figure nobody counted.
 * - **Hours.** The server takes a from/to window and v3's drawer never draws
 *   one; an edit leaves whatever the pass already has untouched.
 */
import { useRef, useState } from 'react';

import { euroToMinor, minorToEuro } from './api/partner';
import {
  createPass,
  setPassStatus,
  updatePass,
  type BillingPeriod,
  type CapKind,
  type Pass,
  type PassAccent,
  type PassInput,
  type PassIntro,
  type PassPerk,
  type PassTemplate,
} from './api/passes';
import { Button, Drawer, DxIcon, Field, Input, Segmented, Select, Toggle, UnitField } from './dashboardKit';
import { PassArt } from './dashboardPassArt';
import {
  ACCENTS,
  NO_VENUE,
  PERIOD_MONTHS,
  TEMPLATE_EXAMPLE_PLN_MINOR,
  TEMPLATE_ORDER,
  TEMPLATE_RULES,
  benefitPhrase,
  capPhrase,
  daysPhrase,
  missingFor,
  usePassWrite,
} from './dashboardPassRules';
import { useDashboard } from './dashboardShell';
import { rescaledText, useRescaleOnCurrency } from './dashboardFormat';
import { useCopy, useCurrency, useMoney } from './i18n/context';
import { fill } from './i18n/currency';

export type PassDrawerTarget = { mode: 'create'; template: PassTemplate } | { mode: 'edit'; pass: Pass };

const PERKS: readonly PassPerk[] = ['early_access', 'member_deals', 'skip_line', 'birthday'];
const CAP_KINDS: readonly CapKind[] = ['per_day', 'per_week', 'per_month', 'unlimited'];
const PERIODS: readonly BillingPeriod[] = ['monthly', 'quarterly', 'annual'];
const INTROS: readonly PassIntro[] = ['none', 'trial_7', 'half_first'];
/** `CONFIG.passes.maxSeats` — "Friends & family". */
const FAMILY_SEATS = 3;
const DISCOUNT_DEFAULT = 15;

interface Form {
  template: PassTemplate;
  name: string;
  tagline: string;
  accent: PassAccent;
  benefitItem: string;
  discountOn: boolean;
  discountPct: string;
  perks: PassPerk[];
  capKind: CapKind;
  capCount: string;
  unlimitedOk: boolean;
  /** 0 = Monday; empty is any day. */
  allowedDays: number[];
  seats: number;
  billingPeriod: BillingPeriod;
  intro: PassIntro;
  /* Reader's currency, as typed. */
  price: string;
  maxValue: string;
  costPerUse: string;
  subscriberCap: string;
}

/** A number field's text as a number, or null when it is blank or not one. */
const numberOf = (text: string): number | null => {
  const value = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(value) ? null : value;
};

/** Apply a template's rule to a form, keeping everything the owner wrote. */
function withTemplate(form: Form, template: PassTemplate): Form {
  const rule = TEMPLATE_RULES[template];
  return {
    ...form,
    template,
    accent: rule.accent,
    capKind: rule.capKind,
    capCount: String(rule.capCount),
    allowedDays: rule.allowedDays ? [...rule.allowedDays] : [],
    discountOn: rule.discountPct !== null,
    discountPct: String(rule.discountPct ?? DISCOUNT_DEFAULT),
    unlimitedOk: false,
  };
}

export function PassDrawer({
  target,
  currency,
  locked,
  onClose,
  onSaved,
}: {
  target: PassDrawerTarget;
  /** The venue's currency — what every `…Minor` is counted in. */
  currency: string;
  locked: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const copy = useCopy().dashboard.passes;
  const d = copy.drawer;
  const reader = useCurrency();
  const money = useMoney();
  const { venueId } = useDashboard();
  const { busy, run } = usePassWrite(onSaved);
  const cancelLabel = useCopy().dashboard.drawer.cancel;
  const editing = target.mode === 'edit' ? target.pass : null;
  const venueCurrency = editing?.currency ?? currency;

  /* Venue minor ⇄ reader's units, through the euro both ways. */
  const toReader = (minor: number | null) =>
    minor === null ? '' : String(Math.round(minorToEuro(minor, venueCurrency) * reader.rate * 100) / 100);
  const toMinor = (text: string) => {
    const value = numberOf(text);
    return value === null ? null : euroToMinor(value / reader.rate, venueCurrency);
  };
  /** A figure in the reader's units, written in the reader's currency. */
  const readerMoney = (value: number, round: 'exact' | 'unit' = 'exact') => money(value / reader.rate, round);

  const [form, setForm] = useState<Form>(() => {
    if (editing) {
      return {
        template: editing.template,
        name: editing.name,
        tagline: editing.tagline ?? '',
        accent: editing.accent,
        benefitItem: editing.benefitItem ?? '',
        discountOn: editing.discountPct !== null,
        discountPct: String(editing.discountPct ?? DISCOUNT_DEFAULT),
        perks: [...editing.perks],
        capKind: editing.capKind,
        capCount: String(editing.capCount),
        unlimitedOk: editing.unlimitedOk,
        allowedDays: editing.allowedDays ? [...editing.allowedDays] : [],
        seats: editing.seats,
        billingPeriod: editing.billingPeriod,
        intro: editing.intro,
        price: toReader(editing.priceMinor || null),
        maxValue: toReader(editing.maxValueMinor),
        costPerUse: toReader(editing.costPerUseMinor),
        subscriberCap: editing.subscriberCap === null ? '' : String(editing.subscriberCap),
      };
    }
    const blank: Form = {
      template: 'custom',
      name: '',
      tagline: '',
      accent: 'ink',
      benefitItem: '',
      discountOn: false,
      discountPct: String(DISCOUNT_DEFAULT),
      perks: [],
      capKind: 'per_day',
      capCount: '1',
      unlimitedOk: false,
      allowedDays: [],
      seats: 1,
      billingPeriod: 'monthly',
      intro: 'none',
      price: '',
      maxValue: '',
      costPerUse: '',
      subscriberCap: '',
    };
    return withTemplate(blank, target.mode === 'create' ? target.template : 'custom');
  });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  /* The three money fields are the reader's currency: switching it with the
     drawer open keeps them the same money, not the same digits. */
  useRescaleOnCurrency((ratio) =>
    setForm((f) => ({
      ...f,
      price: rescaledText(f.price, ratio),
      maxValue: rescaledText(f.maxValue, ratio),
      costPerUse: rescaledText(f.costPerUse, ratio),
    })),
  );

  /* The request body. Everything is sent — `null` removes a nullable field —
     except the hours, which this drawer does not draw (see the header). */
  const input: PassInput = (() => {
    const discount = form.discountOn ? numberOf(form.discountPct) : null;
    const cap = numberOf(form.subscriberCap);
    return {
      template: form.template,
      name: form.name.trim(),
      tagline: form.tagline.trim() || null,
      accent: form.accent,
      benefitItem: form.benefitItem.trim() || null,
      discountPct: discount === null ? null : Math.round(discount),
      perks: form.perks,
      capKind: form.capKind,
      capCount: Math.max(1, Math.round(numberOf(form.capCount) ?? 1)),
      unlimitedOk: form.unlimitedOk,
      allowedDays: form.allowedDays.length === 0 || form.allowedDays.length === 7 ? null : form.allowedDays,
      seats: form.seats,
      priceMinor: toMinor(form.price) ?? 0,
      billingPeriod: form.billingPeriod,
      intro: form.intro,
      maxValueMinor: toMinor(form.maxValue),
      costPerUseMinor: toMinor(form.costPerUse),
      subscriberCap: cap === null || cap <= 0 ? null : Math.round(cap),
    };
  })();

  const missing = missingFor({
    name: input.name ?? '',
    benefitItem: input.benefitItem ?? null,
    discountPct: input.discountPct ?? null,
    priceMinor: input.priceMinor ?? 0,
    capKind: form.capKind,
    unlimitedOk: form.unlimitedOk,
  });

  /* What the primary press does, by where the pass stands. */
  const isLiveEdit = editing !== null && editing.status !== 'draft';
  const createLocked = locked && editing === null;
  const publishBlocked = missing.length > 0 || (locked && !isLiveEdit);
  const invalid =
    missing.length > 0 ? d.invalid[missing[0]] : locked && !isLiveEdit ? d.invalid.locked : undefined;

  /* A create that succeeded and a publish after it that was refused leaves a
     draft behind; the id is kept so the next press edits that draft rather
     than creating a second one. */
  const createdId = useRef<string | null>(null);
  const write = (publish: boolean) => {
    if (venueId === null) return Promise.reject(NO_VENUE());
    return (async () => {
      const id = editing?.id ?? createdId.current;
      const saved = id ? await updatePass(venueId, id, input) : await createPass(venueId, input);
      createdId.current = saved.id;
      if (publish && saved.status === 'draft') await setPassStatus(venueId, saved.id, 'publish');
    })();
  };
  const primary = () =>
    void run('primary', isLiveEdit ? copy.toasts.updated : copy.toasts.published, () => write(!isLiveEdit));
  const later = () => void run('later', copy.toasts.saved, () => write(false));

  /* The preview's numbers. */
  const priceValue = numberOf(form.price);
  const rule = {
    benefitItem: form.benefitItem.trim() || null,
    discountPct: form.discountOn ? numberOf(form.discountPct) : null,
    capKind: form.capKind,
    capCount: Math.max(1, Math.round(numberOf(form.capCount) ?? 1)),
    allowedDays: form.allowedDays.length ? form.allowedDays : null,
  };
  const priceText = priceValue === null ? '—' : readerMoney(priceValue);

  return (
    <Drawer
      kicker={d.kicker}
      title={editing ? d.editTitle : d.createTitle}
      sub={d.sub}
      onClose={onClose}
      invalid={invalid}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          {!isLiveEdit && (
            <Button variant="secondary" disabled={busy !== null || createLocked} onClick={later}>
              {d.saveLater}
            </Button>
          )}
          <Button variant="primary" disabled={busy !== null || publishBlocked} onClick={primary}>
            {isLiveEdit ? d.save : d.publish}
          </Button>
        </>
      }
    >
      <div className="dx-passes-drawer">
        <PassArt
          size="preview"
          accent={form.accent}
          kicker={copy.templates[form.template].name}
          badge={<span className="dx-passes-preview-chip">{d.preview}</span>}
          name={form.name.trim() || d.previewName}
          tagline={form.tagline.trim() || d.previewTagline}
          price={priceText}
          period={copy.period[form.billingPeriod]}
        />
        <p className="dx-passes-plain">
          {fill(d.plain, {
            benefit: benefitPhrase(copy, rule),
            cap: capPhrase(copy, rule),
            days: daysPhrase(copy, rule.allowedDays),
            amount: priceText,
            period: copy.periodWord[form.billingPeriod],
          })}
        </p>

        <div className="dx-sections">
          {/* 1 · a starting point */}
          <section>
            <h3 className="dx-passes-sec">{d.s1}</h3>
            <div className="dx-passes-tiles">
              {TEMPLATE_ORDER.map((template) => {
                const words = copy.templates[template];
                const example = TEMPLATE_EXAMPLE_PLN_MINOR[template];
                return (
                  <button
                    key={template}
                    type="button"
                    aria-pressed={form.template === template}
                    onClick={() => setForm((f) => withTemplate(f, template))}
                  >
                    <b>{words.name}</b>
                    <span>
                      {example === null
                        ? words.example
                        : fill(words.example, { amount: money(minorToEuro(example, 'PLN'), 'exact') })}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2 · what's included */}
          <section className="dx-passes-stack">
            <h3 className="dx-passes-sec">{d.s2}</h3>
            <Field label={d.item} help={d.itemHelp}>
              <Input
                value={form.benefitItem}
                maxLength={120}
                placeholder={d.itemPlaceholder}
                onChange={(event) => set('benefitItem', event.target.value)}
              />
            </Field>
            <div className="dx-passes-switchrow">
              <Toggle
                checked={form.discountOn}
                onChange={(on) => set('discountOn', on)}
                label={
                  <span className="dx-passes-switchtext">
                    <b>{d.discount}</b>
                    <span>{d.discountHelp}</span>
                  </span>
                }
              />
              {form.discountOn && (
                <div className="dx-passes-pct">
                  <UnitField
                    unit="%"
                    aria-label={d.discount}
                    min={1}
                    max={100}
                    value={form.discountPct}
                    onChange={(event) => set('discountPct', event.target.value)}
                  />
                </div>
              )}
            </div>
            <div>
              <div className="dx-passes-label">{d.perks}</div>
              <div className="dx-passes-chips">
                {PERKS.map((perk) => (
                  <button
                    key={perk}
                    type="button"
                    aria-pressed={form.perks.includes(perk)}
                    onClick={() =>
                      set(
                        'perks',
                        form.perks.includes(perk) ? form.perks.filter((p) => p !== perk) : [...form.perks, perk],
                      )
                    }
                  >
                    {d.perk[perk]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 3 · limits & rules */}
          <section className="dx-passes-stack">
            <h3 className="dx-passes-sec">{d.s3}</h3>
            <div>
              <div className="dx-passes-label">{d.howOften}</div>
              <div className="dx-passes-radios" role="radiogroup" aria-label={d.howOften}>
                {CAP_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={form.capKind === kind}
                    onClick={() => setForm((f) => ({ ...f, capKind: kind, unlimitedOk: false }))}
                  >
                    <i aria-hidden />
                    <span>
                      <b>{d.cap[kind].label}</b>
                      <span>{d.cap[kind].note}</span>
                    </span>
                  </button>
                ))}
              </div>
              {form.capKind !== 'unlimited' && (
                <div className="dx-passes-count">
                  <UnitField
                    unit={d.unit[form.capKind]}
                    aria-label={d.howOften}
                    min={1}
                    max={1000}
                    value={form.capCount}
                    onChange={(event) => set('capCount', event.target.value)}
                  />
                </div>
              )}
              {form.capKind === 'unlimited' && form.benefitItem.trim() !== '' && (
                <div className="dx-passes-warn">
                  <b>{d.unlimitedTitle}</b>
                  <p>{d.unlimitedBody}</p>
                  <div className="dx-passes-warn-acts">
                    <Button
                      variant="primary"
                      onClick={() => setForm((f) => ({ ...f, capKind: 'per_day', capCount: '1', unlimitedOk: false }))}
                    >
                      {d.addCap}
                    </Button>
                    <Button
                      variant="small"
                      aria-pressed={form.unlimitedOk}
                      onClick={() => set('unlimitedOk', true)}
                    >
                      {form.unlimitedOk && <DxIcon name="check" size={13} strokeWidth={2.4} />}
                      {d.keepUnlimited}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="dx-passes-label">{d.days}</div>
              <div className="dx-passes-chips">
                {d.dayNames.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={form.allowedDays.includes(day)}
                    onClick={() =>
                      set(
                        'allowedDays',
                        form.allowedDays.includes(day)
                          ? form.allowedDays.filter((x) => x !== day)
                          : [...form.allowedDays, day].sort((a, b) => a - b),
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="dx-passes-help">{form.allowedDays.length ? d.daysSome : d.daysAny}</p>
            </div>
            <div className="dx-passes-pair">
              <Field label={d.maxValue} help={d.maxValueHelp}>
                <UnitField
                  unit={reader.symbol}
                  min={0}
                  step="0.01"
                  value={form.maxValue}
                  onChange={(event) => set('maxValue', event.target.value)}
                />
              </Field>
              <div className="dx-field">
                <span className="dx-field-label">{d.seats}</span>
                <Segmented
                  label={d.seats}
                  value={form.seats > 1 ? 'family' : 'one'}
                  onChange={(value) => set('seats', value === 'family' ? FAMILY_SEATS : 1)}
                  options={[
                    { value: 'one', label: d.seatsOne },
                    { value: 'family', label: d.seatsFamily },
                  ]}
                />
                <span className="dx-field-help">
                  {form.seats > 1 ? fill(d.seatsFamilyNote, { n: String(FAMILY_SEATS) }) : d.seatsOneNote}
                </span>
              </div>
            </div>
          </section>

          {/* 4 · price & billing, then the sense check */}
          <section className="dx-passes-stack">
            <h3 className="dx-passes-sec">{d.s4}</h3>
            <div className="dx-passes-row">
              <Field label={d.price}>
                <UnitField
                  unit={reader.symbol}
                  min={0}
                  step="0.01"
                  value={form.price}
                  invalid={missing.includes('price') && form.price !== ''}
                  onChange={(event) => set('price', event.target.value)}
                />
              </Field>
              <div className="dx-field">
                <span className="dx-field-label">{d.billed}</span>
                <Segmented
                  label={d.billed}
                  value={form.billingPeriod}
                  onChange={(value) => set('billingPeriod', value)}
                  options={PERIODS.map((period) => ({ value: period, label: d.periods[period] }))}
                />
              </div>
            </div>
            <div className="dx-passes-pair">
              <Field label={d.intro}>
                <Select value={form.intro} onChange={(event) => set('intro', event.target.value as PassIntro)}>
                  {INTROS.map((intro) => (
                    <option key={intro} value={intro}>
                      {d.intros[intro]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={d.subCap} help={d.subCapHelp}>
                <UnitField
                  unit={d.subCapUnit}
                  min={0}
                  placeholder="0"
                  value={form.subscriberCap}
                  onChange={(event) => set('subscriberCap', event.target.value)}
                />
              </Field>
            </div>
            <Economics form={form} rule={rule} readerMoney={readerMoney} onCost={(v) => set('costPerUse', v)} />
          </section>

          {/* 5 · branding */}
          <section className="dx-passes-stack">
            <h3 className="dx-passes-sec">{d.s5}</h3>
            <Field label={d.name} error={form.name.trim() ? undefined : d.nameError}>
              <Input
                value={form.name}
                maxLength={60}
                placeholder={d.namePlaceholder}
                onChange={(event) => set('name', event.target.value)}
              />
            </Field>
            <Field label={d.tagline}>
              <Input
                value={form.tagline}
                maxLength={120}
                placeholder={d.taglinePlaceholder}
                onChange={(event) => set('tagline', event.target.value)}
              />
            </Field>
            <div>
              <div className="dx-passes-label">{d.accent}</div>
              <div className="dx-passes-swatches" role="radiogroup" aria-label={d.accent}>
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    role="radio"
                    aria-checked={form.accent === accent}
                    aria-label={d.accents[accent]}
                    title={d.accents[accent]}
                    data-accent={accent}
                    onClick={() => set('accent', accent)}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* 6 · get paid — the honest version: there is no rail to connect. */}
          <section className="dx-passes-stack">
            <h3 className="dx-passes-sec">{d.s6}</h3>
            <div className="dx-passes-payout">
              <span className="dx-passes-payout-ico" aria-hidden>
                <DxIcon name="card" size={18} />
              </span>
              <div>
                <b>{d.payoutTitle}</b>
                <p>{d.payoutBody}</p>
              </div>
            </div>
            <p className="dx-passes-help">{d.payoutFoot}</p>
          </section>
        </div>
      </div>
    </Drawer>
  );
}

/**
 * "Does this make sense?" — the owner's own cost against the price, at the
 * heaviest use the rule allows. Every number in it is either typed in this
 * drawer or read off the rule; the panel is arithmetic on the owner's inputs,
 * not a measurement, and it says nothing until a cost per use is given.
 */
function Economics({
  form,
  rule,
  readerMoney,
  onCost,
}: {
  form: Form;
  rule: { capKind: CapKind; capCount: number; allowedDays: number[] | null };
  readerMoney: (value: number, round?: 'exact' | 'unit') => string;
  onCost: (value: string) => void;
}) {
  const copy = useCopy().dashboard.passes;
  const d = copy.drawer;
  const reader = useCurrency();

  const daysAWeek = rule.allowedDays?.length || 7;
  const daysAMonth = Math.round((daysAWeek * 30) / 7);
  const uses =
    rule.capKind === 'per_day'
      ? rule.capCount * daysAMonth
      : rule.capKind === 'per_week'
        ? Math.round(rule.capCount * (30 / 7))
        : rule.capKind === 'per_month'
          ? rule.capCount
          : daysAMonth;

  const price = numberOf(form.price);
  const cost = numberOf(form.costPerUse);
  const perMonth = price === null ? null : price / PERIOD_MONTHS[form.billingPeriod];
  const spend = cost === null ? null : uses * cost;
  const loss = perMonth !== null && spend !== null && spend > perMonth;

  const text =
    perMonth === null || spend === null
      ? d.econNoCost
      : fill(loss ? d.econLoss : d.econMargin, {
          cap: capPhrase(copy, rule),
          n: String(uses),
          cost: readerMoney(spend),
          price: readerMoney(perMonth),
          gap: readerMoney(Math.abs(perMonth - spend)),
        });

  return (
    <div className="dx-passes-econ" data-loss={loss ? 'true' : undefined}>
      <span className="dx-passes-econ-title">{d.econTitle}</span>
      <p>{text}</p>
      <label className="dx-passes-econ-cost">
        <span>{d.econCost}</span>
        <UnitField
          unit={reader.symbol}
          min={0}
          step="0.01"
          value={form.costPerUse}
          onChange={(event) => onCost(event.target.value)}
        />
      </label>
    </div>
  );
}
