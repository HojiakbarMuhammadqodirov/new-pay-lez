import React, { useState, useEffect, useCallback } from "react";

// Kraków-themed pairs — emoji stand in for what would be custom icons.
// Themed content is the L-Earn angle: players absorb local landmarks/food.
const THEMES = {
  Kraków: [
    { id: "wawel", icon: "🏰", label: "Wawel" },
    { id: "dragon", icon: "🐉", label: "Smok" },
    { id: "pretzel", icon: "🥨", label: "Obwarzanek" },
    { id: "pierogi", icon: "🥟", label: "Pierogi" },
    { id: "tram", icon: "🚊", label: "Tramwaj" },
    { id: "square", icon: "⛲", label: "Rynek" },
    { id: "coffee", icon: "☕", label: "Kawa" },
    { id: "trumpet", icon: "🎺", label: "Hejnał" },
  ],
};

const POINTS_PER_PAIR = 6;
const PAIRS = 6; // 12 cards, 3×4 grid

const C = {
  bg: "#070B0A",
  surface: "#0F1613",
  surface2: "#16201B",
  line: "#20302A",
  mint: "#7DE9CE",
  mintDeep: "#33B79A",
  ink: "#EAF3EF",
  slate: "#7C8B85",
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck() {
  const picks = shuffle(THEMES.Kraków).slice(0, PAIRS);
  const doubled = picks.flatMap((p, k) => [
    { ...p, key: `${p.id}-a`, pairIndex: k },
    { ...p, key: `${p.id}-b`, pairIndex: k },
  ]);
  return shuffle(doubled).map((c) => ({ ...c, state: "down" })); // down | up | matched
}

export default function MemoryMatch() {
  const [stage, setStage] = useState("intro"); // intro | play | done
  const [deck, setDeck] = useState([]);
  const [flipped, setFlipped] = useState([]); // indices currently face-up (max 2)
  const [matched, setMatched] = useState(0);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [justMatched, setJustMatched] = useState(null); // pairIndex for a brief glow

  const start = useCallback(() => {
    setDeck(buildDeck());
    setFlipped([]);
    setMatched(0);
    setMoves(0);
    setScore(0);
    setBusy(false);
    setStage("play");
  }, []);

  function flip(i) {
    if (busy) return;
    if (deck[i].state !== "down") return;
    if (flipped.length === 1 && flipped[0] === i) return;

    const nextDeck = deck.map((c, k) => (k === i ? { ...c, state: "up" } : c));
    const nextFlipped = [...flipped, i];
    setDeck(nextDeck);
    setFlipped(nextFlipped);

    if (nextFlipped.length === 2) {
      setMoves((m) => m + 1);
      setBusy(true);
      const [a, b] = nextFlipped;
      if (nextDeck[a].pairIndex === nextDeck[b].pairIndex) {
        // match
        setTimeout(() => {
          setDeck((d) =>
            d.map((c, k) => (k === a || k === b ? { ...c, state: "matched" } : c))
          );
          setJustMatched(nextDeck[a].pairIndex);
          setTimeout(() => setJustMatched(null), 600);
          setMatched((n) => {
            const nn = n + 1;
            if (nn >= PAIRS) setStage("done");
            return nn;
          });
          setScore((s) => s + POINTS_PER_PAIR);
          setFlipped([]);
          setBusy(false);
        }, 480);
      } else {
        // no match
        setTimeout(() => {
          setDeck((d) =>
            d.map((c, k) => (k === a || k === b ? { ...c, state: "down" } : c))
          );
          setFlipped([]);
          setBusy(false);
        }, 850);
      }
    }
  }

  if (stage === "intro") {
    return (
      <Frame>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={pill}>MEMORY MATCH</div>
          <h1 style={h1}>Find the pairs</h1>
          <p style={{ color: C.slate, fontSize: 16, lineHeight: 1.6, margin: "0 0 10px" }}>
            Flip two cards at a time and remember where they are. Match all six
            pairs of Kraków icons.
          </p>
          <p style={{ color: C.slate, fontSize: 14, lineHeight: 1.6, margin: "0 0 28px" }}>
            {POINTS_PER_PAIR} points per pair · fewer moves is better.
          </p>
          <button style={cta} onClick={start}>
            Start
          </button>
        </div>
      </Frame>
    );
  }

  if (stage === "done") {
    const perfect = moves === PAIRS;
    return (
      <Frame>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={pill}>ALL PAIRS FOUND</div>
          <div style={{ fontSize: 60, fontWeight: 800, color: C.mint, letterSpacing: -2 }}>
            +{score}
          </div>
          <p style={{ color: C.ink, fontSize: 18, margin: "6px 0 4px", fontWeight: 600 }}>
            Solved in {moves} moves{perfect ? " · flawless" : ""}
          </p>
          <p style={{ color: C.slate, fontSize: 15, margin: "0 0 26px", lineHeight: 1.6 }}>
            You're 60 points from 10% off at Café Bratysławska.
          </p>
          <button style={{ ...cta, width: "auto", padding: "13px 28px" }} onClick={start}>
            Play again
          </button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ color: C.slate, fontSize: 13, fontWeight: 600 }}>
            Pairs <span style={{ color: C.mint }}>{matched}</span> / {PAIRS}
          </div>
          <div style={{ color: C.slate, fontSize: 13, fontWeight: 600 }}>
            Moves {moves} · <span style={{ color: C.mint }}>{score}</span> pts
          </div>
        </div>

        {/* grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          {deck.map((c, i) => {
            const faceUp = c.state === "up" || c.state === "matched";
            const isMatched = c.state === "matched";
            const glow = justMatched === c.pairIndex && isMatched;
            return (
              <button
                key={c.key}
                onClick={() => flip(i)}
                style={{
                  aspectRatio: "3 / 4",
                  borderRadius: 14,
                  border: `1.5px solid ${faceUp ? C.mintDeep : C.line}`,
                  background: isMatched
                    ? "rgba(125,233,206,0.12)"
                    : faceUp
                    ? C.surface2
                    : C.surface,
                  cursor: faceUp ? "default" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  transition: "all 0.18s",
                  transform: glow ? "scale(1.05)" : "scale(1)",
                  boxShadow: glow ? `0 0 0 2px ${C.mint}` : "none",
                  opacity: isMatched ? 0.85 : 1,
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                {faceUp ? (
                  <>
                    <span style={{ fontSize: 30, lineHeight: 1 }}>{c.icon}</span>
                    {isMatched && (
                      <span style={{ fontSize: 10, color: C.mint, fontWeight: 600 }}>
                        {c.label}
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      border: `1.5px solid ${C.line}`,
                      display: "block",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <p style={{ textAlign: "center", color: C.slate, fontSize: 13, marginTop: 20 }}>
          Tap a card to flip it. Match the two Wawels, the two dragons…
        </p>
      </div>
    </Frame>
  );
}

function Frame({ children }) {
  return (
    <div
      style={{
        minHeight: 560,
        background: C.bg,
        borderRadius: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

const pill = {
  display: "inline-block",
  fontSize: 11,
  letterSpacing: 2,
  color: C.mint,
  border: `1px solid ${C.line}`,
  borderRadius: 99,
  padding: "5px 12px",
  marginBottom: 18,
  fontWeight: 600,
};
const h1 = { color: C.ink, fontSize: 34, fontWeight: 800, margin: "0 0 12px", letterSpacing: -1 };
const cta = {
  width: "100%",
  background: C.mint,
  color: "#04140F",
  border: "none",
  borderRadius: 14,
  padding: "15px 20px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
