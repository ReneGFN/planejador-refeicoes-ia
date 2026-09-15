# Histórico — Item 1: persistência e replay

Atualização do Item 6: [exclusão solicitada e proteção contra gravações anteriores](HISTORY-DELETION.md) implementadas. savePlan confere a revisão capturada antes da IA; exclusão não remove recibos/cotas e replay sem plano mantém ausência explícita. Limpeza física automática após expiração ainda pendente. Referências abaixo à falta de exclusão descrevem a entrega original do Item 1.

Implementado e verificado localmente em 2026-09-12. Somente este item: não há listagem geral, preferências, diário, despensa, exclusão de produto ou interface. A geração permanece desativada pelas flags existentes; não houve deploy, migração remota, dependência nova ou chamada real à IA.

## O que fica salvo e por quê

`plans` reutiliza a tabela existente. A migração `0003_plan_history.sql` acrescenta `generation_key` (identificador derivado compartilhado com o recibo) e `expires_at`, com índices por visitante/chave e visitante/expiração. Não há vínculo por chave estrangeira com `usage_reservations`: limpar o recibo não pode apagar a receita. A unicidade por visitante/chave impede sobrescrever o resultado original. Linhas anteriores sem chave/expiração não ganham uma associação inventada e não são elegíveis a replay.

`data_json` contém:

- `version: 1`, `contract_version: 1` e `calculation_version: 1` para controlar a leitura e impedir migração sem decisão explícita;
- `request`: o pedido validado completo, com os opcionais realmente informados;
- `output`: resposta canônica validada de cook, ready ou compare;
- `metadata`: somente modelo, quatro contagens de tokens e tempo decorrido fornecidos pelo adaptador. Valores indisponíveis continuam `null`; esses metadados descrevem a chamada original, não o custo/tempo do replay.

O pedido preserva modo, refeição, pessoas e, quando aplicáveis/informados, tempo, política e lista de ingredientes, equipamentos disponíveis/evitados, limite de louça, orçamento, preferências e valor da hora. Guarda-se a forma validada, não espaços externos do corpo bruto. `equipment: []`, `max_dishes: 0`, hora zero e ausência de opcionais continuam distintos. Ordem de listas e sugestões não é alterada. A hora é guardada para as contas, mas continua omitida do envio à IA pelo adaptador atual.

Não são guardados foto, envelope bruto da Groq, SYSTEM, headers, cookies, segredo, IP, chave original de idempotência, diário ou preferências carregadas de outra fonte. A tabela também mantém ID próprio, dono autenticado, modelo e datas. O plano é apresentado no replay com `status: "draft"`: passar pelo contrato não prova coerência, disponibilidade comercial ou revisão humana. Não foi implementado editor de rascunhos.

Compare pode ter um ou ambos os lados `not_suggested` com `reason`. Isso é um plano válido recuperável, não erro técnico. Cook/ready com lista vazia continuam `502 INVALID_OUTPUT`, sem plano; a divergência de recusa permanece aberta.

## Recalcular comparison

Não armazenar `comparison`. `restorePlan` valida a versão e os dados salvos e executa o mesmo `calculateComparison` usando exclusivamente o pedido e a saída originais. Não consulta preferências atuais nem o modelo. Versão desconhecida ou documento inválido gera `503 SERVICE_UNAVAILABLE`, sem tentar regenerar.

Os testes fazem o percurso objeto → JSON persistido → leitura → recálculo e comparam o objeto inteiro, incluindo `origin`, `based_on_estimates`, `sources`, caminhos/ordem de alternativas e motivos de indisponibilidade. Cobrem hora ausente, zero e com centavos, duas sugestões por lado, preço ausente e recusa de um ou ambos os lados. Mudanças futuras nos validadores/cálculo exigem preservar a leitura v1 ou migração aprovada; o número de versão não implementa compatibilidade futura sozinho.

## Caminho HTTP

`POST /api/generate` continua exigindo mesma origem, sessão, chave UUID v4 e corpo válido. O replay usa a mesma rota e não cria endpoint adicional:

1. Verificar configuração/origem, limpar recibos expirados e aplicar limite de entrada (`ingress`).
2. Validar a chave, autenticar o visitante e validar o pedido. Nenhum `visitor_id` vindo do corpo é aceito.
3. Derivar a mesma identidade usada pelo recibo e consultar plano não expirado com `WHERE visitor_id = ... AND generation_key = ...`.
4. Se houver plano, devolver `409` com replay, sem reserva de geração. Funciona mesmo sem saldo de IA e mesmo depois da limpeza do recibo.
5. Se não houver, tentar a reserva atômica existente. Recibo duplicado causa uma segunda leitura: outro pedido pode ter concluído desde a primeira consulta. Se ainda não houver plano, devolver `409` com ausência explícita. Não esperar, não refazer nem reparar IA.
6. Para ação nova: reservar → chamar IA uma vez → validar → calcular compare quando aplicável → finalizar contabilização técnica → aguardar gravação de plano → responder `200`.

