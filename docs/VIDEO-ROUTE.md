# Vídeo de apoio — Fase 3: rota protegida

Fase 3 entregue. Implementado POST /api/video, separado da geração. Estado inicial em desenvolvimento, preview e production: VIDEO_ENABLED="false" e VIDEO_QUOTA_POLICY_JSON="{}". Nenhum ambiente remoto foi alterado, nenhuma chave foi configurada e nenhum vídeo real foi consultado.

## O que a rota faz e por que

Recebe a seleção de uma alternativa de um plano salvo, autentica o visitante e extrai o título do plano do dono. Não aceita título livre, ingredientes, preferências, diário, despensa, valor da hora, identificador do visitante ou URL no corpo.

Escolhi os mesmos identificadores de seleção já utilizados no diário: plan_id, side e suggestion_index, com version=1. Isso evita inventar outra forma de apontar para a alternativa, mas NÃO cria refeição consumida nem modifica o diário. O título vai para o serviço da Fase 2; só esse conteúdo é enviado ao Google.

Funciona para alternativas existentes de cook/ready e para o lado escolhido em compare. Não gera uma receita nova para comida pronta; busca apenas apoio pelo nome do prato, sem recomendar que o vídeo equivale à alternativa. A decisão sobre onde apresentar esse recurso em cada tela permanece na etapa de interface. Lado recusado, índice inexistente, plano expirado/inexistente ou plano de outro visitante não podem provocar busca. O limite sintático do índice é 0–2; o conteúdo salvo determina quais posições realmente existem.

## Entrada e ordem de proteção

Requisição POST, HTTPS, mesma origem, JSON com até 512 bytes e Idempotency-Key UUID válido. Corpo fechado com estes quatro campos:

| Campo | Significado |
| --- | --- |
| version | Inteiro 1. |
| plan_id | UUID do plano salvo; não é autorização por si só. |
| side | cook ou ready; deve corresponder à alternativa do plano. |
| suggestion_index | Inteiro de 0 a 2, começando pela posição zero. |

Não são aceitos parâmetros na URL. Método, Origin e Sec-Fetch-Site são verificados antes do acesso. Depois: sessões habilitadas → limpeza/cota de ingress existente → autenticação real → chave e corpo → leitura do plano com filtro de dono e validade → validação do plano e título.

O caminho de ingress usa as funções existentes, sem alterar quota.js, operações, limites ou janelas. Ele continua contando acessos mesmo quando o vídeo está desligado ou o cache atende. Vídeo não depende de AI_ENABLED ou GROQ_API_KEY: não deve deixar de funcionar só porque a geração está desligada, desde que sessão e acesso estejam disponíveis.

A consulta do plano usa restorePlan, preservando a validação e o recálculo existentes. Nenhum contrato, prompt, cálculo, gravação ou função do histórico foi modificado.

## Flag desligada não significa acesso livre

Com a seleção autorizada e VIDEO_ENABLED diferente da string exata "true", a resposta é HTTP 200 com status=disabled, vídeo nulo, aviso e alternativa de busca. **Não consulta cache de vídeo, reserva busca ou chama Google.**

Essa é a interpretação de A5 aprovada na Fase 0: desligar impede entrega de vídeo, mas permite uma alternativa protegida. Não retorna título de plano alheio e não transforma falta de sessão em sucesso. VIDEO_ENABLED não liga sessões automaticamente; SESSIONS_ENABLED também permanece desligada na configuração versionada.

## Saída autorizada

Envelope com um campo data, contendo:

| Campo | Conteúdo |
| --- | --- |
| version | 1. |
| status | found, not_found, unavailable ou disabled. |
| video | Os quatro campos validados da Fase 1 quando encontrado; null nos outros casos. |
| notice | title e text com o aviso aprovado, sem enfraquecimento. |
| search | query normalizada e url HTTPS fixa de busca no YouTube. Sempre presente. |
| message | Mensagem tranquila em pt-BR. |

found não significa equivalência à receita, aprovação da IA ou autorização para incorporar sem os requisitos pendentes. not_found indica consulta válida sem candidato aceitável; unavailable indica impossibilidade de fornecer o apoio agora, sem afirmar inexistência de vídeo.

O endereço de busca é montado com URLSearchParams sobre https://www.youtube.com/results, sem aceitar URL externa do modelo ou do cliente. O parâmetro search_query contém só o título normalizado. Incluí o endereço pronto, além da consulta, para a interface não ter de repetir a regra. Entregar esse endereço no JSON não acessa YouTube: o acesso ocorre quando a pessoa o abrir.

Mensagem de alternativa: “Você pode buscar um tutorial no YouTube. Sua receita continua disponível.” Mensagem com vídeo: “Vídeo de apoio relacionado ao nome do prato.”

O aviso implementado usa exatamente o texto aprovado; quebras visuais não fazem parte da frase. Há testes que comparam o texto completo. O documento próprio no padrão PHOTO-UPLOAD-NOTICE.md continua entrega da Fase 4 deste pedido, não foi antecipado.

## Falha complementar versus recusa de acesso

