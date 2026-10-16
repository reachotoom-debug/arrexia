// Application regressions with an allowlisted child environment and no real network.
// No .env loading or database credential inspection. Uses the installed Node runtime.
const { readdirSync }=require('node:fs');
const { join }=require('node:path');
const { spawnSync }=require('node:child_process');
const { env }=require('./local-postgres-config.cjs');
const files=[];
function scan(directory) {
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isDirectory()) scan(path);
    else if(entry.isFile()&&entry.name.endsWith('.test.ts')) files.push(path);
  }
}
for(const directory of ['lib','app','scripts']) scan(directory);
env.TS_NODE_PROJECT='scripts/tsconfig.json';
const result=spawnSync(process.execPath,['-r','./scripts/tests/fixture-network-guard.cjs',
  '-r','ts-node/register/transpile-only','-r','tsconfig-paths/register',
  '-r','./lib/test/nodeTestSetup.ts','--test','--test-concurrency=4',...files.sort()],
  {env,stdio:'inherit',windowsHide:true});
if(result.error) throw result.error;
process.exit(result.status??1);
