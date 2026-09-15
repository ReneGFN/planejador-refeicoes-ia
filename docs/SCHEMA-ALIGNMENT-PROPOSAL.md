# Proposta de alinhamento entre schema e validador — Item 2

## Atualização — exceção delimitada para compare na Fase 3

O usuário autorizou explicitamente implementar compare com schema estrito de estrutura/campos/enums e manter no contrato local os demais limites, com documentação e testes das folgas. A exceção inclui os novos campos reason (1–500 caracteres) e estimated_price_brl.value (faixa/centavos), além das folgas herdadas. Não constitui escolha global de A/B para cook/ready nem autorização para afrouxar o validador. A proposta histórica abaixo permanece pendente nesse âmbito global.

Schema compare implementado com anyOf entre objetos fechados, mantendo omissão do preço em vez de null. Nenhum minLength/maxLength/minItems/maxItems foi acrescentado por suposição. A aceitação do schema específico pela Groq continua pendente de chamada real. Evidência local e limitações em [COMPARE-PROVIDER.md](COMPARE-PROVIDER.md).

Status em 2026-09-11: **proposta, sem alternativa escolhida ou implementada**. A autorização para entregar os Itens 2–4 juntos não autoriza executar esta proposta. Prompt, schema, contrato, erros, cortesia e cotas permanecem intactos nesta entrega.

## Consulta oficial antes da proposta

