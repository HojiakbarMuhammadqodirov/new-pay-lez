import React, { useState, useEffect, useCallback } from "react";

// ─── Word lists ────────────────────────────────────────────────
// Each: the answer, and a short hint shown to the player.
const WORDS = {
  PL: [
    { word: "KAWA", hint: "You order this in a café" },
    { word: "CHLEB", hint: "You buy this at a bakery" },
    { word: "WODA", hint: "You drink this when thirsty" },
    { word: "MLEKO", hint: "Goes in your coffee" },
    { word: "SKLEP", hint: "You go here to buy things" },
    { word: "POCIĄG", hint: "Travels on rails" },
    { word: "ULICA", hint: "You walk down this" },
    { word: "DZIEŃ", hint: "Opposite of night" },
    { word: "DOBRY", hint: "The opposite of bad" },
    { word: "MIASTO", hint: "Kraków is one" },
  ],
  EN: [
    { word: "COFFEE", hint: "You order this in a café" },
    { word: "MARKET", hint: "You go here to buy things" },
    { word: "STREET", hint: "You walk down this" },
    { word: "FRIEND", hint: "Someone you like to see" },
    { word: "WALLET", hint: "Holds your cards and cash" },
    { word: "REWARD", hint: "What you earn for playing" },
    { word: "CITY", hint: "Kraków is one" },
    { word: "TICKET", hint: "You need one for the tram" },
    { word: "POINTS", hint: "You collect these in Paylez" },
    { word: "TRAVEL", hint: "What you do on holiday" },
  ],
};

const ROUNDS = 5;
const POINTS_PER_WORD = 8;

