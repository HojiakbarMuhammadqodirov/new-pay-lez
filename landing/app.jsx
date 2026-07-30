/* Paylez — app shell, routing, header/nav/footer, tweaks */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primary": "#8C2F3D",
  "accent": "#9C7B3F",
  "fontPair": "editorial",
  "radius": 9,
  "density": "regular",
  "dark": false
}/*EDITMODE-END*/;

const FONT_PAIRS = {
  editorial: { display: '"Newsreader", Georgia, serif', body: '"Plus Jakarta Sans", sans-serif', weight: 600, label: "Newsreader × Jakarta" },
  jakarta: { display: '"Schibsted Grotesk", sans-serif', body: '"Plus Jakarta Sans", sans-serif', weight: 800, label: "Schibsted × Jakarta" },
  sora:    { display: '"Sora", sans-serif', body: '"Manrope", sans-serif', weight: 800, label: "Sora × Manrope" },
  manrope: { display: '"Manrope", sans-serif', body: '"Manrope", sans-serif', weight: 800, label: "Manrope" },
};
const PRIMARY_OPTS = ["#8C2F3D", "#1F3A3D", "#2C3A52", "#3F5743", "#5B3A52"];
const ACCENT_OPTS  = ["#9C7B3F", "#8C2F3D", "#1F3A3D", "#7A6A52", "#3F5743"];

/* ── Logo ── */
function Logo({ onClick, small }) {
  return (
    <button className="logo" onClick={onClick} aria-label="Paylez home">
      <span className="logo-mark"><span className="logo-mark-inner">P</span></span>
      {!small && <span className="logo-word">paylez</span>}
    </button>
  );
}

function Header({ go, route, cartCount, onSearch, savedCount }) {
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <header className={"header" + (scrolled ? " scrolled" : "")}>
      <div className="wrap header-inner">
        <Logo onClick={() => go("home", {})} />
        <div className="header-search hide-mobile">
          <Icon name="search" size={18} className="muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals, places, activities…"
            onKeyDown={(e) => { if (e.key === "Enter") go("search", { q: q.trim() }); }} />
        </div>
        <nav className="header-nav">
          <button className={"nav-link hide-mobile" + (route.name === "browse" ? " active" : "")} onClick={() => go("browse", {})}>Explore</button>
          <button className="nav-icon hide-mobile" onClick={() => go("account", { tab: "saved" })} aria-label="Saved">
            <Icon name="heart" size={21} />{savedCount > 0 && <span className="nav-badge">{savedCount}</span>}
          </button>
          <button className="nav-icon" onClick={() => go("checkout", {})} aria-label="Cart">
            <Icon name="cart" size={21} />{cartCount > 0 && <span className="nav-badge">{cartCount}</span>}
          </button>
          <button className="nav-avatar" onClick={() => go("account", {})} aria-label="Account">
            <img src="https://i.pravatar.cc/64?u=paylezuser" alt="" />
          </button>
        </nav>
      </div>
    </header>
  );
}

