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
import { useTheme } from './theme/context';

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
function ThemeToggle() {
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

export function Header() {
  const copy = useCopy();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
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
        <a className="brand" href="#top" aria-label="paylez home">
          <span className="brand-mark">
            <span>p</span>
          </span>
          <span className="brand-word">paylez</span>
        </a>

        <nav className="main-nav" aria-label="Primary">
          {NAV_ITEMS.map((item, index) => (
            <NavItem
              key={copy.nav[index]}
              href={item.href}
              label={copy.nav[index]}
              icon={item.icon}
              active={index === 0}
            />
          ))}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          <LanguageMenu />
          <button type="button" className="sign-in">
            {copy.signIn}
          </button>
        </div>
      </div>
    </header>
  );
}
