# Diário alimentar — Item 3

Implementado e verificado localmente em 2026-09-12. Este item registra **consumo declarado pela pessoa**, não consumo comprovado, preferência nutricional ou avaliação positiva do prato. Não há interface, IA adicional, baixa de despensa ou ativação pública.

## Decisões e funcionamento

- Gerar, salvar ou selecionar uma sugestão não insere nada em meal_logs. POST exige confirmed_consumed igual a true. Na etapa 4, “Finalizar e registrar refeição” deverá explicar que a pessoa confirma que comeu; cancelar ou permanecer na tela não confirma.
- Registro manual inclui delivery sem exigir plano. Descrição obrigatória de 1 a 400 pontos de código Unicode, usando o limite de texto já exportado em LIMITS; espaços externos são removidos. Não inferir ingredientes a partir desse texto.
- Data/hora obrigatória com segundos e fuso explícito: ISO 8601 no subconjunto aceito pelo contrato, Z ou ±HH:MM e até três casas de milissegundos. Calendário validado em código, incluindo ano bissexto; armazenado em UTC. Datas passadas, inclusive anteriores à criação da sessão, são aceitas. Futuras são rejeitadas porque planejamento não é consumo. Não estimar data pelo horário da geração.
- servings_consumed é opcional, numérico, maior que zero e até 20, inclusive frações. Ausência significa quantidade desconhecida. O rendimento de uma receita para quatro pessoas não vira quatro porções consumidas.
- Consumo de plano identifica plan_id, side (cook/ready) e suggestion_index, base zero. O servidor recupera e valida o plano do dono autenticado; não aceita receita/instantâneo enviado pelo cliente. Em cook/ready, o lado precisa corresponder ao modo. Em compare, só a sugestão selecionada é registrada; not_suggested, índice ausente e plano indisponível são rejeitados. Dois lados recusados não produzem consumo.
- Descrição inicial de uma sugestão é seu título. Instantâneo mínimo preserva lado, título, rendimento e, para cook, a lista estruturada de ingredientes com quantidade/unidade. Não copia passos, comparação, preço, envelope bruto, foto ou diagnóstico do provedor. O instantâneo é a sugestão original, não prova de que todos os ingredientes foram usados.
- Registrar/editar/excluir não lê o modelo nem ativa use_history. O opt-in independente do Item 2 continua obrigatório antes de enviar recorte em uma geração cook/ready. Compare continua sem personalização.

## Rotas e contrato

Todas exigem sessão válida e DIARY_ENABLED=true, além da configuração de ingress. A flag começa false nos três ambientes; AI_ENABLED e chave Groq não são requisitos destas rotas. Em métodos de escrita, exigir origem exata HTTPS e Idempotency-Key UUID v4, normalizada para minúsculas. GET também rejeita origem divergente ou Sec-Fetch-Site diferente de same-origin quando presentes. Respostas usam Cache-Control: no-store.

| Rota | Operação | Resposta nova |
| --- | --- | --- |
| POST /api/meal-logs | Confirmar registro manual ou sugestão | 201 com data: {id, operation: "create", applied: true} |
| GET /api/meal-logs | Listar registros próprios | 200 com data: [...] e next_cursor |
| GET /api/meal-logs/:id | Consultar um registro próprio | 200 com data: {...} |
| PUT /api/meal-logs/:id | Substituir campos editáveis | 200 com data: {id, operation: "update", applied: true} |
| DELETE /api/meal-logs/:id | Excluir só aquele registro | 200 com data: {id, operation: "delete", applied: true} |

Exemplo de corpo manual, com dados fictícios:

```json
{
  "version": 1,
  "source": "manual",
  "description": "Arroz com feijão pedido por delivery",
  "eaten_at": "2026-09-10T19:30:00-03:00",
  "confirmed_consumed": true
}
```

Para sugestão, substituir source por plan_suggestion e description por plan_id, side e suggestion_index; manter version, confirmed_consumed e, somente se informado, servings_consumed. O servidor grava eaten_at no instante da confirmação e usa esse dia UTC para a idempotência; o cliente não envia esse campo. Não enviar visitor_id, snapshot ou steps. Campos desconhecidos são rejeitados. Registros manuais continuam exigindo eaten_at explícito para permitir lançamentos retroativos.

