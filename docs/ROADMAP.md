# Plano de implementação

## Estado atual — avaliação de refeições entregue localmente; personalização continua pendente

Avaliações opcionais de 1 a 5 foram adicionadas aos registros de consumo do diário, não a
planos nem a dados alimentares livres. O backend mantém a nota isolada por visitante, com
validação, atualização idempotente, expiração e exclusão junto ao registro. A tela de
Planos anteriores usa o vínculo existente entre consumo e plano e só mostra o controle em
refeições efetivamente registradas.

O recurso não muda prompts, cotas, flags, segredos ou geração. A nota não é enviada para
cook, ready ou compare; compare continua sem histórico. Persistir e mostrar uma avaliação
não autoriza usá-la para variar sugestões no futuro.

Antes de qualquer personalização por avaliação, decidir consentimento próprio, finalidade,
limites de contexto e retenção/revogação; então projetar e medir essa mudança como uma
entrega nova. A verificação atual é local (`npm test`: 490 aprovados; `npm run
test:integration`: aprovado), portanto não afirma validação em preview ou produção.

## Estado atual — vídeo de apoio: Fases 0–4 do pedido concluídas localmente

Backend separado da geração entregue, com testes simulados; [aviso exato](VIDEO-SUPPORT-NOTICE.md) e [guia de custos/configuração/teste real](VIDEO-SETUP.md) consolidados. A documentação cobre também onde exibir aviso/busca e as dependências de termos, privacidade, atribuição, MadeForKids e limpeza antes de eventual player.

Não há tela, player ou publicação. Etapas 4/5 do produto continuam não iniciadas. O próximo trabalho exige decisão própria: teste real manual, limites/margem, limpeza agendada e depois preparação da interface/ativação. Não ligar VIDEO_ENABLED por ter concluído a documentação. Não foi configurada chave ou alterado ambiente remoto.

Os títulos seguintes identificam registros históricos. As antigas propostas não substituem este estado, os contratos atuais ou as pendências de ativação.

Verificação desta fase documental: 442 testes Node e 123 cenários workerd/D1 aprovados, sem testes novos; aviso conferido contra o contrato e roteiro analisado sintaticamente, sem execução real. Código/configuração permaneceram intactos.

## Registro histórico — vídeo de apoio: Fase 3 entregue

POST /api/video resolve a alternativa de um plano do dono, aplica sessão/origem/ingress e integra cache/cota sem ligar geração. A resposta autorizada traz aviso exato e busca, com vídeo quando disponível. Falha de vídeo vira alternativa 200; falhas de acesso continuam recusadas. [Contrato e decisões](VIDEO-ROUTE.md).

VIDEO_ENABLED permanece false e VIDEO_QUOTA_POLICY_JSON vazio nos três ambientes versionados. 442 testes Node (22 novos), 123 cenários workerd/D1 (24 novos de vídeo) e npm run check aprovados. Nenhum segredo configurado, publicação, migração remota ou chamada real. Números de quota e limpeza agendada continuam requisitos antes da ativação. Fase 4 do pedido e etapas 4/5 do produto pendentes. Abaixo, histórico.

## Registro histórico — vídeo de apoio: Fase 2 entregue

Cache global e controle exclusivo de buscas implementados internamente, ainda não conectados a rota. [Desenho e decisões](VIDEO-CACHE-QUOTA.md): resultado por 24h, ausência válida por 1h, reserva atômica por visitante/rede/projeto, coordenação por título, recibo até expiração da sessão e janelas PT. Sem consumo de cota/API em acerto, sem retry ou refund; falha leva à alternativa.

Tetos/margem não escolhidos nem configurados. Limpeza de vídeo implementada em lotes; agendamento/verificação mesmo sem tráfego é condição pendente de ativação. Fase 3 aguarda aprovação; Fase 4 deste pedido e etapas 4/5 do produto não iniciadas. Nenhuma mudança no histórico, geração, configuração ou dependências.

420 testes Node aprovados, 42 novos com API simulada/SQLite descartável; 99 cenários de integração aprovados. Integração existente verifica regressão da base, não a nova função no workerd ou Google real. Nenhuma chamada real, deploy, push ou migração remota. Parar nesta fase. Abaixo, histórico das entregas anteriores.

## Registro histórico — vídeo de apoio: Fase 1 entregue

Contrato de entrada/saída e adaptador interno implementados, sem rota ou ativação. [Decisões detalhadas](VIDEO-CONTRACT.md): só título normalizado, campos externos fechados, cinco candidatos por única chamada, seleção pelo nome completo em sequência e ausência válida. Não chama LLM nem julga a qualidade do tutorial.

Transporte com cinco segundos por padrão, resposta limitada a 16 KiB, cabeçalho de credencial sem chave na URL, cancelamento/erros sanitizados e sem retry. Nome do canal e título do vídeo permanecem do autor; a interface futura deverá tratá-los como texto. Correspondência lexical pode perder resultados úteis e não comprova receita equivalente.

Fase 0 aprovada, incluindo alternativa com flag desligada sem remover proteção de acesso. Fase 2 aguarda aprovação e definição de tetos; nenhum cache, cota, migração ou VIDEO_ENABLED criado. Fases 3/4 do pedido permanecem pendentes; etapas 4/5 do produto não iniciadas.

378 testes Node aprovados (24 novos) e 99 cenários de integração da base aprovados. Sem rede/chave real nos novos testes; transporte Google real e runtime da nova função não verificados. Nada do histórico/geração/configuração mudou. Parar antes da Fase 2. Abaixo, histórico.

## Registro histórico — vídeo de apoio: Fase 0 concluída documentalmente

[Pesquisa e decisões pendentes](VIDEO-API-PHASE-0.md) registram a mudança de quota do YouTube, filtros sem garantia de equivalência culinária, termos para exibição/incorporação e minimização dos metadados. Nenhum backend de vídeo implementado ou ativado.

Proposta: rota posterior e independente da geração, sem LLM; título da alternativa como único conteúdo do pedido enviado ao Google; cache global sem dono; controle de buscas exclusivo com reserva atômica por visitante/rede/projeto e dia do Pacífico. Valores não escolhidos. Não modificar quota.js/histórico para encaixar vídeo como se fosse geração.

Pendências explícitas: conciliar flag desligada com retorno do caminho de busca, preservar rejeições de segurança e planejar MadeForKids antes de incorporação. Fase 1 aguarda aprovação. As substituições históricas e documento próprio do aviso pertencem à Fase 4 do pedido, não foram antecipados.

354 testes e 99 cenários locais passaram como regressão da base, não verificação da API do YouTube. Sem chave/rede externa nos testes, código/migração/dependência/flag/deploy. Limpeza de histórico continua proposta pendente; etapas 4/5 do produto preservadas. Abaixo, histórico.

## Estado atual — Etapa 3: desenho de limpeza automática entregue

Proposta em [RETENTION-CLEANUP-PROPOSAL.md](RETENTION-CLEANUP-PROPOSAL.md): manter 30 dias absolutos desde a criação da sessão e retirar produto vencido em lotes horários por um Worker interno separado, preservando Pages e sem rota pública. Não há executor, configuração ou agendamento implementado.

Receitas/planos, diário, preferências e despensa acompanham o prazo do dono. Recibos de produto precisam vencer antes de sair; cotas/recibos de uso seguem os prazos independentes existentes. Identidade sai por último, sem cascata que elimine proteção válida. Validade do alimento não aciona exclusão de estoque.

Aprovação necessária para a autoridade global interna limitada a vencidos, atraso operacional da remoção e retenção técnica. A implementação deverá bloquear escritas tardias, retomar lotes e isolar anomalias. Limites iniciais são hipóteses; medir antes de publicar, sem promessa de custo zero ou limpeza instantânea.

354 testes Node e 99 cenários locais passaram, sem testes novos: regressão, não prova do executor inexistente. Recuperação não implementada, medição real de contexto pendente, etapas 4/5 preservadas. Nenhum dado real apagado. Parar aqui; abaixo, histórico.

## Estado atual — Etapa 3, Item 7: recuperação proposta, não implementada

Entregue [proposta de transferência por código](RECOVERY-PROPOSAL.md), sem e-mail, senha escolhida ou cadastro. Recomendo um único acesso ativo: importação concluiria a troca do cookie e código anteriores, preservando visitante, dados, permissões, cotas e fim dos 30 dias originais. Não é sincronização nem backup.

Desenho propõe código aleatório com HMAC armazenado, limite técnico por rede/global e preparação/confirmação para guardar o novo código antes de invalidar o anterior. Valores e decisões ainda precisam de aprovação específica; não houve nova rota ou configuração. Código vazado pode permitir tomada de acesso sem resgate confiável por outro canal.

Minha recomendação para a demo é manter recuperação indisponível até fechar retenção física e revisar/testar essa nova autenticação. A futura UI deve avisar a limitação atual de acesso por navegador/30 dias, sem prometer recuperação. Trocar de dispositivo perde vínculo, não apaga automaticamente banco.

354 testes e 99 cenários locais reexecutados com sucesso, sem testes novos: regressão do backend atual, não validação da proposta. Limpeza automática, medição real de contexto e etapas 4/5 seguem pendentes. Código, SYSTEM, contratos, cotas e infraestrutura intactos. Abaixo, histórico.

## Estado atual — Etapa 3, Item 6: exclusão sem liberar cota

DELETE /api/history exige confirmação explícita e sessão do dono. Remove planos (inclusive recusa), preferências, diário/instantâneos e despensa em uma transação; mantém visitante, contadores e recibos. Ingress continua contando, nenhuma chamada ou restituição de IA. HISTORY_DELETION_ENABLED nasce false nos três ambientes.

Migração 0006 acrescenta revisão técnica do histórico e recibo da exclusão. A revisão impede gravações já em andamento de repor produto após apagar; o recibo impede que reenvio da mesma exclusão remova cadastros posteriores. Escolhi manter sessão para não criar novo saldo nem renovar os 30 dias. [Funcionamento, limites e testes](HISTORY-DELETION.md).

