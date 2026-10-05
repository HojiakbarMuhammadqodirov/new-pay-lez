import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { encodeQr, qrPath } from './qr';
import { APP_STORE_URL, PLAY_STORE_URL } from './getAppLinks';

/**
 * "Get the app": a button that opens a modal with, per platform, a QR code and
 * a store button under it.
 *
 * The QR codes are drawn here, from `qr.ts`, rather than shipped as images,
 * so the store link and the symbol can never disagree: change the constant in
 * `getAppLinks.ts` and the code changes with it.
 *
 * On a phone the codes are left out and the store buttons are all there is: a
 * phone cannot scan its own screen, and the button is the whole of what that
 * visitor needs.
 *
 * The modal is built the way `venueSheet.tsx` builds one: the `.gs-*` scrim and
 * panel, a focus trap, Escape to close, the page locked behind it, focus handed
 * back to the button that opened it. Portalled to `document.body`, because a
 * `position: fixed` scrim inside a `data-reveal` (transformed) ancestor is fixed
 * to that ancestor rather than to the screen.
 */
export function GetAppButton({ className = 'btn btn-ghost btn-lg' }: { className?: string }) {
  const copy = useCopy().getApp;
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="download" size={18} strokeWidth={2.2} />
        {copy.button}
      </button>
      {open && <GetAppDialog returnFocus={buttonRef.current} onClose={() => setOpen(false)} />}
    </>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.getClientRects().length > 0,
  );

/** A phone: a narrow touch screen, or a phone's user agent. */
function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  const narrowTouch = window.matchMedia?.('(max-width: 640px) and (pointer: coarse)').matches ?? false;
  return narrowTouch || /Android|iPhone|iPod/i.test(navigator.userAgent);
}

function GetAppDialog({
  returnFocus,
  onClose,
}: {
  returnFocus: HTMLElement | null;
  onClose: () => void;
}) {
  const copy = useCopy().getApp;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const phone = useMemo(isPhone, []);

  /* Modal, properly — the same effect as `VenueSheet`'s. */
  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const targets = focusableIn(panel);
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  /* A drag that starts inside the panel and ends on the scrim is not a close. */
  const pressedScrim = useRef(false);

  return createPortal(
    <div
      className="gs-scrim"
      onPointerDown={(event) => {
        pressedScrim.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedScrim.current && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="gs-panel getapp-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="gs-close" onClick={onClose} aria-label={copy.close}>
          <Icon name="close" size={16} strokeWidth={2.2} />
        </button>

        <div className="getapp-head">
          <h3 id={titleId}>{copy.title}</h3>
          {!phone && <p>{copy.lede}</p>}
        </div>

        <div className="getapp-stores">
          <StoreCard platform={copy.android} url={PLAY_STORE_URL} action={copy.play} phone={phone} />
          <StoreCard platform={copy.iphone} url={APP_STORE_URL} action={copy.appStore} phone={phone} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StoreCard({
  platform,
  url,
  action,
  phone,
}: {
  platform: string;
  url: string | null;
  action: string;
  phone: boolean;
}) {
  const copy = useCopy().getApp;
  const symbol = useMemo(() => {
    if (!url) return null;
    const matrix = encodeQr(url);
    return { path: qrPath(matrix, 4), size: matrix.size + 8 };
  }, [url]);

  return (
    <div className="getapp-card" data-soon={url ? undefined : 'true'}>
      <span className="getapp-platform">{platform}</span>

      {/* No code on a phone: it cannot scan its own screen. */}
      {!phone &&
        (symbol ? (
          <svg
            className="getapp-qr"
            viewBox={`0 0 ${symbol.size} ${symbol.size}`}
            role="img"
            aria-label={fill(copy.qrLabel, { store: action })}
            shapeRendering="crispEdges"
          >
            {/* White ground in both themes: a camera needs dark on light, and
                many readers refuse an inverted code. */}
            <rect width={symbol.size} height={symbol.size} fill="#fff" />
            <path d={symbol.path} fill="#04201f" />
          </svg>
        ) : (
          <div className="getapp-qr getapp-qr-soon" aria-hidden="true">
            <Icon name="qr" size={40} strokeWidth={1.6} />
          </div>
        ))}

      {url ? (
        <a className="btn btn-solid getapp-btn" href={url} target="_blank" rel="noreferrer noopener">
          <Icon name="download" size={17} strokeWidth={2.2} />
          {action}
        </a>
      ) : (
        <button type="button" className="btn btn-ghost getapp-btn" disabled>
          {copy.soon}
        </button>
      )}

      {!url && <span className="getapp-note">{copy.soonNote}</span>}
    </div>
  );
}
