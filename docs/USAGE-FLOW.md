# Limites de uso e fluxo do backend

## Estado atual — vídeo: backend e documentação concluídos, recurso desligado

POST /api/video continua separado da geração: origem/ingress/sessão → seleção do plano do dono → flag → cache/cota/consulta quando autorizado. Em toda resposta de seleção autorizada, aviso e busca estão disponíveis, inclusive com vídeo. Falhas complementares não consomem outra geração nem geram retry. Recusas de acesso continuam protegidas. [Contrato HTTP](VIDEO-ROUTE.md).

[Conteúdo para a interface](VIDEO-SUPPORT-NOTICE.md) e [custo, capacidade e primeiro teste real](VIDEO-SETUP.md) agora entregues. Search Queries é a cota própria de buscas; limites efetivos e margem ainda precisam ser escolhidos. Acerto positivo/negativo não reserva busca, mas ingress e D1 continuam limitados. Nenhuma garantia de capacidade ilimitada.

VIDEO_ENABLED=false e política vazia preservados. Teste isolado do adaptador é ação manual do usuário, conta no orçamento de outros usos e não ativa a rota. Limpeza agendada/privacidade e demais requisitos precedem publicação. Etapas 4/5 do produto não iniciadas. Abaixo, registros históricos das fases anteriores.

Regressão documental: npm test, 442 aprovados; npm run test:integration, 123 cenários aprovados. Nenhuma chamada real, teste novo, alteração de código/configuração ou migração nesta fase.

## Registro histórico — vídeo: Fase 3 entregue, rota protegida

POST /api/video → origem/método → ingress → sessão → corpo/chave → plano do dono e título → flag. Se desligada: alternativa autorizada, sem cache de vídeo ou Google. Se ligada: rede do dia PT → serviço de cache/cota → uma busca autorizada ou alternativa. Aviso e busca em toda resposta autorizada, inclusive sucesso. [Detalhes](VIDEO-ROUTE.md).

Erros de sessão/origem/seleção/ingress não viram acesso autorizado; sem plano confiável não se inventa consulta. As cotas e o fluxo de geração não mudaram. 442 testes Node, 123 cenários workerd/D1 e npm run check aprovados. Não há UI/player nem alteração remota; flag false e política vazia no arquivo versionado. Fase 4 do pedido e etapas 4/5 do produto pendentes. Abaixo, histórico.

## Registro histórico — vídeo: cache e cota da Fase 2

Serviço interno getSupportVideo: contexto válido → limpeza limitada → cache validado → política explícita → trava e seis reservas atômicas → autorização/janela novamente conferidas → uma consulta → persistência validada ou alternativa. Resultado interno sempre contém a consulta; aviso e contrato HTTP continuam Fase 3. [Detalhes e limitações](VIDEO-CACHE-QUOTA.md).

Cache positivo e negativo não consomem a operação. Falha de banco não autoriza consulta sem controle; timeout/erro não vira ausência válida; reenvio do mesmo pedido não faz outra chamada. O limite global e a suspensão por esgotamento não impedem cache válido. Dia do provedor segue Pacífico; as cotas atuais continuam UTC e intactas.

Nenhuma rota/flag ativada, valor real de política escolhido, UI, API real ou alteração do histórico. Limpeza agendada de vídeo ainda é pré-requisito para ativação. 420 testes Node aprovados, 42 novos; 99 cenários de integração aprovados. Integração existente cobre regressão da base, não runtime da nova função. Fases 3/4 do pedido e etapas 4/5 do produto pendentes. Abaixo, histórico das fases anteriores.

## Registro histórico — vídeo: contrato/adaptador da Fase 1

searchYouTubeVideo recebe apenas title e opções internas de servidor → normaliza/valida → uma busca com filtros/fields fixos → leitura limitada → contrato fechado → found com metadados mínimos ou not_found com video nulo. Falha externa lança VideoProviderError sanitizado, não ausência válida. [Contrato](VIDEO-CONTRACT.md).

Não existe rota HTTP de vídeo: autenticação, ingress, flag, consulta/aviso do botão e conversão de falhas em alternativa são Fase 3. O adaptador não foi conectado à geração; não usa cota, cache, banco, LLM ou estado global mutável. A leitura de A5 foi aprovada na Fase 0, mas não implementada.

Fase 2 deverá distinguir ausência válida de falha, reservar exclusivamente buscas não atendidas por cache e coordenar concorrência global. Números de uso/margem ainda pendentes; os cinco candidatos do adaptador não representam cinco buscas nem cinco usos por pessoa.

Regressão: 378 testes Node (24 novos simulados) e 99 cenários workerd/D1 existentes aprovados. Sem chamada real, configuração/flag/dependência nova, alteração de histórico ou cotas. Abaixo, histórico.

## Registro histórico — vídeo: proposta da Fase 0, sem rota

Fluxo proposto em [VIDEO-API-PHASE-0.md](VIDEO-API-PHASE-0.md): seleção autorizada e ingress → cache global válido, inclusive ausência conhecida, sem cota de vídeo → em falta de cache, coordenação por título e reserva atômica exclusiva → uma busca → resultado validado ou alternativa tranquila. Não chamar a LLM nem alterar resposta/limite de geração.

Quota de vídeo proposta por visitante, rede e projeto, com dia America/Los_Angeles, sem modificar janelas UTC ou operações atuais. Teto global/margem ainda dependem de aprovação e quota efetiva do projeto. Esgotamento impede novas buscas, não acesso a cache válido ou à receita. Erro de cache não será tratado como cache vazio para buscar sem controle.

A5 versus resposta com flag false e tratamento de rejeições de segurança estão explicitamente pendentes; não contornar sessão/origem/ingress para prometer sempre 200. Nenhuma flag ou configuração adicionada. Regra de privacidade do título não elimina compartilhamento próprio do player futuro.

npm test: 354 aprovados; integração local: 99 aprovados, sem testes novos de vídeo. Contratos, prompts, histórico e fluxo de cotas intactos. Fases 1–4 deste pedido e etapas 4/5 do produto não iniciadas. Abaixo, histórico.

## Estado atual — retenção: manutenção interna apenas proposta

[Desenho da limpeza](RETENTION-CLEANUP-PROPOSAL.md): evento interno horário → corte de tempo do servidor → selecionar donos vencidos → marcar limpeza e impedir escritas tardias → retirar produto em lotes → retirar recibos de produto vencidos → remover identidade sem filhos. Limpeza técnica de usage_reservations/usage_buckets é independente e só alcança os próprios prazos vencidos.

Esse caminho não existe hoje. Não reutiliza DELETE /api/history sem sessão, não aceita dono pelo corpo e não abre rota pública. Exige aprovação específica da autoridade interna; rotas de produto mantêm isolamento por sessão. Sem Groq, restituição de cota, alteração de SYSTEM/contratos/ERRORS ou renovação dos 30 dias.

historyGuard atual não verifica prazo/estado de limpeza na escrita. A futura implementação deve fechar essa corrida em todas as mutações e recibos, testar execução sobreposta e retomada após falha. Expiração de acesso continua diferente de remoção física, que pode atrasar conforme fila/indisponibilidade.

354 testes Node e 99 cenários locais reexecutados com sucesso, sem novos testes ou chamada real à IA. Desenho não implementado/ativado; flags e configuração preservadas. Abaixo, histórico.

## Estado atual — Histórico, Item 7: fluxo de recuperação apenas proposto

Nenhuma rota de recuperação existe. [Proposta](RECOVERY-PROPOSAL.md): sessão válida permite emitir/exportar código; importar autentica somente preparação limitada; usuário guarda novo código e confirma transferência; uma transação futura consumiria código anterior, substituiria sessão e preservaria o mesmo visitante/prazo/cota.

Importação sem cookie seria nova forma de autenticar, não autorização por visitor_id no corpo. Exige aprovação e revisão próprias. Preparação, disputa de dois importadores, confirmação perdida, exclusão/revogação durante recuperação e limites por rede/global precisam de implementação e testes futuros. Não foram acrescentados à API atual.

A sessão existente segue absoluta de 30 dias, sem recuperação. Não afirmar que trocar de dispositivo apaga as linhas automaticamente nem que o código estenderia retenção. Limpeza física automática continua pendente.

Regressão executada: 354 testes Node e 99 cenários workerd/D1 aprovados, sem novos testes/IA real. Apenas documentação alterada; contratos, SYSTEM, mapa ERRORS, cotas e flags intactos. Etapas 4/5 não adiantadas.

## Estado atual — Histórico, Item 6: exclusão solicitada

DELETE /api/history: flags SESSIONS_ENABLED/HISTORY_DELETION_ENABLED → HTTPS/origem/método → configuração/ingress → sessão e chave UUID → JSON de até 256 bytes com version 1 e confirmed true → transação aguardada → 200 com data {version:1, deleted:true}. Query, visitor_id e revisão no corpo não são aceitos. Não depende das flags de IA/diário/despensa/preferências.

A transação registra a ação, avança revisão e exclui produto do dono. Visitante, recibos e cotas ficam; não chama pruneUsage como efeito da exclusão. Reenvio da mesma chave retorna conclusão original sem excluir novos dados. Chave nova significa nova exclusão explícita. Sucesso não renova cookie/sessão.

