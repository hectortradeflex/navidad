<?php
/*
 * Intercambio Navideño · API
 *
 * Todo el estado vive aquí, en una base SQLite: la lista de participantes, sus
 * respuestas secretas (solo como hash) y a quién le regala cada quien. El navegador
 * nunca recibe la lista de resultados; cada participante solo puede pedir el suyo
 * después de demostrar quién es con su nombre y su respuesta secreta.
 *
 * Rutas:  api.php?action=<acción>   (GET para leer, POST con JSON para escribir)
 */
declare(strict_types=1);

$CONFIG = require __DIR__ . '/config.php';

const DEFAULT_PASSWORD = 'cambia-esta-contrasena';
const MAX_PARTICIPANTS = 200;
const MIN_FOR_DRAW = 3;
const NAME_MAX = 60;
const SECRET_MIN = 3;
const SECRET_MAX = 100;

// ------------------------------------------------------------------ respuesta
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['ok' => $code < 400] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $code, string $error, string $message, array $extra = []): void
{
    out(['error' => $error, 'message' => $message] + $extra, $code);
}

set_exception_handler(function (Throwable $e): void {
    error_log('[intercambio] ' . $e->getMessage());
    fail(500, 'server', 'Algo salió mal en el servidor. Intenta de nuevo en un momento.');
});

// ------------------------------------------------------------------ sesión
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.gc_maxlifetime', '14400');
session_name('intercambio');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

// ------------------------------------------------------------------ base de datos
function db(): PDO
{
    static $pdo = null;
    global $CONFIG;
    if ($pdo) {
        return $pdo;
    }
    $dir = rtrim((string) $CONFIG['data_dir'], '/');
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("No se pudo crear la carpeta de datos $dir");
    }
    if (!file_exists("$dir/.htaccess")) {
        @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
    }
    if (!file_exists("$dir/index.html")) {
        @file_put_contents("$dir/index.html", '');
    }
    $pdo = new PDO('sqlite:' . $dir . '/intercambio.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS participants (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            name_key      TEXT NOT NULL UNIQUE,
            secret_hash   TEXT,
            registered_at TEXT,
            gen           INTEGER NOT NULL DEFAULT 0,
            receiver_id   INTEGER REFERENCES participants(id),
            revealed_at   TEXT,
            created_at    TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS attempts (
            key          TEXT PRIMARY KEY,
            fails        INTEGER NOT NULL,
            first_at     INTEGER NOT NULL,
            locked_until INTEGER NOT NULL DEFAULT 0
        );
    SQL);
    return $pdo;
}

function now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

const SETTING_DEFAULTS = [
    'title' => 'Intercambio Navideño',
    'date' => '',
    'place' => '',
    'budget' => '',
    'message' => '',
];

function settings(): array
{
    $s = SETTING_DEFAULTS;
    foreach (db()->query('SELECT key, value FROM settings') as $row) {
        $s[$row['key']] = $row['value'];
    }
    return $s;
}

function set_setting(string $key, ?string $value): void
{
    if ($value === null) {
        db()->prepare('DELETE FROM settings WHERE key = ?')->execute([$key]);
    } else {
        db()->prepare('INSERT INTO settings (key, value) VALUES (?, ?)
                       ON CONFLICT(key) DO UPDATE SET value = excluded.value')->execute([$key, $value]);
    }
}

function draw_open(): bool
{
    return isset(settings()['draw_started_at']);
}

function public_settings(): array
{
    $s = settings();
    return [
        'title' => $s['title'],
        'date' => $s['date'],
        'place' => $s['place'],
        'budget' => $s['budget'],
        'message' => $s['message'],
        'drawOpen' => isset($s['draw_started_at']),
        'participants' => (int) db()->query('SELECT COUNT(*) FROM participants')->fetchColumn(),
    ];
}

// ------------------------------------------------------------------ texto
function lower(string $s): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
}

function strlen_u(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

/** Limpia un nombre para mostrarlo: sin espacios de más ni caracteres de control. */
function clean_name($s): string
{
    $s = is_string($s) ? $s : '';
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s) ?? '';
    return trim(preg_replace('/\s+/u', ' ', $s) ?? '');
}

/**
 * Forma de comparar nombres y respuestas: sin mayúsculas, acentos ni espacios de más.
 * Así "José  Pérez" y "jose perez" son la misma persona, y la respuesta secreta
 * "Pistache" se reconoce aunque la escriban "pistaché".
 */
