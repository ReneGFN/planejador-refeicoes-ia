# Sessões anônimas: base interna

## Atualização — retenção física: proposta após o Item 7

[RETENTION-CLEANUP-PROPOSAL.md](RETENTION-CLEANUP-PROPOSAL.md) mantém o prazo aprovado: visitors.created_at + 30 dias absolutos, sem renovação por uso, edição ou eventual recuperação. O acesso vence no instante previsto; a remoção física seria posterior, em lotes horários, sem garantia de prazo máximo durante falhas ou acúmulo.

visitors só poderá ser removido depois de produto e recibos dependentes, respeitando os prazos técnicos. Isso evita que ON DELETE CASCADE antecipe remoções. usage_reservations e usage_buckets não dependem de visitors por FK e continuam até as próprias expirações; apagar produto ou identidade não devolve saldo.

A proposta inclui estado persistente de limpeza e conferência atômica de prazo/estado nas escritas. A revisão existente sozinha não garante esse bloqueio após o vencimento. A nova autoridade seria interna e restrita a donos vencidos, nunca uma identidade aceita do cliente; precisa de aprovação antes de implementação.

Nenhum mecanismo de limpeza/recuperação, segredo ou configuração foi criado. 354 testes e 99 cenários locais passaram como regressão, não como teste dessa proposta. Etapas 4/5 não iniciadas nesta entrega. Abaixo, histórico.

## Atualização — Histórico, Item 7: proposta de credencial de recuperação

[RECOVERY-PROPOSAL.md](RECOVERY-PROPOSAL.md) descreve um código secreto exportável/importável, com aleatoriedade criptográfica e armazenamento por HMAC separado do token de sessão. Não existe implementação, segredo novo, migração ou rota de recuperação.

Recomendo transferência exclusiva: após confirmação futura, cookie/código anteriores perderiam validade, mas identidade, cotas e término original dos 30 dias permaneceriam. Guardar novo código antes da confirmação reduz o risco de perder acesso se a resposta final não chegar. Nova autenticação, revisão capturada na sessão e guardas contra gravações antigas precisam ser aprovadas/implementadas; somente trocar o hash não basta para prometer cancelamento de requisições em andamento.

Quem possui o código pode assumir acesso; se o invasor vencer primeiro, não há canal externo para comprovar propriedade. Sem código e sessão, após exclusão ou fim do prazo, não prometer recuperação. A proposta não dá múltiplas sessões, backup ou histórico permanente.

Regressão: 354 testes e 99 cenários locais aprovados, zero testes novos. Esses resultados não validam segurança de recuperação inexistente. A limpeza automática pós-expiração continua pendente; a sessão e os demais comportamentos atuais não mudaram.

## Atualização — Histórico, Item 6: apagar produto mantém identidade técnica

A nova rota DELETE /api/history apaga somente produto do visitante autenticado. Não apaga visitors nem seu cookie, não renova created_at/expiração e não cria identidade nova. Mantém todos os recibos/contadores para não liberar cota ou recriar ações antigas. Sua própria requisição segue limitada por ingress.

history_revision é versão técnica incrementada na exclusão, não dado de preferência nem credencial enviada ao cliente. Escritas capturam essa versão e conferem no SQL para não repor dados após exclusão. Recibo history_deletions usa chave derivada e fim absoluto da sessão; repetir a ação não apaga dados criados depois.

HISTORY_DELETION_ENABLED começa false. Sessão expirada continua 401: exclusão sob solicitação não é limpeza automática de dados retidos. Essa manutenção pós-prazo e limpeza dos recibos de produto permanecem pendentes antes de liberar toda a etapa 3. Não há novo executor global nem recuperação implementada.

354 testes Node e 99 cenários de integração aprovados, sem rede de IA ou banco remoto. [Detalhes](HISTORY-DELETION.md). Nenhum dado real apagado; migração 0006 só nos testes. Abaixo, registros das entregas anteriores.

## Atualização — Histórico, Item 5: permissão para a despensa

use_pantry é independente de use_history, opcional e não autoriza quando ausente/false. Preferências e geração usam o visitante autenticado; cadastro/consumo ou visitor_id no corpo não concedem acesso. PUT completo sem use_pantry revoga essa escolha; erro ao salvar não confirma mudança. Desligar não apaga estoque nem desfaz chamada já enviada/em andamento.

Despensa só é consultada para cook autorizado, com PERSONALIZATION_ENABLED e PANTRY_ENABLED. Ready pode usar diário; compare/visão não consultam contexto. Seleção não grava nada nem renova os 30 dias. Replay não relê fontes; planos não duplicam recorte. Isolamento e permissões testados em funções e HTTP.

expires_at continua data informada pela pessoa, distinta da expiração de sessão/recibos. Ordenação UTC não avalia alimento e não exclui estoque. Falha da despensa permite diário autorizado; preferência indisponível não permite nenhuma fonte. Sem inferência de foto.

333 testes Node e 90 cenários locais aprovados; sem migração remota ou ativação. [Especificação](PANTRY-PRIORITY.md). Exclusão abrangente/limpeza e recuperação permanecem Itens 6/7. Seções seguintes registram entregas anteriores.

