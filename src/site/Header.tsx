import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { NAV_ITEMS } from './content';
import { GLASS_MESH } from './glassMesh';
import { Icon, type IconName } from './icons';
import { LANGUAGE_ORDER, LANGUAGES, useCopy, useLanguage } from './i18n/context';
import { PATHS, type Route } from './router';
import { useTheme } from './theme/context';
import { initial, useAuth } from './auth/context';

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
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconName;
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
      <Icon name={icon} size={16} strokeWidth={1.8} className="nav-icon" />
      <span className="nav-label">{label}</span>
    </a>
  );
}

/** Language switcher. Closes on outside click and on Escape. */
function LanguageMenu() {
  const copy = useCopy();
  const [language, setLanguage] = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lang" ref={ref}>
      <button
        type="button"
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={copy.languageMenu}
        onClick={() => setOpen((value) => !value)}
      >
        {copy.region} <span className="sep">·</span> <b>{copy.short}</b>
        <Icon name="chevron" size={13} strokeWidth={2.2} className="lang-caret" />
      </button>

      {open && (
        <ul className="lang-menu" role="listbox" aria-label={copy.languageMenu}>
          {LANGUAGE_ORDER.map((code) => (
            <li key={code}>
              <button
                type="button"
                role="option"
                aria-selected={code === language}
                className="lang-option"
                data-on={code === language ? 'true' : undefined}
                onClick={() => {
                  setLanguage(code);
                  setOpen(false);
                }}
              >
                <span className="lang-code">{LANGUAGES[code].short}</span>
                {LANGUAGES[code].label}
              </button>
            </li>
          ))}
        </ul>
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
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
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
        type="button"
        className="account-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.auth.accountMenu}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden>
          {initial(account)}
        </span>
        <span className="account-who">
          <b>{account.name}</b>
          <span>{copy.auth.roles[account.type]}</span>
        </span>
      </button>

      {open && (
        <div className="account-menu" role="menu">
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

  return (
    <header className="site-header" data-scrolled={scrolled ? 'true' : 'false'}>
      {/* Three explicit columns rather than space-between: that is what keeps
          the nav optically centred regardless of how wide the brand or the
          actions happen to be. */}
      <div className="wrap header-inner">
        <a className="brand" href={PATHS.landing} aria-label="paylez home">
          <span className="brand-mark" aria-hidden />
          <span className="brand-word">paylez</span>
        </a>

        <nav className="main-nav" aria-label="Primary">
          {/*
            Zipped into pairs before filtering, not filtered as two arrays.
            `NAV_ITEMS` is index-aligned with `copy.nav`, so dropping an entry
            from one and not the other shears every label after it — B2B would
            end up captioned "Vouchers".

            An individual has no business with the two pages that sell to a
            venue. Signed out, everything shows: those pages are still the pitch.
          */}
          {NAV_ITEMS.map((item, index) => ({ item, label: copy.nav[index] }))
            .filter(
              ({ item }) =>
                account?.type !== 'individual' ||
                (item.href !== PATHS.b2b && item.href !== PATHS.analytics),
            )
            .map(({ item, label }) => (
              <NavItem
                key={label}
                href={item.href}
                label={label}
                icon={item.icon}
                /* Only the routes can be "current"; the rest are section
                   anchors on the landing page, which scroll rather than navigate. */
                active={item.href === PATHS[route]}
              />
            ))}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          <LanguageMenu />
          {account?.type ? (
            <AccountChip />
          ) : (
            <a className="sign-in" href={PATHS.signin}>
              {copy.signIn}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
