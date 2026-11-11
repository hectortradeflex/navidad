# Intercambio Navideño 🎄

Sitio para organizar un intercambio de regalos (amigo secreto). Un administrador
arma la lista de participantes y abre el sorteo. Cada persona entra con su nombre y
una respuesta secreta, gira una rueda animada y descubre a quién le regala.

## Cómo funciona

| Pantalla | Qué hace |
|---|---|
| **Inicio** (`index.html`) | Presenta el intercambio (nombre, fecha, lugar, presupuesto, mensaje y cuenta regresiva) y explica los pasos. |
| **Participar** (`#/entrar`) | La persona escribe su nombre y crea una respuesta secreta. La primera vez se pide confirmarla. |
| **Rueda** (`#/rueda`) | Rueda con adornos navideños, **sin nombres**. Gira, frena al azar y solo al detenerse muestra el resultado. |
| **Resultado** (`#/resultado`) | "Tu amigo secreto es…", con confeti y los datos del intercambio. |
| **Consultar resultado** (`#/recuperar`) | Con nombre y respuesta secreta se vuelve a ver el mismo resultado. **No se gira otra vez.** |
| **Administración** (`admin.html`) | Con contraseña: agregar, corregir o quitar participantes, restablecer el acceso de quien olvidó su respuesta, abrir o reiniciar el sorteo y editar los datos de la página principal. |

### Reglas del sorteo
- El sorteo se hace **en el servidor** al pulsar *Iniciar sorteo*. Se barajan los
  participantes y se forma un solo círculo, donde cada quien le regala al siguiente.
  Así **nadie se toca a sí mismo y todos reciben exactamente un regalo**.
- La rueda solo es la forma de descubrir el resultado. El navegador recibe el nombre
  hasta que la persona gira, y lo muestra cuando la rueda se detiene.
- Girar solo cuenta una vez. Si alguien recarga la página o vuelve a entrar, ve el
  mismo resultado.
- Mientras el sorteo está abierto, la lista queda fija: se pueden corregir nombres,
  pero no agregar ni quitar personas. Para eso hay que *Reiniciar sorteo*, que borra
  todas las asignaciones, y todos vuelven a girar.

### Seguridad
- Los resultados viven solo en el servidor (SQLite, fuera de la carpeta pública). **El panel de administración no
  los muestra**, para que quien organiza también pueda participar.
- Las respuestas secretas se guardan solo como hash (`password_hash`). Al
  compararlas no importan mayúsculas, acentos ni espacios de más.
- La contraseña del panel se crea en la primera visita a `admin.html` y se guarda como
  hash. Después solo se puede cambiar desde el panel, conociendo la actual.
- Tras 6 intentos fallidos con un nombre, o 6 intentos de contraseña de
  administración, ese acceso se bloquea 15 minutos. También hay un límite por IP.
- Cada escritura requiere el token CSRF de la sesión. La cookie es `HttpOnly` y
  `SameSite=Strict`, y la sesión se renueva al entrar.
- `config.php`, la carpeta `data/`, los archivos `.sqlite`, `.git`, `tests/` y la
  documentación no se pueden descargar: los protege el `.htaccess`, y la carpeta
  `data/` se crea con su propio `.htaccess`.
- Si alguien olvida su respuesta, el administrador pulsa **Restablecer acceso** (🔑).
  La persona crea una nueva y ve el mismo resultado que ya tenía.

## Estructura

```
index.html            sitio de participantes (inicio, entrar, rueda, resultado, consultar)
admin.html            panel de administración
api.php               API y lógica del sorteo (PHP 8 + SQLite)
config.php            opciones (normalmente no hay que tocarlo)
.htaccess             seguridad, caché y HTTPS
assets/               styles.css, app.js, admin.js, wheel.js, common.js, favicon.svg
tests/e2e.mjs         prueba de punta a punta (no se sirve en la web)
(intercambio-datos/)   se crea sola junto a public_html con la base de datos (no va en git)
```

Es HTML, CSS y JavaScript sin compilar, más un archivo PHP. No usa dependencias ni
`package.json`.

## Publicar en Hostinger

