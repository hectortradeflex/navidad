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
- Tras 6 intentos fallidos con un nombre, o 6 intentos de contraseña de
  administración, ese acceso se bloquea 15 minutos. También hay un límite por IP.
- Cada escritura requiere el token CSRF de la sesión. La cookie es `HttpOnly` y
  `SameSite=Strict`, y la sesión se renueva al entrar.
- `config.php`, la carpeta `data/` y los archivos `.sqlite` no se pueden descargar:
  los protege el `.htaccess`, y la carpeta `data/` se crea con su propio `.htaccess`.
- Si alguien olvida su respuesta, el administrador pulsa **Restablecer acceso** (🔑).
  La persona crea una nueva y ve el mismo resultado que ya tenía.

## Estructura

```
public/                 ← lo que se sube al hosting
  index.html            sitio de participantes (inicio, entrar, rueda, resultado, consultar)
  admin.html            panel de administración
  api.php               API y lógica del sorteo (PHP 8 + SQLite)
  config.php            contraseña del administrador y carpeta de datos
  .htaccess             seguridad, caché y HTTPS
  assets/               styles.css, app.js, admin.js, wheel.js, common.js, favicon.svg
tests/e2e.mjs           prueba de punta a punta (PHP embebido + Chromium)
```

Es HTML, CSS y JavaScript sin compilar, más un archivo PHP. No usa dependencias.

## Publicar en Hostinger

1. **Crea el sitio.** En hPanel, agrega un subdominio o sitio nuevo, por ejemplo
   `navidad.tradeflexgroup.com`. Activa el SSL en *Seguridad → SSL*.
2. **Revisa PHP.** En *Avanzado → Configuración de PHP*, usa PHP **8.0 o superior** y
   confirma que estén activas las extensiones **pdo_sqlite** y **mbstring**. Vienen
   activas por defecto.
3. **Sube los archivos.** Abre el *Administrador de archivos*, entra a `public_html` y
   sube **todo el contenido** de la carpeta `public/` (no la carpeta en sí), incluido
   `.htaccess`.
4. **Pon tu contraseña.** Edita `config.php` en el servidor y cambia
   `cambia-esta-contrasena` por una contraseña tuya de al menos 8 caracteres. Mientras
   no la cambies, el panel no deja entrar.
   - *Opcional:* mueve los datos fuera de `public_html` cambiando `data_dir`, por
     ejemplo a `dirname(__DIR__) . '/intercambio-datos'`.
5. Abre `https://navidad.tradeflexgroup.com/admin.html`, entra con tu contraseña,
   agrega a los participantes, llena los datos del intercambio y pulsa
   **Iniciar sorteo**.
6. Comparte el enlace del sitio (en el panel está el botón **Copiar**).

> **Al actualizar el sitio**, no reemplaces `config.php` (perderías tu contraseña) ni
> borres la carpeta `data/` (ahí están los participantes y el sorteo). Para respaldar,
> descarga `data/intercambio.sqlite`.

## Probar en tu computadora

```bash
INTERCAMBIO_ADMIN_PASSWORD=una-contrasena-larga php -S localhost:8080 -t public
```

Abre http://localhost:8080 y http://localhost:8080/admin.html.

Prueba automática de punta a punta (requiere PHP 8 con pdo_sqlite, Node 18+ y
Playwright con Chromium):

```bash
node tests/e2e.mjs
```

La prueba arma un intercambio de 5 personas y revisa el flujo completo:

- Registro y confirmación de la respuesta secreta.
- La rueda no muestra nombres mientras gira.
- El sorteo es válido: nadie se regala a sí mismo y todos reciben un regalo.
- Volver a entrar no vuelve a girar.
- La consulta funciona sin acentos ni mayúsculas.
- El bloqueo por intentos fallidos.
- Restablecer el acceso, renombrar y reiniciar el sorteo.
- El panel nunca recibe los resultados y las escrituras sin token CSRF se rechazan.
