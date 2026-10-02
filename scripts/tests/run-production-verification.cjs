// Run local verification with a synthetic environment, never application .env.
const { spawn } = require('node:child_process');
const { readdirSync, existsSync, mkdirSync, createWriteStream } = require('node:fs');
const { join, resolve } = require('node:path');
const mode = process.argv[2];
const root = resolve(__dirname, '../..');
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (existsSync(join(root, name))) throw new Error('Verification refuses application environment files');
}
const env = {};
for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT']) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  TS_NODE_PROJECT: 'scripts/tsconfig.json', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-only', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
  NEXT_PUBLIC_PADDLE_ENV: 'production', NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'live_fixture_only',
  NEXT_PUBLIC_APP_URL: 'https://fixture.invalid',
});
const guard = join(__dirname, 'fixture-network-guard.cjs');
env.NODE_OPTIONS = `--require="${guard.replaceAll('\\', '/')}"`;
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.test\.ts$/.test(path)) files.push(path);
  }
}
let args;
if (mode === 'application') {
  for (const dir of ['lib', 'app', 'scripts']) walk(join(root, dir));
  args = ['--no-experimental-strip-types', '-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', '-r', './lib/test/nodeTestSetup.ts', '--test', '--test-concurrency=4', '--test-reporter=spec', ...files.sort()];
} else if (mode === 'postgres') {
  args = ['--test', join(__dirname, 'paddle-webhook-db.test.cjs')];
} else if (mode === 'billing-postgres') {
  args = ['--test', join(__dirname, 'paddle-billing-email-db.test.cjs')];
} else if (mode === 'schema') {
  args = [join(__dirname, 'paddle-schema-rehearsal.cjs')];
} else if (mode === 'typecheck') {
  args = ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'];
} else if (mode === 'build') {
  env.NODE_ENV = 'production';
  args = ['node_modules/next/dist/bin/next', 'build', '--webpack'];
} else if (mode === 'postbuild') {
  args = ['scripts/remove-sourcemaps.js'];
} else if (mode === 'lint-all') {
  args = ['node_modules/eslint/bin/eslint.js', '.', '--ignore-pattern', 'docs/**'];
} else if (mode === 'lint') {
  args = ['node_modules/eslint/bin/eslint.js',
    'app/[workspaceId]/settings/_components/BillingPlans.tsx',
    'app/[workspaceId]/settings/_components/BillingPlansClient.tsx',
    'app/[workspaceId]/settings/billingActions.ts', 'app/admin/actions.ts',
    'lib/admin/extendWorkspaceTrial.ts', 'lib/billing', 'lib/email',
    'app/api/internal/billing/lifecycle/run/route.ts',
    'lib/__tests__/importRpcMigration.test.ts', 'lib/payments/__tests__/paymentEntitlementParity.test.ts',
    'lib/reminders/__tests__/provisionDefaultSetup.test.ts', 'lib/workspaces/__tests__/ensureWorkspaceForUser.test.ts'];
} else throw new Error('Use application, postgres, schema, typecheck, build, postbuild or lint');
const evidence = join(root, 'docs/billing-email-evidence');
mkdirSync(evidence, { recursive: true });
const output = createWriteStream(join(evidence, `${mode}.log`));
const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let tail = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  output.write(chunk); tail = (tail + chunk.toString()).slice(-8000);
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; output.end(); });
child.on('close', code => {
  output.end();
  require('node:fs').writeFileSync(join(evidence, `${mode}.result.json`), JSON.stringify({ capturedAt: new Date().toISOString(), mode, testFiles: mode === 'application' ? files.length : undefined, exitCode: code }) + '\n');
  console.log(tail); console.log(JSON.stringify({ mode, testFiles: mode === 'application' ? files.length : undefined, exitCode: code }));
  process.exitCode = code ?? 1;
});
