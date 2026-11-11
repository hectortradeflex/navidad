<?php
/*
 * Intercambio Navideño · configuración
 *
 * Contraseña del panel de administración:
 *   - Lo normal es dejarla VACÍA: la primera vez que abras admin.html, el panel te
 *     pide crearla y la guarda cifrada en la base de datos. Así no hay que editar
 *     este archivo en el servidor (lo que rompería las actualizaciones desde Git).
 *   - Si prefieres fijarla aquí, escríbela tal cual (mínimo 8 caracteres) o pega un
 *     hash de password_hash() (empieza con "$2y$" o "$argon2"). Mientras esté fijada
 *     aquí, no se puede cambiar desde el panel.
 */
return [
    'admin_password' => getenv('INTERCAMBIO_ADMIN_PASSWORD') ?: '',

    // Carpeta donde se guarda la base de datos (un archivo SQLite).
    // Vacío = automático: una carpeta "intercambio-datos" JUNTO a public_html (fuera
    // de ella), para que sobreviva cuando un despliegue reemplaza todo public_html.
    // Si el hosting no deja escribir ahí, se usa "data/" dentro del sitio (protegida
    // por .htaccess). También puedes poner una ruta fija.
    'data_dir' => getenv('INTERCAMBIO_DATA_DIR') ?: '',
];
