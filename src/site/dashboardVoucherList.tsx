/**
 * The partner dashboard's **Issued vouchers** screen — the register.
 *
 * ## Why this is a second voucher screen and not more panels on the first
 *
 * `dashboardVouchers.tsx` is the **ladder**: what is on offer, what each rung
 * costs a customer in points, and the pool behind it. It answers "what am I
 * selling". This screen answers "what was taken" — every voucher that exists,
 * who holds it, when it lapses, whether it was spent — and until it existed
 * that question had no screen at all. An owner could configure a discount and
 * then had no way to see one being used.
 *
 * They are not one screen because they are not one job. The ladder is a form
 * somebody edits on the day they set their prices; the register is a list they
 * read on the day a customer asks "is this code still good". Folding the second
 * into the first would put a two-hundred-row table under a pricing form.
 *
 * ## The caps live here, beside the count they bound
 *
 * `redeem_limit` and `per_user_limit` are the other half of item 21, and the
 * control for them is on this screen rather than on the ladder for one reason:
 * a cap is only meaningful next to how much of it is used. "20" in a field
 * tells an owner nothing; "18 of 20" with a bar under it tells them the offer
 * stops this week. `.pd-limit` is the component that already says exactly that
 * for a hot deal's claim cap — the same fact one table over, so the same
 * component rather than a second one that looks like it.
 *
 * **`null` is a value here, and it is the whole reason the fields behave oddly.**
 * Three states have to be distinguishable and the API keeps them apart:
 * `undefined` is a server that predates the columns (the em-dash case every
 * optional field on `BudgetBody` describes), `null` is a rung nobody has
 * capped, and a number is a cap. Emptying a field means `null` — remove the cap
 * — and it is sent as null explicitly, because a rung sent *without* the key
 * keeps whatever cap it has. That asymmetry is deliberate on the server
 * (`setVoucherTiers` upserts the whole row), and it is what lets the ladder
 * editor on the other screen save a price without silently clearing a cap.
 *
 * ## What is a fact and what is a field
 *
 * Every figure except the two caps is a fact, and the honesty rule this
 * dashboard states elsewhere is why: nothing on the server sets a voucher's
 * status, its code, its window or its holder from here. A voucher is cancelled
 * by nobody — the status exists in the schema and no endpoint writes it — so
 * there is no bin at the head of a row. A control with nothing behind it is not
 * drawn.
 *
 * The one thing drawn as neither is `holder === null`, which is **"we are not
 * telling you"** rather than "an anonymous customer": it is the §1.4 sharing
 * grant, which the customer gives on the venue's own sheet and can withdraw
 * afterwards. It takes `.pd-withheld`, the same faint em dash a suppressed
 * metric takes, because the one thing a withheld value must not look like is a
 * real one.
 *
 * ## The status a row shows is the stored one
 *
 * An `active` voucher whose `expiresAt` is in the past is possible and is drawn
 * that way. `expireVouchers` is a scheduled sweep, not a read-time derivation,
 * and the difference is money: until the sweep runs, that voucher's reserve is
 * still set aside in the pool. A screen that quietly relabelled it "expired"
 * would be disagreeing with the budget on the screen before it.
 */

import { useCallback, useMemo, useState } from "react";

import {
  setVoucherTiers,
  usePartnerVenue,
  usePartnerVenueId,
  usePartnerVouchers,
  type PartnerVoucher,
  type TierDraft,
  type VoucherRegister,
} from "./api/partner";
import { DEMO_REGISTER } from "./dashboardDemo";
import { useNum, useVenueDates } from "./dashboardFormat";
import { Screen } from "./dashboardScreens";
import { useDashboard } from "./dashboardShell";
import { NumberWell } from "./dashboardControls";
import { useCopy } from "./i18n/context";
import { fill } from "./i18n/currency";

