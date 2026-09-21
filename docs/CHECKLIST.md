# Checklist do Refeição Fácil

## Estado atual — avaliações de refeições: Fases 1–3 entregues localmente

- [x] Nota opcional de 1–5 em `meal_logs.rating`, com `NULL` distinto de qualquer nota e restrição no banco.
- [x] Atualização usa a mutação idempotente já existente; isolamento, expiração, exclusão e recibos técnicos foram cobertos por teste.
- [x] `GET /api/plans` expõe somente os vínculos de consumo do dono quando `DIARY_ENABLED` está ativo; a nota não é contexto da IA.
- [x] Interface de Planos anteriores mostra cinco utensílios acessíveis somente para consumo registrado, com remoção explícita e confirmação do servidor antes do estado visual.
- [x] [Limites e decisões da avaliação](MEAL-RATINGS.md) documentados, inclusive a separação de uma futura personalização.
- [x] Regressão local: `npm test` com 490 testes aprovados e `npm run test:integration` aprovado.
- [ ] Validar a experiência em preview/publicação com um consumo real autorizado; não foi executado nesta fase documental.
- [ ] Decidir separadamente se avaliações poderão um dia participar da personalização, antes de qualquer envio à IA.

Nenhuma flag, cota, segredo, migração remota, deploy ou dependência foi alterada nesta fase. Os registros históricos abaixo não substituem este estado atual.

## Estado atual — vídeo de apoio: Fase 4 entregue documentalmente

- [x] Fases 1–3: contrato/adaptador, cache/cota exclusiva e rota protegida entregues, sem ativação.
- [x] [Aviso próprio](VIDEO-SUPPORT-NOTICE.md) com texto exato, rótulo “Buscar no YouTube” e regras para a futura interface.
- [x] [Custos e preparação](VIDEO-SETUP.md): quota oficial, conta com/sem cache, configuração privada e comando para teste real pelo usuário.
- [x] Atualizar menções de escopo em CHECKLIST/ROADMAP e consolidar USAGE-FLOW; PLAN-HISTORY preservado.
- [x] Registrar requisitos de atribuição, termos/privacidade, MadeForKids, player e limpeza; nenhum deles apresentado como interface implementada.
- [x] Reexecutar regressão: 442 testes Node e 123 cenários de integração aprovados; conferir aviso e sintaxe do roteiro sem API real.
- [ ] Primeira chamada real pelo usuário e confirmação da quota do projeto; não executada pelo agente.
- [ ] Escolher tetos/margem e garantir limpeza agendada de vídeo mesmo sem tráfego antes da ativação.
- [ ] Etapa 4 do produto: interface e requisitos de exibição; etapa 5: validação publicada/ativação, somente com autorização posterior.

A Fase 4 deste pedido é documentação do backend, não a etapa 4 de interface. Flags false, política vazia, código/histórico/testes/migrações/dependências preservados. Nenhum deploy, push ou chamada real. Registros abaixo são históricos, não uma nova lista de ações pendentes. Resultado da regressão desta fase no pacote de entrega.

## Registro histórico — vídeo de apoio, Fase 3 entregue: rota protegida e testes locais

- [x] POST /api/video separado, com seleção fechada por plano/lado/posição e leitura do dono.
- [x] Sessão, origem, ingress, chave do pedido e limites do corpo; sem título livre do cliente.
- [x] VIDEO_ENABLED=false e política vazia em desenvolvimento/preview/production, sem alteração remota.
- [x] Resposta autorizada com vídeo quando houver, aviso exato e busca sempre presente; falhas complementares sem 502/retry.
- [x] Geração, histórico, prompts, contratos externos, cálculo, cotas antigas e Fase 2 preservados.
- [x] 442 testes Node aprovados (22 novos), 123 cenários workerd/D1 aprovados (24 novos de vídeo) e npm run check aprovado.
- [ ] Fase 4 do pedido: aviso próprio, consolidação documental e orientação para teste real pelo usuário.
- [ ] Antes de ativar: limites/margem reais e limpeza agendada de vídeo mesmo sem tráfego; nenhuma chave real testada.

[Funcionamento, decisões e limites da rota](VIDEO-ROUTE.md). Nenhuma interface ou player; etapas 4/5 do produto não iniciadas. Abaixo, registros históricos que não substituem o estado atual.

## Registro histórico — vídeo de apoio, Fase 2 entregue: cache e cota internos

- [x] Migração 0007 isolada: cache global sem dono, travas e contadores exclusivos de vídeo.
- [x] Cache positivo (24h) e ausência válida (1h); acerto não reserva cota nem consulta Google.
- [x] Reserva atômica em seis janelas visitante/rede/projeto, dia do Pacífico, sem tokens ou alteração de quota.js.
- [x] Concorrência, repetição/resultado incerto, fallback e suspensão por quotaExceeded, sem retry.
- [x] Limpeza limitada efetiva das tabelas de vídeo, sem tocar histórico.
- [x] 42 testes novos: suíte Node completa com 420 aprovados; 99 cenários de integração aprovados. Integração existente é regressão da base, não do vídeo no workerd.
- [ ] Definir tetos/margem reais e confirmar quota do projeto; configuração sem padrão e não ativada.
- [ ] Agendar/verificar limpeza mesmo sem tráfego antes de ativar; a função oportunista não garante retenção máxima.
- [ ] Fase 3: rota, sessão/origem/ingress, VIDEO_ENABLED inicialmente false, resposta tranquila e integração de vídeo no runtime.
- [ ] Fase 4 do pedido: aviso próprio e consolidação documental. Etapas 4/5 do produto não iniciadas.

[Como funciona, decisões e limites](VIDEO-CACHE-QUOTA.md). Sem rota/flag configurada, chave/API real, migração remota, deploy ou push. Código anterior, histórico, geração, prompts, cotas existentes, dependências e configuração preservados. Abaixo, registros históricos das fases anteriores; suas pendências não substituem o estado acima. Parar na Fase 2.

## Registro histórico — vídeo de apoio, Fase 1 entregue localmente

- [x] Contrato puro e fechado em src/contracts/video.js: título, resultado, envelope e diagnóstico sanitizado.
- [x] Adaptador em src/providers/youtube.js: uma chamada, filtros fixos, cinco candidatos, nome do prato e nenhuma LLM.
- [x] Normalização conservadora, seleção lexical determinística e ausência como resultado válido, sem afirmar correspondência culinária.
- [x] Cinco segundos por padrão, teto de 16 KiB, cancelamento, resposta tardia, erros pt-BR e credencial fora da URL.
- [x] 24 testes novos com transporte simulado; npm test com 378 aprovados e integração existente com 99 cenários aprovados.
- [x] Decisões/contratos/limitações em [VIDEO-CONTRACT.md](VIDEO-CONTRACT.md); Fase 0 aprovada.
- [ ] Fase 2: aprovar números/margem, implementar cache, retenção e reserva/coordenação de cota exclusiva.
- [ ] Fase 3: rota protegida, ingress, VIDEO_ENABLED inicialmente false e alternativa tranquila; integração de vídeo no runtime.
- [ ] Fase 4 deste pedido: aviso próprio e consolidação documental; MadeForKids e requisitos do player antes de eventual incorporação.

A leitura de A5 aprovada permite somente alternativa com flag desligada, preservando rejeições de segurança. Nenhuma flag criada agora. Histórico, geração, prompts, ERRORS, cotas, migrações/configuração e dependências intactos. Sem chave real, API real, deploy ou push; etapas 4/5 do produto não iniciadas. Integração é regressão da base, não teste do YouTube real nem da nova função no workerd. Parar na Fase 1.

## Registro histórico — vídeo de apoio, Fase 0 entregue: pesquisa, sem implementação

- [x] Conferir documentação oficial, filtros, limitações, termos e dados mínimos em [VIDEO-API-PHASE-0.md](VIDEO-API-PHASE-0.md).
- [x] Corrigir a premissa de quota: documentação atual usa Search Queries separado; não implementar a matemática antiga.
- [x] Propor controle exclusivo de vídeo por visitante/rede/projeto, janelas do Pacífico e cache sem consumo da operação.
- [ ] Aprovar desenho e resolver A5 versus retorno de alternativa com flag desligada; definir tetos/margem, ainda não escolhidos.
- [ ] Fase 1: contrato e adaptador com API simulada, somente após aprovação.
- [ ] Fases 2/3: cache/cota e rota; Fase 4 deste pedido: documento próprio do aviso e consolidação das menções históricas.
- [ ] Antes de incorporar: resolver verificação MadeForKids, política de privacidade, atribuição, player e limpeza efetiva de cache. Não há player ou consulta adicional implementada.

