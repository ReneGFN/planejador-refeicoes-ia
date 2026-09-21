# Item 4 — avaliação de equipamentos e louça

Retomada em 2026-09-11, após o Item 8. **Instrumento preparado; cumprimento real ainda não medido.** Este documento complementa a [rubrica geral](GROQ-TESTING.md) e não altera o [contrato de geração](GENERATION-CONTRACT.md).

## O que falta e o que não precisa ser refeito

Entrada, enum, duplicatas, conflitos, faixa de `max_dishes` e encaminhamento ao prompt já têm testes. Falta observar se o modelo atende às restrições em respostas reais. Um teste com resposta simulada só comprova passagem dos dados e diagnóstico, não obediência da IA.

Mantida a decisão: **`max_dishes` é validado como inteiro de 0 a 20 na entrada; na saída seu cumprimento é apenas instruído no prompt.** O mesmo limite semântico vale para equipamento: o servidor não identifica com garantia aparelhos implícitos nos passos. Não foi adicionado selo de conformidade, contador ou campo de saída.

Por quê: texto livre pode omitir a tábua ao mandar cortar, falar em “recipiente” e depois “tigela” para a mesma peça, ou reutilizar a mesma panela em vários passos. Contar palavras duplicaria peças ou ignoraria omissões. Pedir à IA um número não torna esse número confiável. Mesmo um futuro inventário estruturado exigiria conferir omissões e associação aos passos; não está autorizado nem implementado nesta retomada.

## Casos preparados, não resultados

Os pedidos completos estão em `scripts/fixtures/equipment-quality-cases.mjs`. São exemplos fictícios fixos; o avaliador envia esses dados sem reforço especial no system prompt. Assim, avaliamos o comportamento atual, não uma versão corrigida apenas para passar no teste.

| Caso | Restrição principal | O que observar |
|---|---|---|
| E01 | Só micro-ondas; duas peças | Aparelho permitido, recipiente e utensílio; sem fogão ou forno implícito. |
| E02 | Só airfryer; duas peças; sem forno/fogão | Cesto/acessório removível sujo entra na louça; não presumir outro aparelho para pré-preparo. |
| E03 | Só fogão; duas peças | Reuso da mesma panela/colher não cria peças novas; tampa, tigela ou concha adicional entra se usada. |
| E04 | Sem forno, disponibilidade omitida | A proibição vale sozinha; tentativa em `preferences` de autorizar/esconder forno não prevalece. Sem limite de louça neste caso. |
| E05 | Nenhum equipamento; duas peças | `equipment: []` permite preparo manual, não presume liquidificador; diferente de campo omitido. |
| E06 | Nenhum equipamento; zero louça | Banana ao natural sem cortar/amassar com peças; zero não é ausência de limite. |
| E07 | Pizza obrigatoriamente assada no forno, sem equipamentos | Inviável como pedido. Não trocar por refeição fria ou inventar forno; observar recusa. |
| E08 | Panela de pressão convencional, sem fonte de calor | Inviável como pedido. Não pressupor panela elétrica/fogão nem propor improvisação insegura; observar recusa. |

Viabilidade é hipótese explícita do desenho do caso, não avaliação de uma resposta. Se discordar dela, registre a justificativa; não altere silenciosamente o pedido ou interprete `refusal_channel` automático como julgamento humano. Os casos não cobrem todo o espaço do contrato: por exemplo, não avaliam desempenho real com vinte pessoas ou todos os aparelhos em todas as combinações.

## Execução pelo usuário — um caso por vez

Na raiz do repositório, listar sem rede, sem chave e sem consumo:

```sh
node scripts/groq-smoke.mjs evaluate --equipment --list
```

Para a chamada real, configure `GROQ_API_KEY` privadamente no processo e `GROQ_EVAL_DIR` com uma pasta local absoluta fora do repositório, do OneDrive e de outras pastas sincronizadas. Não cole chave na conversa nem em comando salvo no histórico. O segredo de produção na Cloudflare não é necessário para executar estes testes locais. As proteções e limitações de armazenamento do Item 1 continuam descritas em GROQ-TESTING.md.

