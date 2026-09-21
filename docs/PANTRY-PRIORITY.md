# Prioridade por validade — Histórico, Item 5

Implementado e verificado localmente em 2026-09-12. Complementa [despensa](PANTRY.md) e [personalização](PERSONALIZATION.md). Sem UI, ativação, migração nova ou chamada real de IA.

## Consentimento e escopo

Somente cook recebe despensa. Ready pode continuar recebendo diário; compare e visão ficam fora antes de qualquer consulta de contexto. A geração lê preferences do visitante autenticado após validação, verificação de replay e reserva já existente. Corpo da geração não define dono nem permissão.

use_pantry é booleano opcional e independente de use_history. Ausência/false não autoriza envio. Documentos anteriores continuam válidos na versão 1; ausência continua omitida na resposta. Não precisa de migração porque preferences já armazena JSON. Exemplo para despensa sem diário:

```json
{
  "version": 1,
  "use_history": false,
  "use_pantry": true,
  "defaults": {}
}
```

GET/PUT /api/preferences já existentes persistem/recuperam essa escolha. **PUT substitui o documento inteiro: omitir use_pantry revoga essa permissão**, mesmo se antes estava true. Enviar também version, use_history e defaults. Cadastro, baixa ou confirmação de consumo não ativa permissão.

PERSONALIZATION_ENABLED e PANTRY_ENABLED precisam estar true para enviar despensa; continuam false nos três ambientes. Não há nova flag. Desligar impede uso em novos envios posteriores à gravação, não apaga estoque nem desfaz chamada já feita/em andamento. Falha de gravação não confirma desligamento. Reativar permite usar dados mantidos.

## Ordenação e seleção em código

src/pantry/priority.js reutiliza o validador de despensa. A leitura usa listPantry do próprio dono, limitada a 41 linhas para detectar inconsistência com o teto de 40 itens.

1. Quantidade explicitamente zero não participa; quantidade desconhecida permanece omitida.
2. Em only_available, cruzar nomes com ingredients do pedido atual por NFC/minúsculas pt-BR. Sem sinônimos, casamento parcial ou conversão inventada. Em can_buy_missing e suggest, itens elegíveis podem participar sem modificar o pedido.
3. Ordenar expires_at crescente, sem data por último; empates por nome normalizado e ID crescentes, sem depender da ordenação regional do ambiente.
4. Selecionar até quatro itens; enviar somente name e os opcionais quantity, unit, expires_at. Nenhum ID/revisão/added_at da despensa, foto ou inferência.

Datas civis YYYY-MM-DD são validadas como calendário real, sem fuso local. O bloco contém as_of_utc do envio. Ontem vem antes de hoje e amanhã, sem classificar como “vencido”, excluir item ou alterar saldo. Na função pura, data inválida exclui o candidato; linha inválida no banco faz listPantry falhar e omite a despensa inteira, preservando diário autorizado. Não transformar data inválida em ausência nem corrigi-la.

**expires_at é sempre informado pela pessoa**, nunca estimado de foto ou IA. É prioridade de uso, não julgamento sanitário. Código/aviso proíbem afirmar alimento bom/estragado/seguro/impróprio ou orientar conservação, validade ou saúde. Não há validador semântico nem garantia de obediência da LLM. Listagem CRUD continua por added_at; prioridade é seleção da geração, não uma nova tela ou rota.

## Divisão do orçamento e motivo

Reserva 4.096 intacta; **600 tokens adicionais são hipótese de planejamento, não medição**. O limite executável continua **1.200 pontos de código Unicode do JSON serializado**, contando escapes, chaves e aviso. A relação dois caracteres/token não é tokenizer nem garantia de teto.

| Fontes elegíveis | Despensa | Diário |
|---|---|---|
| Ambas | lista JSON até 400 caracteres, até 4 itens | lista JSON até 400 caracteres, até 4 registros |
| Só despensa | lista até 800 caracteres, até 4 itens | nenhum |
| Sem despensa elegível/autorizada ou falha de leitura | nenhuma | bloco anterior do Item 2 preservado, até 1.200 caracteres |

Estrutura/aviso cabem no restante do mesmo teto total. Reservei espaço para ambas para uma lista longa não eliminar a outra. Não redistribuí sobras entre fontes quando ambas existem: divisão simples e previsível. Mantêm-se no diário sete dias, descrição até 120 caracteres e registro até 300.

No bloco compartilhado, selecionar um prefixo de cada lista: se o próximo não cabe, parar aquela lista, sem pular para item menos prioritário. Não cortar nome/data/JSON nem pedido atual. Escapes podem impedir até o primeiro item da despensa de caber; nesse caso, manter diário anterior. Há conferência final do bloco inteiro contra 1.200.

src/history/generation-context.js monta uma única mensagem user com context_type meal_context, notice, as_of_utc, pantry e meals. Reutiliza o parâmetro interno historyContext do adaptador; não altera contrato público ou SYSTEM. Aviso mantém prioridade do pedido, dados não são instruções e descrições podem estar abreviadas. Testes comprovam seleção/envio, não pertinência ou obediência da IA.

Ainda falta medir prompt_tokens com/sem diário, despensa e ambos, incluindo nomes longos/escapes. Medições anteriores sem este bloco não comprovam seu custo nem cobertura de todas as saídas pela reserva. Sem retry, estorno ou alteração da cota.

## Falhas, isolamento e replay

Toda leitura usa visitor_id da sessão. Sem preferência verificável, nenhuma fonte é enviada. Falha do diário permite despensa autorizada; falha da despensa permite diário autorizado. Sem fontes disponíveis/elegíveis, gerar normalmente sem mensagem adicional. Nenhuma correção automática de dados.

O contrato atual não informa degradação: a futura UI não deve afirmar que todo cadastro foi considerado em cada geração. Não há cache; edição/exclusão confirmada afeta próxima seleção. Sessão continua com 30 dias absolutos, sem renovação.

Replay 409 permanece antes das leituras/reserva de geração, sem IA. Plans guarda pedido original e resposta, não duplica recorte. Geração não registra consumo nem dá baixa. A seleção só lê e não apaga controles técnicos.

## Verificação e pendências

- npm test: **333 aprovados**, zero falhas; 20 novos testes puros, SQLite e HTTP.
- npm run test:integration: **90 cenários aprovados**, oito novos, workerd/D1 descartáveis e Groq simulada. Primeira tentativa bloqueada pelo sandbox antes dos testes; repetição autorizada passou.
- Cobertura: ontem/hoje/amanhã, borda UTC, bissexto/data inválida, ausência, empate, tetos/escapes, only_available, zero/desconhecido, permissões, dois visitantes, falhas, correção/exclusão, geração vazia e replay.
- SYSTEM, contratos/schema de geração, ERRORS, comparison, dependências, configurações, política e reserva preservados. Divergência da recusa cook/ready permanece aberta.
- Item 6: exclusão abrangente/limpeza sem zerar controles técnicos. Item 7: proposta de recuperação. Não implementados.
- Etapa 4: controles “Usar meu histórico” e “Usar minha despensa”, aviso de envio ao provedor, confirmação/erro de salvamento, validade opcional informada pela pessoa, dados revisáveis e aviso de prioridade sem avaliação sanitária. Não afirmar uso de todos os dados. Sem UI construída.
- Etapa 5: medição/validação real, configuração, ativação e publicação posteriores. Sem deploy, push ou migração remota.

Skills workers-best-practices e wrangler orientaram reaproveitar consultas D1 parametrizadas, aguardar leituras e testar localmente sem ativar infraestrutura.
