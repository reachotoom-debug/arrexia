// Focused offline verification. Never loads application environment files.
const {spawnSync} = require('node:child_process');
const {writeFileSync,mkdirSync} = require('node:fs');
const mode = process.argv[2] || 'focused';
const env = {};
for (const key of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT']) if(process.env[key]) env[key]=process.env[key];
env.TS_NODE_PROJECT='scripts/tsconfig.json';
const files = process.argv.slice(3);
const args = mode==='lint' ? ['node_modules/eslint/bin/eslint.js',...files] : mode==='typecheck' ? ['node_modules/typescript/bin/tsc','--noEmit','--incremental','false'] : ['--no-experimental-strip-types','-r','./scripts/tests/fixture-network-guard.cjs','-r','ts-node/register/transpile-only','-r','tsconfig-paths/register','-r','./lib/test/nodeTestSetup.ts','--test',...files];
const result=spawnSync(process.execPath,args,{env,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
mkdirSync('tmp/financial-corrections',{recursive:true});
writeFileSync(`tmp/financial-corrections/${mode}.log`,(result.stdout||'')+(result.stderr||''));
console.log((result.stdout||'')+(result.stderr||''));
process.exit(result.status??1);
