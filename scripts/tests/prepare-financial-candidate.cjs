// Exact clean source package. No Git mutations, environment files or deployment.
const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=process.cwd(),out=p.join(root,'tmp/financial-corrections'),app=p.join(out,'source');
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const additions=['lib/invoices/__tests__/releasePresentation.test.ts','scripts/tests/run-financial-corrections.cjs','scripts/tests/prepare-financial-candidate.cjs'];
const files=[...new Set([...git('ls-files'),...additions])].filter(f=>!/(^|\/)(\.env[^/]*|\.git|\.vercel|node_modules|\.next|tmp|__pycache__)(\/|$)/.test(f)&&!/^docs\/(production-evidence|financial-integrity-evidence)\//.test(f));
fs.mkdirSync(app,{recursive:true});
for(const file of files){const dest=p.join(app,file);fs.mkdirSync(p.dirname(dest),{recursive:true});fs.copyFileSync(p.join(root,file),dest);}
const inputs=files.sort().map(file=>({file,sha256:hash(fs.readFileSync(p.join(app,file)))}));
const manifest={baseCommit:git('rev-parse','HEAD')[0],committed:false,deployed:false,changedFiles:[...git('diff','--name-only','HEAD'),...additions],files:inputs,sourceDigest:hash(JSON.stringify(inputs)),digestFormat:'SHA256 of JSON.stringify(files), sorted by file; each entry contains file and sha256'};
fs.writeFileSync(p.join(out,'candidate-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(p.join(out,'candidate.patch'),cp.execFileSync('git',['diff','--binary','HEAD'],{encoding:'utf8',maxBuffer:8*1024*1024}));
console.log(JSON.stringify({source:app,files:files.length,digest:manifest.sourceDigest}));
if(process.argv[2]!=='build')process.exit(0);
if(!fs.existsSync(p.join(app,'node_modules')))fs.cpSync(p.join(root,'node_modules'),p.join(app,'node_modules'),{recursive:true,dereference:true});
const env={};for(const k of ['SystemRoot','WINDIR','SystemDrive','COMSPEC','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles'])if(process.env[k]!==undefined)env[k]=process.env[k];
const guard=p.join(root,'tmp/release-production-build-PWDMMv/network-guard.cjs');
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY:'isolated-build-only-anon',SUPABASE_SERVICE_ROLE_KEY:'isolated-build-only-service',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:9',NODE_OPTIONS:'--require='+JSON.stringify(guard)});
for(const [name,args] of [['typecheck',['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']],['build',['node_modules/next/dist/bin/next','build']],['postbuild',['scripts/remove-sourcemaps.js']]]){
 const fd=fs.openSync(p.join(out,`${name}-isolated.log`),'w');
 const result=cp.spawnSync(process.execPath,args,{cwd:app,env,stdio:['ignore',fd,fd],windowsHide:true});fs.closeSync(fd);
 fs.writeFileSync(p.join(out,`${name}-result.json`),JSON.stringify({exitCode:result.status,error:result.error?.message,sourceDigest:manifest.sourceDigest,configuration:'isolated loopback configuration; no env files; external network blocked'})+'\n');
 console.log(name+': '+result.status);if(result.status!==0)process.exit(1);
}