Escritas de produto conferem revisão no SQL; geração captura antes de contexto/provedor. Se exclusão vencer, resposta antiga não é salva e a geração pode retornar 503 com cota mantida, sem retry/estorno. Reenvio de geração ainda com recibo retorna 409 sem plano; nova geração continua sujeita ao saldo anterior. Preferências removidas voltam ao padrão desligado.

[Contrato e ressalvas](HISTORY-DELETION.md). 354 testes Node e 99 cenários locais aprovados; SYSTEM, contratos/schema de geração, ERRORS e matemática intactos. Migração 0006 apenas local em testes, flags false. Limpeza automática por prazo permanece pendente e não deve ser confundida com esta rota. Item 7 e etapas 4/5 não adiantados.

## Estado atual — Histórico, Item 5: despensa priorizada

Geração nova: autenticação → validação → verificação de replay → reserva existente → leitura de permissões → seleção das fontes autorizadas → uma chamada Groq → salvamento do plano. Dono vem da sessão. Replay não relê contexto nem chama IA.

use_history autoriza diário em cook/ready; use_pantry autoriza despensa somente em cook com PANTRY_ENABLED. PERSONALIZATION_ENABLED governa ambos; flags desligadas. Compare/visão não recebem contexto. GET/PUT /api/preferences aceita use_pantry booleano opcional; ausência não autoriza, e PUT omisso revoga porque substitui o documento.

Data fornecida mais antiga primeiro, sem data por último, empate nome/ID, até quatro itens; zero fora. only_available cruza nomes explícitos. Uma mensagem user com listas de até 400 caracteres cada (despensa sozinha até 800), bloco inteiro até 1.200. Sem despensa elegível, diário anterior preservado; sem fontes, geração normal. Não garante 600 tokens.

Falha de uma fonte permite a outra autorizada; preferência ilegível bloqueia ambas. Sem inferência/correção de datas, julgamento sanitário ou cópia do contexto em plans. Edições/exclusões afetam próxima seleção. Contrato não ganhou indicador de degradação: futura tela não deve prometer uso de todo cadastro.

[Decisões completas](PANTRY-PRIORITY.md). 333 testes Node e 90 cenários workerd/D1 aprovados com Groq simulada. SYSTEM, contratos/schema, ERRORS, cálculo e cota preservados. Itens 6/7 e etapas 4/5 pendentes; sem ativação/deploy. Seções seguintes são histórico.

## Estado atual — Histórico, Item 4: despensa e baixa confirmada

GET/POST /api/pantry e GET/PUT/DELETE /api/pantry/:id usam flag PANTRY_ENABLED, origem, ingress e sessão autenticada. Quantidade/unidade/validade opcionais, nome único normalizado, até 40 itens. PUT/DELETE exigem revisão; chaves UUID evitam reaplicar a mesma ação. Nenhuma operação reserva geração/visão nem chama Groq.

Após confirmar consumo no diário, GET /api/meal-logs/:id/pantry-deduction monta a prévia; POST na mesma rota exige preview_id, confirmed_snapshot=true e Idempotency-Key. DIARY_ENABLED também obrigatória. O servidor relê diário/estoque e invalida prévia velha; recibo e todos os descontos elegíveis são gravados juntos. Resultado distingue applied=true de applied=false, inclusive em HTTP 200. Origem dos cálculos e dependência de estimativas aparecem explicitamente.

Correspondência por nome exato NFC/pt-BR, mesma unidade e quantidade conhecida/representável. Nunca procurar ingrediente nos passos. Relatar ignorados, não inferir consumo de todas as porções e não apagar item ao zerar. Reenvio ou outra chave para refeição já baixada retorna 409; exclusão de diário/item não remove recibo nem repõe saldo. Prévia/revisão inválida usa o 400 existente, sem modificar ERRORS.

[Contrato, exemplos, precisão, motivos e limites](PANTRY.md). Validade é apenas armazenada; prioridade/envio ao modelo ficam no Item 5. Exclusão abrangente/limpeza permanece no Item 6. Todos os ambientes continuam desligados. Verificação: 313 testes Node e 82 cenários locais, aprovados, sem IA real ou banco remoto. Seções seguintes registram entregas anteriores.

## Estado atual — Histórico, Item 3: diário sem cota de IA

Novas rotas: POST/GET /api/meal-logs e GET/PUT/DELETE /api/meal-logs/:id. Todas atrás de DIARY_ENABLED=false; somente teste habilita. Fluxo: verificar flag/origem/configuração → aplicar ingress → autenticar sessão → validar ação/campos → ler ou gravar por dono → aguardar resposta do D1. Não consultar Groq nem reservar geração/visão.

POST exige confirmed_consumed=true. Pode registrar descrição manual e data retroativa, ou apontar sugestão de plano próprio. Compare confirma somente o lado escolhido; recusa não pode ser consumida. Gerar/salvar/selecionar não insere diário. PUT substitui descrição/data/porções opcionais, preservando origem. DELETE remove só o registro; não apaga plano, preferência, recibos ou contadores.

Escritas exigem chave UUID v4. Recibo técnico e mutação são atômicos. Mesma chave, inclusive depois da exclusão, retorna 409 sem reaplicar; duas intenções iguais exigem chaves novas e podem gerar duas refeições. Resposta nova confirma ID/operação/applied; GET recupera o estado atual. Falhas SQL são 503 sem confirmar sucesso; IDs ausentes/alheios são 400 indistinguíveis, preservando ERRORS. Ingress pode bloquear também leitura/reenvio.

[Contrato completo, exemplos, paginação e decisões](MEAL-LOGS.md). Prazo absoluto da sessão aplicado a registros e recibos do diário; expiração não equivale a limpeza física implementada. Personalização permanece opt-in separado e compare excluído. Para consumir sugestão por HTTP, o ID do plano é recuperável pelo replay 409 da geração; o 200 não mudou.

Verificação executada: 284 testes Node e 66 cenários workerd/D1 aprovados, Groq simulada. Flags antigas/política/reserva, SYSTEM, contratos/schema e matemática não mudaram. Sem migração remota ou deploy. Despensa, validade, exclusão geral, recuperação e etapas 4/5 não foram adiantadas. Seções a seguir são histórico.

## Estado atual — Histórico, Item 2: personalização somente em cook/ready

GET/PUT /api/preferences persiste/recupera documento versionado por visitante com use_history false por padrão. A nova flag PERSONALIZATION_ENABLED fica false nos três ambientes. Rotas de preferências usam sessão e ingress, sem IA/cota de geração. Defaults não substituem silenciosamente o pedido atual. Ver [contrato e comportamento](PERSONALIZATION.md).

Em geração nova cook/ready: após reserva, ler permissão salva antes do envio; se válida e ativa, selecionar até quatro refeições dos últimos sete dias, só descrição/data/vínculo de plano próprio. Ausência/erro de preferência ou diário significa envio sem contexto, não autorização presumida. Compare não consulta/monta/envia histórico e o adaptador também o bloqueia. Replay não relê histórico nem chama IA.

Tetos: descrição 120 caracteres, registro serializado 300, bloco serializado completo 1.200, contando aviso/chaves/escapes. Dois caracteres/token é **suposição** ligada ao orçamento aprovado de 600, não medição nem tokenizer. Consumo real aguarda comparação de prompt_tokens pelo usuário. A reserva 4.096 continua pré-autorização, não teto rígido: finishUsage contabiliza excesso reportado e não devolve diferença abaixo da reserva. max_completion_tokens limita conclusão/raciocínio, não total do pedido. Não prometer que a reserva cobre todas as saídas permitidas pelo contrato.

[Medições atuais](GROQ-TESTING.md): C10 cook 2.364 + 600 = 2.964; C08 ready 1.166 + 600 = 1.766, usando hash legado atual 7bdf3979… e acréscimo hipotético, não chamada com contexto. Corrigida a atribuição anterior de entrada cook 1.084–1.119. Sem mudança de SYSTEM, schema/contrato, matemática, ERRORS, quota executável ou ativação. 258 testes Node e 54 cenários locais aprovados. Etapas 4/5 e Itens 3–7 continuam pendentes; abaixo, histórico das entregas anteriores.

## Estado atual — Histórico, Item 1

Geração agora grava pedido e resultado validado em plans antes do 200. A mesma chave/dono recupera o plano no 409, inclusive compare com lados recusados. Comparison é recalculado; não há nova chamada ou reserva de IA, mas ingress continua aplicado por decisão aprovada. Sem plano, o 409 traz `replay.available: false`, `plan: null` e mensagem explícita. Erros de geração não geram plano; falha de gravação retorna 503 sem estorno. A sessão autenticada é a única fonte do dono.

Migração 0003 e [contrato de persistência/replay](PLAN-HISTORY.md). Retenção lógica até o fim dos 30 dias absolutos da sessão, independente da limpeza dos recibos de sete dias; remoção física de produto ainda pendente. Resposta 200, prompts, contratos/schema, matemática, ERRORS e configurações preservados. 239 testes Node e 46 cenários de integração local aprovados, sem chamadas reais ou ativação pública. Itens 2–7 e etapas 4/5 não foram implementados nesta entrega. Seções de entregas anteriores a seguir são histórico; o caminho operacional abaixo foi atualizado.

## Achados da primeira suíte real de compare — Item 5: roteiro privado, sem ativar o app

