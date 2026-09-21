# Incidente: redirect error no workerd

Data: 2026-09-14. Compatibility date preservada: 2026-09-06.

Encadeamento: opção não suportada -> TypeError antes da saída -> catch amplo ->
NETWORK_ERROR -> ausência de entrada em ERRORS -> SERVICE_UNAVAILABLE/503 ->
falha genérica na interface. Quatro perdas: incompatibilidade classificada como rede;
causa original descartada; código técnico substituído no HTTP; ausência inicial
de observação operacional que permitisse distinguir falhas mantendo a tela genérica.

As três células remotas de GET /models mostraram: chave fictícia/error e chave
atual/error falham em 0 ms; chave atual/follow retorna 200, redirected:false, 208 ms.
Isso confirma autenticação e não demonstra 3xx. A reprodução local no workerd real
confirmou rejeição da opção antes de qualquer chamada à saída interceptada.

Mensagem exata capturada no workerd:

```
Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code).
```

A página pública Request consultada lista follow/error/manual; portanto não é
correto alegar que essa página documenta a restrição. O código oficial do workerd
declara somente FOLLOW/MANUAL. A execução do runtime é evidência decisiva.
Fontes: https://developers.cloudflare.com/workers/runtime-apis/request/ e
https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.h

Correção: manual em Groq (texto e visão) e YouTube; rejeitar todo 300–399 com
PROVIDER_REDIRECT_REJECTED / VIDEO_REDIRECT_REJECTED. Nunca seguir Location,
registrar chave, URL de destino ou corpo. HTTP do app continua genérico.
Classificador fechado inclui UNSUPPORTED_REDIRECT_MODE para a mensagem medida.

Teste integrado: fetch NATIVO do workerd, outboundService interceptado localmente
(sem Groq/Google reais), error falha antes da saída, manual retorna 200 e rejeita
300/301/302/303/304/307/308/399; nenhuma chamada alcança o host de redirecionamento.
O antigo arnês substituía fetch por função JavaScript e não exercitava a validação
de opções do runtime. O novo teste roda em npm run test:integration.

Sondas históricas conservam error/follow intencionalmente para reproduzir o incidente.
Não são rotas permanentes do aplicativo. Próxima validação: usuário dispara uma
geração real no novo preview, captura somente ai_operation e status HTTP.