Regressão real: npm test com 354 aprovados; npm run test:integration com 99 cenários aprovados, após reexecução autorizada por restrição do esbuild no sandbox. Sem novos testes ou chamadas ao YouTube/Groq reais. Código, histórico, contratos, prompts, cotas, migrações e configurações intactos; VIDEO_ENABLED ainda não adicionada. Conta/quota/chave não verificadas. Etapas 4/5 do produto seguem não iniciadas nesta entrega. Parar na Fase 0.

## Etapa 3 — limpeza por prazo: desenho entregue, não implementado

- [x] Documentar [matriz de retenção e executor proposto](RETENTION-CLEANUP-PROPOSAL.md), com diferenças entre prazo da sessão, validade do alimento e recibos técnicos.
- [x] Registrar autoridade interna proposta, processamento em lotes, proteção contra escritas tardias, anomalias, custo e testes futuros.
- [ ] Aprovar prazo/comunicação, execução interna horária e preservação técnica conforme as três decisões da proposta.
- [ ] Implementar localmente migração técnica/índices, guardas, executor limitado e testes; tetos propostos de 100 linhas por DELETE e 20 instruções por execução ainda não medidos.
- [ ] Medir consumo/atraso, validar ambiente e autorizar separadamente ativação/agendamento remoto. Limpeza física não concluída.
- [ ] Recuperação permanece sem implementação; medição real de contexto e etapas 4/5 continuam pendentes.

Regressão desta entrega: npm test com 354 aprovados e integração com 99 cenários aprovados, zero testes novos. Integração inicialmente bloqueada por acesso do esbuild no sandbox; reexecução autorizada em runtime local descartável passou. Sem IA real, dados reais apagados, migração, flag, código ou configuração alterados. Parar para aprovação do desenho. Abaixo, histórico das entregas.

## Etapa 3 — Histórico, Item 7: proposta escrita entregue

Proposta de transferência por código em [RECOVERY-PROPOSAL.md](RECOVERY-PROPOSAL.md): geração aleatória, HMAC separado, emissão/importação, preparação/confirmação, revogação da sessão/código antigos, cotas, vazamento, falhas e limitações. Documento entregue; nenhuma funcionalidade de recuperação implementada.

- [ ] Aprovar desenho detalhado e nova autenticação por código antes de implementar; limites propostos não são medições nem configuração aprovada.
- [ ] Implementar e testar recuperação, apenas após autorização específica; manter desativada até verificação.
- [ ] Fechar limpeza física automática após 30 dias e retenção/limpeza técnica, pendentes da etapa 3.
- [ ] Medir custo real do contexto; etapas 4/5 permanecem sem interface/publicação.

Regressão reexecutada: npm test com 354 aprovados e integração com 99 cenários aprovados, zero testes novos. Groq simulada e bancos descartáveis. Resultados verificam o backend existente, não a proposta. Nenhum código, contrato, SYSTEM, migração, segredo, flag ou cota mudou. Parar e aguardar aprovação; as seções seguintes são histórico.

## Etapa 3 — Histórico, Item 6: exclusão solicitada entregue localmente

- [x] DELETE /api/history remove planos, preferências, diário e despensa apenas do visitante autenticado, com confirmação explícita.
- [x] Manter visitante, cota e recibos técnicos; ingress continua obrigatório, sem IA/estorno.
- [x] Migração 0006: revisão técnica e recibo próprio; transação idempotente sem apagar dados novos no reenvio da mesma chave.
- [x] Bloquear gravações anteriores à exclusão em geração, preferências, diário, despensa e baixa.
- [x] HISTORY_DELETION_ENABLED false nos três ambientes; demais flags/política preservadas.
- [x] npm test: 354 aprovados (21 novos); integração: 99 cenários aprovados (nove novos), incluindo concorrência e rollback.
- [x] Atualizar [HISTORY-DELETION.md](HISTORY-DELETION.md), ROADMAP, USAGE-FLOW, SESSIONS e PLAN-HISTORY.
- [ ] Fechar limpeza física automática após 30 dias e limpeza dos recibos de produto; expirar acesso e excluir sob solicitação não implementam manutenção automática.
- [ ] Item 7: proposta escrita de recuperação, não iniciada.
- [ ] Medição real de tokens do contexto; etapas 4/5 (interface, configuração/ativação e publicação).

SYSTEM/contratos/schema, ERRORS, cálculo, quota e dependências intactos. Só bancos descartáveis de teste foram alterados; nenhum dado real apagado. A rota de exclusão está entregue, mas não declarar a retenção completa da etapa 3 resolvida. Parar e aguardar aprovação. Abaixo, histórico das entregas anteriores.

## Etapa 3 — Histórico, Item 5 entregue localmente: prioridade por validade

- [x] Ordenar por data informada, sem data por último, desempate nome/ID e até quatro itens; testar calendário e bordas UTC.
- [x] use_pantry opcional, independente de use_history, sem permissão quando ausente/false; cook somente.
- [x] Orçamento compartilhado: listas até 400 caracteres cada, despensa sozinha até 800, bloco completo até 1.200; diário sozinho preservado.
- [x] only_available respeita nomes explícitos; zero excluído, desconhecido omitido, sem inferência de foto ou julgamento sanitário.
- [x] Isolamento, falhas independentes, edição/exclusão refletida e replay sem reler/reenviar contexto.
- [x] npm test: 333 aprovados (20 novos); integração: 90 cenários aprovados (oito novos), Groq simulada e D1 local.
- [x] Atualizar [PANTRY-PRIORITY.md](PANTRY-PRIORITY.md), PERSONALIZATION, PANTRY, ROADMAP, USAGE-FLOW e SESSIONS.
- [ ] Medir custo real de diário/despensa/ambos; 600 tokens seguem hipótese, não teto comprovado.
- [ ] Itens 6/7: exclusão abrangente/limpeza e proposta de recuperação.
- [ ] Etapas 4/5: interface/PWA, configuração, ativação, publicação e validação real.

Sem migração nova, dependência, SYSTEM/contrato/schema, ERRORS, cálculo ou cota alterados. Flags false e política vazia. Parar no Item 5 e aguardar aprovação. Seções seguintes registram o estado na data das entregas anteriores.

## Etapa 3 — Histórico, Item 4 entregue localmente: despensa

- [x] Migração 0005: pantry_items com dono, nome, quantidade/unidade opcionais, datas, nome normalizado, revisão e índice por visitante/validade.
- [x] Validadores puros, enum UNIT_CHOICES único, nomes NFC/pt-BR e teto atômico de 40 itens.
- [x] Listar, consultar, adicionar, editar e excluir por sessão; revisões impedem sobrescrever saldo desatualizado.
- [x] Prévia e confirmação separadas após consumo; apenas ingredientes estruturados, nome exato, unidade igual e quantidade representável.
- [x] Relatar ignorados, manter saldo zero, marcar cálculos baseados em estimativas e não inferir ingredientes dos passos.
- [x] Recibo/baixa atômicos e uma baixa por refeição mesmo com chaves diferentes; isolamento e rollback verificados.
- [x] PANTRY_ENABLED false nos três ambientes; somente ingress, sem IA ou cota de geração/visão.
- [x] npm test: 313 aprovados (29 novos); integração: 82 cenários aprovados (16 novos), incluindo lote de 40 ingredientes.
- [x] Atualizar contrato/decisões em [PANTRY.md](PANTRY.md), ROADMAP, USAGE-FLOW e SESSIONS.
- [ ] Item 5: prioridade por validade e inclusão no orçamento compartilhado de contexto; não implementado.
- [ ] Itens 6/7: exclusão abrangente/limpeza e proposta de recuperação; não implementados.
- [ ] Medição real do custo do contexto do Item 2, ainda pendente.
- [ ] Etapas 4/5: interface/PWA, ativação, publicação e validação no destino não iniciadas.

Sem SYSTEM/contrato/schema de geração, ERRORS, comparison, política/reserva ou dependências alterados. Sem migração remota, deploy ou push. Limitações da baixa e ajustes manuais documentados. Parar no Item 4 e aguardar aprovação. Seções seguintes são histórico de entregas.

## Etapa 3 — Histórico, Item 3 entregue localmente: diário