El sitio necesita **PHP 8 o superior** con **pdo_sqlite** (Hostinger los trae activos
por defecto). La base de datos se guarda **fuera** de la carpeta del sitio, en
`intercambio-datos/`, junto a `public_html`. Así, aunque un despliegue reemplace todo
`public_html`, no se pierden los participantes, el sorteo ni la contraseña.

### Opción A · «Importar repositorio» → «Desplegar como estático»

1. En hPanel: *Sitios web → Agregar sitio web → Aplicación web Node.js → Importar
   repositorio de Git*. Elige **hectortradeflex/navidad**, rama **main**.
2. Hostinger avisa que no encontró `package.json`. Es normal: este sitio no usa Node.
   Pulsa **Desplegar como estático**. Si pide directorio de salida, deja la raíz.
3. Asigna el dominio, por ejemplo `navidad.tradeflexgroup.com`, y activa el SSL.
4. Abre `https://navidad.tradeflexgroup.com/admin.html`:
   - Si aparece **«Primera vez: crea la contraseña del panel»**, todo funciona. Créala
     enseguida, antes de compartir el enlace: la contraseña la fija quien entre primero.
   - Si aparece **«El servidor no está ejecutando PHP»**, ese tipo de sitio no ejecuta
     PHP. Usa la opción B.
5. Agrega a los participantes, llena los datos del intercambio, pulsa
   **Iniciar sorteo** y comparte el enlace con el botón **Copiar**.

Cada cambio que llegue a `main` se vuelve a publicar solo, y los datos se conservan.

### Opción B · Sitio web normal + herramienta Git de hPanel

1. Crea un sitio o subdominio normal, **no** una aplicación Node.js, con SSL y PHP 8
   (*Avanzado → Configuración de PHP*).
2. Si `public_html` tiene un archivo de bienvenida, como `default.php`, bórralo.
   Hostinger pide la carpeta vacía para el primer despliegue.
3. En *Avanzado → GIT*:
   - **Repositorio:** `https://github.com/hectortradeflex/navidad.git`. Si el repo se
     vuelve privado, usa `git@github.com:hectortradeflex/navidad.git` y agrega la
     clave SSH que muestra hPanel en GitHub, en *Settings → Deploy keys*.
   - **Rama:** `main`.
   - **Directorio:** vacío.
   - Pulsa **Crear** y luego **Desplegar**.
   - Para actualizar solo, activa *Implementación automática* y pega la URL del
     webhook en GitHub, en *Settings → Webhooks*.
4. Sigue desde el paso 4 de la opción A.

### Opción C · Subir los archivos a mano

En GitHub, pulsa *Code → Download ZIP*. En el *Administrador de archivos*, súbelo y
extráelo de modo que `index.html`, `api.php` y `.htaccess` queden directamente en
`public_html`. Sigue desde el paso 4 de la opción A.

> **Respaldo:** descarga `intercambio-datos/intercambio.sqlite`, que está junto a
> `public_html`. Si el hosting no deja escribir fuera del sitio, la base se guarda
> dentro, en `data/`, protegida por `.htaccess`. En ese caso, **no la borres al
> actualizar**. En `config.php` puedes fijar otra ruta (`data_dir`) o la contraseña
> (`admin_password`).

## Probar en tu computadora

```bash
php -S localhost:8080
```

Abre http://localhost:8080/admin.html para crear la contraseña y armar el
intercambio, y luego http://localhost:8080 como participante.

Prueba automática de punta a punta (requiere PHP 8 con pdo_sqlite, Node 18+ y
Playwright con Chromium):

```bash
node tests/e2e.mjs
```

La prueba arma un intercambio de 5 personas y revisa el flujo completo:

- Creación y cambio de la contraseña del panel.
- Registro y confirmación de la respuesta secreta.
- La rueda no muestra nombres mientras gira.
- El sorteo es válido: nadie se regala a sí mismo y todos reciben un regalo.
- Volver a entrar no vuelve a girar.
- La consulta funciona sin acentos ni mayúsculas.
- El bloqueo por intentos fallidos.
- Restablecer el acceso, renombrar y reiniciar el sorteo.
- El panel nunca recibe los resultados y las escrituras sin token CSRF se rechazan.