[Roteiro preparado](GROQ-TESTING.md) para ação do usuário: M03 → M04 → M05, uma chamada por comando, no máximo três na rodada inicial e sem retry automático. Conferir limites da conta antes de começar; o CLI não usa sessão/cota do app e não exige ligar flags. As chamadas reais não foram executadas pelo agente. Uma segunda rodada igual (+3) é somente opção posterior, após decisão do usuário, não parte automática do fluxo.

M03 exige sucesso do adaptador antes da conta: hora 0 informada disponível e custo do tempo 0 calculado; ausência de preço pode impedir somente a diferença parcial. Se cook recusar ou a geração falhar, esse custo não foi exercitado. M04 exige verificar JSON válido e as três chaves em cada lado no bruto, pois a saída canônica omite nulls inativos. M05 exige revisão humana do motivo e dos reason_codes; contrato pass não avalia coerência semântica. Nenhuma conta deve ser produzida a partir de failed_generation ou captura incompleta.

Guardar bruto/record privados e conferir hash, modelo/parâmetros, captura, HTTP/provider_code, contrato e comparison. Erro, captura incompleta, novo problema de conteúdo ou ramo essencial não exercitado: parar e trazer evidência, sem edição do pedido ou substituição da chamada. Usage ausente fica null; raciocínio não se soma novamente. O HTTP do CLI é da Groq, não da API pública. Rubrica/notas permanecem em branco para o usuário.

M02/unidade na prosa aguarda mais amostras, sem correção de prompt proposta; ausência da hora já funcionou no SYSTEM anterior, não é garantia sobre o atual. M06 segue não executado. Passagem única, ou mesmo segunda rodada pequena, não comprova correção geral. Reexecução e cálculo real com hora zero seguem pendentes.

Somente documentação mudou: npm test, 218 aprovados e zero falhas, sem teste novo; listagem compare/hash conferidos localmente, sem rede. Integração não reexecutada (39 cenários do Item 2 são histórico). Código, testes, SYSTEM/hashes, contratos, schema, matemática, omissão da hora, ERRORS e quota intactos. Flags false e QUOTA_POLICY_JSON vazio, sem chamada real/dependência/deploy. Itens 1–5 entregues localmente; etapas 3/4/5 de produto não iniciadas. Histórico abaixo não substitui o roteiro atual.

## Achados da primeira suíte real de compare — Item 4: evidência do CLI, não da rota pública

[Registro das cinco chamadas](GROQ-TESTING.md) concluído a partir do relato do usuário e corpo de erro M04 fornecido, com rubrica/notas em branco. HTTP 200/400 na tabela é da Groq, não HTTP público da aplicação. M03 recebeu 200 upstream mas falhou no contrato antes do cálculo com hora zero; M04 recebeu 400 json_validate_failed, registrado como PROVIDER_SCHEMA_REJECTED com conteúdo indisponível e usage null, não zero. O 502 público com reserva preservada foi testado localmente no Item 2, não medido por essas chamadas via CLI.

M02 confirmou o fluxo sem valor da hora: hora/custo do tempo indisponíveis com hourly_rate_not_provided, preço ausente com ready_price_not_provided, e ambos acumulados em partial_comparison. M05 confirmou os dois lados sem sugestão e cook_not_suggested/ready_not_suggested, sem garantir que os motivos estejam adequados. M01/M02 enviam o mesmo pedido à IA porque hourly_rate_brl fica local; a diferença de respostas é registrada como não determinismo, não efeito da hora nem herança de restrições em M01.

Desenho A aceito em M01/M02/M05. As cinco chamadas usaram o SYSTEM anterior, prefixo sha256:5df03242..., e não avaliam as correções posteriores. O registro preserva tanto reason ausente quanto fechamento inválido no failed_generation de M04; nenhum diagnóstico privado é promovido a receita válida. Vazamento de tablespoon em M02 é só observação, sem nova regra. M06 não foi executado; cálculo com hora zero e reexecuções com SYSTEM atual continuam sem medição/reverificação real.

Somente documentação mudou: npm test executado, 218 aprovados e zero falhas, nenhum teste novo. Integração não reexecutada; 39 cenários anteriores mantidos como histórico. Código, testes, SYSTEM/hashes, schema, contrato, matemática, omissão da hora, recusa legada, ERRORS e quotas intactos. Flags false e política vazia, sem chamada real do agente/dependência/deploy. Item 5 e etapas 3/4/5 de produto não iniciados; o roteiro final e a revisão humana continuam pendentes.

## Achados da primeira suíte real de compare — Item 3: linguagem dos motivos, sem validador semântico

O SYSTEM de compare orienta reason em pt-BR para a pessoa ler, proibindo citar no texto nomes internos como ingredient_policy e only_available. As chaves/valores estruturados continuam no contrato original. Ready não herda ingredientes, equipamentos, louça ou tempo doméstico e não pode recusar por falta de ingredientes em casa ou aparelho. Contradição do prato pode justificar recusa; ausência de oferta, entrega ou estabelecimento não é conhecida e não pode ser afirmada.

O fluxo permanece uma chamada → validação estrutural → cálculo local em sucesso. Não há filtro que detecte todos os motivos inadequados nem substituição/truncamento automático. Os motivos problemáticos de M05 continuam passando no contrato em teste simulado, sem alterações: isso explicita uma limitação, não aprovação de conteúdo. Recusa válida por lado continua resultado normal, inclusive nos dois lados, sem segunda chamada nem mudança de quota.

Reason mantém teto de 500 caracteres (501 rejeitado nos dois lados). O tamanho foi considerado, mas não foi proposto novo número sem avaliar motivos reais na tela mobile. Não existe validação nova de linguagem, despensa ou disponibilidade de delivery; a obediência à instrução requer reexecução/revisão humana de M05, e um sucesso não garante consistência.

Verificação executada: 218 testes Node aprovados, cinco novos, zero falhas, Groq simulada. Integração não reexecutada porque rota/banco/transporte não mudaram; 39 cenários do Item 2 são histórico. Hash compare atual sha256:63d74e6ac173d2c970e9c80cb332d56c22788e5084442046b9e3c9a823a560d4; cook/ready preservados em sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Sem medição real deste SYSTEM.

Schema, contratos, contas, omissão de hourly_rate_brl, ERRORS e recusa legada intactos. Flags false e QUOTA_POLICY_JSON vazio preservados, sem dependência/deploy. Itens 4–5 do conserto e etapas 3/4/5 de produto não iniciados; M03 com hora zero segue sem medição real do cálculo, M04 com novo prompt sem reexecução, e cook isolado sem extensão do piso de tempo. Rubrica/notas em branco. Seções abaixo registram entregas anteriores.

## Achados da primeira suíte real de compare — Item 2 concluído localmente: chaves obrigatórias e erro público

O SYSTEM de compare agora reforça que cada lado deve enviar status, suggestions e reason, sempre: suggested usa reason null; not_suggested usa suggestions null. Não omitir chaves nem enviar objeto parcial, inclusive quando somente um lado sugere. O schema Desenho A não mudou e o servidor não preenche campos ausentes para reparar geração.

Tratamento já existente, agora exercitado com o corpo completo de erro M04 fornecido pelo usuário: HTTP 400 upstream com error.code json_validate_failed → PROVIDER_SCHEMA_REJECTED → HTTP público 502, mensagem "O provedor rejeitou o formato da resposta gerada pela IA." e quotaReserved true. Sem cálculo, segunda chamada, retry, estorno ou diagnóstico privado no corpo/headers da resposta. O erro do adaptador também não expõe failed_generation; usage ausente continua null, não zero.

Evidência complementada: message/type/code/failed_generation recebidos na mensagem substituíram o marcador sintético. Os escapes de apresentação foram interpretados; o texto interno de 576 bytes UTF-8 não foi reparado. Seu fechamento inválido foi preservado e testado, sem tentar convertê-lo em receita válida. Há também falha sintática no conteúdo fornecido, portanto não afirmar que reason ausente foi a causa única do 400. Reproduzimos os valores fornecidos, não a serialização de um arquivo bruto não anexado. Reexecução real M04 segue pendente: presença da instrução e sucesso dos mocks não comprovam obediência do modelo.

Verificação final executada: 213 testes Node e 39 cenários workerd/D1 locais aprovados, respectivamente três e um novos no Item 2, todas as chamadas Groq simuladas. A skill workers-best-practices orientou repetir a verificação HTTP com o corpo fornecido no runtime existente; integração local autorizada, sem deploy. Este complemento não mudou prompt/hash, rota, ERRORS, reserva/cortesia, contrato, schema, matemática, omissão de hourly_rate_brl ou recusa legada.

Hash compare: sha256:2f454fac0d17cc18ee5e755174e498da629348d578f015e3bd14959ebb80eb1b; cook/ready intactos em sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Nenhuma medição real deste SYSTEM novo. Flags false e QUOTA_POLICY_JSON vazio preservados, sem dependência/deploy. Itens 3–5 do conserto e etapas 3/4/5 de produto não iniciados; M03 com hora zero continua sem medição real do cálculo. Seções seguintes são histórico.

## Achados da primeira suíte real de compare — Item 1: piso de tempo por instrução

Mudança exclusiva no SYSTEM enviado por compare: no lado cook, total_minutes inteiro de no mínimo 1, nunca zero; descascar fruta e comer usa 1 minuto como estimativa mínima. Isso não exige sujar louça: max_dishes 0 permanece válido. O modelo recebe a instrução, mas o servidor não repara a resposta: zero ainda falha em output.cook.suggestions.0.total_minutes e vira INVALID_OUTPUT. A rota e seu mapeamento 502 não foram alterados.