function fold(string $s): string
{
    $s = lower(clean_name($s));
    return strtr($s, [
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a', 'å' => 'a',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'õ' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'ñ' => 'n', 'ç' => 'c',
    ]);
}

// ------------------------------------------------------------------ límite de intentos
function client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'desconocida');
}

function rl_check(string $key): void
{
    $st = db()->prepare('SELECT locked_until FROM attempts WHERE key = ?');
    $st->execute([$key]);
    $until = (int) ($st->fetchColumn() ?: 0);
    if ($until > time()) {
        $min = (int) ceil(($until - time()) / 60);
        fail(429, 'locked', "Demasiados intentos. Espera $min " . ($min === 1 ? 'minuto' : 'minutos') . ' y vuelve a intentarlo.');
    }
}

/** Registra un intento fallido. Devuelve cuántos intentos quedan antes del bloqueo. */
function rl_fail(string $key, int $max, int $window): int
{
    $t = time();
    $st = db()->prepare('SELECT fails, first_at FROM attempts WHERE key = ?');
    $st->execute([$key]);
    $row = $st->fetch();
    if (!$row || $t - (int) $row['first_at'] > $window) {
        $fails = 1;
        $first = $t;
    } else {
        $fails = (int) $row['fails'] + 1;
        $first = (int) $row['first_at'];
    }
    $locked = $fails >= $max ? $t + $window : 0;
    db()->prepare('INSERT INTO attempts (key, fails, first_at, locked_until) VALUES (?, ?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, first_at = excluded.first_at,
                   locked_until = excluded.locked_until')->execute([$key, $fails, $first, $locked]);
    return max(0, $max - $fails);
}

function rl_clear(string $key): void
{
    db()->prepare('DELETE FROM attempts WHERE key = ?')->execute([$key]);
}

// ------------------------------------------------------------------ participante en sesión
function current_participant(): ?array
{
    if (empty($_SESSION['pid'])) {
        return null;
    }
    $st = db()->prepare('SELECT * FROM participants WHERE id = ?');
    $st->execute([$_SESSION['pid']]);
    $p = $st->fetch();
    // Si el administrador restableció su acceso (gen cambió) o lo borró, la sesión ya no vale.
    if (!$p || (int) $p['gen'] !== (int) ($_SESSION['pgen'] ?? -1) || $p['secret_hash'] === null) {
        unset($_SESSION['pid'], $_SESSION['pgen']);
        return null;
    }
    return $p;
}

function me_payload(?array $p): ?array
{
    if (!$p) {
        return null;
    }
    return [
        'name' => $p['name'],
        'spun' => $p['revealed_at'] !== null,
        'drawOpen' => $p['receiver_id'] !== null,
    ];
}

function receiver_name(array $p): ?string
{
    if ($p['receiver_id'] === null) {
        return null;
    }
    $st = db()->prepare('SELECT name FROM participants WHERE id = ?');
    $st->execute([$p['receiver_id']]);
    $name = $st->fetchColumn();
    return $name === false ? null : (string) $name;
}

// ------------------------------------------------------------------ administrador
const PASSWORD_MIN = 8;

/** Contraseña fijada en config.php (o variable de entorno), si es válida. */
function config_password(): ?string
{
    global $CONFIG;
    $pw = (string) ($CONFIG['admin_password'] ?? '');
    if ($pw === '' || $pw === DEFAULT_PASSWORD || strlen($pw) < PASSWORD_MIN) {
        return null;
    }
    return $pw;
}

function admin_configured(): bool
{
    return config_password() !== null || isset(settings()['admin_hash']);
}

function admin_password_ok(string $given): bool
{
    $stored = config_password();
    if ($stored === null) {
        $hash = settings()['admin_hash'] ?? null;
        return $hash !== null && password_verify($given, $hash);
    }
    if (preg_match('/^\$(2y|2a|2b|argon2i|argon2id)\$/', $stored)) {
        return password_verify($given, $stored);
    }
    return hash_equals($stored, $given);
}

function new_password_or_fail(array $in): string
{
    $pw = is_string($in['password'] ?? null) ? $in['password'] : '';
    $confirm = is_string($in['confirm'] ?? null) ? $in['confirm'] : '';
    if (strlen_u($pw) < PASSWORD_MIN || strlen($pw) > 200) {
        fail(400, 'weak_password', 'La contraseña debe tener al menos ' . PASSWORD_MIN . ' caracteres.');
    }
    if ($pw !== $confirm) {
        fail(400, 'mismatch', 'Las dos contraseñas no coinciden.');
    }
    return $pw;
}

function require_admin(): void
{
    if (empty($_SESSION['admin'])) {
        fail(401, 'admin_required', 'Tu sesión de administrador terminó. Vuelve a entrar.');
    }
}

function admin_state(): array
{
    $rows = db()->query('SELECT id, name, secret_hash, revealed_at, receiver_id FROM participants
                         ORDER BY name_key')->fetchAll();
    $list = array_map(fn($r) => [
        'id' => (int) $r['id'],
        'name' => $r['name'],
        'registered' => $r['secret_hash'] !== null,
        'spun' => $r['revealed_at'] !== null,
    ], $rows);
    $s = settings();
    return [
        'passwordInConfig' => config_password() !== null,
        'settings' => array_intersect_key($s, SETTING_DEFAULTS),
        'draw' => [
            'open' => isset($s['draw_started_at']),
            'startedAt' => $s['draw_started_at'] ?? null,
        ],
        'participants' => $list,
        'counts' => [
            'total' => count($list),
            'registered' => count(array_filter($list, fn($p) => $p['registered'])),
            'spun' => count(array_filter($list, fn($p) => $p['spun'])),
        ],
    ];
}

function find_by_key(string $key): ?array
{
    $st = db()->prepare('SELECT * FROM participants WHERE name_key = ?');
    $st->execute([$key]);
    $p = $st->fetch();
    return $p ?: null;
}

function validate_name(string $name): void
{
    if ($name === '' || fold($name) === '') {
        fail(400, 'invalid_name', 'Escribe un nombre.');
    }
    if (strlen_u($name) > NAME_MAX) {
        fail(400, 'invalid_name', 'El nombre «' . $name . '» es demasiado largo (máximo ' . NAME_MAX . ' caracteres).');
    }
}

// ------------------------------------------------------------------ petición
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string) ($_GET['action'] ?? '');
$in = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 64 * 1024) {
        fail(413, 'too_large', 'La petición es demasiado grande.');
    }
    $in = json_decode($raw, true);
    if (!is_array($in)) {
        $in = [];
    }
    // Protección CSRF: cada escritura lleva el token de la sesión en una cabecera.
    $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!hash_equals($_SESSION['csrf'], $token)) {
        fail(403, 'csrf', 'Tu sesión expiró. Recarga la página e intenta de nuevo.');
    }
} elseif ($method !== 'GET') {
    fail(405, 'method', 'Método no permitido.');
}

