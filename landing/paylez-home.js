/* ════════════════════════════════════════════════════════════
   Paylez homepage — motion, interaction & Tweaks protocol
   ════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  /* ── Tweaks state (host rewrites this block on disk) ── */
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "dark": true
  }/*EDITMODE-END*/;
  const state = Object.assign({}, TWEAK_DEFAULTS);

  function applyTheme() {
    root.dataset.theme = state.dark ? "dark" : "light";
    const sw = document.getElementById("tw-dark");
    if (sw) sw.checked = state.dark;
  }

  function setTweak(key, val) {
    state[key] = val;
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [key]: val } }, "*"); } catch (e) {}
    applyTheme();
  }

  /* ── Header scroll state ── */
  const header = document.querySelector(".site-header");
  const onScroll = () => { if (header) header.classList.toggle("scrolled", window.scrollY > 12); };

  /* ── Parallax (rAF-batched) ── */
  const px = [...document.querySelectorAll("[data-parallax]")];
  let ticking = false;
  function parallax() {
    const y = window.scrollY;
    px.forEach((el) => {
      const sp = parseFloat(el.dataset.parallax) || 0;
      el.style.transform = `translate3d(0, ${(y * sp).toFixed(1)}px, 0)`;
    });
    ticking = false;
  }
  function requestTick() {
    onScroll();
    if (reduce) return;
    if (!ticking) { ticking = true; requestAnimationFrame(parallax); }
  }
  window.addEventListener("scroll", requestTick, { passive: true });
  onScroll();

  /* ── Pointer tilt on phone ── */
  const phone = document.querySelector(".phone");
  const visual = document.querySelector(".hero-visual");
  if (phone && visual && !reduce && window.matchMedia("(pointer:fine)").matches) {
    let raf;
    visual.addEventListener("mousemove", (e) => {
      const r = visual.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width - 0.5;
      const cy = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        phone.style.transform = `perspective(1100px) rotateY(${cx * 11}deg) rotateX(${-cy * 11}deg) translateZ(0)`;
      });
    });
    visual.addEventListener("mouseleave", () => {
      phone.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1)";
      phone.style.transform = "perspective(1100px) rotateY(0) rotateX(0)";
      setTimeout(() => { phone.style.transition = ""; }, 650);
    });
  }

  /* ── Scroll reveal (visible by default; arm only below-fold, then release) ── */
  const reveals = [...document.querySelectorAll("[data-reveal]")];
  const counters = [...document.querySelectorAll("[data-count]")];

  function triggerLine() {
    return (window.innerHeight || document.documentElement.clientHeight) * 0.9;
  }

  if (reduce) {
    counters.forEach(runCounter);
  } else {
    // Arm only the elements that start below the fold, so above-fold content
    // is never hidden (robust even if the compositor pauses transitions).
    const armLine = triggerLine();
    reveals.forEach((el) => {
      if (el.getBoundingClientRect().top > armLine) el.classList.add("armed");
    });

    const checkReveals = () => {
      const line = triggerLine();
      reveals.forEach((el) => {
        if (el.classList.contains("armed") && el.getBoundingClientRect().top < line) {
          el.classList.remove("armed");
        }
      });
      counters.forEach((el) => {
        if (!el.dataset.counted && el.getBoundingClientRect().top < line) runCounter(el);
      });
    };

    window.addEventListener("scroll", checkReveals, { passive: true });
    window.addEventListener("resize", checkReveals);
    checkReveals();
    setTimeout(checkReveals, 200);
    // Hard safety net: if anything is still armed, reveal everything outright.
    setTimeout(() => {
      reveals.forEach((el) => el.classList.remove("armed"));
      counters.forEach(runCounter);
    }, 2600);
  }

  /* ── Count-up ── */
  function runCounter(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";
    const target = parseFloat(el.dataset.count);
    const dur = 1400, prefix = el.dataset.prefix || "", suffix = el.dataset.suffix || "";
    const dec = (el.dataset.dec | 0);
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = target * e;
      el.textContent = prefix + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    if (reduce) { el.textContent = prefix + target.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix; }
    else requestAnimationFrame(tick);
  }

  /* ── Interactive price reveal (value-prop preview) ── */
  const revealBtn = document.getElementById("pv-reveal");
  if (revealBtn) {
    const now = document.getElementById("pv-now");
    const save = document.getElementById("pv-save");
    const START = 500, COST = 100;
    let open = false;
    revealBtn.addEventListener("click", () => {
      open = !open;
      if (open) {
        revealBtn.textContent = "Redeemed ✓";
        save.style.opacity = "1";
        const target = START - COST;
        if (reduce) { now.textContent = target + " pts"; now.classList.add("flash"); return; }
        const t0 = performance.now(), dur = 900;
        now.classList.add("flash");
        (function tick(n) {
          const p = Math.min(1, (n - t0) / dur);
          const e = 1 - Math.pow(1 - p, 3);
          now.textContent = Math.round(START + (target - START) * e) + " pts";
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      } else {
        revealBtn.textContent = "Redeem 100 points";
        now.textContent = START + " pts";
        now.classList.remove("flash");
        save.style.opacity = "0";
      }
    });
  }

  /* ── Newsletter (demo) ── */
  const nf = document.getElementById("news-form");
  if (nf) {
    nf.addEventListener("submit", (e) => {
      e.preventDefault();
      const ok = document.getElementById("news-ok");
      if (ok) ok.classList.add("show");
      nf.querySelector("input").value = "";
    });
  }

  /* ── Scroll progress bar ── */
  const prog = document.getElementById("scroll-prog");
  function updateProg() {
    if (!prog) return;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
  }
  window.addEventListener("scroll", updateProg, { passive: true });
  window.addEventListener("resize", updateProg);
  updateProg();

  /* ── Sliding scroll-spy nav indicator ── */
  const nav = document.querySelector(".main-nav");
  const ind = document.getElementById("nav-ind");
  const navLinks = nav ? [...nav.querySelectorAll("a")] : [];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  let activeLink = null;

  function moveInd(link, isActive) {
    if (!ind || !link) return;
    ind.style.left = link.offsetLeft + "px";
    ind.style.width = link.offsetWidth + "px";
    ind.style.opacity = "1";
    ind.classList.toggle("on-active", !!isActive);
  }
  function restInd() {
    if (activeLink) moveInd(activeLink, true);
    else if (ind) { ind.style.opacity = "0"; ind.classList.remove("on-active"); }
  }
  navLinks.forEach((a) => {
    a.addEventListener("mouseenter", () => moveInd(a, a === activeLink));
    a.addEventListener("focus", () => moveInd(a, a === activeLink));
  });
  if (nav) {
    nav.addEventListener("mouseleave", restInd);
    nav.addEventListener("focusout", () => setTimeout(restInd, 0));
  }
  if (sections.length && "IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const link = navLinks.find((a) => a.getAttribute("href") === "#" + en.target.id);
          if (link) {
            navLinks.forEach((x) => x.classList.remove("active"));
            link.classList.add("active");
            activeLink = link;
            if (!nav.matches(":hover")) restInd();
          }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => spy.observe(s));
  }
  window.addEventListener("resize", restInd);
  activeLink = navLinks.find((a) => a.classList.contains("active")) || null;
  requestAnimationFrame(restInd);

  /* ── Pointer-follow spotlight on cards ── */
  if (window.matchMedia("(pointer:fine)").matches) {
    document.querySelectorAll(".b-card, .tcard:not(.lift), .cat-card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ── Magnetic buttons ── */
  if (!reduce && window.matchMedia("(pointer:fine)").matches) {
    document.querySelectorAll(".btn-gold").forEach((btn) => {
      btn.classList.add("magnetic");
      const strength = 0.28;
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * strength;
        const dy = (e.clientY - (r.top + r.height / 2)) * strength;
        btn.classList.add("pull");
        btn.style.transform = `translate(${dx.toFixed(1)}px, ${(dy - 2).toFixed(1)}px)`;
      });
      btn.addEventListener("pointerleave", () => {
        btn.classList.remove("pull");
        btn.style.transform = "";
      });
    });
  }

  /* ── Interactive phone feed (category chips) ── */
  const feedEl = document.getElementById("ps-feed");
  const chips = [...document.querySelectorAll(".ps-chip")];
  const DEALS = [
    { cat: "deals", brand: "mediaexpert", bg: "#FFCC00", fg: "#101010", label: "mediaexpert", badge: "GIFT CARD", merch: "Gift card", title: "Media Expert Gift Card", loc: "Anywhere", pts: "100", fav: true },
    { cat: "deals", brand: "zalando",     bg: "#FF5A00", fg: "#101010", label: "zalando",     badge: "GIFT CARD", merch: "Gift card", title: "Zalando Gift Card", loc: "Anywhere", pts: "100", fav: false },
    { cat: "deals", brand: "douglas",     bg: "#FFFFFF", fg: "#101010", label: "DOUGLAS",     badge: "GIFT CARD", merch: "Gift card", title: "Douglas Gift Card", loc: "Anywhere", pts: "100", fav: false },
    { cat: "deals", brand: "empik",       bg: "#FFFFFF", fg: "#101010", label: "emp\u2019ik", badge: "GIFT CARD", merch: "Gift card", title: "Empik Gift Card", loc: "Anywhere", pts: "100", fav: true },
    { cat: "shopping",   seed: "paylez-shop",  badge: "-30%",     merch: "Shopping",   title: "Local concept store — 30% off", loc: "City centre", right: "View deal", fav: false },
    { cat: "restaurant", seed: "paylez-resto", badge: "-25%",     merch: "Restaurant", title: "Chef tasting menu for two",      loc: "Kazimierz",   right: "View deal", fav: true },
    { cat: "halal",      seed: "paylez-halal", badge: "Verified", merch: "Halal",      title: "Halal-certified kitchen",        loc: "Old Town",    right: "Trusted",   fav: false }
  ];
  const PIN = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z"/></svg>';
  const heart = (fav) => fav
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="#0D9488"><path d="M12 20.5 4.2 13a4.8 4.8 0 0 1 6.8-6.8l1 1 1-1A4.8 4.8 0 0 1 19.8 13L12 20.5Z"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2.4"><path d="M12 20.5 4.2 13a4.8 4.8 0 0 1 6.8-6.8l1 1 1-1A4.8 4.8 0 0 1 19.8 13L12 20.5Z"/></svg>';
  const cardHTML = (d) => {
    const media = d.brand
      ? `<div class="ps-brand" style="background:${d.bg};color:${d.fg}">${d.label}<span class="ps-disc">${d.badge}</span><span class="ps-heart">${heart(d.fav)}</span></div>`
      : `<div class="ps-card-img" style="background-image:url('https://picsum.photos/seed/${d.seed}/420/280')"><span class="ps-disc">${d.badge}</span><span class="ps-heart">${heart(d.fav)}</span></div>`;
    const right = d.pts ? d.pts + " pts" : (d.right || "");
    return `<div class="ps-card">${media}<div class="ps-card-b">
      <div class="ps-merch">${d.merch}</div>
      <div class="ps-title">${d.title}</div>
      <div class="ps-meta"><span class="ps-loc2">${PIN} ${d.loc}</span><span class="ps-pts">${right}</span></div>
    </div></div>`;
  };

  function renderFeed(cat) {
    if (!feedEl) return;
    const list = (cat === "all" || cat === "deals" ? DEALS.filter((d) => d.cat === "deals") : DEALS.filter((d) => d.cat === cat)).slice(0, 2);
    const html = list.map(cardHTML).join("");
    if (reduce) { feedEl.innerHTML = html; return; }
    feedEl.classList.add("switching");
    setTimeout(() => {
      feedEl.innerHTML = html;
      requestAnimationFrame(() => feedEl.classList.remove("switching"));
    }, 220);
  }
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.classList.contains("on")) return;
      chips.forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      renderFeed(chip.dataset.cat || "all");
    });
  });

  /* ── Theme toggle (header) ── */
  const tt = document.getElementById("theme-toggle");
  if (tt) tt.addEventListener("click", () => setTweak("dark", !state.dark));

  /* ── Tweaks panel + host protocol ── */
  const panel = document.getElementById("tw-panel");
  const sw = document.getElementById("tw-dark");
  if (sw) sw.addEventListener("change", () => setTweak("dark", sw.checked));
  const closeBtn = document.getElementById("tw-close");
  if (closeBtn) closeBtn.addEventListener("click", () => {
    if (panel) panel.classList.remove("open");
    try { window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*"); } catch (e) {}
  });
  window.addEventListener("message", (e) => {
    const t = e && e.data && e.data.type;
    if (t === "__activate_edit_mode" && panel) panel.classList.add("open");
    else if (t === "__deactivate_edit_mode" && panel) panel.classList.remove("open");
  });
  try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch (e) {}

  applyTheme();
})();