354 testes Node e 99 cenários workerd/D1 aprovados, com dados fictícios/IA simulada. Nenhum SYSTEM, contrato/schema de geração, ERRORS, cálculo, cota ou dependência mudou. Sem migração remota, deploy ou ativação.

Pendência da etapa 3: limpeza física automática após expiração e retenção/limpeza técnica correspondente; esta rota autenticada não alcança sessão já expirada. Não criei manutenção global/agendamento implicitamente nem marquei retenção como concluída. Item 7 continua proposta pendente; custo real do contexto ainda não medido. Etapas 4/5 continuam sem interface/publicação. Abaixo, histórico.

## Estado atual — Etapa 3, Item 5: prioridade por validade

Cook pode receber até quatro itens próprios, ordenados em código pela data fornecida pela pessoa, sem data por último, empate por nome/ID. Zero não entra; quantidade desconhecida não é inventada. Em only_available, só nomes também informados no pedido participam. Ready continua podendo usar diário, não despensa; compare e visão seguem excluídos.

Decisão: use_pantry separado e desligado por padrão, persistido no documento existente, sem migração. Cadastro/baixa não autoriza envio. PERSONALIZATION_ENABLED e PANTRY_ENABLED continuam false. PUT substitui tudo: omitir use_pantry revoga seu uso.

Orçamento: diário/despensa dividem até 400 caracteres por lista; estrutura/aviso dentro dos mesmos 1.200. Despensa sem diário até 800; diário sem despensa preservado. Reserva 4.096 intacta e 600 tokens ainda hipótese. [Algoritmo, escolhas e falhas](PANTRY-PRIORITY.md).

333 testes Node e 90 cenários locais aprovados, sem IA real. Data serve só para prioridade, sem julgamento sanitário ou orientação de conservação/validade/saúde. Seleção testada não garante obediência da IA. SYSTEM, contratos/schema, ERRORS, cálculo e configurações preservados.

Próximo após aprovação: Item 6, exclusão abrangente/limpeza. Item 7 e medição real do contexto pendentes. Etapa 4 deverá mostrar consentimentos distintos e erro ao salvar sem fingir confirmação. Etapa 5 não executada; sem interface/publicação adiantada. Abaixo, histórico de entregas anteriores.

## Estado atual — Etapa 3, Item 4: despensa e baixa revisável

Despensa persistente implementada por sessão: cadastro, lista/consulta, edição e exclusão, até 40 nomes distintos normalizados por NFC/pt-BR. Quantidade/unidade e data de validade opcionais; unidade reutiliza o enum atual. Revisão obrigatória para editar/excluir impede formulário antigo de sobrescrever uma baixa. PANTRY_ENABLED começa false nos três ambientes.

Baixa é separada do registro de consumo: GET produz prévia e POST exige confirmação. Só usa lista estruturada do instantâneo cook, incluindo cook de compare. Cálculo proporcional às porções declaradas é marcado calculado/baseado em estimativas, não medida de quanto foi preparado. Manual/ready, porções desconhecidas, descrição alterada, ambiguidade, nome parcial, unidade diferente, precisão insuficiente e saldo insuficiente não geram desconto correspondente.

Recibo e lote elegível são atômicos; uma baixa por refeição mesmo com chaves novas. Prévia/revisão desatualizada exige nova consulta; exclusão/edição do diário não repõe estoque. Itens ignorados são relatados e saldo zero permanece cadastrado. Após uma baixa parcial efetivada, correções adicionais são manuais. [Contrato e motivos das decisões](PANTRY.md).

313 testes Node (29 novos) e 82 cenários workerd/D1 (16 novos) aprovados, Groq simulada. Inclui concorrência, teto de itens, lote de 40 ingredientes e rollback. Migração 0005 apenas em bancos de teste descartáveis; nenhuma ativação, dependência, chamada real, push/deploy ou migração remota. Preservados prompts, contratos/schema de geração, ERRORS, contas e cotas. A função de restauração do diário apenas foi exportada para reutilização.

Próximo item após aprovação: Item 5, prioridade por validade e contexto limitado; armazenar expires_at não implementa essa prioridade nem avalia segurança do alimento. Itens 6/7 e medição real do contexto permanecem pendentes. Etapas 4/5 ainda sem interface ou publicação. Seções seguintes são histórico.

## Estado atual — Etapa 3, Item 3: diário de consumo explícito

Implementados registro manual (incluindo delivery), confirmação de sugestão, listagem paginada, consulta, edição e exclusão por visitante autenticado. Gerar/salvar/escolher não cria consumo. Confirmar compare registra somente o lado/índice indicado, nunca lado recusado. Porção consumida não é inferida do rendimento. Descrição e data são corrigíveis; o instantâneo mínimo continua identificando a sugestão original.

Migração 0004: datas técnicas/expiração em meal_logs e recibos de mutação separados, sem conteúdo alimentar. Recibo e alteração na mesma transação, com chave única por visitante e tentativa; excluir um registro não apaga o recibo nem zera cotas. Reenvio 409 informa ação anterior e orienta consultar estado atual. Retenção lógica até o fim da sessão absoluta; limpeza física/exclusão geral seguem pendentes no Item 6.

DIARY_ENABLED nasce false nos três ambientes. Rotas só usam ingress, não dependem de chave de IA nem alteram use_history. A geração cook/ready autorizada passa a refletir edições/exclusões do diário; compare continua fora da personalização. SYSTEM, contratos/schema, mapa ERRORS, cálculo e política/reserva permanecem intactos.

Verificação: 284 testes Node (26 novos) e 66 cenários workerd/D1 (12 novos), aprovados, com Groq simulada e banco descartável. Inclui 12 confirmações simultâneas, com uma criação e 11 duplicidades, e rollback nas três escritas. [Contrato e decisões](MEAL-LOGS.md). Sem dependência, IA real, migração remota, push ou deploy.

Próximo item após aprovação: Item 4, despensa e baixa conservadora, sem presumir uso de todos os ingredientes/porções de uma sugestão cujo registro foi corrigido. Medição real de tokens do contexto do Item 2 continua pendente. Etapas 4/5 não iniciadas. O contrato 200 da geração foi preservado: a futura UI obtém o ID do plano no replay 409 existente, sem nova IA, sujeito a ingress. Seções seguintes são histórico.

## Estado atual — Etapa 3, Item 2: preferências e contexto controlado

Implementados GET/PUT de preferências, use_history false por padrão e recorte autorizado apenas em cook/ready. Compare não consulta/monta/envia histórico mesmo com permissão ligada; segunda barreira no adaptador. A reserva aprovada permanece 4.096, sem calibrar/ligar a política vazia. Nenhum SYSTEM, contrato de geração, schema, ERRORS ou cálculo mudou. PERSONALIZATION_ENABLED começa false em todos os ambientes.

Decisões de seleção: sete dias corridos UTC, quatro registros, descrição até 120 caracteres, registro JSON até 300 e bloco completo até 1.200. Suposição declarada: dois caracteres/token para operacionalizar os 600 aprovados sem tokenizer; nenhum contador aparente de tokens. Usa só descrição/data/vínculo do próprio visitante, nunca passos/fotos. Defaults são recuperáveis para formulário futuro, não sobrescrevem pedido atual. Permissão ou leitura indisponível resulta em geração sem contexto.

Medições atuais do usuário: C08 ready 1.064 + 102 = 1.166; C10 cook 1.183 + 1.181 = 2.364, hash legado sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Substituem a atribuição incorreta dos números cook anteriores; ver [registro e ressalvas](GROQ-TESTING.md). Somar 600 dá 1.766 e 2.964, respectivamente, com margem na amostra, não cobertura do máximo possível do contrato. **Consumo efetivo do recorte permanece pendente de comparação real pelo usuário.**

Verificação local: 258 testes Node (19 novos) e 54 cenários workerd/D1 (oito novos), todos aprovados e Groq simulada. Detalhes em [PERSONALIZATION.md](PERSONALIZATION.md). Sem dependência/migração/ativação/deploy. Exclusão/correção para teste de contexto foram feitas apenas no banco fictício; não equivalem a endpoints de diário/exclusão implementados.

Próximo item após aprovação: Item 3, diário com confirmação explícita de consumo e registro manual. Despensa, validade, exclusão/limpeza e recuperação permanecem pendentes. Etapas 4/5 não iniciadas. Registrar para UI: C08 atual ofereceu uma alternativa contra duas anteriormente; válido, mas pouco para escolher. Não forçar mais opções pelo prompt. Seções seguintes são histórico, não estado atual.

## Estado atual — Etapa 3, Item 1: planos persistidos e replay

Entregue somente o Item 1 do pedido de Histórico. Pedido e saída canônica ficam em plans, por dono autenticado e chave derivada. A gravação termina antes do 200. Reenvio retorna 409 com o plano salvo (inclusive compare recusado), sem IA/nova reserva de geração e ainda sujeito a ingress. Falhas não criam plano; 409 sem plano declara ausência. Comparison é recalculado do pedido/saída originais, conforme D3 aprovado.

Retenção lógica até o fim da sessão absoluta de 30 dias aprovada em D8. Expirar acesso não remove fisicamente os dados: limpeza e exclusão de produto, sem zerar recibos/cotas (D7), continuam pendentes. A migração 0003 acrescenta somente vínculo de chave e expiração/índices; o controle de concorrência com exclusão será implementado junto do Item 6, não adiantado como funcionalidade parcial.

Verificação: 239 testes Node, 21 novos, e 46 cenários workerd/D1 local, sete novos, todos aprovados e com provedor simulado. Ver [PLAN-HISTORY.md](PLAN-HISTORY.md). Sem mudança em SYSTEM, contrato, schema, ERRORS, cálculo ou flags/política; sem dependência, deploy, migração remota ou chamada real. Etapas 4/5 continuam não iniciadas.

