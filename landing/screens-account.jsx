/* Paylez — Checkout flow + Account / My vouchers */

/* ════════ CHECKOUT ════════ */
function CheckoutScreen({ cart, setCart, go, savedSet, openDeal, openMerchant, onSave, completeOrder, member }) {
  const [step, setStep] = useState(0); // 0 cart, 1 payment, 2 done
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [card, setCard] = useState({ name: "", num: "", exp: "", cvc: "", email: "" });
  const [errors, setErrors] = useState({});
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const subtotal = cart.reduce((s, it) => s + it.option.price * it.qty, 0);
  const wasTotal = cart.reduce((s, it) => s + it.option.original * it.qty, 0);
  const memberDisc = member ? subtotal * 0.1 : 0;
  const promoDisc = promoApplied ? subtotal * 0.15 : 0;
  const fees = cart.length ? 1.99 : 0;
  const total = Math.max(0, subtotal - memberDisc - promoDisc + fees);

  const setQty = (i, d) => setCart((c) => c.map((it, idx) => idx === i ? { ...it, qty: Math.max(1, Math.min(8, it.qty + d)) } : it));
  const remove = (i) => setCart((c) => c.filter((_, idx) => idx !== i));
  const applyPromo = () => { if (promo.trim().toUpperCase() === "PAYLEZ15") setPromoApplied(true); else setPromoApplied("bad"); };

  const validate = () => {
    const e = {};
    if (!card.name.trim()) e.name = 1;
    if (card.num.replace(/\s/g, "").length < 15) e.num = 1;
    if (!/^\d\d\/\d\d$/.test(card.exp)) e.exp = 1;
    if (card.cvc.length < 3) e.cvc = 1;
    if (!/.+@.+\..+/.test(card.email)) e.email = 1;
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const pay = () => { if (validate()) { setStep(2); completeOrder(cart, total); } };

  if (cart.length === 0 && step < 2) {
    return (
      <div className="wrap" style={{ paddingTop: 40 }}>
        <Empty icon="cart" title="Your cart is empty" sub="Browse deals and add something you love." />
        <div style={{ textAlign: "center" }}><button className="btn btn-grad btn-lg" onClick={() => go("home", {})}>Explore deals</button></div>
      </div>
    );
  }

  const Steps = (
    <div className="checkout-steps">
      {["Cart", "Payment", "Confirmation"].map((s, i) => (
        <div key={s} className={"cstep" + (i === step ? " active" : "") + (i < step ? " done" : "")}>
          <span className="cstep-dot">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
          <span className="cstep-label">{s}</span>
          {i < 2 && <span className="cstep-line" />}
        </div>
      ))}
    </div>
  );

  if (step === 2) {
    return (
      <div className="wrap checkout">
        {Steps}
        <div className="confirm fade-up">
          <span className="confirm-ico"><Icon name="checkCircle" size={44} fill /></span>
          <h1>You're all set! 🎉</h1>
          <p className="muted">A confirmation and your voucher{cart.length > 1 ? "s" : ""} have been sent to <strong>{card.email || "your email"}</strong>.</p>
          <div className="confirm-card">
            <div className="confirm-row"><span className="muted">Order number</span><strong>#PZ{Math.floor(100000 + Math.random()*900000)}</strong></div>
            <div className="confirm-row"><span className="muted">Items</span><strong>{cart.length}</strong></div>
            <div className="confirm-row"><span className="muted">Total paid</span><strong>{money(total)}</strong></div>
          </div>
          <div className="confirm-actions">
            <button className="btn btn-grad btn-lg" onClick={() => go("account", { tab: "vouchers" })}><Icon name="qr" size={18} /> View my vouchers</button>
            <button className="btn btn-outline btn-lg" onClick={() => go("home", {})}>Keep shopping</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap checkout">
      {Steps}
      <div className="checkout-grid">
        <div className="checkout-main">
          {step === 0 && (
            <div className="fade-in">
              <h2 className="block-h" style={{ marginTop: 0 }}>Review your cart</h2>
              <div className="cart-list">
                {cart.map((it, i) => (
                  <div key={i} className="cart-item">
                    <img src={it.deal.image} alt="" onClick={() => openDeal(it.deal.id)} />
                    <div className="cart-item-info">
                      <button className="cart-item-merch" onClick={() => openMerchant(it.deal.merchant)}>{merchantOf(it.deal).name}</button>
                      <strong className="cart-item-title" onClick={() => openDeal(it.deal.id)}>{it.deal.title}</strong>
                      <span className="muted cart-item-opt">{it.option.label}</span>
                      <div className="cart-item-bottom">
                        <div className="stepper sm">
                          <button onClick={() => setQty(i, -1)} disabled={it.qty <= 1}>–</button>
                          <span>{it.qty}</span>
                          <button onClick={() => setQty(i, 1)}>+</button>
                        </div>
                        <button className="cart-remove" onClick={() => remove(i)}><Icon name="trash" size={15} /> Remove</button>
                      </div>
                    </div>
                    <div className="cart-item-price">
                      <span className="price-now">{money(it.option.price * it.qty)}</span>
                      <span className="price-was">{money(it.option.original * it.qty)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="fade-in">
              <h2 className="block-h" style={{ marginTop: 0 }}>Payment details</h2>
              <div className="pay-form">
                <Field label="Email for vouchers" err={errors.email}>
                  <input value={card.email} onChange={(e) => setCard({ ...card, email: e.target.value })} placeholder="you@email.com" />
                </Field>
                <Field label="Name on card" err={errors.name}>
                  <input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="Jane Appleseed" />
                </Field>
                <Field label="Card number" err={errors.num}>
                  <div className="input-icon">
                    <input value={card.num} inputMode="numeric"
                      onChange={(e) => setCard({ ...card, num: e.target.value.replace(/[^\d]/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19) })}
                      placeholder="1234 5678 9012 3456" />
                    <Icon name="lock" size={16} className="muted" />
                  </div>
                </Field>
                <div className="field-row">
                  <Field label="Expiry" err={errors.exp}>
                    <input value={card.exp} placeholder="MM/YY"
                      onChange={(e) => { let v = e.target.value.replace(/[^\d]/g, "").slice(0,4); if (v.length>2) v = v.slice(0,2)+"/"+v.slice(2); setCard({ ...card, exp: v }); }} />
                  </Field>
                  <Field label="CVC" err={errors.cvc}>
                    <input value={card.cvc} inputMode="numeric" placeholder="123"
                      onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })} />
                  </Field>
                </div>
                <p className="pay-secure muted"><Icon name="lock" size={14} /> Payments are encrypted and secure. This is a demo — no real charge.</p>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <aside className="checkout-summary">
          <div className="summary-card">
            <h3>Order summary</h3>
            <div className="summary-line"><span className="muted">Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="summary-line"><span className="muted">Original price</span><span className="price-was">{money(wasTotal)}</span></div>
            {member && <div className="summary-line green"><span><Icon name="bolt" size={13} fill /> Paylez+ member −10%</span><span>−{money(memberDisc)}</span></div>}
            {promoApplied === true && <div className="summary-line green"><span>Promo PAYLEZ15</span><span>−{money(promoDisc)}</span></div>}
            <div className="summary-line"><span className="muted">Service fee</span><span>{money(fees)}</span></div>
            <div className="promo-row">
              <input value={promo} onChange={(e) => { setPromo(e.target.value); setPromoApplied(false); }} placeholder="Promo code" />
              <button className="btn btn-ghost btn-sm" onClick={applyPromo}>Apply</button>
            </div>
            {promoApplied === "bad" && <p className="promo-err">Code not recognized. Try PAYLEZ15.</p>}
            <div className="summary-total"><span>Total</span><span className="price-now" style={{ fontSize: "1.5rem" }}>{money(total)}</span></div>
            <div className="summary-save badge badge-save">You're saving {money(wasTotal - subtotal + memberDisc + promoDisc)}</div>

            {step === 0
              ? <button className="btn btn-grad btn-lg btn-block" onClick={() => setStep(1)} style={{ marginTop: 16 }}>Continue to payment</button>
              : <button className="btn btn-grad btn-lg btn-block" onClick={pay} style={{ marginTop: 16 }}><Icon name="lock" size={16} /> Pay {money(total)}</button>}
            {step === 1 && <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setStep(0)}>Back to cart</button>}
            <ul className="buybox-assure" style={{ marginTop: 16 }}>
              <li><Icon name="shield" size={15} /> Buyer guarantee included</li>
              <li><Icon name="clock" size={15} /> Free reschedule anytime</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, err, children }) {
  return (
    <label className={"field" + (err ? " field-err" : "")}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/* ════════ ACCOUNT / MY VOUCHERS ════════ */
function AccountScreen({ params, go, orders, savedSet, onSave, openDeal, openMerchant, member, setMember }) {
  const [tab, setTab] = useState(params.tab || "vouchers");
  useEffect(() => { if (params.tab) setTab(params.tab); }, [params.tab]);
  const savedDeals = PZ.deals.filter((d) => savedSet.has(d.id));
  const vouchers = orders.flatMap((o) => o.items.map((it) => ({ ...it, order: o.id })));

  return (
    <div className="wrap account">
      <header className="account-head">
        <img className="avatar-lg" src="https://i.pravatar.cc/120?u=paylezuser" alt="" />
        <div>
          <h1>Hi, Jordan 👋</h1>
          <p className="muted">jordan@email.com · Member since 2024</p>
        </div>
        {member
          ? <span className="badge badge-deal account-plus"><Icon name="bolt" size={13} fill /> Paylez+ member</span>
          : <button className="btn btn-grad btn-sm" onClick={() => setMember(true)}>Upgrade to Paylez+</button>}
      </header>

      <div className="tabs account-tabs">
        {[["vouchers", `My vouchers (${vouchers.length})`], ["saved", `Saved (${savedDeals.length})`], ["settings", "Settings"]].map(([id, l]) => (
          <button key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === "vouchers" && (
        <div className="fade-in">
          {vouchers.length ? (
            <div className="voucher-grid">
              {vouchers.map((v, i) => {
                const m = merchantOf(v.deal);
                return (
                  <div key={i} className="voucher">
                    <div className="voucher-left">
                      <div className="voucher-top">
                        <CatGlyph id={v.deal.category} size={38} />
                        <span className="badge badge-save" style={{ marginLeft: "auto" }}>Active</span>
                      </div>
                      <button className="voucher-merch" onClick={() => openMerchant(m.id)}>{m.name}</button>
                      <strong className="voucher-title" onClick={() => openDeal(v.deal.id)}>{v.deal.title}</strong>
                      <span className="muted voucher-opt">{v.option.label} · Qty {v.qty}</span>
                      <div className="voucher-foot">
                        <span className="muted">Code <strong className="vcode">PZ-{v.deal.id.toUpperCase()}-{(1000+i*37)%9000+1000}</strong></span>
                        <span className="muted">Exp. 6 mo</span>
                      </div>
                    </div>
                    <div className="voucher-stub">
                      <div className="qr"><Icon name="qr" size={56} /></div>
                      <span>Scan to redeem</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="receipt" title="No vouchers yet" sub="Deals you buy will appear here, ready to redeem." />}
        </div>
      )}

      {tab === "saved" && (
        <div className="fade-in" style={{ marginTop: 8 }}>
          {savedDeals.length
            ? <DealGrid deals={savedDeals} onOpen={openDeal} onMerchant={openMerchant} savedSet={savedSet} onSave={onSave} />
            : <Empty icon="heart" title="No saved deals" sub="Tap the heart on any deal to save it for later." />}
        </div>
      )}

      {tab === "settings" && (
        <div className="fade-in settings">
          <div className="settings-card">
            <h3 className="block-h" style={{ marginTop: 0 }}>Membership</h3>
            <div className="setting-row">
              <div><strong>Paylez+ membership</strong><p className="muted">Extra 10% off every deal, free reschedules, early access.</p></div>
              <label className="switch"><input type="checkbox" checked={member} onChange={(e) => setMember(e.target.checked)} /><span /></label>
            </div>
          </div>
          <div className="settings-card">
            <h3 className="block-h" style={{ marginTop: 0 }}>Profile</h3>
            {[["Full name","Jordan Rivera"],["Email","jordan@email.com"],["Phone","+1 (555) 010-9942"],["City","New York, NY"]].map(([l,v]) => (
              <div key={l} className="setting-row"><div><strong>{l}</strong><p className="muted">{v}</p></div><button className="btn btn-ghost btn-sm">Edit</button></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CheckoutScreen, AccountScreen, Field });