Fluxo preservado: uma chamada → validação → cálculo local somente em sucesso. hourly_rate_brl continua omitido do pedido estruturado enviado à IA e disponível localmente, distinguindo zero informado de ausência. M03 real anterior devolveu zero minutos e falhou antes da conta; o caminho com valor da hora zero continua sem medição real. Sua futura reexecução avaliará instrução e cálculo, sem que um sucesso isolado comprove consistência do modelo.

Cook/ready isolados, seu hash sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b e sua divergência de recusa permanecem intactos. Compare agora usa sha256:a127aaea802a6650a2c110951d4d4a4e78cddea79346895e937616c804dfd590; as cinco chamadas relatadas pertencem à versão anterior, não a esta. O usuário confirmou aceitação real do Desenho A em M01/M02/M05; schema não mudou. O registro detalhado fica para o Item 4.

Verificação local: npm test, 210 aprovados, dois novos testes de instrução/rejeição com transporte simulado, zero falhas. Sem chamada real, mudança de contrato, matemática, quota, ERRORS, dependência ou deploy. Integração não reexecutada porque rota/banco não mudaram. Flags false e QUOTA_POLICY_JSON vazio preservados; etapas 3/4/5 de produto não iniciadas. Itens 2–5 deste conserto e extensão da instrução a cook isolado continuam pendentes, sem avaliação humana preenchida. Seções abaixo são histórico das entregas, não novos testes/medições.

## Compare — Fase 4: avaliação separada do fluxo público

O avaliador tem agora M01–M06, listáveis sem rede por evaluate --compare --list e executáveis individualmente com evaluate --case M01 --send-real. --all mantém apenas C01–C10. [Roteiro e rubrica](GROQ-TESTING.md): seis chamadas para o conjunto completo; três no recorte inicial M01/M04/M05.

No CLI: uma chamada direta à Groq → captura/gravação do bruto → sucesso do adaptador e validação → mesmo calculateComparison da rota → record local com métricas e rubrica humana pendente. Nenhum cálculo é devolvido à IA. Em falha, comparison fica null; não calcular a partir de conteúdo truncado apenas porque passou estruturalmente. Os arquivos são avaliação local privada, não gravação de plano/histórico no D1.

Na API nada mudou: compare conta como UMA tentativa de generation para os dois lados, inclusive ambos not_suggested; inválidos mantêm reserva e erro. O CLI não exercita sessão, cota nem status HTTP público. As flags false e QUOTA_POLICY_JSON {} continuam bloqueando a rota com 503.

201 testes Node aprovados (dez novos), todos com transporte simulado. Integração não reexecutada nesta fase: rotas/banco intactos, 38 cenários são da Fase 3. Aceitação real do schema, qualidade e consumo continuam pendentes. Etapas de histórico/interface/publicação não iniciadas; seções seguintes são o histórico das fases.

## Compare — Fase 3: uma geração, contas locais e configuração ainda desligada

No fluxo local habilitado pelo teste: sessão/entrada/idempotência existentes → uma reserva generation → uma chamada Groq para cook e ready → contrato de saída → calculateComparison local → envelope de sucesso. As guardas temporárias da Fase 1 foram removidas juntas; a configuração real mantém flags false e política {}, portanto a rota continua 503/NOT_READY.

O adaptador retorna somente data e metadata. A rota acrescenta comparison e quota; a LLM não produz comparison e não recebe esse resultado. hourly_rate_brl é omitido da cópia do pedido ao provedor, mas permanece na entrada validada usada nos cálculos. Cook/ready isolados preservam o envelope anterior, sem comparison.

Uma ou ambas as partes not_suggested são resultado válido, com HTTP 200 no teste habilitado, uma tentativa consumida e comparação indisponível nos pares sem base. Formato inválido continua INVALID_OUTPUT/502 com reserva; json_validate_failed do provedor continua PROVIDER_SCHEMA_REJECTED/502. ERRORS e elegibilidade de cortesia intactos; nenhum retry ou estorno.

191 testes Node e 38 cenários de integração local aprovados. O cenário de sucesso confirma cálculo fora da IA, uma chamada/reserva, bloqueio de reenvio e teto compartilhado: um compare, um cook e um ready esgotam as três tentativas. Outros cenários cobrem ambos sem opção, saída inválida, diagnóstico upstream e flags desligadas.

Schema estrito garante forma/enums; limites de contagem, texto e valores permanecem locais conforme exceção autorizada, incluindo preço/motivo novos. [COMPARE-PROVIDER.md](COMPARE-PROVIDER.md) registra os detalhes e limites da evidência. Contrato e matemática preservados, sem novas dependências, migração, deploy ou campos da fase de histórico/interface. Fase 4 de avaliação real ainda não iniciada.

## Compare — Fase 2: cálculo local ainda não conectado ao fluxo

Novo módulo puro recebe entrada e saída compare, valida ambas pelo contrato e devolve métricas separadas, sem chamar a IA, alterar a saída original ou alimentar o modelo com o resultado. Não foi importado pela rota, pelo adaptador ou pelo instrumento; as duas guardas temporárias da Fase 1 continuam bloqueando compare sem reservar geração.

A origem permanece explícita: hora informada; tempo e preço estimados; custo e diferença calculados, com based_on_estimates true e fontes. Diferença parcial = preço ready menos custo do tempo cook, para cada par possível de alternativas, sem escolher vencedor. O resultado explicita que exclui ingredientes/taxas desconhecidas e não representa economia total. Ausência de hora, preço ou lado impede a conta correspondente, sem produzir zero fictício.

Custo arredondado em centavos (meio para cima); diferença entre valores já arredondados, com sinal preservado. Zero minutos é cenário da função matemática, não nova receita aceita no contrato. Detalhes em [COMPARISON-CALCULATIONS.md](COMPARISON-CALCULATIONS.md).

Verificação: 182 testes Node aprovados, 16 novos. Sem reexecução de integração nesta fase porque rotas, banco e adaptador ficaram intactos; os 34 cenários da Fase 1 são resultados anteriores. Sem schema/prompt compare, resposta HTTP nova, calibração, estorno, chamada real, dependência, migração ou deploy. Etapas 3/4/5 de produto continuam não iniciadas.

## Compare — Fase 1: contrato aceito, geração bloqueada sem reserva

Contrato compare implementado localmente, com campos de cook, restrições compartilhadas e hourly_rate_brl opcional. Saída: cook e ready obrigatórios, cada lado com status suggested (1–2 sugestões) ou not_suggested (motivo). Ambos sem opção são válidos no contrato; não são uma geração disponível pela rota nesta fase. Detalhes e limites em [GENERATION-CONTRACT.md](GENERATION-CONTRACT.md).

Proteção temporária em duas fronteiras, ambas aprovadas pelo usuário:

1. Na rota de geração, depois de validar a entrada, compare lança ContractError em input.mode antes de reserveUsage da operação generation. Mantido o mapeamento existente INVALID_INPUT/400 com quotaReserved: false, sem alterar ERRORS.
2. No adaptador, mesmo uma chamada direta válida falha em input.mode antes de montar/enviar a chamada à Groq. Não depende da chave ou das flags da rota.

A proteção de entrada ingress e a verificação de sessão continuam antes da guarda da rota. Portanto “sem reserva” aqui significa **sem reserva de geração e sem chamada à IA**, não ausência de qualquer contabilização técnica. Com as flags reais desligadas, permanece NOT_READY/503 antes desses passos. O HTTP 400 é bloqueio temporário de desenvolvimento, não o resultado futuro de dois lados inviáveis.

A integração anterior detectou quotaReserved: true quando só o adaptador bloqueava. A correção antecipa o bloqueio; não devolve cota depois, não muda expectativas para aceitar a reserva e não altera a cortesia. O cenário final faz quatro compare válidos, verifica zero chamadas e zero reservas generation, e confirma que as três tentativas de cook ainda funcionam.

Preço estimado opcional apenas no lado ready de compare: value e origin estimado são inseparáveis no contrato, relativos à refeição para todas as porções, não a preço consultado ou total final de delivery. Sem hourly_rate_brl, nenhum default é introduzido; com o campo, nesta fase apenas validamos a entrada, sem cálculo.

166 testes Node e 34 cenários de integração workerd/D1 locais aprovados, todos sem Groq real. Hash do SYSTEM antigo preservado nos dois modos; nenhuma mudança de schema, unidade permitida, parâmetros, cortesia ou recusa por lista vazia. Na Fase 3 autorizada, as duas guardas terão de ser removidas/substituídas em conjunto com o adaptador pronto. Não há modo compare funcional, comparação calculada, suíte real de compare, persistência de produto, interface, deploy ou mudança de flags/política nesta fase.

## Unidades após reverificação — Itens 2–4: fluxo preservado

Somente documentação nesta entrega. [Proposta de schema](SCHEMA-ALIGNMENT-PROPOSAL.md) sem escolha/implementação: suporte a minLength/maxLength/minItems/maxItems ainda não confirmado nas fontes oficiais consultadas. Contrato, SYSTEM, schema e mapa de erros não mudaram.

