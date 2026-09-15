# Compare — cálculos locais da Fase 2

Implementado em [calculate.js](../src/comparison/calculate.js), com testes em [comparison-calculations.test.js](../tests/comparison-calculations.test.js). Módulo puro: não chama IA, não recebe adaptador/fetch, não lê banco, segredo, relógio ou estado global mutável. Na Fase 3, a rota passou a chamá-lo após validar a saída Groq e acrescenta comparison ao envelope, separado de data. As duas guardas temporárias foram removidas; flags e política reais permanecem bloqueantes. O instrumento de avaliação de compare fica para a Fase 4.

## Escopo aprovado e bases disponíveis

O usuário aprovou a interpretação limitada porque o contrato tem tempo estimado de cook e preço estimado opcional de ready, mas não tem preço dos ingredientes nem tempo de entrega. Nenhum desses dados ausentes foi inventado.

- Tempo de cook é o total_minutes validado, incluindo preparo/cozimento conforme o contrato. O módulo o identifica como **estimado**, não como tempo medido/calculado e não como tempo ativo de trabalho comprovado.
- Quando hourly_rate_brl foi informado, calcula o valor desse tempo usando toda a duração declarada. Não extrai minutos das etapas nem corrige incoerência culinária. Uma receita que declara cinco minutos e descreve oito horas continua exigindo revisão.
- Diferença parcial = preço estimado de ready menos custo do tempo de cook.
- Isso **não é economia total**: exclui ingredientes e taxas de entrega desconhecidas. Não calcula diferença de tempo entre os lados, não estima salário, não subtrai orçamento, não escolhe vencedor e não recomenda compra.
- Sem valor da hora, preço ou um lado sugerido, a diferença correspondente fica indisponível, não zero. Hora explicitamente zero permite custo do tempo zero.

A comparação é por alternativa inteira, para todas as porções do pedido. Não multiplicar novamente o preço pelo número de pessoas nem somar alternativas como se fossem compras escolhidas.

## Funções

### calculateTimeCost(minutes, hourlyRateBrl)

Função matemática isolada. Minutos inteiros de 0 até LIMITS.minutes (240); valor da hora finito de 0 até LIMITS.hourlyRateBrl (100.000), até duas casas decimais, sem coerção e com a mesma tolerância de centavos do contrato. Inválidos lançam ContractError com caminho calculation.minutes ou calculation.hourly_rate_brl.

Zero minutos é permitido **apenas aqui** para testar a matemática. A receita no contrato continua exigindo pelo menos um minuto. A função considera minutes uma estimativa de duração e a hora um valor informado; o resultado monetário é calculado sobre base estimada, inclusive quando o resultado é zero.

### calculateComparison(rawInput, rawOutput)

Valida a entrada, exige mode compare e valida a saída inteira pelo contrato da Fase 1 **antes de calcular**. Não aceita preço com origem falsa, lado omitido ou segunda alternativa inválida para aproveitar somente a primeira. Não altera os objetos recebidos nem reenvia receitas na resposta do módulo.

Retorna objeto de métricas separado da saída da LLM:

| Campo | Conteúdo |
|---|---|
| hourly_rate_brl | Medida informada ou indisponibilidade explícita. Não há default. |
| cook | Status do lado; motivo se não sugerido; alternatives com referência da sugestão, preparation_minutes estimado e time_cost_brl calculado ou indisponível. |
| ready | Status do lado; motivo se não sugerido; alternatives com referência da sugestão e estimated_price_brl estimado ou indisponível. |
| partial_comparison | Escopo, aviso de limitação, custos excluídos, disponibilidade e pares de comparação. |

Cada lado conserva a ordem das sugestões validadas. Com dois lados sugeridos, cruza todas as alternativas: até duas vezes duas, **quatro pares**, ordenados por cook e depois ready. Essa escolha evita comparar somente a primeira opção ou inventar que a posição de uma lista corresponde à mesma posição da outra. Não há ranking.

Se um lado não foi sugerido, alternatives desse lado fica vazio; partial_comparison fica indisponível, com motivo e sem pares fictícios. Se ambos existem mas falta preço/hora, os pares existem para identificar exatamente quais comparações estão indisponíveis.

## Origem de todos os números

Toda medida disponível tem status available, value numérico, unit, origin, based_on_estimates e sources. Não há índices/contagens numéricos sem origem na saída; as referências às sugestões são strings.

