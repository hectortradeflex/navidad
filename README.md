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
- Los resultados viven solo en el servidor (SQLite). **El panel de administración no
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
data/                 se crea sola en el servidor con la base de datos (no va en git)
```

Es HTML, CSS y JavaScript sin compilar, más un archivo PHP. No usa dependencias ni
`package.json`.

## Publicar en Hostinger

> ⚠️ **No uses «Aplicación web Node.js → Importar repositorio».** Ese flujo es para
> sitios de Node o estáticos. Si eliges **«Desplegar como estático»**, las páginas se ven,
> pero `api.php` no se ejecuta y no funciona ni el registro, ni la rueda, ni el panel.
> Este sitio necesita un **sitio web normal con PHP**, como `media.tradeflexgroup.com`.

### Opción A · Desde GitHub con la herramienta Git de hPanel (recomendada)

Los archivos del sitio están en la raíz del repositorio, así que se clonan tal cual en
`public_html`.

1. **Crea el sitio.** En hPanel, agrega un subdominio o sitio vacío, por ejemplo
   `navidad.tradeflexgroup.com`, **sin** conectarlo como aplicación Node.js. Activa el
   SSL en *Seguridad → SSL*.
2. **Revisa PHP.** En *Avanzado → Configuración de PHP*, usa PHP **8.0 o superior** y
   confirma que estén activas **pdo_sqlite** y **mbstring**. Vienen activas por defecto.
3. **Vacía `public_html`.** Hostinger pide la carpeta vacía para el primer despliegue.
   Si tiene un archivo de bienvenida, como `default.php`, bórralo desde el
   *Administrador de archivos*.
4. **Conecta el repositorio.** Ve a *Avanzado → GIT*:
   - **Repositorio:** si es privado, `git@github.com:hectortradeflex/navidad.git`; si es
     público, `https://github.com/hectortradeflex/navidad.git`.
   - **Rama:** `main`.
   - **Directorio:** déjalo vacío, para que se instale en `public_html`.
   - **Si el repo es privado:** en esa misma página, hPanel muestra una **clave SSH**.
     Cópiala y agrégala en GitHub, en el repo *navidad → Settings → Deploy keys →
     Add deploy key*. Solo necesita lectura.
   - Pulsa **Crear** y luego **Desplegar**.
5. **Actualizaciones automáticas (opcional).** En *Avanzado → GIT*, activa
   *Implementación automática* y copia la URL del webhook. Pégala en GitHub, en
   *Settings → Webhooks → Add webhook*, como *Payload URL*. Desde entonces, cada cambio
   en `main` se publica solo.
6. **Crea tu contraseña.** Abre `https://navidad.tradeflexgroup.com/admin.html`. La
   primera vez, el panel te pide **crear la contraseña** (mínimo 8 caracteres). Hazlo
   enseguida, antes de compartir el enlace: la contraseña la fija quien entre primero.
7. Agrega a los participantes, llena los datos del intercambio, pulsa
   **Iniciar sorteo** y comparte el enlace con el botón **Copiar**.

Al actualizar desde Git, los datos no se pierden. La base vive en `data/`, que no está
en el repositorio, y la contraseña se guarda en esa base, no en un archivo. **No edites
archivos del sitio en el servidor**, porque el siguiente despliegue podría fallar. Para
respaldar, descarga `data/intercambio.sqlite`.

### Opción B · Subir los archivos a mano

En GitHub, pulsa *Code → Download ZIP*. En el *Administrador de archivos* de Hostinger,
sube el ZIP a `public_html` y extráelo de modo que `index.html`, `api.php` y
`.htaccess` queden directamente en `public_html`. Sigue después desde el paso 6 de la
opción A.

### Opcional: fijar la contraseña o mover los datos
En `config.php` puedes fijar la contraseña (`admin_password`) en lugar de crearla
desde el panel. También puedes mover la base de datos fuera de `public_html`
(`data_dir`), por ejemplo a `dirname(__DIR__) . '/intercambio-datos'`.

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