Depois da reserva, tanto INVALID_OUTPUT (contrato local após HTTP 200 da Groq) quanto PROVIDER_SCHEMA_REJECTED (HTTP 400 json_validate_failed da Groq) mantêm a tentativa comum consumida. Ambos mapeiam para HTTP público 502, mas não têm a mesma elegibilidade: somente INVALID_OUTPUT pertence aos códigos da cortesia B planejada; PROVIDER_SCHEMA_REJECTED segue excluído. B não está implementada, logo não há crédito efetivo em nenhum deles hoje.

Apertar restrições no provedor pode limitar a geração ou antecipar a rejeição em relação ao validador local; não garante economia de tokens nem receita coerente. A perda potencial de diagnóstico/uso precisa entrar na decisão, sem compensar alterando cortesia. No C05 relatado houve dois HTTP 400 (um failed_generation vazio, outro com 3.345 bytes) e um HTTP 200 com conteúdo e passo de 646 caracteres, rejeitado localmente. Não chamar todos de resposta vazia ou todos de erro local.

As [oito chamadas das rodadas 2/3](GROQ-TESTING.md) são relatos de execução do usuário pelo CLI, que não passa pelas cotas do aplicativo; o HTTP 502 da rota continua comprovado apenas nos testes locais citados, não pelo HTTP 400 do provedor. Rubrica/notas em branco. O novo [roteiro de unidades](UNITS-RETEST.md) também será executado pelo usuário, sem repetição automática ou chamadas pelo agente.

Recusa por lista vazia segue INVALID_OUTPUT/502; nenhuma alteração de elegibilidade, reserva, limite diário, política, flag, migração ou deploy. Compare e etapas 3/4/5 de produto seguem não iniciados. As seções abaixo são o histórico das entregas, atualizado por este status documental.

Verificação desta entrega documental: npm test executado, 147 testes aprovados, zero falhas. Sem testes novos ou chamadas reais; integração não reexecutada porque código/runtime não mudaram. Código, testes, configurações, contrato de geração e ERROR-BUDGET preservados por comparação de hashes.

## Unidades após reverificação — Item 1: contrato, schema e prompt sincronizados

A saída continua passando pelo mesmo contrato. As nove unidades agora vêm de UNIT_CHOICES congelada, usada pelo validador, pelo enum enviado à Groq e pela lista inserida no SYSTEM. O schema concreto não ganhou novos valores, minLength/maxLength/minItems/maxItems ou qualquer restrição adicional neste item. Não há tradução, coerção de unidade ou limpeza de passos.

O modelo recebe a lista explícita de identificadores exatos e a instrução de que nenhum item de steps pode ser vazio ou só espaços. Isso informa formato já exigido pelo código; não introduz julgamento de coerência, inventário de louça ou cálculo pela IA. Se o modelo continuar errando, valem os mesmos diagnósticos: erro de esquema identificado pelo provedor é PROVIDER_SCHEMA_REJECTED; saída inválida no contrato local é INVALID_OUTPUT. Recusa por lista vazia e elegibilidade de cortesia não mudaram.

147 testes Node e 33 cenários de integração local passaram com provedor simulado. Os quatro testes novos demonstram sincronia/instrução, não qualidade real ou resolução da intermitência de C05. Estimativa por proporção: 16–17 tokens da lista literal, 59–61 do parágrafo de unidades e 79–82 do acréscimo total, com as limitações detalhadas em [ROADMAP.md](ROADMAP.md); não são tokens medidos. O hash do SYSTEM muda automaticamente nos próximos records, sem campo novo na API.

Nenhuma chamada real, repetição, estorno, alteração de flags/política, deploy ou migração remota. Não iniciados compare, histórico ou interface/PWA. A proposta de schema, o registro das novas rodadas e o roteiro de reexecução são os Itens 2–4 deste pedido, reservados a entregas separadas; não marcar reverificação como concluída.

## Correções após medição — Item 4: versão só no avaliador local

O backend não mudou. O CLI evaluate calcula SHA-256 do SYSTEM exato que o adaptador enviou e salva request_settings.system_prompt_version junto do registro de cada caso. O campo não vai para Groq nem para o JSON público da API; não custa tokens do modelo. O hash é gerado antes da tentativa de rede e preservado nos registros de erro, quando a gravação funciona. Bruto continua salvo antes de validar; nenhum segredo ou texto de receita é usado para criar essa identidade.

O mecanismo identifica instruções, não a versão inteira do aplicativo: mudança de código de erro como no Item 3 pode ocorrer sem mudar o hash. Comparar também caso/entrada, modelo, parâmetros e código, sem misturar o resumo da rodada anterior legacy-unversioned com a nova. Registros antigos sem campo não recebem identidade atual por inferência. Roteiro, critérios e tabela vazia em [GROQ-TESTING.md](GROQ-TESTING.md).

143 testes Node passaram (quatro novos), confirmando identidade do texto enviado, preservação da requisição/resposta, registro em falhas e gravação no arquivo do caso. Não houve teste de integração novo, pois rotas e banco ficaram intactos; não houve chamada real. O usuário deverá reverificar E06/C01/C05/C10/E05/C07 individualmente, sem repetição automática para induzir erro. Qualidade não é comprovada pelo hash, pelo teste local ou por uma única resposta boa. Flags/cotas, prompts, contratos, erro de lista vazia e exclusão de PROVIDER_SCHEMA_REJECTED da cortesia permanecem como no Item 3.

## Correções após medição — Item 3: diagnóstico do provedor e HTTP público

O transporte compartilhado lê de forma limitada o corpo de erros HTTP 400 e usa somente error.code para reconhecer json_validate_failed. Mensagens/type/failed_generation não são reenviados ao cliente nem usados como receita. O formato sintético testado é o objeto error com message, type e code relatado pelo usuário; não se pressupõe que o valor de type ou o idioma da mensagem sejam constantes.

| Resultado do provedor | Código interno / API | HTTP público / mensagem |
|---|---|---|
| 400 com error.code json_validate_failed | PROVIDER_SCHEMA_REJECTED | 502 — O provedor rejeitou o formato da resposta gerada pela IA. |
| 400 sem esse diagnóstico completo | PROVIDER_REJECTED_REQUEST | 422 — O provedor não aceitou esta solicitação. |
| 413, 415 ou 422, independentemente do corpo | PROVIDER_REJECTED_REQUEST | 422 — O provedor não aceitou esta solicitação. |
| 200 com saída incompatível com o contrato local, incluindo lista vazia | INVALID_OUTPUT | 502 — A IA não devolveu uma resposta válida para este pedido. |

401/403, 429 e demais status preservam suas regras anteriores. O diagnóstico do 400 reutiliza o limite de 256 KiB e o prazo do transporte. JSON inválido, ausência de corpo, excesso, erro de leitura ou expiração mantêm a rejeição genérica; um HTTP 400 conhecido não ganha TIMEOUT por falha na leitura diagnóstica. Cancelamento/limites não autorizam repetir a IA.

PROVIDER_SCHEMA_REJECTED não é INVALID_OUTPUT nem é elegível à cortesia. A regra de B continua por códigos explícitos registrados pelo servidor (INVALID_OUTPUT, TRUNCATED e TIMEOUT), nunca por status 502. B não está implementada, portanto não houve alteração de concessão/resgate. Em C07 o provedor não reportou uso: ProviderError.usage fica null, a reserva continua consumida e não se informa consumo real zero. A finalização mantém o orçamento reservado mesmo sem medir o gasto.

139 testes Node e 33 cenários locais de integração aprovados (oito/cinco novos). Verificados novo código/uso ausente no avaliador, sanitização nas duas rotas, recibo failed, reserva preservada, reenvio bloqueado e quarta tentativa negada, sem chamada real. Prompts, esquema, contratos, validadores, recusa por lista vazia, flags e política não mudaram. Versionamento/reverificação formal do Item 4 e etapas de produto não iniciados nesta entrega.

## Correções após medição — Item 2: instrução de max_dishes 0

Somente o SYSTEM ganhou a explicação de que zero pede nenhuma peça reutilizável suja e pode ser atendido consumindo o alimento como está (descascar, abrir ou servir direto), respeitando ingredientes e demais restrições. Banana ao natural exemplifica E06; zero, por si só, não autoriza recusar. Não há caminho especial no código para zero, nem flexibilização de validação, contagem de peças ou substituição da resposta do modelo.

Lista vazia continua INVALID_OUTPUT no adaptador e 502 na rota, sem retry ou estorno. Frase geral de recusa, JSON Schema, contratos, faixa 0–20, testes anteriores, elegibilidade de cortesia, parâmetros, flags desligadas e política vazia permanecem intactos. Não houve chamada real, publicação, persistência de produto ou implementação dos Itens 3/4 das correções.

131 testes Node e 28 cenários locais de integração passaram com Groq simulada. Os dois novos testes usam o pedido E06 existente e comprovam instrução enviada/preservação de erro, não obediência do modelo. E06 com as novas instruções continua sem medição; a rodada anterior não é comparável como se usasse este prompt. Versão e plano formal de reexecução ficam para o Item 4.

## Correções após medição — Item 1: apenas texto do SYSTEM

A rota continua validando entrada, reservando cota, fazendo uma chamada e validando a saída. Somente as instruções de geração foram reforçadas: início/fim completos, passos sem numeração textual, ingredientes coerentes entre lista e passos, tempo de alimentos crus, nomes reconhecíveis e ausência de atalho com mãos/dedos para caber na louça. Não foi introduzido reparo de resposta: prefixos que denunciam omissão continuam visíveis se a IA os devolver.

