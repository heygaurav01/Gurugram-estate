<?php
/**
 * Lead relay for Hostinger: receives the enquiry form from this site and
 * forwards it to Leadrat with the secret API key. Mirrors scripts/leadrat-relay.mjs
 * (the local dev relay); keep the two in step.
 *
 * SETUP ON HOSTINGER (once):
 *   1. Upload the built site (dist/) into public_html/.
 *   2. Copy api/leadrat-config.example.php to the folder ABOVE public_html
 *      (your home folder), rename it leadrat-config.php and put the API key in it.
 *      It must never be inside public_html.
 *   3. Submit a form on the site and check Leads in Leadrat.
 *
 * The key is read from that file (or the LEADRAT_API_KEY environment variable).
 * The browser never sees it.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['ok' => false, 'error' => 'method']);

// Same-site only: browsers send Origin on POST; reject other sites.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\d+$/', '', $host)) {
    reply(403, ['ok' => false, 'error' => 'origin']);
}

$raw = file_get_contents('php://input', false, null, 0, 16384);
$body = json_decode($raw ?: '', true);
if (!is_array($body)) reply(400, ['ok' => false, 'error' => 'body']);

// --- config (outside public_html) -----------------------------------------
$config = [];
foreach ([dirname(__DIR__, 2) . '/leadrat-config.php', dirname(__DIR__, 3) . '/leadrat-config.php'] as $f) {
    if (is_file($f)) { $config = require $f; break; }
}
$apiKey = (string)($config['api_key'] ?? getenv('LEADRAT_API_KEY') ?: '');
$apiUrl = (string)($config['api_url'] ?? 'https://connect.leadrat.com/api/v1/integration/Website');
if ($apiKey === '') reply(503, ['ok' => false, 'error' => 'not_configured']);

// --- simple rate limit: 6 leads per IP per 10 minutes ---------------------
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$bucket = sys_get_temp_dir() . '/gp-lead-' . hash('sha256', $ip);
$now = time();
$hits = array_filter(
    is_file($bucket) ? (array)json_decode((string)file_get_contents($bucket), true) : [],
    fn($t) => is_int($t) && $t > $now - 600
);
if (count($hits) >= 6) reply(429, ['ok' => false, 'error' => 'rate_limited']);
$hits[] = $now;
@file_put_contents($bucket, json_encode(array_values($hits)), LOCK_EX);

// --- validation (same rules as scripts/leadrat-relay.mjs) -----------------
$s = fn($k) => is_string($body[$k] ?? null) ? trim($body[$k]) : '';
if ($s('company_website') !== '') reply(200, ['ok' => true, 'id' => 'ok']); // honeypot

$name = preg_replace('/\s+/', ' ', $s('name'));
if (mb_strlen($name) < 2 || mb_strlen($name) > 80 || preg_match('/[<>{}]/', $name)) {
    reply(400, ['ok' => false, 'error' => 'name']);
}
$digits = preg_replace('/\D/', '', $s('phone'));
$digits = preg_replace('/^(91|0)(?=\d{10}$)/', '', $digits);
if (!preg_match('/^[6-9]\d{9}$/', $digits)) reply(400, ['ok' => false, 'error' => 'phone']);
$email = $s('email');
if ($email !== '' && (strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL))) {
    reply(400, ['ok' => false, 'error' => 'email']);
}

$projects = json_decode((string)@file_get_contents(__DIR__ . '/lead-projects.json'), true) ?: [];
$slug = $s('project_slug');
if (!isset($projects[$slug])) reply(400, ['ok' => false, 'error' => 'project']);
$project = $projects[$slug];

// --- shape for Leadrat -----------------------------------------------------
$labels = [
    'hero' => 'Hero enquiry', 'pricing' => 'Pricing request',
    'floor-plan' => 'Floor plan / master plan request', 'gallery' => 'Gallery: official images',
    'location' => 'Location / map', 'footer' => 'Footer enquiry', 'sticky' => 'Sticky bar enquiry',
    'nav' => 'Header enquiry', 'amenities' => 'Amenities', 'virtual-tour' => 'Virtual tour',
    'general' => 'General enquiry',
];
$intentKey = $s('intent') ?: 'general';
$intent = $labels[$intentKey] ?? $intentKey;
$page = substr($s('page_path'), 0, 200);
$consentV = substr($s('consent_version'), 0, 40);

$ist = new DateTime('now', new DateTimeZone('Asia/Kolkata'));
$notes = trim(implode(' ', array_filter([
    "Website enquiry for {$project['name']}.",
    "Form: {$intent}.",
    $page !== '' ? "Page: {$page}." : '',
    $consentV !== '' ? "Consent {$consentV} given at " . substr($s('consent_at'), 0, 40) . '.' : '',
])));

$extra = ['EnquiredFor' => 'Buy', 'FormIntent' => $intent, 'LandingPage' => $page, 'ProjectSlug' => $slug];
$key = substr($s('idempotency_key'), 0, 64);
if ($key !== '') $extra['WebsiteLeadId'] = $key;
foreach (['source', 'medium', 'campaign', 'term', 'content'] as $u) {
    $v = substr($s('utm_' . $u), 0, 150);
    if ($v !== '') $extra['utm_' . $u] = $v;
}
if ($s('gclid') !== '') $extra['utm_gclid'] = substr($s('gclid'), 0, 200);

$payload = [[
    'name' => $name,
    'countryCode' => '91',
    'mobile' => $digits,
    'email' => $email,
    // Leadrat splits "project" on commas, so never send one.
    'project' => trim(preg_replace('/\s*,\s*/', ' ', $project['name'])),
    'location' => $project['location'] ?? '',
    'city' => $project['city'] ?? 'Gurugram',
    'state' => $project['state'] ?? 'Haryana',
    'notes' => $notes,
    'submittedDate' => $ist->format('d-m-y'),
    'submittedTime' => $ist->format('H:i:s'),
    'subSource' => "Landing page: {$slug}",
    'CampaignName' => substr($s('utm_campaign'), 0, 150),
    'additionalProperties' => $extra,
]];

// --- forward ----------------------------------------------------------------
$ch = curl_init($apiUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'API-Key: ' . $apiKey],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($status < 200 || $status >= 300) reply(502, ['ok' => false, 'error' => 'crm_rejected', 'crmStatus' => $status]);
reply(200, ['ok' => true, 'id' => $key !== '' ? $key : 'ok']);
