// Intercambio Navideño · rueda animada
//
// La rueda NO lleva nombres: sus gajos solo tienen adornos navideños. El servidor ya
// sabe a quién le regala cada participante; la rueda es la forma divertida de
// descubrirlo y el nombre se muestra solo cuando termina de girar.

import { svg, reducedMotion } from "./common.js";

const SEGMENTS = 12;
const SEG = 360 / SEGMENTS;
const R = 188;

const PALETTE = [
  { fill: "#c1272d", ink: "#fff8ec" },
  { fill: "#fff8ec", ink: "#c1272d" },
  { fill: "#14593a", ink: "#f3d685" },
  { fill: "#e2b443", ink: "#0b3a26" },
];
const ICONS = ["star", "gift", "snow", "bauble"];

const rad = (deg) => ((deg - 90) * Math.PI) / 180;
const pt = (r, deg) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];
const mod = (a, n) => ((a % n) + n) % n;

function segmentPath(i) {
  const a0 = i * SEG - SEG / 2;
  const a1 = i * SEG + SEG / 2;
  const [x0, y0] = pt(R, a0);
  const [x1, y1] = pt(R, a1);
  return `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

function ornament(kind, color) {
  const g = svg("g");
  if (kind === "bauble") {
    g.append(
      svg("rect", { x: -5, y: -21, width: 10, height: 7, rx: 2, fill: color, opacity: 0.85 }),
      svg("circle", { cx: 0, cy: 0, r: 15, fill: color }),
      svg("path", { d: "M-15 0 Q0 7 15 0", stroke: "rgba(0,0,0,.22)", "stroke-width": 3, fill: "none" }),
      svg("circle", { cx: -5, cy: -5, r: 3.5, fill: "rgba(255,255,255,.55)" }),
    );
  } else {
    g.append(svg("use", { href: `#i-${kind}`, x: -17, y: -17, width: 34, height: 34, fill: color }));
  }
  return g;
}

function defs(root, id) {
  const d = svg("defs");
  const rim = svg("radialGradient", { id: `${id}-rim`, cx: "50%", cy: "40%", r: "65%" });
  rim.append(
    svg("stop", { offset: "0%", "stop-color": "#fbe6a4" }),
    svg("stop", { offset: "70%", "stop-color": "#d9a62e" }),
    svg("stop", { offset: "100%", "stop-color": "#8f6410" }),
  );
  const shade = svg("radialGradient", { id: `${id}-shade`, cx: "50%", cy: "50%", r: "50%" });
  shade.append(
    svg("stop", { offset: "55%", "stop-color": "#000", "stop-opacity": "0" }),
    svg("stop", { offset: "100%", "stop-color": "#000", "stop-opacity": "0.22" }),
  );
  const hub = svg("radialGradient", { id: `${id}-hub`, cx: "40%", cy: "35%", r: "70%" });
  hub.append(svg("stop", { offset: "0%", "stop-color": "#1f7a4f" }), svg("stop", { offset: "100%", "stop-color": "#0b3a26" }));
  d.append(rim, shade, hub);
  root.append(d);
}

/**
 * Dibuja la rueda dentro de un <svg>.
 * options.interactive = true agrega puntero, centro clicable y la función spin().
 */
export function createWheel(root, { interactive = false, id = "w" } = {}) {
  root.replaceChildren();
  defs(root, id);

  // Aro dorado con foquitos
  root.append(
    svg("circle", { r: 207, fill: `url(#${id}-rim)` }),
    svg("circle", { r: 192, fill: "#0b3a26" }),
  );

  const rotor = svg("g", { class: "wheel-rotor" });
  const segments = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const c = PALETTE[i % PALETTE.length];
    const path = svg("path", { d: segmentPath(i), fill: c.fill, stroke: "#d9a62e", "stroke-width": 2 });
    segments.push(path);
    rotor.append(path);
    const [x, y] = pt(128, i * SEG);
    const holder = svg("g", { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${i * SEG})` });
    holder.append(ornament(ICONS[i % ICONS.length], c.ink));
    rotor.append(holder);
    // Puntitos decorativos cerca del borde
    const [dx, dy] = pt(170, i * SEG);
    rotor.append(svg("circle", { cx: dx.toFixed(2), cy: dy.toFixed(2), r: 3, fill: c.ink, opacity: 0.7 }));
  }
  rotor.append(svg("circle", { r: R, fill: `url(#${id}-shade)` }));
  root.append(rotor);

  for (let i = 0; i < 24; i++) {
    const [x, y] = pt(199.5, i * 15 + 7.5);
    root.append(
      svg("circle", {
        class: "wheel-bulb",
        cx: x.toFixed(2),
        cy: y.toFixed(2),
        r: 4.6,
        fill: i % 2 ? "#fff8ec" : "#c1272d",
        stroke: "#7a560c",
        "stroke-width": 1,
      }),
    );
  }

  // Centro con estrella
  const hub = svg("g", { class: "wheel-hub" });
  hub.append(
    svg("circle", { r: 50, fill: "#d9a62e" }),
    svg("circle", { r: 44, fill: `url(#${id}-hub)` }),
    svg("use", { href: "#i-star", x: -24, y: -25, width: 48, height: 48, fill: "#f3d685" }),
  );
  root.append(hub);

  let angle = 0;
  const setAngle = (a) => rotor.setAttribute("transform", `rotate(${a.toFixed(3)})`);

  if (!interactive) return { root };

  // Puntero (fijo, arriba)
  const pointer = svg("g", { class: "wheel-pointer" });
  pointer.append(
    svg("path", {
      d: "M0 -168 L-19 -214 Q0 -236 19 -214 Z",
      fill: "#c1272d",
      stroke: "#f3d685",
      "stroke-width": 4,
      "stroke-linejoin": "round",
    }),
    svg("circle", { cx: 0, cy: -213, r: 6, fill: "#f3d685" }),
  );
  root.append(pointer);

  hub.setAttribute("role", "button");
  hub.setAttribute("tabindex", "0");
  hub.setAttribute("aria-label", "Girar la rueda");

  function tick() {
    if (pointer.animate) {
      pointer.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(-16deg)" }, { transform: "rotate(0deg)" }],
        { duration: 140, easing: "ease-out" },
      );
    }
  }

  /** Gira y se detiene en un gajo al azar. Resuelve cuando la rueda se detuvo. */
  function spin() {
    return new Promise((resolve) => {
      for (const s of segments) s.classList.remove("seg-win");
      const target = Math.floor(Math.random() * SEGMENTS);
      const jitter = (Math.random() - 0.5) * SEG * 0.7;
      const quick = reducedMotion();
      const turns = quick ? 1 : 6 + Math.floor(Math.random() * 3);
      const duration = quick ? 1200 : 6200 + Math.random() * 1400;
      const start = angle;
      const base = start + 360 * turns;
      const end = base + mod(-(target * SEG + jitter) - base, 360);
      const t0 = performance.now();
      let lastIdx = Math.floor((start + SEG / 2) / SEG);
      root.classList.add("spinning");

      const frame = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = 1 - Math.pow(1 - t, 4); // frena poco a poco
        angle = start + (end - start) * e;
        setAngle(angle);
        const idx = Math.floor((angle + SEG / 2) / SEG);
        if (idx !== lastIdx) {
          lastIdx = idx;
          if (!quick) tick();
        }
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          angle = mod(end, 360);
          setAngle(angle);
          root.classList.remove("spinning");
          segments[target].classList.add("seg-win");
          resolve(target);
        }
      };
      requestAnimationFrame(frame);
    });
  }

  return { root, hub, spin };
}
