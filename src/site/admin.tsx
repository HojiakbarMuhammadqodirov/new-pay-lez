import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ADMIN_TABS, BUSINESS_CATEGORIES } from './content';
import { ServiceAnalytics } from './adminAnalytics';
import { AdminPeople } from './adminPeople';
import { AdminMessages } from './adminMessages';
import { AdminWebsite } from './adminWebsite';
import { categoryLabel, initialOf, type AdminVenueRow } from './adminMetrics';
import { ThemeToggle } from './Header';
import { Icon } from './icons';
import { useCopy, useLanguage } from './i18n/context';
import { CURRENCIES, fill } from './i18n/currency';
import { useAuth } from './auth/context';
import { Face } from './auth/Avatar';
import { useApi, type ApiResult } from './api/useApi';
import { faceValue, GIFT_CARDS_PATH, type GiftCardStock } from './api/wallet';
import {
  ADMIN_DEALS_PATH,
  removeDeal,
  removeGiftCard,
  removeVenue,
  setDealStatus,
  setVenueStatus,
  updateDeal,
  updateVenue,
  type AdminDeal,
} from './api/admin';
import {
  ConfirmDialog,
  EditForm,
  EditToggle,
  PressTwice,
  RowActions,
  WriteStrip,
  type EditField,
} from './adminControls';
import { useWrite, type Write } from './adminWrite';

import { PATHS } from './router';
import { useCountUp, useReveal } from './useReveal';


/**
 * The operator's console — the third signed-in experience.
 *
 * A frame rather than a page, like the partner dashboard: no marketing header,
 * no footer, no backdrop.
 *
 * ── every tab now asks the server ────────────────────────────────────────
 *
 * It did not used to. The Services and Offers tabs were `ADMIN_SERVICES` and
 * `ADMIN_DEALS` in `content.ts` — five venues and six offers written out by
 * hand, each venue carrying a `scale` that the whole analytics view was
 * multiplied by — and the four headline counts were `PLATFORM`, four integers
 * on one line. An operator reading "308 services · 220 active" was reading a
 * literal. So all of it is gone, and this screen is four reads:
 *
 *   `GET /v1/admin/overview`   the account count
 *   `GET /v1/admin/venues`     every venue, with its visit and customer counts
 *   `GET /v1/admin/deals`      every offer, in whatever state it is in
 *   `GET /v1/gift-cards`       the gift-card shelf
 *
 * The third of those used to be the *public* `GET /v1/deals`, and the swap is
 * not a tidy-up. That route is the customer's board — live rows only, each one
 * put through the targeting and cap checks — so a paused offer was not merely
 * missing from this screen, it was unreachable: nothing here could resume what
 * it could not list. The tab's own lede used to apologise for that. It does not
 * need to now.
 *
 * ── two rules it inherits, and one it no longer keeps ────────────────────
 *
 * **A failed request is a state, not a zero.** `useApi` returns
 * `loading | ready | error` precisely so "the backend is not answering" and
 * "connected, and the answer is none" cannot render as the same screen — and
 * after the purge the second of those is the *ordinary* state, because there
 * genuinely are no venues and no offers until a business signs up and somebody
 * verifies it. Every list below has both panels, and every count that has not
 * arrived is an em dash rather than a 0.
 *
 * **This console edits now, and the rule it used to state has moved rather than
 * gone.** What stood here was "it reports; it does not edit", with the
 * verification decision as the single exception. The reason behind it was never
 * that an operator should be powerless — it was that **a figure a partner argues
 * from must not be quietly changed by a third party**, because a number nobody
 * can defend is worse than no number. That is intact, and it is the line the
 * pencil stays on: every editable field on this screen is something *printed* —
 * a venue's name, city and category, an offer's title, description, terms and
 * closing date, a person's name and city — and not one of them is a balance, a
 * visit count or a funnel figure. There is no endpoint that edits one.
 * `server/http/routes/admin.ts` holds the same paragraph on the other side, and
 * every press here writes an audit row with an actor on it.
 *
 * ── edit mode ────────────────────────────────────────────────────────────
 *
 * **Nothing that destroys anything is drawn until an operator asks for it.**
 * `EditToggle` sits between the search field and the tabs — search narrows what
 * is listed, the tabs choose what kind of thing is listed, and it decides
 * whether the list can be changed — and turning it on puts a pencil and a bin at
 * the head of every row on Services, Offers and both tables on People. Off is
 * the resting state and it is not remembered between loads: a console that
 * opened with the bins already armed would make the first press of the afternoon
 * a destructive control nobody decided to reach for.
 *
 * The pencil opens `EditForm` under the row; the bin opens `ConfirmDialog` over
 * the page, which names the thing and takes one deliberate press. That replaced
 * a gradient — two presses for an offer, the venue's name typed back for a
 * venue — and `ConfirmDialog` carries the argument for the swap. The dialogue is
 * screen-level (`Doomed`), because a row that removes itself unmounts the moment
 * the write lands.
 *
 * **And removal means the row is gone.** Not archived, not stamped: the venue,
 * its offers and its copy leave the database, and the server explains what makes
 * that safe. A person is the one exception, and the exception is the schema's —
 * `removeUser` says which of the two endings the server gave it.
 *
 * The controls are `adminControls.tsx`; the calls are `api/admin.ts`.
 *
 * Classes are `adm-` prefixed for the reason `site.css` demands it: one unscoped
 * sheet, and `.dash-*` has already collided once.
 */


