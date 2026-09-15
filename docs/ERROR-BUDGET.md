# Item 5 — orçamento de erro do visitante

## Correções após medição — Item 3: rejeição de esquema não dá cortesia

O transporte distingue agora HTTP 400 com `error.code: "json_validate_failed"`: código interno **PROVIDER_SCHEMA_REJECTED**, devolvido pela API como **502**, sem reproduzir `message`, `type`, corpo bruto ou `failed_generation`. Esse erro é upstream: o provedor rejeitou o JSON gerado pelo modelo, não uma entrada já considerada inválida pelo nosso contrato.

**PROVIDER_SCHEMA_REJECTED não é elegível à opção B.** Não é sinônimo de INVALID_OUTPUT em nenhum mapeamento. A elegibilidade escolhida continua exclusivamente pelos códigos INVALID_OUTPUT, TRUNCATED e TIMEOUT registrados pelo servidor em tentativa comum de geração, com os limites já acordados. HTTP 502, isoladamente, não concede crédito. O caso C07 mostrou que uma injeção pode induzir essa rejeição; incluí-la criaria incentivo para provocar falhas e obter tentativa adicional. Isso é uma exclusão deliberada, não promessa de impedir todo abuso dos códigos já elegíveis.

A inspeção do código atual não encontrou concessão/resgate nem elegibilidade codificada por status HTTP: a cortesia continua não implementada. Não foi criada uma função de elegibilidade desconectada do produto só para afirmar que foi testada. Quando B for implementada, seus testes devem rejeitar este novo código mesmo retornando 502; permanece obrigatório usar código registrado pelo servidor, não status HTTP ou alegação do cliente.

Em C07 não veio envelope de uso. Neste caminho `ProviderError.usage` permanece null; a reserva já feita é consumida sem consumo real mensurável, sem estorno e sem retry. Na integração sintética verificamos recibo failed, orçamento reservado preservado, reenvio bloqueado e quarta tentativa comum negada; não afirmamos medir tokens reais ou verificar créditos inexistentes.

HTTP 400 sem diagnóstico identificável e HTTP 413/415/422 continuam PROVIDER_REJECTED_REQUEST/422. Leitura do diagnóstico 400 inválida, excessiva, interrompida ou expirada mantém esse código não elegível; não converte uma rejeição conhecida em TIMEOUT elegível. Sem HTTP de resposta, o timeout original do transporte permanece TIMEOUT, sem mudança na regra escolhida.

Verificação desta correção: 139 testes Node (oito novos) e 33 cenários locais de integração (cinco novos), sempre com Groq simulada. Não houve implementação de B, alteração de seus códigos elegíveis, migração, estorno, chamada real ou mudança de prompts/contratos. As seções abaixo preservam o desenho e o estado das entregas anteriores.

**Retomada agendada na sequência de trabalho, não em automação:** a pedido do usuário, voltar às pendências deste item logo após finalizar o Item 8, junto dos pontos pendentes do Item 4. Até lá, não implementar a cortesia. B permanece escolhida; contrato técnico e tetos adicionais ainda precisam ser definidos. Ver [ROADMAP.md](ROADMAP.md).

Decisão em 2026-09-11: **opção B escolhida pelo usuário; crédito ainda não implementado.** As três tentativas por visitante/dia UTC, reservas, contratos, prompts, flags e política vigente permanecem iguais. Este documento não autoriza nova migração, persistência de produto, interface ou chamada à IA.

## O que o código permite afirmar hoje