- [x] Registrar consumo manual/delivery sem plano, com confirmação explícita e data retroativa validada.
- [x] Confirmar somente a sugestão escolhida de cook/ready/compare; rejeitar recusa, índice inválido ou plano alheio.
- [x] Listar com paginação, consultar, editar e excluir por sessão autenticada; sem autorizar personalização automaticamente.
- [x] Idempotência atômica com recibo técnico separado, preservado após excluir; concorrência e falha SQL verificadas.
- [x] Aplicar ingress sem chamar IA nem reservar geração/visão; DIARY_ENABLED false nos três ambientes.
- [x] Migração 0004 executada somente nos bancos descartáveis de teste; nenhum preenchimento fictício de linhas antigas.
- [x] npm test: 284 aprovados (26 novos); integração: 66 cenários aprovados (12 novos), Groq simulada.
- [x] Documentar contratos, falhas, retenção, decisões e fluxo futuro em [MEAL-LOGS.md](MEAL-LOGS.md).
- [ ] Item 2: medir custo real do recorte em chamadas controladas, ainda pendente.
- [ ] Itens 4–7: despensa, validade, exclusão abrangente/limpeza e proposta de recuperação, somente após aprovação.
- [ ] Etapas 4/5: interface/PWA, integração visual, ativação e publicação não iniciadas.

SYSTEM, contrato/schema da geração, ERRORS, comparação e cotas preservados. Não há baixa na despensa, avaliação nutricional ou inferência de consumo a partir de tela/geração. Entrega apenas do Item 3; parar para aprovação. Seções seguintes registram entregas anteriores.

## Etapa 3 — Histórico, Item 2 entregue localmente; consumo efetivo pendente

- [x] Persistir/recuperar preferências por visitante em GET/PUT /api/preferences, use_history false por padrão, validação estrita e defaults separados do formulário.
- [x] Ler permissão no servidor em cada geração cook/ready nova; ausente, inválida ou indisponível significa envio sem histórico. Registrar não autoriza.
- [x] Garantir compare sem consultar, montar ou enviar histórico, inclusive com permissão ativa e barreira adicional no adaptador.
- [x] Selecionar somente descrição/data/vínculo de plano do próprio dono: sete dias, quatro registros, 120 caracteres de descrição, 300 por registro JSON e 1.200 no bloco completo. Sem passos ou fotos.
- [x] Testar ligar/desligar/reativar, isolamento, falha ao salvar/ler, dados vazios/inválidos, limites Unicode/escapes, datas, exclusão/correção refletida e pedido atual preservado.
- [x] Executar npm test: 258 aprovados, 19 novos; integração: 54 cenários aprovados, oito novos, bancos descartáveis e Groq simulada.
- [x] Conferir SYSTEM/hash, contrato/schema, cálculo e ERRORS preservados. Nova flag PERSONALIZATION_ENABLED false nos três ambientes; nenhuma flag ligada.
- [ ] Usuário medir delta real de prompt_tokens com/sem recorte. Razão dois caracteres/token é suposição; **não marcar os 600 tokens efetivos como verificados**.
- [ ] Itens 3–7: diário, despensa, validade, exclusão completa/limpeza física e proposta de recuperação; endpoints de exclusão não foram adiantados.
- [ ] Etapas 4/5: interface e liberação/verificação posterior. Uma alternativa no C08 é observação de escolha para UI, não autorização para alterar prompt.

Contrato e decisões em [PERSONALIZATION.md](PERSONALIZATION.md); medições atuais C08/C10 com hash e correção de versão em [GROQ-TESTING.md](GROQ-TESTING.md). Reserva aprovada 4.096, política executável vazia e demais flags false preservadas. Nenhuma dependência, migração, chamada real do agente, push ou deploy. Seções de Itens anteriores abaixo são histórico das respectivas entregas.

## Etapa 3 — Histórico, Item 1 entregue localmente

- [x] Salvar pedido completo e resposta validada antes do HTTP 200, nos três modos, sem marcar consumo. Plano permanece rascunho, inclusive compare com recusa.
- [x] Recuperar plano no 409 da mesma chave/dono, sem IA ou reserva de geração; ingress continua aplicado conforme decisão aprovada.
- [x] Recalcular comparison com fontes/ordem idênticas após round-trip; preservar opcionais ausentes, hora zero e equipamentos vazios.
- [x] Declarar ausência de plano no 409; falhas de geração/gravação não inventam resultado nem devolvem cota.
- [x] Criar migração 0003 e verificar isolamento de dois visitantes, gravação aguardada, corrida, falha SQL, recibo limpo e prazo absoluto da sessão.
- [x] Executar `npm test`: 239 aprovados, 21 novos; `npm run test:integration`: 46 cenários aprovados, sete novos, Groq simulada e bancos locais descartáveis.
- [ ] Item 2: apresentar conta de tokens e aguardar decisão antes de implementar preferências e contexto.
- [ ] Itens 3–7: diário, despensa, validade, exclusão/limpeza de produto e proposta de recuperação. A proteção contra reinserção após exclusão fica junto do Item 6, ainda não implementado.
- [ ] Etapas 4/5: interface, verificação e publicação. Atualização posterior: backend de vídeo complementar com busca alternativa entregue em pedido separado; aviso e preparação em [VIDEO-SUPPORT-NOTICE.md](VIDEO-SUPPORT-NOTICE.md) e [VIDEO-SETUP.md](VIDEO-SETUP.md). Não há player ou ativação publicada.

Detalhes, formato do replay, limitações e decisões em [PLAN-HISTORY.md](PLAN-HISTORY.md). Flags existentes false, política vazia, SYSTEM, contratos/schema, matemática, ERRORS e recusa legada preservados. Sem dependência nova, chamada real, deploy, push ou migração remota. As seções seguintes mantêm o histórico de entregas anteriores, não substituem este estado atual.

## Achados da primeira suíte real de compare — Item 5: roteiro concluído, reexecução pendente

- [x] Preparar em [GROQ-TESTING.md](GROQ-TESTING.md) o roteiro M03 → M04 → M05, três chamadas individuais se concluído, com critérios, limites de evidência, comandos e condições de parada.
- [x] Distinguir M03: piso do contrato 1–5 versus instrução de 1 minuto para preparo instantâneo; custo do tempo zero com hora informada zero não equivale a ausência/default, refeição grátis ou diferença disponível sem preço.
- [x] Definir conferência das três chaves/nulls de M04 no bruto, não só na saída canônica, e revisão dos motivos de M05 sem aprovar automaticamente pelo contrato.
- [x] Deixar M02 para rodada posterior de mais amostras, sem declarar vazamento de unidade resolvido ou propor instrução nova. M01 fora do recorte inicial; M06 continua não executado e pendente.
- [x] Explicitar que passagem única é triagem. Segunda rodada dos três casos é apenas opção posterior do usuário (+3 chamadas, total 6 se completas), sem retry automático ou repetição até passar.
- [x] Executar npm test: 218 aprovados, zero falhas, nenhum teste novo. Conferir listagem compare e hash local sem rede. Somente documentação alterada; integração não reexecutada, 39 cenários do Item 2 são histórico.
- [ ] Usuário executar/revisar a primeira rodada, começando por M03, preservando bruto e record de cada chamada. Hora zero continua sem medição real do cálculo até ocorrer sucesso nesse caminho.
- [ ] Preencher rubrica/notas por decisão humana e registrar ramos ausentes/falhas; avaliar eventual rodada adicional, sem assumir confiabilidade por um sucesso.

Os Itens 1–5 estão entregues localmente, não empiricamente validados como conjunto. SYSTEM compare esperado: sha256:63d74e6ac173d2c970e9c80cb332d56c22788e5084442046b9e3c9a823a560d4; este item não o alterou. Código, testes, contratos, schema, cálculos, omissão de hourly_rate_brl, ERRORS, recusa legada e configurações intactos. Nenhuma chamada real do agente, dependência, deploy ou flag ligada. Etapas 3/4/5 de produto e extensão do piso a cook isolado continuam pendentes. As seções abaixo são histórico, não o roteiro atual.

## Achados da primeira suíte real de compare — Item 4 documental concluído

