# Compare — adaptador, prompt e schema

## Estado atual — conserto do schema, Item 3

Desenho A escolhido pelo usuário: **nenhum anyOf**, objetos fechados, propriedades obrigatórias e campos inativos anuláveis no transporte. A exclusão mútua e os limites continuam no único portão validateGenerationOutput, que devolve a mesma forma canônica consumida pela rota, pelo avaliador e por calculateComparison. Não há normalizador paralelo no adaptador.

O usuário autorizou uma exceção delimitada à R2: ajustar somente as instruções de formato do SYSTEM de compare que antes exigiam omissão e proibiam null. Entrada, regras culinárias, cook/ready isolados, seus schemas/prompts, omissão de hourly_rate_brl no envio e cálculos em código permanecem intactos. Sem dependência, retry, estorno, deploy ou flag ligada.

Verificação local do Item 3: **208 testes Node e 38 cenários de integração workerd/D1 aprovados**, com Groq simulada. Não houve chamada real do agente. Aceitação do novo schema na nuvem continua pendente; testes locais não a comprovam. O Item 4 documental registrou a tentativa anterior e preparou a reexecução individual de M01 em [GROQ-TESTING.md](GROQ-TESTING.md); a execução pelo usuário permanece pendente.

## Evidência que proíbe reintroduzir o desenho anterior

O corpo abaixo foi fornecido pelo usuário. É reproduzido literalmente nos campos/valores do teste do provedor, não gerado por uma nova execução:

```json
{
  "error": {
    "message": "invalid JSON schema for response_format: 'meal_compare_v1': /properties/ready/anyOf/0/properties/suggestions/items/anyOf: anyOf disambiguation failed: anyOf: key-set-exclusion: required key 'title' from one variant appears in another's properties (variant 0 vs 1) [keyset_required_overlap]",
    "type": "invalid_request_error",
    "param": "response_format",
    "schema_path": "/properties/ready/anyOf/0/properties/suggestions/items/anyOf",
    "schema_path_segments": [
      "$",
      "properties",
      "ready",
      "anyOf",
      "0",
      "properties",
      "suggestions",
      "items",
      "anyOf"
    ],
    "schema_kind": "anyOf",
    "schema_code": "keyset_required_overlap"
  }
}
```

O erro identifica **schema de requisição inválido antes da geração**, não falha de qualidade do modelo nem rejeição de uma receita pelo contrato local. O par ready/pricedReady compartilhava title, description, search_term e servings obrigatórios. A sobreposição de title foi rejeitada com keyset_required_overlap.

O erro mais profundo não aprovou os anyOf externos: eles também compartilhavam status e continuaram suspeitos. A documentação consultada no Item 1 não especificou se uma chave exclusiva basta ou se todos os conjuntos devem ser disjuntos. Não transformar essa ausência em permissão nem inventar regra geral de discriminação. Por decisão do usuário, a proteção estrutural agora rejeita **qualquer anyOf em compare**, inclusive na raiz, lados e itens. Isso impede tanto a forma comprovadamente rejeitada quanto os ramos externos suspeitos, sem tentar simular uma regra desconhecida.