- Em [api.js](../src/http/api.js), sessão e entrada são verificadas antes de reservar geração. Falhas nessa fase não gastam tentativa de IA, embora possam gastar o limite de entrada. Depois de reservar, não há estorno nem retry automático.
- Em [quota.js](../src/security/quota.js), `quotaPolicy` exige `generation.visitorDay === 3`. `reserveUsage` cria recibo e os triggers da [migração 0002](../migrations/0002_usage_reservations.sql) verificam/incrementam os contadores juntos. Uma quarta chamada não pode ser liberada apenas acrescentando um campo ao recibo.
- O recibo contém `id`, `operation`, `buckets_json`, `status` e `expires_at`. O estado é apenas `reserved`, `succeeded` ou `failed`. Não há motivo de erro, elegibilidade, concessão, resgate, vínculo com nova tentativa ou conteúdo de receita. O identificador é derivado da operação, visitante autenticado e chave de idempotência; os contadores internos associam a reserva ao visitante/rede/janelas.
- `finishUsage` mantém o orçamento reservado e acrescenta eventual excesso reportado pelo provedor. Não devolve diferença quando o uso reportado é menor. **Reserva é orçamento conservador, não medição do custo real.** Uso desconhecido não comprova consumo zero.
- Se a finalização falhar, o recibo pode continuar `reserved`. Esse estado não prova falha do modelo nem dá direito seguro a crédito. Um `succeeded` tampouco comprova que o celular recebeu a resposta.
- Reenviar a mesma chave retorna 409 sem nova chamada. Não recupera a resposta anterior. Os recibos têm expiração de sete dias e limpeza oportunista; esse prazo não seria a validade de um crédito diário.

### O ajuste necessário à ideia de “erro comprovadamente meu”

Os códigos abaixo provam o tipo de falha observado pelo backend, **não atribuem responsabilidade**:

| Resultado observado | O que sabemos | O que não sabemos |
|---|---|---|
| 502 `INVALID_OUTPUT` | O conteúdo não passou no parser/validador local. | Se foi falha do modelo, pedido adversarial ou recusa correta por pedido inviável. `suggestions: []` também cai aqui. |
| 502 `TRUNCATED` | O provedor informou `finish_reason: length`. | Se o teto é insuficiente em geral ou se aquele pedido provocou uma saída longa. Faltam medições. |
| 504 `TIMEOUT` | O prazo local do transporte terminou. | Se o provedor processou, quantos tokens gastou ou qual componente causou a demora. |

O código sanitizado é devolvido na resposta HTTP, mas **não é salvo no recibo atual**. Não é seguro aceitar um código enviado pelo navegador, uma captura de tela ou apenas `status: failed` como autorização para compensar.

A orientação de recusa por lista vazia continua divergindo do contrato. Este item não a corrige nem cria classificador de recusa. Os campos de avaliação humana do Item 1 não são um serviço de classificação disponível na rota.

## Desenhos avaliados — B escolhida

| Desenho | Benefício | Risco e custo | Dependência da etapa 3: histórico |
|---|---|---|---|
| A — manter três tentativas, sem compensação | Menor complexidade e nenhum consumo adicional por crédito. | Duas falhas após reserva deixam apenas uma tentativa. Não resolve a frustração. | Nenhuma. Regra já existente. |
| B — uma tentativa de cortesia por falha registrada | Recuperação rápida e limitada, acionada pela pessoa. | Pode recompensar falhas induzidas; exige concessão/resgate atômicos e mais capacidade de IA. | Não exige histórico; exige extensão da persistência técnica de cotas, ainda não implementada. |
| C — uma tentativa após revisão do incidente | Exige evidência adicional antes de conceder; menor automatização de abuso. | Trabalho operacional, demora e casos sem evidência suficiente; exige os mesmos controles de resgate de B. | Não exige histórico para revisar incidentes técnicos. Avaliar uma receita passada ou recuperá-la dependeria da etapa 3 e fica fora deste desenho. |

### A — manter a regra atual

Nenhuma tentativa extra, estorno ou repetição. Nova chave significa nova tentativa, ainda sujeita às três diárias. Mantém-se o risco de esgotamento por falhas. A futura interface deve explicar o consumo e distinguir uma ação nova de um reenvio, sem prometer recuperar a resposta.