Contrato de saída, JSON Schema, validadores e limitação de contagem de max_dishes estão intactos. A instrução específica de zero não foi corrigida ainda (Item 2). O mapa de erros e a cortesia não mudaram (Item 3); lista vazia continua INVALID_OUTPUT/502 após reserva, sem estorno ou retry. Flags permanecem desligadas e QUOTA_POLICY_JSON vazio. Fonte das observações reais: consolidado fornecido pelo usuário em [GROQ-TESTING.md](GROQ-TESTING.md).

Modelo, 4.096 tokens de saída, raciocínio low e decisão de reserva mantidos. Estimativa de aproximadamente 250–270 tokens de entrada adicionais em cook pela proporção do texto, com limitações em [ROADMAP.md](ROADMAP.md); não é medição nova nem calibração. A rodada anterior não comprova consumo/qualidade do prompt alterado; versionamento e reverificação formal serão tratados somente no Item 4 do pedido atual.

129 testes Node passaram (seis novos), verificando instruções enviadas e ausência de limpeza automática; 28 cenários locais de integração passaram com provedor simulado, após reexecução autorizada para superar bloqueio de acesso do empacotador. Não há nova chamada real, mudança de elegibilidade, publicação ou implementação das etapas de histórico/interface/PWA. O sucesso dos testes não prova que a IA obedeceu às novas regras.

## Retomada do Item 4 — avaliação separada do fluxo do produto

Adicionados somente casos E01–E08 ao avaliador local e documentação de [revisão humana](EQUIPMENT-REVIEW.md). O CLI seleciona um caso explicitamente e reutiliza o adaptador atual, sem passar por sessão, D1 ou cotas da aplicação. O lote original continua com dez casos. Nenhuma flag precisa ser ligada para o teste privado; esta entrega não fez chamada real nem mudou parâmetros.

Contrato e runtime permanecem intactos: entrada verifica as restrições, prompt as instrui e saída valida estrutura, sem comprovar equipamentos/louça. O novo teste sintético explicita uma receita incompatível aceita estruturalmente, mantendo `rubric_verdict: null`. Recusa por lista vazia continua inválida no contrato; nenhuma correção ou cortesia foi ativada.

123 testes Node passaram, sete novos; listagem local verificada. Integração não reexecutada, pois nenhuma rota/banco foi alterada. São testes do instrumento, não avaliação real da IA ou medição de limites/celular. O usuário executará e revisará as chamadas reais; a pendência continua aberta até existirem essas evidências. Nada de histórico, interface/PWA ou Item 5 foi implementado.

## Item 8 — dependências para fechar a experiência humana

Fluxo executável inalterado. [CRITICAL-PATH.md](CRITICAL-PATH.md) liga as tarefas já existentes até uma pessoa preencher no celular, receber refeição real e verificar a cota. A sequência exige avaliação real do modelo, calibração, interface móvel integrada, preview/configuração verificados e testes reais; este item só ordena, não executa essas etapas.

Sessões e cotas não equivalem a histórico de planos. A resposta atual pode sustentar um primeiro teste por texto sem persistência de produto, mas isso não libera a demo combinada sem histórico/exclusão, fotos e interface/PWA. Nenhuma promessa foi retirada além da decisão nutricional anterior do Item 7.

O teste de limite precisa comprovar ausência de nova chamada após o teto e distinguir janela individual dos demais limites; 429 sozinho não comprova qual teto bloqueou. Caso a cortesia B seja implementada no futuro, testar sua elegibilidade separadamente da franquia comum. Health ok continua sendo diagnóstico de configuração, não prova de funcionamento real.

116 testes existentes aprovados; integração não executada novamente, sem alteração de rota/banco. Arquivos de configuração continuam desligados/política vazia. Nenhum teste no celular ou na nuvem foi realizado nesta entrega. Item 8 documental concluído; pendências de 4 e 5 são a próxima retomada após aprovação, não implementação automática.

## Item 7 — calorias fora da demo PWA

O backend continua sem cálculo nutricional, catálogo TACO ou campos de calorias. Prompts mantêm a proibição de inventar números. O usuário escolheu B para a demo PWA: não informar calorias ou valores nutricionais. A integração com fonte real (A) foi reservada para a futura fase do aplicativo. [CALORIE-OPTIONS.md](CALORIE-OPTIONS.md) preserva fonte oficial, tamanho/permissão, custos, associação de alimentos e tratamento de dados ausentes.

Se integrada na futura fase do aplicativo, a energia viria de referência versionada e cálculo em código, não da LLM ou de seus metadados de uso. O contrato atual não basta para identificar todo alimento, estado e massa; ready não informa composição real. A retirada da promessa da demo é documental: nenhuma receita foi salva, nenhum JSON alterado e nenhuma etapa de produto iniciada.

116 testes existentes passaram nesta entrega documental; não medem correção nutricional. Integração não executada novamente, pois rotas/banco ficaram intactos. Não houve chamada Groq, dependência nova, migração, push ou deploy. As únicas consultas externas foram às fontes públicas da pesquisa. Pendências de 4/5 continuam para após o Item 8.

## Item 6 — diagnóstico externo à rota

O comando npm run measure:images usa readImageUpload e imageDataUrl existentes em processos Node isolados, sem sessão, D1, cotas, rede ou Groq. Mede três tamanhos sintéticos (0,5, 2 e 5 MiB) e reporta tempo e pico RSS do processo inteiro; não representa um Worker publicado nem a jornada completa.

Detalhes de escopo, resultados locais e alternativas ainda não escolhidas em [IMAGE-PATH-MEASUREMENT.md](IMAGE-PATH-MEASUREMENT.md). Texto pré-envio em [PHOTO-UPLOAD-NOTICE.md](PHOTO-UPLOAD-NOTICE.md): o original e eventuais EXIF/GPS continuam indo ao provedor pelo fluxo atual; nenhum tratamento de metadados foi implementado.

Verificação: 116 testes Node aprovados (cinco novos), três medições dedicadas concluídas, sem limiares de aprovação por tempo/memória. Integração não executada novamente. Código de produto, contratos, prompts, política, flags e banco intactos. A skill de boas práticas de Workers orientou medir as funções existentes e explicitar a diferença entre processo local e runtime publicado, sem substituir dependências ou alterar infraestrutura.

Após concluir o Item 8, retomar as pendências de 4 e 5 conforme [ROADMAP.md](ROADMAP.md); B continua escolhida e desativada, com parâmetros técnicos pendentes. Nenhuma etapa de histórico, UI/PWA ou publicação iniciada aqui.

## Item 5 — cortesia B escolhida, ainda não disponível

Fluxo executável inalterado: três tentativas comuns por visitante/dia UTC, sem estorno ou retry. [ERROR-BUDGET.md](ERROR-BUDGET.md) compara manutenção da regra, cortesia limitada e concessão após revisão. O usuário escolheu B; nenhuma regra nova foi ativada.

Reserva de tokens não equivale ao custo real medido. INVALID_OUTPUT (incluindo lista vazia), TRUNCATED e TIMEOUT descrevem falhas, não culpa comprovada. O recibo atual guarda apenas reserved/succeeded/failed, sem causa ou crédito; uma compensação não pode ser deduzida do código enviado pelo cliente. Finalização incerta pode deixar reserved e não autoriza repetir a IA.

Para implementar B, o desenho exige causa registrada pelo servidor, vínculo de concessão/resgate, limites adicionais e consumo atômico do crédito junto da nova reserva. A regra escolhida é no máximo uma tentativa extra por visitante/dia UTC, acionada pela pessoa após as três comuns, sem acumular ou encadear créditos; todos os demais tetos continuam aplicáveis. Tetos adicionais por rede/globais e contrato de consulta/resgate permanecem pendentes; implementação local desativada ainda não foi iniciada. Isso exigiria mudar o mecanismo que hoje bloqueia a quarta chamada, sem simplesmente alterar visitorDay para 4. Nenhuma mudança foi feita.

Essa extensão é persistência técnica de cotas, não histórico de refeições. Recuperar a resposta anterior depende da etapa 3; crédito daria outra tentativa, não replay. Nova consulta de estado técnico também seria necessária, mas nenhum endpoint foi criado. Política, flags, mapa ERRORS e frase de recusa permanecem intactos.

Verificação desta entrega documental: 111 testes existentes aprovados em npm test; integração não executada neste item, pois nenhuma rota ou banco foi alterado. Nenhum teste de crédito existe ainda. As boas práticas de Workers orientaram conferir a reserva/finalização no código instalado, sem ampliar a revisão para uma mudança de infraestrutura ou dependências.

## Item 4 — restrições opcionais antes da reserva de geração

O contrato de entrada de `cook` aceita `equipment`, `avoid_equipment` e `max_dishes`. Enums, tipos, tamanho de listas, duplicatas, conflitos e faixa de 0–20 são verificados antes da reserva de IA. Entrada inválida retorna o `INVALID_INPUT`/400 existente, com `quotaReserved: false`, sem chamar Groq; o limite técnico de entrada (`ingress`) pode ser consumido como antes. `ready` rejeita os campos e `compare` continua rejeitado como modo não implementado.

