// Intercambio Navideño · sitio de participantes

import { api, $, $$, el, bind, decorate, exchangeChips, daysUntil, setBusy, toast, reducedMotion } from "./common.js";
import { createWheel } from "./wheel.js";

const state = {
  exchange: null,
  me: null, // { name, spun, drawOpen }
  freshReveal: false,
};

const VIEWS = ["inicio", "entrar", "rueda", "resultado", "recuperar"];

// ------------------------------------------------------------------ arranque
decorate();
createWheel($("#mini-wheel"), { id: "mw" });
const wheel = createWheel($("#wheel"), { interactive: true, id: "bw" });

window.addEventListener("hashchange", route);
init();

async function init() {
  try {
    const info = await api("info");
    state.exchange = info.exchange;
    setMe(info.me);
    renderExchange();
  } catch (err) {
    toast(err.message, "error");
  }
  route();
}

function setMe(me) {
  state.me = me || null;
  bind("me-name", state.me?.name || "");
  $("#who").hidden = !state.me;
  $("#welcome-back").hidden = !state.me;
  if (state.me) $("#welcome-go").href = state.me.spun ? "#/resultado" : "#/rueda";
}

function renderExchange() {
  const ex = state.exchange;
  if (!ex) return;
  bind("title", ex.title);
  document.title = ex.title;

  const chips = exchangeChips(ex);
  const days = daysUntil(ex.date);
  if (days !== null && days >= 0) {
    chips.push(
      el("li", { class: "chip countdown" }, days === 0 ? "¡Es hoy!" : days === 1 ? "¡Falta 1 día!" : `Faltan ${days} días`),
    );
  }
  $("#hero-chips").replaceChildren(...chips);
  $("#hero-chips").hidden = chips.length === 0;
  $("#result-chips").replaceChildren(...exchangeChips(ex));

  const msg = $("#hero-message");
  msg.textContent = ex.message || "";
  msg.hidden = !ex.message;
}

// ------------------------------------------------------------------ rutas
function currentView() {
  const name = location.hash.replace(/^#\/?/, "");
  return VIEWS.includes(name) ? name : "inicio";
}

function go(view) {
  if (currentView() === view) route();
  else location.hash = `#/${view}`;
}

async function route() {
  let view = currentView();

  // Las pantallas de la rueda y del resultado requieren haber entrado.
  if ((view === "rueda" || view === "resultado") && !state.me) {
    view = "entrar";
    history.replaceState(null, "", "#/entrar");
  }
  if (view === "rueda" && state.me?.spun) {
    view = "resultado";
    history.replaceState(null, "", "#/resultado");
  }

  for (const sec of $$("[data-view]")) sec.hidden = sec.dataset.view !== view;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  if (view === "rueda") showWheel();
  if (view === "resultado") showResult();
  if (view === "entrar") resetEnterForm();
  if (view === "recuperar") $("#recover-error").textContent = "";
}

// ------------------------------------------------------------------ entrar
const enterForm = $("#enter-form");
let confirming = false;

function resetEnterForm() {
  confirming = false;
  $("#enter-confirm-note").hidden = true;
  $("#enter-confirm-field").hidden = true;
  $("#enter-confirm").value = "";
  $("#enter-error").textContent = "";
  $("#enter-submit").textContent = "Entrar";
}

$("#enter-name").addEventListener("input", () => confirming && resetEnterForm());

enterForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#enter-name").value.trim();
  const secret = $("#enter-secret").value;
  const errorBox = $("#enter-error");
  errorBox.textContent = "";
  if (!name) return showError(errorBox, "Escribe tu nombre.", "#enter-name");
  if (secret.trim().length < 3) return showError(errorBox, "Tu respuesta secreta debe tener al menos 3 caracteres.", "#enter-secret");

  const body = { name, secret };
  if (confirming) {
    body.confirm = $("#enter-confirm").value;
    if (!body.confirm) return showError(errorBox, "Escribe otra vez tu respuesta secreta para confirmarla.", "#enter-confirm");
  }

  const btn = $("#enter-submit");
  setBusy(btn, true, "Entrando…");
  try {
    const res = await api("enter", body);
    if (res.step === "confirm") {
      setBusy(btn, false);
      confirming = true;
      $("#enter-confirm-name").textContent = res.name;
      $("#enter-confirm-note").hidden = false;
      $("#enter-confirm-field").hidden = false;
      btn.textContent = "Guardar y entrar";
      $("#enter-confirm").focus();
      return;
    }
    setBusy(btn, false);
    enterForm.reset();
    setMe(res.me);
    go(res.me.spun ? "resultado" : "rueda");
  } catch (err) {
    setBusy(btn, false);
    if (confirming) btn.textContent = "Guardar y entrar";
    if (err.code === "mismatch") $("#enter-confirm").value = "";
    showError(errorBox, err.message);
  }
});

function showError(box, message, focusSel) {
  box.replaceChildren(el("span", { text: message }));
  if (focusSel) $(focusSel).focus();
}