- [x] Registrar em [GROQ-TESTING.md](GROQ-TESTING.md) as cinco chamadas, com contrato/campo, HTTP Groq, provider_code e os quatro campos de tokens fornecidos; null de M04 não vira zero. Não misturar com o M01 antigo de schema rejeitado ou com as 26 chamadas de cook/ready.
- [x] Registrar aceitação real do Desenho A em M01/M02/M05 e não determinismo entre M01/M02, cujos pedidos enviados à IA são iguais, sem atribuir a variação ao valor da hora ou à herança de restrições.
- [x] Registrar M02 com hora/preço indisponíveis e ambos os motivos acumulados; trecho "Adicione 1 tablespoon de óleo" apenas como observação, sem propor/mudar instrução de unidades.
- [x] Preservar evidência literal de M03/M04/M05, incluindo os 576 bytes e o final inválido de failed_generation no corpo M04 fornecido; não afirmar causa única do 400. Registrar motivos problemáticos e funcionamento estrutural separadamente.
- [x] Manter rubric_verdict e notas por critério em branco; explicitar M06 não executado, ausência de medição real do cálculo com hora zero e ausência de avaliação do SYSTEM novo.
- [x] Executar npm test: 218 aprovados, zero falhas, sem teste novo. Somente documentação alterada; integração não reexecutada, 39 cenários do Item 2 são histórico.
- [ ] Item 5: preparar o roteiro final de reexecução após aprovação desta entrega. Reexecuções e revisão humana continuam pendentes; não marcar qualidade como resolvida.

Código, testes, schema, contratos, SYSTEM/hashes, cálculos, omissão de hourly_rate_brl, ERRORS, recusa legada e configurações preservados. Sem chamada real do agente, dependência, deploy, flag ligada ou avanço nas etapas 3/4/5 de produto. O registro detalhado agora supera as antigas pendências documentais das seções históricas abaixo.

## Achados da primeira suíte real de compare — Item 3 concluído localmente

- [x] Acrescentar instruções exclusivas de compare: reason em linguagem comum, pt-BR, sem nomes internos de campos/políticas/valores no texto; manter as chaves e valores estruturados do JSON.
- [x] Explicitar que ready não herda ingredientes disponíveis, equipamentos, louça ou tempo de preparo doméstico, nem pode recusar pela falta de ingredientes em casa ou aparelhos.
- [x] Preservar recusa por exigência contraditória ou inexistente como prato, sem afirmar ausência de oferta, entrega ou estabelecimento no mercado.
- [x] Executar npm test: 218 aprovados, cinco novos, zero falhas. Três testes conferem instruções no SYSTEM enviado; um preserva os motivos inadequados relatados em M05 para explicitar que o contrato não julga conteúdo; outro confirma 500 aceitos/501 rejeitados, sem truncamento.
- [x] Considerar o tamanho de reason e manter 500 caracteres. Não propor novo teto numérico sem avaliar motivos reais no layout mobile; nenhum limite de prompt/contrato reduzido nesta entrega.
- [ ] Usuário reexecutar M05 e avaliar os motivos de cada lado. Instrução enviada e contrato aprovado não comprovam obediência/qualidade; uma passagem não comprova consistência. Rubrica e notas humanas continuam em branco.
- [ ] Itens 4–5 deste conserto não iniciados: registro completo da suíte e roteiro final. M03 com hora zero segue sem medição real do cálculo; M04 com prompt novo segue sem reexecução; extensão do piso de tempo a cook isolado depende de autorização.

Compare agora usa sha256:63d74e6ac173d2c970e9c80cb332d56c22788e5084442046b9e3c9a823a560d4, sem medição real desta versão. Cook/ready mantêm sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Schema, contratos, cálculo, omissão de hourly_rate_brl, recusa legada, ERRORS e configurações preservados. Integração não reexecutada: somente prompt/testes/documentação mudaram, e os 39 cenários do Item 2 são resultado anterior. Sem dependência, deploy, flag ligada ou chamada real; etapas 3/4/5 de produto não iniciadas. Seções abaixo são histórico.

## Achados da primeira suíte real de compare — Item 2 concluído localmente

- [x] Reforçar exclusivamente o SYSTEM de compare: status, suggestions e reason SEMPRE presentes em cada lado; suggested exige reason null, not_suggested exige suggestions null; nunca omitir chave nem enviar objeto parcial. Exemplo estrutural do erro M04, sem copiar sua receita.
- [x] Testar a instrução efetivamente enviada no pedido M04 e a rejeição pelo schema existente de ready sem reason, mesmo com cook completo.
- [x] Verificar o corpo completo de erro fornecido pelo usuário: json_validate_failed gera PROVIDER_SCHEMA_REJECTED, HTTP público 502 e mensagem neutra; failed_generation não aparece no erro do adaptador nem no corpo/headers públicos. Uma chamada e reserva mantidas, sem retry/reparo.
- [x] Reexecutar npm test: 213 aprovados, zero falhas (três novos no Item 2, incluindo preservação da evidência). Integração workerd/D1: 39 cenários aprovados, um novo no item, Groq inteiramente simulada. Execução local autorizada; sem deploy.
- [x] Receber o corpo completo pela mensagem e substituir o marcador sintético nos testes por message/type/code/failed_generation fornecidos. Interpretar apenas escapes de apresentação do chat, sem reparar o conteúdo. Teste confirma 576 bytes UTF-8 e preserva o final inválido: JSON.parse do texto interno lança SyntaxError. É reprodução dos valores fornecidos, não arquivo bruto capturado pelo agente nem nova medição.
- [ ] Usuário reexecutar M04 para avaliar se o modelo mantém as três chaves nos dois lados. Testes locais e passagem única não garantem obediência consistente.
- [ ] Itens 3–5 deste conserto não iniciados; M03 com hourly_rate_brl 0 continua sem medição real do cálculo, e a extensão da instrução de tempo a cook isolado segue pendente de autorização.

Hash compare agora sha256:2f454fac0d17cc18ee5e755174e498da629348d578f015e3bd14959ebb80eb1b (Item 1: sha256:a127aaea802a6650a2c110951d4d4a4e78cddea79346895e937616c804dfd590). Cook/ready mantêm sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Nenhuma medição real avalia este prompt novo.

O complemento com o corpo M04 não alterou nenhum SYSTEM/hash. Além da ausência de reason relatada, o texto interno fornecido tem fechamento sintaticamente inválido; não atribuir a causa única do 400 à chave ausente. Preservar o diagnóstico sem corrigir JSON, copiar receita para o prompt ou ampliar o escopo do item.

Schema Desenho A, contratos, cálculo, omissão de hourly_rate_brl, ERRORS, recusa legada e configurações intactos. Sem dependência, deploy, flag ligada ou chamada real do agente; etapas 3/4/5 de produto não iniciadas. A skill workers-best-practices orientou verificar a fronteira HTTP no runtime local existente. Seções abaixo são histórico das entregas.

## Achados da primeira suíte real de compare — Item 1

- [x] Após aprovação explícita, aplicar somente ao lado cook de compare a instrução de total_minutes inteiro, mínimo 1 e nunca zero; preparo instantâneo usa 1 como estimativa, sem impedir max_dishes 0.
- [x] Preservar cook/ready isolados: ambos mantêm sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Não editar as regras compartilhadas nem a divergência da recusa legada.
- [x] Testar o SYSTEM efetivamente enviado para M03, entrada sem hourly_rate_brl no envio, zero peças válido com 1 minuto e rejeição de zero minutos no caminho exato, sem reparo/retry. npm test: 210 testes aprovados, dois novos, zero falhas; transporte simulado.
- [ ] Usuário reexecutar M03 para avaliar obediência ao piso de tempo e finalmente medir o caminho com hourly_rate_brl 0. O resultado real anterior falhou antes do cálculo; teste simulado não é essa medição, e uma passagem não garante comportamento consistente.
- [ ] Instrução equivalente em cook isolado: não aplicada para preservar hash/comparabilidade; eventual alteração requer nova autorização.
- [ ] Itens 2–5 deste conserto: chaves obrigatórias, texto de reason, registro detalhado das cinco chamadas e roteiro final de reexecução. Não iniciados nesta entrega; rubrica humana não preenchida.

Novo SYSTEM de compare: sha256:a127aaea802a6650a2c110951d4d4a4e78cddea79346895e937616c804dfd590. As cinco chamadas relatadas pertencem ao SYSTEM anterior (prefixo sha256:5df03242...), não medem esta instrução. O usuário já confirmou aceitação real do Desenho A em M01/M02/M05; a pendência de aceitação nas seções históricas abaixo foi superada por esse relato. Não confundir aceitação do schema com qualidade dos resultados.

