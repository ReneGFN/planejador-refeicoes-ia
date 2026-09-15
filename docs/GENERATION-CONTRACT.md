# Contrato de geração v1

## Atualização — transporte anulável de compare, saída canônica preservada

No Item 3 do conserto de schema, o usuário escolheu desenho A e autorizou ajustar apenas as instruções de formato do SYSTEM de compare. O schema do provedor não usa anyOf; exige status/suggestions/reason em cada lado, com null no campo inativo, e estimated_price_brl obrigatório/anulável em cada sugestão ready.

validateGenerationOutput continua sendo o único portão. Em compare, aceita os nulls autorizados ou a forma canônica anterior com omissão, e devolve sempre a mesma forma canônica: suggested sem reason, not_suggested sem suggestions e preço ausente sem campo. Não normaliza undefined, lista vazia, conteúdo contraditório ou campos extras. Preço informado continua objeto value/origin com os limites anteriores; null dentro do objeto é inválido.

As regras abaixo descrevem a forma canônica, não o transporte obrigatório do schema. As menções históricas a ramos anyOf na Fase 3 foram substituídas por este desenho; omissão não passa no schema estrito, mas continua aceita na revalidação interna. Garantias, entrada, matemática e modos cook/ready isolados intactos. [Schema atual, erro literal e testes](COMPARE-PROVIDER.md): 208 testes Node e 38 cenários locais aprovados, sem aceitação nova verificada na Groq. O Item 4 registrou a tentativa anterior e preparou o roteiro em GROQ-TESTING.md; reexecução/aceitação do novo schema continuam pendentes.

Implementado em `src/contracts/generation.js`, com testes em `tests/generation-contract.test.js` e `tests/compare-contract.test.js`. Cook/ready e, desde a Fase 3, compare estão conectados a `/api/generate` com sessão, leitura limitada e cotas atômicas. A configuração padrão mantém a rota desativada com 503. Fluxo testado em workerd/D1 locais com Groq simulado, sem chamada real adicional ou publicação. Ver [fluxo e configuração](USAGE-FLOW.md).

## Entrada

Nomes técnicos estáveis, independentes dos rótulos traduzidos da interface. `mode` aceita `cook` (Cozinhar), `ready` (Comida pronta) ou `compare` (Comparar). `meal` é texto livre obrigatório (1–80 caracteres após trim); `people` é inteiro de 1 a 20.

`budget_brl` é opcional: 0,01 a 100.000 reais, até duas casas decimais, total para todas as pessoas. Em cozinhar refere-se às compras que faltam; em pronto, ao pedido. É orientação, não preço garantido. `preferences` é texto opcional de até 400 caracteres; campos opcionais vazios devem ser omitidos, não enviados como null. Evitar solicitar dados médicos ou alergias no protótipo.

`cook` e `compare` aceitam e exigem:

- `time_minutes`: inteiro de 1 a 240; tempo total, incluindo preparo e cozimento.
- `ingredient_policy`: `only_available`, `can_buy_missing` ou `suggest`.
- `ingredients`: lista de nomes (até 40, até 80 caracteres por item). Lista não vazia para as duas primeiras políticas; vazia somente em `suggest`, a escolha explícita “Pode sugerir ingredientes”. Quantidades do estoque ainda não são estruturadas. Não assumir temperos/óleo disponíveis se a política for usar somente o informado.

Exemplo cozinhar:

```json
{
  "mode": "cook",
  "meal": "jantar",
  "people": 2,
  "time_minutes": 30,
  "ingredient_policy": "can_buy_missing",
  "ingredients": ["ovo", "arroz"],
  "budget_brl": 25
}
```

Exemplo pronto:

```json
{"mode":"ready","meal":"almoço","people":1}
```

Ao trocar de modo, manter os campos de cozinha no rascunho local, mas omiti-los do envio em `ready`. O servidor rejeita propriedades inesperadas, números em texto, valores não finitos, duplicatas simples de ingredientes e campos obrigatórios ausentes. Não aceita uma sequência de etapas como entrada.

Os tetos de 80 caracteres, 240 minutos, 40 ingredientes e R$100.000 são limites técnicos iniciais, não limites do Groq nem recomendações alimentares. Ajustar com evidência de testes e feedback.