$routes = [
    'GET info' => 'action_info',
    'GET result' => 'action_result',
    'POST enter' => 'action_enter',
    'POST recover' => 'action_recover',
    'POST spin' => 'action_spin',
    'POST leave' => 'action_leave',
    'GET admin_state' => 'action_admin_state',
    'POST admin_login' => 'action_admin_login',
    'POST admin_setup' => 'action_admin_setup',
    'POST admin_password' => 'action_admin_password',
    'POST admin_logout' => 'action_admin_logout',
    'POST admin_settings' => 'action_admin_settings',
    'POST admin_add' => 'action_admin_add',
    'POST admin_rename' => 'action_admin_rename',
    'POST admin_delete' => 'action_admin_delete',
    'POST admin_reset_access' => 'action_admin_reset_access',
    'POST admin_draw_start' => 'action_admin_draw_start',
    'POST admin_draw_reset' => 'action_admin_draw_reset',
];
$handler = $routes["$method $action"] ?? null;
if ($handler === null) {
    fail(404, 'not_found', 'Acción desconocida.');
}
$handler($in);

// ------------------------------------------------------------------ acciones públicas
function action_info(array $in): void
{
    out([
        'csrf' => $_SESSION['csrf'],
        'exchange' => public_settings(),
        'me' => me_payload(current_participant()),
        'admin' => !empty($_SESSION['admin']),
        'adminSetup' => !admin_configured(),
    ]);
}

/**
 * Identifica a un participante por nombre + respuesta secreta.
 * $mode = 'enter': si es su primera vez, registra la respuesta (pide confirmarla).
 * $mode = 'recover': solo consulta; nunca registra ni gira.
 */