Risco de abuso específico de compensação: inexistente, pois ela não existe. Continuam possíveis consumo malicioso das cotas e criação de novas sessões/redes. Não é uma declaração de proteção completa contra abuso.

Custo adicional deste desenho: nenhum mecanismo novo de crédito. Interface explicativa pertence à etapa 4 de produto, não a este item.

### B — cortesia limitada, sem afirmar culpa comprovada

**Regra escolhida pelo usuário (B), ainda não implementada**: no máximo um crédito de geração por visitante/dia UTC, originado de uma tentativa comum finalizada com `INVALID_OUTPUT`, `TRUNCATED` ou `TIMEOUT`, com o motivo registrado pelo servidor. Visão, sessão e entrada não geram nem usam esse crédito.

As três tentativas comuns seriam preservadas. O crédito permitiria no máximo uma quarta tentativa, apenas depois de esgotar as três comuns. Não apagaria a falha anterior e não garantiria sucesso. Seria permitido reformular o pedido, pois repetir um pedido inviável pode repetir a falha; todo novo conteúdo passaria pela validação normal. O crédito é vinculado à falha, não à reprodução da mesma receita.

Incluir `INVALID_OUTPUT` nesta opção significa aceitar conscientemente que uma recusa por lista vazia também possa gerar cortesia. Não existe hoje uma distinção confiável na rota. Se isso for inaceitável, será preciso aprovar uma elegibilidade mais restrita ou resolver a classificação em outro pedido; não foi feita nenhuma dessas mudanças.

Risco: uma pessoa pode provocar truncamento ou resposta inválida para buscar a quarta chamada, e sessões/redes novas ainda contornam parte da identidade anônima. Um crédito por recibo **sozinho** não basta: três falhas poderiam gerar três créditos, e créditos que geram créditos formariam uma cadeia. Por isso a proposta combina limite por visitante/dia, fonte comum, nenhuma renovação pela tentativa extra e tetos por rede/globais.

### C — revisão antes da concessão

Mesma unidade de benefício proposta em B (no máximo um crédito, sem cadeia), mas sem elegibilidade automática por código HTTP. O responsável pelo projeto confirmaria um incidente técnico e sua relação com o recibo do visitante usando evidência adicional, como um defeito no processamento após a reserva, reproduzido em teste controlado. Configuração inválida detectada antes da reserva não precisa de compensação de geração. Se não houver evidência suficiente, não se anunciaria “erro comprovado” nem se concederia por esse critério.

Seria necessária uma ação administrativa autenticada, idempotente e auditável, com motivo enumerado e referência técnica ao incidente, além do vínculo com o recibo. Não há ferramenta administrativa pronta nem autorização para editar contadores manualmente. Guardar evidência não deve significar registrar pedidos, receitas, fotos, cookies ou segredos.

Risco: solicitações fraudulentas, concessão duplicada, erro humano e abuso da autoridade administrativa. Aplicam-se as mesmas travas de B; uma concessão manual não deve ignorar tetos globais. O trabalho de revisão pode ser desproporcional para uma demo.

Para manter a proposta simples, o crédito expiraria no fim do dia UTC da falha. Uma revisão tardia poderia chegar sem tempo para uso; transferir créditos para outro dia seria outra regra a aprovar, não um benefício implícito.

## Requisitos para implementar B — compartilhados com a alternativa C

São requisitos de desenho, não campos de API ou SQL implementados:

