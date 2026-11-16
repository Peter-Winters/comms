#!/usr/bin/env node
// Generates and wires together all configuration for Synapse + mautrix bridges.
// Safe to re-run: existing tokens and databases are kept, configs are re-patched.

import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');

// Bot names and puppet prefixes must match mobile/src/lib/networks.ts.
const BRIDGES = {
  whatsapp: { bot: 'whatsappbot' },
  signal: { bot: 'signalbot' },
  telegram: { bot: 'telegrambot' },
  instagram: { bot: 'instagrambot', usernameTemplate: 'instagram_{{.}}' },
  messenger: { bot: 'messengerbot', usernameTemplate: 'messenger_{{.}}' },
  gmessages: { bot: 'gmessagesbot' },
  gvoice: { bot: 'gvoicebot' },
  linkedin: { bot: 'linkedinbot' },
  discord: { bot: 'discordbot' },
  slack: { bot: 'slackbot' },
  twitter: { bot: 'twitterbot' },
  bluesky: { bot: 'blueskybot' },
};

// ------------------------------------------------------------------ helpers

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) {
    console.error('Missing server/.env — copy .env.example to .env and edit it first.');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function step(msg) {
  console.log(`\n▸ ${msg}`);
}

function docker(args, { allowFail = false, quiet = false, input } = {}) {
  const res = spawnSync('docker', args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    stdio: [input ? 'pipe' : 'ignore', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'],
  });
  if (res.status !== 0 && !allowFail) {
    if (quiet) console.error(res.stdout, res.stderr);
    throw new Error(`docker ${args.join(' ')} failed with exit code ${res.status}`);
  }
  return res;
}

const compose = (args, opts) => docker(['compose', ...args], opts);

function readYaml(path) {
  return YAML.parseDocument(readFileSync(path, 'utf8'));
}

function writeYaml(path, doc) {
  writeFileSync(path, doc.toString({ lineWidth: 0 }));
}

/** Sets a value only where the bridge's own config schema has that key's parent. */
function setIfParent(doc, path, value) {
  const parent = path.slice(0, -1);
  if (parent.length === 0 || YAML.isMap(doc.getIn(parent))) {
    doc.setIn(path, value);
    return true;
  }
  return false;
}

const token = () => randomBytes(32).toString('hex');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

// ------------------------------------------------------------------ main

const env = loadEnv();
const DOMAIN = env.DOMAIN;
const PG_PASSWORD = env.POSTGRES_PASSWORD;
const PORT = env.PORT || env.SYNAPSE_PORT || '8008';
const enabled = (env.COMPOSE_PROFILES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

for (const [key, value] of Object.entries({ DOMAIN, POSTGRES_PASSWORD: PG_PASSWORD, ADMIN_PASSWORD: env.ADMIN_PASSWORD })) {
  if (!value || value === 'change-me') {
    console.error(`Set ${key} in server/.env first.`);
    process.exit(1);
  }
}
const unknown = enabled.filter((b) => !BRIDGES[b]);
if (unknown.length) {
  console.error(`Unknown bridge(s) in COMPOSE_PROFILES: ${unknown.join(', ')}`);
  process.exit(1);
}
if (enabled.includes('telegram') && !(env.TELEGRAM_API_ID && env.TELEGRAM_API_HASH)) {
  console.error('The telegram bridge needs TELEGRAM_API_ID and TELEGRAM_API_HASH (https://my.telegram.org/apps).');
  process.exit(1);
}

try {
  execFileSync('docker', ['info'], { stdio: 'ignore' });
} catch {
  console.error('Docker is not running. Start Docker Desktop and try again.');
  process.exit(1);
}

const pgUri = (db) => `postgres://comms:${encodeURIComponent(PG_PASSWORD)}@postgres/${db}?sslmode=disable`;
const synapseDir = join(DATA, 'synapse');
const appserviceDir = join(synapseDir, 'appservices');
/** Per bridge: appservice port and whether it has the bridgev2 provisioning API. */
const bridgeInfo = {};
mkdirSync(appserviceDir, { recursive: true });

// 1. Synapse --------------------------------------------------------------
const hsPath = join(synapseDir, 'homeserver.yaml');
if (!existsSync(hsPath)) {
  step('Generating Synapse config');
  docker([
    'run', '--rm',
    '-v', `${synapseDir}:/data`,
    '-e', `SYNAPSE_SERVER_NAME=${DOMAIN}`,
    '-e', 'SYNAPSE_REPORT_STATS=no',
    'matrixdotorg/synapse:latest', 'generate',
  ]);
}

// Double puppeting lets bridges send messages you write on your phone as *you*, not a ghost user.
const dpPath = join(appserviceDir, 'doublepuppet.yaml');
if (!existsSync(dpPath)) {
  writeFileSync(
    dpPath,
    YAML.stringify({
      id: 'doublepuppet',
      url: null,
      as_token: token(),
      hs_token: token(),
      sender_localpart: `doublepuppet_${randomBytes(4).toString('hex')}`,
      rate_limited: false,
      namespaces: { users: [{ regex: `@.*:${DOMAIN.replace(/\./g, '\\.')}`, exclusive: false }] },
    }),
  );
}
const doublePuppetToken = YAML.parse(readFileSync(dpPath, 'utf8')).as_token;

// 2. Postgres -------------------------------------------------------------
step('Starting Postgres');
compose(['up', '-d', '--wait', 'postgres']);
for (let i = 0; ; i++) {
  if (compose(['exec', '-T', 'postgres', 'pg_isready', '-h', '127.0.0.1', '-U', 'comms'], { allowFail: true, quiet: true }).status === 0) break;
  if (i > 60) throw new Error('Postgres did not become ready');
  await sleep(1000);
}
for (const db of ['synapse', ...enabled]) {
  const exists = compose(
    ['exec', '-T', 'postgres', 'psql', '-U', 'comms', '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${db}'`],
    { quiet: true },
  ).stdout.trim();
  if (exists !== '1') {
    console.log(`  creating database ${db}`);
    compose(['exec', '-T', 'postgres', 'psql', '-U', 'comms', '-d', 'postgres', '-c', `CREATE DATABASE ${db} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`], { quiet: true });
  }
}

// 3. Bridges --------------------------------------------------------------
for (const name of enabled) {
  const meta = BRIDGES[name];
  const dir = join(DATA, name);
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, 'config.yaml');
  const registrationPath = join(dir, 'registration.yaml');

  if (!existsSync(configPath)) {
    step(`Generating ${name} config`);
    compose(['run', '--rm', '--no-deps', name], { allowFail: true });
    if (!existsSync(configPath)) throw new Error(`${name} did not generate a config.yaml`);
  }

  step(`Configuring ${name}`);
  const doc = readYaml(configPath);
  const port = doc.getIn(['appservice', 'port']) ?? 29300;

  doc.setIn(['homeserver', 'address'], 'http://synapse:8008');
  doc.setIn(['homeserver', 'domain'], DOMAIN);
  doc.setIn(['appservice', 'address'], `http://${name}:${port}`);
  doc.setIn(['appservice', 'hostname'], '0.0.0.0');
  doc.setIn(['appservice', 'id'], name);

  // bridgev2 bridges have a top-level `database`; older ones (discord) nest it under appservice.
  const dbPath = YAML.isMap(doc.get('database')) ? ['database'] : ['appservice', 'database'];
  doc.setIn([...dbPath, 'type'], 'postgres');
  doc.setIn([...dbPath, 'uri'], pgUri(name));

  doc.setIn(['appservice', 'bot', 'username'], meta.bot);
  if (meta.usernameTemplate) doc.setIn(['appservice', 'username_template'], meta.usernameTemplate);

  doc.setIn(['bridge', 'permissions'], {
    [DOMAIN]: 'user',
    [`@${env.ADMIN_USER || 'admin'}:${DOMAIN}`]: 'admin',
  });

  // The app doesn't do end-to-end encryption yet, so keep bridged rooms unencrypted.
  setIfParent(doc, ['encryption', 'allow'], false) || setIfParent(doc, ['bridge', 'encryption', 'allow'], false);
  setIfParent(doc, ['encryption', 'default'], false) || setIfParent(doc, ['bridge', 'encryption', 'default'], false);

  const dpSecret = { [DOMAIN]: `as_token:${doublePuppetToken}` };
  setIfParent(doc, ['double_puppet', 'secrets'], dpSecret) ||
    setIfParent(doc, ['bridge', 'login_shared_secret_map'], dpSecret);

  setIfParent(doc, ['backfill', 'enabled'], true);

  // bridgev2 provisioning API: lets the app log in natively, authenticated with its Matrix token.
  const provisioning = YAML.isMap(doc.get('provisioning'));
  if (provisioning) doc.setIn(['provisioning', 'allow_matrix_auth'], true);
  bridgeInfo[name] = { port, provisioning };

  if (name === 'whatsapp') {
    // Prefer the name saved in your contacts, and drop the default " (WA)" suffix: the app shows a network badge.
    doc.setIn(['network', 'displayname_template'], '{{or .FullName .BusinessName .PushName .Phone .RedactedPhone "Unknown user"}}');
  }
  if (name === 'telegram') {
    doc.setIn(['network', 'api_id'], Number(env.TELEGRAM_API_ID));
    doc.setIn(['network', 'api_hash'], env.TELEGRAM_API_HASH);
  }
  writeYaml(configPath, doc);

  if (!existsSync(registrationPath)) {
    step(`Generating ${name} appservice registration`);
    // Generate inside the container's /tmp and stream the results back: the bridges'
    // in-place config save fails on Docker Desktop bind mounts (Windows/macOS).
    compose(
      [
        'run', '--rm', '--no-deps', '--entrypoint', 'sh', name, '-c',
        'cp /data/config.yaml /tmp/config.yaml && ' +
          '$(ls /usr/bin/mautrix-* | head -n1) -g -c /tmp/config.yaml -r /tmp/registration.yaml && ' +
          'cat /tmp/config.yaml > /data/config.yaml && cat /tmp/registration.yaml > /data/registration.yaml',
      ],
      { allowFail: true },
    );
    if (!existsSync(registrationPath)) throw new Error(`${name} did not generate a registration.yaml`);
  }
  // Rewrite rather than copy so Synapse (a different container user) can read it.
  writeFileSync(join(appserviceDir, `${name}.yaml`), readFileSync(registrationPath, 'utf8'), { mode: 0o644 });
}

// 4. Wire Synapse to Postgres and the bridges ------------------------------
step('Configuring Synapse');
const hs = readYaml(hsPath);
hs.set('database', {
  name: 'psycopg2',
  args: { user: 'comms', password: PG_PASSWORD, database: 'synapse', host: 'postgres', cp_min: 5, cp_max: 10 },
});
hs.set('enable_registration', false);
hs.set('suppress_key_server_warning', true);
// A personal server: allow a few quick sign-ins (new devices, typos) before throttling.
hs.set('rc_login', {
  address: { per_second: 0.5, burst_count: 10 },
  account: { per_second: 0.5, burst_count: 10 },
  failed_attempts: { per_second: 0.2, burst_count: 5 },
});
// Synapse refuses outbound requests to private IPs by default; allow the Docker network so it
// can reach the push gateway.
hs.set('ip_range_whitelist', ['172.16.0.0/12', '192.168.0.0/16', '10.0.0.0/8']);
hs.set('app_service_config_files', ['/data/appservices/doublepuppet.yaml', ...enabled.map((b) => `/data/appservices/${b}.yaml`)]);
writeYaml(hsPath, hs);

// 5. Front door: Caddy routes the Matrix API and each bridge's provisioning API ----
step('Configuring Caddy');
const commsConfig = {
  version: 1,
  push_gateway_url: 'http://pushgateway:5000/_matrix/push/v1/notify',
  bridges: Object.fromEntries(
    enabled.map((b) => [
      b,
      {
        bot: `@${BRIDGES[b].bot}:${DOMAIN}`,
        provisioning: bridgeInfo[b].provisioning ? `/_comms/bridges/${b}` : null,
      },
    ]),
  ),
};
const bridgeRoutes = enabled
  .filter((b) => bridgeInfo[b].provisioning)
  .map((b) =>
    [
      `  handle_path /_comms/bridges/${b}/* {`,
      `    rewrite * /_matrix/provision{path}?{query}`,
      `    reverse_proxy ${b}:${bridgeInfo[b].port} {`,
      `      header_down -Access-Control-Allow-Origin`,
      `      header_down -Access-Control-Allow-Headers`,
      `      header_down -Access-Control-Allow-Methods`,
      `    }`,
      `  }`,
    ].join('\n'),
  );
const caddyfile = [
  '# Generated by setup.mjs; edits will be overwritten.',
  '{',
  '  admin off',
  '  auto_https off',
  '}',
  '',
  ':80 {',
  "  # The app's web build needs CORS on our own endpoints.",
  '  header /_comms/* Access-Control-Allow-Origin *',
  '  header /_comms/* Access-Control-Allow-Headers "Authorization, Content-Type"',
  '  header /_comms/* Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"',
  '  @preflight {',
  '    method OPTIONS',
  '    path /_comms/*',
  '  }',
  '  respond @preflight 204',
  '',
  '  handle /_comms/config {',
  '    header Content-Type application/json',
  `    respond \`${JSON.stringify(commsConfig)}\` 200`,
  '  }',
  ...bridgeRoutes,
  '  handle {',
  '    reverse_proxy synapse:8008',
  '  }',
  '}',
  '',
].join('\n');
mkdirSync(join(DATA, 'caddy'), { recursive: true });
writeFileSync(join(DATA, 'caddy', 'Caddyfile'), caddyfile);

// 6. Start everything ------------------------------------------------------
step('Starting Synapse and bridges');
// Stop first so a re-run picks up config changes; Synapse must then start exactly once,
// since interrupting its first-run schema migration leaves the database half-built.
compose(['stop', 'synapse'], { quiet: true, allowFail: true });
compose(['up', '-d', '--remove-orphans']);
compose(['restart', 'caddy'], { quiet: true });

for (let i = 0; ; i++) {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    if (res.ok) break;
  } catch {}
  if (i > 90) throw new Error('Synapse did not come up — check `docker compose logs synapse`');
  await sleep(1000);
}

step(`Creating user @${env.ADMIN_USER || 'admin'}:${DOMAIN}`);
const reg = compose(
  [
    'exec', '-T', 'synapse', 'register_new_matrix_user',
    '-u', env.ADMIN_USER || 'admin',
    '-p', env.ADMIN_PASSWORD,
    '-a', '-c', '/data/homeserver.yaml', 'http://localhost:8008',
  ],
  { allowFail: true, quiet: true },
);
const regOut = `${reg.stdout}${reg.stderr}`;
console.log(reg.status === 0 ? '  created' : /taken|in use/i.test(regOut) ? '  already exists' : regOut.trim());

// Tailscale addresses (100.64.0.0/10) work from anywhere; LAN addresses only at home.
const addresses = lanAddresses();
const tailscale = addresses.filter((ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip));
const lan = addresses.filter((ip) => !tailscale.includes(ip));
console.log(`
✔ Comms server is running.

  In the app, choose "Connect your server" and use:
${tailscale.map((ip) => `    Homeserver: http://${ip}:${PORT}   (Tailscale: works anywhere)`).join('\n')}
${lan.map((ip) => `    Homeserver: http://${ip}:${PORT}   (home network only)`).join('\n')}
    Username:   ${env.ADMIN_USER || 'admin'}
    Password:   (ADMIN_PASSWORD from .env)
${tailscale.length ? '' : '\n  Tailscale not detected. Install it on this PC and your phone to use Comms away from home.\n'}
  Then open Accounts and tap Connect on each network.
  Logs: npm run logs
`);
