# Exclusão do histórico — Item 6

Implementação local da exclusão solicitada pelo visitante. Sem interface, ativação, migração remota, IA real ou publicação. **A limpeza automática por prazo ainda não está implementada**; não confundir remoção solicitada com expiração de acesso.

## O que apaga e o que permanece

| Dados do visitante autenticado | Efeito da ação | Por quê |
|---|---|---|
| plans, inclusive pedido/saída e plano-recusa | remover linhas | Conteúdo de produto solicitado para exclusão. |
| preferences | remover linha | Permissões retornam ao padrão desligado; defaults deixam de existir. |
| meal_logs, inclusive instantâneos | remover linhas | Excluir consumo e conteúdo copiado do plano. |
| pantry_items | remover linhas | Excluir alimentos/quantidades/datas cadastrados. |
| visitors | manter identidade/prazo, incrementar history_revision | Não criar sessão/cota nova; bloquear gravações anteriores. |
| usage_buckets e usage_reservations | preservar | Exclusão não devolve tentativas ou tokens nem apaga bloqueios. |
| meal_log_mutations e pantry_mutations | preservar | Reenvios antigos não recriam consumo/estoque nem repetem baixa. |
| history_deletions | acrescentar recibo técnico, não apagar anteriores | Mesma ação não apaga dados cadastrados depois dela. |
| Outro visitante | nenhuma alteração | Dono vem exclusivamente da sessão autenticada. |

Não há DELETE de visitors: suas cascatas removeriam recibos. A rota nem chama pruneUsage; assim, não limpa recibos expirados como efeito colateral. Ela consome ingress normalmente, gerando seus próprios registros técnicos, mas não reserva geração/visão nem altera seus contadores. Outras rotas mantêm a política anterior de limpeza técnica.

## Contrato HTTP

DELETE /api/history, exportado por functions/api/history.js. Exige HTTPS, Origin exata, Sec-Fetch-Site compatível quando presente, sessão válida e Idempotency-Key UUID v4. Query, dono/revisão no corpo e campos extras são rejeitados. Corpo JSON com até 256 bytes:

```json
{ "version": 1, "confirmed": true }
```

Sucesso da ação inicial e de seu reenvio:

```json
{ "data": { "version": 1, "deleted": true } }
```

HTTP 200, Cache-Control no-store; não altera cookie nem renova sessão. deleted descreve a conclusão daquela ação, não que o banco continuará vazio se alguém cadastrar novos dados. Não inclui contagens potencialmente obsoletas nem conteúdo excluído. A mesma chave retorna sucesso sem executar nova exclusão, inclusive se há dados posteriores; outra exclusão intencional exige outra chave.

HISTORY_DELETION_ENABLED começa false nos três ambientes; exige também SESSIONS_ENABLED. Não depende de AI_ENABLED, chave Groq ou flags de diário/despensa/personalização: desligar essas fontes não deve impedir apagar seus dados. Configuração válida de sessão e ingress continua necessária. Chave aqui é de idempotência, não chave de IA.

Erros usam o mapa existente: flag/configuração indisponível 503, sessão ausente/expirada 401, origem proibida 403, corpo/chave inválida 400, conteúdo/tamanho 415/413, ingress 429, falha de banco 503 sanitizado. Nenhum código de erro novo foi inventado.

## Transação e isolamento

A migração 0006_history_deletion.sql acrescenta history_revision em visitors (inteiro técnico, padrão zero) e history_deletions, com chave única por visitante/ação e expiração no fim da sessão. Recibo contém apenas dono técnico, chave derivada, identificador aleatório da tentativa e datas, sem conteúdo alimentar, foto, IP ou chave original.

