// Intercambio Navideño · panel de administración

import { api, $, el, svg, decorate, toast, confirmDialog, setBusy } from "./common.js";

let st = null; // estado que devuelve el servidor
let editingId = null;

decorate();
init();

let setupMode = false;

async function init() {
  try {
    const info = await api("info");
    if (info.admin) {
      const res = await api("admin_state");
      return showPanel(res.state);
    }
    setupMode = !!info.adminSetup;
  } catch (err) {
    if (err.code !== "admin_required") {
      showLogin();
      return $("#login-error").replaceChildren(el("span", { text: err.message }));
    }
  }
  showLogin();
}

function useIcon(name) {
  const s = svg("svg", { class: "icon", "aria-hidden": "true" });
  s.append(svg("use", { href: `#i-${name}` }));
  return s;
}

/** Muestra el mensaje de error; si la sesión de administrador venció, vuelve al login. */
function handleError(err, box) {
  if (err.code === "admin_required") {
    toast(err.message, "error");
    return showLogin();
  }
  if (box) box.replaceChildren(el("span", { text: err.message }));
  else toast(err.message, "error");
}

// ------------------------------------------------------------------ login
function showLogin() {
  $("#panel-view").hidden = true;
  $("#admin-who").hidden = true;
  $("#login-view").hidden = false;
  $("#setup-note").hidden = !setupMode;
  $("#setup-confirm-field").hidden = !setupMode;
  $("#login-hint").hidden = !setupMode;
  $("#login-label").textContent = setupMode ? "Crea una contraseña" : "Contraseña de administración";
  $("#login-password").autocomplete = setupMode ? "new-password" : "current-password";
  $("#login-submit").textContent = setupMode ? "Crear contraseña y entrar" : "Entrar al panel";
  $("#login-password").focus();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const box = $("#login-error");
  box.textContent = "";
  const password = $("#login-password").value;
  if (!password) return box.replaceChildren(el("span", { text: "Escribe la contraseña." }));
  const btn = $("#login-submit");
  setBusy(btn, true, "Entrando…");
  try {
    const res = setupMode
      ? await api("admin_setup", { password, confirm: $("#setup-confirm").value })
      : await api("admin_login", { password });
    $("#login-password").value = "";
    $("#setup-confirm").value = "";
    setupMode = false;
    setBusy(btn, false);
    showPanel(res.state);
  } catch (err) {
    setBusy(btn, false);
    // Cambió el modo en el servidor (alguien ya creó la contraseña, o aún no existe).
    if (err.code === "needs_setup" || err.code === "already_configured") {
      setupMode = err.code === "needs_setup";
      showLogin();
    }
    handleError(err, box);
  }
});

$("#password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const box = $("#password-error");
  box.textContent = "";
  const btn = $("#password-submit");
  setBusy(btn, true, "Guardando…");
  try {
    const res = await api("admin_password", {
      current: $("#pw-current").value,
      password: $("#pw-new").value,
      confirm: $("#pw-confirm").value,
    });
    e.target.reset();
    render(res.state);
    toast("Contraseña actualizada.");
  } catch (err) {
    handleError(err, box);
  } finally {
    setBusy(btn, false);
  }
});

$("#logout").addEventListener("click", async () => {
  try {
    await api("admin_logout", {});
  } catch {
    /* igual se cierra */
  }
  st = null;
  showLogin();
});

// ------------------------------------------------------------------ panel
function showPanel(state) {
  $("#login-view").hidden = true;
  $("#panel-view").hidden = false;
  $("#admin-who").hidden = false;
  $("#share-url").value = new URL("index.html", location.href).href.replace(/index\.html$/, "");
  fillSettings(state.settings);
  render(state);
}

