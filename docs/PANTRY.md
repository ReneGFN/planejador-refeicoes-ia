# Despensa persistente — Histórico, Item 4

Atualização do Item 5: [prioridade por validade](PANTRY-PRIORITY.md) implementada e testada para contexto cook autorizado por use_pantry, dentro do orçamento compartilhado. Sem alteração das rotas/regras de baixa abaixo. Flags continuam false, sem nova migração. As referências a “sem prioridade/envio” a seguir descrevem o escopo original do Item 4.

Implementado e verificado localmente em 2026-09-12. Somente cadastro da despensa e baixa revisável a partir de consumo já confirmado. Sem interface, IA adicional, prioridade por validade, envio da despensa ao modelo ou publicação.

## Decisões tomadas e por quê

1. **Até 40 itens por visitante**, reutilizando LIMITS.ingredients. É um limite de produto desta demo, não limite de nuvem nem número medido de tokens. Permite retornar a lista inteira com tamanho limitado e tratar no máximo 40 ingredientes por baixa. A última vaga é conferida dentro da transação, inclusive em requisições simultâneas. Não criamos paginação de despensa nem cadastro em lote.
2. Nome com 1–80 pontos de código Unicode, reutilizando LIMITS.ingredientCharacters. Remover espaços externos, normalizar NFC e comparar em minúsculas pt-BR. “CAFÉ” e “café” são duplicatas; “café” e “cafe”, “arroz” e “arroz integral” não são. Não retirar acentos, resolver sinônimos, singularizar ou fazer busca aproximada.
3. Quantidade e unidade são opcionais independentes. Ausência significa desconhecido; zero explícito significa saldo cadastrado zero. Quantidade: 0 a 100000, até três casas decimais, limite numérico compatível com o ingrediente estruturado atual, sem alterar seu contrato. Unidade vem exclusivamente de UNIT_CHOICES exportado por generation.js; nenhum segundo enum em código ou migração.
4. expires_at opcional é uma data de calendário YYYY-MM-DD informada pela pessoa, não estimada de foto. Datas passadas e futuras são aceitas sem classificar o alimento. O Item 4 só armazena/valida a data: não ordena por urgência, não exclui por validade e não oferece orientação sanitária.
5. PUT e DELETE exigem a revision recebida na consulta. Cada edição ou baixa incrementa a revisão. Isso impede uma edição de formulário antigo de repor estoque já descontado. O servidor não escolhe silenciosamente entre duas alterações conflitantes.
6. Baixa é **ação separada após o registro de consumo**: prévia de leitura seguida de confirmação explícita. Registrar, editar ou excluir diário não mexe na despensa automaticamente. Essa separação preserva o Item 3 e evita transformar uma receita sugerida em comprovação do preparo.
7. Uma baixa efetivada por refeição, mesmo usando outra chave. Se parte dos ingredientes for ignorada, o lote aplicado não é reaberto para tentar o restante; corrigir manualmente a despensa. É uma escolha conservadora contra desconto duplicado. Se nenhum ingrediente puder ser descontado, não registrar recibo de baixa: dados podem ser corrigidos e uma nova prévia consultada.

## Dados e migração

0005_pantry.sql cria pantry_items:

- id aleatório, visitor_id com FK/ON DELETE CASCADE, name, quantity e unit opcionais;
- added_at definido pelo servidor, expires_at opcional informado pelo usuário;
- normalized_name para unicidade atômica por visitante e revision para concorrência;
- índice (visitor_id, expires_at), reservado para o próximo item.

Também cria pantry_mutations, recibo técnico sem receita, nome de ingrediente, quantidade alimentar, foto, pedido livre, IP ou chave original. Guarda dono, hash da chave, operação, ID do alvo, identificador da tentativa, quantidade de itens afetados e datas. Há unicidade por visitante/chave e uma restrição adicional de uma operação deduct por visitante/refeição.

O recibo não tem FK para o item/consumo: precisa sobreviver à exclusão deles. A FK para o visitante técnico permanece. A futura exclusão de produto não deve apagar esse visitante ou os recibos e liberar reenvios antigos. Não alteramos contadores nem recibos de geração/visão.

O acesso à despensa termina com a sessão absoluta de 30 dias; added_at não renova sessão. expires_at do item significa a data declarada para o alimento, **não** retenção dos dados. Recibos novos recebem o prazo final da sessão. Exclusão física após expiração e exclusão abrangente continuam no Item 6, sem promessa de limpeza já implementada.

## HTTP e formatos

Todas as rotas exigem sessão válida, mesma política de origem HTTPS, ingress e PANTRY_ENABLED=true. A flag nasce false nos três ambientes. Não exigem AI_ENABLED nem chave Groq. Prévia/baixa também exigem DIARY_ENABLED=true. O dono vem exclusivamente da sessão; visitor_id no corpo é rejeitado. Respostas são no-store, sem dados internos de autenticação.