1. **Registro confiável:** finalizar o recibo com categoria de erro sanitizada e marcar a fonte como tentativa comum ou extra. Concessão única por recibo e por visitante/dia da operação, mesmo se duas falhas terminarem simultaneamente. Recibos antigos sem causa registrada não ganham crédito retroativamente por inferência.
2. **Vínculo e autorização:** ligar a concessão ao recibo original, visitante autenticado, operação e dia UTC; registrar expiração e o recibo da tentativa que a consumiu. A sessão é a autoridade. Um identificador trazido pelo cliente é apenas referência a verificar, não comprovação de propriedade. Como o erro atual não devolve o recibo, seria preciso definir acesso ao estado técnico usando, por exemplo, a chave original e a sessão.
3. **Ação explícita:** consultar crédito não chama a IA. Para usá-lo, a pessoa inicia uma nova ação com nova chave de idempotência. Reenviar a chave original continua sem repetir a IA; repetir a chave da tentativa extra também não faz uma segunda chamada.
4. **Resgate e reserva indivisíveis:** após validar sessão e entrada, conferir crédito disponível, três tentativas comuns usadas e todos os demais limites; consumir crédito, criar recibo novo e reservar tokens/contadores numa única operação transacional. Só chamar a IA após confirmar essa operação. Duas requisições concorrentes não podem consumir o mesmo crédito.
5. **Sem perda antes da reserva:** se entrada, teto global ou reserva falhar, não consumir crédito nem iniciar IA. Depois de confirmada a reserva, uma falha não repõe crédito, não reduz tokens e não gera outro crédito. Se o resultado do commit for incerto, não chamar a IA nem liberar novamente por suposição; consultar/reconciliar estado técnico antes de permitir outra ação.
6. **Sem relaxar o restante:** a exceção seria apenas à franquia comum diária de três, não aos limites de visitante/minuto, rede/dia/minuto, pedidos globais ou tokens. Toda tentativa extra também incrementa contadores reais e reserva seu próprio orçamento. Seria necessário separar contabilização de chamadas e direito à cortesia na política/checagem; o trigger atual rejeita a quarta tentativa. Não basta trocar `visitorDay` por 4, zerar contador ou reaproveitar uma reserva.
7. **Orçamento específico:** além dos tetos atuais, B/C precisam de limites adicionais de concessão/resgate por rede e globais. Os valores dependem de capacidade e frequência de erro ainda não medidas; ficam pendentes e bloqueantes, não ilimitados. Redes compartilhadas podem perder acesso à cortesia; redes novas não devem renovar o crédito do mesmo visitante.
8. **Expiração:** benefício válido somente no dia UTC da falha, sem acumular. Rejeitar crédito expirado independentemente de o registro já ter sido apagado. Conservar marca de uso durante a janela de idempotência; limpeza, troca de modelo ou exclusão de histórico não podem recriar benefício.
9. **Estado incerto:** recibo `reserved`, falha de gravação, desconexão do cliente ou alegação de resposta perdida não concedem crédito automaticamente. O handler atual só verifica cancelamento do cliente antes da reserva; não conecta esse sinal ao transporte do provedor. Interromper a conexão não prova que a IA parou ou que houve erro elegível.
10. **Estado consultável:** B/C exigiriam leitura autenticada do estado técnico da concessão, para não perder o benefício apenas porque a resposta HTTP se perdeu. Isso não recupera receitas e não exige salvá-las. O contrato dessa consulta/resgate ainda precisa ser aprovado e testado; nenhum endpoint foi criado.

Erros antes da reserva não precisam compensar geração. `DUPLICATE_REQUEST`, `LIMIT_REACHED`, `RATE_LIMITED`, `REFUSED`, cancelamento e falhas genéricas não entram automaticamente na lista proposta em B. Um HTTP 502 válido como diagnóstico não basta sem o recibo elegível do próprio visitante. Em C, os três códigos também não substituem a revisão.

### Quanto aumenta o consumo?

Para B/C, no pior caso individual proposto, três chamadas comuns mais uma extra equivalem a quatro chamadas: até um terço a mais que três, **não** uma medição de aumento real. Se `R` for a reserva por geração, a tentativa extra requer mais `R` de orçamento global disponível, mantendo integralmente a reserva da falha anterior. Se houver excesso reportado, a contabilização pode superar a reserva inicial, como hoje.