A Groq documenta suporte a um subconjunto de JSON Schema e modo estrito para GPT-OSS 20B, com decodificação restrita. Porém, a página não especifica `minLength`, `maxLength`, `minItems` ou `maxItems`. Portanto, o suporte a esses quatro operadores ficou **não confirmado**, não “aceito” nem “recusado”. Consulta em 2026-09-11: [Structured Outputs — requisitos de schema](https://console.groq.com/docs/structured-outputs#schema-requirements).

Também foram pesquisados os quatro nomes na [referência oficial da API](https://console.groq.com/docs/api-reference), sem especificação encontrada, e feitas buscas restritas aos domínios oficiais. O silêncio documental não prova incompatibilidade. Suporte no padrão JSON Schema ou em outro provedor não comprova suporte na Groq.

Não apresentamos esses operadores como configuração pronta. Antes de uma implementação que dependa deles, é necessária confirmação específica da Groq ou, se o usuário autorizar separadamente, uma sondagem controlada do modelo/endpoint: verificar aceitação **e cumprimento**, não apenas HTTP 200. Nenhuma sondagem real foi feita, nem sugerida troca de modelo/modo estrito para contornar a incerteza.

## Folgas observadas no código atual

Fontes: [schema](../src/providers/groq.js) e [validador](../src/contracts/generation.js). Esta tabela analisa o código do projeto, não o suporte do provedor.

| Regra | Schema enviado hoje | Validador local | Limite de eventual alinhamento |
|---|---|---|---|
| Comprimento de cada passo | Apenas string | 1–600 pontos de código Unicode, depois de trim | maxLength 600 sobre texto bruto não equivale exatamente a contar após trim; exigiria definição e testes de borda. |
| Passo vazio | Aceita string vazia estruturalmente | Rejeita vazio e somente espaços | minLength 1, mesmo se suportado, não excluiria uma string de espaços. Não presumir suporte a pattern como solução alternativa. |
| Quantidade de sugestões | Array sem limites | 1–3 | minItems 1 e maxItems 3 seriam candidatos condicionais, não suportados confirmados. O mínimo também interceptaria a recusa por lista vazia. |
| Quantidade de passos | Array sem limites | 1–20 | Outro descompasso do mesmo tipo; não ampliar silenciosamente o escopo da implementação. |

As unidades já compartilham a fonte UNIT_CHOICES desde o Item 1. Isso não muda as folgas acima. Estrutura não detecta aveia/iogurte sem uso em C01, oito horas de molho dentro de sessenta minutos em C10 ou ingrediente usado e não listado. Nenhuma proposta aqui promete validação culinária.

## Alternativas, sem escolha

| Alternativa | O que exigiria | Ganho possível | Custo/limitação |
|---|---|---|---|
| A — Alinhamento parcial no provedor, condicionado ao suporte | Confirmar operadores e semântica; aprovar campos exatos; adicionar testes de fronteira e preservar validação local | Restringir a geração ou interceptar determinadas saídas antes do validador do aplicativo | Pode mudar o erro observado, reduzir diagnóstico/uso disponível e afetar a elegibilidade futura de cortesia; não garante coerência nem economia. |
| B — Manter os limites locais e o schema atual | Nenhuma alteração de schema; medir o efeito do Item 1 e manter os registros de falha | Nas respostas HTTP 200, conservar o conteúdo recebido e os tokens quando reportados, com o caminho preciso do erro local | Saídas ainda podem atravessar o provedor e falhar aqui, consumindo chamada e tentativa; instrução de formato não garante obediência. |

A não é uma recomendação de instalar operadores não confirmados. B não significa aceitar receitas inválidas nem afrouxar o validador. Não foram escolhidas, acrescentadas regras ao SYSTEM, removidos limites ou implementados reparo, truncamento, tradução de unidades ou retry.

**Recusa protegida:** impor mínimo de uma sugestão alteraria o caminho atual de `suggestions: []`, que o prompt permite e o contrato rejeita como INVALID_OUTPUT/502. Essa divergência continua aberta por decisão do usuário. Qualquer proposta de mínimo exige autorização específica sobre essa consequência; não faz parte de um alinhamento “neutro” autorizado agora. A elegibilidade da cortesia também não será ajustada automaticamente para compensar mudanças de erro.

## Consequência para o visitante e para o diagnóstico

| Caminho observado | Resultado da API do aplicativo | Tentativa comum após reserva | Evidência no instrumento local |
|---|---|---|---|
| Groq HTTP 200; contrato local rejeita | INVALID_OUTPUT / 502 | Continua consumida | Bruto salvo antes da validação; caminho exato; uso quando reportado. C05: 1.084 + 386 = 1.470 tokens. |
| Groq HTTP 400 com json_validate_failed | PROVIDER_SCHEMA_REJECTED / 502 | Continua consumida | Corpo de erro capturado; receita indisponível para o contrato. Nos casos relatados, uso null; failed_generation nem sempre presente. |

O CLI de avaliação chama a Groq diretamente: consome a cota do provedor, **não** as três tentativas do aplicativo. Os 502 acima são o mapeamento do código, coberto por testes locais, não o HTTP 400 recebido pelo CLI nem uma verificação do endpoint publicado.

A regra B de cortesia permanece apenas planejada: INVALID_OUTPUT é elegível, PROVIDER_SCHEMA_REJECTED é excluído. Hoje não há crédito implementado nos dois caminhos. Logo, deslocar uma falha local para o provedor pode mudar sua elegibilidade futura, embora ambos tenham HTTP público 502. Ver [ERROR-BUDGET.md](ERROR-BUDGET.md); não alterar a decisão para acomodar a proposta.

“Mais cedo” significa antes da validação **local**, não antes de gastar tokens: restrições suportadas podem limitar a própria geração, e uma rejeição pode ocorrer após trabalho do modelo. Não há medição que permita prometer economia, latência menor ou quantificar tokens dos erros sem usage.

**Precisão da evidência de C05:** houve dois HTTP 400: um com failed_generation vazio e outro com 3.345 bytes; o terceiro caso foi HTTP 200 com conteúdo disponível e um passo inválido de 646 caracteres. Só uma das três falhas revelou as unidades em português e os passos vazios, mas isso não significa que a terceira resposta veio vazia. Não somar uso desconhecido como zero. Detalhes nas [rodadas 2 e 3](GROQ-TESTING.md#rodadas-2-e-3--reverificação-relatada-pelo-usuário).

Pendente: decisão do usuário entre caminhos, confirmação de suporte se escolher A e autorização de implementação delimitada. Não escolher com base apenas em preferência técnica.