| Rota | Operação |
| --- | --- |
| GET /api/pantry | Lista todos os itens próprios, até 40 |
| POST /api/pantry | Adiciona um item |
| GET /api/pantry/:id | Consulta um item próprio |
| PUT /api/pantry/:id | Substitui os campos editáveis, com revisão |
| DELETE /api/pantry/:id | Exclui um item, com revisão |
| GET /api/meal-logs/:id/pantry-deduction | Calcula prévia sem escrever estoque |
| POST /api/meal-logs/:id/pantry-deduction | Confirma a prévia e aplica os descontos elegíveis |

Cadastro, exemplo fictício:

```json
{
  "version": 1,
  "name": "Arroz",
  "quantity": 500,
  "unit": "g",
  "expires_at": "2026-10-10"
}
```

PUT usa os mesmos campos e revision obrigatória. Não é PATCH: omitir quantity, unit ou expires_at limpa esse campo, sem inventar zero/unidade/data. DELETE recebe somente version: 1 e revision. Todas as escritas exigem Idempotency-Key UUID v4; campos extras e parâmetros de consulta são rejeitados.

GET devolve data com lista ou objeto contendo id, version, name, opcionais presentes, added_at e revision. normalized_name e visitor_id não são expostos. A lista é ordenada por added_at decrescente e ID crescente, não por validade.

POST de cadastro retorna 201; PUT/DELETE, 200. Corpo de confirmação nova: data: {id, operation, applied: true}. Consultar GET para recuperar valores/revisão atualizados. Uma segunda criação de mesmo nome normalizado com outra chave retorna 400; não soma quantidade, mescla datas ou sobrescreve o item existente.

## Prévia da baixa

A prévia recupera o próprio registro confirmado do Item 3 e reutiliza restoreMeal, agora exportada, sem mudar sua validação. Usa somente snapshot.ingredients, snapshot.servings e servings_consumed. Nunca extrai ingrediente de steps, texto do pedido ou descrição do prato. Não consulta a receita por rede nem chama a IA.

São elegíveis apenas registros de sugestão cook, incluindo o lado cook de compare. Ready, delivery/manual, descrição corrigida para algo diferente do título original e porções ausentes/inválidas ou acima do rendimento original não têm baixa calculada. Recusas não entram no diário pelo Item 3. A ausência de plano após uma exclusão não invalida o instantâneo próprio já salvo, mas um vínculo alheio não é exposto.

A quantidade proposta é:

```text
quantidade da lista estruturada × porções consumidas informadas ÷ rendimento da receita
```

**Isso é uma proposta proporcional, não medição do que saiu da despensa.** Comer uma porção de uma receita para quatro pessoas não prova que apenas uma porção foi preparada; pode ter sobrado comida. Itens elegíveis trazem origin: calculado, based_on_estimates: true e sources com referências à lista estruturada, rendimento, porções e saldo cadastrado. A confirmação da pessoa não transforma a sugestão da IA em pesagem real. Se a quantidade realmente utilizada diferir, não confirmar a prévia; ajustar a despensa manualmente.

Nome deve corresponder exatamente após normalização, com uma única ocorrência na receita e na despensa. Unidade precisa ser idêntica; não converter kg/g, colheres/gramas ou aliases. Cálculo trabalha em milésimos; resultado que exige precisão maior é ignorado, não arredondado para caber. Quantidade insuficiente não é reduzida parcialmente nem fica negativa.

| reason | Significado para a futura interface |
| --- | --- |
| no_structured_recipe | Sem receita de preparo estruturada para calcular baixa |
| meal_changed | Descrição do consumo foi alterada; revisar manualmente |
| servings_unconfirmed | Quantidade de porções ausente ou incompatível com o rendimento |
| ambiguous_name | Nome repetido/ambíguo; não escolher nem somar automaticamente |
| not_found | Nenhum nome exatamente correspondente |
| quantity_unknown | Saldo ou unidade não informado |
| unit_mismatch | Unidades diferentes; nenhuma conversão aplicada |
| precision_unsupported | Quantidade não representável na precisão adotada |
| insufficient_quantity | Saldo cadastrado insuficiente para o desconto proposto |

A prévia retorna status (review_required, no_changes ou not_applicable), items, preview_id e aviso de revisão. Cada item elegível inclui índice/nome/unidade, ID e revisão do item, quantidade proposta, saldo anterior/posterior e origem dos cálculos. Ignorados têm status skipped e reason. already_applied devolve somente recibo de operação já efetivada, não reconstrução de alimento apagado.

preview_id é uma impressão SHA-256 do estado lido do diário e da despensa, vinculada ao dono. É controle de versão, **não** credencial ou permissão. Nenhum relatório alimentar é salvo no recibo técnico. Mudança em qualquer item da despensa entre GET e novo POST invalida a impressão, mesmo que o item não fosse elegível: preferência por pedir nova revisão.

Para confirmar, POST recebe version: 1, preview_id retornada e confirmed_snapshot: true, além da chave no header. Não aceita lista/quantidade inventada pelo cliente. A pessoa precisa confirmar que a lista e as quantidades correspondem ao que usou.

