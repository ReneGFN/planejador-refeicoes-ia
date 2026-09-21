# Limpeza automática por prazo — proposta da etapa 3

**Somente desenho.** Não há executor, migração, agendamento ou limpeza de dados reais nesta entrega. Aprovar a proposta não ativa manutenção na nuvem. A exclusão solicitada do Item 6 permanece intacta; recuperação continua sem implementação.

## Em linguagem comum

O aplicativo já deixa de aceitar a sessão quando completam 30 dias desde sua criação. Mas fechar a porta não esvazia o banco: falta um serviço que retire os dados vencidos mesmo quando ninguém visita o site.

Proponho esse serviço funcionando uma vez por hora, em pequenos lotes. Ele apagaria receitas/planos, diário, preferências e despensa das sessões vencidas. Registros técnicos que impedem repetir ações ou recuperar cotas seriam preservados até o prazo próprio. Depois, a identidade técnica também poderia sair.

Uma receita gerada no dia 29 teria somente o tempo restante daquela sessão, não outros 30 dias. Voltar ao aplicativo, editar um alimento ou futuramente transferir o acesso não reiniciaria o relógio.

## Prazo de acesso versus remoção

A referência é visitors.created_at + 30 × 24 horas, em UTC, como src/security/session.js. Não é mês de calendário, last_seen_at, data de consumo ou última receita. No instante de igualdade, a sessão já está vencida.

Proposta de frequência: uma execução por hora. Sem falhas ou fila acumulada, a próxima verificação ocorre em aproximadamente uma hora; **isso não garante que todos os registros sejam removidos dentro de uma hora**, pois há limites por lote e possíveis indisponibilidades. Não prometer exclusão física exatamente no segundo do vencimento. Medir e acompanhar o atraso antes de publicar a demo.

Mensagem futura: “O acesso a este histórico termina após 30 dias da criação da sessão. Depois disso, os dados entram na limpeza automática. Registros técnicos seguem prazos próprios.” Nenhuma interface foi alterada.

## O que apagar e o que preservar

| Registro | Critério proposto para limpeza | Por quê |
| --- | --- | --- |
| plans, incluindo receitas, comida pronta, compare e recusas salvas | Dono com os 30 dias vencidos; remover inclusive linhas legadas sem expires_at/generation_key. | Todo produto acompanha o prazo original do dono; não inventar datas/chaves antigas nem prolongar o histórico. |
| meal_logs, incluindo registros manuais e instantâneos de sugestões | Mesmo prazo do dono; diário próprio antes dos planos próprios. | O diário guarda conteúdo mesmo quando o plano desaparece. |
| preferences | Mesmo prazo do dono, derivado de visitors. | Esta tabela não tem expires_at; não renovar pela data da edição. |
| pantry_items | Mesmo prazo do dono, derivado de visitors. | **pantry_items.expires_at é validade do alimento**, não retenção. Não apagar um alimento só porque essa data passou. |
| meal_log_mutations, pantry_mutations e history_deletions | Dono vencido E expires_at técnico válido já vencido. | Guardam recibos de ações, não receitas. Atualmente recebem o fim absoluto da sessão; não apagar antes durante uma sessão ativa. |
| usage_reservations | Apenas seu próprio expires_at vencido: hoje sete dias desde a reserva, nas quatro operações ingress/session/generation/vision. | Preservar proteção contra reenvios; não depende da existência do produto nem de excluir o visitante. |
| usage_buckets | Apenas seu próprio expires_at vencido: hoje meia-noite UTC do dia da operação + dois dias. | São contadores, inclusive de rede/global. Isso não é “48 horas depois de cada pedido”; a duração efetiva depende do horário. |
| visitors | Dono vencido e nenhuma linha dependente de produto ou recibo de produto restante, conferidos na própria remoção. | Apagar primeiro dispararia ON DELETE CASCADE e poderia eliminar recibos ainda necessários. |
| Estado técnico da manutenção, a criar futuramente | Manter somente enquanto houver trabalho pendente/bloqueado; remover o vínculo ao concluir. | Permite retomar lotes sem guardar uma cópia do histórico. |

Os prazos de cotas acima vêm de quotaWindows em src/security/quota.js; não são políticas novas. usage_reservations e usage_buckets não têm FK para visitors: sua retenção independente continua mesmo depois que esse visitante for removido. São dados técnicos pseudonimizados, não promessa de anonimato absoluto.

Para produto, uma data de expiração ausente ou maior que a do dono não estende a retenção. A proposta não acrescenta limpeza antecipada de produto de donos ativos. Para recibos de produto com data inválida ou inesperadamente posterior à sessão, não apagar por cascata: registrar anomalia e exigir diagnóstico, sem manter silenciosamente por prazo indefinido.

Fotos não entram nesta lista: o fluxo atual não as persiste no D1. A proposta cobre linhas do banco ativo; não promete apagar cópias exportadas, arquivos no dispositivo, registros do provedor de IA ou cópias de recuperação do provedor de infraestrutura.

## Quem executaria e com qual autoridade

