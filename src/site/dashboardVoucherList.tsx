/**
 * The partner dashboard's **Voucher activity** screen — the register, in v3's
 * dress (spec §3.9). Styles are `dashboard-vlog.css`, `dx-vlog-*` plus the kit.
 *
 * ## Why this is a second voucher screen and not more panels on the first
 *
 * `dashboardVouchers.tsx` is the **ladder**: what is on offer, what each rung
 * costs in points, the pool behind it and the caps on it. It answers "what am I
 * selling". This screen answers "what was taken" — every voucher that exists,
 * who holds it, when it lapses, whether it was spent. The caps used to live
 * here and moved to the ladder with v3, which draws this screen as a plain log;
 * "Voucher settings" in the head is the way there.
 *
 * ## Three figures, and where each comes from
 *
 * The three cards are the server's **lifetime** totals, counted in one query
 * rather than summed off the page — the page is capped at two hundred rows, and
 * a total computed from a page is a total that changes when the list grows. The
 * sums under them (set aside, given away, returned) come from the same query;
 * an API that predates them sends none, and the card then says the count alone.
 * The filter chips count the rows **in hand**, because they filter the rows in
 * hand: a chip promising 401 over a list showing nine would be the lie. When the
 * page is shorter than the total, the line on the right says "latest n of m".
 *
 * ## What is drawn as neither a figure nor a gap
 *
 * `holder === null` is **"we are not telling you"** rather than "an anonymous
 * customer": it is the §1.4 sharing grant, which the customer gives on the
 * venue's own sheet and can withdraw afterwards. It is written as such, with
 * the reason in its `title`, because the one thing a withheld value must not
 * look like is a real one.
 *
 * ## The status a row shows is the stored one
 *
 * An `active` voucher whose `expiresAt` is in the past is possible and is drawn
 * that way. `expireVouchers` is a scheduled sweep, not a read-time derivation,
 * and the difference is money: until the sweep runs, that voucher's reserve is
 * still set aside in the pool. Relabelling it "expired" here would disagree
 * with the budget on the screen next door.
 *
 * Nothing on a row is a control: no endpoint cancels, extends or reassigns a
 * voucher, so there is no bin at the head of one.
 */

import { useMemo, useState } from 'react';

