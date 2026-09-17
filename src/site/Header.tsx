import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {
  NAV_HIDDEN_INDIVIDUAL,
  NAV_LABEL_BUSINESS,
  NAV_HREFS,
  NAV_ORDER,
  NAV_ORDER_BUSINESS,
  type NavKey,
} from './content';
import { GLASS_MESH } from './glassMesh';
import { Icon } from './icons';
import {
  LANGUAGE_ORDER,
  LANGUAGES,
  useCopy,
  useCurrencyCode,
  useLanguage,
} from './i18n/context';
import { CURRENCIES, CURRENCY_ORDER } from './i18n/currency';
import { PATHS, type Route } from './router';
import { useTheme } from './theme/context';
import { useAuth } from './auth/context';
import { Face } from './auth/Avatar';

/**
 * One nav item: a glass pane that fractures around the pointer.
 *
 * The pointer position is published as two CSS variables in element pixels;
 * every triangle carries its own centroid, and CSS computes the falloff per
 * polygon with `hypot()`. That means a move costs **two** style writes rather
 * than one per triangle, and the browser does the distance calculations itself.
 *
 * `offsetX`/`offsetY` are read straight off the event — children are
 * pointer-transparent so the link is always the target, which avoids a layout
 * read on every move.
 */
function NavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  // Size is only needed to convert mesh space to pixels; it changes on resize,
  // never on pointer move.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const publish = () => {
      node.style.setProperty('--w', `${node.offsetWidth}px`);
      node.style.setProperty('--h', `${node.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLAnchorElement>) => {
    const node = event.currentTarget;
    node.style.setProperty('--mx', `${event.nativeEvent.offsetX}px`);
    node.style.setProperty('--my', `${event.nativeEvent.offsetY}px`);
  }, []);

  return (
    <a
      ref={ref}
      href={href}
      className="nav-link"
      data-active={active ? 'true' : undefined}
      /* `data-active` is the sheet's hook and says nothing to anyone not looking
         at the screen — so the nav was marking the current page visually and not
         programmatically. `aria-current` is the half that carries. */
      aria-current={active ? 'page' : undefined}
      onPointerMove={onPointerMove}
    >
      <svg
        className="nav-glass"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        focusable="false"
      >
        {GLASS_MESH.map((triangle, index) => (
          <polygon
            key={index}
            points={triangle.points}
            style={
              {
                ['--cx' as string]: triangle.cx,
                ['--cy' as string]: triangle.cy,
              } as CSSProperties
            }
          />
        ))}
      </svg>
      {/* Word only. The 16px glyph beside it was a second, weaker way of saying
          the same thing, and seven of them turned the strip into a toolbar. */}
      <span className="nav-label">{label}</span>
    </a>
  );
}

/**
 * Language switcher. Closes on outside click and on Escape.
 *
 * Exported because the dashboard replaces this header wholesale and needs the
 * same control in its own bar: without it, the one screen a partner spends the
 * most time on was the one screen with no way to change language — the same gap
 * `ThemeToggle` was exported to close.
 */
/**
 * A listbox that closes on an outside click and on Escape, and hands focus back.
 *
 * Extracted because there are **two** of these menus now — the language and the
 * currency — and the part that makes them usable is the part nobody writes
 * twice correctly. Closing unmounts the element holding focus, which drops it
 * on `<body>`, so the next Tab restarts at the top of the document rather than
 * carrying on from the header. `AssistantDock` solves this and says so; these
 * menus did not until the language one was given the same treatment, and a
 * second hand-rolled copy would have been a second menu without it.
 *
 * `restore` is false on the outside-click path: there the visitor has aimed at
 * some *other* control, and pulling focus back to the trigger would take it off
 * whatever they just clicked.
 */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const close = useCallback((restore: boolean) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return { open, setOpen, close, ref, trigger, listId };
}

export function LanguageMenu() {
  const copy = useCopy();
  const [language, setLanguage] = useLanguage();
  const { open, setOpen, close, ref, trigger, listId } = useMenu();

  return (
    <div className="lang" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={copy.languageMenu}
        onClick={() => setOpen((value) => !value)}
      >
        {copy.region} <span className="sep">·</span> <b>{copy.short}</b>
        <Icon name="chevron" size={13} strokeWidth={2.2} className="lang-caret" />
      </button>

      {open && (
        /*
         * A `div`, not a `ul`, and the options are its direct children.
         *
         * `role="listbox"` requires `option` (or `group`) as its *owned*
         * elements, and this used to put an `<li>` between the two — which
         * breaks that ownership, so the options are not reliably exposed as one
         * selectable set and `aria-selected` has nothing to attach to. Dropping
         * the `<li>` off a `<ul>` would fix the ARIA and break the HTML content
         * model instead, so the list element goes too. No CSS follows it:
         * `.lang-menu` sets its own margin and padding and its `list-style` was
         * only ever turning off markers this no longer has.
         */
        <div className="lang-menu" id={listId} role="listbox" aria-label={copy.languageMenu}>
          {LANGUAGE_ORDER.map((code) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === language}
              className="lang-option"
              data-on={code === language ? 'true' : undefined}
              onClick={() => {
                setLanguage(code);
                close(true);
              }}
            >
              <span className="lang-code">{LANGUAGES[code].short}</span>
              {LANGUAGES[code].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Currency switcher — **a separate setting from the language**.
 *
 * ## Why it exists
 *
 * The language used to pick the currency: `CURRENCIES[language]`, so English
 * priced in pounds and Polish in złoty. They were never the same question. A
 * Russian speaker in Kraków is paid in złoty; an English speaker may be in
 * Tashkent. Tying them meant a visitor who wanted prices in their own money had
 * to read the site in a language they may not speak — and the other way round.
 *
 * The language still supplies the **default** (`CURRENCY_FOR_LANGUAGE`),
 * because it is the one thing a visitor tells us before they tell us anything
 * else and a first visit should not have to choose twice. Once the currency has
 * been chosen it stops following: switching language leaves it alone, which is
 * the whole point.
 *
 * ## Two things it deliberately shares and one it does not
 *
 * It reuses `.lang-*` wholesale, because it **is** the same component with
 * different content — the namespacing rule in `CLAUDE.md` allows exactly that
 * and forbids only sharing a name by accident. And it reuses
 * `copy.relocate.rates.names`, which is already the currency's name in the
 * reader's language, keyed by ISO code: five new strings in five dictionaries
 * would have been ten copies of a word this site already has.
 *
 * What it does not share is the *set*. `CURRENCY_ORDER` is the five this
 * product prices itself in, not the nineteen `fx.ts` carries for the Relocate
 * converter — a price tag needs a rounding step and a grouping decision per
 * currency, and offering a currency with neither would put an unrounded
 * conversion on a price.
 */
export function CurrencyMenu() {
  const copy = useCopy();
  const [currency, setCurrency] = useCurrencyCode();
  const { open, setOpen, close, ref, trigger, listId } = useMenu();
  const names = copy.relocate.rates.names;

  return (
    <div className="lang" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={copy.currencyMenu}
        onClick={() => setOpen((value) => !value)}
      >
        {/* The symbol and the code, because neither is enough on its own: two
            of these five share a symbol family and the code is what somebody
            scanning for "PLN" is looking for. */}
        <span aria-hidden>{CURRENCIES[currency].symbol}</span>{' '}
        <span className="sep">·</span> <b>{currency}</b>
        <Icon name="chevron" size={13} strokeWidth={2.2} className="lang-caret" />
      </button>

      {open && (
        <div className="lang-menu" id={listId} role="listbox" aria-label={copy.currencyMenu}>
          {CURRENCY_ORDER.map((code) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === currency}
              className="lang-option"
              data-on={code === currency ? 'true' : undefined}
              onClick={() => {
                setCurrency(code);
                close(true);
              }}
            >
              <span className="lang-code">{code}</span>
              {names[code]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dark/light switch.
 *
 * Both glyphs are always mounted and the pair is cross-faded, so the swap is
 * transform and opacity only — no layout, and no icon popping in a frame late.
 * The button reports its *destination* rather than its current state, which is
 * what a screen reader needs to know before pressing it.
 */
export function ThemeToggle() {
  const copy = useCopy();
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? copy.theme.toLight : copy.theme.toDark}
      title={dark ? copy.theme.toLight : copy.theme.toDark}
      data-theme={theme}
    >
      <span className="theme-ico">
        <Icon name="sun" size={16} strokeWidth={1.9} />
      </span>
      <span className="theme-ico">
        <Icon name="moon" size={16} strokeWidth={1.9} />
      </span>
    </button>
  );
}

/**
 * The signed-in replacement for the sign-in button.
 *
 * Avatar, name, and what kind of account it is underneath — enough to know at a
 * glance who the session belongs to, which matters on a site where that decides
 * which pages exist. Opening it uses the same outside-click and Escape handling
 * as `LanguageMenu` above; the two are the only popovers on the page and they
 * should behave identically.
 */
function AccountChip() {
  const copy = useCopy();
  const { account, plan, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      /* Escape means "put me back", and closing unmounts whatever menu item had
         focus — so without this the next Tab restarts at the top of the
         document. The other two exits do not restore: an outside click has
         already chosen a new target, and signing out unmounts this whole chip
         along with the header it sat in. */
      trigger.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!account?.type) return null;

  return (
    <div className="account" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="account-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={copy.auth.accountMenu}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden>
          <Face name={account.name} photo={account.profile.avatar} />
        </span>
        <span className="account-who">
          <b>{account.name}</b>
          <span>
            {copy.auth.roles[account.type]}
            {/* The plan goes where somebody would look for it: on the line that
                already says what kind of account this is. Absent rather than
                "Free" while it is unknown — see `plan` in the auth context for
                why a guess is the wrong default. */}
            {plan && <em className="plan-tag">{plan.name}</em>}
          </span>
        </span>
      </button>

      {open && (
        <div className="account-menu" id={menuId} role="menu">
          {/* Unconditional, and the only item here that is: `#/profile` is the
              one page every signed-in account has, an admin included — the
              console replaces an operator's *venue* screens, not their own
              name. It sits above the two conditional items for the same reason
              it has no condition: it is about whoever the chip just named.

              `people` is the glyph the profile form itself uses for the photo
              picker, which is the nearest thing to a person in the icon set. */}
          <a
            className="account-item"
            role="menuitem"
            href={PATHS.profile}
            /* The two items below it do not close on click and do not need to:
               `#/dashboard` and `#/admin` are frames that replace this header
               wholesale, so the menu unmounts with the chip it hangs off.
               `#/profile` is an ordinary page and keeps the header, so without
               this the menu is left open on top of the page it just opened —
               the same reason the phone sheet's links close themselves. */
            onClick={() => setOpen(false)}
          >
            <Icon name="people" size={15} />
            {copy.profile.title}
          </a>
          {account.type === 'business' && (
            <a className="account-item" role="menuitem" href={PATHS.dashboard}>
              <Icon name="bars" size={15} />
              {copy.auth.dashboard}
            </a>
          )}
          {/* An admin can wander onto the marketing pages like anyone else, so
              the way back to the console has to be somewhere. This is where the
              owner's way back to their dashboard already is. */}
          {account.type === 'admin' && (
            <a className="account-item" role="menuitem" href={PATHS.admin}>
              <Icon name="shield" size={15} />
              {copy.admin.tag}
            </a>
          )}
          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            <Icon name="send" size={15} />
            {copy.auth.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({ route }: { route: Route }) {
  const copy = useCopy();
  const { account } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  /*
   * The bar is sticky in CSS; this only decides whether the glass behind it is
   * showing. Two thresholds rather than one: a single edge sitting exactly
   * under a trackpad's resting position cross-fades the whole strip in and out
   * on every stray pixel. Passing the same boolean to `setScrolled` is free —
   * React bails out before re-rendering — so only a real crossing costs a
   * render, which keeps this off the per-frame path.
   */
  useEffect(() => {
    const onScroll = () =>
      setScrolled((on) => (on ? window.scrollY > 8 : window.scrollY > 28));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /*
   * Which items, in which order.
   *
   * Three answers, and the account is the whole of what decides between them.
   * An owner gets their own tools first and no Relocate (see
   * `NAV_ORDER_BUSINESS`); an individual loses the two pages that sell to a
   * venue; signed out, everything shows, because those pages are still the
   * pitch.
   */
  const isOwner = account?.type === 'business';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  /*
   * Close on Escape, and lock the page behind it.
   *
   * The sheet covers the viewport, so a page that keeps scrolling underneath it
   * means closing the menu drops you somewhere you never chose to be. Restoring
   * the previous value rather than clearing it, because `PaylezIntro` sets the
   * same property and the two can overlap on a first visit.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const items: NavKey[] =
    isOwner
      ? NAV_ORDER_BUSINESS
      : account?.type === 'individual'
        ? NAV_ORDER.filter((key) => !NAV_HIDDEN_INDIVIDUAL.includes(key))
        : NAV_ORDER;

  return (
    <header className="site-header" data-scrolled={scrolled ? 'true' : 'false'}>
      {/* Three explicit columns rather than space-between: that is what keeps
          the nav optically centred regardless of how wide the brand or the
          actions happen to be. */}
      <div className="wrap header-inner">
        {/* The word is the mark. No tile beside it — see `.brand` in site.css. */}
        <a className="brand" href={PATHS.landing} aria-label="paylez home">
          paylez
        </a>

        <nav className="main-nav" aria-label="Primary">
          {items.map((key) => (
            <NavItem
              key={key}
              href={NAV_HREFS[key]}
              /* An owner reads "Games" where a visitor reads "L-Earn" — same
                 route, different word for somebody who is not being sold to. */
              label={copy.nav[(isOwner && NAV_LABEL_BUSINESS[key]) || key]}
              /* Only the routes can be "current"; `home` is a section anchor,
                 which scrolls rather than navigates. */
              active={NAV_HREFS[key] === PATHS[route]}
            />
          ))}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          {/* Two menus, because they are two settings: what the page is written
              in and what its prices are in. They used to be one control doing
              both — see CurrencyMenu. */}
          <CurrencyMenu />
          <LanguageMenu />
          {account?.type ? (
            <AccountChip />
          ) : (
            <a className="sign-in" href={PATHS.signin}>
              {copy.signIn}
            </a>
          )}

          {/*
            The phone's only way through the site.

            `.main-nav` is hidden below 1080px and nothing replaced it, so on a
            phone the Business page — the one that sells to venues, carrying the
            pricing table and the sales address — was reachable from no page at
            all. The footer's four links did not cover it.
          */}
          <button
            type="button"
            className="nav-burger"
            aria-label={copy.menu}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span className="nav-burger-bars" data-open={menuOpen ? 'true' : undefined} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="nav-sheet" id={menuId}>
          <nav aria-label={copy.menu}>
            {items.map((key) => (
              <a
                key={key}
                href={NAV_HREFS[key]}
                className="nav-sheet-link"
                aria-current={NAV_HREFS[key] === PATHS[route] ? 'page' : undefined}
                /* Closing on click rather than on route change: a section
                   anchor like `#top` does not change the route, so keying off
                   that would leave the sheet open over the thing it scrolled to. */
                onClick={() => setMenuOpen(false)}
              >
                {copy.nav[(isOwner && NAV_LABEL_BUSINESS[key]) || key]}
              </a>
            ))}

            {/* Signed out, the bar is too narrow at 360px to hold this *and*
                the language menu — in Polish it overflows at 390px. It moves in
                here, where it also reads as the end of the list rather than as
                a control competing with the wordmark. */}
            {!account?.type && (
              <a
                className="btn btn-solid btn-lg nav-sheet-cta"
                href={PATHS.signin}
                onClick={() => setMenuOpen(false)}
              >
                {copy.signIn}
              </a>
            )}
            {/* On narrow viewports the language and theme controls live in the
                sheet rather than inline in the header. */}
            <div className="nav-sheet-controls">
              <ThemeToggle />
              <CurrencyMenu />
              <LanguageMenu />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