| Situação | HTTP / resultado |
| --- | --- |
| Vídeo encontrado ou cache positivo | 200 / found, com vídeo, aviso e busca. |
| Consulta válida vazia ou cache negativo | 200 / not_found, com aviso e busca. |
| Timeout, falha de rede/HTTP/contrato externo, tamanho de resposta excedido | 200 / unavailable, com aviso e busca, sem retry. |
| Cota de vídeo esgotada, projeto suspenso, pedido repetido sem cache, concorrência | 200 / unavailable, sem nova chamada indevida. |
| Cache indisponível, falha de persistência, política/chave de vídeo ausente | 200 / unavailable, preservando reserva quando já feita. |
| Flag desligada, seleção autorizada | 200 / disabled, sem cache ou Google. |
| Sessão ausente/expirada | 401, sem título, vídeo ou consulta. |
| Origem inválida | 403, sem título, vídeo ou consulta. |
| Seleção inválida/alheia/expirada, chave inválida | 400, sem título, vídeo ou consulta. |
| Formato/tamanho/tempo de envio inválido | 415/413/408; cancelamento e JSON inválido: 400. |
| Ingress esgotado | 429, sem liberar acesso a conteúdo. |
| Autenticação/configuração de acesso/banco do plano indisponível | 503 sanitizado, sem inventar título ou consulta. |

“Sempre tem consulta” vale para respostas de seleção autorizada. Não é possível derivar com segurança o nome de um plano que não pudemos ler/autenticar. A interface futura deve manter a receita e sua alternativa local quando o próprio acesso à rota falhar, sem tentar contornar autenticação.

Nenhuma falha de vídeo produz 502 nesta rota. Mensagens brutas, SQL, URLs autenticadas, credenciais, source/reason internos e recibos de cota não são enviados. Respostas usam Cache-Control: no-store e X-Content-Type-Options: nosniff. Cache global interno do serviço não é cache HTTP de respostas personalizadas.

## Integração com a Fase 2

Com a flag ligada, a rota deriva a rede com networkKey e o dia de America/Los_Angeles, passa a identidade/expiração da sessão e chama getSupportVideo. A rede do vídeo não reutiliza por engano o dia UTC de ingress.

Serviço, contrato externo, adaptador, migração 0007, regras de cache e política da Fase 2 permanecem intactos. O novo contrato HTTP é separado do contrato de geração e do contrato externo do YouTube.

O banco valida reserva/coordenação com instruções parametrizadas e batch transacional, agora exercitados no workerd/D1 local. Nenhuma transação do banco torna o envio ao Google transacional; limitações de resultado incerto e de reserva conservadora continuam em [VIDEO-CACHE-QUOTA.md](VIDEO-CACHE-QUOTA.md). [Referência D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

## Organização dos arquivos e testes

- functions/api/video.js: entrada Pages POST, com dependências padrão de produção.
- src/http/video.js: proteções e orquestração HTTP, com mapa de erros próprio; api.js/ERRORS existentes não mudaram.
- src/contracts/video-request.js: seleção fechada e montagem da resposta/aviso/busca.
- src/video/selection.js: leitura autorizada da alternativa, sem escrita no histórico.
- tests/video-route.test.js: contratos, mensagens, seleção, flags e falhas da rota em Node, usando SQLite descartável.
- scripts/check-video-runtime.mjs: cenários de sessão/cota/rota/serviço reais no runtime local.
- scripts/fixtures/video-runtime-handler.mjs e tests/helpers/video-response.js: transporte simulado e falhas exclusivos dos testes.

Os testes Node injetam autorização e derivação de rede para não introduzir valores de segredos nos arquivos. Isso não prova autenticação real; essa parte é coberta pelo runtime, reutilizando o harness anterior sem alterar seus valores. As dependências injetáveis são opções da fábrica por código, não campos de request/env. A entrada pública não lê headers X-Test nem permite substituí-las.

Todos os novos testes unitários rodam em npm test, sem rede, chave real ou banco remoto. Os cenários adicionais do workerd rodam em npm run test:integration, junto aos 99 anteriores. A migração 0007 é aplicada somente ao banco descartável desse teste. O teste valida concorrência, rollback, cota, cache, modo desligado, autenticação e alternativa de falha; não confirma quota real, latência/CPU em produção, relevância de tutorial ou funcionamento de chave Google real.

## Pendências e fronteiras preservadas

Validação final: npm test com 442 aprovados, 22 novos; npm run test:integration com 123 cenários aprovados, incluindo os 99 anteriores e 24 novos de vídeo; npm run check aprovado. A primeira execução da integração foi bloqueada pela restrição de leitura do esbuild no sandbox, antes dos testes. A reexecução autorizada passou. Logs completos e diff isolado acompanham a entrega. Os testes usam YouTube simulado, não uma chave real.

Não há interface, botão visual, iframe, player, CSS, chamada à LLM ou ativação remota. O texto/URL do botão são dados para a interface futura, não uma tela implementada. Etapas 4/5 do produto continuam não iniciadas.

Antes de ativar: escolher os limites/margem com a quota efetiva do projeto, configurar YOUTUBE_API_KEY privadamente e garantir limpeza agendada dos dados de vídeo mesmo sem tráfego. A flag e a política vazia não resolvem essas condições; não foi criado agendamento nem alterada a limpeza de histórico.

Próximo passo após aprovação: Fase 4 deste pedido, documento próprio do aviso, consolidação das menções históricas e instruções para a primeira busca real pelo usuário. Requisitos de MadeForKids, termos, atribuição e privacidade continuam pendentes antes de incorporação. Parar na Fase 3.
