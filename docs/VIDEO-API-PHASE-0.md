# Vídeo de apoio — Fase 0: verificação da API e proposta de cota

Atualização após aprovação do usuário: Fase 0 aprovada; Fase 1 entregue em [VIDEO-CONTRACT.md](VIDEO-CONTRACT.md). A leitura recomendada de A5 e preservação das rejeições de segurança foram aceitas. Os números de cota/margem continuam pendentes; nenhuma rota/flag foi criada. As seções seguintes preservam o registro da pesquisa e das propostas na data da Fase 0.

Consulta documental em 12/09/2026. **Sem código, chave, requisição real à API, migração ou ativação.** Fontes oficiais abaixo; isto não é auditoria jurídica nem certificação de conformidade. A conta/quota efetiva do projeto ainda precisa ser conferida pelo responsável.

Esta entrega cobre somente a Fase 0 do pedido de vídeo. Fases 1–4 desse pedido e etapas 4/5 do produto não foram iniciadas. A proposta anterior de limpeza permanece pendente, sem implementação ou aprovação implícita.

## A. Custo e teto: correção importante

A premissa “100 unidades por busca dentro de 10.000 unidades diárias” ficou desatualizada. A documentação atual define **1 unidade por search.list em uma cota própria de Search Queries, com 100 chamadas diárias padrão por projeto**. Há uma franquia geral de 10.000 unidades para os demais endpoints, excluídos os métodos com quota própria como search.list e videos.insert; não são 10.000 buscas. A transição foi anunciada em 01/06/2026. [Calculadora oficial](https://developers.google.com/youtube/v3/determine_quota_cost), [histórico da mudança](https://developers.google.com/youtube/v3/revision_history#june-1-2026).

O número prático continua sendo até 100 chamadas de busca, mas não porque se divide 10.000 por 100. A visão geral confirma as franquias separadas. A quota disponível na conta não foi inspecionada. [Visão geral da API](https://developers.google.com/youtube/v3/getting-started#quota).

Requisições inválidas também consomem quota; cada página adicional custa outra chamada. O reinício diário ocorre à meia-noite do Pacífico, não UTC nem São Paulo. [Regras de quota](https://developers.google.com/youtube/v3/determine_quota_cost).

Unidade de quota não é token da LLM nem preço em dinheiro. Não prometemos compra automática de saldo ou capacidade ilimitada. Ampliação da quota exige solicitação/auditoria; não criar vários projetos para contornar o limite. [Quota e auditorias](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits), [políticas, III.D](https://developers.google.com/youtube/terms/developer-policies#d.-accessing-youtube-api-services).

A mesma chave em vários ambientes ou outras chaves do mesmo projeto não multiplicam essa franquia. O orçamento do app deve descontar testes manuais, outros consumidores e uma margem ainda não escolhida.

### Matemática sem inventar capacidade

Definições propostas: Q = quota efetiva diária de buscas do projeto; O = orçamento reservado a outros consumidores; M = margem de segurança; G = teto diário interno aprovado para o vídeo.

G deve ser no máximo Q − O − M. Se não houver saldo conhecido para reservar com segurança, não buscar. Os valores de G, O e M não foram escolhidos nesta fase.

Sem cache: cada tentativa externa autorizada consome uma vaga de G, inclusive quando retorna nada ou falha após ser enviada. Com cache válido: outra pessoa pedindo o mesmo título pode receber o resultado já guardado sem outra busca. Portanto, G limita novas tentativas, não pessoas, visualizações ou entregas de resultados.

A capacidade depende da repetição dos títulos, das expirações e das falhas; nenhuma taxa de acerto de cache foi medida. Cache de ausência também poupa consultas. Paginação automática, busca alternativa e repetição após falha ficam proibidas por decisão do pedido.

## B. Filtros que interessam

| Parâmetro proposto | Efeito e limite |
| --- | --- |
| type=video | Restringe a vídeos; não comprova tutorial. |
| videoEmbeddable=true | Filtra incorporáveis; não garante reprodução futura. |
| videoSyndicated=true | Filtra reprodução fora do YouTube; não garante disponibilidade permanente. |
| relevanceLanguage=pt | Prioriza português, mas pode retornar outros idiomas; não assegura pt-BR. |
| regionCode=BR | Busca vídeos visualizáveis no Brasil; não indica origem brasileira. |
| safeSearch=strict | Tenta excluir conteúdo restrito; não certifica segurança ou adequação. |
| order=relevance | Usa relevância do YouTube; não qualidade culinária. |

A busca também aceita canal, datas, duração, legenda, categoria, licença e localização. Não proponho restringi-los agora: podem excluir tutoriais úteis; duração de vídeo não é tempo de preparo. Nenhum filtro compara ingredientes ou equipamentos com a receita. [Referência de search.list](https://developers.google.com/youtube/v3/docs/search/list).

Escolha proposta para a Fase 1: uma página, sem buscar outra em caso de ausência, com número máximo de candidatos ainda a definir no contrato. Percorrer a ordem recebida e selecionar o primeiro candidato estruturalmente válido que satisfaça os critérios aprovados. Isso é determinístico para a mesma resposta, não significa que buscas feitas em dias diferentes devolverão o mesmo vídeo.

O resultado deve ser chamado de apoio relacionado ao nome do prato, nunca “vídeo desta receita”, verificado, aprovado ou seguro por avaliação da IA. Correspondência textual tampouco prova que um vídeo ensina o prato. Não criar pontuação de qualidade, usar LLM, avaliar ingredientes ou alegar correspondência exata. Se não houver candidato aceitável, retornar ausência válida.

## C. Termos: exigências para a etapa 4 do produto

As obrigações abaixo são uma leitura prática das fontes, não dispensa de revisão antes da publicação.

- **Origem clara:** identificar o conteúdo como YouTube, com marca oficial adequada e clicável; não alterar a marca, misturá-la à logo do app ou sugerir endosso. O aviso do app deve ficar distinguível do título/canal do provedor. [Diretrizes de marca](https://developers.google.com/youtube/terms/branding-guidelines).
- **Termos e privacidade:** disponibilizar termos do YouTube e informar sua aplicação; política de privacidade acessível, aceita antes do uso, explicando YouTube, compartilhamento, cookies e link para a política do Google. [Políticas III.A](https://developers.google.com/youtube/terms/developer-policies#a.-api-client-terms-of-use-and-privacy-policies).
- **Cache:** dados públicos não autorizados podem ser guardados temporariamente, mas devem ser atualizados ou apagados em até 30 dias. Não basta esconder a linha expirada e mantê-la para sempre. [Políticas III.E.4](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content).
- **Reprodução:** usar o player oficial; não cobrir controles/atribuição, bloquear anúncios, baixar áudio/vídeo, separar faixas ou permitir reprodução oculta. Sem recompensar/coagir a pessoa a assistir. [Guia de conformidade](https://developers.google.com/youtube/terms/developer-policies-guide).
- **Dimensão e erros:** se houver incorporação, área mínima de 200 × 200 pixels e espaço para controles; manter a alternativa de busca quando o player falhar. [Referência do player](https://developers.google.com/youtube/iframe_api_reference#Requirements).
- **Identificação do app:** o player exige identificação via Referer; não suprimir indiscriminadamente esse cabeçalho. Avaliar strict-origin-when-cross-origin, sem expor caminho/IDs internos. [Funcionalidade mínima](https://developers.google.com/youtube/terms/required-minimum-functionality#api-client-identity-and-credentials).
- **Privacidade ao incorporar:** carregar o player já pode compartilhar dados; desativar autoplay não elimina toda coleta. Proponho explicar isso e carregar somente por ação explícita. [Políticas III.E.4](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content).
- **Conteúdo infantil:** antes de incorporar, verificar MadeForKids e tratar as exigências correspondentes, inclusive desligar rastreamento quando aplicável. search.list não substitui essa consulta: o guia indica videos.list com status. [Guia MadeForKids](https://developers.google.com/youtube/v3/guides/made_for_kids_status).

**Dependência nova identificada, não implementada:** incorporar futuramente exige tratar MadeForKids. videos.list custa uma unidade da franquia geral, separada de Search Queries. É outra operação, não retry da busca. Contrato mínimo, prazo/cache e cota dessa verificação precisam de aprovação antes de prometer player. Alternativa para avaliação futura: abrir o vídeo no próprio YouTube, sem iframe no app. Não decidi mudar a apresentação. [Custo de videos.list](https://developers.google.com/youtube/v3/determine_quota_cost).

Para a etapa 4: aviso junto ao conteúdo, antes da reprodução, e “Buscar no YouTube” disponível mesmo havendo vídeo. Nenhum botão, iframe, player, CSS, marca ou mecanismo de aceite foi criado. O documento próprio de aviso, no padrão de PHOTO-UPLOAD-NOTICE.md, continua entrega da Fase 4 deste pedido; não antecipá-la como concluída.

Texto exato aprovado pelo usuário, preservado como referência:

> Vídeo de apoio
>
> Este tutorial pode usar ingredientes, quantidades, equipamentos e tempos
> diferentes. Use-o para entender as técnicas; para manter as escolhas feitas no
> aplicativo, siga a receita escrita.

Esse aviso explica divergências; não substitui termos/privacidade nem permite chamar o vídeo de verificado ou aprovado pela IA.

## D. Resposta da API: minimizar o que fica

O recurso de busca traz identificador/tipo e snippet com título, canal, descrição, publicação, miniaturas e outros metadados. Não é o arquivo de vídeo. [Recurso search](https://developers.google.com/youtube/v3/docs/search).

Proposta de lista mínima para validação e futura persistência: ID de vídeo, título e canal; tipo do recurso apenas para verificar que é vídeo. Guardar também datas locais de busca/expiração e chave global do título normalizado, como solicitado. Confirmar na Fase 1 se canal inclui ID para atribuição/link.

Não solicitar/guardar/exibir nesta integração:

- Envelope bruto, mensagens do provedor, cabeçalhos, credenciais e URL de requisição autenticada.
- Descrição, links contidos nela, datas de publicação e miniaturas não utilizadas.
- ETags, tokens de paginação, estatísticas aproximadas de resultados e itens não selecionados.
- Dados de perfil, comentários, métricas de audiência, transcrições ou arquivo audiovisual.

Essa exclusão é escolha de minimização, não afirmação de que todo metadado descartado é proibido pelos termos. Não existe permissão para baixar mídia só porque o resultado fornece um ID. IDs e datas técnicas não devem virar texto visível ao usuário.

Usar part/fields para pedir somente o necessário. Isso reduz bytes e análise, não o número de chamadas de busca. O contrato futuro aceitará apenas essa forma limitada e rejeitará campo extra, inclusive no provedor; resposta inválida vai para a alternativa, não para armazenamento do bruto. [Recursos parciais](https://developers.google.com/youtube/v3/getting-started#partial).

Título e canal externos devem ser tratados como texto não confiável, nunca HTML executável. Interface/mensagens são pt-BR; não traduzir ou reescrever título/canal do autor para fingir resultado em português. O parâmetro de idioma não permite prometer áudio pt-BR.

### Privacidade da consulta

A3 permanece: derivar exclusivamente do título estruturado da alternativa escolhida, não do pedido original, diário, despensa, preferências ou campos financeiros. A futura rota poderá identificar plano/alternativa internamente, somente com sessão do dono, sem enviar esses identificadores ao Google e sem alterar o histórico.

Proponho normalização conservadora: Unicode NFC, trim, espaços repetidos unificados e caixa em pt-BR para a chave; preservar acentos e palavras que distinguem pratos. Não remover ingredientes que façam parte do próprio nome, como “risoto de frango”, nem enriquecer com a lista de ingredientes. Neutralizar operadores de busca e rejeitar título fora do contrato antes de enviar; detalhes ficam na Fase 1. Sem truncamento que transforme um prato em outro.

Normalização não prova anonimato: o título atual é texto e pode carregar dado pessoal. Não afirmar remoção garantida de informações pessoais por regex. Registrar critérios de rejeição conservadores e essa limitação na Fase 1, sem mudar geração/prompt. Cache global sem dono não torna qualquer texto automaticamente anônimo.

A3 limita o conteúdo de produto enviado pelo backend; não significa que Google receba literalmente apenas uma string: há credencial do projeto, parâmetros técnicos e conexão do servidor. Player ou clique no YouTube cria outra comunicação do navegador, que também precisa de explicação de privacidade. [Termos, privacidade](https://developers.google.com/youtube/terms/api-services-terms-of-service#7.-user-privacy-and-api-clients).

## Proposta de operação de cota, sem números escolhidos

Nome conceitual: video_search. É cota de buscas, não de tokens ou das três gerações.

| Escopo | Janela proposta | Papel |
| --- | --- | --- |
| Visitante autenticado | Minuto e dia do provedor | Limitar quantas novas buscas uma pessoa provoca. |
| Rede pseudonimizada | Minuto e dia do provedor | Reduzir contorno por recriação de sessão; rede compartilhada pode afetar pessoas legítimas. |
| Global do projeto | Minuto e dia do provedor | Proteger o saldo compartilhado entre todas as pessoas e processos. |

Nenhum teto por pessoa, rede, minuto ou global foi escolhido/configurado. Proponho parâmetros separados equivalentes a visitorDay/visitorMinute, networkDay/networkMinute e globalDay/globalMinute, sujeitos à aprovação. Rede não deve ter teto inferior ao de um visitante na mesma janela. Teto global precisa caber em G, definido acima.

O dia de vídeo deve seguir America/Los_Angeles, inclusive horário de verão. Não copiar quotaWindows UTC ou subtrair sempre oito horas. A proposta alinha as janelas diárias e a derivação de rede da nova operação; ingress e cotas existentes continuam exatamente como estão. Testar virada PT, transições de horário e chamadas próximas da fronteira antes de liberar.

O código atual aceita apenas ingress/session/generation/vision, e a migração 0002 restringe esses nomes. Além disso, reserveUsage só contabiliza visitante quando classifica a operação como IA. Logo, **não basta acrescentar uma string video**: isso perderia o contador do visitante ou tentaria aplicar regra de tokens.

Para respeitar F2, recomendo módulo/política e tabelas técnicas exclusivos de vídeo, reproduzindo a reserva atômica do desenho atual, sem modificar quota.js, seus quatro fluxos ou o histórico. Reusar apenas funções puras compatíveis, após testes. É uma proposta de implementação da Fase 2, não uma migração escrita agora.

### Ordem proposta

1. Resolver sessão/seleção autorizada, entrada e ingress; aplicar a decisão pendente da flag antes de consultar cache global pelo título. Na leitura recomendada de A5, false retorna apenas a alternativa, sem acesso ao cache de vídeo ou Google.
2. Acerto válido, incluindo ausência conhecida: devolver sem reserva video_search e sem chamada ao Google. Ingress continua incidindo no acesso à rota.
3. Ausência de cache não é erro de cache. Se o banco falhar, propor alternativa de busca, sem chamar o Google sem controle seguro.
4. Em falta/expiração, adquirir coordenação global por título e reservar visitante/rede/global na mesma transação que concede a tentativa. Revalidar cache nessa disputa.
5. Somente o vencedor chama a API, uma vez. Concorrentes usam cache se já pronto ou recebem alternativa; não iniciam buscas duplicadas.
6. Após tentativa, guardar resultado válido ou ausência válida. Falha/timeout não é “nenhum vídeo existe” e não vira cache negativo. Guardar só estado técnico sanitizado; não repetir automaticamente nem liberar a mesma tentativa para reenvio.
7. Falha de gravação do cache não autoriza nova busca. Expiração de trava também não deve repetir automaticamente tentativa de resultado incerto.

Estado técnico de coordenação/cota fica separado do cache de conteúdo. Não vincular visitor_id/plano à linha global de resultado nem registrar título alimentar dentro de recibos de uso. Retenção de recibos, travas, cache positivo e negativo ainda precisa ser fechada na Fase 2; resultados expirados não podem ser servidos nem retidos indefinidamente.

Cache precisa distinguir “não consultado”, “vídeo encontrado” e “consulta válida sem candidato”. A falta de um vídeo não deve ser inferida de HTTP 403, timeout ou JSON inválido. Limpeza efetiva do cache e prazo inferior/igual ao máximo permitido são condições de ativação, sem implementar a pendência de limpeza do histórico para isso.

A contabilização deve ocorrer imediatamente antes do envio, não na geração. A fronteira do dia do provedor precisa ser novamente conferida ao enviar; não usar indefinidamente uma reserva feita no dia anterior. Alocação/resposta incerta deve falhar de modo conservador, nunca liberar saldo duplicado.

### Esgotamento e falha tranquila

Com teto global atingido: ainda servir cache válido; em falta de cache, não chamar a API, retornar vídeo ausente e consulta para “Buscar no YouTube”. Mensagem proposta: “Você pode buscar um tutorial no YouTube. Sua receita continua disponível.”

Se o próprio Google indicar quota esgotada antes do teto local, propor suspensão técnica de novas buscas desse projeto até o próximo reinício PT; não insistir com outra chave. Diferenciar quota diária de limitação temporária/erro de credencial na interpretação sanitizada. Não reutilizar automaticamente o mapeamento de erros da Groq. Falhas de vídeo nunca viram erro da geração.

Todo consumidor que compartilha a franquia precisa usar o mesmo limitador global, ou ter orçamento descontado de G. Um contador só neste banco não enxerga chamadas manuais ou serviços externos; o erro do provedor continua sendo uma defesa necessária. Não apresentar o contador local como saldo exato do Google.

## Pontos que exigem aprovação, sem decidir silenciosamente

1. **A5 versus Fase 3:** “nenhuma rota responde com flag desligada” conflita com “flag desligada devolve o botão”. Recomendo que false impeça busca externa e entrega de vídeo/cache, mas permita a rota protegida retornar apenas a alternativa. Isso requer sua aprovação da leitura de A5. Se A5 for literal, a alternativa terá de ser garantida no cliente quando a rota estiver indisponível.
2. **Proteções de acesso:** falha complementar pode retornar resultado tranquilo; sessão ausente, origem inválida, entrada inválida ou ingress esgotado não devem virar acesso autorizado nem revelar título de plano alheio. Recomendo preservar rejeições de segurança e fazer a interface futura manter a receita/alternativa local sem alarme. Não remover autenticação para conseguir “sempre 200”.
3. **Cota:** aprovar desenho separado, janelas PT e reserva atômica; números e margem continuam pendentes, sem valores escolhidos por mim.
4. **Incorporação:** registrar verificação MadeForKids como pré-requisito antes de player. Implementação e orçamento dessa consulta extra não autorizados agora.
5. **Semântica:** título/canal do provedor não serão traduzidos; busca não certifica receita, idioma ou qualidade. Critérios conservadores da seleção e recusa de títulos impróprios serão fechados no contrato.

## Entrega e escopo preservado

Atualizar somente este documento e seções de estado em CHECKLIST, ROADMAP e USAGE-FLOW. Não antecipar a troca das menções históricas pedida na Fase 4. A busca no código encontrou menções em CHECKLIST, ROADMAP e PLAN-HISTORY; não encontrou menção literal equivalente em USAGE-FLOW. Não inventar uma terceira ocorrência nesse arquivo nem editar o histórico entregue.

Regressão reexecutada: npm test, 354 aprovados; npm run test:integration, 99 cenários aprovados. Saídas integrais no pacote da Fase 0, incluindo a tentativa inicial bloqueada pelo esbuild no sandbox e a reexecução autorizada bem-sucedida. São testes da base, não de YouTube: nenhum adaptador ou teste de vídeo existe ainda. Nenhuma chave foi criada/inserida em testes ou artefatos nesta fase.

Próximo passo somente após aprovação: Fase 1, contrato e adaptador simulável com fetch nativo. Parar na Fase 0.
