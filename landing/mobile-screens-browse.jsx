/* Paylez Mobile — Home + Explore/Search */

/* ════════ HOME ════════ */
function HomeScreen({ go, openDeal, openMerchant, savedSet, onSave, location }) {
  const [ref, scrolled] = useScrolled();
  const featured = PZ.deals.filter((d) => d.badges && d.badges.length).slice(0, 5);
  const trending = [...PZ.deals].sort((a, b) => b.sold - a.sold).slice(0, 6);
  const h = { onOpen: openDeal, onMerchant: openMerchant, savedSet, onSave };

  return (
    <div className="pz-scroll has-tabbar screen-enter" ref={ref}>
      <header className={"app-header" + (scrolled ? " scrolled" : "")}>
        <div className="app-header-row" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <span className="greeting-loc"><Icon name="pin" size={14} className="muted" /> {location}</span>
            <h1 className="app-header-title">Treat yourself</h1>
          </div>
          <button className="avatar-btn" onClick={() => go("account", {})} aria-label="Account">
            <img src="https://i.pravatar.cc/96?u=paylezuser" alt="" />
          </button>
        </div>
        <button className="searchbar" style={{ width: "100%" }} onClick={() => go("search", {})}>
          <Icon name="search" size={19} /> Massage, brunch, helicopter tour…
        </button>
      </header>

      {/* Categories */}
      <div className="cat-rail">
        {PZ.categories.map((c) => (
          <button key={c.id} className="cat-pill" onClick={() => go("browse", { cat: c.id })}>
            <span className="cat-pill-ico" style={{ background: `color-mix(in oklab, ${c.tint} 15%, var(--surface))`,
              color: c.tint, borderColor: `color-mix(in oklab, ${c.tint} 26%, transparent)` }}>
              <Icon name={c.icon} size={26} stroke={1.9} />
            </span>
            <span className="cat-pill-label">{c.label}</span>
          </button>
        ))}
      </div>

      {/* Featured carousel */}
      <section className="section">
        <SectionHead title="Featured this week" sub="Editor-picked, going fast" action="All" onAction={() => go("browse", {})} />
      </section>
      <div className="rail">
        {featured.map((d) => (
          <FeatCard key={d.id} deal={d} onOpen={openDeal} onMerchant={openMerchant} saved={savedSet.has(d.id)} onSave={onSave} />
        ))}
      </div>

      {/* Promo */}
      <div className="section">
        <div className="promo" onClick={() => go("account", { tab: "settings" })}>
          <div className="promo-glow" />
          <span className="promo-eyebrow">Paylez+ Membership</span>
          <h3>Save an extra 10% on every deal.</h3>
          <p>Free cancellations, early access to drops, members-only prices.</p>
          <button className="btn btn-sm">Try free for 30 days</button>
        </div>
      </div>

      {/* Trending */}
      <section className="section">
        <SectionHead title={`Trending near ${location}`} sub="What everyone's buying" action="All" onAction={() => go("browse", {})} />
        <DealList deals={trending} {...h} />
      </section>

      {/* Trust */}
      <section className="section">
        <div className="trust">
          {[
            { i: "shield", t: "Buyer guarantee", s: "Refund if you can't redeem" },
            { i: "verified", t: "Verified merchants", s: "Every business vetted" },
            { i: "clock", t: "Flexible booking", s: "Reschedule in a tap" },
            { i: "gift", t: "Easy gifting", s: "Send a deal in seconds" },
          ].map((x) => (
            <div key={x.t} className="trust-item">
              <span className="trust-ico"><Icon name={x.i} size={20} fill={x.i === "verified"} /></span>
              <div><strong>{x.t}</strong><p className="muted">{x.s}</p></div>
            </div>
          ))}
        </div>
      </section>
      <div style={{ height: 20 }} />
    </div>
  );
}