Na entrega do Item 1, o próximo passo era decidir o orçamento do Item 2. **Correção posterior de versão:** não usar a antiga folga cook ~1.780 para o SYSTEM atual. As medições corretas C08/C10 e decisões aprovadas estão na seção atual acima e em GROQ-TESTING. Compare, com folga relatada 466–816, ficou excluído da personalização. A entrega do Item 1 não tinha feito envio de histórico.

Registro de decisões do Item 1: finalizar/registrar é confirmação explícita de consumo; permanecer na tela ou escolher receita não cria diário. O vídeo não integrava aquele item de histórico; posteriormente, seu backend separado foi entregue, com aviso exato e alternativa de busca em [VIDEO-SUPPORT-NOTICE.md](VIDEO-SUPPORT-NOTICE.md). Interface/player/publicação continuam pendentes; ver [preparação e custos](VIDEO-SETUP.md). Naquele item, preferências de personalização permaneciam planejadas como opt-in inicialmente desligado.

As seções abaixo são histórico de entregas anteriores. Não interpretar afirmações antigas de “etapa 3 não iniciada” como o estado atual.

## Achados da primeira suíte real de compare — Item 5 entregue: medir sem antecipar o veredito

[Roteiro atual](GROQ-TESTING.md): três chamadas individuais M03 → M04 → M05, se a execução chegar ao fim. A sequência cobre preparo instantâneo/hora zero, formato assimétrico/nulls e motivos legíveis/contradição sem afirmação de mercado. Critérios exigem leitura de bruto e record, não apenas HTTP 200 ou contrato aprovado. Falha ou ramo essencial não observado exige preservar os registros e parar, sem substituir por nova tentativa.

Decisões do roteiro: M02 fica para mais amostras em uma rodada posterior, pois não houve correção específica de unidades e uma passagem sem tablespoon não comprova desaparecimento do vazamento. O fluxo sem hora funcionou no SYSTEM anterior, sem provar ausência de regressão no atual. M01 não precisa repetir a aceitação inicial do schema neste recorte; M06 continua não executado e fora desta triagem. Nenhuma instrução adicional ou rodada de unidades foi implementada/autorizada.

Uma resposta por caso não garante correção num modelo não determinístico. Após análise da primeira rodada, o usuário pode decidir por mais uma rodada M03/M04/M05 (+3 chamadas, 6 no total se completas), definida antes das respostas e nunca automática. Mesmo duas observações por caso não certificam confiabilidade. Três chamadas são contagem de requisições, não promessa de consumo ou gratuidade; o CLI usa diretamente a conta Groq, fora da cota pública do app.

Entrega documental verificada com npm test: 218 aprovados, zero falhas, sem teste novo. Listagem compare e hash local conferidos sem rede; nenhuma execução real dos casos. Integração não reexecutada, resultados de 39 cenários pertencem ao Item 2. Código, testes, SYSTEM/hashes, contrato, schema, cálculo, omissão da hora e configurações preservados, sem dependência/deploy.

Os cinco itens estão entregues localmente; execução/revisão humana pendentes, tabela de resultados/notas em branco. Compare esperado mantém sha256:63d74e6ac173d2c970e9c80cb332d56c22788e5084442046b9e3c9a823a560d4. Não declarar qualidade resolvida, hora zero medida ou etapas 3/4/5 de produto iniciadas. Recusa legada, limite de reason e extensão do piso a cook isolado continuam sem novas decisões. Seções abaixo preservam o histórico.

## Achados da primeira suíte real de compare — Item 4: resultados reais registrados

Entrega somente documental em [GROQ-TESTING.md](GROQ-TESTING.md): cinco chamadas relatadas pelo usuário, mesmo SYSTEM com prefixo sha256:5df03242..., sem mudança de código entre execuções. Registro separado do antigo M01 rejeitado antes da geração e das 26 chamadas de cook/ready. O Desenho A foi aceito em M01/M02/M05; isso não atribui aprovação de qualidade.

M01/M02: mesmo pedido enviado à IA, variação por não determinismo; não atribuir a recusa de M01 à herança de restrições ou ao campo de hora omitido. M02 confirmou ausência da hora sem default/zero, preço não informado e acúmulo dos dois motivos de indisponibilidade. O vazamento de tablespoon na prosa permanece somente observação; possível relação com instruções antigas não é causa comprovada nem proposta de correção.

M03 falhou em total_minutes antes de calcular com hora zero; esse caminho segue sem medição real. M04 registrou json_validate_failed, ready sem reason e corpo fornecido com final sintaticamente inválido, sem reparo nem causa única presumida. M05 passou estruturalmente com dois lados sem sugestão e motivos de indisponibilidade correspondentes, mas expôs campo interno e aplicou a despensa a ready; a exigência contraditória não comprova inexistência de delivery.

Decisões documentais: separar diagnóstico automático, observação relatada e avaliação humana; manter rubrica/notas em branco e null de usage sem preencher zero; registrar M06 como não executado. Não inventar datas/records/brutos ausentes nem apresentar os resultados como medição das instruções posteriores dos Itens 1–3. Nenhuma proposta nova de prompt ou limite.

Verificação: npm test executado, 218 aprovados, zero falhas e nenhum teste novo. Integração não reexecutada; 39 cenários do Item 2 são evidência anterior. Código, testes, contratos, schema, SYSTEM/hashes, cálculo e configurações intactos, sem chamada real/dependência/deploy ou etapas 3/4/5 de produto iniciadas. Item 5 ainda não iniciado; reexecuções com prompt atual e avaliação humana permanecem pendentes. Seções abaixo são histórico.

## Achados da primeira suíte real de compare — Item 3: motivos para a pessoa ler

Bloco COMPARE_REASONS exclusivo de compare: reason deve ser uma frase clara em pt-BR, sem expor nomes internos de campos, políticas ou valores do contrato no texto. Essa proibição não traduz nem renomeia as chaves/valores estruturados do JSON. Ready não usa a despensa ou aparelhos de casa e não herda ingredientes disponíveis, equipamentos, louça ou tempo de preparo; ausência doméstica não é fundamento de recusa para comida pronta. A exigência do prato pode ser contraditória ou inexistente como prato, mas isso não prova inexistência de oferta, entrega ou estabelecimento no mercado.

Decisão de implementação: manter as regras em um bloco de compare, fora de COMMON_RULES, para preservar integralmente cook/ready e a recusa legada. Não usar substituições de palavras, filtros automáticos ou reparo de motivos: um texto pode passar no contrato e ainda estar inadequado. O teste que devolve os motivos relatados de M05 preserva esse limite explicitamente; não preenche rubrica nem aprova a resposta.

Tamanho considerado: 500 caracteres permitem um parágrafo longo, mas não há avaliação no layout mobile que sustente um novo teto. Mantido o limite existente, sem proposta numérica nem mudança aplicada. Reavaliar com motivos reais e legibilidade na tela; limitar tamanho não resolve confusão semântica. Teste confirma o limite atual nos dois lados, sem truncamento.

Verificação: npm test executado, 218 aprovados, cinco novos, zero falhas; três testes verificam o SYSTEM efetivamente enviado, um a ausência de reparo semântico e um as fronteiras de comprimento. Integração não reexecutada neste item de prompt: os 39 cenários do Item 2 são evidência anterior, não execução nova. Nenhuma chamada real ou prova de obediência do modelo. M05 precisa de reexecução e avaliação humana; sucesso único não comprova consistência.

Hash compare mudou de sha256:2f454fac0d17cc18ee5e755174e498da629348d578f015e3bd14959ebb80eb1b para sha256:63d74e6ac173d2c970e9c80cb332d56c22788e5084442046b9e3c9a823a560d4. Cook/ready mantêm sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Medições anteriores não avaliam esta versão. Itens 4–5 não iniciados; M03 com hora zero, reexecução de M04 e extensão do piso a cook isolado continuam pendentes. Schema, contratos, cálculo, omissão da hora, ERRORS, flags e política intactos; sem dependência/deploy ou etapas 3/4/5 de produto iniciadas. Histórico preservado abaixo.

## Achados da primeira suíte real de compare — Item 2 concluído localmente

Instrução exclusiva em COMPARE_FORMAT: as três chaves status/suggestions/reason são sempre obrigatórias nos dois lados, com campo inativo null. O exemplo descreve o defeito de M04 (ready suggested sem reason apesar de cook completo), sem inserir o prato/resposta real no SYSTEM. Não há alteração do schema: o Desenho A já define essas chaves como obrigatórias e foi aceito em chamadas reais.

Decisões locais: reutilizar o pedido M04 da fixture e compartilhar somente entre testes o corpo completo posteriormente fornecido pelo usuário. O marcador sintético inicial foi substituído por message/type/code/failed_generation recebidos. Interpretamos os escapes de apresentação do chat, não corrigimos o conteúdo interno. Seus 576 bytes UTF-8 incluem um final sintaticamente inválido, preservado com teste de SyntaxError; a chave reason ausente não pode ser anunciada como causa única comprovada do 400. A reprodução preserva valores, não a serialização byte a byte de um arquivo bruto não anexado. A classificação e a sanitização existentes já atendem ao comportamento esperado, portanto nenhum código de tratamento de erros precisou mudar.

Verificação final do item: 213 testes Node aprovados (três novos no item), 39 cenários locais workerd/D1 aprovados (um novo no item), sem Groq real. Confirmados instrução enviada, regra existente do schema, preservação dos 576 bytes, PROVIDER_SCHEMA_REJECTED/502 sem diagnóstico privado, uma chamada e reserva mantida. A skill workers-best-practices orientou repetir a verificação HTTP no runtime existente com o corpo fornecido. Integração local autorizada, sem deploy; prompt e seu hash não mudaram neste complemento.

