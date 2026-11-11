// Intercambio Navideño · utilidades compartidas (API, decoración, formato)

let csrf = "";

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.message || "No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    this.status = status;
    this.code = data?.error || "network";
    this.data = data || {};
  }
}

async function request(action, body) {
  const opts = { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.headers["X-CSRF-Token"] = csrf;
    opts.body = JSON.stringify(body);
  }
  let res;
  let data;
  try {
    res = await fetch(`api.php?action=${encodeURIComponent(action)}`, opts);
  } catch {
    throw new ApiError(0, null);
  }
  try {
    data = await res.json();
  } catch {
    // Llegó algo que no es JSON: el servidor no está ejecutando api.php.
    throw new ApiError(res.status, {
      error: "no_php",
      message:
        res.status === 404
          ? "No se encontró api.php en el servidor. Revisa que se hayan subido todos los archivos del sitio."
          : "El servidor no está ejecutando PHP, y este sitio lo necesita (PHP 8 o superior). Publícalo como sitio web con PHP: ver README.",
    });
  }
  if (data?.csrf) csrf = data.csrf;
  if (!res.ok || data?.ok === false) throw new ApiError(res.status, data);
  return data;
}

/** Llama a la API. Si el token de la sesión venció, lo renueva y reintenta una vez. */
export async function api(action, body) {
  try {
    return await request(action, body);
  } catch (err) {
    if (err.code === "csrf") {
      await request("info");
      return request(action, body);
    }
    throw err;
  }
}

// ------------------------------------------------------------------ DOM
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function icon(name) {
  const s = svg("svg", { class: "icon", "aria-hidden": "true" });
  s.append(svg("use", { href: `#i-${name}` }));
  return s;
}

export function bind(key, value) {
  for (const node of $$(`[data-bind="${key}"]`)) node.textContent = value;
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ decoración
export function decorate() {
  const lights = $(".lights");
  if (lights && !lights.childElementCount) {
    const colors = ["#e0383e", "#f3d685", "#2fa565", "#ffffff"];
    const count = Math.max(12, Math.round(Math.min(window.innerWidth, 1080) / 46));
    for (let i = 0; i < count; i++) {
      const b = el("span", { class: "bulb" });
      b.style.setProperty("--c", colors[i % colors.length]);
      b.style.setProperty("--d", `${(i % 4) * 0.55}s`);
      lights.append(b);
    }
  }
  const snow = $(".snow");
  if (snow && !snow.childElementCount && !reducedMotion()) {
    for (let i = 0; i < 28; i++) {
      const f = el("span", { class: "flake" });
      const size = 2 + Math.random() * 4;
      f.style.width = f.style.height = `${size}px`;
      f.style.left = `${Math.random() * 100}%`;
      f.style.animationDuration = `${9 + Math.random() * 12}s`;
      f.style.animationDelay = `${-Math.random() * 20}s`;
      f.style.opacity = String(0.25 + Math.random() * 0.5);
      f.style.setProperty("--drift", `${-40 + Math.random() * 80}px`);
      snow.append(f);
    }
  }
  // Botones "Mostrar / Ocultar" de los campos secretos
  for (const btn of $$("[data-toggle]")) {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggle);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Ocultar" : "Mostrar";
      input.focus();
    });
  }
}

// ------------------------------------------------------------------ formato
export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export function formatDate(iso) {
  const d = parseDate(iso);
  if (!d) return "";
  const txt = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function daysUntil(iso) {
  const d = parseDate(iso);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

/** Chips de fecha, lugar y presupuesto del intercambio. */
export function exchangeChips(ex) {
  const items = [];
  if (ex.date) items.push(["calendar", formatDate(ex.date)]);
  if (ex.place) items.push(["pin", ex.place]);
  if (ex.budget) items.push(["tag", `Presupuesto: ${ex.budget}`]);
  return items.map(([i, t]) => el("li", { class: "chip" }, icon(i), el("span", { text: t })));
}

// ------------------------------------------------------------------ avisos
let toastTimer;
export function toast(message, kind = "ok") {
  $(".toast")?.remove();
  clearTimeout(toastTimer);
  const t = el("div", { class: `toast ${kind === "error" ? "error" : ""}`, role: "status", text: message });
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 3800);
}

/** Confirmación con <dialog>. Devuelve una promesa con true/false. */
export function confirmDialog({ title, text, ok = "Aceptar", danger = false }) {
  return new Promise((resolve) => {
    const dlg = el(
      "dialog",
      {},
      el("h3", { text: title }),
      el("p", { text }),
      el(
        "div",
        { class: "actions" },
        el("button", { class: "btn btn-ghost btn-sm", type: "button", value: "no", text: "Cancelar" }),
        el("button", { class: `btn btn-sm ${danger ? "btn-danger" : "btn-green"}`, type: "button", value: "yes", text: ok }),
      ),
    );
    const done = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.addEventListener("click", (e) => {
      if (e.target.value === "yes") done(true);
      else if (e.target.value === "no" || e.target === dlg) done(false);
    });
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function setBusy(button, busy, label) {
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), el("span", { text: label || "Un momento…" }));
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}