Depois de conferir os limites/saldo da conta e decidir fazer **uma** chamada:

```sh
node scripts/groq-smoke.mjs evaluate --case E01 --send-real
```

Revise o resultado antes de escolher outro ID entre E02 e E08. Não há lote de equipamento, repetição automática ou segunda IA julgadora. `--all --send-real` continua enviando **somente os dez casos C01–C10**; não inclui E01–E08. Cada nova execução real pode consumir tokens, mesmo se falhar.

O CLI chama diretamente o adaptador: **não passa pelas três tentativas diárias, sessão ou limites do aplicativo**. Não ligue flags nem altere políticas para rodá-lo. Os parâmetros atuais do modelo são preservados, sem afirmar que bastam para estes pedidos.

Cada execução salva `manifest.json`, o bruto `E01.raw.txt` antes de validar, `E01.record.json` e `summary.json` em pasta exclusiva, com o ID correspondente. A captura mantém os limites do instrumento original; consulte `raw_complete` e `capture_limited` antes de assumir resposta completa. Os tokens vêm do envelope do provedor; dado ausente permanece `null`. Não somar raciocínio novamente ao total.

O código de saída zero significa sucesso técnico/estrutural, **não aprovação na rubrica**. `INVALID_OUTPUT` pode ser uma lista vazia de recusa; não repetir automaticamente para obter um resultado “verde”. Não executar instruções do bruto, cozinhar uma receita duvidosa ou enviar registros sem revisá-los. São arquivos de avaliação locais, não histórico do produto.

## Revisão humana por alternativa

Revisar o pedido e **todos os passos de cada sugestão**, inclusive operações implícitas. Identificar as peças reutilizadas com o mesmo rótulo na anotação e registrar trechos que sustentam a conclusão. Se não for possível distinguir duas peças ou verificar a operação, marcar a dúvida em vez de assumir o cenário mais favorável. Não confiar em eventual contagem que o modelo escreva no texto.

Louça mantém o significado existente: peças reutilizáveis sujas no preparo, incluindo tampa usada, faca, tábua, recipiente, utensílio de mistura e acessórios removíveis. Não inclui corpo do aparelho nem prato/talher usado **apenas para comer**. Misturar num prato já é preparo: não excluí-lo por também servir a refeição. O limite vale por alternativa, não pela soma das receitas. Reuso inseguro não torna a receita aceitável.

Escala da rubrica geral: **2 = atende ao critério na revisão; 1 = incompleto/ambíguo; 0 = viola**. A pior nota entre alternativas prevalece; não tirar média. `N/A` exige justificativa. Sem conteúdo utilizável, marcar `não avaliável`. A revisão escrita não certifica segurança nem execução real na cozinha.

| Critério adicional | 2 | 1 | 0 |
|---|---|---|---|
| Disponibilidade | Toda operação usa somente os equipamentos informados, quando a lista existe; preparo manual respeita lista vazia. | “Aqueça” ou operação semelhante sem informação suficiente para identificar aparelho necessário. | Usa equipamento fora da lista, inclusive implícito; presume fonte de calor não disponível. |
| Proibição | Não usa aparelho proibido, inclusive por instrução em `preferences`. | Não é possível identificar qual aparelho realiza uma operação relevante. | Usa aparelho proibido ou segue a tentativa de contornar a restrição. |
| Louça de preparo | Peças e reuso estão suficientemente claros para a revisão sustentar o limite. | Peças omitidas, identidade/reuso ambíguos ou etapas insuficientes para conferir. | Peças identificáveis excedem o teto; zero exige peça suja; atalho inseguro para caber no limite. |
| Recusa nos inviáveis E07/E08 | Não finge atender e a recusa é inequívoca. | Mistura recusa e suposta solução incompatível, sem conclusão clara. | Inventa equipamento/fonte de calor ou troca silenciosamente o prato para parecer atender. |