Entrada válida segue pelo mesmo adaptador em uma chamada, sujeita às mesmas três tentativas por visitante/dia. O prompt orienta respeitar equipamentos disponíveis/proibidos e a louça de preparo, mas a saída continua sendo o contrato anterior, sem inventário de utensílios. Não há contagem confiável ou verificação semântica de cumprimento; o teste que aceita texto incompatível documenta essa limitação, não aprovação de qualidade. Detalhes, exemplos e fronteira do futuro `compare` em [GENERATION-CONTRACT.md](GENERATION-CONTRACT.md).

A frase de recusa permanece intacta: `suggestions: []` resulta em `INVALID_OUTPUT`/502 após reserva, sem estorno e sem repetição. O item 4 não resolve essa divergência. Equipamentos/louça não são salvos em preferências, planos ou outra tabela; somente transitam na requisição atual.

Evidência local: `npm test` com 111 aprovados (13 novos); `npm run test:integration` com 28 cenários aprovados (três novos). Groq sempre simulado, banco descartável. As boas práticas de Workers orientaram verificar a passagem pelo handler e a ausência de reserva/chamada em entrada inválida usando o runtime já instalado, sem nova dependência. Não há verificação de modelo real, navegador, celular ou limites da nuvem.

Nenhuma flag, política de cota, binding ou migração foi alterada. Modelo, `max_completion_tokens: 4096` e `reasoning_effort: low` mantidos como parâmetros provisórios. O acréscimo de instruções não prova suficiência desses limites; calibrar permanece pendente. Item 3 e etapas de histórico, interface/PWA e publicação continuam sem implementação.

## Item 2 — diagnóstico de configuração em health

`GET /api/health` mantém HTTP 200, `Cache-Control: no-store`, `status: "ok"`, `stage: "backend"` e os booleanos `generationAvailable`, `visionAvailable` e `sessionsAvailable`. Acrescenta apenas `reasons`, com as operações `generation`, `vision` e `session`. Cada booleano é verdadeiro somente quando o motivo correspondente é `ok`.

Exemplo do formato com flags desligadas, não uma consulta ao ambiente publicado:

```json
{
  "status": "ok",
  "stage": "backend",
  "generationAvailable": false,
  "visionAvailable": false,
  "sessionsAvailable": false,
  "reasons": {
    "generation": "flag_off",
    "vision": "flag_off",
    "session": "flag_off"
  }
}
```

| Motivo | Significado |
|---|---|
| `ok` | As flags e a configuração necessária para essa operação passaram na checagem local. |
| `flag_off` | Uma flag necessária não é exatamente a string `"true"`, inclusive ausente ou malformada. |
| `policy_empty` | Política ausente, nula no ambiente, texto vazio/só espaços ou objeto JSON vazio. |
| `policy_invalid` | JSON malformado, valor que não é objeto, limite de 4.096 caracteres excedido ou política obrigatória da operação ausente/inválida. Texto JSON `null` e arrays são inválidos, não políticas vazias. |
| `secret_missing` | Algum segredo exigido está ausente, nulo ou em texto vazio/só espaços. Não informa qual. |
| `secret_invalid` | Algum segredo exigido tem tipo ou tamanho incompatível com a checagem já usada pelas rotas. Não informa qual, tamanho ou valor. |
| `db_unbound` | `DB` não oferece os métodos `prepare` e `batch` esperados; não identifica banco ou conta. |
| `config_error` | Falha inesperada durante a inspeção. Mensagem original e stack nunca saem na resposta; também é o resultado interno para operação desconhecida. |

**Precedência:** flag → política → segredos → binding → `ok`. O resultado é o primeiro impedimento, não uma lista completa. Com flags desligadas, `flag_off` continua sendo o resultado mesmo que faltem outros parâmetros. Depois de corrigir um impedimento, consultar novamente para observar o próximo. Exceções inesperadas na etapa alcançada produzem `config_error`.

Dependências verificadas por operação:

- Sessão: `SESSIONS_ENABLED`, sua política, os segredos de sessão/rede e a interface do binding. Não requer chave Groq, flag de IA ou política de visão/geração.
- Geração: `SESSIONS_ENABLED` e `AI_ENABLED`, políticas de geração e `ingress`, segredos de sessão/rede/Groq e binding.
- Visão: mesmas dependências de geração, mas usa a política de visão e também exige `VISION_ENABLED`.

Cada operação verifica suas próprias políticas; health não exige que políticas de outras operações estejam completas para aprová-la. Os mesmos validadores existentes de cotas e opções do provedor continuam sendo usados por `checkConfig`, compartilhado com as rotas. O tamanho mínimo dos segredos de sessão/rede é 32 caracteres após trim e o máximo é 1.024 caracteres no texto original; chave Groq exige texto não vazio. Isso não verifica entropia, validade no provedor ou associação à conta.

`apiConfigurationReason` retorna somente a categoria; `apiConfigured` continua disponível como wrapper booleano. `checkConfig` agora lança erro interno classificado, não `new Error()` vazio. Nas rotas de sessão/IA, configuração inválida continua produzindo o mesmo 503 sanitizado; o mapa `ERRORS` não foi alterado.

**Limites do diagnóstico:** nenhuma consulta D1, autenticação Groq, verificação de saldo, leitura/escrita de cota ou chamada de modelo é feita pelo health. `ok` não comprova que o banco correto foi ligado, que as migrações foram aplicadas, que o provedor está acessível ou que o fluxo completo funciona. `status: "ok"` significa que o endpoint respondeu, não que a demo esteja liberada. Não há identificação de segredo, nome/ID real de banco, conteúdo da política, log de valores ou mensagem crua de exceção na resposta.

Verificação local do item 2: `npm test` aprovou 98 testes, incluindo 16 novos de configuração; `npm run test:integration` aprovou 25 cenários, incluindo oito motivos no handler real dentro de workerd com D1 descartável. Groq sempre simulado. A primeira tentativa de integração parou no empacotador por acesso negado do ambiente restrito; a execução autorizada fora dessa restrição passou. Isso não mede navegador/celular ou limites reais da Cloudflare. Nenhum deploy, migração remota ou ativação de flags.

