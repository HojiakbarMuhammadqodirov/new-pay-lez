/* Paylez Desktop — interactions: deals render, reveal, counters, float, marquee */
(function () {
  "use strict";
  const PZ = window.PAYLEZ || { deals: [], merchants: {} };

  /* ── Featured deals ── */
  function renderDeals() {
    const grid = document.getElementById("deals-grid");
    if (!grid) return;
    const picks = PZ.deals.slice(0, 8);
    grid.innerHTML = picks.map((d) => {
      const m = PZ.merchants[d.merchant] || {};
      const save = d.original - d.price;
      const rating = (d.rating || 4.7).toFixed(1);
      return `
      <article class="deal glass" data-reveal>
        <div class="deal-img">
          <img src="${d.image}" alt="" loading="lazy" />
          <span class="deal-disc">−${d.discount}%</span>
          <button class="deal-fav" aria-label="Save">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20.5 4.2 13a4.8 4.8 0 0 1 6.8-6.8l1 1 1-1A4.8 4.8 0 0 1 19.8 13L12 20.5Z"/></svg>
          </button>
        </div>
        <div class="deal-body">
          <div class="deal-merch">${m.name || "Local merchant"}</div>
          <div class="deal-title">${d.title}</div>
          <div class="deal-meta"><span class="star">★</span> ${rating} · ${(d.reviews || 0).toLocaleString()} reviews</div>
          <div class="deal-price">
            <span class="deal-now">$${d.price}</span>
            <span class="deal-was">$${d.original}</span>
            <span class="deal-save">Save $${save}</span>
          </div>
        </div>
      </article>`;
    }).join("");

    // favorite toggle
    grid.querySelectorAll(".deal-fav").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const svg = b.querySelector("svg");
        const on = svg.getAttribute("fill") === "currentColor";
        svg.setAttribute("fill", on ? "none" : "currentColor");
        b.style.color = on ? "" : "var(--rose-bright)";
      });
    });
    observeReveal(grid.querySelectorAll("[data-reveal]"));
  }

  /* ── Scroll reveal (robust: IO + in-viewport pass + safety net) ── */
  let io;
  function inView(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.top < vh * 0.94 && r.bottom > 0;
  }
  function observeReveal(nodes) {
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    }
    nodes.forEach((n, i) => {
      if (!n.style.transitionDelay) n.style.transitionDelay = Math.min(i * 60, 360) + "ms";
      io.observe(n);
    });
    // Immediate pass: reveal anything already on screen (covers hidden-iframe IO no-fire)
    requestAnimationFrame(() => {
      nodes.forEach((n) => { if (inView(n)) { n.classList.add("in"); io.unobserve(n); } });
    });
  }

  /* ── Count up ── */
  function counters() {
    const nodes = document.querySelectorAll("[data-count]");
    const setFinal = (el) => { el.textContent = parseFloat(el.dataset.count).toLocaleString(); };
    if (document.visibilityState !== "visible") { nodes.forEach(setFinal); return; }
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        const el = en.target, target = parseFloat(el.dataset.count), dur = 1200, t0 = performance.now();
        const dec = (String(target).split(".")[1] || "").length;
        function step(now) {
          const p = Math.min((now - t0) / dur, 1);
          const e = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * e).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          if (p < 1) requestAnimationFrame(step); else el.textContent = target.toLocaleString();
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    nodes.forEach((n) => cio.observe(n));
  }

  /* ── Header scroll state ── */
  function header() {
    const h = document.getElementById("header");
    const on = () => h.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", on, { passive: true });
    on();
  }

  /* ── Marquee: duplicate for seamless loop ── */
  function marquee() {
    const t = document.getElementById("marq");
    if (t) t.innerHTML += t.innerHTML;
  }

  /* ── Gentle parallax float on hero widgets ── */
  function floatWidgets() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const stage = document.querySelector(".widget-stage");
    if (!stage) return;
    const ws = [...stage.querySelectorAll(".w")];
    let raf;
    stage.addEventListener("mousemove", (e) => {
      const r = stage.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / r.width;
      const dy = (e.clientY - r.top - r.height / 2) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        ws.forEach((w) => {
          const depth = parseFloat(w.dataset.float || "1");
          w.style.transform = `translate(${dx * depth * 10}px, ${dy * depth * 10}px)`;
        });
      });
    });
    stage.addEventListener("mouseleave", () => {
      ws.forEach((w) => { w.style.transform = ""; });
    });
  }

  function init() {
    renderDeals();
    const willReveal = document.documentElement.classList.contains("will-reveal");
    if (willReveal) {
      observeReveal(document.querySelectorAll("main [data-reveal], .cta-banner[data-reveal]"));
      const sweep = () => document.querySelectorAll("[data-reveal]:not(.in)").forEach((n) => { if (inView(n)) n.classList.add("in"); });
      window.addEventListener("scroll", sweep, { passive: true });
      window.addEventListener("resize", sweep);
      setTimeout(sweep, 400);
      setTimeout(() => document.querySelectorAll("[data-reveal]:not(.in)").forEach((n) => n.classList.add("in")), 3000);
    } else {
      // Page loaded hidden: everything is visible by default. If it later becomes
      // visible, opt into the entrance animation once.
      document.addEventListener("visibilitychange", function once() {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", once);
        document.documentElement.classList.add("will-reveal");
        observeReveal(document.querySelectorAll("main [data-reveal], .cta-banner[data-reveal]"));
        const sweep = () => document.querySelectorAll("[data-reveal]:not(.in)").forEach((n) => { if (inView(n)) n.classList.add("in"); });
        window.addEventListener("scroll", sweep, { passive: true });
        setTimeout(sweep, 300);
      });
    }
    counters();
    header();
    marquee();
    floatWidgets();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
