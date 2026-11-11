<?php
/*
 * Intercambio Navideño · configuración
 *
 * Cambia la contraseña del administrador ANTES de publicar el sitio.
 * Puedes escribirla tal cual o pegar un hash generado con password_hash()
 * (empieza con "$2y$" o "$argon2"). Mientras siga la contraseña de ejemplo,
 * el panel de administración no deja entrar.
 */
return [
    'admin_password' => getenv('INTERCAMBIO_ADMIN_PASSWORD') ?: 'cambia-esta-contrasena',

    // Carpeta donde se guarda la base de datos (un archivo SQLite).
    // Si puedes, apúntala a una carpeta FUERA de public_html, por ejemplo:
    //   'data_dir' => dirname(__DIR__) . '/intercambio-datos',
    // Si la dejas aquí, el .htaccess de la carpeta impide descargarla.
    'data_dir' => getenv('INTERCAMBIO_DATA_DIR') ?: __DIR__ . '/data',
];