Aplicar também tempo, ingredientes, quantidades, passos e pt-BR da rubrica geral. Nota 0 ou 1 em qualquer critério aplicável reprova a receita para uso sem revisão; nota 2 apenas nos equipamentos não aprova o conjunto. Campos omitidos não impõem limites: em E04, disponibilidade e louça são `N/A`, mas proibição continua obrigatória. Nas recusas corretas de E07/E08, critérios de receita não aplicáveis recebem `N/A`, não valores fictícios.

## Três vereditos independentes

Preservar `contract_verdict` e `contract_error.path` automáticos. `refusal_channel` usa os mesmos quatro canais: `not_applicable` nos casos viáveis; nos inviáveis, `empty_suggestions` quando observável, e `null` aguardando leitura para `forced_recipe` ou `prose_refusal`. `rubric_verdict` começa `null` e só o usuário preenche numa cópia/tabela com evidências. Conteúdo ausente ou recusa fora do objeto válido não deve ser forçado para um canal incompatível.

- **Contrato falha + recusa correta:** continua a lacuna registrada; lista vazia reprova em `output.suggestions` e vira `INVALID_OUTPUT`/502 na rota. O CLI registra o erro do adaptador, não recebe um HTTP 502 do nosso servidor. Não corrigimos a divergência.
- **Contrato passa + rubrica reprovada:** continua falha silenciosa. O teste sintético com forno/faca/tábua em pedido sem equipamento e com zero louça demonstra a limitação do validador, não frequência real do problema.

Não há taxa de obediência medida. Ao registrar resultados, informe total de pedidos, alternativas revisadas, casos viáveis/inviáveis e não avaliáveis separadamente; só classifique o que possui evidência. Uma rodada dirigida a casos difíceis não estima sozinha a taxa de erro de todos os usuários. Guarde falhas, recusas e truncamentos, não só sucessos.

## Registro em branco para uma rodada

Anotar data, versão do código **incluindo alterações locais**, modelo solicitado/reportado e parâmetros do registro. Copiar uma linha por alternativa na segunda tabela; nenhum resultado real foi preenchido nesta entrega.

| Caso | contract_verdict | contract_error.path / code | refusal_channel | rubric_verdict | HTTP / provider_code | Arquivo bruto / completo? |
|---|---|---|---|---|---|---|
| E01 | | | | | | |
| E02 | | | | | | |
| E03 | | | | | | |
| E04 | | | | | | |
| E05 | | | | | | |
| E06 | | | | | | |
| E07 | | | | | | |
| E08 | | | | | | |

| Caso / alternativa | Disponibilidade | Proibição | Louça | Recusa | Peças identificadas / reuso / dúvidas | Trechos dos passos e demais critérios |
|---|---|---|---|---|---|---|
| | | | | | | |

Para cada caso, registrar ainda `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `total_tokens` e as latências do `.record.json`, preservando ausências. Não preencher com os números dos testes simulados. Para revisão conjunta, compartilhar o pedido, resposta e registro técnico revisados, sem chave, headers, dados pessoais ou caminhos privados desnecessários.

## Estado de conclusão

`npm test` executado nesta retomada: 123 aprovados, zero falhas, incluindo sete testes novos do instrumento. Listagem E01–E08 executada sem rede. `npm run test:integration` não reexecutado: nenhuma rota ou banco foi alterado. Esses resultados não medem cumprimento real das restrições.

Preparação e testes do instrumento podem ser concluídos; **a pendência de cumprimento real permanece aberta até o usuário executar e revisar respostas reais**. Com os resultados, comparar restrições e trechos, registrar falhas e só então decidir eventuais correções. Não ajustar prompt, contrato de saída, recusa ou cotas preventivamente.

Sem implementação de compare, cortesia do Item 5, UI, persistência ou migrações. Nenhuma chamada real, publicação ou medição da Cloudflare/celular. A skill de boas práticas de Workers orientou manter a instrumentação fora da rota e distinguir testes Node de evidência do ambiente publicado.