/* ────────────────────────────────────────────────────────────────── bits ── */

/**
 * One headline figure.
 *
 * `value` is `number | null`, and the null is the whole point: it is what a
 * request that has not landed — or has failed — looks like, and it draws an em
 * dash. A tile that counted up to 0 while the server was unreachable would be
 * the exact lie the rest of this file is written against.
 */
function Kpi({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="adm-kpi" data-reveal>
      {value === null ? (
        <b>—</b>
      ) : (
        <b data-count={value} data-group=" ">
          0
        </b>
      )}
      <span>{label}</span>
    </div>
  );
}

/**
 * The two panels every list on this screen needs, and the reason it needs both.
 *
 * `error` is "we could not ask"; `empty` is "we asked, and there is nothing".
 * They are different findings and an operator acts on them differently — one is
 * a server to restart, the other is a queue to go and fill — so they never
 * share a rendering.
 */
function Down({ result }: { result: ApiResult<unknown> }) {
  const copy = useCopy().admin.website.down;
  if (result.state.status !== 'error') return null;
  const { error } = result.state;

  return (
    <div className="adm-block-empty" data-reveal>
      <h3>{copy.title}</h3>
      <p>{error.status === 0 ? copy.unreachable : copy.refused}</p>
      <button className="btn btn-ghost" type="button" onClick={result.reload}>
        {copy.retry}
      </button>
    </div>
  );
}

/** A date, short, in the reader's own locale — the same helper the People tab
 *  keeps, for rows that arrive as ISO rather than as `DD.MM.YYYY`. */
const day = (iso: string | null, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit' }).format(
        new Date(iso),
      )
    : '—';

/* ────────────────────────────────────────────────────────────── services ── */

/**
 * What every list on this screen needs to be able to act.
 *
 * Threaded as one object rather than six props because the rows are three
 * different components and the alternative is the same six names repeated in
 * three signatures. `open` is a *screen-level* single slot on purpose, and so is
 * the dialogue: one half-finished destruction at a time is one chance to finish
 * the wrong one, and two is two.
 */
interface Manage {
  write: Write;
  /** Edit mode. Off, the rows carry no pencil and no bin — see `EditToggle`. */
  editing: boolean;
  /** The `useWrite` key of the row whose edit form is open, or `null`. */
  open: string | null;
  setOpen: (id: string | null) => void;
  /** Raise the "are you sure" dialogue. Screen-level; see `Doomed`. */
  ask: (doomed: Doomed) => void;
  /** The re-read. Every write passes one — the server is the record. */
  refresh: () => void;
}

/**
 * One thing a row has asked to have destroyed.
 *
 * The row knows what it is, what it is called and how to remove it; the *screen*
 * owns the dialogue, because a modal is a property of the page rather than of
 * the list item that raised it. So a row hands over these four and stops
 * thinking about it — which is also what makes the confirmation identical on
 * every tab without any of them saying so.
 */
interface Doomed {
  /** The `useWrite` key, so the pressed row is the one that says "working". */
  key: string;
  /** The thing's own name. It goes in the title — a dialogue that does not name
   *  what it is about is a dialogue nobody reads twice. */
  what: string;
  /** Which of the four sentences: what is actually lost. */
  body: string;
  /** Resolves to the sentence for the strip, or to anything when the row
   *  vanishing is answer enough. */
  run: () => Promise<unknown>;
}