Compare mudou de sha256:a127aaea802a6650a2c110951d4d4a4e78cddea79346895e937616c804dfd590 para sha256:2f454fac0d17cc18ee5e755174e498da629348d578f015e3bd14959ebb80eb1b. Cook/ready mantêm sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. As medições anteriores não avaliam este SYSTEM. Reexecução real M04 e consistência do modelo seguem pendentes; não preencher rubrica humana nem marcar qualidade aprovada.

Itens 3–5 não iniciados. M03 com hora zero ainda não mediu o cálculo em chamada real, e cook isolado não recebeu a instrução de tempo. Contratos, schema, cálculo, omissão da hora, recusa legada, ERRORS, flags e política preservados. Nenhuma dependência, deploy ou etapa 3/4/5 de produto iniciada. O histórico abaixo não constitui novas medições.

## Achados da primeira suíte real de compare — Item 1 entregue localmente

Escopo aprovado após aviso sobre hashes: acrescentar o piso de 1 minuto apenas ao SYSTEM de compare, para seu lado cook. O contrato continua exigindo total_minutes inteiro de no mínimo 1; não foi relaxado nem há arredondamento/correção em código. Para preparos instantâneos, o modelo é instruído a estimar 1 minuto. max_dishes 0 continua válido: tempo mínimo e peças sujas são medidas independentes.

Decisão de implementação: bloco exclusivo de compare, fora de COMMON_RULES, porque alterar o bloco compartilhado mudaria também cook/ready. Hash desses modos permanece sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b; compare passa de sha256:5df032424dadf5064f5cb2b821ead35b0574c435d248e8dcc0dd1569aa724718 para sha256:a127aaea802a6650a2c110951d4d4a4e78cddea79346895e937616c804dfd590. Hash identifica texto, não desempenho: as cinco medições relatadas não avaliam o SYSTEM novo. A instrução em cook isolado fica pendente de autorização para mudar seu hash.

Verificação: npm test, 210 aprovados e zero falhas, incluindo dois novos testes com M03 simulado. Um inspeciona a requisição enviada e aceita 1 minuto com zero louça; outro confirma que zero continua INVALID_OUTPUT no campo total_minutes, sem reparo nem repetição. Isso não prova obediência do modelo nem contagem real de louça. M03 real e o cálculo com hourly_rate_brl 0 continuam sem reverificação/medição; a execução anterior falhou antes de calcular.

O relato do usuário confirmou a aceitação real do schema Desenho A em M01/M02/M05, superando essa pendência nas seções históricas abaixo. Schema preservado. Registro detalhado das cinco chamadas reservado ao Item 4; Itens 2–5 deste conserto não iniciados e avaliações humanas não preenchidas. Nenhuma mudança de contrato, cálculo, omissão de hourly_rate_brl, recusa legada, dependência, flags ou deploy; etapas 3/4/5 de produto não iniciadas. Integração não reexecutada: rota/banco intactos; resultados anteriores de 38 cenários não são uma execução nova.

## Compare — Fase 4: suíte e revisão preparadas

M01–M06 em fixture própria cobrem hora com centavos/ausente/zero, preparo favorecido pela preferência, cook inviável com ready viável, exigência contraditória nos dois lados e equipamentos/louça com tentativa de contorno. Prefixo M evita misturar ou renumerar C/E. O lote original de dez chamadas não cresce: compare só por seleção individual.

O instrumento reutiliza calculateComparison depois do sucesso do adaptador, sem duplicar fórmulas nem enviar contas à IA. comparison no record permite ao usuário confrontar o texto com as bases numéricas. Em falha operacional ou de saída, fica null mesmo quando há JSON estruturalmente válido. feasible null e expected_sides evitam uma falsa classificação única de viabilidade; refusal_channel permanece null para revisão por lado. Rubrica humana segue em branco.

[Rubrica e roteiro](GROQ-TESTING.md) exigem o mesmo pedido nos dois lados, preços nunca apresentados como consultados e coerência entre texto e métricas. Seis chamadas no roteiro completo; primeiras três: M01, M04 e M05. M03 favorece aproveitar o alimento pela preferência do usuário fictício, não por declarar economia total. M05 testa contradição do pedido, não disponibilidade real de delivery.

201 testes Node aprovados, dez novos e nenhuma chamada real. Não reexecutada integração porque não houve mudança de rota/banco; os 38 cenários aprovados da Fase 3 permanecem histórico. Compare usa uma tentativa de geração na API, não duas; o CLI ignora a cota do app e consome diretamente a conta Groq. Flags desligadas, política vazia, parâmetros/prompt/schema/calculadora preservados, sem nova dependência ou publicação.

Preparação das quatro fases concluída localmente, não comprovação da qualidade do compare. Medições reais e preenchimento da rubrica dependem do usuário; não calibrar quota nem iniciar histórico/interface/PWA/publicação por consequência desta entrega. As seções seguintes preservam os estados históricos.

## Compare — Fase 3: adaptador e fluxo local verificados

Implementados schema estrito meal_compare_v1 e SYSTEM por modo. A composição reutiliza os blocos comuns e mantém cook/ready byte a byte, verificado pelo hash anterior. Compare usa status por lado, 1–2 alternativas quando sugerido e motivo quando não sugerido; preço ready continua opcional e rotulado no dado. Não altera o contrato nem a matemática aprovados.

A exceção de schema foi aprovada antes de implementar: estrutura/campos/enums no provedor, limites completos no validador local. Arrays/textos/números mantêm folgas documentadas; tamanho do motivo e faixa/centavos do preço são novos limites locais, não restrições garantidas pela Groq. Não escolher por extensão uma mudança global dos schemas legados. [Detalhamento e fonte oficial](COMPARE-PROVIDER.md).

As guardas da Fase 1 foram removidas em conjunto com o adaptador pronto. A rota faz uma reserva generation e uma chamada para os dois lados, valida o resultado e acrescenta comparison calculado em código. O campo estruturado hourly_rate_brl fica apenas local, pois não é necessário à IA. Não mudar a saída de cook/ready nem mandar cálculos de volta ao modelo.

191 testes Node (nove novos) e 38 cenários workerd/D1 locais aprovados (quatro cenários adicionais e substituição do bloqueio antigo). A skill de boas práticas de Workers orientou testar a remoção das guardas na mesma entrega e conferir reserva/cálculos no runtime existente. Sem Groq real, dependência ou implantação.

Hash de compare calculado localmente: sha256:6434be14cac000c83b6cb184f9f832b70d09b4aba1f0a9b78a5b189588364129; cook/ready mantêm sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Não são medições de tokens. Parâmetros 4.096 mantidos, flags false e QUOTA_POLICY_JSON vazio; não há compare público ativo.

Fase 4 deste pedido permanece pendente: suíte própria, rubrica humana e plano de medições. Não adicionar casos ao lote C01–C10 ou preencher avaliações nesta fase. Etapas de histórico/interface/publicação não iniciadas; demais seções abaixo são o histórico das entregas.

## Compare — Fase 2: contas puras e diferença parcial

Concluída localmente após o usuário aprovar a interpretação limitada: o contrato não contém custo dos ingredientes nem tempo de entrega. O novo módulo [comparison/calculate.js](../src/comparison/calculate.js) valida entrada e saída compare, preserva a duração como estimativa e calcula apenas o custo desse tempo e a diferença entre preço estimado de ready e custo do tempo de cook. Não é economia total nem duração real comprovada.

Decisões de implementação: cruzar todas as alternativas (até quatro pares), sem escolher vencedor; representar ausência com status/reason_codes, não zero; carregar origin e based_on_estimates com referências às bases; manter valor da hora ausente sem default e zero explícito como valor válido. Custo do tempo usa toda a duração declarada, não tempo ativo inferido. Cada comparação inclui escopo parcial e custos excluídos no dado.

Aritmética em centavos inteiros: arredondar o custo do tempo ao centavo mais próximo, meio centavo para cima, e subtrair do preço usando esse custo arredondado. Assim a diferença coincide com os valores exibidos. Tetos atuais mantêm o numerador inteiro dentro da precisão de Number; sem dependência nova. O cálculo isolado aceita zero minutos, sem mudar o contrato de receita (mínimo um).

182 testes Node aprovados, 16 novos. Integração não reexecutada porque nenhum código de rota/banco/adaptador mudou; o módulo está desconectado do fluxo de rede. [Documento de cálculos](COMPARISON-CALCULATIONS.md) define funções, rótulos, caminhos, arredondamento e limitações.

Fases 3 e 4 deste pedido ainda pendentes: prompt/schema/adaptador e instrumento/rubrica. Nenhuma chamada real, interface, persistência de produto ou publicação. A composição por modo aprovada ainda não foi implementada, e as guardas da Fase 1 permanecem. As seções abaixo registram o estado histórico de cada entrega.

## Compare — Fase 1: decisões aprovadas e contrato verificado

O usuário aprovou Desenho A, uma a duas alternativas por lado e composição do SYSTEM por modo. Sem nova decisão de viabilidade: o contrato agora representa ambos os lados explicitamente; not_suggested exige motivo e não aceita suggestions, enquanto suggested exige 1–2 alternativas. Ambos sem opção passam no contrato, sem novo ERRORS; isso não altera cook/ready isolados ou a divergência da lista vazia.

A função interna de validação de sugestão foi compartilhada para manter porções, tempo, ingredientes, unidades e passos idênticos às regras antigas. validateCookingConstraints também é reutilizada, não copiada. hourly_rate_brl é opcional (0–100.000, centavos): limite técnico no patamar de budget_brl, zero explícito e ausência sem default. O preço opcional do lado ready é um objeto com value (0,01–100.000 reais para todas as porções da alternativa) e origin obrigatoriamente estimado. A estrutura mantém rótulo e valor juntos, sem usar zero para representar preço desconhecido.