Uma chamada DB.batch executa recibo, incremento de versão e remoção de diário, planos, preferências e despensa, nessa ordem. Só a tentativa que inseriu o recibo pode modificar algo. Diário vem antes dos planos por causa do vínculo entre eles. Transação falha sem exclusão parcial; o servidor aguarda sua conclusão. Esse comportamento foi exercitado em SQLite e D1 descartável e corresponde ao [contrato de batch do D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

Cada instrução delimita o dono da sessão. Uma inconsistência antiga com diário alheio apontando para plano deste dono bloqueia a exclusão, sem correção automática: remover esse plano acionaria SET NULL no diário alheio. O teste confirma falha sem modificar nenhum dos envolvidos.

Não existe garantia distribuída entre banco e entrega HTTP: se a confirmação se perder, repetir com a mesma chave consulta a conclusão já registrada. Não prometer falha definitiva só porque houve erro de comunicação.

## Gravações em andamento

Uma exclusão bem-sucedida avança a revisão do histórico. Cada escrita captura a revisão interna antes de seu trabalho; sua instrução SQL só grava se ela ainda coincide.

- Geração captura antes de montar contexto/chamar o provedor e leva essa revisão até savePlan.
- Preferências conferem a revisão no INSERT/UPDATE, impedindo reativar consentimento com uma gravação já em andamento.
- Diário, despensa e baixa conferem na inserção do recibo, dentro da mesma transação de sua mutação.

Se a exclusão vencer a corrida, a escrita anterior não repõe produto nem produz recibo de mutação efetivada. Uma geração já chamada pode terminar com 503 e quotaReserved true; não é repetida ou estornada. Seu reenvio enquanto o recibo existir retorna 409 sem plano. Uma nova ação pode cadastrar dados usando a revisão nova e a mesma sessão/cota.

O ponto de corte é a captura da revisão no servidor, não quando alguém abriu o formulário. Não cancela requisições já enviadas ao provedor, conteúdo já recebido/lido ou reenvio com nova ação após exclusão. A UI futura deve descartar respostas antigas e rascunhos locais ao confirmar exclusão. Não há recuperação por undo nesta rota.

## Retenção: pendência explícita

Sessão continua com 30 dias absolutos, sem renovação; recibos de IA continuam no prazo técnico anterior de sete dias. Recibos de mutação e desta exclusão usam o fim da sessão. Não há promessa de idempotência eterna depois de expirar acesso/recibos.

**Ainda falta limpeza física automática de produto após a sessão expirar e a política de limpeza dos novos registros técnicos.** A rota autenticada não resolve isso: depois do prazo ela retorna 401. Implementar manutenção global exige definir execução/autoridade interna e retenção técnica separada, fora de uma sessão ativa, em vez de expor uma rota pública que aceita IDs alheios. Não criei job, agendamento ou executor global implicitamente. Esta pendência continua bloqueando declarar toda a retenção da etapa 3 concluída antes de liberar histórico.

Remoção aqui é das linhas do banco de produto ativo, não uma promessa sobre cópias já exportadas, provedor ou backups. Nenhum dado real do usuário foi apagado nesta entrega: somente fixtures dos bancos descartáveis.

## Verificação e próximos passos

- npm test: 354 aprovados, zero falhas; 21 novos testes.
- npm run test:integration: 99 cenários aprovados, nove novos; workerd/D1 descartáveis e Groq simulada. Primeira tentativa bloqueada pelo sandbox antes dos testes; repetição local autorizada passou.
- Testes incluem quatro produtos, duas sessões, recibos/cotas, idempotência com dados novos, 12 exclusões concorrentes de mesma chave, chaves distintas concorrentes, rollback, sessão/origem/confirmação/flags/ingress, geração em andamento e gravações antigas.
- SYSTEM, schema e contratos de geração, ERRORS, comparison, quota e duração da sessão intactos. Nenhuma dependência nova. A configuração só ganhou HISTORY_DELETION_ENABLED false.
- Migração 0006 executada apenas em testes descartáveis; é pré-requisito para implantar este código, inclusive suas guardas de escrita. Não habilitar o backend sem aplicar as migrações na etapa autorizada.
- Item 7 continua proposta escrita de recuperação, não iniciada. Medição real dos contextos e a limpeza automática acima seguem pendentes.
- Etapa 4: confirmação com lista do que será apagado/preservado, estado apagando, sucesso, erro sem fingir exclusão, preservar chave para reenvio explícito, limpar rascunhos locais/descartar respostas anteriores. Não reiniciar geração ou criar sessão automaticamente para ganhar cota.
- Etapa 5: validar/configurar/migrar/ativar/publicar somente com autorização posterior. Sem UI ou deploy neste item.

Skills workers-best-practices e wrangler orientaram consultas parametrizadas, transação aguardada, configuração desativada e verificação no runtime local.