function authenticate(array $in, string $mode): array
{
    $name = clean_name($in['name'] ?? '');
    $secret = is_string($in['secret'] ?? null) ? $in['secret'] : '';
    if ($name === '') {
        fail(400, 'invalid_name', 'Escribe tu nombre.');
    }
    $ipKey = 'ip:' . client_ip();
    rl_check($ipKey);

    $p = find_by_key(fold($name));
    if (!$p) {
        rl_fail($ipKey, 30, 900);
        fail(404, 'unknown_name', "No encontramos «{$name}» en la lista. Escríbelo como lo registró quien organiza el intercambio.");
    }

    $sk = fold($secret);
    if (strlen_u($sk) < SECRET_MIN || strlen_u($sk) > SECRET_MAX) {
        fail(400, 'invalid_secret', 'Tu respuesta secreta debe tener entre ' . SECRET_MIN . ' y ' . SECRET_MAX . ' caracteres.');
    }

    $pKey = 'p:' . $p['id'];
    rl_check($pKey);

    if ($p['secret_hash'] === null) {
        if ($mode === 'recover') {
            fail(409, 'not_registered', "{$p['name']}, todavía no tienes una respuesta secreta. Entra por «Participar» para crearla y girar la rueda.");
        }
        $confirm = $in['confirm'] ?? null;
        if (!is_string($confirm)) {
            out(['step' => 'confirm', 'name' => $p['name']]);
        }
        if (fold($confirm) !== $sk) {
            fail(400, 'mismatch', 'Las dos respuestas no coinciden. Escríbelas de nuevo con cuidado.');
        }
        $st = db()->prepare('UPDATE participants SET secret_hash = ?, registered_at = ?
                             WHERE id = ? AND secret_hash IS NULL');
        $st->execute([password_hash($sk, PASSWORD_DEFAULT), now(), $p['id']]);
        if ($st->rowCount() !== 1) {
            fail(409, 'taken', 'Alguien acaba de registrarse con este nombre. Si no fuiste tú, avisa a quien organiza.');
        }
    } elseif (!password_verify($sk, $p['secret_hash'])) {
        rl_fail($ipKey, 30, 900);
        $left = rl_fail($pKey, 6, 900);
        $msg = 'La respuesta secreta no coincide.';
        $msg .= $left > 0
            ? " Te quedan $left " . ($left === 1 ? 'intento' : 'intentos') . '.'
            : ' Por seguridad, espera 15 minutos antes de volver a intentarlo.';
        fail(401, 'wrong_secret', $msg . ' Si la olvidaste, pide a quien organiza que restablezca tu acceso.');
    }
    rl_clear($pKey);

    // Releer con los datos más recientes.
    $st = db()->prepare('SELECT * FROM participants WHERE id = ?');
    $st->execute([$p['id']]);
    $p = $st->fetch();

    if ($mode === 'recover' && $p['revealed_at'] === null) {
        fail(409, 'not_spun', "{$p['name']}, aún no has girado la rueda. Entra por «Participar» para descubrir a quién le regalas.");
    }

    session_regenerate_id(true);
    $_SESSION['pid'] = (int) $p['id'];
    $_SESSION['pgen'] = (int) $p['gen'];
    return $p;
}

function action_enter(array $in): void
{
    $p = authenticate($in, 'enter');
    out(['step' => 'done', 'me' => me_payload($p)]);
}

function action_recover(array $in): void
{
    $p = authenticate($in, 'recover');
    out(['me' => me_payload($p), 'receiver' => receiver_name($p)]);
}

function action_spin(array $in): void
{
    $pdo = db();
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $p = current_participant();
        if (!$p) {
            $pdo->exec('ROLLBACK');
            fail(401, 'not_signed_in', 'Primero escribe tu nombre y tu respuesta secreta.');
        }
        if ($p['receiver_id'] === null) {
            $pdo->exec('ROLLBACK');
            fail(409, 'draw_closed', 'Quien organiza aún no abre el sorteo. Vuelve a intentarlo más tarde.');
        }
        $already = $p['revealed_at'] !== null;
        if (!$already) {
            $pdo->prepare('UPDATE participants SET revealed_at = ? WHERE id = ?')->execute([now(), $p['id']]);
        }
        $pdo->exec('COMMIT');
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->exec('ROLLBACK');
        }
        throw $e;
    }
    out(['alreadySpun' => $already, 'receiver' => receiver_name($p)]);
}