Durante a integração, apareceu uma reserva de geração antes da guarda do adaptador. O usuário autorizou a proteção também na rota, imediatamente após a validação da entrada e antes dessa reserva. Mantidos ingress, sessão e verificações anteriores. Nenhum estorno nem mudança da asserção de quotaReserved para esconder o problema. A suíte final confirma quatro compare bloqueados e, depois, três cook bem-sucedidos para o mesmo visitante.

Verificação: 166 testes Node (19 novos) e 34 cenários de integração local (um cenário dedicado novo), aprovados. A skill de boas práticas de Workers orientou verificar a fronteira de reserva no runtime existente, com workerd/D1 locais e Groq simulada, sem novas dependências. O bloqueio inicial do empacotador por permissão foi contornado executando o mesmo teste com autorização; não alteramos o harness para ignorar erro.

SYSTEM e schema antigos preservados, inclusive hash do texto enviado por cook/ready. A implementação de SYSTEM por modo fica na Fase 3; ela preservará o texto atual, não transformará as 26 medições históricas em medições dele. 4.096 de conclusão e reserva decidida mantidos; QUOTA_POLICY_JSON continua vazio. Folgas de schema versus validador e suporte aos operadores continuam pendentes, conforme a proposta existente.

Fase 2 ainda não iniciada: custo do tempo, diferenças e proveniência de valores derivados. Fase 3 ainda não iniciada: geração/schema/prompt compare. Fase 4 deste pedido ainda não iniciada: fixture de avaliação e rubrica compare. Nenhuma chamada real ou prova de qualidade; etapas 3/4/5 de produto não iniciadas. Próxima ação depende da aprovação da Fase 1.

## Unidades após reverificação — Itens 2–4: decisões ainda abertas

Entrega conjunta autorizada pelo usuário, somente documentação. [Proposta do Item 2](SCHEMA-ALIGNMENT-PROPOSAL.md): o suporte estrito da Groq aos quatro operadores de comprimento/quantidade não ficou confirmado nas fontes oficiais consultadas. Alternativas comparadas sem escolha; não adicionar operadores por analogia com outro provedor. Confirmação de compatibilidade e autorização delimitada são pré-condições de eventual implementação.

[Rodadas 2/3 registradas](GROQ-TESTING.md): seis reexecuções e duas repetições de C05, todas atribuídas ao prefixo sha256:178b6bb... fornecido, sem inventar hash completo, notas humanas ou arquivos brutos. Isso substitui o status histórico de ausência dessa medição. E06/E05 e nomes de C10 melhoraram nas respostas relatadas; C01 continua incompleto, C10 mantém incoerência de tempo/ingredientes, e C05 é intermitente. Nenhuma dessas observações é uma nova regra de prompt ou aprovação geral.

Custo observado no cook: entrada 838–897 → 1.084–1.119, aproximadamente 28–29% nos pares comparáveis; maior total disponível 2.124 (51,9% de 4.096). Falhas sem uso continuam desconhecidas. Não extrapolar para ready, futuros pedidos ou o prompt de unidades do Item 1, posterior a essas rodadas. A estimativa do Item 1 abaixo permanece estimativa.

[Roteiro do Item 4](UNITS-RETEST.md): três C05 + um C10, porque ambos usam suggest e C10 amplia volume/variedade. Repetições definidas antes das respostas; não executar até conseguir sucesso. Preparação entregue, execução e interpretação humana pendentes. Mesmo quatro passagens só descrevem a amostra, sem garantir ausência de intermitência.

Sem decisões novas de produto: recusa por lista vazia e cortesia B mantidas, compare não implementado, nenhuma flag/cota calibrada. Etapas 3/4/5 de produto não iniciadas. As seções abaixo preservam o histórico; “não executado” no Item 1 refere-se àquela entrega, não apaga o registro documental agora concluído.

Verificação desta entrega documental: npm test executado, 147 testes aprovados, zero falhas. Sem testes novos ou chamadas reais; integração não reexecutada porque código/runtime não mudaram. Código, testes, configurações, contrato de geração e ERROR-BUDGET preservados por comparação de hashes.

## Unidades após reverificação — Item 1: uma fonte para três representações

UNIT_CHOICES é exportada como lista congelada em src/contracts/generation.js, no estilo de EQUIPMENT_CHOICES. O validador consulta essa lista; o schema referencia a mesma lista; o SYSTEM interpola seu join. Não há terceira cópia manual no prompt. As nove opções e o JSON Schema serializado mantêm os valores anteriores; não foi ampliada a linguagem aceita pelo contrato.

O texto agora enumera os identificadores exatos, sem traduções como unidade/dentes/colher ou variação de caixa. Acrescentada apenas a informação de formato de que steps não admite item vazio ou só espaços. O validador já rejeitava esses passos e permanece igual; não limpar, descartar ou reparar saída inválida. Nenhuma nova regra de julgamento culinário foi acrescentada.

Quatro testes novos conferem lista congelada, identidade do enum, comparação exata com a lista textual enviada, aceitação de todas as unidades, rejeição de traduções/caixa/espaços, vínculo do validador à fonte e instrução contra passos vazios. O teste do vínculo no código evita que uma futura lista paralela no validador aceite extras sem aparecer nos demais lugares. Cópia da lista em teste serve de oráculo do contrato anterior, não de fonte do produto.

**Tokens: estimativa, não contagem do tokenizer ou medição Groq.** Texto efetivo do SYSTEM passou de 3.498 para 3.754 caracteres: +256, incluindo as duas quebras de linha novas. Usando somente como aproximação a proporção de 1.084–1.119 tokens de entrada relatada pelo usuário para o texto anterior:

- Lista literal das nove unidades: 52 caracteres; 52/3.498 × 1.084–1.119 ≈ **16–17 tokens**.
- Parágrafo completo de unidades, incluindo instrução de identificadores: 190 caracteres; ≈ **59–61 tokens** (sem sua quebra de linha).
- Acréscimo completo, incluindo passos não vazios e quebras: 256 caracteres; ≈ **79–82 tokens** por chamada, nesta aproximação.

A entrada relatada inclui conteúdo além do SYSTEM, e identificadores técnicos podem ter densidade de tokens diferente do português. Portanto os intervalos são aproximações por comprimento, não limites garantidos, nem calibração ou consumo confirmado. A conta não somou raciocínio nem alterou reserva/parâmetros. O valor exato exige tokenizer compatível ou medição do provedor; nenhum deles foi executado nesta entrega.

O hash capturado localmente do prompt novo em transporte simulado é sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b. Isso identifica o novo texto, não uma chamada real. O versionamento existente registrará automaticamente a identidade nas próximas avaliações; não atribuir ao prompt novo os resultados anteriores de prefixo 178b6bb relatados pelo usuário. O registro formal dessas rodadas pertence ao Item 3, ainda não executado.

Verificação: 147 testes Node aprovados (quatro novos) e 33 cenários de integração local aprovados (nenhum cenário novo), com D1 descartável e Groq simulada. A skill de boas práticas de Workers orientou conferir a fonte compartilhada e o fluxo no runtime local sem instalar dependências. Nenhuma regra de recusa/cortesia, schema mais estrito, novo modo, flag, política, UI ou persistência alterada. Entregar somente o Item 1; a proposta do Item 2 depende de pesquisa oficial futura e não foi escolhida ou implementada aqui.

## Correções após a rodada real — Item 4: identificação e reverificação

Escolhido hash automático do texto exato enviado, em vez de contador manual sujeito a esquecimento. O avaliador Node usa node:crypto e grava request_settings.system_prompt_version no record de cada caso, sem copiar o SYSTEM, modificar o adaptador ou acrescentar campo à resposta da API. Falhas também carregam a identificação quando o registro consegue ser salvo. Manifesto/resumo não mudaram; comparações exigem os registros individuais. O hash não cobre entradas, modelo, parâmetros ou código de transporte: esses dados também precisam acompanhar a análise.

Rodada antiga preservada em [GROQ-TESTING.md](GROQ-TESTING.md) e marcada legacy-unversioned (antes dos Itens 1/2, sem hash capturado). Não reescritos resultados privados nem atribuída identidade calculada a chamadas cujo SYSTEM não foi registrado. Mudança de instruções exige separar as rodadas; comparar antes/depois explicitamente não permite tratá-las como amostras do mesmo prompt.

Roteiro principal para execução pelo usuário: E06, C01, C05, C10, E05 e C07. E05 foi acrescentado porque verifica o atalho de utensílio por dedos; C07 só exercita o novo ramo quando o erro de esquema ocorrer, e o CLI não comprova o HTTP público da rota. E04/C08 e demais controles são opções posteriores, não expansão automática de chamadas. Nenhum fixture, parâmetro, orçamento, lote ou retry alterado. A rubrica continua humana e resultado bom isolado não prova correção geral de um modelo não determinístico.

143 testes Node aprovados, quatro novos, sem rede real. Integração não reexecutada: alteração restrita ao instrumento Node e documentação; os 33 cenários do Item 3 permanecem evidência anterior, não execução deste item. SYSTEM, contratos, esquema, validadores, mapeamento de erro e cortesia ficaram intactos. Os quatro itens de correção estão entregues localmente; reverificação pelo usuário continua pendente. Nenhuma publicação, migração ou etapa de produto iniciada. Parar após esta entrega, sem executar a rodada.

## Correções após a rodada real — Item 3: erro upstream separado

Escolhido PROVIDER_SCHEMA_REJECTED para distinguir rejeição do JSON gerado pelo provedor de INVALID_OUTPUT (parser/contrato local). HTTP 400 com error.code exatamente json_validate_failed recebe 502 e mensagem fixa em pt-BR, sem atribuir culpa ao visitante. HTTP 400 genérico e 413/415/422 continuam PROVIDER_REJECTED_REQUEST/422 com mensagem neutra para as duas rotas. Não procurar palavras em message nem analisar failed_generation; isso seria frágil e processaria conteúdo não confiável desnecessariamente.

