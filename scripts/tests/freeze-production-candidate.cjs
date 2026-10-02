// Freeze local source identity; reads Git only and never stages, commits or deploys.
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } = require('node:fs');
const { resolve, dirname, basename } = require('node:path');
const { createHash } = require('node:crypto');
const root = resolve(__dirname, '../..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const list = args => git(args).split('\0').filter(Boolean);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const include = path => !path.startsWith('docs/') && !/^\.env($|\.)/.test(basename(path)) && !path.startsWith('node_modules/') && !path.startsWith('.next/');
const paths = [...new Set(list(['ls-files', '-z', '--cached', '--others', '--exclude-standard']))].filter(include).sort();
const files = paths.map(path => ({ path, sha256: existsSync(resolve(root, path)) ? hash(readFileSync(resolve(root, path))) : null }));
const sourceDigest = hash(files.map(file => file.path + '\0' + (file.sha256 ?? 'DELETED') + '\n').join(''));
const evidence = resolve(root, 'docs/billing-email-evidence');
mkdirSync(evidence, { recursive: true });
const baseline = JSON.parse(readFileSync(resolve(evidence, 'baseline-evidence-manifest.json'), 'utf8'));
for (const file of baseline.files) {
  if (hash(readFileSync(resolve(root, file.path))) !== file.sha256) throw new Error('Frozen baseline changed: ' + file.path);
}
const baselineCandidate = JSON.parse(readFileSync(resolve(root, 'docs/release-evidence/candidate-manifest.json'), 'utf8'));
const baselineSource = new Map(baselineCandidate.files.map(file => [file.path, file.sha256]));
const additiveChangesFromBaseline = files.filter(file => !baselineSource.has(file.path) || baselineSource.get(file.path) !== file.sha256).map(file => file.path);
for (const file of baselineCandidate.files.filter(file => file.path.startsWith('supabase/migrations/'))) {
  if (file.sha256 && hash(readFileSync(resolve(root, file.path))) !== file.sha256) throw new Error('Historical migration changed: ' + file.path);
}
const changed = [...new Set([...list(['diff', '--name-only', '-z', 'HEAD']), ...list(['ls-files', '-z', '--others', '--exclude-standard'])])].filter(include).sort();
for (const path of changed) {
  if (!existsSync(resolve(root, path))) continue;
  const target = resolve(evidence, 'candidate-changes', path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(root, path), target);
}
const patch = git(['diff', '--binary', 'HEAD', '--', '.', ':(exclude)docs', ':(exclude).env*']);
writeFileSync(resolve(evidence, 'candidate.patch'), patch);
const migration = 'supabase/migrations/20261001120000_paddle_billing_email_delivery.sql';
const verification = {};
for (const name of ['application', 'postgres', 'billing-postgres', 'schema', 'typecheck', 'build', 'postbuild', 'lint']) {
  const result = JSON.parse(readFileSync(resolve(evidence, name + '.result.json'), 'utf8'));
  if (result.exitCode !== 0) throw new Error('Verification failed: ' + name);
  verification[name] = { ...result, logSha256: hash(readFileSync(resolve(evidence, name + '.log'))) };
}
const lintAll = JSON.parse(readFileSync(resolve(evidence, 'lint-all.result.json'), 'utf8'));
const manifest = { capturedAt: new Date().toISOString(), baseCommit: git(['rev-parse', 'HEAD']).trim(),
  branch: git(['branch', '--show-current']).trim(), committed: false, sourceDigest,
  digestFormat: 'SHA256 of sorted path + NUL + file SHA256 (or DELETED) + LF; docs/env/build/dependencies excluded',
  baselineSourceDigest: baselineCandidate.sourceDigest, baselineEvidenceFilesVerified: baseline.files.length, additiveChangesFromBaseline,
  migration, migrationSha256: hash(readFileSync(resolve(root, migration))),
  migrations: ['supabase/migrations/20260927120000_paddle_atomic_webhook_recovery.sql', migration].map(path => ({ path, sha256: hash(readFileSync(resolve(root, path))) })),
  patchSha256: hash(patch),
  changedPaths: changed, files, verification,
  additionalVerification: { 'lint-all': { ...lintAll, logSha256: hash(readFileSync(resolve(evidence, 'lint-all.log'))), limitation: 'Unchanged global ESLint configuration cannot resolve react-hooks plugin; scoped billing lint passed.' } },
  archiveInstructions: 'Overlay files inside candidate-changes on baseCommit after applying candidate.patch. Honor DELETED entries. Archive has no env, customer data or build output.' };
writeFileSync(resolve(evidence, 'candidate-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ baseCommit: manifest.baseCommit, sourceDigest, migrationSha256: manifest.migrationSha256, sourceFiles: files.length, changedPaths: changed.length }));