O ID do plano vem do replay já existente: repetir o pedido original válido e sua chave em /api/generate retorna 409 com replay.plan.id, sem nova IA ou reserva de geração, ainda sujeito a ingress. Os testes de integração usam esse caminho. **O 200 da geração não ganhou plan_id**, preservando o contrato congelado. A etapa 4 terá de conservar a chave/pedido original e tratar esse replay para confirmar uma sugestão. Não existe listagem geral de planos neste item.

PUT recebe version: 1, description e eaten_at obrigatórios, além de servings_consumed opcional. É substituição destes campos, não PATCH parcial. Omitir servings_consumed remove a quantidade anteriormente informada; nunca a converte em zero. Origem, índice e instantâneo são preservados. Se a descrição for corrigida, o instantâneo continua sendo o original: não usá-lo futuramente como confirmação automática de ingredientes consumidos. Escritas distintas concorrentes seguem a última atualização efetivada; não há editor colaborativo nem controle de versão para conflito entre edições.

DELETE recebe somente {version: 1}. A listagem aceita limit de 1 a 50 (padrão 20), before e before_id juntos. next_cursor devolve esses dois campos ou null. Ordem: eaten_at decrescente, ID crescente nos empates. Paginação por cursor evita OFFSET crescente, mas não é um retrato congelado durante edições concorrentes; uma nova consulta reflete o estado atual. Consultas com campos desconhecidos, repetidos ou cursor incompleto são rejeitadas.

A leitura devolve id, version, source, description, eaten_at, plan_id ou null, porções se informadas e datas técnicas created_at/updated_at/expires_at; para sugestão, também side, suggestion_index e snapshot. Vínculos de plano são filtrados pelo dono. Corpo, URL e headers não podem escolher visitante: o ID da URL identifica o registro, nunca autentica seu dono.

## Idempotência, falhas e concorrência

A migração 0004 acrescenta datas técnicas e expiração a meal_logs, e cria meal_log_mutations. O recibo técnico contém somente dono interno, hash da chave, operação, ID do registro, identificador aleatório da tentativa e datas. Não guarda descrição, receita ou chave original.

As três mutações compartilham o espaço de chaves do diário, separado da geração/visão. Nova intenção exige nova chave. Reenviar a mesma chave com corpo estruturalmente válido não reaplica a ação, mesmo com texto, método ou destino diferente. Duas refeições iguais, inclusive no mesmo horário, continuam possíveis com chaves novas; não deduplicar pelo texto.

Recibo e alteração são aguardados na mesma transação [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). A chave única e o identificador da tentativa fazem somente o vencedor aplicar a mutação. Condições de existência/dono são conferidas novamente dentro da transação; exclusão concorrente entre leitura e escrita não cria recibo de sucesso sem alteração. Falha SQL aborta ambos. Não há trabalho de confirmação solto após responder.

Reenvio retorna 409 DUPLICATE_REQUEST, quotaReserved: false, receipt: {operation, meal_log_id} e nota para consultar o estado atual. O recibo confirma a ação anterior, não que o conteúdo ainda exista ou permaneça igual. Não há replay de descrição apagada. O mapa ERRORS foi preservado, inclusive sua mensagem comum sobre não chamar IA; a nota adicional explica o diário.

Erros continuam nos códigos existentes: entrada/ID inválido ou registro/plano indisponível gera 400 INVALID_INPUT; ausência/expiração de sessão, 401; origem, 403; formato, 415; corpo excessivo, 413; ingress, 429; flag desligada, 503 NOT_READY; falha de banco ou documento incompatível, 503 SERVICE_UNAVAILABLE. Ausência e objeto alheio têm a mesma resposta para não revelar existência. Não adicionar 404 ou mudar o mapa congelado neste item.