// colours (Paylez, dark surface)
const C = {
  bg: "#070B0A",
  surface: "#0F1613",
  surface2: "#16201B",
  line: "#20302A",
  mint: "#7DE9CE",
  mintDeep: "#33B79A",
  ink: "#EAF3EF",
  slate: "#7C8B85",
  wrong: "#E8846B",
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function WordBuilder() {
  const [lang, setLang] = useState("PL");
  const [stage, setStage] = useState("intro"); // intro | play | done
  const [deck, setDeck] = useState([]);
  const [round, setRound] = useState(0);
  const [slots, setSlots] = useState([]); // chosen letters (indices into tray)
  const [tray, setTray] = useState([]); // {ch, used}
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [status, setStatus] = useState(null); // null | 'right' | 'wrong'
  const [shake, setShake] = useState(false);

  const startGame = useCallback(
    (chosenLang) => {
      const l = chosenLang || lang;
      const picked = shuffle(WORDS[l]).slice(0, ROUNDS);
      setDeck(picked);
      setRound(0);
      setScore(0);
      setSolved(0);
      setStage("play");
      loadRound(picked, 0);
    },
    [lang]
  );

  function loadRound(picked, idx) {
    const w = picked[idx].word;
    const letters = shuffle(w.split("")).map((ch) => ({ ch, used: false }));
    setTray(letters);
    setSlots([]);
    setStatus(null);
  }

  function pickLetter(i) {
    if (status === "right") return;
    setTray((t) => t.map((x, k) => (k === i ? { ...x, used: true } : x)));
    setSlots((s) => [...s, i]);
    setStatus(null);
  }

  function undo() {
    if (status === "right" || slots.length === 0) return;
    const last = slots[slots.length - 1];
    setTray((t) => t.map((x, k) => (k === last ? { ...x, used: false } : x)));
    setSlots((s) => s.slice(0, -1));
    setStatus(null);
  }

  function clearAll() {
    if (status === "right") return;
    setTray((t) => t.map((x) => ({ ...x, used: false })));
    setSlots([]);
    setStatus(null);
  }

  const answer = deck[round]?.word || "";
  const built = slots.map((i) => tray[i]?.ch).join("");

  // auto-check when slots fill
  useEffect(() => {
    if (stage !== "play" || !answer) return;
    if (built.length === answer.length && built.length > 0) {
      if (built === answer) {
        setStatus("right");
        setScore((s) => s + POINTS_PER_WORD);
        setSolved((n) => n + 1);
      } else {
        setStatus("wrong");
        setShake(true);
        setTimeout(() => setShake(false), 450);
      }
    }
  }, [built, answer, stage]);

  function next() {
    const n = round + 1;
    if (n >= ROUNDS) {
      setStage("done");
    } else {
      setRound(n);
      loadRound(deck, n);
    }
  }

  function revealHintLetter() {
    // fills the next correct letter automatically, no points penalty shown (soft help)
    if (status === "right") return;
    const nextIdx = slots.length;
    const need = answer[nextIdx];
    const trayIdx = tray.findIndex((x, k) => !x.used && x.ch === need);
    if (trayIdx >= 0) pickLetter(trayIdx);
  }

  // ── intro ──
  if (stage === "intro") {
    return (
      <Frame>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={pill}>WORD BUILDER</div>
          <h1 style={h1}>Build the word</h1>
          <p style={{ color: C.slate, fontSize: 16, lineHeight: 1.6, margin: "0 0 28px" }}>
            Tap the letters in the right order to spell the word from its clue.
            Five words, {POINTS_PER_WORD} points each.
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 26 }}>
            {["PL", "EN"].map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  ...langBtn,
                  ...(lang === l
                    ? { background: C.mint, color: "#04140F", borderColor: C.mint }
                    : {}),
                }}
              >
                {l === "PL" ? "Polski" : "English"}
              </button>
            ))}
          </div>

          <button style={cta} onClick={() => startGame(lang)}>
            Start · {lang === "PL" ? "Polski" : "English"}
          </button>
        </div>
      </Frame>
    );
  }

  // ── done ──
  if (stage === "done") {
    return (
      <Frame>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={pill}>ROUND COMPLETE</div>
          <div style={{ fontSize: 60, fontWeight: 800, color: C.mint, letterSpacing: -2 }}>
            +{score}
          </div>
          <p style={{ color: C.ink, fontSize: 18, margin: "6px 0 4px", fontWeight: 600 }}>
            {solved} of {ROUNDS} words solved
          </p>
          <p style={{ color: C.slate, fontSize: 15, margin: "0 0 26px", lineHeight: 1.6 }}>
            You're 60 points from 10% off at Café Bratysławska.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button style={{ ...cta, width: "auto", padding: "13px 22px" }} onClick={() => startGame(lang)}>
              Play again
            </button>
            <button
              style={{ ...ghost, width: "auto", padding: "13px 22px" }}
              onClick={() => setStage("intro")}
            >
              Change language
            </button>
          </div>
        </div>
      </Frame>
    );
  }

  // ── play ──
  return (
    <Frame>
      <div style={{ width: "100%", maxWidth: 480 }}>
        {/* top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {Array.from({ length: ROUNDS }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 26,
                  height: 4,
                  borderRadius: 2,
                  background: i < round ? C.mint : i === round ? C.mintDeep : C.line,
                }}
              />
            ))}
          </div>
          <div style={{ color: C.slate, fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: C.mint }}>{score}</span> pts
          </div>
        </div>

        {/* clue */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ color: C.slate, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
            {lang === "PL" ? "Polish word" : "English word"} · {round + 1} of {ROUNDS}
          </div>
          <div style={{ color: C.ink, fontSize: 20, fontWeight: 600, marginBottom: 24 }}>
            {deck[round]?.hint}
          </div>
        </div>

        {/* answer slots */}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginBottom: 30,
            animation: shake ? "wb-shake 0.45s" : "none",
          }}
        >
          {answer.split("").map((_, i) => {
            const ch = tray[slots[i]]?.ch;
            const filled = ch != null;
            const rightState = status === "right";
            const wrongState = status === "wrong" && filled;
            return (
              <div
                key={i}
                style={{
                  width: 46,
                  height: 56,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: 700,
                  color: rightState ? "#04140F" : wrongState ? "#fff" : C.ink,
                  background: rightState ? C.mint : wrongState ? C.wrong : filled ? C.surface2 : C.surface,
                  border: `1.5px solid ${
                    rightState ? C.mint : wrongState ? C.wrong : filled ? C.mintDeep : C.line
                  }`,
                  transition: "all 0.15s",
                }}
              >
                {ch || ""}
              </div>
            );
          })}
        </div>

        {/* tray */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 26, minHeight: 52 }}>
          {tray.map((t, i) => (
            <button
              key={i}
              disabled={t.used || status === "right"}
              onClick={() => pickLetter(i)}
              style={{
                width: 46,
                height: 52,
                borderRadius: 12,
                fontSize: 22,
                fontWeight: 700,
                cursor: t.used ? "default" : "pointer",
                color: t.used ? C.line : C.ink,
                background: t.used ? "transparent" : C.surface2,
                border: `1.5px solid ${t.used ? C.line : C.mintDeep}`,
                opacity: t.used ? 0.35 : 1,
                transition: "all 0.12s",
                fontFamily: "inherit",
              }}
            >
              {t.ch}
            </button>
          ))}
        </div>

        {/* controls / result */}
        {status === "right" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ color: C.mint, fontWeight: 700, fontSize: 17, marginBottom: 14 }}>
              Correct · +{POINTS_PER_WORD} points
            </div>
            <button style={cta} onClick={next}>
              {round + 1 >= ROUNDS ? "See result" : "Next word"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button style={miniBtn} onClick={undo}>Undo</button>
            <button style={miniBtn} onClick={clearAll}>Clear</button>
            <button style={{ ...miniBtn, color: C.mint, borderColor: C.mintDeep }} onClick={revealHintLetter}>
              Hint
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes wb-shake {
          0%,100%{transform:translateX(0)}
          20%,60%{transform:translateX(-7px)}
          40%,80%{transform:translateX(7px)}
        }
      `}</style>
    </Frame>
  );
}

// ─── shared shell + styles ─────────────────────────────────────
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
        fontFamily:
          "'Outfit', system-ui, -apple-system, sans-serif",
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
const ghost = {
  width: "100%",
  background: "transparent",
  color: C.ink,
  border: `1.5px solid ${C.line}`,
  borderRadius: 14,
  padding: "15px 20px",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
const langBtn = {
  padding: "11px 22px",
  borderRadius: 12,
  background: C.surface2,
  color: C.ink,
  border: `1.5px solid ${C.line}`,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
const miniBtn = {
  padding: "11px 18px",
  borderRadius: 11,
  background: C.surface2,
  color: C.slate,
  border: `1.5px solid ${C.line}`,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
