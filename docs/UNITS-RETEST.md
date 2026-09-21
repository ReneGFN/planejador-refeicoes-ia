# Reverificação das unidades após o Item 1 — Item 4

Status em 2026-09-11: **roteiro proposto; nenhuma chamada nova executada**. As rodadas 2/3 de [GROQ-TESTING.md](GROQ-TESTING.md) usaram o prompt anterior à fonte única de unidades e não verificam esta correção.

## Amostra inicial proposta: quatro chamadas explícitas

| Execução | Caso existente | O que observar | O que não comprova |
|---|---|---|---|
| 1 | C05 | Identificadores exatos em todas as unidades; nenhum passo vazio/só espaços; contrato e limite de 600 caracteres | Uma passagem isolada não demonstra correção do defeito intermitente. |
| 2 | C05, mesma entrada | Se aparecem novamente traduções, caixa divergente, passo vazio, comprimento inválido ou erro do provedor | Não alterar o pedido para obter uma resposta melhor. |
| 3 | C05, mesma entrada | Ter três observações consecutivas planejadas, preservando sucessos e falhas | Três sucessos não garantem que a próxima chamada passe. |
| 4 | C10 | Unidades e passos em cada uma das três alternativas solicitadas para vinte pessoas; maior variedade e volume | Não garante exercício das nove unidades nem correção culinária/tempo de C10. |

C05 **não é o único suggest**: C10 também declara `ingredient_policy: 'suggest'` e ingredientes vazios nos [fixtures atuais](../scripts/fixtures/generation-quality-cases.mjs). C10 complementa as repetições porque pede três alternativas e quantidades para vinte pessoas; não porque prometa gerar especificamente alho, cebola ou uma unidade determinada. C08 é ready e não tem ingredients.unit, portanto não entra nesta amostra focada.

Escolha metodológica proposta: **três C05 + um C10**, definida antes de ver respostas. Três C05 é um mínimo operacional para este diagnóstico inicial, não um tamanho de amostra estatisticamente suficiente para afirmar eliminação da intermitência. Duas execuções ainda seriam duas observações; não há limiar mágico que transforme uma amostra pequena em garantia.

“Passou uma vez” registra um sucesso, mas **não é evidência suficiente de correção geral**: C05 já passara na rodada 1. Se as quatro passarem, a conclusão honesta será “não observamos falha estrutural nas três repetições de C05 e na execução de C10 com este prompt”, não “C05 está corrigido”. Qualquer alegação de taxa de confiabilidade exigirá previamente uma meta, amostra maior e desenho próprio, não repetir até passar.

## Procedimento pelo usuário

1. Manter fixtures, modelo, parâmetros e código iguais durante a amostra. Não acrescentar pedidos de unidades específicas apenas no teste. Configurar a chave privadamente e GROQ_EVAL_DIR em diretório absoluto fora do repositório/OneDrive/outros locais sincronizados, como no guia de testes.
2. Executar individualmente o comando abaixo para C05. Inspecionar o registro antes de autorizar cada uma das duas repetições planejadas; depois executar C10 trocando somente o ID. São ações explícitas, não retry automático, e o plano não autoriza chamadas pelo agente.
3. Guardar os diretórios de cada execução, inclusive falhas. O avaliador cria um diretório por execução; não sobrescrever records antigos. Não usar --all: ele executa C01–C10, não esta amostra.
4. Conferir request_settings.system_prompt_version real, entrada, modelo solicitado/reportado, parâmetros e identificação do código. O hash do novo SYSTEM capturado localmente no Item 1 foi `sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b`; é referência local, não medição Groq. Se houver diferença, separar as versões antes de comparar.
5. Registrar HTTP, provider_code, contract_verdict e caminho, refusal_channel, usage com nulls preservados e disponibilidade do bruto/failed_generation. Rubrica e notas são preenchidas exclusivamente pelo usuário. Não publicar chave, registros privados ou dados pessoais.

```sh
node scripts/groq-smoke.mjs evaluate --case C05 --send-real
```

Cada chamada pode consumir tokens mesmo se falhar; o CLI não usa as cotas do aplicativo. Conferir limites da conta antes de executar. Erro de rede, autenticação ou limitação exige investigação antes de continuar; se interromper, registrar quantas chamadas foram realmente feitas e o motivo, sem substituir silenciosamente a falha por nova tentativa.

## Leitura dos resultados

- Conferir **cada ingrediente e cada alternativa** contra UNIT_CHOICES: g, kg, ml, l, unit, teaspoon, tablespoon, cup, pinch. Não traduzir nem corrigir a evidência. Verificar passos vazios/só espaços e comprimento após trim conforme o contrato; idioma e coerência ficam para revisão humana.
- Se vier HTTP 400, examinar failed_generation **somente se disponível**, sem tratá-lo como receita aprovada. Conteúdo ausente torna a causa não observável; não atribuir automaticamente o erro a unidades.
- Se vier HTTP 200 com INVALID_OUTPUT, registrar o primeiro caminho rejeitado. Ele não lista todos os defeitos possíveis; revisar o bruto preservado. Unidade válida não significa que o problema dos 646 caracteres ou do idioma desapareceu.
- Registrar quais unidades apareceram. Se não ocorrerem ingredientes que antes geraram “dentes”/“unidade”, apontar essa cobertura ausente; não alegar reprodução exata nem cobertura de todo o enum.
- Manter visíveis C01 incompleto e C10 com incoerência de tempo/ingredientes. O Item 1 acrescentou informação de formato, não correção desses problemas semânticos.
- Nenhum resultado novo ou nota de rubrica está preenchido neste roteiro. A confirmação da correção e o consumo exato do prompt novo continuam pendentes.