### Equipamentos e louça em cook e compare

Três campos opcionais de entrada, válidos com qualquer política de ingredientes de `cook` e `compare`. Não acrescentam contagem de louça à resposta. Ausência preserva o pedido anterior, sem acrescentar defaults; `null` não equivale a omissão.

| Campo | Validação e significado |
|---|---|
| `equipment` | Lista de 0 a 5 valores únicos do enum abaixo. Quando presente, representa exclusivamente os equipamentos disponíveis; `[]` significa nenhum desses equipamentos e orienta preparo manual. Omitir significa disponibilidade não informada, sem restringir por esta lista. |
| `avoid_equipment` | Lista de 0 a 5 valores únicos do mesmo enum. São equipamentos proibidos, inclusive quando `equipment` estiver ausente. `[]` não acrescenta proibições. |
| `max_dishes` | Inteiro entre 0 e 20. Limite desejado de peças reutilizáveis sujas no preparo de cada alternativa, não soma das sugestões nem cota de geração. Zero pede nenhuma peça; omissão não informa limite. |

Enum inicial deliberadamente pequeno: `airfryer` (fritadeira elétrica sem óleo), `microondas` (micro-ondas), `fogao` (fogão), `forno` (forno) e `panela_de_pressao` (panela de pressão). São identificadores exatos: não aceitar `fogão`, `FORNO`, espaços adicionais ou frases como “sem forno”. Para esta última intenção, enviar `avoid_equipment: ["forno"]`. O enum não descreve capacidade, potência ou se a panela de pressão é elétrica; o prompt não deve presumir fonte de calor ou equipamento adicional fora da lista disponível.

Rejeitar duplicatas em qualquer lista, listas maiores que o enum, itens de tipo diferente de texto e equipamentos presentes nas duas listas. No conflito, apontar `input.avoid_equipment.<índice>`; não remover o item nem escolher a restrição silenciosamente. Listas são copiadas sem alterar a entrada. A lista disponível não obriga a receita a usar todos os equipamentos.

Neste item, “louça” significa as peças reutilizáveis que ficam sujas **durante o preparo**: panelas e tampas usadas, recipientes, facas, tábuas e utensílios de mistura; acessórios removíveis sujos de aparelhos também entram. Não inclui o corpo do eletrodoméstico nem pratos/talheres usados somente para comer. Reutilizar a mesma peça não cria outra peça, mas o prompt não deve propor atalhos inseguros para caber no limite. O teto 20 é uma escolha técnica inicial de faixa, não uma medição ou regra nutricional; zero foi incluído para pedidos sem utensílios.

Exemplo de entrada, não receita ou resultado medido:

```json
{
  "mode": "cook",
  "meal": "jantar",
  "people": 2,
  "time_minutes": 30,
  "ingredient_policy": "can_buy_missing",
  "ingredients": ["arroz cozido"],
  "equipment": ["fogao"],
  "avoid_equipment": ["forno"],
  "max_dishes": 2
}
```

**Decisão de validação:** tipo/faixa/listas/conflitos são verificados em código na entrada. Cumprimento de equipamentos e `max_dishes` na receita é **apenas instruído no prompt**, não validado semanticamente na saída. Os passos são texto livre: omissões, sinônimos, reuso de utensílio e peças implícitas impedem contar com confiabilidade. Não contar palavras como “panela” nem confiar numa contagem fornecida pelo modelo. Um teste explicita que uma receita que viola essas restrições ainda pode passar no contrato estrutural.

Não há novo campo de saída, selo de conformidade, contador de louça ou promessa de limite garantido. Uma futura validação exigiria primeiro um inventário estruturado com identidade/reuso das peças e sua ligação aos passos; mesmo então, contar declarações da IA não comprovaria ausência de omissões. Isso não foi implementado nem aprovado como novo escopo.

`COOKING_CONSTRAINT_FIELDS` e a função pura `validateCookingConstraints` concentram essas regras. A função é apenas um recorte de validação, não substitui `validateGenerationInput`. `compare` reutiliza os mesmos campos/regras desde o contrato da Fase 1; na Fase 3, o prompt os aplica somente ao lado cook. `ready` isolado rejeita os três campos, inclusive valores vazios/zero. Código e testes registram explicitamente essa fronteira.