Reutilizada a leitura limitada já existente, com 256 KiB e prazo do transporte. Se o corpo do 400 não permitir diagnóstico completo, manter a rejeição genérica conhecida, inclusive se a leitura expirar; não criar TIMEOUT elegível à cortesia a partir dessa falha de diagnóstico. Demais status preservam o tratamento anterior. Nenhuma dependência ou novo formato de saída de geração.

Novo código deliberadamente excluído da cortesia: injeção pode induzi-lo, conforme C07. Não há mecanismo atual de crédito nem elegibilidade por status HTTP a corrigir; comentário no código e [ERROR-BUDGET.md](ERROR-BUDGET.md) preservam a lista elegível por código, sem implementar B. Uso não reportado permanece indisponível; reserva não é estornada. O registro bruto privado do avaliador continua sendo gravado antes da validação, sem expô-lo na mensagem da API.

Verificação: 139 testes Node aprovados (oito novos) e 33 cenários de integração local aprovados (cinco novos), com banco descartável e Groq simulada. Cobertos código exato, outros códigos/formas/status, corpo inválido/excessivo/lento, ausência de uso, diagnóstico do avaliador, mensagens nas duas rotas, reserva, ausência de retry e bloqueio da quarta tentativa. Isso não comprova resgate de crédito nem nova resposta real de C07. A skill de boas práticas de Workers orientou leitura limitada e verificação no runtime local, sem alterar infraestrutura.

Prompts dos Itens 1/2, contratos, esquema, validadores, parâmetros, flags e política intactos. Divergência da recusa por lista vazia continua aberta. Sem chamada real, estorno, crédito, deploy ou migração remota. Item 4 (versão e plano de reverificação) não iniciado; entregar somente o Item 3 e parar para aprovação.

## Correções após a rodada real — Item 2: zero não implica inviabilidade

Adicionada somente uma instrução ao SYSTEM: max_dishes 0 pede nenhuma peça reutilizável suja; consumir o alimento como está, descascando, abrindo ou servindo direto, é resposta válida quando compatível com os ingredientes e demais restrições. O exemplo de descascar a banana e comer esclarece E06. Zero isoladamente não autoriza recusa. A ressalva de compatibilidade mantém a segurança e não obriga a sugerir consumo de qualquer alimento cru; a proibição de substituir utensílio por dedos para caber na louça permanece intacta.

Faixa aceita, contrato de entrada/saída, JSON Schema, documento de contrato e testes anteriores não mudaram. Não há contagem semântica de peças, receita automática de fallback ou reparo da lista vazia. A frase geral de recusa segue intacta; seu canal incompatível com o contrato continua aberto por decisão do usuário.

131 testes Node aprovados, dois novos; 28 cenários de integração local aprovados com Groq simulada/D1 descartável. Testam instrução enviada e preservação do fluxo, não a obediência real de E06. A skill de boas práticas de Workers orientou conferir o adaptador no teste local existente, sem alterações de infraestrutura. Nenhum novo pacote, retry, estorno, chamada real, mudança de cortesia, deploy ou migração remota.

A rodada anterior não mede o prompt dos Itens 1 e 2 combinados; a estimativa de tokens documentada no Item 1 não inclui este acréscimo. Parâmetros/cotas não foram alterados. Versionamento e reverificação formal ficam para o Item 4 das correções; o mapeamento de erro do Item 3 também não foi adiantado. Entregar este Item 2 e parar para aprovação.

## Correções após a rodada real — Item 1: instruções de geração

Acrescentadas somente instruções ao SYSTEM de `src/providers/groq.js`: receita inteira do primeiro preparo ao servir; uma frase por passo sem prefixo numérico; todo ingrediente usado nos passos presente em ingredients com quantidade, inclusive em suggest; tempo incluindo hidratação, dessalga e cozimento de crus; nomes reais/reconhecíveis em pt-BR, sem combinar nomes ou inventar cortes; não substituir utensílio por mãos/dedos como atalho para max_dishes. As regras são concisas e preservam as defesas e restrições anteriores.

O adaptador não limpa numeração nem repara receitas: um teste mantém strings iniciadas em 4, 5 e 6 para não esconder indícios de etapas ausentes. Outros cinco testes verificam cada grupo de instruções no pedido enviado. São testes do envio, não evidência de obediência do modelo. Não há nova validação semântica de louça ou mudança de contrato/esquema.

Estimativa por proporção de texto, não tokenização: SYSTEM anterior com 2.413 caracteres, novo com 3.142, acréscimo de 729 (**30,2%**). Aplicando 729/2.413 aos **838–897 tokens de entrada de cook relatados pelo usuário**, resulta em aproximadamente **253–271 tokens adicionais**, ou cerca de **250–270 por chamada cook**. A densidade de tokens foi assumida constante; a entrada medida inclui pedido/esquema e outros custos, não só SYSTEM, portanto essa aproximação pode superestimar a contribuição e não é teto garantido. Não aplicar a faixa de cook como medição de ready (754 na rodada), nem inferir consumo de compare. A quantidade exata adicional exige o tokenizer compatível ou nova medição, não foi obtida aqui. Nenhuma dependência, ajuste de 4.096, reasoning_effort, reserva ou cota foi feito.

O consolidado real e as decisões D1–D4 estão registrados em [GROQ-TESTING.md](GROQ-TESTING.md), a partir do material enviado pelo usuário, não de nova chamada ou inspeção dos arquivos brutos completos. Correção aritmética documentada: a tabela vai de 925 a 2.098 tokens totais disponíveis; C07 não informa uso. Preservadas as decisões de parâmetros e de não implementar compare sem pedido específico.

**Comparabilidade:** a rodada anterior pertence às instruções anteriores; não comprova que as regras novas funcionaram. Identificação de versão e plano formal de reverificação ficam para o Item 4 deste pedido. Itens 2 (zero louça) e 3 (erro de esquema upstream) também não foram adiantados, e a divergência de recusa permanece aberta. Não preencher nota de rubrica nem marcar verificação real do prompt atual.

Verificação: 129 testes Node aprovados, seis novos; 28 cenários de integração local aprovados, sem novos cenários e com Groq simulada/D1 descartável. A primeira execução de integração foi bloqueada por acesso negado no empacotador; a reexecução autorizada fora do sandbox passou. Nenhum deploy, push, migração remota, UI, histórico, retry ou estorno. A skill de boas práticas de Workers orientou verificar o adaptador no fluxo local existente, sem mudar a infraestrutura. Entregar somente este item e parar.

## Retomada do Item 4 — preparar a evidência que falta

Após o Item 8, retomado somente equipamento/louça: oito casos E01–E08, seleção individual no CLI existente e [rubrica de revisão](EQUIPMENT-REVIEW.md). O lote C01–C10 não cresceu. Reuso do instrumento mantém bruto salvo antes da validação, parâmetros e diagnósticos independentes; não há outro modelo julgador ou correção automática.

Verificação desta retomada: 123 testes Node aprovados, sete novos; listagem E01–E08 executada sem rede. Integração não reexecutada, pois rotas e banco ficaram intactos. A verificação real de obediência continua pendente da execução/revisão pelo usuário, sem resultado inventado. Nenhuma alteração do prompt/contrato, solução da recusa, contagem garantida, migração, dependência, UI ou deploy. Item 5 permanece para uma entrega separada, não iniciado aqui.

## Item 8 — caminho crítico documentado, produto ainda pendente

[CRITICAL-PATH.md](CRITICAL-PATH.md) organiza as tarefas existentes em dois marcos: primeira geração real por texto no celular com limite verificado (M1) e demo PWA completa acordada (M2). Sem medições reais de geração, política aprovada, interface e verificação em ambiente publicado, M1 ainda não foi alcançado.

Histórico, fotos e instalação não são dependências técnicas da primeira resposta por texto, mas permanecem requisitos da demo prometida; diário, personalização e compartilhamento também não foram descartados. As etapas 3, 4 e 5 concentram o trabalho de produto ainda não implementado. Não há estimativa de prazo ou porcentagem de conclusão.

116 testes existentes aprovados nesta revisão documental; integração não executada novamente. Nenhuma implementação, mudança de arquitetura ou publicação. Próxima retomada após aprovação: pendências de 4 e depois 5, sem chamadas reais, cotas ou migrações inferidas automaticamente.

## Item 7 — B na demo PWA; A reservada para o aplicativo

[CALORIE-OPTIONS.md](CALORIE-OPTIONS.md) compara integrar TACO com associação revisada, massa/estado compatíveis e cálculo em código versus retirar calorias do escopo/comunicação. A fonte tem arquivos oficiais acessíveis sem cobrança e autorização de reprodução com atribuição; isso não resolve nomes livres, medidas caseiras ou composição de delivery.

Decisão do usuário: retirar calorias e valores nutricionais da demo PWA (B) e reservar a integração com fonte real (A) para a futura fase do aplicativo. A promessa da demo foi removida do README e do item correspondente de escopo, mantendo a tarefa restante desmarcada. Não há tabela incorporada, cálculo, alteração de contrato executável ou funcionalidade nutricional implementada. Esforço técnico documentado é estimativa, não resultado.

Na futura fase do aplicativo, retomar A com identificação revisada dos alimentos, massas e preparo compatíveis, fonte/versão rastreáveis e cálculo em código; aceitar indisponibilidade quando faltar base. Revalidar condições de uso, dados e custos nessa ocasião. O adiamento é uma decisão de escopo, não uma solução automática dos problemas de correspondência por mudar de plataforma. Referência e requisitos foram preservados em CALORIE-OPTIONS.md.

116 testes existentes aprovados; integração não executada novamente. Não equivale a teste nutricional ou de publicação. Esta revisão altera apenas o escopo nutricional autorizado; não inicia histórico, UI/PWA ou publicação.