function render(state) {
  st = state;
  $("#password-card").hidden = state.passwordInConfig;
  const { counts, draw } = state;
  $("#stat-total").textContent = counts.total;
  $("#stat-registered").textContent = counts.registered;
  $("#stat-spun").textContent = counts.spun;

  const badge = $("#draw-badge");
  badge.className = `badge ${draw.open ? "on" : ""}`;
  $("#draw-badge-text").textContent = draw.open ? "Sorteo abierto" : "Sorteo sin iniciar";

  const help = $("#draw-help");
  if (draw.open) {
    help.textContent = counts.spun === counts.total
      ? "¡Todos ya giraron la rueda! Cada quien sabe a quién le regala."
      : "Los participantes ya pueden entrar y girar la rueda. La lista queda fija mientras el sorteo esté abierto.";
  } else if (counts.total < 3) {
    help.textContent = `Agrega al menos 3 participantes para iniciar el sorteo (faltan ${3 - counts.total}).`;
  } else {
    help.textContent = "Cuando la lista esté completa, inicia el sorteo. Se asigna al azar a quién le regala cada persona: nadie se toca a sí mismo y todos reciben un regalo.";
  }
  $("#draw-start").hidden = draw.open;
  $("#draw-start").disabled = counts.total < 3;
  $("#draw-reset").hidden = !draw.open;

  $("#add-form").hidden = draw.open;
  $("#list-lead").textContent = draw.open
    ? "El sorteo está abierto: puedes corregir nombres o restablecer accesos, pero no agregar ni quitar personas."
    : "Agrega a cada persona con el nombre que usará para entrar.";

  renderList();
}

function renderList() {
  const list = $("#plist");
  if (!st.participants.length) {
    list.replaceChildren(el("li", { class: "empty", text: "Todavía no hay participantes. Agrega el primer nombre arriba." }));
    return;
  }
  list.replaceChildren(...st.participants.map((p) => (p.id === editingId ? editRow(p) : viewRow(p))));
}

function viewRow(p) {
  const badges = el(
    "span",
    { class: "pbadges" },
    el("span", { class: `badge ${p.registered ? "on" : ""}` }, p.registered ? "Registrado" : "Sin registrar"),
    st.draw.open ? el("span", { class: `badge ${p.spun ? "on" : "red"}` }, p.spun ? "Ya giró" : "Falta girar") : null,
    p.hasWishes ? el("span", { class: "badge on", title: "Ya escribió sus ideas de regalo" }, "Con ideas") : null,
  );
  const actions = el(
    "span",
    { class: "pactions" },
    el("button", { class: "icon-btn", type: "button", title: `Editar a ${p.name}`, "aria-label": `Editar a ${p.name}`, onclick: () => startEdit(p.id) }, useIcon("edit")),
    el(
      "button",
      {
        class: "icon-btn",
        type: "button",
        title: "Restablecer acceso (olvidó su respuesta secreta)",
        "aria-label": `Restablecer acceso de ${p.name}`,
        disabled: !p.registered,
        onclick: () => resetAccess(p),
      },
      useIcon("key"),
    ),
    el(
      "button",
      {
        class: "icon-btn danger",
        type: "button",
        title: st.draw.open ? "Para quitar personas, reinicia el sorteo" : `Quitar a ${p.name}`,
        "aria-label": `Quitar a ${p.name}`,
        disabled: st.draw.open,
        onclick: () => removeParticipant(p),
      },
      useIcon("trash"),
    ),
  );
  return el("li", { class: "prow" }, el("span", { class: "pname", text: p.name }), badges, actions);
}

function editRow(p) {
  const input = el("input", { type: "text", value: p.name, maxlength: "60", "aria-label": "Nuevo nombre" });
  const save = async () => {
    const name = input.value.trim();
    if (!name || name === p.name) return cancelEdit();
    try {
      const res = await api("admin_rename", { id: p.id, name });
      editingId = null;
      render(res.state);
      toast("Nombre actualizado.");
    } catch (err) {
      handleError(err);
      input.focus();
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancelEdit();
  });
  queueMicrotask(() => {
    input.focus();
    input.select();
  });
  return el(
    "li",
    { class: "prow" },
    input,
    el(
      "span",
      { class: "pactions" },
      el("button", { class: "icon-btn", type: "button", title: "Guardar", "aria-label": "Guardar", onclick: save }, useIcon("check")),
      el("button", { class: "icon-btn", type: "button", title: "Cancelar", "aria-label": "Cancelar", onclick: cancelEdit }, useIcon("x")),
    ),
  );
}

function startEdit(id) {
  editingId = id;
  renderList();
}

function cancelEdit() {
  editingId = null;
  renderList();
}