| Medida | origin | based_on_estimates |
|---|---|---|
| Valor da hora | informado | false |
| Minutos de cook | estimado | true |
| Preço de ready | estimado | true |
| Custo do tempo | calculado | true, pois usa minutos estimados |
| Diferença parcial | calculado | true, pois usa preço estimado e custo derivado de estimativa |

origin descreve a operação imediata; based_on_estimates preserva a incerteza da cadeia. sources aponta reference, origin e based_on_estimates de cada base. Uma origem calculado não elimina a origem estimada de seus insumos.

Referências input.* apontam para a entrada validada; output.* apontam para a saída validada da LLM; cook.alternatives.*.time_cost_brl aponta para a métrica calculada no próprio resultado do módulo. A trilha permite identificar o minuto, a hora e o preço usados. Unidades: minute, BRL/hour e BRL.

Indisponibilidades contêm somente status unavailable e reason_codes: **não têm value: 0, valor null fingindo medida ou origem inventada**. Códigos possíveis:

- hourly_rate_not_provided: hora não informada;
- ready_price_not_provided: preço estimado não fornecido;
- cook_not_suggested / ready_not_suggested: lado sem sugestão.

No agregado partial_comparison, status pode ser available (todos os pares têm diferença), partially_available (somente alguns) ou unavailable (nenhum). Isso descreve disponibilidade da conta, não completude do custo: mesmo available continua sendo uma comparação parcial.

O próprio dado contém scope ready_price_minus_cook_time_cost, is_total_savings false, excluded_costs com cook_ingredients e unknown_delivery_fees, e notice em pt-BR explicando a limitação. Não remover esses avisos ao apresentar o resultado.

## Centavos e arredondamento

1. Converter a hora validada para centavos inteiros.
2. Multiplicar pelos minutos e dividir por 60.
3. Arredondar o custo para o centavo mais próximo; exatamente meio centavo sobe. Como os insumos são não negativos, usa floor((minutes × rateCents + 30) / 60).
4. Converter o preço validado para centavos e subtrair o **custo já arredondado**. A diferença usa centavos inteiros assinados; não precisa de um segundo arredondamento fracionário.
5. Devolver BRL dividindo centavos por 100. JSON numérico não conserva zeros finais: 10 significa R$ 10,00, sem exigir string monetária no contrato.

Essa política faz a diferença corresponder aos números que serão exibidos. Exemplo de aritmética, não medição: trinta minutos a R$ 19,99/h geram custo R$ 10,00; preço estimado de R$ 9,99 produz diferença parcial de -R$ 0,01. Sinal positivo significa apenas preço de ready maior que o custo do tempo; negativo significa menor, sem concluir economia total.

No teto atual, o produto inteiro é 240 × 10.000.000 = 2.400.000.000, dentro da precisão inteira de Number. O custo máximo calculado é R$ 400.000,00; não deve ser cortado no teto de R$ 100.000,00 da **hora**. Nenhuma dependência decimal foi necessária. Mudanças futuras nos limites exigem revisar essa segurança.

## Verificação e próximos passos

182 testes Node aprovados, incluindo 16 novos: centavos, meio centavo, zero matemático, ausência versus zero, faixas, diferenças negativas, todos os pares, ausência parcial de preço, um/ambos os lados não sugeridos, validação completa, origem transitiva e pureza. Nenhuma chamada real ou prova de coerência da IA.

Histórico da Fase 2: integração não reexecutada naquela entrega; módulo ainda desconectado. Na Fase 3, 191 testes Node e 38 cenários locais de integração passaram, incluindo o cálculo na rota. A matemática e o contrato das métricas descritos aqui não mudaram.

Para a etapa 4 de produto, somente em prosa: mostrar “Diferença parcial”, valor da hora informado, duração/preço estimados, indisponibilidades em vez de zero e custos excluídos. Não usar o resultado para um selo de “mais barato” ou “economia garantida”. Nenhuma interface criada.

Fase 3 concluída localmente: adaptador/prompt/schema compare e cálculo fora da LLM, descritos em [COMPARE-PROVIDER.md](COMPARE-PROVIDER.md). Pendente: Fase 4, fixture própria/rubrica e execução real. Hash e schemas dos modos antigos, canal de recusa legado, ERRORS, cotas, flags e dependências preservados.