Schema, contratos, cálculos, omissão do valor da hora, ERRORS e configurações intactos. Sem chamada real do agente, dependência, deploy ou flag ligada. Etapas 3/4/5 de produto não iniciadas. Integração não reexecutada neste item, pois não houve alteração de rota/banco; os 38 cenários anteriores são evidência histórica.

## Conserto do schema compare — Item 3

- [x] Implementar desenho A aprovado: sem anyOf, campos obrigatórios/anuláveis no transporte e normalização somente em validateGenerationOutput, com saída canônica idêntica.
- [x] Ajustar apenas instruções de formato de compare após autorização explícita; preservar hash de cook/ready, entrada, omissão de hourly_rate_brl e cálculos em código.
- [x] Executar 208 testes Node e 38 cenários de integração local com Groq simulada: sete testes novos, regressão de anyOf, corpo 400 literal como PROVIDER_REJECTED_REQUEST, normalização, rejeições e cálculos preservados.
- [x] Item 4 documental: registrar M01 relatado pelo usuário como schema rejeitado antes da geração, com erro literal, hash anterior, usage não reportado e rubrica em branco; preparar uma reexecução de M01 com o código corrigido. 208 testes Node executados/aprovados, sem mudança de código.
- [ ] Usuário executar a reexecução preparada de M01 e trazer bruto/record para conferir aceitação técnica e separar revisão de qualidade.
- [ ] Verificar aceitação do novo schema em chamada real do usuário; testes locais não comprovam aceitação nem qualidade.

Detalhes atuais em [COMPARE-PROVIDER.md](COMPARE-PROVIDER.md). Sem chamada real do agente, deploy, flag ligada, dependência nova ou avanço de produto. Seções seguintes preservam os estados das entregas anteriores.

## Compare — Fase 4 concluída localmente; revisão real pendente

- [x] Acrescentar fixture própria M01–M06 e seleção individual no avaliador; listagem sem rede e lote --all limitado aos dez C01–C10, sem alterar E01–E08.
- [x] Registrar comparison calculado pelo módulo existente somente após sucesso do adaptador; manter bruto antes da validação, diagnósticos independentes, hash efetivamente enviado e rubrica null. Expectativas separadas por lado, sem julgar qualidade automaticamente.
- [x] Executar 201 testes Node (dez novos), aprovados com Groq simulada: seleção, envio único, cálculos, falhas, ausência de sugestões e arquivos de avaliação.
- Roteiro e rubrica 2/1/0 documentados em [GROQ-TESTING.md](GROQ-TESTING.md): M01 → M04 → M05 primeiro (três chamadas); depois M06 → M02 → M03 (mais três). Documento não equivale a execução.
- [ ] Usuário executar os casos escolhidos e verificar aceitação real do schema, consumo e qualidade do novo prompt compare. Registrar caminhos não exercitados, sem forçar preço ou repetir automaticamente.
- [ ] Usuário preencher rubric_verdict e notas por lado; nenhuma nota ou resultado real foi preenchido pelo agente.

Compare conta como uma tentativa de geração, não duas. CLI de avaliação chama a Groq diretamente e não passa pela cota do aplicativo. Nenhuma rota/banco mudou nesta fase; integração não reexecutada (38 cenários são resultado anterior da Fase 3). Prompts, schemas, matemática, ERRORS, cotas, flags false e política vazia preservados. Sem interface, histórico de produto, deploy ou avanço das etapas 3/4/5 de produto. As seções abaixo registram entregas históricas.

Atualizado em 2026-09-11. Marcar apenas funcionalidades implementadas e verificadas. Configuração ou decisão documentada não significa funcionalidade pronta.

## Compare — Fase 3 concluída localmente

- [x] Implementar schema meal_compare_v1 estrito com lados obrigatórios, status fechados e preço opcional por ramos anyOf; manter UNIT_CHOICES como fonte única. Exceção de limites locais expressamente aprovada; [folgas documentadas/testadas](COMPARE-PROVIDER.md).
- [x] Compor SYSTEM por modo sem duplicar regras comuns nem alterar o texto/hash enviado por cook/ready. Compare recebe instruções próprias de forma/recusa/preço, sem contas pela IA.
- [x] Remover as duas guardas temporárias; uma chamada/uma reserva para compare. Omitir hourly_rate_brl do pedido ao provedor e calcular comparison na rota somente após a resposta validada, separado de data.
- [x] Executar 191 testes Node e 38 cenários de integração local, aprovados, todos com Groq simulada. Preservar ERRORS, cortesia, schemas antigos, flags desligadas e política vazia.
- [ ] Fase 4: fixture própria, rubrica e plano de chamadas reais de compare; não criada nesta entrega.
- [ ] Usuário verificar aceitação real do schema, qualidade e consumo de compare. Testes simulados não encerram essas pendências.

Backend preparado localmente, não demo publicada/ativada. Nenhuma dependência, retry, estorno, migração remota, push ou interface. Etapas 3/4/5 de produto não iniciadas. As seções de Fases 1/2 abaixo preservam seus estados históricos; o bloqueio temporário foi substituído apenas nesta fase.

## Compare — Fase 2 concluída localmente

- [x] Implementar módulo puro calculateTimeCost/calculateComparison separado da IA, com validação da entrada e de toda a saída compare antes de calcular. Sem rede, persistência ou conexão com a rota/adaptador.
- [x] Identificar minutos/preço como estimados e hora como informada; custo e diferença como calculados com based_on_estimates e fontes transitivas explícitas. Ausência fica indisponível, nunca zero presumido.
- [x] Calcular diferença parcial aprovada (preço ready menos custo do tempo cook), cruzando até quatro pares, sem vencedor, com exclusão explícita de ingredientes/taxas desconhecidas e sem alegar economia total.
- [x] Testar centavos, arredondamento, zero matemático, ausência/zero de hora, limites, sinais, pares parciais, lados sem sugestão e imutabilidade. npm test: 182 aprovados, 16 novos.
- [ ] Fase 3: adaptador, SYSTEM por modo e schema compare, somente após aprovação. Guardas temporárias da rota/adaptador mantidas.
- [ ] Fase 4: suíte própria de avaliação e rubrica; revisão real pelo usuário. Nenhuma medição ou nota humana preenchida nesta fase.

Interpretação limitada aprovada expressamente pelo usuário, sem mudar o contrato da Fase 1: receita ainda exige ao menos um minuto; zero só é aceito no cálculo isolado. Regras em [COMPARISON-CALCULATIONS.md](COMPARISON-CALCULATIONS.md). Integração não reexecutada: rotas/banco não foram alterados. Etapas 3/4/5 de produto não iniciadas; flags, política, cortesia e recusa preservadas.

## Compare — Fase 1 concluída localmente

Decisões aprovadas: Desenho A (status por lado, ambos sem opção são saída válida), uma a duas alternativas por lado e SYSTEM por modo a implementar na Fase 3. Parâmetros de 4.096 preservados, sem calibração ou flag.

- [x] Contrato de entrada compare com os campos de cook e validateCookingConstraints reutilizada; hourly_rate_brl opcional, 0–100.000 reais/hora e até duas casas decimais, sem default. Zero não equivale a omissão.
- [x] Contrato de saída com cook/ready obrigatórios; suggested com 1–2 sugestões ou not_suggested com motivo, sem sugestões fictícias. Mesmas validações de receitas/buscas; preço opcional de ready exige value e origin estimado no próprio dado.
- [x] Bloqueios temporários aprovados: adaptador antes da rede e rota antes da reserva de geração. Integração comprova que quatro compare bloqueados não consomem as três tentativas de cook. Ingress continua limitado.
- [x] Executar 166 testes Node e 34 cenários de integração local, todos aprovados, Groq simulada. Preservar SYSTEM/schema de cook/ready, recusa por lista vazia, ERRORS e cortesia.
- [ ] Fase 2: cálculos puros e origem dos resultados, somente após aprovação. Nenhum cálculo ou escolha de vencedor implementado.
- [ ] Fase 3: adaptador, SYSTEM por modo e schema compare; remover/substituir as duas guardas temporárias na mesma entrega autorizada, sem ligar flags.
- [ ] Fase 4: suíte própria de avaliação, rubrica e documentação final do fluxo compare; execução real pelo usuário segue pendente.

Contrato detalhado em [GENERATION-CONTRACT.md](GENERATION-CONTRACT.md). A Fase 1 não é compare funcional/publicado. Etapas 3 (histórico), 4 (interface/PWA) e 5 (testar/publicar) de produto continuam não iniciadas. As seções anteriores abaixo são histórico, não bloqueio atual por ausência de medições.