Com `V` visitantes elegíveis e um teto global diário adicional de `G` resgates, haveria no máximo `min(V, G)` chamadas extras, ainda reduzidas pelos demais limites. Sem aumentar tetos globais, essas chamadas disputam capacidade com tentativas comuns; não são capacidade gratuita adicional. Não há base para fixar `G`, estimar custo monetário ou afirmar que tudo cabe no Free.

## Persistência: o que depende realmente da etapa 3

- **A:** não precisa de nova persistência técnica nem de histórico.
- **B:** precisa estender recibos/contadores técnicos com causa, concessão, uso e vínculos atômicos. Isso exige desenho de esquema, migração e testes futuros; não requer tabelas de planos, preferências, diário ou despensa.
- **C:** precisa do mesmo estado técnico, acrescido da decisão administrativa auditável. Revisão de um incidente técnico não exige histórico alimentar; revisão da qualidade de uma receita passada sem conteúdo disponível não é possível só com recibo.
- **Dependência real da etapa 3 em qualquer opção:** salvar e recuperar a mesma receita após resposta perdida, ou consultar planos passados para avaliar reclamação de conteúdo. Nada disso existe hoje e não será improvisado neste item. Os desenhos B/C concedem outra tentativa; não restauram a refeição anterior.

**B foi escolhida; os valores dos tetos adicionais por rede/globais e o contrato técnico de consulta/resgate permanecem pendentes.** Não há bloqueio artificial pela etapa 3 para um crédito técnico. A escolha não fornece as medições ausentes nem ativa o mecanismo. Preparar implementação local desativada, com configuração ausente bloqueando créditos, é um caminho a confirmar com o usuário antes de executar. Nenhuma tabela ou migração foi criada.

## Critérios de teste para uma implementação futura

Ainda não escritos nem executados como testes de crédito:

- Concessão duplicada, duas falhas simultâneas e múltiplos recibos: no máximo um benefício por visitante/dia.
- Duas tentativas extras concorrentes: uma reserva e uma chamada; repetição da mesma chave sem novo consumo de IA.
- Entrada inválida ou teto de rede/global/tokens: nenhum crédito consumido. Falha transacional: nenhum estado parcial.
- Falha depois da reserva extra: sem estorno ou encadeamento; tokens da original preservados e nova reserva contabilizada.
- Isolamento entre visitantes e operações; recibo sem causa, `reserved`, sucesso, código forjado ou recibo expirado não elegíveis.
- Virada UTC, limpeza e mudança de rede sem recriar crédito; perda de resposta de concessão/resgate sem duplicação.
- Em C, decisão administrativa autenticada, sem concessão dupla nem privilégio para exceder orçamento.

## Entrega deste item

Somente este desenho e notas em CHECKLIST, ROADMAP e USAGE-FLOW, atualizados para registrar a escolha de B. Nenhum código/teste/migração alterado, prompt corrigido ou regra ativada. Nenhuma dependência nova, chamada real, push ou deploy.

`npm test` executado: 111 testes existentes aprovados, zero falhas. Isso verifica a suíte atual, **não** implementa ou comprova o desenho de créditos. `npm run test:integration` não executado neste item documental; nenhuma rota ou banco foi alterado. Os 28 cenários do Item 4 permanecem evidência anterior, não uma nova execução.

Escolha registrada: B, incluindo no máximo uma cortesia por visitante/dia UTC após as três tentativas comuns, pelos códigos INVALID_OUTPUT, TRUNCATED e TIMEOUT registrados pelo servidor; sem acumular, estornar tokens ou gerar outro crédito pela tentativa extra. A inclusão de lista vazia em INVALID_OUTPUT permanece explícita. Pendentes: tetos adicionais por rede/globais e contrato técnico de consulta/resgate; não inventar valores nem anunciar ativação. Item 3 continua bloqueado pelas medições; Item 6 não iniciado. Etapas 3, 4 e 5 de produto intocadas.