function action_result(array $in): void
{
    $p = current_participant();
    if (!$p) {
        fail(401, 'not_signed_in', 'Escribe tu nombre y tu respuesta secreta para ver tu resultado.');
    }
    if ($p['revealed_at'] === null) {
        fail(409, 'not_spun', 'Aún no has girado la rueda.', ['me' => me_payload($p)]);
    }
    out(['me' => me_payload($p), 'receiver' => receiver_name($p)]);
}

function action_leave(array $in): void
{
    unset($_SESSION['pid'], $_SESSION['pgen']);
    session_regenerate_id(true);
    out(['csrf' => $_SESSION['csrf']]);
}

// ------------------------------------------------------------------ acciones de administración
function action_admin_login(array $in): void
{
    if (!admin_configured()) {
        fail(409, 'needs_setup', 'Todavía no hay contraseña de administración. Crea una para empezar.');
    }
    $key = 'admin:' . client_ip();
    rl_check($key);
    $pw = is_string($in['password'] ?? null) ? $in['password'] : '';
    if (!admin_password_ok($pw)) {
        $left = rl_fail($key, 6, 900);
        fail(401, 'wrong_password', $left > 0
            ? "Contraseña incorrecta. Te quedan $left " . ($left === 1 ? 'intento' : 'intentos') . '.'
            : 'Contraseña incorrecta. Por seguridad, espera 15 minutos.');
    }
    rl_clear($key);
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    out(['state' => admin_state()]);
}

/** Primera visita al panel: crear la contraseña. Solo funciona mientras no exista ninguna. */
function action_admin_setup(array $in): void
{
    $pw = new_password_or_fail($in);
    $pdo = db();
    $pdo->exec('BEGIN IMMEDIATE');
    if (admin_configured()) {
        $pdo->exec('ROLLBACK');
        fail(409, 'already_configured', 'La contraseña de administración ya existe. Entra con ella.');
    }
    set_setting('admin_hash', password_hash($pw, PASSWORD_DEFAULT));
    $pdo->exec('COMMIT');
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    out(['state' => admin_state()]);
}

function action_admin_password(array $in): void
{
    require_admin();
    if (config_password() !== null) {
        fail(409, 'in_config', 'La contraseña está fijada en config.php; cámbiala ahí.');
    }
    $key = 'admin:' . client_ip();
    rl_check($key);
    $current = is_string($in['current'] ?? null) ? $in['current'] : '';
    if (!admin_password_ok($current)) {
        rl_fail($key, 6, 900);
        fail(401, 'wrong_password', 'La contraseña actual no es correcta.');
    }
    $pw = new_password_or_fail($in);
    set_setting('admin_hash', password_hash($pw, PASSWORD_DEFAULT));
    out(['state' => admin_state()]);
}

function action_admin_logout(array $in): void
{
    unset($_SESSION['admin']);
    session_regenerate_id(true);
    out([]);
}

function action_admin_state(array $in): void
{
    require_admin();
    out(['state' => admin_state()]);
}

function action_admin_settings(array $in): void
{
    require_admin();
    $limits = ['title' => 80, 'date' => 10, 'place' => 100, 'budget' => 40, 'message' => 600];
    foreach ($limits as $key => $max) {
        $v = is_string($in[$key] ?? null) ? $in[$key] : '';
        $v = $key === 'message'
            ? trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', str_replace("\r", '', $v)) ?? '')
            : clean_name($v);
        if (strlen_u($v) > $max) {
            fail(400, 'invalid', "El campo «{$key}» es demasiado largo (máximo $max caracteres).");
        }
        if ($key === 'title' && $v === '') {
            $v = SETTING_DEFAULTS['title'];
        }
        if ($key === 'date' && $v !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
            fail(400, 'invalid', 'La fecha no es válida.');
        }
        set_setting($key, $v);
    }
    out(['state' => admin_state()]);
}

