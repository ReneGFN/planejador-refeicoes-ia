# Vídeo de apoio — Fase 2: cache e cota

Estado: implementação interna entregue, ainda sem rota, flag, configuração ativa ou migração remota. Fase 1 preservada. Nenhuma chamada real, chave real, dependência nova, alteração de geração ou histórico. Etapas 4 e 5 do produto continuam não iniciadas.

## Como funciona e por que foi separado

O adaptador da Fase 1 faz uma consulta e valida a resposta. Agora getSupportVideo coordena quando pode chamá-lo. Ele recebe apenas o título como conteúdo de produto; sessão e rede são contexto interno, nunca parâmetros enviados ao Google. A futura rota deverá resolver a alternativa do plano do dono, autenticar, verificar origem/ingress e aplicar VIDEO_ENABLED antes deste serviço. Esta função interna NÃO substitui essas proteções.

Fluxo: contexto válido → limpeza limitada das tabelas de vídeo → cache → política explícita → reserva atômica e trava do título → confirmação de autorização/janela → uma busca → persistência validada. Falha complementar retorna alternativa, sem repetir a busca. Não conecta nada à geração, não consome tokens nem as três gerações diárias.

O cache fica no D1 porque precisamos de um resultado compartilhado e de rechecagem junto à disputa pela busca, no mesmo banco da reserva. Não foi acrescentado KV, Cache API ou outro serviço. A implementação segue as orientações de Cloudflare/Workers: consultas parametrizadas, estado por pedido, promessas aguardadas e batch transacional. O D1 documenta rollback do batch inteiro se uma instrução falhar. [API oficial de D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

Quando disponível, a sessão D1 começa em first-primary para evitar uma leitura inicial defasada. Isso é consistência do banco, não autenticação do visitante. Nos testes, SQLite em memória executa o SQL real; o adaptador de teste serializa batches, sem dependência nova. Teste da nova função no workerd permanece na Fase 3, não foi inferido dos testes Node.

## Arquivos e responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| migrations/0007_video_cache_quota.sql | Seis tabelas exclusivas, índices e gatilhos atômicos; nenhuma tabela antiga alterada. |
| src/security/video-quota.js | Política fechada, janelas PT, contexto técnico e reserva visitante/rede/projeto. |
| src/video/cache.js | Ler/validar, guardar resultado e apagar registros vencidos de vídeo. |
| src/video/service.js | Coordenar cache, reserva e adaptador; devolver alternativa em falha complementar. |
| tests/video-quota.test.js | Limites, viradas, rollback, repetição e última vaga concorrente. |
| tests/video-service.test.js | Cache, ausência, erros, concorrência, persistência e suspensão do projeto. |
| tests/helpers/video-db.js | Banco descartável e serialização transacional dos testes, sem alterar helper do histórico. |

## Três situações diferentes no cache

| Situação | Registro | O que acontece |
| --- | --- | --- |
| Não buscado ou já expirado/apagado | Nenhuma linha válida | Pode disputar uma nova busca, respeitando cota e pedido único. |
| Consulta válida com candidato | status=found e quatro campos do vídeo | Reutiliza resultado, sem reserva nem API. |
| Consulta válida sem candidato aceitável | status=not_found e campos do vídeo nulos | Reutiliza ausência conhecida, sem reserva nem API. |

“Não encontrado” continua significando ausência de candidato aceitável na primeira página, não inexistência no YouTube. Timeout, HTTP 403/429/503, JSON inválido e falha de banco NÃO viram ausência conhecida. Erro de cache não é tratado como cache vazio para permitir busca sem controle.

A linha global contém somente title_key normalizada, status, video_id, video_title, channel_id, channel_title, fetched_at e expires_at. Não contém visitante, plano, IP ou identificador de reserva. Título/canal são os textos externos validados, não HTML, tradução ou avaliação da IA. Limitações de normalização/possível informação pessoal no título continuam em [VIDEO-CONTRACT.md](VIDEO-CONTRACT.md).

## Prazos técnicos escolhidos nesta fase

| Estado | Prazo | Motivo |
| --- | --- | --- |
| Resultado encontrado | 24 horas após resposta válida | Reaproveita buscas no dia sem manter metadados por semanas. |
| Ausência válida | 1 hora | Evita repetir o mesmo nada, mas permite reavaliar mais cedo. |
| Trava de título | 60 segundos | Coordena concorrência; o adaptador admite até 10 segundos. Não é agenda de retry. |
| Recibo da tentativa | Até a expiração absoluta da sessão, no máximo 30 dias | Impede reenvio da mesma tentativa enquanto aquela sessão pode usá-la. |
| Contadores | Fim da janela mais 24 horas | Retenção técnica limitada; somente a janela corrente participa do limite. |
| Suspensão por quotaExceeded | Próxima meia-noite do Pacífico | Não insistir no projeto cujo provedor informou esgotamento. |

Datas de persistência são inteiros em milissegundos UTC; a janela diária é calculada pelo calendário de America/Los_Angeles. O minuto usa uma chave absoluta UTC, evitando juntar duas ocorrências da mesma hora durante a mudança de horário.

Esses prazos são decisões técnicas desta implementação, não números de buscas autorizados em produção. Não medimos taxa de acerto, consumo D1, CPU no plano gratuito ou capacidade real do projeto.

### Limpeza real versus somente esconder

pruneVideoData apaga até 100 registros vencidos por tabela por chamada, além da linha única de suspensão. Não toca tabelas do histórico. É chamada antes do cache; a leitura também apaga a linha vencida consultada, caso ela tenha ficado além do lote de limpeza. Não renova fetched_at/expires_at em um acerto.

**Condição pendente de ativação:** agendar e verificar limpeza mesmo sem tráfego, com capacidade para esvaziar os lotes vencidos. A função existe, mas nenhum agendamento ou recurso remoto foi criado. Limpeza oportunista NÃO garante a exigência de apagar/atualizar metadados em até 30 dias. Não afirmar conformidade operacional enquanto esse requisito não estiver resolvido. A exigência foi levantada na Fase 0. [Políticas de dados do YouTube](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content).

Sessão expirada não pode reutilizar recibo removido: o contexto é recusado antes do banco. A Fase 3 deve fornecer a expiração autenticada, não permitir que o cliente a renove. Eliminar histórico não deve apagar contadores/recibos de vídeo antecipadamente; esta fase não alterou o fluxo de exclusão do histórico.

## Política configurável, sem teto escolhido

O serviço recebe policyJson internamente. Nome reservado para a configuração futura: VIDEO_QUOTA_POLICY_JSON. Nenhuma variável foi inserida no Wrangler nem ligada à rota nesta fase. Não há política padrão nem recurso habilitado automaticamente.

Objeto JSON fechado, com nove inteiros obrigatórios:

- visitorDay / visitorMinute: novas buscas provocadas por visitante autenticado.
- networkDay / networkMinute: novas buscas pela rede pseudonimizada.
- globalDay / globalMinute: novas buscas por todos os consumidores deste limitador.
- projectDay: Q, quota diária efetiva do projeto, a conferir na conta.
- otherDay: O, orçamento separado para consumidores fora deste limitador e testes manuais.
- marginDay: M, margem de segurança.

Os seis limites e projectDay devem ser positivos; otherDay/marginDay podem ser zero, mas isso não recomenda ausência de margem. Inteiros limitados a 10.000.000 como proteção de configuração, não franquia oferecida. Minuto não pode exceder dia do mesmo escopo; rede não pode ter teto inferior ao do visitante. Deve valer globalDay ≤ projectDay − otherDay − marginDay. Campo ausente/desconhecido, fração, string numérica ou orçamento insuficiente recusam novas buscas. Cache válido continua utilizável sem política/chave, desde que a futura flag permita e o contexto seja válido.

**Você ainda precisa decidir os números**, com a quota efetiva conferida. Todos os números nos testes são cenários fictícios, não valores ativados ou recomendação de capacidade gratuita.

Não usamos a premissa antiga de 100 unidades por busca contra 10.000. A Fase 0 identificou Search Queries separado; este contador mede tentativas de search.list, uma por chamada, sem paginação. A quota externa não foi medida nem a conta consultada nesta fase. [Verificação de quota e fontes](VIDEO-API-PHASE-0.md).

### O que “global” consegue garantir

Os contadores globais e a suspensão são únicos neste D1, não consultam o saldo do Google. Todos os processos do mesmo consumidor precisam compartilhar esse banco/limitador. Se outros ambientes, chaves do mesmo projeto ou testes manuais não o utilizarem, o orçamento deles precisa caber em otherDay. Bancos separados não formam magicamente um teto global; não provisionar outro banco/projeto para contornar limites.

A Fase 3 deve derivar networkHash por networkKey(request, env, videoWindows(now).day), usando somente IP confiável e o segredo de servidor IP_HASH_SECRET. Não copiar o dia UTC do ingress. O serviço exige networkDay correspondente; não recebe IP puro. O contexto interno exige visitorId, requestKey UUID, networkHash, networkDay e expiresAt da sessão. Os testes usam pseudônimos sintéticos, não credenciais. YOUTUBE_API_KEY é o único marcador de credencial nos testes; nenhum valor de chave existe nos arquivos novos.

## Atomicidade, concorrência e falhas

Um batch tenta adquirir a trava do título e inserir o recibo. Os gatilhos reconferem cache, repetição, suspensão e trava; depois conferem os seis limites e incrementam todos dentro da transação. Se qualquer limite falhar, a trava e toda a reserva são revertidas. Dois pedidos pelo mesmo título não disparam duas buscas simultâneas enquanto a trava está válida. O concorrente usa cache se já houver ou recebe alternativa; não espera nem tenta de novo automaticamente.

O recibo é o resumo criptográfico de operação, visitante e Idempotency-Key, sem título alimentar. Os contadores e o JSON técnico do recibo contêm escopos/identificadores pseudônimos/janelas, não dados da receita. A trava separada liga título a tentativa apenas durante a coordenação; isso não é uma linha de cache com dono e não deve ser tratado como histórico alimentar ou anonimato absoluto.

Antes do envio, o serviço confirma que ainda possui a trava, recibo reservado e projeto não suspenso. Reconfere o relógio após a consulta ao banco: não reutiliza dia/minuto anterior, sessão vencida, relógio retrocedido ou reserva antiga. Nos últimos 10 segundos do dia PT, não envia. Essa margem reduz risco na fronteira, mas não prova o instante em que Google contabiliza uma requisição em trânsito. Consumo externo exato permanece desconhecido.

Depois de enviado, não há refund da reserva, mesmo em timeout/ausência/erro. Uma reserva confirmada pelo banco mas cuja resposta se perdeu também não permite envio: a repetição encontra o recibo e não chama o provedor. Isso pode gastar uma vaga interna sem gastar quota externa; é a escolha conservadora para não permitir duplicação. Configuração inválida da chave/opções do adaptador, detectada depois da reserva, também não devolve saldo.

Falha não cria cache negativo e mantém a trava até expirar. O mesmo pedido não pode ser reenviado, mesmo depois da trava expirar ou se mudar o título. Um novo pedido explícito, com outro identificador, pode disputar a busca após expiração; não existe rotina de reenvio, fila ou busca alternativa. Uma resposta atrasada não consegue sobrescrever o cache se já perdeu a trava. Nenhuma transação no D1 torna o envio ao Google transacional: não prometemos exatamente uma chamada externa em toda situação distribuída, somente uma autorização por recibo e coordenação enquanto a trava vale.

quotaExceeded validado suspende novas buscas até o próximo reset PT, sem impedir acertos de cache. HTTP 403 genérico e limitação temporária não são confundidos com esgotamento diário. Se a própria gravação da suspensão falhar, não é possível prometer bloqueio persistido: o pedido atual retorna alternativa, sem retry; próximos pedidos ainda dependem de banco saudável e limites locais. Nenhum detalhe de erro SQL/Google é devolvido.

## Resultado interno — ainda não contrato HTTP

getSupportVideo devolve query normalizada, result (saída validada da Fase 1 ou null), source (cache/provider/fallback) e reason (código técnico sanitizado ou null). query está presente inclusive no sucesso. not_found válido continua em result; falhas complementares usam result=null, sem alegar consulta válida sem candidato.

Não há botão, URL de busca, aviso HTTP, player, iframe ou resposta 200/502 implementada aqui. A Fase 3 deve transformar o resultado interno na resposta protegida e no caminho tranquilo de busca. Entrada de título inválida continua ContractError para o chamador; não é falha do YouTube. Proteções de sessão/origem/ingress permanecem responsabilidade da rota futura. Não exibir reason como mensagem alarmante ao usuário.

## Verificação e próximas dependências

42 novos testes Node, com SQLite real descartável e transporte YouTube simulado. Suíte completa: 420 aprovados, zero falhas. npm run test:integration: 99 cenários aprovados, após reexecução autorizada porque o esbuild foi bloqueado pelo sandbox antes dos testes. Essa integração continua regressão dos fluxos antigos; não comprova runtime da nova função nem API real. Os logs integrais e diff isolado acompanham a entrega, incluindo o bloqueio inicial.

Pendentes: aprovação da Fase 2; Fase 3 com rota/flag inicialmente false/proteções e testes no workerd; números reais de política; limpeza agendada antes de ativação; Fase 4 deste pedido com aviso próprio e consolidação documental. Incorporação continua dependendo de MadeForKids, termos, privacidade e atribuição. Nenhuma consulta extra foi acrescentada. Parar nesta fase.