## Atualização — Histórico, Item 4: despensa isolada

A despensa e suas baixas usam exclusivamente o visitante autenticado: consultas, alterações, comparação de nomes, prévia e recibos são filtrados por esse dono. Nenhum visitor_id do corpo/URL autentica. PANTRY_ENABLED nasce false em todos os ambientes; prévia/baixa também exigem DIARY_ENABLED. Não há chave Groq ou cota de IA envolvida; ingress permanece obrigatório.

Acesso continua limitado aos 30 dias absolutos da sessão. A validade informada em pantry_items.expires_at refere-se ao alimento, não ao prazo de acesso. Ler, editar ou descontar não renova sessão. Recibos de despensa recebem o fim da sessão e sobrevivem à exclusão de item/diário, impedindo repetição de ação/baixa. Limpeza física e exclusão abrangente sem apagar controles técnicos ainda são Item 6.

Confirmação de consumo e confirmação da prévia de baixa são distintas; nenhuma delas ativa use_history. Saldo/ingredientes não são enviados à IA nesta entrega. Não há recuperação entre dispositivos ou restauração automática de estoque ao apagar registro. [Detalhes e decisões](PANTRY.md).

Verificação do Item 4: 313 testes Node e 82 cenários workerd/D1 local aprovados (29/16 novos), sem chamada real ou migração remota. Isolamento cobre leitura, escrita, exclusão, escolha de consumo, prévia e recibos. Sem frontend, deploy ou ativação de flags.

## Estado

Implementado em `src/security/session.js`, ligado em 2026-09-11 a `POST /api/session` com limites de tentativas por rede/global. Rota ainda desativada na configuração, sem frontend. Não houve publicação, chamada adicional ao Groq, alteração de segredos ou escrita no D1 remoto. O reteste visual foi adiado a pedido do usuário.

Esta base autentica um navegador, não identifica uma pessoa real. Histórico salva planos/replay, preferências e contexto autorizado apenas para cook/ready. O Item 3 acrescenta diário manual/por sugestão, consulta, edição e exclusão individual; exclusão abrangente de produto/limpeza continua pendente. Ver [persistência/replay](PLAN-HISTORY.md), [preferências/personalização](PERSONALIZATION.md), [diário](MEAL-LOGS.md) e [limites e fluxo](USAGE-FLOW.md). A configuração padrão mantém geração, preferências e diário desativados.

O diário usa exclusivamente o visitante autenticado em todas as operações e vínculos. DIARY_ENABLED false nos três ambientes; ingress obrigatório, sem chave Groq/cota de IA. Registros e recibos de mutação expiram logicamente junto da sessão absoluta; leitura/edição não renovam o prazo. A data de consumo pode ser anterior à sessão, sem alterar a retenção. Após expirar a sessão, as rotas retornam 401, não uma sessão nova com acesso aos dados antigos.

Excluir uma refeição remove sua linha, não o visitante técnico, plano, preferência, recibo ou contador. Recibos do diário duram até o fim da sessão para impedir recriação por reenvio antigo após a exclusão; não são os recibos de IA de sete dias. Limpeza física após expiração e proteção da futura exclusão geral contra gravações concorrentes permanecem no Item 6. Nenhuma recuperação entre dispositivos foi implementada.

Verificação do Item 3: 284 testes Node e 66 cenários workerd/D1 local aprovados (26/12 novos), sem rede Groq ou banco remoto. Isolamento cobre lista, leitura, confirmação de plano, edição, exclusão e recibos. Confirmar consumo não autoriza envio de histórico: use_history continua separado e desligado por padrão.

## Como funciona e por quê

1. `establishVisitorSession` exige POST por HTTPS e origem igual à da aplicação. A rota já reserva limite de tentativas de sessão por rede/global antes de chamar essa função, inclusive para reuso. Verificar origem protege contra requisições de outros sites no navegador, mas não impede bots de construir requisições.
2. O servidor gera 32 bytes aleatórios com Web Crypto. O navegador recebe esse token opaco num cookie `__Host-rf_session`; o token não contém ID, nome ou preferências.
3. No campo existente `visitors.session_token_hash`, o servidor grava HMAC-SHA-256 do token, usando `SESSION_SECRET` e prefixo específico de sessão. HMAC é uma impressão autenticada por um segredo, não criptografia reversível: o banco não precisa guardar o token original. O segredo deve ser aleatório, separado da chave Groq e nunca enviado ao navegador.
4. `resolveVisitorSession` lê somente esse cookie, calcula o HMAC e consulta o visitante por consulta SQL parametrizada. Cookies inválidos, duplicados, adulterados, desconhecidos ou expirados não autenticam. IDs em JSON, URL ou headers não substituem o cookie.
5. `requireVisitorSession` é a versão que exige sessão válida e devolve `SESSION_REQUIRED` quando ela não existe. Planos/replay, preferências e seleção do contexto usam exclusivamente o `visitorId` obtido aqui. Contexto filtra dono tanto no diário quanto no vínculo de plano. Nenhum ID do corpo concede acesso. Demais registros deverão seguir a mesma regra nos próximos itens.

