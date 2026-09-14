import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

export async function checkRedirectRuntime() {
  const {outputFiles}=await build({stdin:{resolveDir:process.cwd(),contents:`
    import { completeWithGroq, technicalCategory } from './src/providers/groq-client.js';
    import { searchYouTubeVideo } from './src/providers/youtube.js';
    export default {async fetch(request) {
      if(new URL(request.url).pathname === '/old') {
        try {await fetch('https://api.groq.com/',{redirect:'error'});return Response.json({unexpected:true});}
        catch(e){return Response.json({name:e.name,message:e.message,diagnostic:technicalCategory(e,'fetch')});}
      }
      try {
        if(new URL(request.url).pathname === '/youtube') await searchYouTubeVideo({title:'arroz'},{apiKey:'fake'});
        else await completeWithGroq({model:'fake'},x=>JSON.parse(x),{apiKey:'fake'});
        return Response.json({ok:true});
      } catch(e){return Response.json({code:e.code});}
    }};`},bundle:true,write:false,format:'esm',platform:'browser'});
  let calls=0, status=302;
  const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[{
    name:'redirect-test',modules:true,script:outputFiles[0].text,compatibilityDate:'2026-09-06',
    outboundService: async request => {
      calls++;
      assert.notEqual(new URL(request.url).hostname,'forbidden.test','redirect nunca pode ser seguido');
      if(status===200)return Response.json({model:'fake',choices:[{finish_reason:'stop',message:{content:'{}'}}]});
      return new Response(null,{status,headers:{Location:'https://forbidden.test/secret'}});
    },
  }]}));
  try {
    const old=await (await mf.dispatchFetch('https://local.test/old')).json();
    assert.equal(old.name,'TypeError'); assert.equal(calls,0);
    assert.equal(old.diagnostic.category,'UNSUPPORTED_REDIRECT_MODE');
    console.log('workerd mensagem exata: '+old.message);
    for(status of [300,301,302,303,304,307,308,399]) {
      for(const [path,code] of [['/groq','PROVIDER_REDIRECT_REJECTED'],['/youtube','VIDEO_REDIRECT_REJECTED']]) {
        const before=calls;
        assert.deepEqual(await (await mf.dispatchFetch('https://local.test'+path)).json(),{code});
        assert.equal(calls,before+1);
      }
    }
    status=200;
    assert.deepEqual(await (await mf.dispatchFetch('https://local.test/groq')).json(),{ok:true});
    console.log('OK: workerd fetch nativo: error rejeitado antes da saída; manual aceita 200 e rejeita 3xx sem seguir destino (Groq e YouTube).');
  } finally {await mf.dispose();}
}