// ------------------------------------------------------------------ recuperar
$("#recover-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#recover-name").value.trim();
  const secret = $("#recover-secret").value;
  const errorBox = $("#recover-error");
  errorBox.textContent = "";
  if (!name) return showError(errorBox, "Escribe tu nombre.", "#recover-name");
  if (!secret.trim()) return showError(errorBox, "Escribe tu respuesta secreta.", "#recover-secret");

  const btn = $("#recover-submit");
  setBusy(btn, true, "Buscando…");
  try {
    const res = await api("recover", { name, secret });
    setBusy(btn, false);
    e.target.reset();
    setMe(res.me);
    state.freshReveal = false;
    renderResult(res.receiver);
    go("resultado");
  } catch (err) {
    setBusy(btn, false);
    showError(errorBox, err.message);
  }
});

// ------------------------------------------------------------------ rueda
const spinBtn = $("#spin-btn");
let spinning = false;

function showWheel() {
  const open = !!state.me?.drawOpen;
  $("#wheel-closed").hidden = open;
  $("#wheel-stage").hidden = !open;
  $("#wheel-sub").hidden = !open;
  spinBtn.hidden = !open;
  spinBtn.disabled = spinning;
  $("#wheel-status").textContent = "";
}

$("#wheel-recheck").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  setBusy(btn, true, "Revisando…");
  try {
    const info = await api("info");
    state.exchange = info.exchange;
    setMe(info.me);
    if (!info.me) return go("entrar");
    if (!info.me.drawOpen) toast("Todavía no se abre el sorteo. ¡Vuelve pronto!");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setBusy(btn, false);
  }
  route();
});

async function startSpin() {
  if (spinning || spinBtn.hidden) return;
  spinning = true;
  spinBtn.disabled = true;
  wheel.hub.setAttribute("aria-disabled", "true");
  const status = $("#wheel-status");
  status.textContent = "";

  let result;
  try {
    // El servidor guarda que ya giraste; el nombre se queda guardado en memoria y
    // no se muestra hasta que la rueda se detenga.
    result = await api("spin", {});
  } catch (err) {
    spinning = false;
    spinBtn.disabled = false;
    wheel.hub.removeAttribute("aria-disabled");
    if (err.code === "not_signed_in") {
      setMe(null);
      return go("entrar");
    }
    if (err.code === "draw_closed") {
      state.me = { ...state.me, drawOpen: false };
      showWheel();
    }
    return toast(err.message, "error");
  }

  status.textContent = "Girando… ¡mucha suerte!";
  await wheel.spin();
  status.textContent = "¡Listo!";
  await new Promise((r) => setTimeout(r, reducedMotion() ? 150 : 900));

  spinning = false;
  wheel.hub.removeAttribute("aria-disabled");
  setMe({ ...state.me, spun: true });
  state.freshReveal = !result.alreadySpun;
  renderResult(result.receiver);
  go("resultado");
}

spinBtn.addEventListener("click", startSpin);
wheel.hub.addEventListener("click", startSpin);
wheel.hub.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    startSpin();
  }
});

// ------------------------------------------------------------------ resultado
let shownReceiver = null;

function renderResult(receiver) {
  shownReceiver = receiver;
  $("#result-name").textContent = receiver || "";
}

async function showResult() {
  const card = $("#result-card");
  if (!shownReceiver) {
    try {
      const res = await api("result");
      setMe(res.me);
      renderResult(res.receiver);
    } catch (err) {
      if (err.code === "not_spun") {
        setMe(err.data.me);
        return go("rueda");
      }
      setMe(null);
      toast(err.message, "error");
      return go("entrar");
    }
  }
  card.classList.remove("fresh");
  if (state.freshReveal) {
    void card.offsetWidth; // reinicia la animación
    card.classList.add("fresh");
    state.freshReveal = false;
    confetti();
  }
}

// ------------------------------------------------------------------ salir
for (const btn of $$('[data-action="leave"]')) {
  btn.addEventListener("click", async () => {
    try {
      await api("leave", {});
    } catch {
      /* la sesión se cierra de todas formas en esta pantalla */
    }
    setMe(null);
    shownReceiver = null;
    renderResult(null);
    toast("Sesión cerrada. ¡Feliz Navidad!");
    go("inicio");
  });
}

// ------------------------------------------------------------------ confeti
function confetti() {
  if (reducedMotion()) return;
  const canvas = el("canvas", { class: "confetti", "aria-hidden": "true" });
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = (canvas.width = innerWidth * dpr);
  const H = (canvas.height = innerHeight * dpr);
  const colors = ["#c1272d", "#14593a", "#d9a62e", "#f3d685", "#ffffff", "#2fa565"];
  const pieces = Array.from({ length: 170 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 22 * dpr,
    vy: (-Math.random() * 20 - 6) * dpr,
    w: (6 + Math.random() * 8) * dpr,
    h: (4 + Math.random() * 6) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    c: colors[(Math.random() * colors.length) | 0],
    star: Math.random() < 0.18,
  }));
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2600) / 900);
    for (const p of pieces) {
      p.vy += 0.55 * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.star) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = (i % 2 ? 3 : 7) * dpr;
          const a = (i * Math.PI) / 5;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (t < 3500) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