O binding D1 é usado diretamente, sem habilitar leituras por réplicas: consultas da API sem D1 Sessions vão ao primário. As consultas autenticadoras não devem ser movidas a réplicas eventualmente consistentes sem revisar revogação/exclusão. Não há estado de requisições em variáveis globais nem logs de cookies, HMACs ou segredos.

## Cookie e prazo absoluto aprovado

- `HttpOnly`: não fica disponível para leitura por JavaScript da página. Não elimina todos os riscos de XSS.
- `Secure`: só é enviado por HTTPS.
- `SameSite=Lax`: restringe envio em contextos entre sites; combinado com a verificação de origem para alterações.
- `__Host-`, `Path=/` e ausência de `Domain`: restringem o cookie ao host que o criou. Preview e produção devem continuar separados, inclusive nos bancos e segredos.
- `Max-Age=2592000`: 30 dias absolutos, mantidos pela decisão D8, também conferidos no servidor a partir de `created_at`. Reutilizar a sessão não renova o prazo nem atualiza `last_seen_at` a cada requisição, evitando uma escrita extra.

Planos recebem o mesmo `expiresAt` da sessão, não 30 dias adicionais por receita. As leituras filtram expiração; a sessão expirada não autoriza replay. Expirar acesso não apaga fisicamente dados: exclusão/limpeza de produto ainda precisam ser implementadas antes da liberação. Recibos técnicos de sete dias não são donos dos planos e sua limpeza não remove o replay enquanto a sessão/plano forem válidos. Não há renovação automática. Sem cadastro, apagar cookies, trocar de navegador/dispositivo ou expirar a sessão perde o vínculo com o histórico anterior; os dados não são automaticamente transferidos ou apagados por trocar de dispositivo. Recuperação é proposta futura do Item 7. Trocar `SESSION_SECRET` invalida as sessões existentes. Não prometer sincronização, recuperação ou anonimato absoluto.

O retorno de criação contém `setCookie` **apenas para uso interno**. A rota o coloca exclusivamente no header `Set-Cookie`, nunca serializa o objeto inteiro para JSON ou logs; a resposta usa `Cache-Control: no-store`. Histórico e service worker futuros devem respeitar esse isolamento. Não há fallback de sessão sem banco em caso de erro.

## Testes e limitações

Item 2: 258 testes Node e 54 cenários de integração local aprovados (19/oito novos, respectivamente), Groq simulada. Preferências recuperáveis com a mesma sessão, isolamento, consentimento, compare sem histórico e falhas verificados; não é teste de navegador ou medição de tokens. Nenhuma migração nova. PERSONALIZATION_ENABLED false em todos os ambientes; alterar consentimento é operação de produto, não recria sessão nem devolve cota. Desligamento não confirmado por falha de gravação pode deixar a preferência anterior ativa e deve ser informado na futura interface.

- `node --test tests/session.test.js`: nove testes de criação, HMAC, reuso, separação, adulteração, expiração, origem, configuração e erros. Banco simulado, sem segredos reais.
- `node scripts/check-session-runtime.mjs`: sete cenários em workerd e D1 locais descartáveis, com esquema da migração inicial. Verifica SQL real, criptografia, recuperação, isolamento de identidade, expiração e remoção. Não comprova a gestão de cookies por um navegador real nem mede desempenho na nuvem.
- `npm test`: inclui os testes de sessão e os testes anteriores do projeto.
- Item 1 do Histórico: `npm test` com 239 aprovados (21 novos) e `npm run test:integration` com 46 cenários aprovados (sete novos); SQL em memória e D1 descartável, sem rede para Groq. Testados isolamento de planos, expiração, replay após recibo limpo e falhas, sem implicar teste de navegador.

O endpoint de sessão existe no código, mas permanece desativado até configuração e liberação. Limpar cookies pode contornar uma cota só por visitante; limites de rede/globais agora são aplicados no backend. Chamadas simultâneas sem cookie e com chaves diferentes podem criar visitantes distintos, portanto a futura interface deve coordenar o início de sessão; quotas não dependem só dela.

Sessões reutilizam `visitors`. A etapa de cotas acrescentou a migração 0002 com a tabela técnica `usage_reservations`; o Item 1 do Histórico acrescenta 0003 para chave/expiração de plans, verificada apenas em bancos de teste descartáveis. Nenhuma migração desta entrega aplicada remotamente. `IP_HASH_SECRET` é usado na camada de cotas, não para autenticar a sessão. Não apagar contadores ou recibos ao excluir histórico: isso permitiria recuperar tentativas de IA já gastas.

## Próximo passo

Após aprovação do Item 2, implementar diário no Item 3. Medição real do acréscimo de contexto ainda depende do usuário; dados-base e hash estão registrados em GROQ-TESTING. Despensa, validade, exclusão/limpeza e proposta de recuperação permanecem pendentes. Interface e verificação/publicação pertencem às etapas 4/5, não executadas aqui. O reteste visual continua adiado.

Referências: [Web Crypto no Workers](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [consultas parametrizadas D1](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [consistência e D1 Sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [atributos de cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