function BottomNav({ go, route, cartCount, savedCount }) {
  const items = [
    { id: "home", icon: "home", label: "Home" },
    { id: "browse", icon: "grid", label: "Explore" },
    { id: "checkout", icon: "cart", label: "Cart", badge: cartCount },
    { id: "account", icon: "user", label: "Account", badge: savedCount, sub: "saved" },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((it) => {
        const active = route.name === it.id;
        return (
          <button key={it.id} className={"bn-item" + (active ? " active" : "")} onClick={() => go(it.id, {})}>
            <span className="bn-ico"><Icon name={it.icon} size={23} fill={active && it.id === "home"} />
              {it.badge > 0 && <span className="bn-badge">{it.badge}</span>}</span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Footer({ go }) {
  const cols = [
    ["Company", ["About Paylez", "Careers", "Press", "Paylez+"]],
    ["Categories", PZ.categories.slice(0, 5).map((c) => c.label)],
    ["Support", ["Help center", "Buyer guarantee", "Redeem a voucher", "Contact us"]],
  ];
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="footer-brand">
          <Logo onClick={() => go("home", {})} />
          <p className="muted">Hand-picked local deals, up to 70% off. Treat yourself for less.</p>
          <div className="footer-social">
            {["bolt", "gift", "heart"].map((i) => <span key={i} className="fsoc"><Icon name={i} size={16} fill /></span>)}
          </div>
        </div>
        {cols.map(([h, links]) => (
          <div key={h} className="footer-col">
            <h5>{h}</h5>
            {links.map((l) => <button key={l} onClick={() => go("browse", {})}>{l}</button>)}
          </div>
        ))}
      </div>
      <div className="footer-bottom wrap">
        <span className="faint">© 2026 Paylez, Inc. · A concept prototype</span>
        <span className="faint">Privacy · Terms · Cookies</span>
      </div>
    </footer>
  );
}

/* ── Root ── */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState({ name: "home", params: {} });
  const [saved, setSaved] = useState(new Set());
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [member, setMember] = useState(false);
  const [toast, setToast] = useState("");
  const toastT = useRef();
  const location = "New York";

  // apply tweaks → CSS vars / classes
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = t.dark ? "dark" : "light";
    r.style.setProperty("--rose", t.primary);
    r.style.setProperty("--primary", t.primary);
    r.style.setProperty("--accent", t.accent);
    r.style.setProperty("--violet", t.accent);
    r.style.setProperty("--brand-grad", `linear-gradient(135deg, ${t.primary} 0%, ${mix(t.primary, "#241015", .5)} 100%)`);
    r.style.setProperty("--r", t.radius + "px");
    const fp = FONT_PAIRS[t.fontPair] || FONT_PAIRS.editorial;
    r.style.setProperty("--font-display", fp.display);
    r.style.setProperty("--font-body", fp.body);
    r.style.setProperty("--display-weight", fp.weight || 600);
    document.body.className = "density-" + t.density;
  }, [t]);

  const flash = (msg) => { setToast(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2200); };
  const go = (name, params = {}) => { setRoute({ name, params }); window.scrollTo({ top: 0, behavior: "instant" }); };
  const openDeal = (id) => go("deal", { id });
  const openMerchant = (id) => go("merchant", { id });
  const onSave = (id) => setSaved((s) => { const n = new Set(s); if (n.has(id)) { n.delete(id); flash("Removed from saved"); } else { n.add(id); flash("Saved to your list ❤"); } return n; });
  const addToCart = (item) => { setCart((c) => [...c, item]); flash("Added to cart"); };
  const buyNow = (item) => { setCart((c) => [...c, item]); go("checkout", {}); };
  const completeOrder = (items, total) => { setOrders((o) => [...o, { id: Date.now(), items, total }]); setCart([]); };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const shared = { go, openDeal, openMerchant, savedSet: saved, onSave };

  let screen;
  switch (route.name) {
    case "home": screen = <HomeScreen {...shared} location={location} />; break;
    case "browse": screen = <ResultsScreen mode="browse" params={route.params} {...shared} />; break;
    case "search": screen = <ResultsScreen mode="search" params={route.params} {...shared} />; break;
    case "deal": screen = <DealScreen dealId={route.params.id} {...shared} addToCart={addToCart} buyNow={buyNow} />; break;
    case "merchant": screen = <MerchantScreen merchantId={route.params.id} {...shared} />; break;
    case "checkout": screen = <CheckoutScreen cart={cart} setCart={setCart} {...shared} completeOrder={completeOrder} member={member} />; break;
    case "account": screen = <AccountScreen params={route.params} {...shared} orders={orders} member={member} setMember={setMember} />; break;
    default: screen = <HomeScreen {...shared} location={location} />;
  }

  return (
    <div className="app-shell">
      <Header go={go} route={route} cartCount={cartCount} savedCount={saved.size} />
      <main className="app-main">{screen}</main>
      <Footer go={go} />
      <BottomNav go={go} route={route} cartCount={cartCount} savedCount={saved.size} />
      <Toast msg={toast} />

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor label="Primary" value={t.primary} options={PRIMARY_OPTS} onChange={(v) => setTweak("primary", v)} />
        <TweakColor label="Accent" value={t.accent} options={ACCENT_OPTS} onChange={(v) => setTweak("accent", v)} />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak("dark", v)} />
        <TweakSection label="Type & shape" />
        <TweakSelect label="Font pairing" value={t.fontPair}
          options={Object.keys(FONT_PAIRS).map((k) => ({ value: k, label: FONT_PAIRS[k].label }))}
          onChange={(v) => setTweak("fontPair", v)} />
        <TweakSlider label="Corner radius" value={t.radius} min={0} max={26} step={2} unit="px" onChange={(v) => setTweak("radius", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
      </TweaksPanel>
    </div>
  );
}

/* hex mix helper */
function mix(a, b, w) {
  const p = (h) => [1,3,5].map((i) => parseInt(h.slice(i, i+2), 16));
  const [r1,g1,b1] = p(a), [r2,g2,b2] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * w).toString(16).padStart(2, "0");
  return `#${c(r1,r2)}${c(g1,g2)}${c(b1,b2)}`;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