Recomendo um pequeno Worker exclusivo de manutenção, ligado ao D1 do ambiente correto, acionado internamente por Cron Trigger. Manter o Pages/Pages Functions existente. Não é necessário migrar o site para desenhar essa tarefa. Cron Triggers chamam o handler scheduled e usam UTC, conforme a [documentação oficial](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

Escolhi execução agendada porque a limpeza por acesso depende de alguém abrir o aplicativo. O Worker não precisaria de Groq, foto, cookie de usuário ou segredo de sessão. Não criar endpoint público para apagar visitantes; manter rotas públicas/workers.dev/preview URLs desabilitadas na futura configuração do executor.

**Esta é uma nova autoridade interna que precisa ser aprovada:** selecionar registros vencidos de vários donos. Não é autorização por visitor_id enviado pelo cliente, nem reutilização de DELETE /api/history sem autenticação. As rotas de produto continuam sempre limitadas à sessão autenticada. O código de manutenção só aceitaria os alvos encontrados no próprio banco, a data do servidor e uma lista fixa de tabelas.

Binding D1 concede acesso ao banco, não uma permissão granular de “apagar só vencidos”. Essa restrição terá de ser garantida pelo código, testes e revisão da configuração. Antes de qualquer ativação, confirmar conta, ambiente e banco exatos, separando teste/preview/produção. Nenhum ID real é necessário nesta proposta.

Propor um interruptor de manutenção inicialmente desligado, independente das flags de geração/histórico: desligar IA não deveria impedir limpar dados já vencidos. Não foi criada flag nem modificada configuração agora. A futura ativação remota exigirá autorização separada.

## Lotes, ordem e requisições em andamento

Não usar DELETE visitors como atalho. Também não copiar a exclusão manual inteira para um lote global ilimitado: um único diário pode crescer bastante.

Fluxo futuro:

1. Capturar uma data de corte do servidor; localizar donos vencidos com paginação estável e índice. Datas devem ter formato/calendário válido. Não comparar textos de formatos misturados nem aceitar relógio do cliente.
2. Marcar de forma atômica o dono como em limpeza. Proponho estado persistente de limpeza associado a visitors e revisão para invalidar escritas antigas. A marca permanece se a execução cair.
3. Remover em lotes limitados o diário próprio, planos próprios, preferências e despensa. Toda instrução volta a conferir dono, vencimento e marca; nunca apenas uma lista de IDs previamente consultada.
4. Remover recibos de produto somente com o prazo técnico vencido. Uma tabela vazia de produto não autoriza apagar recibos ainda válidos.
5. Excluir visitors por último, com testes de inexistência de TODOS os filhos na mesma instrução. Não deixar CASCADE fazer trabalho oculto nem desativar foreign_keys.
6. Em uma passagem independente e também limitada, limpar recibos/contadores de uso já vencidos, preservando as regras de pruneUsage. Não estornar cota nem repetir uma chamada de IA.

A proteção existente historyGuard confere identidade e history_revision, **não confere vencimento ou estado de limpeza na escrita**. Há verificações de prazo antes de algumas operações, mas isso não prova segurança no instante de gravar. A implementação terá de proteger todas as escritas de produto e seus recibos, inclusive exclusão manual, com prazo atual e ausência de limpeza conferidos atomicamente. Só verificar no início ou incrementar uma revisão sem impedir novas capturas não basta.

Exemplo: uma geração começou com sessão válida e terminou depois do vencimento. O resultado não poderá repor um plano de um dono em limpeza; o trabalho de IA já consumido não será devolvido nem repetido. Essa regra não muda SYSTEM, contrato de saída, mapa ERRORS ou cálculo de compare. Não promete cancelar bytes já enviados à IA ou retirar conteúdo já visto pelo usuário.

Cada lote é uma unidade transacional; toda a limpeza de um dono pode exigir várias execuções. Como seu acesso já venceu, não é necessário manter todos os dados até uma transação gigantesca terminar. Em falha, preservar lotes já concluídos e retomar os pendentes, sem recriar conteúdo.

## Limites, falhas e custo

Como ponto inicial **para testes, não capacidade medida**, proponho até 100 linhas diretamente removidas por instrução e até 20 instruções SQL por execução, contando consultas, controle e instruções dentro de batch. Encerrar ao atingir o orçamento e retomar na próxima execução. Reservar espaço para avanço de estado e dividir o orçamento entre produto e cotas para nenhum ficar sem atendimento.

São tetos de trabalho, não garantia de CPU, linhas lidas ou capacidade diária. Índices e checagens de referências também têm custo; limitar DELETE a 100 não limita sozinho a varredura. A migração futura deve prever índices para seleção de donos vencidos, progresso e referências meal_logs.plan_id, além de verificar o plano das consultas. Não carregar/decodificar data_json, fotos ou prompts para decidir vencimento.

O plano Free admite Cron Triggers e tem limites de execução; D1 também limita consultas por invocação. Não tratar tempo de espera como tempo de CPU nem presumir que agendamento remove esses limites. Conferir novamente antes de implementar: [limites de Workers](https://developers.cloudflare.com/workers/platform/limits/) e [limites de D1](https://developers.cloudflare.com/d1/platform/limits/).

Não há chamada de IA nessa manutenção, mas consultas/exclusões consomem recursos. D1 Free tem franquias de leitura, escrita e armazenamento; atingir o limite diário de consultas pode impedir a limpeza até a disponibilidade voltar. Medir rows_read/rows_written e CPU, considerando o restante da aplicação. Não contratar plano pago nem prometer custo zero em qualquer escala. [Preços e comportamento do D1 Free](https://developers.cloudflare.com/d1/platform/pricing/).

Progresso precisa ficar no banco, não somente na memória do Worker. Rotacionar o atendimento entre donos, retomar os incompletos e separar bloqueados para um registro inconsistente não travar toda a fila. Execuções repetidas ou sobrepostas devem ser seguras por condições atômicas; não depender de execução única garantida. Retentar manutenção não significa retentar IA.

Se houver referência incorreta de diário de outro dono a um plano vencido, não apagar esse plano nem modificar o diário alheio via ON DELETE SET NULL. Isolar o caso e registrar contagem/código de anomalia para investigação. Datas inválidas e revisão inconsistente também exigem tratamento conservador. Não “consertar” propriedade ou datas por suposição. Anomalias pendentes impedem declarar limpeza integral; seu diagnóstico é trabalho separado.

Registrar apenas contagens por tabela, sucesso/falha, duração, consumo e atraso do trabalho pendente, sem IDs de usuários, JSON alimentar, IPs, cookies, hashes ou segredos nos logs. Guardar o identificador necessário à retomada somente no estado interno protegido; não copiar conteúdos para um arquivo de auditoria. Monitorar também ausência de execuções bem-sucedidas: não confundir ausência de logs com banco limpo.

## Exclusão manual, recuperação e restauração

DELETE /api/history continua exigindo sessão e confirmação, preservando identidade, recibos e cotas. Sua repetição não deve apagar dados novos. A limpeza automática tem outro gatilho: vencimento, sem depender de uma sessão que já não autentica.

Recuperação por código permanece apenas proposta. Se implementada futuramente, códigos/desafios deverão acompanhar o prazo original e ser bloqueados pela marca de limpeza, com limpeza própria de recibos. Não criar tabelas de recuperação agora nem renovar os 30 dias por causa dela.

Desligar o executor interromperia execuções futuras; **não recuperaria dados apagados**. Uma restauração de banco, se futuramente autorizada, precisa executar novamente a política de expiração antes de reabrir acesso e ter tratamento próprio para exclusões voluntárias que a cópia possa reintroduzir. Este desenho não implementa backup nem garante apagamento de todas as cópias do provedor.

## Testes exigidos antes da ativação

- Dono ativo, recém-vencido e exatamente na fronteira dos 30 dias; relógio UTC, mês curto, bissexto e data inválida/futura.
- Todas as tabelas da matriz; legado com expires_at nulo; alimento vencido de sessão ativa preservado.
- Recibos de produto ainda válidos preservados, mesmo com produto vazio; cotas de rede/global e reservas com TTL próprio preservadas até vencer.
- Diário antes do plano; referência cruzada inválida sem efeito no outro dono; pai só removido quando realmente sem filhos.
- Pedido iniciado antes do vencimento e gravação após a marca/prazo; nenhum ressurgimento em planos, preferências, diário, despensa ou recibos.
- Mais de um lote, retomada após falha, rollback de lote, duas execuções simultâneas, orçamento SQL e atendimento sem bloquear os demais donos.
- Concorrência com exclusão manual, reserva/finalização de uso e pruneUsage oportunista; nenhuma restituição ou nova chamada de IA.
- Interruptor desligado, binding/ambiente inválido, ausência de acesso público e logs sem dados privados.
- Simulação primeiro em D1 descartável; medições do executor e ensaio no ambiente explicitamente autorizado antes de liberar a demo.

Esses são testes futuros, não resultados existentes. As suítes reexecutadas nesta entrega medem apenas regressão do backend atual. Nenhum teste novo foi criado para um executor que ainda não existe.

## Decisões para aprovação e próximos passos

Recomendo aprovar em conjunto:

1. **Prazo e comunicação:** manter 30 dias absolutos de acesso; limpeza física posterior em lotes horários, com atraso acompanhado, sem promessa de remoção instantânea.
2. **Autoridade interna:** Worker exclusivo agendado, sem rota pública, limitado por código a registros vencidos; preservar a hospedagem existente.
3. **Retenção técnica e segurança:** matriz acima, pai por último, bloqueio de escritas tardias e isolamento de anomalias; não apagar cotas para liberar saldo.

A aprovação do desenho permitiria preparar um item de implementação local com migração técnica, guardas, executor limitado e testes. Os tetos iniciais são hipóteses a verificar, não medições. Deploy, agendamento real, remoção de dados reais, recuperação e etapas 4/5 não estão autorizados por esta entrega.

A limpeza automática da etapa 3 continua **pendente de implementação e validação**. Parar aqui e aguardar aprovação do desenho.