As boas práticas de Workers orientaram a inspeção sem I/O e a validação no runtime existente, sem nova dependência. Referência de plataforma: [bindings de Pages Functions](https://developers.cloudflare.com/pages/functions/bindings/), acessíveis por `context.env` e configuráveis separadamente em produção/preview. Não foram alterados bindings, versões ou data de compatibilidade.

## Item 1 — instrumento externo ao fluxo HTTP

O novo modo `scripts/groq-smoke.mjs evaluate` usa o mesmo adaptador de geração, mas chama diretamente a Groq somente quando o usuário fornece `GROQ_API_KEY`, destino local `GROQ_EVAL_DIR` e autorização `--send-real`. Não passa por sessão, D1 ou cotas do aplicativo. Não há retry nem estorno. Testes locais do instrumento usam apenas rede simulada; nenhuma chamada real de geração foi executada nesta entrega.

Bruto salvo antes de validar; falha de gravação interrompe o lote. `contract_verdict`, `refusal_channel` e `rubric_verdict` são independentes. O instrumento observa a divergência do prompt que orienta lista vazia, enquanto contrato/testes/documentação exigem 1–3 sugestões; mantém o resultado atual `INVALID_OUTPUT`/502 sem modificar `ERRORS`. JSON estruturalmente aprovado também pode conter receita semanticamente reprovada. Ver critérios, limitações de captura e tabelas vazias em [GROQ-TESTING.md](GROQ-TESTING.md).

Nenhuma rota, migração, persistência do produto ou configuração foi alterada. `AI_ENABLED`, `SESSIONS_ENABLED`, `VISION_ENABLED` e `QUOTA_POLICY_JSON` permanecem desligados/vazio; calibrar tokens e escolher um canal de recusa dependem de medições ainda inexistentes. As latências do CLI são medidas locais da chamada, não CPU do plano Free nem tempo no celular.

Estado em 2026-09-11: implementação local integrada e testada com Groq simulado. Não houve teste real adicional, commit, push, deploy ou migração remota. O reteste da foto permanece adiado. Histórico, diário, personalização e interface ainda são etapas seguintes.

## Caminho implementado

1. `POST /api/session`: exige HTTPS, mesma origem, `Idempotency-Key` UUID v4 e JSON `{}`. Reserva limite de tentativas de sessão por rede/global antes de ler o corpo (até 256 bytes). Cria ou reutiliza sessão; devolve `authenticated`, `expiresAt` e cookie somente no header. Reuso também consome uma tentativa de sessão, não geração de IA.
2. `POST /api/generate`: exige HTTPS e mesma origem, limita requisições de entrada (`ingress`), valida identificador e sessão, lê até 16 KiB de JSON com prazo de 15 segundos e valida o contrato. Consulta plano por visitante/chave antes da reserva. Se não houver, reserva atomicamente; recibo duplicado retorna replay disponível ou ausência explícita. Ação nova cook/ready pode incluir contexto limitado após ler consentimento válido, se a flag permitir; compare nunca inclui. Chama GPT-OSS uma vez, valida resposta, calcula compare, finaliza recibo e aguarda salvar plano antes de responder.
3. `POST /api/analyze-ingredients`: mesma sequência, usando o leitor multipart existente (uma foto até 5 MiB; corpo até 6 MiB). Reserva cota de visão, encaminha o original ao Qwen e valida/padroniza o JSON. Não gera refeição automaticamente.
4. Sucesso retorna `{ data, metadata, quota: { reserved: true, reservedTokens } }`, mais `comparison` em compare. Dados/modelo/tokens vêm do adaptador; salvar plano nunca registra refeição consumida. Visão não salva plano nem foto.
5. `GET/PUT /api/preferences`: sessão autenticada, ingress, flag própria false. PUT grava documento completo validado; GET devolve padrão desligado se ainda não houver linha. Falha ao salvar/ler é 503 sanitizado; mudar preferências não chama IA nem apaga diário. Sem permissão verificável durante geração, não se inclui histórico.

Respostas usam `Cache-Control: no-store`, sem CORS permissivo. As rotas não aceitam modelo, visitante ou cota impostos pelo corpo do cliente. Erros são códigos/mensagens sanitizados em português; sem logs de pedidos, imagens, cookies ou IP puro.

## Reserva atômica e reenvios

A migração `0002_usage_reservations.sql` acrescenta uma **sexta tabela técnica**, `usage_reservations`, e índices de expiração. As cinco tabelas originais continuam existentes. Cada recibo guarda um identificador derivado, operação, janelas/contadores necessários, estado e expiração — nunca foto, texto do pedido, token de sessão ou IP puro.

Um trigger verifica duplicação e todos os limites antes de aceitar a reserva. Outro incrementa os contadores na mesma instrução SQL. Qualquer falha desfaz a instrução inteira, sem reservar apenas algumas cotas. Teste local: 12 gerações simultâneas de um visitante resultaram em exatamente 3 chamadas simuladas; oito reenvios da mesma chave produziram uma chamada. Também foi testado rollback durante incremento.

`Idempotency-Key` identifica uma ação e deve ser preservado em reenvios. Na geração, repetir chave/dono retorna `409 DUPLICATE_REQUEST`, sem nova chamada/reserva de IA, com `replay.available`, `replay.plan` e mensagem. Havendo plano válido não expirado, ele inclui pedido original, resultado, metadados e comparison recalculado. Sem plano salvo, a resposta declara a ausência e não inventa sucesso. Mesmo corpo com chave nova é nova tentativa sujeita à cota; mesma chave com corpo válido diferente recupera o original. Sessão e visão não ganham replay de conteúdo neste item. Ver [detalhes e exemplos](PLAN-HISTORY.md).

Recibos duram pelo menos sete dias até limpeza; planos são independentes e permitem replay até o fim da sessão absoluta de 30 dias. Sem plano nem recibo não há idempotência eterna. Chaves são separadas por operação/visitante; tentativas de sessão usam rede pseudonimizada do dia, pois ainda não há visitante autenticado. Cada requisição de entrada usa recibo interno próprio e pode consumir o limite de entrada mesmo quando é um replay de geração.

## Quais limites existem

- Operações separadas: `session`, `ingress` (tentativas de acessar IA, inclusive inválidas), `generation` e `vision`.
- Refeições e visão: visitante, rede e global, por dia e por minuto. Para refeições, o validador exige exatamente **3 tentativas por visitante/dia**. Uma resposta pode conter até três sugestões, mas conta como uma tentativa.
- Sessão e entrada: limites de rede e globais, antes dos trechos mais caros. Não equivalem a proteção completa contra ataques distribuídos nem eliminam o consumo de recursos por requisições rejeitadas.
- Tokens: orçamento reservado por chamada, com teto global diário e por minuto de cada operação de IA. Reservas não são medições: precisam cobrir margem para entrada, saída e raciocínio. Se o provedor reportar mais tokens, a finalização eleva os contadores globais; se reportar menos, não devolve a diferença. Sem dados confiáveis, mantém a reserva.
- Janelas fixas em UTC, independentes do relógio do cliente e do modelo. Trocar modelo não reinicia cota individual. Janelas fixas podem concentrar tráfego nas bordas e não reproduzem necessariamente a janela usada pelo Groq.
- Rede: HMAC com `IP_HASH_SECRET` e rotação diária. IPv4 completo; IPv6 agrupado por /64 para reduzir contorno por endereços temporários. IPs IPv4-mapped são normalizados. Não armazenar IP puro. Redes compartilhadas podem atingir limites; VPNs/redes diferentes ainda podem contornar a camada de rede.

O código confia em `CF-Connecting-IP` somente porque as rotas serão servidas pela Cloudflare; não faz fallback para `X-Forwarded-For`. Não reutilizar esse pressuposto em servidor com acesso direto ou proxy não confiável. Configurações de Pseudo IPv4, Workers intermediários e identidade de rede devem ser verificadas no ambiente publicado.

## Falhas e consumo

Entrada inválida antes da reserva de IA não consome tentativa de geração/visão; pode consumir limite de entrada. A partir da reserva, falha, recusa, timeout, cancelamento ou resposta inválida **não geram estorno automático**, pois o provedor pode ter processado o pedido. Nem sempre uma reserva significa que a chamada efetivamente chegou ao Groq; falhas internas após reservar também são conservadoramente contadas.

Não há retry automático da chamada ao modelo. Se a finalização falhar, o serviço não libera a reserva; ela pode permanecer `reserved`. `quotaReserved` nos erros informa se este processamento conseguiu reservar tentativa de IA; não é uma garantia de que o provedor consumiu tokens. Em `409`, refere-se ao reenvio atual, não à tentativa original.

`429 LIMIT_REACHED` informa limite local, que pode ser individual, de rede, global, por minuto ou de tokens. `429 RATE_LIMITED` vem do provedor. Não anunciar horário exato de retorno ou saldo sem consulta apropriada: endpoint de consulta de saldo ainda não foi implementado. As cotas locais não garantem ausência de 429 no Groq, especialmente com estimativas incorretas ou uso da mesma conta fora do app.

Limpeza oportunista limitada a 100 recibos e 100 contadores expirados por pedido ao backend, sem remover janelas ativas. Não há tarefa agendada de limpeza: sem tráfego, registros expirados permanecem até próxima execução; não prometer remoção imediata. Exclusão de histórico/visitante não deve zerar contadores de abuso.

## Configuração deliberadamente desligada

Local, preview e produção no `wrangler.jsonc` mantêm `AI_ENABLED`, `SESSIONS_ENABLED` e `VISION_ENABLED` em `"false"`. `QUOTA_POLICY_JSON` está em `"{}"`: sem valores aprovados, chamadas habilitadas falham com 503, não ficam ilimitadas. Os antigos `VISITOR_DAILY_LIMIT`/`GLOBAL_DAILY_LIMIT` foram substituídos por essa política única. O teto de 80 gerações globais permanece uma proposta a calibrar, não uma configuração ativa.

`QUOTA_POLICY_JSON` é um objeto JSON de operações. Cada operação configurada deve ter exatamente estes campos inteiros:

| Campo | Uso |
|---|---|
| `visitorDay`, `visitorMinute` | Tetos por visitante; para `generation`, `visitorDay` precisa ser 3. Não usados em `session`/`ingress`, mas obrigatórios no formato. |
| `networkDay`, `networkMinute` | Tetos por rede; devem ser pelo menos os valores individuais correspondentes. |
| `globalDay`, `globalMinute` | Tetos gerais de pedidos. |
| `reserveTokens` | Reserva por tentativa; ao menos 4.096 para geração e 1.024 para visão, mas esses mínimos só cobrem o teto de saída e não são dimensionamento recomendado. |
| `dayTokens`, `minuteTokens` | Orçamentos globais de tokens, cada um ao menos a reserva de uma chamada. |

Em `session`/`ingress`, campos de tokens devem ser zero. Demais campos são positivos, até 10 milhões. Para habilitar geração/visão, configurar também `ingress`; a rota de sessão requer sua política própria. Números do harness de testes são amplos e **não devem ser copiados como cotas de produção**.

Segredos esperados: `GROQ_API_KEY`, `SESSION_SECRET`, `IP_HASH_SECRET`, separados por ambiente. Modelos continuam fixados nos adaptadores. O endpoint health informa flags/configuração válidas, sem consultar D1/Groq nem comprovar migração, cota disponível ou saúde do provedor.

## Verificação e próxima etapa

- `npm test`: validadores, transportes, sessões, políticas, IPs e leitura limitada de JSON.
- `npm run test:integration`: workerd e D1 descartáveis com as migrações 0001, 0002 e 0003 e Groq simulado; sem segredos reais. Incluído no workflow CI, mas execução no GitHub depende de commit/push futuros.
- `npm run build`: compila as rotas de Pages; não publica.
- `npm run db:migrate:local`: migração 0002 aplicada e verificada no D1 local; nenhum banco remoto foi alterado.

**Fechado localmente:** sessão → validação → reserva → IA simulada → resposta validada, incluindo concorrência, reenvios, quotas, rollback e falhas. **Pendente para liberar publicamente:** calibrar a política com limites da conta e testes reais, medir CPU/memória (inclusive imagem/base64), validar cookies no navegador/celular, configurar observabilidade sem dados sensíveis, aplicar migração em preview e verificar implantação. Não houve mudança no banco remoto nesta etapa.

Próximo item de produto após aprovação: diário, com registro explícito/manual e edição/exclusão. Planos têm gravação/replay e preferências têm persistência/contexto limitado; medição real do acréscimo, listagem de planos, despensa, validade, exclusão/limpeza de produto e interface continuam pendentes. O aplicativo utilizável ainda não está concluído.

Referências: [transações em D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [triggers SQLite e RAISE](https://www.sqlite.org/lang_createtrigger.html), [headers da Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [configuração Pages por ambiente](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