function ServiceCard({
  venue,
  onOpen,
  manage,
}: {
  venue: AdminVenueRow;
  onOpen: () => void;
  manage: Manage;
}) {
  const dictionary = useCopy();
  const copy = dictionary.admin.services;
  const act = dictionary.admin.manage;
  const [copied, setCopied] = useState(false);


  /*
   * The confirmation un-says itself on a timer, and the timer outlives the card:
   * the tabs unmount this whole list, so pressing "copy id" and moving to
   * Analytics inside the second and a half left a `setCopied` pointing at a
   * component that no longer exists. The handle is held in a ref rather than in
   * state because nothing renders it, and cleared both on the next press (two
   * copies in quick succession must not let the first press end the second one's
   * confirmation) and on unmount.
   */
  const revert = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (revert.current !== null) clearTimeout(revert.current);
  }, []);

  /*
   * The clipboard is not guaranteed — it needs a secure context and the user's
   * permission — so the id stays visible and selectable either way, and the
   * button only ever adds a shortcut. A silent failure would be a button that
   * does nothing; this one just does not confirm.
   */
  const copyId = () => {
    navigator.clipboard?.writeText(venue.id).then(
      () => {
        setCopied(true);
        if (revert.current !== null) clearTimeout(revert.current);
        revert.current = setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };

  /*
   * Which way the reversible press goes, or nothing at all.
   *
   * `venues.status` has five values and only two of them have an obvious
   * opposite: live suspends, suspended restores. `draft` and `pending_review`
   * are venues that have never been live and `archived` is one this list cannot
   * show, so for those the toggle is absent rather than guessing.
   */
  const toggle: 'live' | 'suspended' | null =
    venue.status === 'live' ? 'suspended' : venue.status === 'suspended' ? 'live' : null;

  /* Keys for `useWrite`, so the pressed button is the one that says "working"
     and a second row's spinner cannot be started by this one. */
  const statusKey = `venue:${venue.id}:status`;
  const removeKey = `venue:${venue.id}:remove`;
  const editKey = `venue:${venue.id}:edit`;
  const editOpen = manage.open === editKey;

  /*
   * The category select, and the one thing it must not do.
   *
   * The server's taxonomy is wider than the listing form's — it carries
   * `hotels` and `bakery`, which `BUSINESS_CATEGORIES` does not — so a select
   * built from the form's list alone would have no option matching a venue in
   * one of the others, land on the first entry, and turn a hotel into a café
   * the moment somebody corrected its phone number. The row's own value is
   * appended when it is not in the list, so the current answer is always
   * selectable and the only way to change it is to choose a different one.
   */
  const categories = BUSINESS_CATEGORIES.map((row, index) => ({
    value: row.id,
    label: dictionary.listing.categories[index] ?? row.id,
  }));
  const editFields: EditField[] = [
    { key: 'name', label: act.fields.name, value: venue.name },
    {
      key: 'category',
      label: act.fields.category,
      value: venue.category,
      options: categories.some((row) => row.value === venue.category)
        ? categories
        : [...categories, { value: venue.category, label: venue.category }],
    },
    { key: 'city', label: act.fields.city, value: venue.city ?? '' },
  ];

  return (
    <li className="adm-service" data-reveal>
      {/*
        The pair leads the row, which is what "before each of them" means and is
        also where it belongs: an operator in edit mode is scanning down a
        column of the same two buttons, and a column of them on the left is one
        saccade rather than one per row across a ragged right edge.
      */}
      {manage.editing && (
        <RowActions
          editing={editOpen}
          busy={manage.write.busy === removeKey}
          onEdit={() => manage.setOpen(editOpen ? null : editKey)}
          onDelete={() =>
            manage.ask({
              key: removeKey,
              what: venue.name,
              body: act.deleteVenue,
              run: async () => {
                const result = await removeVenue(venue.id, venue.name);
                /* The count is the interesting half of the answer: an operator
                   who has just taken a venue down needs to know how many live
                   offers went with it, because that is the part customers would
                   otherwise still be seeing. */
                return fill(act.venueDeleted, { n: String(result.offersDeleted) });
              },
            })
          }
        />
      )}

      <span className="adm-logo" aria-hidden>
        {initialOf(venue.name)}
      </span>


      <div className="adm-service-body">
        <b>{venue.name}</b>
        {/*
          No star and no "takes vouchers" here, and neither is an oversight:
          `GET /v1/admin/venues` selects the id, the name, the city, the
          category, the status, the verification stamp, the owner and two
          counts, and nothing else. Everything this line used to carry beyond
          that was written beside the venue's name in `content.ts`.

          What is here instead is the thing an owner writes to support about:
          **verified or not**, which is the gate an offer has to clear before it
          can go in front of a customer.
        */}
        <span className="adm-sub">
          {[
            categoryLabel(venue.category, dictionary.listing.categories),
            venue.city,
            venue.owner,
            venue.verified_at
              ? dictionary.admin.database.verified
              : dictionary.admin.database.unverified,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="adm-id">
          <span className="adm-sub">{copy.serviceId}</span>
          <code>{venue.id}</code>
          <button type="button" className="link-btn" onClick={copyId}>
            {copied ? copy.copied : copy.copy}
          </button>
        </span>
      </div>

      <div className="adm-service-side">
        <span className="adm-state" data-on={venue.status === 'live' ? 'true' : undefined}>
          {venue.status === 'live' ? copy.active : copy.paused}
        </span>
        <button type="button" className="btn btn-ghost" onClick={onOpen}>
          <Icon name="bars" size={14} />
          {copy.analytics}
        </button>

        {/*
          Suspend and restore, and *only* for a venue that is one of those two
          things. A draft or a venue waiting on review has never been live, and
          the press that puts one of those in front of customers is the
          verification decision on the People tab — offering "restore" here
          would be a second door onto that gate with none of its checks. The
          honesty rule from the partner dashboard applies to this console too:
          a control with nothing honest behind it is deleted, not disabled.
        */}
        {toggle !== null && (
          <PressTwice
            label={toggle === 'suspended' ? act.suspend : act.restore}
            icon={toggle === 'suspended' ? 'pause' : 'play'}
            busy={manage.write.busy === statusKey}
            onPress={() =>
              manage.write.run(
                statusKey,
                () => setVenueStatus(venue.id, toggle),
                manage.refresh,
              )
            }
          />
        )}
      </div>

      {editOpen && (
        <EditForm
          fields={editFields}
          busy={manage.write.busy === editKey}
          onClose={() => manage.setOpen(null)}
          onSave={(patch) =>
            manage.write.run(
              editKey,
              async () => {
                await updateVenue(venue.id, patch);
                manage.setOpen(null);
                return act.saved;
              },
              manage.refresh,
            )
          }
        />
      )}
    </li>
  );
}


/* ──────────────────────────────────────────────────────────────── offers ── */

/**
 * One row of the Offers tab, whichever of the two things it is.
 *
 * A hot deal and a gift card are genuinely different objects — one is a venue
 * running an offer, the other is stock at a brand — and the tab shows both
 * because that is what "what is the app showing" means to an operator. The
 * `kind` word is the only thing that tells them apart at a glance, so it leads
 * the sub-line.
 */
function OfferRow({
  lead,
  logo,
  name,
  kind,
  meta,
  side,
  live,
  actions,
  panel,
}: {
  /** The pencil and the bin, when edit mode is on. Leads the row for the same
   *  reason it does on a venue: a column of two buttons is one scan. */
  lead?: ReactNode;
  logo: string;
  name: string;
  kind: string;
  meta: string[];
  side: string | null;
  /** Fills the state pill, the way `.adm-state` is filled everywhere else. */
  live?: boolean;
  actions?: ReactNode;
  panel?: ReactNode;
}) {
  return (
    <li className="adm-service" data-reveal>
      {lead}
      <span className="adm-logo" aria-hidden>
        {logo}
      </span>
      <div className="adm-service-body">
        <b>{name}</b>
        <span className="adm-sub">{[kind, ...meta].filter(Boolean).join(' · ')}</span>
      </div>
      {(side !== null || actions) && (
        <div className="adm-service-side">
          {side !== null && (
            <span className="adm-state" data-on={live ? 'true' : undefined}>
              {side}
            </span>
          )}
          {actions}
        </div>
      )}
      {panel}
    </li>
  );
}

/**
 * The pause on one offer, and why it is the only thing here now.
 *
 * Removing an offer used to be a second worded button beside it. It is the bin
 * in edit mode, like everything else that destroys something on this console —
 * so what is left is the reversible press, which is the one worth having on a
 * row somebody is reading rather than managing.
 *
 * **A resume can be refused, and that is not a bug in this screen.** The server
 * runs the same three gates the owner's own publish button clears — a verified
 * venue, room on the plan for another live deal, and copy in at least one
 * language — so pressing "resume" on an offer at a venue somebody suspended an
 * hour ago says so in the strip. Being an operator is not an exemption from the
 * rule that decides what a customer may be shown.
 */
function DealActions({ deal, manage }: { deal: AdminDeal; manage: Manage }) {
  const act = useCopy().admin.manage;
  const statusKey = `deal:${deal.id}:status`;
  const next = deal.status === 'live' ? 'paused' : 'live';

  return (
    <PressTwice
      label={next === 'paused' ? act.pause : act.resume}
      icon={next === 'paused' ? 'pause' : 'play'}
      busy={manage.write.busy === statusKey}
      onPress={() =>
        manage.write.run(statusKey, () => setDealStatus(deal.id, next), manage.refresh)
      }
    />
  );
}

/**
 * The fields an operator may correct on an offer: the words on the card, and
 * when it stops.
 *
 * Not the venue, not the points and not the funnel. The first is what the offer
 * *is* — moving a deal to another business is a different act with a different
 * name — and the last two are, respectively, a price a customer may already
 * have been quoted and a measurement. The edit is written in the language the
 * console is being read in, which the server picks up from the request.
 *
 * `valid_to` is an ISO timestamp on the row and a `<input type="date">` here, so
 * it is cut to ten characters going in and sent back as a plain day. The server
 * stores what it is given; a date with no clock on it is the honest shape for a
 * window an operator is extending by eye.
 */
function dealFields(deal: AdminDeal, act: ReturnType<typeof useCopy>['admin']['manage']) {
  /* The two short fields first and the two paragraphs after, which is a layout
     decision made here rather than in the sheet: `.adm-edit-grid` fits as many
     columns as it can and a paragraph takes the whole width, so a title
     separated from the date by two textareas leaves the title alone on a row
     with a hand's width of nothing beside it. */
  return [
    { key: 'title', label: act.fields.title, value: deal.copy?.title ?? '' },
    {
      key: 'validTo',
      label: act.fields.until,
      value: deal.valid_to ? deal.valid_to.slice(0, 10) : '',
      type: 'date' as const,
    },
    {
      key: 'description',
      label: act.fields.description,
      value: deal.copy?.description ?? '',
      type: 'textarea' as const,
    },
    { key: 'terms', label: act.fields.terms, value: deal.copy?.terms ?? '', type: 'textarea' as const },
  ] satisfies EditField[];
}


/* ────────────────────────────────────────────────────────────────── page ── */

interface Overview {
  users: number;
  venues: number;
  points: { issued: number; redeemed: number; ratio: number };
}

export function AdminPage() {
  const dictionary = useCopy();
  const copy = dictionary.admin;
  /* The console's write half, in every language it presses in. */
  const act = copy.manage;
  const [language] = useLanguage();

  const { account, signOut } = useAuth();

  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  /* One edit form open at a time, across the whole screen — see `Manage`. */
  const [panel, setPanel] = useState<string | null>(null);
  /*
   * Edit mode, and it is off on every load rather than remembered.
   *
   * A console that opened with the bins already on every row would be one where
   * the first press of the afternoon is a destructive control somebody did not
   * decide to arm. It is one press to turn on and the state of it is written on
   * the button, so remembering it buys nothing worth that.
   */
  const [editing, setEditing] = useState(false);
  /* The dialogue, at screen level — see `Doomed`. */
  const [doomed, setDoomed] = useState<Doomed | null>(null);
  const write = useWrite();

  const overview = useApi<Overview>('/v1/admin/overview');
  const venues = useApi<AdminVenueRow[]>('/v1/admin/venues?limit=200');
  /* Every offer and the whole shelf. `/v1/admin/deals` rather than the public
     `/v1/deals` because this tab is where offers are *managed*: the customer's
     route is live rows only, and a paused offer that cannot be listed cannot be
     resumed. Archived rows never arrive from either. */
  const deals = useApi<AdminDeal[]>(ADMIN_DEALS_PATH);
  const shelf = useApi<GiftCardStock[]>(GIFT_CARDS_PATH);

  const venueRows = venues.state.status === 'ready' ? venues.state.data : [];
  const dealRows = deals.state.status === 'ready' ? deals.state.data : [];
  const shelfRows = shelf.state.status === 'ready' ? shelf.state.data : [];

  const open = venueRows.find((venue) => venue.id === openId) ?? null;

  /*
   * The re-read every write hands over.
   *
   * All four, not only the list that was pressed: removing a venue archives its
   * offers and moves the tiles above them, so a refresh that re-read venues
   * alone would leave two other panels stating something that stopped being
   * true a moment ago. Four small reads on a console three people have open is
   * not a budget worth defending — and a screen quietly out of step with the
   * server is exactly what this file's opening rule is against.
   */
  const refresh = () => {
    overview.reload();
    venues.reload();
    deals.reload();
    shelf.reload();
  };
  const manage: Manage = {
    write,
    editing,
    open: panel,
    setOpen: setPanel,
    ask: setDoomed,
    refresh,
  };

  const needle = query.trim().toLowerCase();
  const match = (...fields: Array<string | null>) =>
    needle === '' || fields.filter(Boolean).join(' ').toLowerCase().includes(needle);

  const shownServices = venueRows.filter((venue) =>
    match(venue.name, venue.city, venue.id, venue.owner),
  );
  const shownDeals = dealRows.filter((deal) =>
    /* `copy` is nullable now: a deal with no title in any language is a real row
       and an operator has to be able to find it. It searches as its venue and
       city rather than not at all. */
    match(deal.copy?.title ?? null, deal.partner_name, deal.city),
  );
  const shownCards = shelfRows.filter((card) => match(card.brand));


  /*
   * Five figures, and every one of them is a `COUNT` somebody could go and run.
   *
   * There were six, and four of them came out of `PLATFORM`. What replaced them
   * is not a like-for-like: "total deals" and "active deals" are gone because
   * the only deal route an operator can call returns the live ones, so a total
   * would have been the same number under a different word. `null` while a
   * request is in flight or has failed — see `Kpi`.
   */
  const counts = overview.state.status === 'ready' ? overview.state.data : null;
  const kpis: Array<number | null> = [
    venues.state.status === 'ready' ? venueRows.length : null,
    venues.state.status === 'ready'
      ? venueRows.filter((venue) => venue.status === 'live').length
      : null,
    /* The tile still counts *live* offers, which it did before by asking a
       route that could only answer with live ones. Now the list holds paused
       and draft rows too, so the filter is written down rather than implied by
       the endpoint — the label above it says "live offers" and has to keep
       being true. */
    deals.state.status === 'ready'
      ? dealRows.filter((deal) => deal.status === 'live').length
      : null,

    shelf.state.status === 'ready' ? shelfRows.length : null,
    counts ? counts.users : null,
  ];

  /*
   * A rescan per tab — and per answer.
   *
   * `Site` keys its own on the route, and pressing a tab does not change the
   * route (the same note is in `dashboard.tsx`). The **values** are in the key
   * for a second reason, and it is the one that bit: `useCountUp` writes digits
   * into `textContent` imperatively and only when its key changes, so a tile
   * that rendered as an em dash while its request was in flight and then
   * re-rendered with a `data-count` never got scanned — it sat on the literal
   * `0` inside the tag, under a label, looking exactly like a measured zero.
   * That is the same lie as rendering a failed request as nothing, arrived at
   * from the other direction.
   */
  useReveal(`${tab}:${openId}`);
  useCountUp(`${tab}:${openId}:${kpis.join(',')}`);

  return (
    /* `<main>` and not a `<div>`, for the same reason the dashboard is one:
       `site.css` gives `z-index: 1` to `.site > main` only. */
    <main className="adm-app">
      <header className="adm-bar">
        <a className="adm-brand" href={PATHS.landing}>
          <span className="adm-word">paylez</span>
          <span className="adm-tag">{copy.tag}</span>
        </a>

        <div className="adm-actions">
          <ThemeToggle />
          <a className="btn btn-ghost" href={PATHS.landing}>
            {copy.back}
          </a>
          {account && (
            <span className="adm-user">
              <i aria-hidden>
                <Face name={account.name} photo={account.profile.avatar} />
              </i>
              <span>
                <b>{account.name.split(' ')[0]}</b>
                <span>{dictionary.auth.roles.admin}</span>
              </span>
            </span>
          )}
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            {dictionary.auth.signOut}
          </button>
        </div>
      </header>

      <div className="adm-page">
        {open ? (
          <ServiceAnalytics service={open} onBack={() => setOpenId(null)} />
        ) : (
          <>
            <div className="adm-head" data-reveal>
              <h1>{copy.title}</h1>
              <p>{copy.lede}</p>
            </div>

            <div className="adm-kpis">
              {kpis.map((value, index) => (
                <Kpi key={copy.kpis[index]} label={copy.kpis[index]} value={value} />
              ))}
            </div>

            <div className="adm-toolbar" data-reveal>
              <label className="adm-search adm-search-lg">
                <Icon name="search" size={16} className="adm-search-ico" />
                <input
                  type="search"
                  placeholder={copy.search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>

              {/* After the search and before the tabs. The order is the three
                  questions in the order they get asked: which rows, then which
                  kind of row, then whether the rows can be changed. */}
              <EditToggle on={editing} onToggle={() => setEditing((was) => !was)} />

              <div className="adm-tabs" role="tablist" aria-label={copy.tag}>
                {copy.tabs.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === index}
                    className="adm-tab"
                    data-on={tab === index ? 'true' : undefined}
                    onClick={() => {
                      setTab(index);
                      /* A half-finished edit does not survive the tab it was
                         started on. Nothing renders it once the row unmounts,
                         so this is tidying rather than a fix — but a form that
                         reopens on a row somebody came back to twenty minutes
                         later is holding a draft they have forgotten writing. */
                      setPanel(null);
                      write.dismiss();
                    }}
                  >

                    <Icon name={ADMIN_TABS[index]} size={15} />
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {editing && (
              <p className="adm-edit-note" role="status">
                <Icon name="pencil" size={14} strokeWidth={2.1} />
                {act.editHint}
              </p>
            )}

            {/* Keyed on the tab so the reveal observer rescans and the new panel
                fades in rather than arriving at `opacity: 0`. */}
            <div key={tab} className="adm-stack">
              {/* What the last press did, or why it did not. One strip for the
                  whole screen rather than a line per row, because the row is
                  usually the thing that has just gone away. */}
              <WriteStrip write={write} />

              {tab === 0 ? (

                <section className="adm-block" data-reveal>
                  <div className="adm-block-head">
                    <h2>{copy.services.title}</h2>
                    <p>{copy.services.lede}</p>
                  </div>

                  {venues.state.status === 'error' ? (
                    <Down result={venues} />
                  ) : venues.state.status === 'loading' ? (
                    <p className="adm-empty">{copy.website.loading}</p>
                  ) : venueRows.length === 0 ? (
                    /* The honest state of a freshly purged platform, and the
                       one production is in right now. It is *not* the search
                       coming up short, which is the sentence below it. */
                    <div className="adm-block-empty" data-reveal>
                      <h3>{copy.services.none.title}</h3>
                      <p>{copy.services.none.body}</p>
                    </div>
                  ) : shownServices.length === 0 ? (
                    <p className="adm-empty">{copy.noMatch}</p>
                  ) : (
                    <ul className="adm-list">
                      {shownServices.map((venue) => (
                        <ServiceCard
                          key={venue.id}
                          venue={venue}
                          onOpen={() => setOpenId(venue.id)}
                          manage={manage}
                        />

                      ))}
                    </ul>
                  )}
                </section>
              ) : tab === 1 ? (
                <section className="adm-block" data-reveal>
                  <div className="adm-block-head">
                    <h2>{copy.deals.title}</h2>
                    <p>{copy.deals.lede}</p>
                  </div>

                  {deals.state.status === 'error' || shelf.state.status === 'error' ? (
                    <Down result={deals.state.status === 'error' ? deals : shelf} />
                  ) : deals.state.status === 'loading' || shelf.state.status === 'loading' ? (
                    <p className="adm-empty">{copy.website.loading}</p>
                  ) : dealRows.length + shelfRows.length === 0 ? (
                    <div className="adm-block-empty" data-reveal>
                      <h3>{copy.deals.none.title}</h3>
                      <p>{copy.deals.none.body}</p>
                    </div>
                  ) : shownDeals.length + shownCards.length === 0 ? (
                    <p className="adm-empty">{copy.noMatch}</p>
                  ) : (
                    <ul className="adm-list">
                      {shownCards.map((card) => (
                        <OfferRow
                          key={card.id}
                          logo={card.logo || initialOf(card.brand)}
                          name={card.brand}
                          kind={copy.deals.kinds.gift}
                          meta={[
                            /* The face value in the card's **own** currency, not
                               the reader's: it is a thing on a shelf, and a
                               Polish card is 50 zł to an operator in London. The
                               separator is still the reader's — see `faceValue`. */
                            faceValue(card, CURRENCIES[language].group),
                            fill(copy.deals.cost, { n: String(card.points_cost) }),
                          ]}
                          side={fill(copy.deals.stock, { n: String(card.stock) })}
                          lead={
                            editing && (
                              /* No pencil. A shelf entry's face value, points
                                 cost and stock are what somebody bought
                                 against, and there is no endpoint that edits
                                 one — so the row gets the bin alone rather than
                                 a control that would have to be refused. */
                              <RowActions
                                busy={write.busy === `card:${card.id}`}
                                onDelete={() =>
                                  setDoomed({
                                    key: `card:${card.id}`,
                                    what: card.brand,
                                    body: act.deleteCard,
                                    run: async () => {
                                      const result = await removeGiftCard(card.id);
                                      /* Two outcomes, and the operator is told
                                         which: a brand nobody has bought from is
                                         gone, one somebody holds a card from is
                                         only off the shelf, because the code in
                                         their wallet still has to name it. */
                                      return result.outcome === 'deleted'
                                        ? act.cardRemoved
                                        : fill(act.cardDelisted, { n: String(result.issued) });
                                    },
                                  })
                                }
                              />
                            )
                          }
                        />
                      ))}
                      {shownDeals.map((deal) => (
                        <OfferRow
                          key={deal.id}
                          logo={initialOf(deal.partner_name ?? deal.copy?.title ?? '?')}
                          /* A deal with no copy in any language is a real row —
                             a draft somebody has not written yet — and it has to
                             be listable, so the fallback names it by its venue
                             rather than dropping it. */
                          name={deal.copy?.title ?? deal.partner_name ?? copy.deals.untitled}
                          kind={copy.deals.kinds.deal}
                          meta={[
                            deal.partner_name ?? '',
                            deal.city ?? '',
                            deal.valid_to
                              ? fill(copy.deals.until, { date: day(deal.valid_to, language) })
                              : '',
                            deal.points_required > 0
                              ? fill(copy.deals.cost, { n: String(deal.points_required) })
                              : '',
                          ]}
                          /* The pill is the stored state now, not the price. It
                             was the price while every row here was live by
                             definition; on a list that holds paused and draft
                             rows, which one it is is the first thing to know. */
                          side={copy.deals.states[deal.status] ?? deal.status}
                          live={deal.status === 'live'}
                          actions={<DealActions deal={deal} manage={manage} />}
                          lead={
                            editing && (
                              <RowActions
                                editing={panel === `deal:${deal.id}:edit`}
                                busy={write.busy === `deal:${deal.id}:remove`}
                                onEdit={() =>
                                  setPanel(
                                    panel === `deal:${deal.id}:edit`
                                      ? null
                                      : `deal:${deal.id}:edit`,
                                  )
                                }
                                onDelete={() =>
                                  setDoomed({
                                    key: `deal:${deal.id}:remove`,
                                    what:
                                      deal.copy?.title ??
                                      deal.partner_name ??
                                      copy.deals.untitled,
                                    body: act.deleteDeal,
                                    run: () => removeDeal(deal.id),
                                  })
                                }
                              />
                            )
                          }
                          panel={
                            panel === `deal:${deal.id}:edit` && (
                              <EditForm
                                fields={dealFields(deal, act)}
                                busy={write.busy === `deal:${deal.id}:edit`}
                                onClose={() => setPanel(null)}
                                onSave={(patch) =>
                                  write.run(
                                    `deal:${deal.id}:edit`,
                                    async () => {
                                      await updateDeal(deal.id, patch);
                                      setPanel(null);
                                      return act.saved;
                                    },
                                    refresh,
                                  )
                                }
                              />
                            )
                          }
                        />
                      ))}
                    </ul>

                  )}
                </section>
              ) : tab === 3 ? (
                /* The two tabs that were the *only* ones asking the backend when
                   they were written. Every tab does now; these two are still
                   the ones with nothing local to fall back on. */
                <AdminWebsite />
              ) : tab === 4 ? (
                <AdminMessages />
              ) : (
                /* **People is the server's.** It read `auth/directory.ts`
                   before — the accounts in *this browser* — which for an
                   operator meant a list of seeds. The real people are rows in
                   `users` on the server, and this is the tab whose whole
                   purpose is to show them. It carries the verification queue
                   beside them because that is the one thing on this console
                   somebody has to *do*. */
                <AdminPeople editing={editing} />
              )}
            </div>

            {/* The same honesty the assistant panel practises: say what is not
                connected rather than draw a control that pretends to be — and,
                now that this screen writes, what those writes are allowed to
                touch. */}
            <p className="adm-note" data-reveal>
              <Icon name="shield" size={15} />
              {copy.note}
            </p>

          </>
        )}
      </div>

      {/*
        The dialogue, last in the frame and outside `.adm-page`.

        It is here rather than inside the row that raised it for two reasons.
        A modal is a property of the page — one at a time, over everything —
        and a row that removes itself unmounts the moment the write lands, so a
        dialogue rendered inside one would be asking a question from a
        component that is about to disappear mid-answer.
      */}
      {doomed && (
        <ConfirmDialog
          title={fill(act.deleteTitle, { what: doomed.what })}
          body={doomed.body}
          action={act.deleteYes}
          busy={write.busy === doomed.key}
          onClose={() => setDoomed(null)}
          onConfirm={() => {
            const { key, run } = doomed;
            /* Closed before the request rather than after it. The strip is what
               reports the ending — success or the server's own refusal — and a
               dialogue left up while that lands is a second place saying what
               happened, in front of the first. */
            setDoomed(null);
            write.run(key, run, refresh);
          }}
        />
      )}
    </main>
  );
}