async function resetAccess(p) {
  const ok = await confirmDialog({
    title: `¿Restablecer el acceso de ${p.name}?`,
    text: `Se borrará su respuesta secreta para que pueda crear una nueva.${p.spun ? " Su resultado no cambia: al volver a entrar verá el mismo nombre." : ""}`,
    ok: "Restablecer",
  });
  if (!ok) return;
  try {
    const res = await api("admin_reset_access", { id: p.id });
    render(res.state);
    toast(`${p.name} ya puede crear una nueva respuesta secreta.`);
  } catch (err) {
    handleError(err);
  }
}

async function removeParticipant(p) {
  const ok = await confirmDialog({ title: `¿Quitar a ${p.name}?`, text: "Se eliminará de la lista del intercambio.", ok: "Quitar", danger: true });
  if (!ok) return;
  try {
    const res = await api("admin_delete", { id: p.id });
    render(res.state);
    toast(`${p.name} ya no está en la lista.`);
  } catch (err) {
    handleError(err);
  }
}

// ------------------------------------------------------------------ agregar
$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const box = $("#add-error");
  box.textContent = "";
  const names = $("#add-names")
    .value.split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) return box.replaceChildren(el("span", { text: "Escribe al menos un nombre." }));
  const btn = $("#add-submit");
  setBusy(btn, true, "Agregando…");
  try {
    const res = await api("admin_add", { names });
    $("#add-names").value = res.skipped.length ? res.skipped.join("\n") : "";
    render(res.state);
    if (res.skipped.length) {
      box.replaceChildren(
        el("span", { text: `Ya estaban en la lista (no se repitieron): ${res.skipped.join(", ")}. Si son personas distintas, agrégales un apellido.` }),
      );
    }
    if (res.added.length) toast(res.added.length === 1 ? `Se agregó a ${res.added[0]}.` : `Se agregaron ${res.added.length} participantes.`);
  } catch (err) {
    handleError(err, box);
  } finally {
    setBusy(btn, false);
  }
});

// ------------------------------------------------------------------ sorteo
$("#draw-start").addEventListener("click", async () => {
  const pending = st.participants.length;
  const ok = await confirmDialog({
    title: "¿Iniciar el sorteo?",
    text: `Se asignará al azar a quién le regala cada una de las ${pending} personas. Mientras el sorteo esté abierto no podrás agregar ni quitar participantes.`,
    ok: "Iniciar sorteo",
  });
  if (!ok) return;
  const btn = $("#draw-start");
  setBusy(btn, true, "Sorteando…");
  try {
    const res = await api("admin_draw_start", {});
    render(res.state);
    toast("¡Sorteo abierto! Ya pueden girar la rueda.");
  } catch (err) {
    handleError(err);
  } finally {
    setBusy(btn, false);
    $("#draw-start").disabled = st.counts.total < 3;
  }
});

$("#draw-reset").addEventListener("click", async () => {
  const spun = st.counts.spun;
  const ok = await confirmDialog({
    title: "¿Reiniciar el sorteo?",
    text: `Se borrarán todas las asignaciones${spun ? `, incluidas las de las ${spun} personas que ya giraron` : ""}. Las respuestas secretas se conservan. Después podrás editar la lista e iniciar un sorteo nuevo, y todos tendrán que volver a girar.`,
    ok: "Reiniciar",
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await api("admin_draw_reset", {});
    render(res.state);
    toast("Sorteo reiniciado.");
  } catch (err) {
    handleError(err);
  }
});

// ------------------------------------------------------------------ datos y compartir
function fillSettings(s) {
  $("#s-title").value = s.title || "";
  $("#s-date").value = s.date || "";
  $("#s-place").value = s.place || "";
  $("#s-budget").value = s.budget || "";
  $("#s-message").value = s.message || "";
}

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#settings-submit");
  setBusy(btn, true, "Guardando…");
  try {
    const res = await api("admin_settings", {
      title: $("#s-title").value,
      date: $("#s-date").value,
      place: $("#s-place").value,
      budget: $("#s-budget").value,
      message: $("#s-message").value,
    });
    fillSettings(res.state.settings);
    render(res.state);
    toast("Datos guardados.");
  } catch (err) {
    handleError(err);
  } finally {
    setBusy(btn, false);
  }
});

$("#share-copy").addEventListener("click", async () => {
  const input = $("#share-url");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand?.("copy");
  }
  toast("Enlace copiado.");
});