function action_admin_add(array $in): void
{
    require_admin();
    if (draw_open()) {
        fail(409, 'draw_open', 'El sorteo ya empezó. Para agregar personas, primero reinicia el sorteo.');
    }
    $names = $in['names'] ?? [];
    if (!is_array($names)) {
        $names = [];
    }
    $pdo = db();
    $count = (int) $pdo->query('SELECT COUNT(*) FROM participants')->fetchColumn();
    $added = [];
    $skipped = [];
    $pdo->exec('BEGIN IMMEDIATE');
    foreach ($names as $raw) {
        $name = clean_name($raw);
        if ($name === '') {
            continue;
        }
        validate_name($name);
        $key = fold($name);
        if (find_by_key($key)) {
            $skipped[] = $name;
            continue;
        }
        if ($count >= MAX_PARTICIPANTS) {
            $pdo->exec('ROLLBACK');
            fail(400, 'too_many', 'Se permite un máximo de ' . MAX_PARTICIPANTS . ' participantes.');
        }
        $pdo->prepare('INSERT INTO participants (name, name_key, created_at) VALUES (?, ?, ?)')
            ->execute([$name, $key, now()]);
        $added[] = $name;
        $count++;
    }
    $pdo->exec('COMMIT');
    out(['added' => $added, 'skipped' => $skipped, 'state' => admin_state()]);
}

function participant_or_404($id): array
{
    $st = db()->prepare('SELECT * FROM participants WHERE id = ?');
    $st->execute([(int) $id]);
    $p = $st->fetch();
    if (!$p) {
        fail(404, 'not_found', 'Esa persona ya no está en la lista.');
    }
    return $p;
}

function action_admin_rename(array $in): void
{
    require_admin();
    $p = participant_or_404($in['id'] ?? 0);
    $name = clean_name($in['name'] ?? '');
    validate_name($name);
    $key = fold($name);
    $other = find_by_key($key);
    if ($other && (int) $other['id'] !== (int) $p['id']) {
        fail(409, 'duplicate', "Ya hay alguien llamado «{$other['name']}» en la lista.");
    }
    db()->prepare('UPDATE participants SET name = ?, name_key = ? WHERE id = ?')->execute([$name, $key, $p['id']]);
    out(['state' => admin_state()]);
}

function action_admin_delete(array $in): void
{
    require_admin();
    if (draw_open()) {
        fail(409, 'draw_open', 'El sorteo ya empezó. Para quitar a alguien, primero reinicia el sorteo.');
    }
    $p = participant_or_404($in['id'] ?? 0);
    db()->prepare('DELETE FROM participants WHERE id = ?')->execute([$p['id']]);
    rl_clear('p:' . $p['id']);
    out(['state' => admin_state()]);
}

function action_admin_reset_access(array $in): void
{
    require_admin();
    $p = participant_or_404($in['id'] ?? 0);
    // Se borra solo la respuesta secreta. Su resultado (si ya giró) se conserva:
    // al registrarse de nuevo verá el mismo nombre, sin volver a girar.
    db()->prepare('UPDATE participants SET secret_hash = NULL, registered_at = NULL, gen = gen + 1 WHERE id = ?')
        ->execute([$p['id']]);
    rl_clear('p:' . $p['id']);
    out(['state' => admin_state()]);
}

function action_admin_draw_start(array $in): void
{
    require_admin();
    $pdo = db();
    $pdo->exec('BEGIN IMMEDIATE');
    if (draw_open()) {
        $pdo->exec('ROLLBACK');
        fail(409, 'draw_open', 'El sorteo ya está abierto.');
    }
    $ids = array_map('intval', $pdo->query('SELECT id FROM participants')->fetchAll(PDO::FETCH_COLUMN));
    if (count($ids) < MIN_FOR_DRAW) {
        $pdo->exec('ROLLBACK');
        fail(400, 'too_few', 'Agrega al menos ' . MIN_FOR_DRAW . ' participantes para iniciar el sorteo.');
    }
    // Barajar (Fisher–Yates con random_int) y formar un solo círculo:
    // cada quien le regala al siguiente. Nadie se toca a sí mismo y todos reciben un regalo.
    for ($i = count($ids) - 1; $i > 0; $i--) {
        $j = random_int(0, $i);
        [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]];
    }
    $st = $pdo->prepare('UPDATE participants SET receiver_id = ?, revealed_at = NULL WHERE id = ?');
    $n = count($ids);
    foreach ($ids as $i => $giver) {
        $st->execute([$ids[($i + 1) % $n], $giver]);
    }
    set_setting('draw_started_at', now());
    $pdo->exec('COMMIT');
    out(['state' => admin_state()]);
}

function action_admin_draw_reset(array $in): void
{
    require_admin();
    $pdo = db();
    $pdo->exec('BEGIN IMMEDIATE');
    $pdo->exec('UPDATE participants SET receiver_id = NULL, revealed_at = NULL');
    set_setting('draw_started_at', null);
    $pdo->exec('COMMIT');
    out(['state' => admin_state()]);
}