Resultado aplicado: data com applied: true, meal_log_id, applied_count e items (elegíveis agora deducted; ignorados preservados). Zero fica cadastrado. Sem elegíveis, retornar 200 com applied: false e os motivos, sem recibo de baixa nem alteração de estoque. Não interpretar qualquer HTTP 200 como desconto realizado.

## Atomicidade, reenvio e falhas

Recibo e alterações são executados no mesmo [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), aguardado antes de responder. A chave única e o identificador da tentativa limitam a mutação ao vencedor. Dentro da transação, conferir novamente conteúdo/data do consumo e revisões dos itens elegíveis: um conflito não permite descontar só metade do lote. Itens deliberadamente ignorados na prévia são diferentes de falha parcial de transação.

Falha SQL reverte recibo e descontos. Se a resposta se perder depois do commit, reenviar a mesma chave consulta recibo e não refaz a operação. Não há retry automático nem compensação automática do estoque. É possível tentar novamente explicitamente com a mesma chave após rollback, preservando a prévia quando o estado permaneceu igual.

O espaço de chaves pantry é compartilhado por create/update/delete/deduct e separado de diário e geração. Reutilizar uma chave já aplicada retorna 409 DUPLICATE_REQUEST com quotaReserved: false, receipt: {operation, target_id, applied_count} e nota para consultar o estado atual. Uma baixa também retorna 409 se a refeição já tiver baixa registrada com outra chave. Excluir diário, plano ou item não remove recibo nem repõe estoque.

Mapa ERRORS congelado e intacto: entrada, duplicata de nome, revisão/prévia velha ou alvo ausente/alheio usam 400 INVALID_INPUT; sem sessão, 401; origem, 403; mídia, 415; corpo excessivo, 413; ingress, 429; flag, 503 NOT_READY; banco/dado inconsistente, 503 SERVICE_UNAVAILABLE. Não adicionamos códigos específicos para conflito de estoque. A futura UI deve reler o estado em 400 relacionado à operação e pedir revisão, sem presumir que foi aplicado. Objeto alheio e inexistente têm resposta indistinguível.

Todas as operações aplicam ingress, incluindo prévia, leitura e reenvios. Não reservam tokens nem tocam cotas de geração/visão. Esta persistência técnica não implementa cortesia B nem exclusão geral do Item 6.

## Verificação e pendências

- npm test: 313 aprovados, zero falhas, 29 novos testes, sem rede, com SQLite em memória do Node.
- npm run test:integration: 82 cenários aprovados, 16 novos, workerd/D1 descartável com cinco migrações e Groq simulada. O empacotador foi inicialmente bloqueado por permissão; execução autorizada passou.
- Concorrência: 12 criações da mesma chave → 1 criação/11 duplicidades; duas criações na última vaga → apenas uma aceita; 12 baixas da mesma refeição com chaves diferentes → apenas uma aplicada. Duas refeições concorrentes não sobrescrevem o saldo revisado.
- Lote máximo de 40 ingredientes exercitado no runtime; o teste amplia apenas o instantâneo fictício. Rollback no segundo desconto exercitado com SQLite; falha de baixa/rollback também exercitada no runtime.
- Preservados SYSTEM, contratos/schema de geração, cálculo de comparison, ERRORS, política/reserva e dependências. Alteração no diário limitada à exportação da função de restauração existente. Nenhuma flag antiga ligada, nenhuma IA real, push, deploy ou migração remota.

As skills workers-best-practices e wrangler orientaram transações aguardadas, bindings diretos, configuração desligada e testes locais de concorrência, sem instalar dependências. Referências: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) e [configuração de Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

Limitações assumidas: um item por nome, sem lotes de validade diferentes para o mesmo alimento; sem conversão de unidade/sinônimos; sem baixa de manual/ready; sem inferir preparo inteiro a partir de consumo parcial; sem reposição automática ao corrigir/apagar diário; após baixa parcial efetivada, ajustes adicionais são manuais. Não há mecanismo de estorno de estoque nesta entrega.

Etapa 3 restante: Item 5 (prioridade por validade/contexto dentro do orçamento compartilhado), Item 6 (exclusão abrangente/limpeza) e Item 7 (proposta de recuperação). Medição real do custo do contexto do Item 2 continua pendente. A despensa não é enviada à geração neste item.

Etapa 4: construir cadastro/listagem, estados vazio/carregando/erro, revisão para edição/exclusão, prévia com estimativas e motivos traduzidos, confirmação explícita e ajuste manual. Em baixa parcial, mostrar exatamente o que mudou e o que não mudou; não exibir sucesso antes da confirmação do servidor. Guardar chave durante reenvio e não gerar uma nova intenção automaticamente. Nenhuma interface foi criada.

Etapa 5: ativação, migração/publicação e verificação no destino não executadas. Testes locais não provam funcionamento em celular/navegador real, capacidade da nuvem ou qualidade da IA. Entregar somente o Item 4 e aguardar aprovação.
