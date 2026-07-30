/* Paylez Mobile — Deal detail + Merchant profile */

const REVIEWS = [
  { n: "Sarah M.", r: 5, t: "Absolutely worth it. The whole experience felt premium and the staff were lovely. Already booked again.", d: "2 weeks ago", a: "sarahm" },
  { n: "James T.", r: 5, t: "Smooth from booking to redemption. Showed the QR code and was in within a minute.", d: "1 month ago", a: "jamest" },
  { n: "Priya K.", r: 4, t: "Great value for the price. Slightly busy on a Saturday but still a lovely time.", d: "1 month ago", a: "priyak" },
];

function ReviewRow({ rv }) {
  return (
    <div className="review-row">
      <img className="avatar" src={`https://i.pravatar.cc/80?u=${rv.a}`} alt={rv.n} />
      <div>
        <div className="review-top"><strong>{rv.n}</strong><span className="faint">· {rv.d}</span></div>
        <div className="review-stars">{[1,2,3,4,5].map((i) => (
          <Icon key={i} name="star" size={12} fill style={{ color: i <= rv.r ? "var(--star)" : "var(--border-strong)" }} />
        ))}</div>
        <p>{rv.t}</p>
      </div>
    </div>
  );
}

/* ════════ DEAL DETAIL ════════ */
function DealScreen({ dealId, back, go, openDeal, openMerchant, savedSet, onSave, addToCart, buyNow }) {
  const deal = PZ.deals.find((d) => d.id === dealId);
  const m = merchantOf(deal);
  const c = catOf(deal.category);
  const [ref, scrolled] = useScrolled(160);
  const [opt, setOpt] = useState(0);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState("about");
  const [dot, setDot] = useState(0);
  const gref = useRef(null);

  const gallery = [deal.image, m.cover, `https://picsum.photos/seed/${deal.id}b/800/600`, `https://picsum.photos/seed/${deal.id}c/800/600`];
  const option = deal.options[opt];
  const similar = PZ.deals.filter((d) => d.category === deal.category && d.id !== deal.id).slice(0, 4);
  const saved = savedSet.has(deal.id);

  const onGScroll = () => { const el = gref.current; if (el) setDot(Math.round(el.scrollLeft / el.clientWidth)); };

  const included = [
    "Valid for one person unless otherwise stated",
    "Professional, fully-licensed service providers",
    "All equipment and materials provided",
    "Complimentary refreshments on arrival",
  ];
  const fine = [
    "Valid for 6 months from date of purchase",
    "Appointment required — subject to availability",
    "Limit 1 per person, may buy multiple as gifts",
    "Not valid with other offers or promotions",
  ];

  return (
    <React.Fragment>
      <div className="pz-scroll has-actionbar screen-enter" ref={ref}>
        {/* floating chrome */}
        <button className="icon-btn float-back" onClick={back} aria-label="Back"><Icon name="chevronLeft" size={22} /></button>
        <div className="float-back-right">
          <button className="icon-btn" aria-label="Share"><Icon name="share" size={18} /></button>
          <SaveBtn saved={saved} onClick={() => onSave(deal.id)} className="icon-btn" size={19} />
        </div>

        {/* gallery */}
        <div className="gallery">
          <div className="gallery-track" ref={gref} onScroll={onGScroll}>
            {gallery.map((g, i) => (
              <div key={i} className="gallery-slide"><img src={g} alt="" loading={i ? "lazy" : "eager"} /></div>
            ))}
          </div>
          <span className="discount-pill gallery-disc">-{deal.discount}% off</span>
          <div className="gallery-dots">{gallery.map((_, i) => <span key={i} className={"gallery-dot" + (i === dot ? " active" : "")} />)}</div>
        </div>

        <div className="detail-body">
          <button className="detail-merch" onClick={() => openMerchant(m.id)}>
            <CatGlyph id={deal.category} size={44} />
            <div style={{ flex: 1, textAlign: "left" }}>
              <div className="detail-merch-name">{m.name} {m.verified && <Icon name="verified" size={14} style={{ color: "var(--accent)" }} fill />}</div>
              <Stars value={m.rating} count={m.reviews} size={12} />
            </div>
            <Icon name="chevronRight" size={18} className="faint" />
          </button>

          <h1 className="detail-title">{deal.title}</h1>
          <div className="detail-meta">
            <span className="badge badge-deal">Save {deal.discount}%</span>
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="pin" size={14} /> {m.location}</span>
            <span className="faint">· {deal.sold.toLocaleString()} bought</span>
          </div>

          {/* options */}
          <div className="block-h" style={{ marginTop: 0 }}>Choose an option</div>
          <div className="options">
            {deal.options.map((o, i) => (
              <button key={i} className={"option-card" + (i === opt ? " active" : "")} onClick={() => setOpt(i)}>
                <span className="option-radio">{i === opt && <span className="option-dot" />}</span>
                <span className="option-label">{o.label}</span>
                <span className="option-price"><span className="price-now">{money(o.price)}</span><span className="price-was">{money(o.original)}</span></span>
              </button>
            ))}
          </div>
          <div className="qty-row"><span>Quantity</span><Stepper qty={qty} setQty={setQty} /></div>

          {/* tabs */}
          <div className="seg">
            {[["about", "Overview"], ["included", "Included"], ["fine", "Fine print"], ["reviews", "Reviews"]].map(([id, l]) => (
              <button key={id} className={"seg-btn" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{l}</button>
            ))}
          </div>

          {tab === "about" && (
            <div className="fade-up">
              <p className="lead-p">{m.blurb}</p>
              <h4 className="block-h">Highlights</h4>
              <div className="highlights">
                {[["bolt","Instant confirmation"],["clock","Flexible scheduling"],["verified","Top-rated provider"],["pin","Prime location"]].map(([i,t]) => (
                  <div key={t} className="highlight"><Icon name={i} size={17} style={{ color: "var(--primary)" }} fill={i==="verified"||i==="bolt"} /> {t}</div>
                ))}
              </div>
            </div>
          )}
          {tab === "included" && (
            <div className="fade-up">
              <h4 className="block-h">What's included</h4>
              <ul className="check-list">{included.map((x) => <li key={x}><Icon name="checkCircle" size={18} fill style={{ color: "var(--success)" }} /> {x}</li>)}</ul>
            </div>
          )}
          {tab === "fine" && (
            <div className="fade-up">
              <h4 className="block-h">The fine print</h4>
              <ul className="check-list dim">{fine.map((x) => <li key={x}><Icon name="check" size={16} className="muted" /> {x}</li>)}</ul>
            </div>
          )}
          {tab === "reviews" && (
            <div className="fade-up">
              <div className="reviews-summary">
                <span className="big-score">{deal.rating.toFixed(1)}</span>
                <div><Stars value={deal.rating} showNum={false} size={16} /><p className="muted" style={{ fontSize: ".85rem", marginTop: 4 }}>{deal.reviews.toLocaleString()} verified reviews</p></div>
              </div>
              {REVIEWS.map((rv, i) => <ReviewRow key={i} rv={rv} />)}
            </div>
          )}

          <ul className="assure">
            <li><Icon name="shield" size={17} /> Buyer guarantee — easy refunds</li>
            <li><Icon name="clock" size={17} /> Free reschedule up to 24h before</li>
            <li><Icon name="gift" size={17} /> Can be sent as a gift</li>
          </ul>

          {/* similar */}
          <section style={{ margin: "26px 0 8px" }}>
            <h2 className="section-title" style={{ marginBottom: 14 }}>You might also like</h2>
            <DealList deals={similar} onOpen={openDeal} onMerchant={openMerchant} savedSet={savedSet} onSave={onSave} />
          </section>
        </div>
      </div>

      {/* sticky buy bar */}
      <div className="actionbar">
        <div className="actionbar-price">
          <span className="price-now">{money(option.price * qty)}</span>
          <span className="price-was">{money(option.original * qty)}</span>
        </div>
        <button className="icon-btn" style={{ width: 52, height: 52, borderRadius: 16, background: "var(--surface-2)", boxShadow: "none" }}
          onClick={() => addToCart({ deal, option, qty })} aria-label="Add to cart"><Icon name="cart" size={21} /></button>
        <button className="btn btn-grad" style={{ flex: 1 }} onClick={() => buyNow({ deal, option, qty })}>Buy now</button>
      </div>
    </React.Fragment>
  );
}

/* ════════ MERCHANT PROFILE ════════ */
function MerchantScreen({ merchantId, back, openDeal, openMerchant, savedSet, onSave, flash }) {
  const m = PZ.merchants[merchantId];
  const [ref, scrolled] = useScrolled(180);
  const [tab, setTab] = useState("deals");
  const mDeals = PZ.deals.filter((d) => d.merchant === merchantId);

  return (
    <div className="pz-scroll screen-enter" ref={ref} style={{ paddingBottom: 30 }}>
      <button className="icon-btn float-back" onClick={back} aria-label="Back"><Icon name="chevronLeft" size={22} /></button>
      <div className="float-back-right"><button className="icon-btn" aria-label="Share"><Icon name="share" size={18} /></button></div>

      <div className="merch-cover"><img src={m.cover} alt="" /></div>
      <div className="merch-head">
        <span className="merch-logo"><span className="merch-logo-tile" style={{ background: `color-mix(in oklab, ${catOf(m.category).tint} 16%, var(--surface))`, color: catOf(m.category).tint }}>
          <Icon name={catOf(m.category).icon} size={34} stroke={1.9} />
        </span></span>
        <h1 className="merch-name">{m.name} {m.verified && <Icon name="verified" size={20} style={{ color: "var(--accent)" }} fill />}</h1>
        <div className="merch-sub">
          <Stars value={m.rating} count={m.reviews} size={14} />
          <span>· <Icon name="pin" size={13} /> {m.location}</span>
          <span>· Since {m.since}</span>
        </div>
        <div className="merch-actions">
          <button className="btn btn-grad" onClick={() => flash && flash("Following " + m.name)}><Icon name="heart" size={17} /> Follow</button>
          <button className="btn btn-outline"><Icon name="share" size={17} /> Share</button>
        </div>
      </div>

      <div className="section" style={{ marginTop: 20 }}>
        <div className="seg">
          {[["deals", `Deals (${mDeals.length})`], ["about", "About"], ["reviews", "Reviews"]].map(([id, l]) => (
            <button key={id} className={"seg-btn" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>

        {tab === "deals" && (
          <div className="fade-up"><DealGridList deals={mDeals} onOpen={openDeal} onMerchant={openMerchant} savedSet={savedSet} onSave={onSave} /></div>
        )}
        {tab === "about" && (
          <div className="fade-up">
            <p className="lead-p">{m.blurb}</p>
            <h4 className="block-h">Amenities</h4>
            <div className="amenities">{m.amenities.map((a) => <span key={a} className="amenity"><Icon name="check" size={14} style={{ color: "var(--success)" }} /> {a}</span>)}</div>
            <h4 className="block-h">Hours & location</h4>
            <div className="info-card">
              <div className="info-row"><Icon name="clock" size={17} className="muted" /><div><strong>Hours</strong><p className="muted">{m.hours}</p></div></div>
              <div className="info-row"><Icon name="pin" size={17} className="muted" /><div><strong>Location</strong><p className="muted">{m.location}</p></div></div>
              <div className="map-ph"><Icon name="pin" size={22} /> Map preview</div>
            </div>
          </div>
        )}
        {tab === "reviews" && (
          <div className="fade-up">
            <div className="reviews-summary">
              <span className="big-score">{m.rating.toFixed(1)}</span>
              <div><Stars value={m.rating} showNum={false} size={16} /><p className="muted" style={{ fontSize: ".85rem", marginTop: 4 }}>{m.reviews.toLocaleString()} reviews</p></div>
            </div>
            {REVIEWS.map((rv, i) => <ReviewRow key={i} rv={rv} />)}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DealScreen, MerchantScreen, ReviewRow });