## Unidades após reverificação — Itens 2–4: proposta, registros e próximo teste

- [x] Item 2: entregar [proposta de alinhamento](SCHEMA-ALIGNMENT-PROPOSAL.md), sem escolher/implementar alternativa. Consulta oficial não confirmou suporte a minLength/maxLength/minItems/maxItems no strict da Groq; não tratar como suportados nem como rejeitados. Comparados diagnóstico, tokens, tentativa e consequência para cortesia futura.
- [x] Item 3: registrar as oito chamadas reais relatadas nas rodadas 2/3 em [GROQ-TESTING.md](GROQ-TESTING.md), com prefixo de hash fornecido, tokens null preservados, defeitos/intermitência e rubrica/notas humanas em branco nas três rodadas. Registros relatados pelo usuário, não novas execuções pelo agente.
- [x] Item 4: preparar [roteiro de unidades](UNITS-RETEST.md): C05 três vezes e C10 uma vez, que também usa suggest. Amostra inicial, não prova de eliminação do defeito.
- [ ] Usuário decidir a proposta de schema; se o caminho depender de operadores, confirmar suporte antes de autorizar implementação. Mínimo de sugestões não pode resolver/alterar silenciosamente a divergência de recusa.
- [ ] Usuário executar a nova reverificação de unidades e preencher rubrica/notas. Rodadas de prefixo 178b6bb são anteriores ao Item 1 de unidades; não validam seu efeito nem medem seu acréscimo de tokens.
- C01 incompleto e incoerência de tempo/ingredientes em C10 continuam observados, não corrigidos. Cortesia B continua planejada e com elegibilidade intacta; compare, flags e QUOTA_POLICY_JSON sem mudança. Etapas 3 (histórico), 4 (interface) e 5 (publicação) de produto não iniciadas.
- Entrega conjunta documental autorizada pelo pedido “item 2 ao 4 agora”. Os estados de entregas anteriores abaixo são históricos; as seis reexecuções anteriores agora têm relato registrado, sem equivaler a aprovação geral ou verificação do endpoint publicado.

Verificação desta entrega documental: npm test executado, 147 testes aprovados, zero falhas. Sem testes novos ou chamadas reais; integração não reexecutada porque código/runtime não mudaram. Código, testes, configurações, contrato de geração e ERROR-BUDGET preservados por comparação de hashes.

## Unidades após reverificação — Item 1: fonte única e informação de formato

- [x] Exportar UNIT_CHOICES congelada no contrato e derivar dela validador, enum do JSON Schema e lista explícita no SYSTEM, mantendo as nove unidades anteriores. Informar identificadores exatos, sem tradução/variação de caixa, e proibir passos vazios ou só espaços. Quatro testes novos verificam sincronia, vínculo à fonte, rejeições e instrução enviada; 147 testes Node e 33 cenários de integração local aprovados com Groq simulada.
- [ ] Reverificar as novas instruções por execução do usuário, no plano do Item 4 deste pedido. Testes locais não comprovam correção do C05 intermitente nem coerência de receitas. Estimativa de tokens e limites em [ROADMAP.md](ROADMAP.md).
- Nenhuma nova regra de julgamento, mudança de elegibilidade da cortesia/recusa, calibração, flag ou compare. A proposta de alinhar schema (Item 2), o registro das rodadas 2/3 (Item 3) e o roteiro de reexecução (Item 4) não foram adiantados. Etapas de histórico/interface/publicação continuam não iniciadas.

## Correções após medição — Item 4: versão e roteiro de reverificação

- [x] Registrar request_settings.system_prompt_version como SHA-256 do SYSTEM efetivamente enviado em cada avaliação local, inclusive falhas; sem mudança de prompt, API ou dependência. Quatro testes novos; 143 testes Node aprovados. Integração não reexecutada neste item, pois nenhuma rota/banco ou código de produto mudou.
- Identificada a rodada de 18 chamadas como anterior/legacy-unversioned, sem inventar hash retroativo. Roteiro e critérios em [GROQ-TESTING.md](GROQ-TESTING.md): E06, C01, C05, C10, E05 e C07, uma chamada por ação do usuário; controles adicionais separados. Preparação dos quatro itens de correção entregue, não verificação real da qualidade.
- [ ] Usuário executar/revisar a nova rodada e registrar versão, parâmetros, consumo, vereditos e condições não exercitadas. Amostra pequena e modelo não determinístico não comprovam correção geral; não misturar resultados de prompts diferentes. Sem chamada real, publicação ou avanço de histórico/interface/PWA neste item.

## Correções após medição — Item 3: rejeição do JSON pelo provedor

- [x] Separar HTTP 400/error.code json_validate_failed como PROVIDER_SCHEMA_REJECTED/502; preservar rejeições genéricas e tornar sua mensagem neutra para texto/imagem. Leitura limitada, mensagens sanitizadas, uso indisponível e reserva preservada verificados: 139 testes Node (oito novos) e 33 cenários locais de integração (cinco novos), todos com Groq simulada.
- Novo código explicitamente não elegível à cortesia, sem alias para INVALID_OUTPUT nem concessão por status HTTP; regra documentada em [ERROR-BUDGET.md](ERROR-BUDGET.md). B continua não implementada, sem teste de resgate fictício. Prompts, contratos, esquema, validadores e divergência de lista vazia preservados.
- [ ] Reverificar o novo diagnóstico com execução real do usuário no plano do Item 4. Nenhuma chamada real nesta correção, versionamento implementado ou etapa de histórico/interface/publicação iniciada.

## Correções após medição — Item 2: instrução de zero louça

- [x] Explicitar no SYSTEM que max_dishes 0 não permite sujar peças reutilizáveis e que consumir o alimento como está (descascar, abrir ou servir direto) pode atender ao pedido; banana ao natural como exemplo. Zero, por si só, não autoriza recusar. Dois testes novos verificam o envio da instrução e a preservação de INVALID_OUTPUT em lista vazia; 131 testes Node e 28 cenários locais de integração aprovados, todos com Groq simulada.
- [ ] Reverificar E06 com o prompt alterado, por ação do usuário no plano de reexecução do Item 4; não há nova medição ou aprovação semântica. Faixa 0–20, contrato, documento de contrato e testes de validação preservados. Itens 3 e 4 das correções não iniciados, nem as etapas de histórico/interface/publicação.

## Correções após medição — somente Item 1 entregue

- [x] Acrescentar ao SYSTEM instruções de receita inteira desde o início, passos sem prefixo numérico, ingredientes dos passos listados com quantidade inclusive em suggest, tempo de hidratação/dessalga/cozimento de crus, nomes reais de alimentos e proibição de substituir utensílio por mãos/dedos para caber na louça. Seis testes novos verificam instruções enviadas/preservação da resposta; 129 testes Node e 28 cenários de integração local aprovados, com Groq simulada.
- [ ] Reverificar o cumprimento real das novas instruções por execução do usuário; a rodada anterior não mede este prompt alterado. Não confundir presença do texto nos testes com obediência da IA. A versão de prompt e a seleção de reexecuções pertencem ao Item 4 do pedido de correções.
- Consolidado das 18 chamadas, acertos A1–A7, achados F1–F9 e decisões D1–D4 fornecidos pelo usuário registrados em [GROQ-TESTING.md](GROQ-TESTING.md), sem notas de rubrica inventadas. Decisão de 4.096 mantida; compare não implementado. Estimativa de entrada adicional e suas limitações em [ROADMAP.md](ROADMAP.md).
- Itens 2, 3 e 4 deste pedido não executados: instrução de zero, novo mapeamento de erro e versionamento/reverificação formal continuam separados. Contrato, esquema, validadores, recusa, elegibilidade de cortesia, flags e política intactos. Nenhuma etapa 3/4/5 de produto iniciada.

## Retomada do Item 4 — instrumento pronto, avaliação real pendente

- [x] Preparar oito casos individuais E01–E08 de equipamento/louça e seleção no avaliador existente, mantendo C01–C10 e seu lote intactos. Sete testes novos e 123 testes totais aprovados, todos sem Groq real. Rubrica e execução em [EQUIPMENT-REVIEW.md](EQUIPMENT-REVIEW.md).
- A tarefa existente de verificar cumprimento real permanece desmarcada: o usuário ainda precisa executar os casos com sua chave privada e revisar as respostas. Contrato de entrada/saída, prompt, recusa e cotas não foram alterados; não há contagem semântica garantida. Item 5 não iniciado nesta retomada, nem as etapas 3, 4 e 5 de produto.

