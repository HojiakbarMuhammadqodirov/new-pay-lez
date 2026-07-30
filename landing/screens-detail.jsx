/* Paylez — Deal detail + Merchant profile */

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
        <div className="review-top">
          <strong>{rv.n}</strong>
          <span className="faint">· {rv.d}</span>
        </div>
        <div className="review-stars">{[1,2,3,4,5].map((i) => (
          <Icon key={i} name="star" size={13} fill style={{ color: i <= rv.r ? "var(--star)" : "var(--border-strong)" }} />
        ))}</div>
        <p>{rv.t}</p>
      </div>
    </div>
  );
}

/* ════════ DEAL DETAIL ════════ */
function DealScreen({ dealId, go, openDeal, openMerchant, savedSet, onSave, addToCart, buyNow }) {
  const deal = PZ.deals.find((d) => d.id === dealId);
  const m = merchantOf(deal);
  const c = catOf(deal.category);
  const [opt, setOpt] = useState(0);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState("about");
  useEffect(() => { setOpt(0); setQty(1); window.scrollTo(0, 0); }, [dealId]);

  const option = deal.options[opt];
  const gallery = [deal.image, m.cover, `https://picsum.photos/seed/${deal.id}b/800/600`, `https://picsum.photos/seed/${deal.id}c/800/600`];
  const [hero, setHero] = useState(0);
  useEffect(() => { setHero(0); }, [dealId]);

  const similar = PZ.deals.filter((d) => d.category === deal.category && d.id !== deal.id).slice(0, 4);
  const saved = savedSet.has(deal.id);

  return (
    <div className="wrap detail">
      <nav className="breadcrumb">
        <button onClick={() => go("home", {})}>Home</button> <Icon name="chevronRight" size={13} />
        <button onClick={() => go("browse", { cat: deal.category })}>{c.label}</button> <Icon name="chevronRight" size={13} />
        <span className="faint">{deal.title}</span>
      </nav>

      <div className="detail-grid">
        {/* LEFT: gallery + content */}
        <div className="detail-left">
          <div className="gallery">
            <div className="gallery-main">
              <img src={gallery[hero]} alt={deal.title} key={hero} className="fade-in" />
              <span className="discount-pill gallery-disc">-{deal.discount}%</span>
              <button className={"save-btn gallery-save" + (saved ? " saved" : "")} onClick={() => onSave(deal.id)}>
                <Icon name="heart" size={20} fill={saved} />
              </button>
            </div>
            <div className="gallery-thumbs">
              {gallery.map((g, i) => (
                <button key={i} className={"thumb" + (i === hero ? " active" : "")} onClick={() => setHero(i)}>
                  <img src={g} alt="" />
                </button>
              ))}
            </div>
          </div>

          <div className="detail-body hide-mobile">
            <DetailContent deal={deal} m={m} c={c} tab={tab} setTab={setTab} openMerchant={openMerchant} />
          </div>
        </div>

        {/* RIGHT: buy box */}
        <aside className="buybox-wrap">
          <div className="buybox">
            <button className="buybox-merch" onClick={() => openMerchant(m.id)}>
              <CatGlyph id={deal.category} size={42} />
              <div>
                <div className="buybox-merch-name">{m.name} {m.verified && <Icon name="verified" size={14} style={{ color: "var(--accent)" }} fill />}</div>
                <Stars value={m.rating} count={m.reviews} size={13} />
              </div>
            </button>
            <h1 className="buybox-title">{deal.title}</h1>
            <div className="buybox-meta">
              <span className="badge badge-deal">Save {deal.discount}%</span>
              <span className="muted"><Icon name="pin" size={14} /> {m.location}</span>
            </div>

            <div className="options">
              <div className="options-label">Choose an option</div>
              {deal.options.map((o, i) => (
                <button key={i} className={"option-card" + (i === opt ? " active" : "")} onClick={() => setOpt(i)}>
                  <span className="option-radio">{i === opt && <span className="option-dot" />}</span>
                  <span className="option-label">{o.label}</span>
                  <span className="option-price">
                    <span className="price-now" style={{ fontSize: "1.1rem" }}>{money(o.price)}</span>
                    <span className="price-was">{money(o.original)}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="qty-row">
              <span>Quantity</span>
              <div className="stepper">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>–</button>
                <span>{qty}</span>
                <button onClick={() => setQty((q) => Math.min(8, q + 1))}>+</button>
              </div>
            </div>

            <div className="buybox-total">
              <div>
                <span className="muted" style={{ fontSize: ".85rem" }}>Total</span>
                <div className="total-prices">
                  <span className="price-now" style={{ fontSize: "1.7rem" }}>{money(option.price * qty)}</span>
                  <span className="price-was">{money(option.original * qty)}</span>
                </div>
              </div>
              <span className="badge badge-save">You save {money((option.original - option.price) * qty)}</span>
            </div>

            <button className="btn btn-grad btn-lg btn-block" onClick={() => buyNow({ deal, option, qty })}>Buy now</button>
            <button className="btn btn-outline btn-block" style={{ marginTop: 10 }} onClick={() => addToCart({ deal, option, qty })}>
              <Icon name="cart" size={18} /> Add to cart
            </button>

            <ul className="buybox-assure">
              <li><Icon name="shield" size={16} /> Buyer guarantee — easy refunds</li>
              <li><Icon name="clock" size={16} /> Free reschedule up to 24h before</li>
              <li><Icon name="gift" size={16} /> Can be sent as a gift</li>
            </ul>
          </div>
        </aside>

        {/* mobile content below buybox */}
        <div className="detail-body hide-desktop" style={{ gridColumn: "1 / -1" }}>
          <DetailContent deal={deal} m={m} c={c} tab={tab} setTab={setTab} openMerchant={openMerchant} />
        </div>
      </div>

      {/* Similar */}
      <section className="home-section" style={{ marginTop: 8 }}>
        <SectionHead title="You might also like" />
        <DealGrid deals={similar} onOpen={openDeal} onMerchant={openMerchant} savedSet={savedSet} onSave={onSave} />
      </section>
    </div>
  );
}

function DetailContent({ deal, m, c, tab, setTab, openMerchant }) {
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
    <div>
      <div className="tabs">
        {[["about", "Overview"], ["included", "What's included"], ["fine", "Fine print"], ["reviews", `Reviews (${deal.reviews.toLocaleString()})`]].map(([id, label]) => (
          <button key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "about" && (
        <div className="tab-panel fade-in">
          <p className="lead-p">{m.blurb}</p>
          <h4 className="block-h">Highlights</h4>
          <div className="highlights">
            {[["bolt","Instant confirmation"],["clock","Flexible scheduling"],["verified","Top-rated provider"],["pin","Prime location"]].map(([i,t]) => (
              <div key={t} className="highlight"><Icon name={i} size={18} style={{ color: "var(--primary)" }} fill={i==="verified"||i==="bolt"} /> {t}</div>
            ))}
          </div>
          <div className="merch-card" onClick={() => openMerchant(m.id)}>
            <img className="merch-card-cover" src={m.cover} alt="" />
            <div className="merch-card-body">
              <div>
                <strong>{m.name}</strong>
                <div className="muted" style={{ fontSize: ".88rem" }}><Icon name="pin" size={13} /> {m.location} · Since {m.since}</div>
              </div>
              <button className="btn btn-outline btn-sm">View shop <Icon name="chevronRight" size={14} /></button>
            </div>
          </div>
        </div>
      )}
      {tab === "included" && (
        <div className="tab-panel fade-in">
          <h4 className="block-h">What's included</h4>
          <ul className="check-list">{included.map((x) => <li key={x}><Icon name="checkCircle" size={18} fill style={{ color: "var(--success)" }} /> {x}</li>)}</ul>
        </div>
      )}
      {tab === "fine" && (
        <div className="tab-panel fade-in">
          <h4 className="block-h">The fine print</h4>
          <ul className="check-list dim">{fine.map((x) => <li key={x}><Icon name="check" size={16} className="muted" /> {x}</li>)}</ul>
        </div>
      )}
      {tab === "reviews" && (
        <div className="tab-panel fade-in">
          <div className="reviews-summary">
            <div className="reviews-score">
              <span className="big-score">{deal.rating.toFixed(1)}</span>
              <div><Stars value={deal.rating} showNum={false} size={16} /><p className="muted">{deal.reviews.toLocaleString()} verified reviews</p></div>
            </div>
          </div>
          {REVIEWS.map((rv, i) => <ReviewRow key={i} rv={rv} />)}
        </div>
      )}
    </div>
  );
}

/* ════════ MERCHANT PROFILE ════════ */
function MerchantScreen({ merchantId, go, openDeal, openMerchant, savedSet, onSave }) {
  const m = PZ.merchants[merchantId];
  const [tab, setTab] = useState("deals");
  useEffect(() => { setTab("deals"); window.scrollTo(0, 0); }, [merchantId]);
  const mDeals = PZ.deals.filter((d) => d.merchant === merchantId);

  return (
    <div className="merchant">
      <div className="merchant-cover">
        <img src={m.cover} alt="" />
        <div className="merchant-cover-fade" />
        <button className="merchant-back" onClick={() => go("home", {})}><Icon name="back" size={18} /> Back</button>
      </div>
      <div className="wrap">
        <header className="merchant-head">
          <div className="merchant-logo"><CatGlyph id={m.category} size={84} /></div>
          <div className="merchant-id">
            <h1>{m.name} {m.verified && <Icon name="verified" size={22} style={{ color: "var(--accent)" }} fill />}</h1>
            <div className="merchant-sub">
              <Stars value={m.rating} count={m.reviews} size={15} />
              <span className="muted">· <Icon name="pin" size={14} /> {m.location}</span>
              <span className="muted">· Since {m.since}</span>
            </div>
          </div>
          <div className="merchant-actions">
            <button className="btn btn-outline btn-sm"><Icon name="heart" size={16} /> Follow</button>
            <button className="btn btn-outline btn-sm"><Icon name="share" size={16} /> Share</button>
          </div>
        </header>

        <div className="tabs merchant-tabs">
          {[["deals", `Deals (${mDeals.length})`], ["about", "About"], ["reviews", `Reviews (${m.reviews.toLocaleString()})`]].map(([id, l]) => (
            <button key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>

        {tab === "deals" && (
          <section className="home-section fade-in">
            <DealGrid deals={mDeals} onOpen={openDeal} onMerchant={openMerchant} savedSet={savedSet} onSave={onSave} />
          </section>
        )}
        {tab === "about" && (
          <div className="about-grid fade-in">
            <div>
              <h4 className="block-h">About {m.name}</h4>
              <p className="lead-p">{m.blurb}</p>
              <h4 className="block-h">Amenities</h4>
              <div className="amenities">{m.amenities.map((a) => <span key={a} className="amenity"><Icon name="check" size={14} style={{ color: "var(--success)" }} /> {a}</span>)}</div>
            </div>
            <aside className="about-side">
              <div className="info-card">
                <div className="info-row"><Icon name="clock" size={17} className="muted" /><div><strong>Hours</strong><p className="muted">{m.hours}</p></div></div>
                <div className="info-row"><Icon name="pin" size={17} className="muted" /><div><strong>Location</strong><p className="muted">{m.location}</p></div></div>
                <div className="map-placeholder"><Icon name="pin" size={22} /> Map preview</div>
              </div>
            </aside>
          </div>
        )}
        {tab === "reviews" && (
          <div className="tab-panel fade-in" style={{ maxWidth: 720 }}>
            <div className="reviews-summary">
              <div className="reviews-score"><span className="big-score">{m.rating.toFixed(1)}</span>
                <div><Stars value={m.rating} showNum={false} size={16} /><p className="muted">{m.reviews.toLocaleString()} reviews</p></div></div>
            </div>
            {REVIEWS.map((rv, i) => <ReviewRow key={i} rv={rv} />)}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DealScreen, MerchantScreen, DetailContent, ReviewRow });