/** The four `issued_vouchers` statuses, plus the word for "do not filter". */
const FILTERS = ["all", "active", "redeemed", "expired", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * A rung's cap as it is being edited.
 *
 * `undefined` is "not touched", which is what keeps a save from writing a cap
 * onto a rung the owner did not edit — the route reads absent as "leave it
 * alone". `null` is an emptied field, which removes the cap.
 */
type CapDraft = Record<
  string,
  { redeemLimit?: number | null; perUserLimit?: number | null }
>;

/**
 * One cap: a number, and a way to take it off again.
 *
 * The second half is why this is a component rather than a bare `NumberWell`.
 * That control deliberately does **not** report an empty box — "", a lone minus
 * and a trailing point are all halfway to a number rather than a number, and
 * `Number` turns two of the three into 0 silently, which on the budget editor
 * it also serves would be a venue setting its month to nothing by
 * backspacing. So an emptied field cannot be the "no limit" gesture, and
 * without a control of its own a cap could be set and never removed.
 *
 * It is a link rather than a switch, and it is drawn **only when there is a cap
 * to remove** — a control whose only outcome is the state already on screen is
 * a control that exists to fail. Zero is not the gesture either: the route
 * refuses a cap of zero by name, because a rung nobody may buy from is
 * `active: false` and says so on the screen.
 */
function Cap({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const copy = useCopy().dashboard.register;

  return (
    <div className="pd-progress">
      <NumberWell
        label={label}
        unit={copy.caps.unit}
        min={1}
        step={1}
        value={value}
        onChange={(next) =>
          onChange(Number.isFinite(next) && next > 0 ? next : null)
        }
      />
      {value === null ? (
        <span className="pd-fine">{copy.caps.noLimit}</span>
      ) : (
        <button type="button" className="link-btn" onClick={() => onChange(null)}>
          {copy.caps.remove}
        </button>
      )}
    </div>
  );
}

/** Totals across the venue's whole life — not the page, which is capped. */
function Totals({ totals }: { totals: VoucherRegister["totals"] }) {
  const copy = useCopy().dashboard.register;
  const num = useNum();

  const tiles: Array<[string, number]> = [
    [copy.totals.issued, totals.issued],
    [copy.totals.active, totals.active],
    [copy.totals.redeemed, totals.redeemed],
    [copy.totals.expired, totals.expired],
  ];

  return (
    <div className="pd-glass pd-panel" data-reveal>
      <div className="pd-tiles">
        {tiles.map(([label, value]) => (
          <div className="pd-tile" key={label}>
            <span>{label}</span>
            <div className="pd-tile-body">
              <div>
                <b>{num(value)}</b>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* The one actionable figure, and it is a sentence rather than a fifth
          tile because it is only worth saying when it is not zero: a reminder
          can still reach the people holding these, and cannot reach anybody
          whose voucher has already lapsed. */}
      {totals.lapsing > 0 && (
        <p className="pd-fine">
          {fill(copy.totals.lapsing, { n: num(totals.lapsing) })}
        </p>
      )}
    </div>
  );
}

/**
 * The caps, one row per rung, with how much of each is used.
 *
 * Saved as one write rather than one per rung: `PUT …/tiers` takes the list,
 * and two rungs edited in one sitting are one decision about an offer.
 */
function Caps({
  tiers,
  reload,
}: {
  tiers: VoucherRegister["tiers"];
  reload: () => void;
}) {
  const copy = useCopy().dashboard.register;
  const dashboard = useCopy().dashboard;
  const num = useNum();
  const venueId = usePartnerVenueId();
  const { toast } = useDashboard();
  const [draft, setDraft] = useState<CapDraft>({});
  const [saving, setSaving] = useState(false);

  const id = venueId.state.status === "ready" ? venueId.state.data : null;

  /* A retired rung is listed by the server while vouchers bought on it are
     still out, and its caps must not be editable: saving one would send
     `active` and put it back on sale. It is shown, read-only, because the
     vouchers it issued are in the register below. */
  const editable = tiers.filter((tier) => tier.active !== false);

  const capOf = (
    tierId: string,
    which: "redeemLimit" | "perUserLimit",
    stored: number | null,
  ) => {
    const touched = draft[tierId]?.[which];
    return touched === undefined ? stored : touched;
  };

  const edit = (
    tierId: string,
    which: "redeemLimit" | "perUserLimit",
    next: number | null,
  ) =>
    setDraft((current) => ({
      ...current,
      [tierId]: { ...current[tierId], [which]: next },
    }));

  const dirty = Object.keys(draft).length > 0;

  const save = useCallback(() => {
    if (id === null || !dirty) return;
    setSaving(true);
    /* Only the rungs that were touched, and on each of those only the fields
       that were: a rung sent without a cap key keeps the cap it has, which is
       what stops this write from being an edit of the whole ladder. */
    const rungs: TierDraft[] = editable
      .filter((tier) => draft[tier.id] !== undefined)
      .map((tier) => ({
        discountPct: tier.discountPct,
        pointsCost: tier.pointsCost,
        maxDiscountMinor: tier.maxDiscountMinor,
        ...draft[tier.id],
      }));
    setVoucherTiers(id, rungs)
      .then(() => {
        setDraft({});
        toast(copy.caps.saved);
        reload();
      })
      .catch((error: unknown) =>
        toast(
          fill(dashboard.acts.refused, {
            why: error instanceof Error ? error.message : String(error),
          }),
        ),
      )
      .finally(() => setSaving(false));
  }, [
    id,
    dirty,
    editable,
    draft,
    toast,
    copy.caps.saved,
    dashboard.acts.refused,
    reload,
  ]);

  return (
    <div className="pd-glass pd-panel" data-reveal>
      <div className="pd-panel-head">
        <div>
          <span className="pd-kicker">{copy.caps.kicker}</span>
          <h2>{copy.caps.title}</h2>
        </div>
      </div>
      <p className="pd-fine">{copy.caps.lede}</p>

      {tiers.map((tier) => {
        const total = capOf(tier.id, "redeemLimit", tier.redeemLimit ?? null);
        const perUser = capOf(
          tier.id,
          "perUserLimit",
          tier.perUserLimit ?? null,
        );
        /* The lifetime count, which is what a cap is measured against — not
           `issuedCount`, which is this month's and sits under this month's
           pool. Absent means an API that predates the column, so the count is
           withheld rather than shown as nought. */
        const taken = tier.issuedTotal;
        const locked = tier.active === false;

        return (
          <div className="pd-rung" key={tier.id}>
            <div>
              <b>{fill(copy.caps.rung, { pct: String(tier.discountPct) })}</b>
              {/* "18 of 20" and a bar, or the count on its own when there is no
                  cap to fill — the same distinction `.pd-limit` draws for a hot
                  deal, whose comment in `site.css` says why. */}
              {taken === undefined ? (
                <em
                  className="pd-withheld"
                  title={dashboard.unmeasured.withheld}
                >
                  —
                </em>
              ) : total === null ? (
                <em>{fill(copy.caps.takenNoCap, { n: num(taken) })}</em>
              ) : (
                <span className="pd-limit">
                  <i>
                    {/* `em` and not `b`: `.pd-limit` had two fill rules in
                        `site.css`, one per element, so a new caller was picking
                        by coin flip. The deals table's claim bar is the other
                        caller and it writes `em`, so that is the one that
                        stayed. */}
                    <em
                      style={{
                        width: `${Math.min(100, (taken / total) * 100)}%`,
                      }}
                    />
                  </i>
                  <span className="pd-fine">
                    {fill(copy.caps.taken, {
                      n: num(taken),
                      total: num(total),
                    })}
                  </span>
                </span>
              )}
            </div>

            {locked ? (
              <span className="pd-state-pill" data-state="paused">
                {copy.caps.retired}
              </span>
            ) : (
              <>
                <Cap
                  label={copy.caps.total}
                  value={total}
                  onChange={(next) => edit(tier.id, "redeemLimit", next)}
                />
                <Cap
                  label={copy.caps.perUser}
                  value={perUser}
                  onChange={(next) => edit(tier.id, "perUserLimit", next)}
                />
              </>
            )}
          </div>
        );
      })}

      <p className="pd-fine">{copy.caps.noLimitNote}</p>

      <div className="pd-actions">
        <button
          type="button"
          className="btn btn-solid"
          disabled={!dirty || saving || id === null}
          onClick={save}
        >
          {saving ? copy.caps.saving : copy.caps.save}
        </button>
      </div>
    </div>
  );
}

/** One row of the register. */
function Row({
  voucher,
  day,
}: {
  voucher: PartnerVoucher;
  /* Handed in rather than made here: one formatter for the whole table, on the
     venue's clock — see `IssuedVouchers`. */
  day: (iso: string) => string;
}) {
  const copy = useCopy().dashboard.register;

  return (
    <tr>
      <td>
        <span className="pd-code">{voucher.code}</span>
      </td>
      <td>
        <b>{fill(copy.caps.rung, { pct: String(voucher.discountPct) })}</b>
      </td>
      <td>
        {voucher.holder === null ? (
          <span className="pd-withheld" title={copy.table.withheld}>
            —
          </span>
        ) : (
          voucher.holder
        )}
      </td>
      {/* The window, both ends, because either one alone answers half the
          question a cashier is asking. */}
      <td data-quiet="true">{day(voucher.issuedAt)}</td>
      <td data-quiet="true">{day(voucher.expiresAt)}</td>
      <td>
        <span className="pd-state-pill" data-state={voucher.status}>
          {copy.status[voucher.status]}
        </span>
      </td>
      {/* The redemption itself — the date it was spent, or nothing, because a
          voucher nobody has used has no history to show and an em dash here
          would read as a figure we failed to read. */}
      <td data-align="right" data-quiet="true">
        {voucher.redeemedAt === null ? (
          <span className="pd-fine">{copy.table.notRedeemed}</span>
        ) : (
          day(voucher.redeemedAt)
        )}
      </td>
    </tr>
  );
}

/**
 * The list itself — and it takes its rows as a **prop**.
 *
 * Not a `useMemo` over the hook's state inside the page, which is what this was
 * and which was wrong in exactly one case: under `?demo=1` the real call has
 * failed, so `state.status` is `'error'` and `Screen` substitutes the demo body
 * — a filter reading the hook saw no rows and drew an empty table under a
 * populated pair of panels. The data the render function is handed is the only
 * thing on this screen that is true in both cases.
 */
function Register({
  vouchers,
  day,
}: {
  vouchers: PartnerVoucher[];
  day: (iso: string) => string;
}) {
  const copy = useCopy().dashboard.register;
  const num = useNum();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  /* Filtered here rather than by re-asking the server: the register is one page
     of at most two hundred rows and it is already in hand, so a status press
     that went back to the API would be a spinner over a list that has not
     changed. The endpoint takes both filters for the same reason it takes a
     limit — a venue with thousands of vouchers is a different screen. */
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return vouchers.filter(
      (voucher) =>
        (filter === "all" || voucher.status === filter) &&
        (needle === "" ||
          voucher.code.toLowerCase().includes(needle) ||
          (voucher.holder ?? "").toLowerCase().includes(needle)),
    );
  }, [vouchers, filter, search]);

  return (
    <div className="pd-glass pd-panel" data-solid="true" data-reveal>
      <div className="pd-panel-head">
        <div>
          <span className="pd-kicker">{copy.list.kicker}</span>
          <h2>{copy.list.title}</h2>
        </div>
      </div>

      <div className="pd-toolbar">
        <label className="pd-search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={search}
            placeholder={copy.list.search}
            aria-label={copy.list.search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="pd-seg">
          {FILTERS.map((which) => (
            <button
              key={which}
              type="button"
              data-on={which === filter ? "true" : undefined}
              onClick={() => setFilter(which)}
            >
              {which === "all" ? copy.status.all : copy.status[which]}
            </button>
          ))}
        </div>

        <span className="pd-count">
          {fill(copy.list.count, {
            n: num(shown.length),
            total: num(vouchers.length),
          })}
        </span>
      </div>

      {vouchers.length === 0 ? (
        /* Two different nothings, and they are two sentences. A venue
                 whose customers have never bought a voucher needs to be told
                 what would make one appear; a filter that matches nothing needs
                 to be told it is the filter. */
        <p className="pd-fine">{copy.list.empty}</p>
      ) : shown.length === 0 ? (
        <p className="pd-fine">{copy.list.emptyFiltered}</p>
      ) : (
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th>{copy.table.code}</th>
                <th>{copy.table.rung}</th>
                <th>{copy.table.holder}</th>
                <th>{copy.table.issued}</th>
                <th>{copy.table.expires}</th>
                <th>{copy.table.status}</th>
                <th data-align="right">{copy.table.redeemed}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((voucher) => (
                <Row key={voucher.id} voucher={voucher} day={day} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function IssuedVouchers() {
  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === "ready" ? venueApi.state.data : null;
  const register = usePartnerVouchers(venue?.id ?? null);
  /*
   * One date formatter for the table, on the **venue's** clock.
   *
   * `useVenueDates` rather than an `Intl.DateTimeFormat` of this screen's own,
   * which is what this had and which is exactly the formatting inconsistency
   * item 22 is about: the same kind of value written two ways in one product.
   * The zone matters here for the reason it matters in the till log — which day
   * a voucher is "good until" depends on whose midnight, and the answer is the
   * counter that honours it rather than the browser reading the report.
   */
  const dates = useVenueDates(venue?.timezone ?? null);

  return (
    /* `demo` is the same fallback every other report screen carries, and it
       carries the same three conditions: the real call is made and allowed to
       fail first, the failure has to be *no session*, and `?demo=1` has to have
       been passed. A venue with a listing never reaches it. */
    <Screen state={register.state} index={4} demo={DEMO_REGISTER}>
      {(data) => (
        <div className="pd-stack">
          <Totals totals={data.totals} />
          <Caps tiers={data.tiers} reload={register.reload} />
          <Register vouchers={data.vouchers} day={dates.day} />
        </div>
      )}
    </Screen>
  );
}