Se a conexão cair depois do commit, a pessoa pode reenviar a mesma chave e consultar o diário; não interpretar ausência de resposta como certeza de falha. Em erro SQL com rollback verificado, a mesma chave pode ser tentada novamente pelo cliente. O servidor não faz retry automático, estorno ou nova chamada de IA.

Toda operação, inclusive GET, erros após autenticação e reenvios, continua sujeita a ingress. Não são criados recibos de geração/visão nem reservados tokens por operar o diário. A tabela técnica nova não é cortesia B nem altera os recibos de cota existentes.

## Retenção e exclusão

Registros e recibos novos recebem expires_at igual ao fim dos 30 dias absolutos da sessão, não 30 dias após cada confirmação. Data retroativa não encurta esse prazo; leitura/edição não renovam a sessão. Os recibos do diário ficam pela duração da sessão, não apenas pelos sete dias dos recibos de IA: apagar uma refeição não deve permitir recriá-la ao reenviar uma confirmação antiga no oitavo dia.

DELETE remove fisicamente somente a linha escolhida de meal_logs. Não apaga plano, preferência, recibo de mutação, recibo de uso ou contador; não afeta outro visitante. A geração seguinte, se autorizada a usar histórico, passa a ver o registro corrigido ou sua ausência. Isso não desfaz conteúdo já enviado ou chamadas em andamento.

Expiração de acesso não é limpeza física. A limpeza de produto/recibos expirados e a exclusão abrangente com proteção contra novas gravações concorrentes permanecem no Item 6. O recibo não tem FK para o registro, para sobreviver à exclusão; tem FK para o visitante técnico. A futura exclusão de produto não deve apagar esse visitante/recibos e liberar ações antigas. Nenhum ID apagado vira refeição recuperável a partir do recibo.

Linhas antigas sem as novas datas permanecem intactas, sem datas inventadas, e não entram na nova leitura/edição do diário. A seleção de contexto do Item 2 não foi alterada: continua lendo sua projeção versionada. As antigas linhas fictícias usadas pelos testes de personalização continuam sendo fixtures, não evidência de registros reais migrados.

## Verificação e limites da entrega

- npm test: 284 aprovados, zero falhas, 26 novos testes. SQLite em memória do próprio Node; aviso de API experimental existente, sem dependência nova.
- npm run test:integration: 66 cenários aprovados, 12 novos, workerd/D1 descartável com quatro migrações e Groq sempre simulada. O empacotador falhou inicialmente por permissão no sandbox; a execução autorizada passou. Nenhuma migração remota.
- Concorrência real do harness: 12 confirmações da mesma chave resultam em 1 criação e 11 respostas 409; atualização/exclusão repetidas também só se aplicam uma vez. Rollback em INSERT/UPDATE/DELETE, recusa de compare, isolamento, confirmação manual e por sugestão, contexto corrigido e ausência de cota de IA verificados.
- Nenhuma mudança em SYSTEM, contratos/schema de geração, comparison, ERRORS, política/reserva, modelo ou dependências. DIARY_ENABLED false em todos os ambientes. Sem deploy, push ou IA real.

Workers best practices orientou operações aguardadas, binding direto e teste de concorrência no runtime. Wrangler orientou preservar a configuração e testar apenas recursos locais com versões instaladas. Referências: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) e [configuração de Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

Pendências da etapa 3: despensa/baixa conservadora (Item 4), validade (5), exclusão abrangente/limpeza (6), proposta de recuperação (7). A medição real do custo do contexto do Item 2 continua pendente; estes testes não medem tokens reais.

Etapa 4: confirmação explícita, registro manual, formulários de edição, confirmação de exclusão, estados vazio/carregando/erro, origem e instantâneo identificados, recuperação do plano via replay, mensagens para sessão expirada/limite/falha/duplicidade. Não anunciar “salvo” ou “excluído” antes da resposta. Nada disso foi desenhado ou implementado.

Etapa 5: ativação, migração/publicação e testes no ambiente de destino continuam não executados. Esta entrega não comprova funcionamento em celular/navegador real, limites de nuvem ou qualidade do modelo. Parar neste Item 3 e aguardar aprovação.