A formulação histórica “desenho suportado” era forte demais: a documentação listava anyOf genericamente, não demonstrava a aceitação da nossa composição. Tipos anuláveis para valores opcionais, com todas as propriedades required e additionalProperties false, são o mecanismo documentado adotado agora. Isso não comprova aceitação deste schema específico. [Requisitos oficiais da Groq](https://console.groq.com/docs/structured-outputs#schema-requirements).

## Transporte versus forma canônica

Nome meal_compare_v1, modelo openai/gpt-oss-20b, strict true, reasoning_effort low e max_completion_tokens 4096 preservados. Root contém version, mode, cook e ready; cada lado contém obrigatoriamente status, suggestions e reason. Não usar type number anulável para substituir o objeto de preço: a origem permanece no próprio dado.

| Situação | Transporte exigido pelo schema | Validação e saída canônica |
|---|---|---|
| Lado sugerido | status suggested; suggestions array; reason null | Lista de 1–2 sugestões válidas; devolve apenas status/suggestions |
| Lado sem sugestão | status not_suggested; suggestions null; reason string | Motivo de 1–500 caracteres após trim; devolve apenas status/reason |
| Preço não estimado | estimated_price_brl null em cada sugestão ready | Omite o campo inteiro, sem zero/default |
| Preço estimado | Objeto obrigatório value/origin, origin estimado | Value finito, 0,01–100.000 reais e até duas casas; preserva o objeto |
| Conteúdo nos dois campos do lado | O schema de tipos pode aceitar | O contrato rejeita: não descarta conteúdo contraditório |
| Campo desconhecido, inclusive null | Objeto fechado | O contrato rejeita antes de construir o objeto limpo |

No schema, suggestions usa type ["array", "null"], reason usa ["string", "null"] e estimated_price_brl usa ["object", "null"]. Value e origin dentro de um preço informado não são anuláveis. Lados, status, porções, passos, ingredientes e quantidades não ganham permissão para null.

O validador também aceita a forma canônica anterior, com campos inativos omitidos, pois calculateComparison revalida a saída normalizada. Aplicar validação novamente devolve a mesma forma; cálculos sobre transporte válido e forma canônica são iguais. A ausência aceita nessa entrada interna não retira a obrigatoriedade de campos no schema enviado à Groq.

Só null expressamente autorizado representa ausência. Undefined presente, string vazia, array vazio, objeto vazio e campos extras não são eliminados para fazer o resultado passar. Suggested com suggestions null/vazia falha; not_suggested com reason null/vazio falha; preço parcialmente nulo falha. Nada dessa normalização se aplica aos modos cook/ready isolados, que continuam rejeitando preço novo e campos extras.

Limites de texto/listas/valores e relações como servings igual a people e total_minutes até time_minutes permanecem locais. O schema novo também delega exclusão mútua ao contrato, conforme desenho aprovado. Formato correto não comprova coerência culinária, cumprimento de equipamentos/louça ou verdade do texto.

## SYSTEM por modo

Os blocos comuns e o texto enviado em cook/ready foram preservados byte a byte. Somente duas instruções de formato de compare mudaram: explicitar os três campos de cada lado com null no inativo, e preço obrigatório no transporte com null quando a estimativa não for fornecida. Não foram acrescentadas regras de julgamento culinário.

- Cook/ready, preservado: sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b.
- Compare anterior: sha256:6434be14cac000c83b6cb184f9f832b70d09b4aba1f0a9b78a5b189588364129.
- Compare após o ajuste autorizado: sha256:5df032424dadf5064f5cb2b821ead35b0574c435d248e8dcc0dd1569aa724718.

Hashes calculados localmente, não medições de qualidade ou tokens. O instrumento registra o hash efetivamente enviado; não atribuir resultados anteriores ao novo SYSTEM. A lista de unidades segue derivada de UNIT_CHOICES. A divergência de recusa por suggestions vazia nos modos isolados continua aberta e intacta.

## Fluxo, erros e cotas preservados

Sessão/entrada/idempotência → uma reserva generation → uma chamada Groq para os dois lados → validateGenerationOutput → calculateComparison local → envelope data/metadata/comparison/quota. O adaptador devolve data canônica e metadata; a rota acrescenta métricas/quota. Cálculos não entram no schema nem voltam à IA.

Hourly_rate_brl fica fora do campo estruturado enviado ao provedor; permanece na entrada dos cálculos. Texto livre pode conter números, portanto a omissão não promete remover toda menção possível à hora. A origem das estimativas e a diferença parcial continuam explícitas; não há vencedor nem economia total.

- Corpo 400 de schema inválido acima: PROVIDER_REJECTED_REQUEST, uso null, diagnóstico não exposto pelo adaptador, uma chamada e nenhum retry.
- HTTP 400 com error.code exatamente json_validate_failed: mantém PROVIDER_SCHEMA_REJECTED. Não classificar por palavras da mensagem, schema_kind, schema_code ou somente status HTTP.
- Saída inválida após HTTP 200 do provedor: INVALID_OUTPUT, sem reparo ou cálculo.
- Na API, esses erros continuam mapeados conforme ERRORS existente, com reserva preservada depois de iniciada a geração. Nenhuma mudança de cortesia ou estorno.
- Ambos not_suggested continuam resultado válido, uma tentativa de geração e métricas indisponíveis sem números fictícios.
- Compare compartilha as três tentativas com cook/ready, não recebe cota por lado.

AI_ENABLED, SESSIONS_ENABLED e VISION_ENABLED continuam false, QUOTA_POLICY_JSON continua {} e a rota real continua bloqueada com 503. Sem histórico de produto, interface/PWA ou publicação neste item.

## Testes e limitações da comprovação

Sete testes Node novos: quatro de normalização, um de regressão de anyOf, um de transporte obrigatório/anulável e um com o erro real reproduzido. Os testes anteriores foram ajustados apenas onde a representação aceita mudou; rejeições de conteúdo inválido e limites permanecem. Os mocks compare agora usam null no transporte, não fingem que a omissão canônica cumpre o schema estrito.

A skill de boas práticas de Workers orientou verificar a mudança de validação no runtime existente. Os 38 cenários de integração foram reexecutados com transporte simulado atualizado, confirmando saída canônica, cálculo local, uma chamada/reserva, flags desligadas e erros preservados. Nenhuma dependência ou configuração de runtime foi alterada.

Teste estrutural local é proteção contra regressão conhecida, não réplica do compilador de schemas da Groq. A próxima chamada real do usuário poderá comprovar aceitação do novo schema, mas não qualidade geral, custo máximo ou correção de todas as receitas. Item 4 documental concluído: registro e roteiro preparados, não uma chamada executada ou aprovada na nuvem.
