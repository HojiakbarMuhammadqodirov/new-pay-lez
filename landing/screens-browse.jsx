/* Paylez — Home feed + Browse/Search results */

/* ── Grid wrapper ── */
function DealGrid({ deals, ...handlers }) {
  return (
    <div className="deal-grid">
      {deals.map((d, i) => (
        <div key={d.id} style={{ animationDelay: (i % 8) * 35 + "ms" }}>
          <DealCard deal={d} {...handlers} saved={handlers.savedSet.has(d.id)} />
        </div>
      ))}
    </div>
  );
}

/* ════════ HOME ════════ */
function HomeScreen({ go, openDeal, openMerchant, savedSet, onSave, location }) {
  const featured = PZ.deals.filter((d) => d.badges && d.badges.length).slice(0, 4);
  const trending = [...PZ.deals].sort((a, b) => b.sold - a.sold).slice(0, 8);
  const handlers = { onOpen: openDeal, onMerchant: openMerchant, savedSet, onSave };

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <div className="wrap hero-inner">
          <div className="hero-copy fade-up">
            <span className="hero-eyebrow"><Icon name="bolt" size={14} fill /> Up to 70% off in {location}</span>
            <h1 className="hero-title">Treat yourself for<br /><span className="hero-grad">a whole lot less</span></h1>
            <p className="hero-lede">Hand-picked deals on spas, dining, activities and more from local businesses you'll love.</p>
            <div className="hero-search">
              <div className="hero-search-field">
                <Icon name="search" size={20} className="muted" />
                <input placeholder="Try ‘massage’, ‘brunch’, ‘helicopter tour’…"
                  onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) go("search", { q: e.target.value.trim() }); }} />
              </div>
              <div className="hero-search-loc hide-mobile">
                <Icon name="pin" size={18} className="muted" />
                <span>{location}</span>
              </div>
              <button className="btn btn-grad btn-lg hero-search-btn"
                onClick={(e) => { const i = e.currentTarget.parentElement.querySelector("input"); go("search", { q: i.value.trim() }); }}>
                Search
              </button>
            </div>
            <div className="hero-tags">
              <span className="faint">Popular:</span>
              {["Massage", "Brunch", "Personal training", "Weekend getaway"].map((t) => (
                <button key={t} className="hero-tag" onClick={() => go("search", { q: t })}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Category rail */}
      <section className="wrap cat-rail-wrap">
        <div className="cat-rail">
          {PZ.categories.map((c) => (
            <button key={c.id} className="cat-tile" onClick={() => go("browse", { cat: c.id })}>
              <span className="cat-tile-ico" style={{ background: `color-mix(in oklab, ${c.tint} 14%, var(--surface))`,
                color: c.tint, borderColor: `color-mix(in oklab, ${c.tint} 24%, transparent)` }}>
                <Icon name={c.icon} size={24} stroke={1.9} />
              </span>
              <span className="cat-tile-label">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="wrap">
        {/* Featured */}
        <section className="home-section">
          <SectionHead title="Featured this week" sub="Editor-picked deals our team is loving right now"
            action="See all" onAction={() => go("browse", {})} />
          <DealGrid deals={featured} {...handlers} />
        </section>

        {/* Promo banner */}
        <section className="promo-banner fade-up">
          <div className="promo-text">
            <span className="promo-eyebrow">Paylez+ Membership</span>
            <h3>Save an extra 10% on every deal, all year.</h3>
            <p>Free cancellations, early access to drops, and members-only prices.</p>
          </div>
          <button className="btn btn-lg promo-btn" onClick={() => go("account", {})}>Try free for 30 days</button>
          <div className="promo-glow" />
        </section>

        {/* Trending */}
        <section className="home-section">
          <SectionHead title={`Trending near ${location}`} sub="What everyone's buying this week"
            action="Browse all" onAction={() => go("browse", {})} />
          <DealGrid deals={trending} {...handlers} />
        </section>

        {/* Trust strip */}
        <section className="trust-strip">
          {[
            { i: "shield", t: "Buyer guarantee", s: "Refund if you can't redeem" },
            { i: "verified", t: "Verified merchants", s: "Every business is vetted" },
            { i: "clock", t: "Flexible booking", s: "Reschedule in a tap" },
            { i: "gift", t: "Easy gifting", s: "Send a deal in seconds" },
          ].map((x) => (
            <div key={x.t} className="trust-item">
              <span className="trust-ico"><Icon name={x.i} size={22} fill={x.i === "verified"} /></span>
              <div><strong>{x.t}</strong><p className="muted">{x.s}</p></div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/* ════════ RESULTS (Browse + Search) ════════ */
const SORTS = [
  { id: "pop", label: "Most popular" },
  { id: "priceLow", label: "Price: low to high" },
  { id: "priceHigh", label: "Price: high to low" },
  { id: "discount", label: "Biggest discount" },
  { id: "rating", label: "Top rated" },
];
const PRICE_BANDS = [
  { id: "u50", label: "Under $50", test: (p) => p < 50 },
  { id: "50-100", label: "$50 – $100", test: (p) => p >= 50 && p < 100 },
  { id: "100-250", label: "$100 – $250", test: (p) => p >= 100 && p < 250 },
  { id: "250+", label: "$250 & up", test: (p) => p >= 250 },
];

function ResultsScreen({ mode, params, go, openDeal, openMerchant, savedSet, onSave }) {
  const [cat, setCat] = useState(params.cat || "all");
  const [bands, setBands] = useState(new Set());
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("pop");
  const [q, setQ] = useState(params.q || "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => { setCat(params.cat || "all"); }, [params.cat]);
  useEffect(() => { setQ(params.q || ""); }, [params.q]);

  const results = useMemo(() => {
    let list = PZ.deals.slice();
    if (mode === "search" && q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(t) ||
        merchantOf(d).name.toLowerCase().includes(t) || catOf(d.category).label.toLowerCase().includes(t));
    }
    if (cat !== "all") list = list.filter((d) => d.category === cat);
    if (bands.size) list = list.filter((d) => [...bands].some((b) => PRICE_BANDS.find((x) => x.id === b).test(d.price)));
    if (minRating) list = list.filter((d) => d.rating >= minRating);
    const s = { pop: (a, b) => b.sold - a.sold, priceLow: (a, b) => a.price - b.price,
      priceHigh: (a, b) => b.price - a.price, discount: (a, b) => b.discount - a.discount,
      rating: (a, b) => b.rating - a.rating }[sort];
    return list.sort(s);
  }, [mode, q, cat, bands, minRating, sort]);

  const toggleBand = (id) => setBands((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const activeCount = (cat !== "all" ? 1 : 0) + bands.size + (minRating ? 1 : 0);
  const clearAll = () => { setCat("all"); setBands(new Set()); setMinRating(0); };
  const handlers = { onOpen: openDeal, onMerchant: openMerchant, savedSet, onSave };
  const heading = mode === "search" ? (q ? `Results for “${q}”` : "Search all deals")
    : cat !== "all" ? catOf(cat).label : "All deals";

  const Filters = (
    <div className="filters">
      <div className="filter-block">
        <div className="filter-head"><span>Category</span></div>
        <label className="radio-row">
          <input type="radio" checked={cat === "all"} onChange={() => setCat("all")} />
          <span>All categories</span>
        </label>
        {PZ.categories.map((c) => (
          <label key={c.id} className="radio-row">
            <input type="radio" checked={cat === c.id} onChange={() => setCat(c.id)} />
            <Icon name={c.icon} size={15} style={{ color: c.tint }} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      <div className="filter-block">
        <div className="filter-head"><span>Price</span></div>
        {PRICE_BANDS.map((b) => (
          <label key={b.id} className="check-row">
            <input type="checkbox" checked={bands.has(b.id)} onChange={() => toggleBand(b.id)} />
            <span className="checkbox"><Icon name="check" size={13} /></span>
            <span>{b.label}</span>
          </label>
        ))}
      </div>
      <div className="filter-block">
        <div className="filter-head"><span>Rating</span></div>
        {[4.5, 4, 3.5].map((r) => (
          <label key={r} className="radio-row">
            <input type="radio" checked={minRating === r} onChange={() => setMinRating(r)} />
            <Stars value={r} showNum={false} size={14} />
            <span>{r}+ & up</span>
          </label>
        ))}
        <label className="radio-row">
          <input type="radio" checked={minRating === 0} onChange={() => setMinRating(0)} />
          <span>Any rating</span>
        </label>
      </div>
      {activeCount > 0 && <button className="btn btn-ghost btn-sm btn-block" onClick={clearAll}>Clear all filters</button>}
    </div>
  );

  return (
    <div className="wrap results">
      <div className="results-top">
        <div className="results-head">
          <h1 className="results-title">{heading}</h1>
          <p className="muted">{results.length} {results.length === 1 ? "deal" : "deals"} available</p>
        </div>
        <div className="results-controls">
          <button className="btn btn-outline btn-sm filter-toggle hide-desktop" onClick={() => setFiltersOpen(true)}>
            <Icon name="sliders" size={16} /> Filters {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
          </button>
          <div className="sort-select">
            <Icon name="filter" size={15} className="muted" />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <Icon name="chevronDown" size={15} className="muted sort-caret" />
          </div>
        </div>
      </div>

      <div className="results-body">
        <aside className="results-sidebar hide-mobile">{Filters}</aside>
        <div className="results-main">
          {results.length ? <DealGrid deals={results} {...handlers} />
            : <Empty title="No deals match your filters" sub="Try widening your price range or clearing a filter." />}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {filtersOpen && (
        <div className="sheet-overlay" onClick={() => setFiltersOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Filters</h3>
              <button className="icon-btn" onClick={() => setFiltersOpen(false)}><Icon name="x" size={20} /></button>
            </div>
            <div className="sheet-body">{Filters}</div>
            <div className="sheet-foot">
              <button className="btn btn-grad btn-block btn-lg" onClick={() => setFiltersOpen(false)}>Show {results.length} deals</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { HomeScreen, ResultsScreen, DealGrid });
