// Instrumentação temporária: token só em memória, hash no bundle, expiração em 15 minutos.
import { randomBytes, createHash } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
const token = randomBytes(32).toString('hex');
const digest = createHash('sha256').update(token).digest('hex');
const path = 'functions/api/transport-probe.js';
const cli = 'node_modules/wrangler/bin/wrangler.js';
function deploy() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'pages', 'deploy', 'public', '--project-name', 'planejador-refeicoes-ia', '--branch', 'preview-validation', '--commit-dirty=true']);
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('exit', code => {
      const url = output.match(/https:\/\/[a-f0-9]+\.planejador-refeicoes-ia\.pages\.dev/)?.[0];
      if (code || !url) reject(Error('DEPLOY_FAILED')); else resolve(url);
    });
  });
}
const source = `import { modelsProbe } from '../../src/providers/models-probe.js';
export async function onRequestPost({request,env}) {
  if (Date.now() > ${Date.now() + 15 * 60000}) return new Response(null,{status:404});
  const value=request.headers.get('X-Probe-Token') || '';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash !== '${digest}') return new Response(null,{status:404});
  for(const [cell,key,redirect] of [[1,'deliberately-invalid-key','error'],[2,env.GROQ_API_KEY,'error'],[3,env.GROQ_API_KEY,'follow']]) {
    const result=await modelsProbe(key,redirect);
    console.log(JSON.stringify({event:'transport_probe',cell,redirect,...result}));
  }
  return new Response(null,{status:204});
}`;
let tail;
try {
  await writeFile(path, source, {flag:'wx'});
  const url = await deploy(); console.log(JSON.stringify({probe_deployment:url}));
  const listing=execFileSync(process.execPath,[cli,'pages','deployment','list','--project-name','planejador-refeicoes-ia','--environment','preview'],{encoding:'utf8'});
  const prefix=new URL(url).hostname.split('.')[0];
  const deploymentId=listing.match(new RegExp(prefix+'-[a-f0-9-]{27,}'))?.[0];
  if(!deploymentId)throw Error('DEPLOYMENT_ID_NOT_FOUND');
  await new Promise((resolve,reject) => {
    tail=spawn(process.execPath,[cli,'pages','deployment','tail',deploymentId,'--project-name','planejador-refeicoes-ia','--format','pretty','--search','transport_probe']);
    let buffer='', triggered=false, count=0;
    const timer=setTimeout(()=>reject(Error('TAIL_TIMEOUT triggered='+triggered+' captured='+count)),90000);
    const receive=data=>{
      buffer+=data.toString().replace(/\x1b\[[0-9;]*m/g,'');
      if (!triggered && buffer.includes('Connected to deployment')) {
        triggered=true;
        console.log(JSON.stringify({tail_connected:true}));
        fetch(url+'/api/transport-probe',{method:'POST',headers:{'X-Probe-Token':token}}).then(r=>{console.log(JSON.stringify({probe_http_status:r.status}));if(r.status!==204)reject(Error('PROBE_HTTP_FAILED'));}).catch(reject);
      }
      const lines=buffer.split('\n'); buffer=lines.pop();
      for(const line of lines){const start=line.indexOf('{"event":"transport_probe"');if(start>=0){
        const result=JSON.parse(line.slice(start)); console.log(JSON.stringify(result));
        if(++count===3){clearTimeout(timer);resolve();}
      }}
    };
    tail.stdout.on('data',receive);tail.stderr.on('data',receive);
    tail.on('error',reject);
    tail.on('exit',code=>{if(count<3){clearTimeout(timer);reject(Error('TAIL_EXIT '+code));}});
  });
} finally {
  tail?.kill();
  await unlink(path);
  const url=await deploy(); console.log(JSON.stringify({clean_deployment:url,temporary_route_removed:true}));
}