Item 8 agora entregue como planejamento em CRITICAL-PATH.md. Retomar as pendências dos Itens 4 e 5 na ordem solicitada após aprovação; nenhuma etapa de histórico, interface/PWA ou publicação foi iniciada.

## Ordem solicitada: Itens 6, 7 e 8; depois pendências de 4 e 5

Decisão do usuário em 2026-09-11: seguir com 6 e 7, preservando entregas separadas, concluir 8 e só então retomar os pontos pendentes de 4 e 5. Isso não modifica as etapas de produto nem autoriza publicação ou uso de chave privada.

- Item 4: o contrato de entrada e as instruções já foram entregues. Retomar a avaliação real de cumprimento de equipamentos/louça e a limitação de contagem na saída. Não refazer o item, inventar validação semântica ou resolver a divergência de recusa automaticamente; chamadas reais continuam a cargo do usuário.
- Item 5: B está escolhida, mas não implementada. Retomar o contrato técnico de consulta/resgate, tetos de créditos por rede/globais e a implementação local desativada que estava em discussão. Valores não medidos continuam pendentes; não ligar créditos ou alterar cotas por suposição.

## Item 6 — instrumento local, sem decisão de desempenho

Preparado [measure-image-path.mjs](../scripts/measure-image-path.mjs), comando npm run measure:images: processos Node separados para 0,5, 2 e 5 MiB, upload/assinatura/base64 reais com bytes sintéticos, duração, CPU e pico RSS do processo. Nenhuma chamada ao provedor ou mudança no fluxo do produto. O pico inclui inicialização e amostra, não só o processamento.

116 testes Node aprovados, cinco novos; três medições dedicadas concluídas. Integração não executada novamente; nenhuma rota ou banco alterado. Não comprova limites Free, fotos reais ou celular. As três alternativas se houver excesso na nuvem permanecem sem escolha em [IMAGE-PATH-MEASUREMENT.md](IMAGE-PATH-MEASUREMENT.md). Aviso de original/metadados em [PHOTO-UPLOAD-NOTICE.md](PHOTO-UPLOAD-NOTICE.md), apenas texto, sem UI ou remoção de dados. Item 7 não entregue neste item; etapas 3, 4 e 5 de produto intocadas.

## Item 5 — opção B escolhida, sem implementação

Desenho entregue em [ERROR-BUDGET.md](ERROR-BUDGET.md): (A) manter três tentativas sem compensação; (B) uma tentativa de cortesia limitada por falha registrada; (C) concessão após revisão de incidente. O usuário escolheu B, com no máximo uma cortesia por visitante/dia UTC, sem acumular ou gerar créditos em cadeia. Os códigos INVALID_OUTPUT, TRUNCATED e TIMEOUT não comprovam isoladamente culpa do aplicativo; recibos atuais não guardam a causa da falha ou créditos.

B exige extensão da persistência técnica de cotas, reserva/resgate atômicos e orçamento aprovado, não persistência de refeições. Tetos adicionais por rede/globais e contrato de consulta/resgate continuam pendentes; implementação local desativada é uma alternativa a confirmar, não iniciada. Recuperar a mesma receita perdida ou revisar conteúdo passado depende da etapa 3 e não faz parte do benefício proposto. Nenhuma migração, contrato, prompt, cota ou interface alterados. Etapas 3, 4 e 5 de produto preservadas; compare permanece bloqueado por medições.

Suíte existente executada neste item documental: 111 testes Node aprovados. Integração não executada novamente; nenhuma rota ou banco alterado. Testes futuros de créditos estão descritos, não implementados nem aprovados por essa execução.

## Item 4 — restrições de preparo, com item 3 ainda bloqueado

A pedido do usuário, o item 4 foi executado antes de `compare`: `cook` agora aceita equipamentos disponíveis/proibidos em listas fechadas e limite opcional de 0–20 peças sujas no preparo. Entrada validada e instruções encaminhadas ao modelo; cumprimento semântico na saída não é garantido nem contado. Contrato de saída e frase de recusa preservados. Definições em [GENERATION-CONTRACT.md](GENERATION-CONTRACT.md).

Verificação local: 111 testes Node e 28 cenários workerd/D1 descartável, sempre com Groq simulado. Sem dependências novas, persistência ou UI. O futuro `compare` deverá reutilizar as regras compartilhadas, mas continua rejeitado e bloqueado até as medições de tokens; não foi implementado. Não se iniciou nenhuma das etapas 3, 4 e 5 de produto (histórico, interface/PWA e publicação).

## Item 2 — health com motivos de indisponibilidade

Implementado e verificado localmente: `/api/health` mantém os campos existentes e no-store e acrescenta `reasons` por operação, com categorias fixas de flag, política, segredo, binding e falha inesperada. Compartilha a checagem de configuração com as rotas, sem consultar D1 ou Groq. Detalhes e precedência em [USAGE-FLOW.md](USAGE-FLOW.md).

`npm test`: 98 testes aprovados; integração workerd/D1 descartável: 25 cenários aprovados, com Groq simulado. Não comprova saldo, migração, acesso real ao modelo ou funcionamento na nuvem. Flags e política permanecem desligadas/vazia. Nenhuma mudança no escopo ou execução das etapas 3, 4 e 5; item 3 deste pedido também não foi iniciado.

## Item 1 — avaliação antes de decidir mudanças no modelo

Instrumento local preparado em `scripts/generation-quality.mjs`, acessível por `scripts/groq-smoke.mjs evaluate`: dez pedidos fictícios, bruto salvo antes da validação, diagnóstico estrutural e campos separados de canal de recusa e rubrica humana. Testes simulados executados por `npm test`; não são medição de qualidade. Protocolo e tabelas vazias em [GROQ-TESTING.md](GROQ-TESTING.md).

Somente o usuário executará chamadas reais com sua chave privada. Orçamento de tokens, `reserveTokens`, suficiência de 4.096 tokens de saída, esforço de raciocínio e qualidade pt-BR continuam sem aprovação baseada em medição. A divergência está na orientação de lista vazia do prompt frente ao contrato/teste/documentação de 1–3 sugestões; correção pendente de dados e escolha do usuário, sem alteração neste item.

Esta entrega não inicia histórico, interface/PWA ou testes/publicação da demo (etapas 3, 4 e 5 do plano do usuário). As seções abaixo permanecem com seu escopo anterior; o instrumento registra, não corrige ou publica.

Estado técnico em 2026-09-11: limites e fluxo do backend concluídos localmente com provedor simulado, conforme [USAGE-FLOW.md](USAGE-FLOW.md). Configuração pública segue desligada e calibração/validação na nuvem pendentes. Próxima etapa de produto: persistência e exclusão do histórico; reteste visual adiado.

## Decisão de escopo: diário alimentar e sugestões pelo histórico

Adicionada em 2026-09-11 a pedido do usuário. **Planejada para a demo, ainda não implementada.** Entra na frente de Histórico (etapa 3 do resumo apresentado ao usuário), com interface na etapa seguinte. A etapa anterior de limites e reserva atômica foi integrada localmente; a liberação pública continua pendente. O reteste de fotos permanece adiado.

Objetivo: registrar opcionalmente o que a pessoa realmente comeu e usar esse histórico para sugerir receitas e opções de comida pronta mais relevantes. Entender hábitos registrados e preferências, não diagnosticar uma dieta ou avaliar adequação nutricional.

### Registro simples e voluntário

- Ação “Comi isso” em uma sugestão escolhida, com confirmação da refeição e data/hora; permitir corrigir a data para registros retroativos.
- Entrada manual para refeições fora das sugestões do app, incluindo delivery. Campos mínimos propostos: descrição da refeição e quando foi consumida; formato e limites serão definidos no contrato de consumo.
- Não exigir que a pessoa registre todas as refeições. Não tornar o diário requisito para gerar sugestões.
- Gerar, salvar ou selecionar uma sugestão não cria consumo. Confirmar consumo também não significa avaliar positivamente o prato; não inferir que a pessoa gostou de tudo o que comeu.
- Permitir consultar, editar e excluir registros; impedir duplicação involuntária por clique repetido ou reenvio, sem impedir refeições iguais em momentos diferentes.

### Personalização opcional

- Controle explícito “Usar meu histórico nas sugestões” em Configurações → Personalização, desligado por padrão e alterável a qualquer momento dentro do app. Registrar refeições não autoriza automaticamente enviar esse histórico à IA.
- Salvar a escolha por visitante para recuperá-la ao voltar no mesmo navegador com sessão válida. Mostrar confirmação de salvamento ou erro; não indicar que a alteração foi salva antes da confirmação do servidor. Ausência de permissão válida impede incluir histórico na geração.
- Quando ativado, usar somente um recorte recente e limitado dos registros do próprio visitante. Definir janela, número de registros e orçamento de tokens na implementação; não enviar todo o diário nem fotos.
- O backend seleciona o contexto a partir da sessão autenticada e consulta a preferência salva antes de preparar cada novo envio à IA. Explicar antes da ativação que esse recorte será processado pelo Groq. Desligar impede uso em novos envios após a confirmação da alteração, mas não desfaz chamadas já enviadas ou em andamento. Não apaga o diário nem as sugestões anteriores: excluir registros é uma ação separada e os remove do contexto futuro. Reativar volta a permitir o uso do recorte recente dos registros mantidos.
- Usar o contexto para propor variedade e evitar repetições indesejadas, respeitando sempre o pedido atual, o modo, ingredientes, tempo, orçamento e preferências explícitas. Histórico não deve substituir essas escolhas nem criar proibições alimentares.
- Explicações devem se apoiar apenas nos registros disponíveis, por exemplo “Você registrou macarrão duas vezes nesta semana; quer variar?”. Não afirmar conhecer a alimentação completa, inferir doenças, alergias ou necessidades nutricionais, nem usar linguagem de culpa.
- Sem histórico ou com personalização desligada, a geração continua funcionando com o formulário normal. Nenhuma chamada de IA deve ocorrer só por registrar/editar uma refeição; o contexto entra na geração solicitada, sujeita às cotas existentes.
- Para delivery, sugerir pratos e termos de busca, sem integração externa, restaurantes, disponibilidade, preços ou prazo de entrega inventados.