## Como priorizar — Item 8

[Caminho crítico](CRITICAL-PATH.md): M1 é o primeiro teste controlado por texto no celular (medir geração → calibrar política → interface ligada à sessão/API → preview verificado → refeição e limite reais). M2 é a demo PWA combinada, que ainda exige histórico/exclusão, fotos, interface completa e validação/publicação. Fora de M1 não significa retirado do escopo.

Esta é uma classificação documental das tarefas abaixo; nenhuma etapa de produto foi concluída ou reescrita. 116 testes existentes aprovados não comprovam os marcos reais. Após aprovar esta entrega, retomar as pendências de 4 e 5, um item por vez, conforme a ordem já solicitada.

## Fundação concluída

- [x] Repositório público independente no GitHub, branch main.
- [x] README com objetivo, arquitetura e estado real do projeto.
- [x] Nome Refeição Fácil e logo no README.
- [x] Origem da identidade e prompts documentados; versão anterior preservada.
- [x] Wrangler 4.129.0 instalado e versões fixadas em package-lock.json.
- [x] Configuração local de Pages Functions e D1.
- [x] Esquema inicial com cinco tabelas aplicado no D1 local.
- [x] Rota health que informa fundação, sem geração disponível.
- [x] Rota generate bloqueada com 503, sem chamadas à IA.
- [x] Arquivos de segredos e banco local excluídos do Git.
- [x] Verificações automáticas de sintaxe, testes, build e migração local.
- [x] Três primeiros commits verificados com sucesso pelo GitHub Actions.

