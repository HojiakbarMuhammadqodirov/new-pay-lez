/* Paylez Mobile — app shell, routing, bottom nav, tweaks */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primary": "#8C2F3D",
  "accent": "#9C7B3F",
  "fontPair": "editorial",
  "radius": 16,
  "dark": false
}/*EDITMODE-END*/;

const FONT_PAIRS = {
  editorial: { display: '"Newsreader", Georgia, serif', body: '"Plus Jakarta Sans", sans-serif', weight: 600, label: "Newsreader × Jakarta" },
  grotesk:   { display: '"Schibsted Grotesk", sans-serif', body: '"Plus Jakarta Sans", sans-serif', weight: 800, label: "Schibsted × Jakarta" },
  sora:      { display: '"Sora", sans-serif', body: '"Manrope", sans-serif', weight: 800, label: "Sora × Manrope" },
};
const PRIMARY_OPTS = ["#8C2F3D", "#1F3A3D", "#2C3A52", "#3F5743", "#5B3A52"];
const ACCENT_OPTS  = ["#9C7B3F", "#8C2F3D", "#1F3A3D", "#7A6A52", "#3F5743"];

const TAB_OF = { home: "home", explore: "explore", search: "explore", browse: "explore", checkout: "cart", account: "account" };
const NO_TABBAR = new Set(["deal", "merchant"]);

function BottomNav({ tab, cartCount, savedCount, onSelect }) {
  const items = [
    { id: "home", icon: "home", label: "Home" },
    { id: "explore", icon: "grid", label: "Explore" },
    { id: "cart", icon: "cart", label: "Cart", badge: cartCount },
    { id: "account", icon: "user", label: "Account", badge: savedCount },
  ];
  return (
    <nav className="tabbar">
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button key={it.id} className={"tab-item" + (active ? " active" : "")} onClick={() => onSelect(it.id)}>
            <span className="tab-ico-wrap">
              <Icon name={it.icon} size={24} fill={active && it.id === "home"} stroke={active ? 2.2 : 2} />
              {it.badge > 0 && <span className="tab-badge">{it.badge}</span>}
            </span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState({ name: "home", params: {} });
  const histRef = useRef([]);
  const [saved, setSaved] = useState(new Set());
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [member, setMember] = useState(false);
  const [toast, setToast] = useState("");
  const toastT = useRef();
  const location = "New York";

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = t.dark ? "dark" : "light";
    r.style.setProperty("--rose", t.primary);
    r.style.setProperty("--primary", t.primary);
    r.style.setProperty("--accent", t.accent);
    r.style.setProperty("--gold", t.accent);
    r.style.setProperty("--brand-grad", `linear-gradient(135deg, ${t.primary} 0%, ${mix(t.primary, "#241015", .45)} 100%)`);
    r.style.setProperty("--r", t.radius + "px");
    r.style.setProperty("--r-sm", (t.radius * 0.6) + "px");
    r.style.setProperty("--r-lg", (t.radius * 1.5) + "px");
    const fp = FONT_PAIRS[t.fontPair] || FONT_PAIRS.editorial;
    r.style.setProperty("--font-display", fp.display);
    r.style.setProperty("--font-body", fp.body);
    r.style.setProperty("--display-weight", fp.weight || 600);
  }, [t]);

  const flash = (msg) => { setToast(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2000); };
  const navigate = (name, params = {}) => { histRef.current.push(view); setView({ name, params }); };
  const back = () => { const h = histRef.current; setView(h.length ? h.pop() : { name: "home", params: {} }); };
  const selectTab = (tabId) => {
    histRef.current = [];
    const screen = tabId === "cart" ? "checkout" : tabId;
    setView({ name: screen, params: {} });
  };

  const openDeal = (id) => navigate("deal", { id });
  const openMerchant = (id) => navigate("merchant", { id });
  const onSave = (id) => setSaved((s) => { const n = new Set(s); if (n.has(id)) { n.delete(id); flash("Removed from saved"); } else { n.add(id); flash("Saved to your list ❤"); } return n; });
  const addToCart = (item) => { setCart((c) => [...c, item]); flash("Added to cart"); };
  const buyNow = (item) => { setCart((c) => [...c, item]); navigate("checkout", {}); };
  const completeOrder = (items, total) => { setOrders((o) => [...o, { id: Date.now(), items, total }]); setCart([]); };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const shared = { go: navigate, back, openDeal, openMerchant, savedSet: saved, onSave, flash };
  const tab = TAB_OF[view.name] || null;
  const showTabbar = !NO_TABBAR.has(view.name);

  let screen;
  switch (view.name) {
    case "home": screen = <HomeScreen key="home" {...shared} location={location} />; break;
    case "explore": screen = <ResultsScreen key="explore" mode="browse" params={view.params} {...shared} />; break;
    case "browse": screen = <ResultsScreen key={"browse" + (view.params.cat||"")} mode="browse" params={view.params} {...shared} />; break;
    case "search": screen = <ResultsScreen key="search" mode="search" params={view.params} {...shared} />; break;
    case "deal": screen = <DealScreen key={"deal" + view.params.id} dealId={view.params.id} {...shared} addToCart={addToCart} buyNow={buyNow} />; break;
    case "merchant": screen = <MerchantScreen key={"m" + view.params.id} merchantId={view.params.id} {...shared} />; break;
    case "checkout": screen = <CheckoutScreen key="checkout" cart={cart} setCart={setCart} {...shared} completeOrder={completeOrder} member={member} />; break;
    case "account": screen = <AccountScreen key="account" params={view.params} {...shared} orders={orders} member={member} setMember={setMember} />; break;
    default: screen = <HomeScreen {...shared} location={location} />;
  }

  return (
    <React.Fragment>
      <Device>
        {screen}
        {showTabbar && <BottomNav tab={tab} cartCount={cartCount} savedCount={saved.size} onSelect={selectTab} />}
        <Toast msg={toast} />
      </Device>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor label="Primary" value={t.primary} options={PRIMARY_OPTS} onChange={(v) => setTweak("primary", v)} />
        <TweakColor label="Accent" value={t.accent} options={ACCENT_OPTS} onChange={(v) => setTweak("accent", v)} />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak("dark", v)} />
        <TweakSection label="Type & shape" />
        <TweakSelect label="Font pairing" value={t.fontPair}
          options={Object.keys(FONT_PAIRS).map((k) => ({ value: k, label: FONT_PAIRS[k].label }))}
          onChange={(v) => setTweak("fontPair", v)} />
        <TweakSlider label="Corner radius" value={t.radius} min={4} max={28} step={2} unit="px" onChange={(v) => setTweak("radius", v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

function mix(a, b, w) {
  const p = (h) => [1,3,5].map((i) => parseInt(h.slice(i, i+2), 16));
  const [r1,g1,b1] = p(a), [r2,g2,b2] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * w).toString(16).padStart(2, "0");
  return `#${c(r1,r2)}${c(g1,g2)}${c(b1,b2)}`;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