/* ════════ EXPLORE / SEARCH ════════ */
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
  const [ref, scrolled] = useScrolled();
  const [cat, setCat] = useState(params.cat || "all");
  const [bands, setBands] = useState(new Set());
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("pop");
  const [q, setQ] = useState(params.q || "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (mode === "search" && inputRef.current) inputRef.current.focus(); }, [mode]);

  const results = useMemo(() => {
    let list = PZ.deals.slice();
    if (q.trim()) {
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
  }, [q, cat, bands, minRating, sort]);

  const toggleBand = (id) => setBands((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const activeCount = (cat !== "all" ? 1 : 0) + bands.size + (minRating ? 1 : 0);
  const clearAll = () => { setCat("all"); setBands(new Set()); setMinRating(0); };
  const h = { onOpen: openDeal, onMerchant: openMerchant, savedSet, onSave };

  const Filters = (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div className="block-h" style={{ margin: "0 0 10px" }}>Price</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PRICE_BANDS.map((b) => (
            <button key={b.id} className={"chip" + (bands.has(b.id) ? " active" : "")} onClick={() => toggleBand(b.id)}>{b.label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="block-h" style={{ margin: "0 0 10px" }}>Minimum rating</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[{ v: 0, l: "Any" }, { v: 3.5, l: "3.5+" }, { v: 4, l: "4.0+" }, { v: 4.5, l: "4.5+" }].map((r) => (
            <button key={r.v} className={"chip" + (minRating === r.v ? " active" : "")} onClick={() => setMinRating(r.v)}>
              {r.v > 0 && <Icon name="star" size={13} fill style={{ color: minRating === r.v ? "inherit" : "var(--star)" }} />}{r.l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="block-h" style={{ margin: "0 0 10px" }}>Sort by</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SORTS.map((s) => (
            <button key={s.id} className={"option-card" + (sort === s.id ? " active" : "")} onClick={() => setSort(s.id)} style={{ padding: 12 }}>
              <span className="option-radio">{sort === s.id && <span className="option-dot" />}</span>
              <span className="option-label" style={{ fontWeight: 600 }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="pz-scroll has-tabbar screen-enter" ref={ref}>
      <header className={"app-header" + (scrolled ? " scrolled" : "")}>
        <div className="app-header-row" style={{ marginBottom: 12 }}>
          <h1 className="app-header-title">{mode === "search" ? "Search" : "Explore"}</h1>
        </div>
        <div className="searchbar">
          <Icon name="search" size={19} className={q ? "" : "muted"} style={{ color: q ? "var(--text)" : undefined }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals, places, activities…" />
          {q && <button onClick={() => setQ("")} aria-label="Clear" style={{ color: "var(--text-faint)" }}><Icon name="x" size={17} /></button>}
        </div>
        {/* category chips */}
        <div className="cat-rail" style={{ margin: "12px 0 0" }}>
          <button className={"chip" + (cat === "all" ? " active" : "")} onClick={() => setCat("all")}>All</button>
          {PZ.categories.map((c) => (
            <button key={c.id} className={"chip" + (cat === c.id ? " active" : "")} onClick={() => setCat(c.id)}>
              <Icon name={c.icon} size={14} style={{ color: cat === c.id ? "inherit" : c.tint }} /> {c.label}
            </button>
          ))}
        </div>
      </header>

      <div className="section" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <p className="muted" style={{ fontSize: ".9rem", fontWeight: 600 }}>{results.length} {results.length === 1 ? "deal" : "deals"}</p>
          <button className="chip" onClick={() => setFiltersOpen(true)} style={{ height: 38 }}>
            <Icon name="sliders" size={15} /> Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
        </div>
        {results.length ? <DealGridList deals={results} {...h} />
          : <Empty title="No deals match" sub="Try widening your price range or clearing a filter." />}
        <div style={{ height: 20 }} />
      </div>

      {filtersOpen && (
        <Sheet title="Filters & sort" onClose={() => setFiltersOpen(false)}
          foot={
            <div style={{ display: "flex", gap: 10 }}>
              {activeCount > 0 && <button className="btn btn-ghost btn-lg" onClick={clearAll}>Clear</button>}
              <button className="btn btn-grad btn-lg" style={{ flex: 1 }} onClick={() => setFiltersOpen(false)}>Show {results.length} deals</button>
            </div>
          }>
          {Filters}
        </Sheet>
      )}
    </div>
  );
}

Object.assign(window, { HomeScreen, ResultsScreen });