Evidência mais recente desta revisão: [verificação do commit f982530](https://github.com/ReneGFN/planejador-refeicoes-ia/actions/runs/34048342668).

## Configuração na nuvem

- [x] Autenticar Cloudflare; plano Free confirmado pelo usuário no painel em 2026-09-08 (consulta de assinatura por MCP sem permissão).
- [x] Conectar Pages ao GitHub e configurar publicação: commit da4cf9b publicado com sucesso; página e /api/health retornam 200, geração retorna 503 NOT_READY.
- [x] Criar D1 remoto de demo e preview e aplicar 0001_initial.sql em ambos.
- [x] Confirmar binding DB de produção apontando para o banco da demo na publicação.
- [ ] Publicar e verificar preview: configuração separada está no Git, mas ainda não aplicada/verificada em uma publicação de preview.
- [ ] Separar dados e segredos de produção e testes.
- [x] Configurar GROQ_API_KEY como segredo de produção (metadados conferidos, valor não exposto).
- [ ] Conferir acesso ao modelo e cotas reais na conta Groq.
- [x] Gerar segredos de sessão e de pseudonimização de IP em produção; ainda não usados pelo aplicativo.

## Geração real e controles

- Item 7: B escolhida para a demo PWA, que não informa calorias ou valores nutricionais. A fica registrada para a futura fase do aplicativo, fora da demo; requisitos em [CALORIE-OPTIONS.md](CALORIE-OPTIONS.md). Retirada apenas a promessa nutricional, sem marcar funcionalidade como concluída.
- [ ] Na futura fase do aplicativo, retomar A: fonte nutricional real, correspondência revisada, quantidades/preparo e cálculo em código. Não completar lacunas com IA; não implementar na demo PWA.
- [x] Item 6: instrumento local de upload/assinatura/base64 para 0,5, 2 e 5 MiB, com tempo e pico RSS do processo, verificado por cinco testes novos e execução dedicada. Não mede o Free; aviso pré-envio preparado apenas em prosa. Ver [IMAGE-PATH-MEASUREMENT.md](IMAGE-PATH-MEASUREMENT.md).
- Retomada solicitada após finalizar o Item 8: pendências do Item 4 (cumprimento real de equipamento/louça e limites da validação) e do Item 5 (implementação da opção B e parâmetros técnicos pendentes). Não executar antes, não refazer o que já foi entregue e não ativar regras ou chamadas reais automaticamente.
- Item 5: opção B escolhida pelo usuário em [ERROR-BUDGET.md](ERROR-BUDGET.md), ainda sem implementação. Suíte existente executada (111 aprovados); não valida créditos inexistentes.
- [ ] Detalhar e implementar B após definir o contrato técnico de consulta/resgate e os tetos adicionais por rede/globais; alternativa de implementação local desativada aguarda confirmação. Regra escolhida: uma cortesia por visitante/dia UTC após as três tentativas comuns, por INVALID_OUTPUT/TRUNCATED/TIMEOUT, sem estorno ou encadeamento. Nenhum crédito ou retry implementado; não depende de histórico para conceder outra tentativa.
- [x] Item 4: validar `equipment`, `avoid_equipment` e `max_dishes` opcionais somente em `cook`, com enum, duplicatas, conflitos, faixa e cópia sem mutação; encaminhamento ao prompt verificado por 13 novos testes Node e três cenários de integração. Sem alteração do contrato de saída ou da frase de recusa.
- [ ] Verificar cumprimento real das restrições de equipamento/louça nas receitas: por enquanto apenas instruído no prompt, sem contagem confiável na saída ou medição real. Ver docs/GENERATION-CONTRACT.md. O item 3 (`compare`) permanece bloqueado por medições e deverá reutilizar as mesmas regras de entrada; não implementado.
- [x] Item 2: acrescentar motivos enumerados por operação em `/api/health`, mantendo campos atuais, HTTP 200 e no-store; categorias sem segredos, política, banco ou exceção bruta. Verificado com 16 novos testes Node e oito cenários adicionais em workerd/D1 descartável; não consulta D1/Groq nem comprova saúde real. Ver docs/USAGE-FLOW.md.
- [x] Item 1: preparar dez pedidos e instrumento CLI que salva bruto antes da validação, registra tokens/raciocínio e conta primeira falha por campo; verificado com testes simulados em `npm test`. Rubrica e tabela de revisão em docs/GROQ-TESTING.md; nenhuma medição real preenchida.
- [ ] Decidir o canal para pedido inviável após medir a frequência de `refusal_channel` e cruzar contrato/rubrica: (a) canal explícito exige código próprio, mensagem honesta em pt-BR, formato de saída definido e alteração do teste atual que rejeita `suggestions: []`; (b) reforçar o prompt para nunca recusar por lista vazia implica aceitar a orientação de sempre produzir algo, com risco de receita forçada; (c) manter como está implica assumir que lista vazia de recusa vira 502. Nenhuma opção escolhida; frequência ainda não existe. Contrato, testes existentes e prompt intactos no item 1.
- [x] Formalizar contrato de entrada/saída e implementar validadores testados para uso no servidor; ver docs/GENERATION-CONTRACT.md.
- [x] Preparar adaptador Groq com validação de entrada/saída, JSON Schema estrito, limite de resposta, timeout e erros sanitizados; testes simulados aprovados.
- [x] Conectar adaptadores às rotas com sessão, origem, limites de corpo, reserva e tratamento de falhas; testado localmente com Groq simulado. Flags públicas continuam desligadas. Ver docs/USAGE-FLOW.md.
- [ ] Verificar integração real do GPT-OSS 20B pela Groq e testar qualidade em português; ver docs/GROQ-TESTING.md.
- [ ] Medir tokens incluindo raciocínio e definir tamanho suficiente das receitas.
- [x] Implementar três tentativas de geração por visitante/dia UTC; verificar concorrência local (12 pedidos simultâneos, só 3 chamadas simuladas).
- [ ] Calibrar teto global provisório de 80 com consumo real e margem.
- [x] Implementar controles por rede/dia/minuto e pseudonimização diária; calibrar tolerância de redes compartilhadas antes de publicar.
- [x] Reservar cotas atomicamente com migração 0002, triggers e recibos de idempotência; testar rollback, erros e reenvios. Sem migração remota nesta etapa.
- [x] Retornar erros de limite/indisponibilidade em pt-BR, sem falso sucesso ou retry da IA; interface dessas mensagens ainda pendente.
- [ ] Calibrar QUOTA_POLICY_JSON com limites reais, orçamento de tokens e margem; atualmente vazio e bloqueante. Validar CPU/memória e observabilidade antes da liberação.

## Histórico e privacidade

- [x] Implementar base interna de sessão anônima: token aleatório, HMAC no D1, cookie protegido, origem e expiração; nove testes Node e sete cenários Workers/D1 locais. Sem endpoint público. Ver docs/SESSIONS.md.
- [x] Ligar sessão à autenticação das rotas locais; não aceitar ID de visitante do corpo como autoridade. Isolamento de gravação/replay de planos testado no Item 1; demais registros ainda pendentes.
- [x] Proteger tentativas de sessão por rede/global, com idempotência; cookies somente em Set-Cookie e respostas no-store.
- [ ] Integrar cookie à interface e validar comportamento num navegador real.
- [ ] Implementar exclusão/limpeza física e elaborar recuperação antes de liberar histórico; retenção lógica aprovada até o fim dos 30 dias absolutos da sessão, sem renovação automática.
- [x] Salvar planos e recuperar por replay autenticado da chave, com prazo absoluto. Sem interface ou listagem geral.
- [x] Salvar/recuperar preferências por HTTP e função, com opt-in desligado, isolamento e testes executados no Item 2.
- [ ] Oferecer preferências e navegação do histórico na interface futura.
- [x] Implementar limpeza limitada de contadores/recibos expirados durante tráfego; não é limpeza agendada nem remoção imediata.
- [ ] Implementar exclusão de histórico e dados do visitante, sem reiniciar contadores de abuso.
- [ ] Informar limitações da demo e evitar coleta de condições médicas/alergias.

### Diário alimentar e personalização — planejados

- [x] Registrar decisão de incluir diário opcional e sugestões pelo histórico na demo; detalhes em docs/ROADMAP.md. Sem implementação nesta atualização.
- [ ] Definir contrato de consumo para `meal_logs`, com refeição, data/hora e vínculo opcional ao plano; não confundir geração com consumo.
- [ ] Implementar “Comi isso” e registro manual, inclusive delivery, sem exigir diário completo para usar o app.
- [ ] Consultar, editar e excluir registros; impedir duplicação por reenvio e testar isolamento por visitante.
- [ ] Implementar opção “Usar meu histórico nas sugestões” em Configurações → Personalização, desligada por padrão, alterável a qualquer momento e salva por visitante, com explicação do envio de contexto limitado ao Groq.
- [x] Testar no backend ativação/desativação/reativação, persistência, falha de salvamento e leitura no servidor; desligar não apaga diário nem desfaz chamadas já enviadas. UI ainda pendente.
- [x] Selecionar histórico recente com tetos de caracteres/registros para cook/ready, preservando pedido atual e sem compare. Consumo real dos 600 tokens continua pendente; registro de refeições ainda não implementado.
- [ ] Testar personalização desativada, histórico vazio, correções/exclusões e sugestões de variedade sem diagnóstico nutricional ou inferência de que consumo significa preferência.
- [ ] Manter sugestões de delivery como pratos/termos de busca, sem alegações de catálogo, preço ou disponibilidade real.

## Ingredientes por foto — primeiro PWA

- [x] Registrar escopo: digitação, câmera/galeria ou combinação, somente em Cozinhar; lista editável preservada ao trocar de opção.
- [x] Documentar contrato visual v1 e sua ligação ao contrato de refeições; ver docs/IMAGE-ANALYSIS-CONTRACT.md.
- [x] Implementar e testar validação/parser da resposta visual: estados, limites, duplicatas, Unicode, campos extras e JSON inválido. Testes locais, sem reconhecimento real.
- [x] Implementar e testar função de mescla das listas confirmadas, sem mutação nem truncamento silencioso. Ainda não ligada à interface.
- [x] Implementar pré-verificação local de arquivo não vazio, tamanho e MIME declarado. Não equivale à validação real da imagem.
- [x] Implementar leitura limitada do upload multipart, cancelamento/prazo, parte única, verificação inicial de assinatura e MIME. Sem endpoint público.
- [x] Adotar fluxo simplificado da demo: enviar original sem decodificação, redimensionamento, compactação ou remoção de metadados no Worker; registrar limitações e revisão futura.
- [x] Preparar adaptador Qwen com base64, JSON mode, validação de resposta e transporte compartilhado com GPT-OSS; testes locais com respostas simuladas.
- [x] Registrar primeira chamada visual real executada pelo usuário: 2.104 tokens, 1.003 ms no adaptador, dois falsos positivos relatados; não equivale a precisão geral medida.
- [x] Reforçar prompt para nomes pt-BR e omissão de itens sem evidência; padronizar caixa/espaços no adaptador com testes. Idioma/reconhecimento não são garantidos pela validação estrutural.
- [ ] Retestar prompt revisado com a mesma foto e outras imagens, comparando falsos positivos, omissões, idioma e consumo. Adiado a pedido do usuário; não bloqueia o trabalho local de sessões/cotas.
- [ ] Medir CPU/memória do fluxo completo e testar tamanhos reais antes de afirmar que cabe em 10 ms; considerar o crescimento do payload em base64.
- [ ] Integrar e testar o candidato Qwen 3.6 27B com fotos reais; confirmar acesso e cotas gratuitas na conta.
- [ ] Implementar seleção de câmera/galeria, prévia e envio explícito; negar permissão não deve impedir digitação.
- [ ] Confirmar e editar ingredientes reconhecidos, mesclando sem duplicatas e sem apagar o rascunho.
- [x] Separar contadores de fotos e refeições, com reserva atômica e limites por minuto/dia; mudança de modelo não reinicia cotas.
- [ ] Calibrar tetos individuais/globais de fotos e tokens com evidência real antes de habilitar VISION_ENABLED.
- [ ] Informar envio ao Groq, verificar retenção do provedor e impedir persistência de fotos em D1, logs, cache e histórico do app.
- [ ] Testar no celular a jornada completa por foto e por texto; limite de visão não deve bloquear digitação quando a cota de refeições permitir.

## Experiência e PWA

- [x] Aprovar direção UX/UI: Shop e Klarna, verde-musgo/off-white e painel compacto/expandido; decisão documentada em docs/brand/README.md.
- [ ] Implementar e testar painel inferior arrastável, rascunho persistente e exploração do fundo no modo compacto.
- [ ] Criar interface móvel com identidade Refeição Fácil.
- [ ] Fluxos cozinhar e pedir pronto com formulário guiado e texto opcional de 400 caracteres.
- [ ] Receitas, porções, preparo e compras consolidadas.
- [ ] Tempo e custo estimados.
- [ ] Distinguir gasto informado de custo estimado.
- [ ] Registro de consumo separado do planejamento.
- [ ] Resumos semanais/mensais limitados às refeições registradas.
- [ ] Cartão bonito com prévia, campos opcionais e exportação local.
- [ ] Manifesto, ícones instaláveis e estratégia de cache/offline.
- [ ] Estados de carregamento, vazio, erro e acessibilidade.
- [ ] Testar fluxo completo no celular, incluindo histórico, limite e exclusão.
- [ ] Publicar link funcional da demo no README.

## Etapa posterior

- [ ] Antes do lançamento real: revisar remoção de EXIF/GPS, orientação, transformação/limites de pixels e formatos, política de retenção e privacidade.
- [ ] Antes do lançamento real: revisão aprofundada de segurança, testes de abuso/concorrência, gestão e rotação de segredos, monitoramento e dependências. Isso não substitui os controles básicos já exigidos na demo.

- [ ] Avaliar Apple Health/HealthKit, Android Health Connect, Samsung Health e Google Health API; validar permissões, cobertura nutricional, privacidade e sincronização sem duplicatas. Fora da demo.
- [ ] Avaliar widgets nativos personalizáveis e opção premium na futura fase mobile; fora da demo PWA. Ver proposta em [ROADMAP.md](ROADMAP.md#ideia-futura-widgets-personalizáveis).
- [ ] Preparar demonstração de e-mail semanal; envio real e automação permanecem fora da primeira versão acordada.

## Manutenção identificada

- [ ] Atualizar actions/checkout e actions/setup-node para versões com runtime atual, validando compatibilidade. Os checks passaram, mas o primeiro run registrou aviso de depreciação do runtime Node 20 dessas actions. Isso é separado do Node 22 usado pelo projeto.

Próxima etapa de produto: persistência, consulta e exclusão de preferências/planos; depois diário e personalização autorizada. O caminho sessão → validação → reserva → provedor → resposta está integrado e testado localmente com IA simulada (64 testes Node e 17 cenários de integração). Não equivale à liberação pública: política definitiva, testes reais/CPU, navegador, observabilidade e migração/implantação em preview continuam pendentes. Reteste visual adiado pelo usuário.