A frase de recusa do system prompt de cook/ready foi preservada literalmente. Pedido inviável nesses modos continua orientado a `suggestions: []`, que o validador rejeita e a API converte em `INVALID_OUTPUT`/502. A divergência permanece aberta, sem retry ou estorno. Os JSON Schemas legados e seus validadores não foram modificados pela Fase 3; compare usa o canal próprio descrito abaixo.

Para a futura interface, somente em prosa: apresentar seleções disponíveis/proibidas sem permitir conflito, distinguir “não informado” de “nenhum equipamento” e explicar que o limite de louça se refere ao preparo e depende de revisão da receita. Em `ready`, omitir esses campos do envio. Nenhuma tela ou persistência foi criada aqui.

## Saída da IA

### Extensão planejada: contexto do diário alimentar

Decisão de 2026-09-11, ainda não implementada: permitir personalização com um recorte recente e limitado de refeições confirmadas em `meal_logs`, somente quando o usuário ativar essa opção. O backend deverá obter os registros a partir da sessão, nunca confiar em um ID de visitante enviado pelo cliente. O pedido atual continua tendo prioridade; sem histórico ou com opção desligada, manter a geração normal. Ver [escopo do diário](ROADMAP.md#decisão-de-escopo-diário-alimentar-e-sugestões-pelo-histórico).

A permissão será alterável em Configurações → Personalização, salva por visitante e consultada pelo servidor antes de preparar novos envios. Não depender apenas de um estado visual do botão. Desativar preserva o diário e impede seu uso em novos envios após a confirmação do salvamento; não desfaz chamadas já enviadas. A interface deve informar falhas ao salvar a escolha, sem exibir sucesso indevido.

Esta atualização não adiciona campos ao contrato v1 nem muda seus validadores. Não enviar `history`, `meal_logs` ou uma opção de personalização no JSON atual: campos extras continuam rejeitados. Definir e testar a preferência, o contrato de consumo e o contexto interno do provedor antes de conectá-los. Registro de consumo não deve acionar geração automaticamente nem servir como avaliação positiva implícita do prato.

### Relação com ingredientes por foto

Fotos já fazem parte do escopo do primeiro PWA. Seu processamento possui [contrato separado](IMAGE-ANALYSIS-CONTRACT.md), com validação, mescla, upload limitado e rota integrada localmente ao Qwen, desativada na configuração padrão. Uma chamada real anterior foi relatada pelo usuário; reteste do prompt permanece adiado. O fluxo simplificado encaminha a foto original ao Qwen, sem transformar pixels no Worker. A foto não entra neste contrato de geração nem é enviada ao GPT-OSS 20B: depois de revisar e confirmar a lista visual, o usuário poderá mesclá-la aos ingredientes digitados, sem duplicatas.

O resultado usa o mesmo campo `ingredients` descrito acima. Não adicionar `image`, base64, URL, origem ou estado de confirmação ao pedido atual: o validador rejeita campos extras. Confirmação é uma etapa da interface, não uma garantia de identificação ou conservação do alimento. Em `suggest`, continua valendo a lista vazia por escolha explícita; uma análise sem ingredientes não deve selecionar essa política automaticamente.

### Formato da resposta de refeições

Em cook/ready isolados: objeto com `version: 1`, `mode` igual ao pedido e `suggestions` com 1 a 3 alternativas. Compare usa os lados descritos na seção própria abaixo. Cada alternativa serve o número solicitado de pessoas; não somar suas compras como se fossem refeições escolhidas. Quantidade de sugestões é diferente da cota diária de gerações.

Em `cook`, cada sugestão contém `title`, `servings`, `total_minutes`, `ingredients` e `steps`. Ingredientes têm `name`, `quantity` positiva e `unit` padronizada (`g`, `kg`, `ml`, `l`, `unit`, `teaspoon`, `tablespoon`, `cup`, `pinch`). A interface traduz as unidades; não converter xícaras/colheres em gramas sem conhecer ingrediente e medida. De 1 a 20 passos, até 600 caracteres por passo. Tempo declarado não pode ultrapassar o pedido e porções devem corresponder às pessoas.

Em `ready`, cada sugestão contém `title`, `description`, `search_term` e `servings`. Não aceita campos de restaurante, preço real, prazo de entrega ou etapas de preparo; não há integração com catálogo de delivery.

Calorias e valores nutricionais estão fora da demo PWA por escolha do usuário no Item 7. Integrar uma fonte real e cálculo rastreável fica reservado para a futura fase do aplicativo. Custos estimados não entram nos modos cook/ready isolados; compare permite somente o preço opcional rotulado no lado ready, conforme a seção abaixo. Compras consolidadas devem ser derivadas das opções escolhidas; estoque sem quantidades não permite subtração exata. Ver [decisão de calorias](CALORIE-OPTIONS.md).

## Compare — contrato implementado na Fase 1 e conectado na Fase 3

Aprovados pelo usuário: Desenho A, uma a duas alternativas por lado viável e SYSTEM por modo. A Fase 1 implementou entrada/saída e proteções temporárias. A Fase 3 removeu esses dois bloqueios específicos e conectou compare ao adaptador e à rota, com uma única chamada por pedido. As flags continuam desligadas; a aceitação real do novo schema pela Groq ainda não foi medida.

### Entrada de compare

Reutiliza todos os campos e limites de cook, inclusive validateCookingConstraints: time_minutes, ingredient_policy e ingredients são obrigatórios; equipment, avoid_equipment e max_dishes são opcionais. meal, people, budget_brl e preferences mantêm as regras existentes. Ready isolado continua rejeitando os campos de preparo.

hourly_rate_brl é opcional e exclusivo de compare: número finito de **0 a 100.000 reais por hora**, até duas casas decimais, sem coerção de texto. Zero é uma escolha explícita de custo de tempo nulo; omissão significa **não calcular custo do tempo**; null/undefined presentes são inválidos. O teto é técnico, no mesmo patamar de budget_brl, não uma estimativa de remuneração. A verificação de centavos usa a mesma tolerância numérica de budget_brl; não arredonda entrada. Esse campo estruturado não é enviado ao modelo; os cálculos são executados localmente depois da validação da saída.

### Saída e viabilidade assimétrica

A raiz é fechada e contém exatamente version: 1, mode: "compare", cook e ready. Cada lado é obrigatório e admite somente uma das formas:

| Forma | Campos permitidos/obrigatórios | Regras |
|---|---|---|
| Com sugestões | status: "suggested", suggestions | Uma a duas sugestões válidas para aquele lado; reason não é permitido. |
| Sem sugestão | status: "not_suggested", reason | Motivo textual de 1–500 caracteres após trim; suggestions não é permitido, nem vazio. |

Um lado ausente/null não representa inviabilidade: é saída inválida. Status não aceita traduções, espaços ou variação de caixa. Ambos os lados not_suggested são um **resultado de contrato válido**, não INVALID_OUTPUT. O fluxo conectado na Fase 3 devolve esse resultado com HTTP 200 e consome uma tentativa, sem código novo em ERRORS. Isso foi verificado com Groq simulada; a configuração pública permanece desativada.

As receitas do lado cook e as buscas do lado ready usam o mesmo validador de sugestão dos modos isolados, evitando cópias das regras. Porções devem corresponder a people em **cada** alternativa. Cook exige total_minutes inteiro de 1 até time_minutes, ingredientes/quantidades/unidades válidos e 1–20 passos de 1–600 caracteres após trim. A lista de unidades continua vindo de UNIT_CHOICES. Cook/ready isolados preservam 1–3 sugestões e a rejeição da lista vazia.

### Preço estimado em ready

Somente no lado ready de compare, cada sugestão pode conter:

```json
{ "estimated_price_brl": { "value": 29.99, "origin": "estimado" } }
```

O campo inteiro é opcional; quando presente, value e origin são obrigatórios e não admitem propriedades extras. value: número finito de **0,01 a 100.000 reais**, até duas casas decimais. origin aceita exclusivamente "estimado", nunca "consultado", "informado" ou "calculado". O limite positivo acompanha o estilo de budget_brl e evita usar zero como marcador de preço desconhecido: nesse caso, omitir o campo. A faixa é técnica, não garantia de plausibilidade.

O valor representa uma estimativa da refeição para **todas as porções daquela alternativa**, não por pessoa e não um total de checkout com taxas de entrega desconhecidas. Não inventar estabelecimento, disponibilidade, prazo, calorias ou informação médica. O contrato rejeita campos extras desses tipos, mas não identifica confiavelmente alegações indevidas escritas dentro de title/description/search_term/reason. Esse controle semântico depende de prompt e revisão; não há filtro de texto que finja comprovar isso.

Exemplo sintético de resposta válida, não execução real:

```json
{
  "version": 1,
  "mode": "compare",
  "cook": {
    "status": "not_suggested",
    "reason": "Não foi encontrada uma opção de preparo compatível com este pedido."
  },
  "ready": {
    "status": "suggested",
    "suggestions": [{
      "title": "Prato de legumes",
      "description": "Uma opção para buscar.",
      "search_term": "prato de legumes",
      "servings": 2,
      "estimated_price_brl": { "value": 29.99, "origin": "estimado" }
    }]
  }
}
```

O motivo descreve ausência de sugestão, não impossibilidade comprovada nem falta de delivery no mercado. Duas recusas não devem produzir preço, receita ou diferença fictícios. A Fase 2 agora implementa cálculos separados, sem acrescentar campos à saída da LLM; veja a seção abaixo.

### Histórico de verificação da Fase 1

Na entrega da Fase 1: 166 testes Node aprovados (19 novos de compare) e 34 cenários de integração workerd/D1 locais aprovados (um novo cenário dedicado). Naquele estado, quatro pedidos compare bloqueados preservavam as três tentativas comuns de cook, sem chamada à Groq ou reserva de geração. A proteção de entrada ingress permanecia funcionando. Esse cenário foi substituído na Fase 3 pela verificação do fluxo completo e da cota compartilhada.

As guardas temporárias retornavam ContractError em input.mode no adaptador e INVALID_INPUT/400 com quotaReserved: false na rota habilitada apenas pelo teste. Foram removidas na Fase 3. Configuração real desligada continua retornando NOT_READY/503. ERRORS não mudou; ausência de sugestão de um lado não é um bloqueio de desenvolvimento.

SYSTEM e schemas antigos não mudaram; testes verificam o hash exato enviado por cook/ready. Composição por modo e schema compare foram implementados na Fase 3, sem chamadas reais. Recusa por suggestions vazia dos modos antigos e elegibilidade da cortesia permanecem abertas/intactas. Flags desligadas e política vazia; sem dependência, migração remota, push, deploy ou interface.

Para a futura etapa 4 de produto, em prosa: distinguir ausência do valor da hora de zero; mostrar o rótulo de estimativa junto ao preço; mostrar motivos de um ou ambos os lados sem opção, sem fingir erro técnico ou comparação numérica quando faltarem bases. Nenhuma tela implementada.

## Fase 2 — métricas calculadas fora do contrato da LLM

Implementadas em [comparison/calculate.js](../src/comparison/calculate.js), separadas da geração. Desde a Fase 3, a rota chama calculateComparison após validar a saída da IA e acrescenta comparison ao envelope HTTP, ao lado de data, metadata e quota. A função valida entrada e saída compare completas e devolve métricas com origem, referências, indisponibilidades e pares de comparação. Não inclui a receita original na resposta calculada nem altera o contrato da Fase 1.

Tempo de cook continua estimado; hora fornecida é informada. Custo do tempo e diferença são calculados, mas carregam based_on_estimates e as fontes para preservar a incerteza transitiva. Diferença **parcial** aprovada: preço estimado ready menos custo do tempo cook, excluindo ingredientes e taxas desconhecidas. Não representa economia total, diferença de tempo de entrega ou escolha de vencedor. Sem hora, preço ou lado, não inventar resultado.

calculateTimeCost aceita 0–240 minutos inteiros apenas como função matemática isolada; receitas continuam exigindo 1 até time_minutes. A hora mantém 0–100.000 e centavos. Usa centavos inteiros, arredondando meio centavo para cima; a diferença subtrai o custo já arredondado para coincidir com os números exibidos. JSON numérico não fixa zeros finais.

Na entrega da Fase 2: 182 testes Node aprovados, 16 novos de cálculos. Integração não foi reexecutada naquela fase; rotas/banco/adaptador, SYSTEM, schema e bloqueios permaneceram intactos até a Fase 3. O contrato completo das métricas e sua apresentação futura em prosa estão em [COMPARISON-CALCULATIONS.md](COMPARISON-CALCULATIONS.md).

## Fase 3 — adaptador, prompt e schema

191 testes Node e 38 cenários de integração local aprovados, todos com chamadas Groq simuladas. Compare usa uma chamada e uma tentativa, inclusive quando nenhum lado oferece sugestão; saída inválida mantém INVALID_OUTPUT/502 e a reserva, sem retry ou estorno. Cook/ready preservam o SYSTEM byte a byte e não recebem comparison no envelope.

O schema compare usa anyOf para os dois estados de cada lado e para o preço opcional por omissão, nunca null. Por exceção explicitamente aprovada, estrutura, obrigatoriedade e enums ficam no schema; limites completos de textos/listas/números e precisão monetária continuam exigidos no validador local. Isso inclui os novos campos reason e estimated_price_brl, não apenas lacunas herdadas. Testes demonstram casos que passam pela estrutura do schema mas são rejeitados localmente. Não representa flexibilização do contrato nem aprovação de mudança global nos schemas.

Detalhes, matriz das diferenças, hashes e limites da comprovação estão em [COMPARE-PROVIDER.md](COMPARE-PROVIDER.md). Aceitação real do schema e qualidade do novo prompt permanecem não verificadas. O instrumento e a rubrica foram preparados na Fase 4 abaixo; nenhuma interface ou ativação pública foi feita.

## Fase 4 — avaliação sem alterar o contrato

M01–M06 ficam em fixture própria, separada dos lotes C/E, selecionados individualmente pelo CLI. O registro local acrescenta expected_sides (hipótese da fixture, não campo do pedido à IA) e comparison calculado após sucesso do adaptador completo. feasible e refusal_channel ficam null nos casos compare para não reduzir a viabilidade dos dois lados à classificação legada; a correção dos motivos/sugestões é revista por lado pelo usuário, com rubric_verdict inicialmente null.

Nenhum campo foi acrescentado à entrada/saída da LLM nesta fase. As métricas usam o módulo aprovado, não outra IA nem fórmula duplicada. Bruto precede validação; falhas deixam comparison null. Saída sem preço é válida e pode deixar pares indisponíveis; isso não exige recusa nem reprovação automática na rubrica.

No aplicativo, compare conta como uma tentativa de geração, não duas, inclusive ambos not_suggested. O CLI chama diretamente a Groq e não exercita as cotas da API. [Rubrica e roteiro de seis chamadas](GROQ-TESTING.md), começando por M01/M04/M05. 201 testes Node aprovados com Groq simulada; integração não reexecutada porque contrato, adaptador, rota e banco ficaram intactos. Execução real/revisão humana pendentes, flags desligadas e etapas de histórico/interface/publicação não iniciadas.

## Limites da validação e próximos passos

Validação estrutural não garante receita executável, segurança do preparo, preços, respeito semântico aos ingredientes ou ausência de alegações inventadas em texto livre. Esses aspectos precisam de instruções ao modelo, avaliação e tratamento de falhas. Não renderizar texto da IA como HTML confiável.

Antes de conectar a rota: limitar corpo HTTP e resposta do provedor, tratar JSON malformado, implementar sessões/cotas, timeout e falhas sem repetição ilimitada. Rejeitar contratos inválidos com erro controlado sem ecoar o pedido inteiro em logs. Adicionar metadados de modelo/tokens a partir da resposta real do provedor, não do texto da LLM.

O adaptador em `src/providers/groq.js` prepara Structured Outputs com JSON Schema estrito para `openai/gpt-oss-20b`, com suporte documentado pelo Groq. O formato da requisição foi testado com respostas simuladas, ainda não aceito/verificado em uma chamada real nesta etapa. O validador local continua necessário para conferir limites e relações como porções e tempo. Ver [teste controlado do Groq](GROQ-TESTING.md).
