/* Paylez — shared components & helpers */

const { useState, useEffect, useRef, useMemo } = React;

/* ── money / format ── */
const money = (n) => "$" + n.toFixed(n % 1 === 0 ? 0 : 2);
const PZ = window.PAYLEZ;
const merchantOf = (d) => PZ.merchants[d.merchant];
const catOf = (id) => PZ.categories.find((c) => c.id === id);

/* ── Icon set ── */
const ICONS = {
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.3-4.3",
  pin: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z|M12 11.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z",
  heart: "M12 20.5 4.2 13a4.8 4.8 0 0 1 6.8-6.8l1 1 1-1A4.8 4.8 0 0 1 19.8 13L12 20.5Z",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z",
  cart: "M3 4h2l2.2 12.2a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.6L22 8H6|M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z|M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M4 21a8 8 0 0 1 16 0",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  arrowRight: "M5 12h14|M13 6l6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h16",
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12l5 5L20 7",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z|M8.5 12l2.3 2.3L15.5 9.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z|M12 7v5l3.2 2",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z|M9 12l2 2 4-4",
  share: "M16 6l-4-4-4 4|M12 2v13|M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7",
  filter: "M3 5h18M6 12h12M10 19h4",
  sliders: "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4|M14 4v4M6 10v4M12 16v4",
  tag: "M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z|M7.5 8a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2Z",
  spa: "M12 8c0 4-3 7-3 7s-3-3-3-7a3 3 0 0 1 6 0Z|M12 8c0 4 3 7 3 7s3-3 3-7a3 3 0 0 0-6 0Z|M5 19c4-1 10-1 14 0",
  food: "M6 3v8a2 2 0 0 0 4 0V3M8 3v18|M16 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4 2.5-1 2.5-4-1-5-2.5-5Zm0 9v9",
  ticket: "M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z|M14 6v12",
  dumbbell: "M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11",
  plane: "M10.5 19l1.5-6 8-5a1.4 1.4 0 0 0-1.6-2.2L11 9 4 7.5 2.5 9l5 3-1 4 1.5 1 2.5-3",
  home: "M4 11l8-7 8 7|M6 9.5V20h12V9.5",
  car: "M5 16v3M19 16v3M4 16h16l-1.5-6a2 2 0 0 0-2-1.5H7.5a2 2 0 0 0-2 1.5L4 16Z|M7 13h.01M17 13h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  verified: "M12 2l2.2 1.6 2.7-.2 1 2.5 2.3 1.4-.7 2.6.7 2.6-2.3 1.4-1 2.5-2.7-.2L12 22l-2.2-1.8-2.7.2-1-2.5L3.8 16.5l.7-2.6-.7-2.6 2.3-1.4 1-2.5 2.7.2Z|M9 12l2 2 4-4",
  gift: "M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8|M3 8h18v4H3zM12 8V21|M12 8S10.5 3.5 8 5s1 3 4 3Zm0 0s1.5-4.5 4-3-1 3-4 3Z",
  receipt: "M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3V3l-2 1.3L15 3l-2 1.3L11 3 9 4.3 7 3 5 4.3Z|M8 9h8M8 13h5",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  lock: "M6 11V8a6 6 0 0 1 12 0v3|M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z|M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  back: "M5 12h14|M11 6l-6 6 6 6",
};

function Icon({ name, size = 20, stroke = 2, fill = false, style, className }) {
  const d = ICONS[name] || "";
  const parts = d.split("|");
  const solid = ["heart", "star", "bolt"].includes(name) && fill;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={solid ? "currentColor" : "none"}
      stroke={solid ? "none" : "currentColor"} strokeWidth={stroke} strokeLinecap="round"
      strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      {parts.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

/* ── Stars ── */
function Stars({ value, size = 14, showNum = true, count }) {
  return (
    <span className="stars" style={{ color: "var(--star)" }}>
      <Icon name="star" size={size} fill style={{ marginTop: -1 }} />
      {showNum && <strong style={{ fontSize: size * 0.9, color: "var(--text)", fontWeight: 700 }}>{value.toFixed(1)}</strong>}
      {count != null && <span className="faint" style={{ fontSize: size * 0.85, fontWeight: 500 }}>({count.toLocaleString()})</span>}
    </span>
  );
}

/* ── Category glyph tile ── */
function CatGlyph({ id, size = 52 }) {
  const c = catOf(id);
  return (
    <span style={{ width: size, height: size, borderRadius: "calc(var(--r) * 0.9)",
      display: "grid", placeItems: "center", flexShrink: 0,
      background: `color-mix(in oklab, ${c.tint} 14%, var(--surface))`,
      color: c.tint, border: `1px solid color-mix(in oklab, ${c.tint} 22%, transparent)` }}>
      <Icon name={c.icon} size={size * 0.46} stroke={1.9} />
    </span>
  );
}

/* ── Deal card ── */
function DealCard({ deal, onOpen, onMerchant, saved, onSave, compact }) {
  const m = merchantOf(deal);
  const c = catOf(deal.category);
  return (
    <article className={"deal-card fade-up" + (compact ? " compact" : "")} onClick={() => onOpen(deal.id)}>
      <div className="deal-card-img">
        <img src={deal.image} alt={deal.title} loading="lazy" />
        <span className="discount-pill deal-card-disc">-{deal.discount}%</span>
        {deal.badges && deal.badges[0] && <span className="badge badge-deal deal-card-badge">{deal.badges[0]}</span>}
        <button className={"save-btn" + (saved ? " saved" : "")}
          onClick={(e) => { e.stopPropagation(); onSave(deal.id); }} aria-label="Save deal">
          <Icon name="heart" size={18} fill={saved} stroke={2} />
        </button>
      </div>
      <div className="deal-card-body">
        <button className="deal-card-merch" onClick={(e) => { e.stopPropagation(); onMerchant(m.id); }}>
          <Icon name={c.icon} size={13} style={{ color: c.tint }} />
          <span>{m.name}</span>
          {m.verified && <Icon name="verified" size={13} style={{ color: "var(--accent)" }} fill />}
        </button>
        <h3 className="deal-card-title">{deal.title}</h3>
        <div className="deal-card-meta">
          <Stars value={deal.rating} count={deal.reviews} size={13} />
          <span className="faint deal-card-sold">· {(deal.sold).toLocaleString()} bought</span>
        </div>
        <div className="deal-card-price">
          <span className="price-now">{money(deal.price)}</span>
          <span className="price-was">{money(deal.original)}</span>
          <span className="badge badge-save price-save">Save {money(deal.original - deal.price)}</span>
        </div>
      </div>
    </article>
  );
}

/* ── Section header ── */
function SectionHead({ title, sub, action, onAction }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub muted">{sub}</p>}
      </div>
      {action && <button className="link-action" onClick={onAction}>{action} <Icon name="arrowRight" size={16} /></button>}
    </div>
  );
}

/* ── Empty state ── */
function Empty({ icon = "search", title, sub }) {
  return (
    <div className="empty-state">
      <span className="empty-ico"><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      {sub && <p className="muted">{sub}</p>}
    </div>
  );
}

/* ── Toast ── */
function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast fade-up"><Icon name="checkCircle" size={18} fill /> {msg}</div>;
}

Object.assign(window, {
  money, PZ, merchantOf, catOf, Icon, Stars, CatGlyph, DealCard, SectionHead, Empty, Toast,
  useState, useEffect, useRef, useMemo,
});