O `200` permanece exatamente no envelope anterior: `data`, `metadata`, `quota` e, em compare, `comparison`. O contrato de geração, schema, SYSTEM, cálculo e mapa ERRORS não foram alterados.

O `409` de geração mantém `code`, `message` e `quotaReserved: false` e acrescenta:

```json
{
  "replay": {
    "available": false,
    "plan": null,
    "message": "Não há plano salvo disponível para este pedido. Nenhuma nova geração foi iniciada."
  }
}
```

Com plano: `available: true`, mensagem `Plano recuperado sem outra chamada à IA.` e `plan` contendo ID, status draft, versões, datas, pedido original, `data`, `metadata` e `comparison` recalculado quando aplicável. HTTP continua **409**, não sucesso fictício de nova geração. A ausência não distingue falha original, processamento ainda em andamento ou futura exclusão. Não expõe recibos internos.

Repetir uma chave com outro corpo **válido** recupera o pedido original, não modifica o plano. Corpo inválido continua 400 antes da consulta. Outra ação exige chave nova e consome cota normalmente; duas ações de mesmo conteúdo podem resultar em planos diferentes. Chaves entre visitantes não compartilham recibo/plano.

Replays de sessão e visão mantêm o comportamento anterior; visão não salva planos ou fotos. Respostas continuam `Cache-Control: no-store`. Não foi criado saldo, fallback sem autenticação ou leitura pública de planos.

## Falhas, contabilização e prazo

`INVALID_OUTPUT`, `TRUNCATED`, `TIMEOUT` e `PROVIDER_SCHEMA_REJECTED` não geram plano. Saída parcialmente aproveitável ou conteúdo de `failed_generation` não é salvo. Não há retry ou estorno. Falha de leitura do banco impede iniciar IA, com erro sanitizado.

Se a contabilização técnica falhar, a rota não chega à gravação. Se a gravação falhar depois da contabilização, retorna `503 SERVICE_UNAVAILABLE` com `quotaReserved: true`; o recibo já pode estar `succeeded`, que indica conclusão técnica da tentativa, **não existência de plano salvo**. O replay consulta `plans`, nunca deduz sucesso pelo estado do recibo. Não há transação distribuída envolvendo o provedor e D1. Se uma escrita confirmar no banco mas sua confirmação se perder, a consulta posterior pode recuperar o que foi efetivamente persistido.

Retenção lógica aprovada: até `expiresAt` da sessão de 30 dias absolutos, não 30 dias após cada receita. Um plano gerado perto do fim da sessão só tem o prazo restante; gravar/ler não renova a sessão. O recibo dura sete dias até limpeza; o plano não depende dele. Depois que não houver plano recuperável nem recibo, não se promete idempotência eterna.

**Expiração de acesso não é exclusão física.** Esta entrega filtra planos expirados e mantém a autenticação com prazo absoluto, mas ainda não implementa limpeza física de produto. A exclusão/limpeza e a proteção contra uma geração em andamento repor dados apagados precisam ser concluídas antes de liberar o histórico. Contadores e recibos técnicos não devem ser apagados ao excluir histórico, para não recriar tentativas gratuitas. A migração de versão de exclusão do visitante foi deixada para o Item 6, junto da operação que a utilizará; este item não introduz uma rota de exclusão parcial.

## Verificação e etapas seguintes

- `npm test`: 239 aprovados, zero falhas, incluindo 21 novos testes de função e HTTP com SQLite em memória do próprio Node 22.16.0. O Node emite aviso de API experimental de SQLite; não é dependência adicionada e não é importada no Worker.
- `npm run test:integration`: 46 cenários aprovados, sete novos, com workerd, D1 descartável e as três migrações. Todas as chamadas Groq simuladas. Primeira execução foi bloqueada pelo sandbox no empacotador; execução autorizada concluiu.
- Isolamento, gravação aguardada, corrida enquanto salva, SQL rejeitando escrita, falhas de geração, ausência de plano, sessão expirada, fim de recibo, ingress e saldo de IA exercitados. Nenhuma evidência sobre modelo real, navegador ou ambiente publicado.

Etapa 3 restante: Item 2 começa pela conta de tokens e decisão do usuário, antes de preferências/contexto. Depois diário, despensa, validade, exclusão e proposta de recuperação. Não há personalização implícita por salvar plano. Cortesia B é persistência técnica de motivo/resgate nos recibos, separada deste histórico e não implementada.

Etapa 4 futura: preservar a chave da ação, mostrar gravação em andamento, rascunho recuperado, falha de gravação, 409 sem plano e sessão expirada. Não iniciar outra geração silenciosamente. Planejar/selecionar não registra consumo; a ação explícita de finalizar e registrar refeição pertence ao diário futuro. Nenhuma tela foi criada.

Etapa 5 futura: configuração/liberação, migração e verificação em ambiente de teste publicado somente com autorização posterior. Integração de vídeo complementar e busca alternativa no YouTube não pertence a este item.

Referências técnicas: [prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) e [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/). Orientações de `workers-best-practices` e `wrangler` aplicadas ao uso de binding, espera pela gravação e verificação local existente, sem dependência ou infraestrutura nova.