import { ApiError } from './api/client';
import {
  exportCsv,
  minorToEuro,
  usePartnerVenue,
  usePartnerVouchers,
  type PartnerVoucher,
  type VoucherRegister,
} from './api/partner';
import { DEMO_REGISTER } from './dashboardDemo';
import { useNum, useVenueDates } from './dashboardFormat';
import { Button, Callout, Card, EmptyState, PageHead, Pill } from './dashboardKit';
import { initialsOf } from './dashboardKitHooks';
import { Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';

import './dashboard-vlog.css';

/** The four `issued_vouchers` statuses, plus the word for "do not filter". */
const FILTERS = ['all', 'active', 'redeemed', 'expired', 'cancelled'] as const;
type Filter = (typeof FILTERS)[number];

const PILL: Record<PartnerVoucher['status'], 'active' | 'ended' | 'down'> = {
  active: 'active',
  redeemed: 'ended',
  expired: 'down',
  cancelled: 'ended',
};

/**
 * Export the month, the frame's own button for a screen that draws its own
 * head. The same three endings as the frame's: the file, a plan that does not
 * include it, and a server that is not there.
 */
function ExportButton() {
  const copy = useCopy().dashboard;
  const { toast, venueId } = useDashboard();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    if (venueId === null) {
      toast(copy.drawer.deal.needsSession);
      return;
    }
    setBusy(true);
    try {
      const file = await exportCsv(venueId);
      /* A blob and a synthetic click: the CSV arrives in the body, not at a URL. */
      const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast(copy.actions.exported);
    } catch (cause) {
      toast(
        cause instanceof ApiError && cause.status === 403
          ? copy.acts.exportLocked
          : cause instanceof ApiError && cause.status === 0
            ? copy.acts.offline
            : fill(copy.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" icon="download" disabled={busy} onClick={() => void download()}>
      {copy.actions.exportCsv}
    </Button>
  );
}

/** The three v3 stat cards, each with its 34×3 rule in the colour of its status. */
function Stats({ totals, toMoney }: { totals: VoucherRegister['totals']; toMoney: (minor: number) => string | null }) {
  const copy = useCopy().dashboard.register.log;
  const num = useNum();

  /* A sum is drawn only when both the server sent it and there is a currency
     to read it in; otherwise the card says the count and stops. */
  const note = (minor: number | undefined, sentence: string) => {
    if (minor === undefined) return null;
    const amount = toMoney(minor);
    return amount === null ? null : fill(sentence, { amount });
  };

  const cards: Array<{ tone: 'active' | 'redeemed' | 'expired'; label: string; value: number; note: string | null }> = [
    { tone: 'active', label: copy.active, value: totals.active, note: note(totals.activeReservedMinor, copy.activeNote) },
    { tone: 'redeemed', label: copy.redeemed, value: totals.redeemed, note: note(totals.redeemedSpentMinor, copy.redeemedNote) },
    { tone: 'expired', label: copy.expired, value: totals.expired, note: note(totals.expiredReleasedMinor, copy.expiredNote) },
  ];

  return (
    <div className="dx-vlog-stats">
      {cards.map((card) => (
        <Card key={card.tone} className="dx-vlog-stat">
          <i data-tone={card.tone} aria-hidden />
          <span>{card.label}</span>
          <b>{num(card.value)}</b>
          {card.note !== null && <p>{card.note}</p>}
        </Card>
      ))}
    </div>
  );
}

/** One row of the register. */
function Row({
  voucher,
  day,
  toMoney,
}: {
  voucher: PartnerVoucher;
  day: (iso: string) => string;
  toMoney: (minor: number) => string | null;
}) {
  const register = useCopy().dashboard.register;
  const copy = register.log;

  /* What the row is worth, by what happened to it: an unused voucher may take
     *up to* its reserve off a bill, a redeemed one took what it took, an expired
     one handed its reserve back. A cancelled voucher was neither, and nothing
     writes that status today, so it shows no figure. */
  const value =
    voucher.status === 'active'
      ? toMoney(voucher.reservedMinor)
      : voucher.status === 'redeemed'
        ? toMoney(voucher.spentMinor)
        : voucher.status === 'expired'
          ? toMoney(voucher.reservedMinor)
          : null;

  const closed =
    voucher.status === 'active'
      ? fill(copy.expires, { date: day(voucher.expiresAt) })
      : voucher.status === 'redeemed'
        ? fill(copy.used, { date: day(voucher.redeemedAt ?? voucher.expiresAt) })
        : voucher.status === 'expired'
          ? fill(copy.expiredOn, { date: day(voucher.expiresAt) })
          : copy.cancelled;

  return (
    <tr>
      <td>
        <code className="dx-vlog-code">{voucher.code}</code>
        <span className="dx-vlog-sub">{copy.kind}</span>
      </td>
      <td>
        <span className="dx-vlog-who">
          <span className="dx-vlog-avatar" aria-hidden>
            {voucher.holder === null ? '—' : initialsOf(voucher.holder)}
          </span>
          {voucher.holder === null ? (
            <span className="dx-vlog-withheld" title={register.table.withheld}>
              {copy.notShared}
            </span>
          ) : (
            <b>{voucher.holder}</b>
          )}
        </span>
      </td>
      <td>
        <span className="dx-vlog-reward">{fill(register.caps.rung, { pct: String(voucher.discountPct) })}</span>
      </td>
      <td>
        <Pill tone={PILL[voucher.status]} size="sm">
          {register.status[voucher.status]}
        </Pill>
      </td>
      <td data-align="right">
        {value === null ? (
          <span className="dx-vlog-none">—</span>
        ) : voucher.status === 'active' ? (
          fill(copy.upTo, { amount: value })
        ) : (
          value
        )}
      </td>
      <td>
        <span className="dx-vlog-date">{fill(copy.issued, { date: day(voucher.issuedAt) })}</span>
        <span className="dx-vlog-date" data-tone={voucher.status === 'expired' ? 'down' : undefined}>
          {closed}
        </span>
      </td>
    </tr>
  );
}

/**
 * The list — and it takes its rows as a **prop**, the data `Screen` handed
 * over, which is the only thing true both for a live venue and under `?demo=1`
 * (where the hook's own state is the failed call the demo stands in for).
 */
function Register({
  register,
  day,
  toMoney,
}: {
  register: VoucherRegister;
  day: (iso: string) => string;
  toMoney: (minor: number) => string | null;
}) {
  const copy = useCopy().dashboard.register;
  const num = useNum();
  const [filter, setFilter] = useState<Filter>('all');

  /* Newest first, as the server sends them; sorted again so the order is the
     screen's promise rather than the payload's. */
  const rows = useMemo(
    () => [...register.vouchers].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    [register.vouchers],
  );
  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: rows.length, active: 0, redeemed: 0, expired: 0, cancelled: 0 };
    for (const row of rows) out[row.status] += 1;
    return out;
  }, [rows]);
  const shown = filter === 'all' ? rows : rows.filter((row) => row.status === filter);

  /* Cancelled is a status the schema holds and nothing writes, so its chip only
     appears on the day a row carries it. */
  const filters = FILTERS.filter((which) => which !== 'cancelled' || counts.cancelled > 0);
  const lifetime = register.totals.issued + counts.cancelled;

  return (
    <Card pad="none" className="dx-vlog-card">
      <div className="dx-vlog-bar">
        <div className="dx-vlog-chips" role="group" aria-label={copy.log.filter}>
          {filters.map((which) => (
            <button
              key={which}
              type="button"
              aria-pressed={which === filter}
              onClick={() => setFilter(which)}
            >
              {copy.status[which]}
              <span>{num(counts[which])}</span>
            </button>
          ))}
        </div>
        <span className="dx-vlog-count">
          {rows.length < lifetime
            ? fill(copy.log.latest, { n: num(rows.length), total: num(lifetime) })
            : fill(copy.log.count, { n: num(shown.length) })}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="dx-vlog-empty">{copy.list.emptyFiltered}</p>
      ) : (
        <div className="dx-vlog-scroll">
          <table className="dx-vlog-table" aria-label={copy.list.title}>
            <thead>
              <tr>
                <th scope="col">{copy.log.columns.voucher}</th>
                <th scope="col">{copy.log.columns.customer}</th>
                <th scope="col">{copy.log.columns.reward}</th>
                <th scope="col">{copy.log.columns.status}</th>
                <th scope="col" data-align="right">
                  {copy.log.columns.value}
                </th>
                <th scope="col">{copy.log.columns.closed}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((voucher) => (
                <Row key={voucher.id} voucher={voucher} day={day} toMoney={toMoney} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="dx-vlog-foot">{copy.log.foot}</p>
    </Card>
  );
}

function Activity({ register }: { register: VoucherRegister }) {
  const copy = useCopy().dashboard;
  const { venue, goTo } = useDashboard();
  const money = useMoney();
  const num = useNum();
  /* One date formatter for the table, on the **venue's** clock: which day a
     voucher is "good until" depends on whose midnight, and the answer is the
     counter that honours it rather than the browser reading the report. */
  const dates = useVenueDates(venue?.timezone ?? null);

  /* Minor units of the venue's currency into the reader's. The register says
     which currency it counted in; an older API does not, and then the venue
     row does; with neither there is nothing honest to convert and the figure is
     left out rather than guessed. */
  const currency = register.currency ?? venue?.currency ?? null;
  const toMoney = (minor: number) => (currency === null ? null : money(minorToEuro(minor, currency), 'exact'));

  if (register.vouchers.length === 0) {
    const empty = copy.empty.voucherActivity;
    /* The one press is a real destination: nothing appears here until the
       ladder is open, and the ladder is the Vouchers screen. */
    return (
      <EmptyState
        icon="receipt"
        title={empty.title}
        body={empty.body}
        action={{ label: empty.action, onClick: () => goTo('vouchers') }}
      />
    );
  }

  return (
    <div className="dx-vlog">
      <Stats totals={register.totals} toMoney={toMoney} />
      {/* The one figure here anybody can act on, and only worth saying when it
          is not zero: a reminder can still reach these holders. */}
      {register.totals.lapsing > 0 && (
        <Callout tone="mint">
          <p className="dx-vlog-lapsing">{fill(copy.register.totals.lapsing, { n: num(register.totals.lapsing) })}</p>
        </Callout>
      )}
      <Register register={register} day={dates.day} toMoney={toMoney} />
    </div>
  );
}

export function IssuedVouchers() {
  const copy = useCopy().dashboard;
  const { goTo } = useDashboard();
  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const register = usePartnerVouchers(venue?.id ?? null);
  const screen = copy.screens.voucherActivity;

  return (
    <>
      <PageHead
        title={screen.name}
        subtitle={screen.lede}
        actions={
          <>
            <ExportButton />
            {/* v3's primary here goes to the Vouchers screen, where the budget,
                the ladder and the caps are — a navigation, so it always works. */}
            <Button variant="primary" icon="plus" onClick={() => goTo('vouchers')}>
              {copy.register.log.settings}
            </Button>
          </>
        }
      />
      {/* `demo` carries the same three conditions every report screen's does:
          the real call fails first, the failure is *no session*, and `?demo=1`
          was passed. A venue with a listing never reaches it. */}
      <Screen state={register.state} id="voucherActivity" demo={DEMO_REGISTER}>
        {(data) => <Activity register={data} />}
      </Screen>
    </>
  );
}