### Persistência e critérios de conclusão

Reaproveitar a tabela existente `meal_logs`, com `visitor_id`, `eaten_at`, `data_json` e vínculo opcional `plan_id`. O registro manual não exige plano. O contrato de `data_json`, a preferência de personalização e a seleção de contexto ainda precisam ser definidos/testados; esta decisão não cria migração nem altera o contrato JSON executável de geração.

- Testar registro manual e “Comi isso”, edição/exclusão, data retroativa, repetição legítima e reenvio sem duplicação.
- Verificar isolamento entre visitantes em leitura, escrita e seleção do contexto enviado à IA.
- Testar ativação/desativação/reativação pelas configurações, escolha preservada ao reabrir com sessão válida, falha ao salvar, respeito da preferência pelo servidor, diário preservado ao desligar, histórico vazio, contexto limitado, exclusão refletida em gerações futuras e prioridade do pedido atual.
- Resumos semanais/mensais e cartões devem usar apenas refeições registradas, nunca planos como se fossem consumo. Não transformar dias sem registros em dias sem alimentação.
- Revisar retenção, exclusão e limitações da sessão anônima antes da liberação; diário não implica recuperação entre dispositivos. Ver [sessões](SESSIONS.md).

## Ideia futura: integrações de saúde

Registrada em 2026-09-08 a pedido do usuário: Apple Health, Samsung Health e ecossistema Google Health. Fora da demo, sem integração ou coleta implementada.

- Avaliar primeiro exportação opcional de refeições confirmadas como consumidas e nutrientes com origem confiável, porção e unidades validadas. Nunca exportar plano sugerido como consumo nem números inventados pela LLM como medições.
- Apple Health: HealthKit em camada nativa iOS, com permissões por tipo e finalidade; não acessível diretamente pela PWA.
- Android: avaliar Health Connect para dados locais e interoperabilidade com apps compatíveis, validando tipos e sentidos de sincronização do Samsung Health. Integração direta Samsung Health Data SDK pode exigir parceria para distribuição.
- Google: distinguir Health Connect (no dispositivo) da Google Health API (integração web/cloud para dados Google/Fitbit). Não iniciar pelas APIs legadas Google Fit. Cobertura de nutrição, escrita, aprovação e custos ainda precisam ser verificados; não prometer paridade entre plataformas.
- HealthKit e Health Connect exigem camada nativa; a alternativa cloud Google merece avaliação separada, mas não entra na demo PWA.
- Privacidade: adesão opcional, permissões mínimas de leitura/escrita separadas, revogação, exclusão e política de retenção explícitas. Não enviar dados importados ao Groq nem ao D1 por padrão. Revisar requisitos de proteção de dados e lojas antes de implementar.
- Sincronização: prevenir duplicatas, manter origem dos registros e tratar correções/exclusões e permissões negadas. Não ajustar automaticamente metas alimentares a partir de calorias de exercício.
- Custos e monetização não definidos; avaliar esforço nativo, manutenção e exigências dos provedores antes de prometer gratuidade ou incluir em plano pago.

Fontes consultadas em 2026-09-08: [HealthKit e autorização](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data), [caminhos Google Health API/Health Connect](https://developer.android.com/health-and-fitness/health-connect/migration/fit), [Samsung Health Data SDK e parceria](https://developer.samsung.com/health/data/faq.html).

## Sequência da implementação

1. Fundação: repositório, Wrangler, D1 local, CI e documentação.
2. Contratos e IA: geração de refeições e análise de fotos, validação de entrada/saída, testes reais de qualidade e medição de tokens dos dois modelos. Ver docs/GENERATION-CONTRACT.md e docs/IMAGE-ANALYSIS-CONTRACT.md.
3. Backend: sessões, limites individuais/globais atômicos separados por operação/modelo, histórico e exclusão; incluir diário alimentar opcional e seleção limitada de contexto para personalização autorizada. Fotos sem persistência no app.
4. Interface: fluxo cozinhar/pedir pronto, digitação e câmera/galeria opcionais em Cozinhar, confirmação dos ingredientes, estados de erro, histórico e acessibilidade móvel.
5. PWA: manifesto, ícones, instalação e cache apenas de recursos adequados. Gerar com IA requer internet.
6. Registros: ligar o diário à interface com “Comi isso” e entrada manual, edição/exclusão e opção de personalização; separar gasto informado de custo estimado e evitar médias diárias de registros incompletos.
7. Compartilhamento: cartão original inspirado na clareza visual do Lyfta, gerado no navegador, com prévia e métricas opcionais. Imagens ilustrativas não serão apresentadas como fotos reais do usuário.
8. Publicação: configurar contas gratuitas, verificar cotas, testar num celular e acrescentar link real ao README.

Critério para anunciar a demo: fluxos reais por texto e por foto testados no celular, confirmação dos ingredientes, geração, persistência, limites atingidos e exclusão. Não simular sucesso quando o provedor estiver indisponível.

## Decisão de escopo: fotos no primeiro PWA

Atualizada em 2026-09-10: análise de fotos não é etapa posterior nem depende de aplicativo de loja. Em Cozinhar, a pessoa pode escrever ingredientes, tirar/enviar uma foto ou combinar as opções. Uma lista única é preservada e editável; reconhecimento visual exige confirmação antes de usar no pedido de refeições. A permissão de câmera só é solicitada quando a pessoa escolhe essa função; digitar continua disponível.

O candidato para visão é `qwen/qwen3.6-27b`, sujeito a testes reais e disponibilidade na conta; GPT-OSS 20B permanece na geração de refeições. Upload limitado e adaptador visual têm testes simulados, ainda sem chamada real. Uma foto por análise, com teto provisório de 5 MiB. Não definir cota diária de fotos sem medir consumo. Não salvar fotos no D1; guardar a lista confirmada no rascunho/preferências e no pedido associado ao plano quando a persistência for implementada. Verificar retenção do Groq e informar envio antes de publicar.

### Simplificação da demo e revisão antes do lançamento

Decisão do usuário: enviar a foto original após checagens leves de tamanho, tipo e assinatura. Não decodificar pixels, redimensionar, recompactar ou remover metadados no Worker na demo. O Groq poderá recusar arquivos inválidos ou incompatíveis; tratar isso como erro, não como análise vazia bem-sucedida. Base64 só prepara o transporte e não remove EXIF/GPS. Medir CPU/memória e limites reais, sem prometer que todo arquivo de 5 MiB cabe no orçamento Free.

- Antes do lançamento real: avaliar remoção de metadados, orientação, formatos móveis e eventual transformação/limites de pixels com processamento adequado; revisar retenção e privacidade.
- Antes do lançamento real: revisão aprofundada de segurança, testes de abuso e concorrência, auditoria de dependências, rotação de segredos e monitoramento.
- Na demo pública, manter controles básicos: chave só no servidor, limites de upload/uso/resposta, sessões e isolamento do histórico, exclusão, erro controlado e nenhum log/cache de fotos. Não adiar esses controles por ser protótipo.
- Antes de enviar uma foto, informar que o original e eventuais metadados serão encaminhados ao Groq. Filtrar o JSON devolvido não desfaz esse envio.

Nenhum serviço de imagens adicional, Worker auxiliar ou plano pago foi ativado para essa solução.

## Ideia futura: widgets personalizáveis

Registrada em 2026-09-06 a pedido do usuário. Fora do escopo da demo; não implementada. Referência de produto: Box Box Club, sem copiar marca, imagens ou layouts proprietários.

- Objetivo: consultar próxima refeição, tempo de preparo, compras pendentes e resumo semanal sem abrir a interface completa.
- Personalização proposta: temas, cores, tamanhos e campos visíveis. Gastos ocultos por padrão em superfícies externas; exibição opcional, distinguindo estimativas de registros reais. Calorias só poderão ser consideradas na futura fase do aplicativo, após integrar e verificar uma fonte real conforme o Item 7; fora da demo PWA.
- Monetização a validar: widget básico gratuito e personalizações/layouts adicionais pagos. Avaliar compra única de temas versus assinatura com benefícios recorrentes; sem preço ou cobrança definidos. Rever regras e custos das lojas antes de implementar vendas.
- Limite técnico: a PWA instalada pelo navegador não fornece, por si só, widgets nativos de tela inicial no iOS/Android. Cartões personalizáveis dentro da PWA são possíveis, mas não equivalem a widgets do sistema.
- Caminho futuro: aplicativo nativo ou híbrido com extensão WidgetKit no iOS e App Widgets/Jetpack Glance no Android. Empacotar o site não cria os widgets automaticamente; avaliar compartilhamento seguro de dados e desenvolvimento específico por plataforma.
- Reaproveitar planos salvos, sem chamar a IA a cada atualização. Usar cache, estado vazio/erro e indicação de atualização; o sistema controla atualizações em segundo plano, sem garantia de tempo real.
- Próximo passo apenas na fase mobile: prototipar um widget de próxima refeição, validar utilidade e disposição a pagar antes de ampliar o catálogo.

Fontes consultadas em 2026-09-06:

- [Box Box Club na App Store](https://apps.apple.com/us/app/box-box-club-formula-widgets/id1621241916): widgets personalizáveis, tamanhos e compras internas.
- [Box Box Club no Google Play](https://play.google.com/store/apps/details?id=club.boxbox.android): disponibilidade Android.
- [Apple WidgetKit](https://developer.apple.com/documentation/widgetkit): integração nativa de widgets.
- [Android App Widgets](https://developer.android.com/develop/ui/views/appwidgets/overview): widgets de tela inicial.
