// Local fixture configuration only. Never load .env or inspect database URLs.
const { existsSync, realpathSync } = require('node:fs');
const { isAbsolute, join } = require('node:path');
const requested=process.env.ARREXIA_TEST_PG_BIN || 'C:/Program Files/PostgreSQL/15/bin';
if(!isAbsolute(requested)) throw new Error('ARREXIA_TEST_PG_BIN must be an absolute installed PostgreSQL bin directory');
const bin=realpathSync(requested);
const exe=name=>join(bin,name+(process.platform==='win32'?'.exe':''));
for(const name of ['initdb','pg_ctl','psql','postgres']) if(!existsSync(exe(name))) throw new Error(`Missing installed PostgreSQL executable: ${exe(name)}`);
// An allowlist prevents PG*, application credentials and connection URLs from
// reaching child processes. Connections separately pin loopback/port/user/db.
const env={};
for(const key of ['SystemRoot','WINDIR','SystemDrive','COMSPEC','PATH','Path','PATHEXT','TEMP','TMP',
  'USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','PROCESSOR_ARCHITECTURE']) {
  if(process.env[key]!==undefined) env[key]=process.env[key];
}
// libpq can consult user password/service files even when connection environment
// variables are absent. Pin both to the OS null device; fixtures use local trust.
env.PGPASSFILE=process.platform==='win32'?'NUL':'/dev/null';
env.PGSERVICEFILE=process.platform==='win32'?'NUL':'/dev/null';
module.exports={bin,exe,env};
