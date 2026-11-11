// Prueba de punta a punta: PHP embebido + Chromium (Playwright).
//   node tests/e2e.mjs            (requiere php 8 con pdo_sqlite y playwright)
//   SHOTS=carpeta node tests/e2e.mjs   guarda capturas de pantalla
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// require() respeta NODE_PATH, así funciona con Playwright instalado global o localmente.
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "intercambio-"));
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}/`;
const ADMIN_PW = "renos-y-trineos-2026";
const ADMIN_PW2 = "esferas-doradas-2026";
const SHOTS = process.env.SHOTS;

const php = spawn("php", ["-S", `127.0.0.1:${PORT}`, "-t", root], {
  // Sin contraseña en la configuración: se crea desde el panel en la primera visita.
  env: { ...process.env, INTERCAMBIO_ADMIN_PASSWORD: "", INTERCAMBIO_DATA_DIR: dataDir },
  stdio: ["ignore", "ignore", "pipe"],
});
let phpErr = "";
php.stderr.on("data", (d) => (phpErr += d));

const browser = await chromium.launch();
let step = "";
const log = (s) => {
  step = s;
  console.log("·", s);
};
// Espera a que la pantalla de resultado muestre un nombre y lo devuelve.
const resultName = async (page) => {
  await page.locator('[data-view="resultado"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#result-name").textContent.trim() !== "");
  return (await page.locator("#result-name").textContent()).trim();
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const names = ["Ana López", "José Pérez", "Carlos Ruiz", "María Fernanda", "Lucía Gómez"];
  const secrets = { "Ana López": "pistache", "José Pérez": "Firulais", "Carlos Ruiz": "tamales", "María Fernanda": "rosca de reyes", "Lucía Gómez": "nieve" };

  // ---------------------------------------------------------------- admin
  log("admin: primera visita, crear la contraseña del panel");
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage();
  await admin.goto(BASE + "admin.html");
  await admin.locator("#setup-note").waitFor();
  await shot(admin, "00-admin-primera-vez");
  await admin.fill("#login-password", "corta");
  await admin.fill("#setup-confirm", "corta");
  await admin.click("#login-submit");
  await admin.getByText("al menos 8 caracteres").waitFor();
  await admin.fill("#login-password", ADMIN_PW);
  await admin.fill("#setup-confirm", ADMIN_PW);
  await admin.click("#login-submit");
  await admin.locator("#panel-view").waitFor();

  log("admin: ya no se puede volver a crear la contraseña");
  const resetup = await fetch(BASE + "api.php?action=info").then(async (r) => {
    const info = await r.json();
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const res = await fetch(BASE + "api.php?action=admin_setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": info.csrf, Cookie: cookie },
      body: JSON.stringify({ password: "otra-contrasena", confirm: "otra-contrasena" }),
    });
    return { adminSetup: info.adminSetup, status: res.status };
  });
  assert.deepEqual(resetup, { adminSetup: false, status: 409 });

  log("admin: cerrar sesión, contraseña incorrecta y correcta");
  await admin.click("#logout");
  await admin.locator("#login-view").waitFor();
  assert.equal(await admin.locator("#setup-note").isHidden(), true);
  await admin.fill("#login-password", "equivocada");
  await admin.click("#login-submit");
  await admin.getByText("Contraseña incorrecta").waitFor();
  await admin.fill("#login-password", ADMIN_PW);
  await admin.click("#login-submit");
  await admin.locator("#panel-view").waitFor();

  log("admin: agregar participantes y detectar duplicados");
  await admin.fill("#add-names", names.join("\n") + "\nana lopez");
  await admin.click("#add-submit");
  await admin.getByText("Ya estaban en la lista").waitFor();
  assert.equal(await admin.locator("#plist .prow").count(), 5);
  assert.equal(await admin.locator("#stat-total").textContent(), "5");

  log("admin: datos del intercambio");
  await admin.fill("#s-title", "Intercambio Navideño 2026");
  await admin.fill("#s-date", "2026-12-20");
  await admin.fill("#s-budget", "$500 MXN");
  await admin.fill("#s-place", "Oficina TradeFlex");
  await admin.fill("#s-message", "¡Trae tu regalo envuelto!");
  await admin.click("#settings-submit");
  await admin.getByText("Datos guardados").waitFor();

  // ---------------------------------------------------------------- participante antes del sorteo
  log("participante: se registra antes de que abra el sorteo");
  const early = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
  await early.goto(BASE);
  await early.getByRole("heading", { name: "Intercambio Navideño 2026" }).waitFor();
  await early.locator("#hero-chips").getByText("Presupuesto: $500 MXN").waitFor();
  await shot(early, "01-inicio-movil");
  await early.click("text=Participar");
  await early.fill("#enter-name", "Personaje Inventado");
  await early.fill("#enter-secret", "lo que sea");
  await early.click("#enter-submit");
  await early.getByText("No encontramos «Personaje Inventado»").waitFor();
  await early.fill("#enter-name", "ANA LOPEZ");
  await early.fill("#enter-secret", secrets["Ana López"]);
  await early.click("#enter-submit");
  await early.locator("#enter-confirm-field").waitFor();
  await early.fill("#enter-confirm", "otra cosa");
  await early.click("#enter-submit");
  await early.getByText("no coinciden").waitFor();
  await early.fill("#enter-confirm", "PISTACHÉ");
  await early.click("#enter-submit");
  await early.getByText("El sorteo aún no empieza").waitFor();

  log("participante: Ana escribe sus ideas de regalo antes del sorteo");
  await early.locator("#my-wishes").waitFor();
  await early.fill("#wishes-text", "Rompecabezas de 1000 piezas\n\n  Taza grande para café  \nhttps://example.com/bufanda-roja");
  await early.click("#wishes-submit");
  await early.getByText("Guardamos tus ideas de regalo").waitFor();
  assert.equal(await early.inputValue("#wishes-text"), "Rompecabezas de 1000 piezas\nTaza grande para café\nhttps://example.com/bufanda-roja");
  await shot(early, "02-sorteo-cerrado-movil");

  log("admin: iniciar sorteo");
  await admin.click("#draw-start");
  await admin.click("dialog button[value=yes]");
  await admin.locator("#draw-badge-text", { hasText: "Sorteo abierto" }).waitFor();
  assert.equal(await admin.locator("#add-form").isHidden(), true);
  assert.equal(await admin.locator(".icon-btn.danger").first().isDisabled(), true);
  await shot(admin, "03-admin");

  log("admin: el estado no expone resultados");
  const stateJson = await admin.evaluate(async () => (await fetch("api.php?action=admin_state")).text());
  assert.ok(!/receiver/i.test(stateJson), "admin_state no debe incluir receptores");

  // ---------------------------------------------------------------- girar
  const results = {};

  log("participante: Ana gira (animación completa) y el nombre no aparece hasta el final");
  await early.click("#wheel-recheck");
  await early.locator("#spin-btn").waitFor();
  await shot(early, "04-rueda-movil");
  await early.click("#spin-btn");
  await early.waitForTimeout(1500);
  assert.equal(await early.locator('[data-view="resultado"]').isHidden(), true);
  assert.equal(await early.locator("#wheel text").count(), 0, "la rueda no debe tener textos");
  const visibleText = await early.locator("body").innerText();
  for (const n of names.filter((n) => n !== "Ana López")) assert.ok(!visibleText.includes(n), `«${n}» visible durante el giro`);
  results["Ana López"] = await resultName(early);
  await early.waitForTimeout(800);
  await shot(early, "05-resultado-movil");

  for (const n of names.slice(1)) {
    log(`participante: ${n} entra y gira`);
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "#/entrar");
    await p.fill("#enter-name", n);
    await p.fill("#enter-secret", secrets[n]);
    await p.click("#enter-submit");
    await p.locator("#enter-confirm").waitFor();
    await p.fill("#enter-confirm", secrets[n]);
    await p.click("#enter-submit");
    await p.locator("#spin-btn").waitFor();
    if (n === "José Pérez") await shot(p, "06-rueda-escritorio");
    await p.click("#spin-btn");
    results[n] = await resultName(p);
    if (n === "José Pérez") await shot(p, "07-resultado-escritorio");

    // Volver a entrar no vuelve a girar: lleva directo al mismo resultado.
    await p.reload();
    assert.equal(await resultName(p), results[n]);
    const again = await p.evaluate(async () => {
      const info = await (await fetch("api.php?action=info")).json();
      const r = await fetch("api.php?action=spin", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": info.csrf }, body: "{}" });
      return r.json();
    });
    assert.equal(again.alreadySpun, true);
    assert.equal(again.receiver, results[n]);
    await ctx.close();
  }

  log("sorteo válido: nadie se regala a sí mismo y todos reciben un regalo");
  console.log("  ", results);
  for (const [giver, receiver] of Object.entries(results)) assert.notEqual(giver, receiver);
  assert.deepEqual(Object.values(results).sort(), [...names].sort());

  // ---------------------------------------------------------------- recuperar
  log("ideas: quien le regala a Ana ve sus ideas; los demás no");
  const giverOfAna = Object.keys(results).find((g) => results[g] === "Ana López");
  const gp = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
  await gp.goto(BASE + "#/recuperar");
  await gp.fill("#recover-name", giverOfAna);
  await gp.fill("#recover-secret", secrets[giverOfAna]);
  await gp.click("#recover-submit");
  assert.equal(await resultName(gp), "Ana López");
  const ideas = await gp.locator("#receiver-ideas-list li").allInnerTexts();
  assert.deepEqual(ideas, ["Rompecabezas de 1000 piezas", "Taza grande para café", "https://example.com/bufanda-roja"]);
  assert.equal(await gp.locator("#receiver-ideas-list a").getAttribute("href"), "https://example.com/bufanda-roja");
  assert.equal(await gp.locator("#receiver-ideas-list a").getAttribute("rel"), "noopener noreferrer nofollow");
  await gp.locator("#my-wishes").waitFor();
  await shot(gp, "09-resultado-con-ideas-movil");
  await gp.context().close();
  // Ana le regala a alguien que no escribió ideas: ve el aviso de "todavía no".
  await early.reload();
  await resultName(early);
  await early.locator("#receiver-ideas-empty").waitFor();
  // El texto de las ideas nunca llega a quien no le regala a Ana.
  const notGiver = names.find((n) => n !== giverOfAna && n !== "Ana López");
  const ng = await (await browser.newContext()).newPage();
  await ng.goto(BASE + "#/recuperar");
  await ng.fill("#recover-name", notGiver);
  await ng.fill("#recover-secret", secrets[notGiver]);
  await ng.click("#recover-submit");
  await resultName(ng);
  assert.ok(!(await ng.content()).includes("Rompecabezas"));
  await ng.context().close();

  log("recuperar: respuesta incorrecta, luego correcta sin acentos ni mayúsculas");
  const rc = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
  await rc.goto(BASE + "#/recuperar");
  await rc.fill("#recover-name", "jose perez");
  await rc.fill("#recover-secret", "equivocada");
  await rc.click("#recover-submit");
  await rc.getByText("Te quedan 5 intentos").waitFor();
  await shot(rc, "08-recuperar-error-movil");
  await rc.fill("#recover-secret", "firulais");
  await rc.click("#recover-submit");
  assert.equal(await resultName(rc), results["José Pérez"]);
  await rc.click('[data-view="resultado"] >> text=Listo, cerrar sesión');
  await rc.getByText("Sesión cerrada").waitFor();
  await rc.goto(BASE + "#/resultado");
  await rc.locator('[data-view="entrar"]').waitFor();

  log("bloqueo tras varios intentos fallidos");
  await rc.goto(BASE + "#/recuperar");
  await rc.fill("#recover-name", "Carlos Ruiz");
  for (let i = 0; i < 6; i++) {
    const left = 5 - i;
    await rc.fill("#recover-secret", `mal-${i}`);
    await rc.click("#recover-submit");
    await rc.getByText(left > 0 ? `Te quedan ${left} intento` : "espera 15 minutos").waitFor();
  }
  await rc.fill("#recover-secret", secrets["Carlos Ruiz"]);
  await rc.click("#recover-submit");
  await rc.getByText("Demasiados intentos").waitFor();

  // ---------------------------------------------------------------- restablecer acceso
  log("admin: restablecer acceso; el resultado se conserva");
  await admin.reload();
  await admin.locator("#panel-view").waitFor();
  assert.equal(await admin.locator("#stat-spun").textContent(), "5");
  assert.equal(await admin.locator(".prow", { hasText: "Ana López" }).getByText("Con ideas").count(), 1);
  assert.equal(await admin.getByText("Con ideas").count(), 1);
  assert.ok(!(await admin.content()).includes("Rompecabezas"), "el panel no debe mostrar las ideas");
  await admin.click('[aria-label="Restablecer acceso de Lucía Gómez"]');
  await admin.click("dialog button[value=yes]");
  await admin.getByText("ya puede crear una nueva respuesta secreta").waitFor();

  const lu = await (await browser.newContext()).newPage();
  await lu.goto(BASE + "#/entrar");
  await lu.fill("#enter-name", "lucia gomez");
  await lu.fill("#enter-secret", "nueva respuesta");
  await lu.click("#enter-submit");
  await lu.locator("#enter-confirm").waitFor();
  await lu.fill("#enter-confirm", "nueva respuesta");
  await lu.click("#enter-submit");
  assert.equal(await resultName(lu), results["Lucía Gómez"]);

  log("admin: renombrar y reiniciar sorteo");
  await admin.click('[aria-label="Editar a Carlos Ruiz"]');
  await admin.fill("#plist input", "Carlos Ruiz Díaz");
  await admin.keyboard.press("Enter");
  await admin.getByText("Nombre actualizado").waitFor();
  await admin.click("#draw-reset");
  await admin.click("dialog button[value=yes]");
  await admin.getByText("Sorteo sin iniciar").waitFor();
  assert.equal(await admin.locator("#stat-spun").textContent(), "0");

  log("admin: cambiar la contraseña");
  await admin.fill("#pw-current", "no-es-esta");
  await admin.fill("#pw-new", ADMIN_PW2);
  await admin.fill("#pw-confirm", ADMIN_PW2);
  await admin.click("#password-submit");
  await admin.getByText("La contraseña actual no es correcta").waitFor();
  await admin.fill("#pw-current", ADMIN_PW);
  await admin.click("#password-submit");
  await admin.getByText("Contraseña actualizada").waitFor();
  await admin.click("#logout");
  await admin.fill("#login-password", ADMIN_PW);
  await admin.click("#login-submit");
  await admin.getByText("Contraseña incorrecta").waitFor();
  await admin.fill("#login-password", ADMIN_PW2);
  await admin.click("#login-submit");
  await admin.locator("#panel-view").waitFor();

  log("seguridad: escrituras sin token CSRF se rechazan y la base no se descarga");
  const noCsrf = await fetch(BASE + "api.php?action=admin_draw_start", { method: "POST", body: "{}" });
  assert.equal(noCsrf.status, 403);
  for (const blocked of ["config.php"]) {
    const r = await fetch(BASE + blocked);
    assert.equal((await r.text()).trim(), "", `${blocked} no debe mostrar contenido`);
  }

  console.log("\n✔ Todas las pruebas pasaron");
} catch (err) {
  console.error(`\n✘ Falló en: ${step}\n`, err);
  if (phpErr.includes("PHP")) console.error(phpErr.split("\n").filter((l) => /PHP|error/i.test(l)).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  php.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
