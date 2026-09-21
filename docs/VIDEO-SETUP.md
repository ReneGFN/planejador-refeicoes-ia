# Vídeo de apoio — custos, preparação e primeiro teste real

Fase 4 deste pedido: conteúdo e documentação. Backend das Fases 1–3 entregue e testado localmente com YouTube simulado; interface e publicação (etapas 4/5 do produto) não iniciadas. VIDEO_ENABLED continua false e VIDEO_QUOTA_POLICY_JSON vazio em todos os ambientes versionados. Este documento não ativa nada.

## Custo de busca e capacidade da demo

Documentação oficial reconferida em 12/09/2026: search.list custa **1 unidade na cota própria de Search Queries**, com **100 chamadas diárias padrão por projeto**, reiniciadas à meia-noite do Pacífico. Não usar a conta antiga de 100 unidades por busca dentro de 10.000. Outros métodos têm orçamento separado; videos.list custa 1 unidade na franquia geral. Paginação e requisições inválidas também contam. A quota efetiva da sua conta precisa ser conferida. [Calculadora oficial](https://developers.google.com/youtube/v3/determine_quota_cost).

Unidades de quota não são tokens da IA nem um preço em reais. Este projeto não implementa compra automática de saldo, upgrade ou expansão de quota. Não prometemos custo zero ilimitado, nem deduzimos capacidade D1/Workers da franquia do Google. Aumentar quota é outro procedimento, não criar chaves/projetos para contornar o teto. [Orientação de quota e auditoria](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).

### Conta sem cache

Defina Q = quota real do projeto; O = orçamento de testes manuais e outros consumidores; M = margem de segurança; G = limite diário escolhido para o app. A política exige:

```text
G ≤ Q − O − M
```

Sem cache, cada nova busca externa consome uma vaga: no máximo G tentativas por dia, ainda sujeitas aos limites de minuto, visitante e rede. Timeout ou resposta inválida podem gastar quota; não se devolve a reserva. Uma reserva que falhe antes de enviar pode reduzir capacidade interna sem gasto externo. Logo, nem G resultados úteis são garantidos.

### Conta com cache

Se D solicitações forem admitidas para seleções válidas e H forem atendidas por cache positivo ou negativo válido, restam D − H candidatas a nova busca. Elas continuam sujeitas a cota, concorrência, configuração e disponibilidade. Não é correto afirmar que todas se transformarão em chamadas.

Sob a hipótese simplificada de que todas as faltas de cache podem ser buscadas, uma taxa de acerto h permitiria aproximadamente G / (1 − h) atendimentos. Isso é uma conta ilustrativa, não capacidade medida, e não considera os limites de acesso/D1.

Exemplo exclusivamente didático, **não política aprovada**: Q=100, O=10, M=10 e G=80. Sem cache, até 80 buscas. Se exatamente metade dos pedidos aproveitar cache, 160 pedidos poderiam exigir 80 buscas. Se houver ausência válida, ela também economiza consultas. Se h=100%, não há gasto de busca nesse conjunto; isso não significa usuários ilimitados, porque o resto do sistema mantém limites.

Nenhum desses números foi inserido na configuração. Você ainda deve escolher visitorDay/visitorMinute, networkDay/networkMinute, globalDay/globalMinute, projectDay, otherDay e marginDay. Cache encontrado dura 24h; ausência válida, 1h. Esses prazos são os implementados, não uma taxa de acerto medida. [Política e limitações](VIDEO-CACHE-QUOTA.md).

O contador global vale para o D1 compartilhado pelo limitador. Outros ambientes/serviços com a mesma quota precisam usar esse limitador ou ter orçamento reservado em O. Uma nova chave no mesmo projeto não cria franquia independente. [Visão geral da API](https://developers.google.com/youtube/v3/getting-started#quota).

## Requisitos da etapa 4 do produto

Esta seção é preparação, não implementação de interface nem auditoria jurídica. Revalidar os termos antes da publicação.

- Aviso exato de [VIDEO-SUPPORT-NOTICE.md](VIDEO-SUPPORT-NOTICE.md) junto ao apoio e antes da reprodução. Busca sempre disponível, inclusive com sucesso e quando o player falhar. Essas são decisões do produto, não afirmação de que o texto foi aprovado pelo YouTube.
- Identificar YouTube com atribuição/marca oficial adequada, sem sugerir endosso do aplicativo ou da IA. Tratar título/canal como texto, nunca HTML executável. [Marca e atribuição](https://developers.google.com/youtube/terms/branding-guidelines).
- Disponibilizar termos do YouTube e política de privacidade acessível, explicando compartilhamento, cookies e política do Google. Planejar a apresentação e o aceite exigidos. O aviso culinário não substitui isso. [Políticas III.A](https://developers.google.com/youtube/terms/developer-policies#a.-api-client-terms-of-use-and-privacy-policies).
- Antes de incorporar, verificar MadeForKids e cumprir o tratamento de rastreamento/coleta aplicável. O guia indica videos.list com id/status; search.list não resolve essa verificação. Essa consulta adicional, seu contrato/cache e orçamento **não foram implementados**. Não mostrar player antes de resolver a dependência. [Guia MadeForKids](https://developers.google.com/youtube/v3/guides/made_for_kids_status).
- Usar player oficial, sem cobrir controles, bloquear anúncios, baixar mídia, separar faixas ou reproduzir ocultamente. Respeitar o tamanho mínimo de 200 × 200 e os controles. [Referência do player](https://developers.google.com/youtube/iframe_api_reference#Requirements), [guia de conformidade](https://developers.google.com/youtube/terms/developer-policies-guide).
- Não suprimir a identificação exigida por Referer; avaliar a política de referência do navegador sem expor caminhos/IDs internos. [Identificação do cliente](https://developers.google.com/youtube/terms/required-minimum-functionality#api-client-identity-and-credentials).
- Explicar o compartilhamento antes de carregar o player e preferir ação explícita, sem autoplay. Essa é uma escolha de privacidade do produto; não afirmar que desligar autoplay impede toda coleta. O clique no próprio YouTube também cria comunicação do navegador com terceiros.
- Garantir remoção/atualização efetiva de metadados em até 30 dias, inclusive sem visitas. A limpeza por acesso implementada não garante esse máximo; agendamento/capacidade precisam de verificação antes de ativar. Não confundir essa pendência com limpeza do histórico alimentar. [Políticas III.E](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content).

Abrir o vídeo no YouTube, em vez de incorporar, permanece alternativa de apresentação a avaliar; não escolhemos silenciosamente substituir o player. Nenhuma implementação de frontend foi feita nesta fase.

## O que você precisa preparar no Google

1. Acessar o Google Cloud Console, selecionar o projeto correto e habilitar YouTube Data API v3 na biblioteca de APIs.
2. Em APIs e serviços / Credenciais, criar uma chave de API para acesso a dados públicos. Este teste não precisa de OAuth nem de acesso à conta YouTube do visitante. [Preparação oficial](https://developers.google.com/youtube/v3/getting-started#before-you-start).
3. Aplicar restrição de API à YouTube Data API v3. A restrição de aplicação deve corresponder ao local que chama: este primeiro teste sai do seu computador, não do navegador do app. Não configurar HTTP Referer como se fosse chave de frontend. Se usar restrição por IP, ela precisa aceitar o IP de saída efetivo do teste. Não presumir IP fixo de saída para Workers; fechar essa configuração antes da publicação. [Proteção das chaves](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices).
4. Conferir no painel de quotas do mesmo projeto o limite/consumo de Search Queries e reservar uma chamada manual em O. A consulta pode falhar ou não encontrar candidato; não reservar somente para resultados encontrados.
5. Guardar a chave privadamente. Não mandar pelo chat, anexar screenshot, colocar no README, argumento de comando, URL ou código. Se houver exposição, revogar/substituir no Google.

## Onde entra a chave

Nome usado pelo backend: **YOUTUBE_API_KEY**. É segredo do servidor, não variável pública do frontend. O adaptador envia a credencial em cabeçalho e não registra seu valor.

Para o teste abaixo, o valor fica temporariamente no ambiente do processo do terminal e do Node; não é salvo em arquivo, Git ou configuração permanente do Windows. Isso não promete apagar todas as cópias da memória do sistema.

No Pages, quando houver autorização para configurar o ambiente: projeto correto → Settings → Variables and Secrets → Add → nome YOUTUBE_API_KEY → valor privado → Encrypt → Save. Conferir preview/produção separadamente e o deployment que utilizará o segredo. Não ativar a flag apenas por ter cadastrado a chave. [Segredos no Pages](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

Para desenvolver com Pages local futuramente, .dev.vars ou .env podem conter segredos, nunca os dois indiscriminadamente. O .gitignore atual ignora esses arquivos; os arquivos de exemplo não podem conter valores. O comando Node isolado abaixo **não carrega .dev.vars automaticamente**. [Desenvolvimento local com segredos](https://developers.cloudflare.com/pages/functions/bindings/#local-development-with-secrets).

Não execute wrangler secret put de Workers como se fosse uma gravação local: comandos de segredos/publicação têm efeitos de implantação e devem usar o produto/ambiente correto. Nesta fase não executamos nenhum deles.

## Primeira busca real — executar uma única vez por você

Use PowerShell, Node 22 ou superior, na raiz deste repositório, onde existe package.json. Não é um comando para o console do navegador.

**Este é um teste isolado do adaptador, não um teste da rota pública.** Não lê nem grava D1, não aplica migrações, não usa sessão/cache/cota interna e não muda VIDEO_ENABLED. Faz no máximo uma chamada externa, sem retry, para o prato neutro “arroz”. Conta no orçamento O, não em G. Se você repetir o bloco manualmente, será outra tentativa — não há proteção de idempotência nesse teste isolado.

Feche ferramentas de captura/transcrição de segredos e use um terminal confiável. O campo de entrada fica oculto; não cole a chave dentro do bloco de código.

```powershell
if (-not (Test-Path -LiteralPath './src/providers/youtube.js')) {
  throw 'Abra o terminal na raiz do repositório Refeição Fácil.'
}
$videoPreviousKey = $env:YOUTUBE_API_KEY
$videoSecureKey = $null
$videoProbe = @'
import { searchYouTubeVideo, VideoProviderError } from './src/providers/youtube.js';
try {
  const result = await searchYouTubeVideo({ title: 'arroz' }, {
    apiKey: process.env.YOUTUBE_API_KEY
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    code: error instanceof VideoProviderError ? error.code : 'LOCAL_TEST_FAILED',
    message: error instanceof VideoProviderError ? error.message : 'Não foi possível concluir o teste local.'
  }));
  process.exitCode = 1;
}
'@
try {
  $videoSecureKey = Read-Host 'Informe YOUTUBE_API_KEY (entrada oculta)' -AsSecureString
  $env:YOUTUBE_API_KEY = [System.Net.NetworkCredential]::new('', $videoSecureKey).Password
  node --input-type=module --eval $videoProbe
} finally {
  $env:YOUTUBE_API_KEY = $videoPreviousKey
  if ($null -ne $videoSecureKey) { $videoSecureKey.Dispose() }
  $videoPreviousKey = $null
  $videoSecureKey = $null
  $videoProbe = $null
}
```

Como funciona: Read-Host recebe a chave sem exibi-la; o ambiente do processo a entrega ao Node sem colocá-la na linha de comando; o Node importa o adaptador já testado e imprime só resultado validado ou erro sanitizado; finally restaura o valor anterior do ambiente, inclusive quando ocorre falha. Não alteramos configurações permanentes. O trecho JavaScript contém somente o nome da variável, nunca o valor da chave.

Possíveis resultados:

| Resultado | O que significa / próxima ação |
| --- | --- |
| status=found | Um candidato passou pelo contrato e regra textual. Não prova correspondência culinária nem qualidade. |
| status=not_found | Consulta válida, mas nenhum candidato aceito. Não repetir automaticamente. |
| VIDEO_CONFIG_ERROR | Conferir entrada da chave e ambiente local; normalmente não chegou a enviar. |
| VIDEO_ACCESS_DENIED / VIDEO_REQUEST_REJECTED | Conferir habilitação da API e restrições no projeto correto; o erro não prova sozinho qual configuração está errada. |
| VIDEO_QUOTA_EXCEEDED / VIDEO_RATE_LIMITED | Conferir quota; não trocar chaves/projetos para insistir. |
| VIDEO_TIMEOUT / VIDEO_NETWORK_ERROR / VIDEO_UNAVAILABLE | Interromper e avaliar; não sabemos se o provedor já contabilizou a tentativa. |
| VIDEO_INVALID_RESPONSE / VIDEO_RESPONSE_TOO_LARGE | O adaptador recusou a resposta; não relaxar contrato nem salvar envelope bruto para contornar. |

O agente **não executou esse comando com chave real**. A sintaxe PowerShell e JavaScript foi conferida sem execução da chamada ou leitura de chave. As suítes usam transporte simulado; disponibilidade, autenticação Google, quota da conta e relevância de tutorial continuam sem medição real. Você pode relatar status/código sanitizado e consumo observado no painel, nunca chave/cookies/cabeçalhos privados. Evite salvar metadados do vídeo indefinidamente em arquivos ou anexos.

## Ativação da rota é outro passo

Um teste isolado bem-sucedido não autoriza ligar a demo. Para o fluxo completo, são necessários: ambiente selecionado e migrado com autorização própria; sessão e plano válidos; política de ingress e segredos existentes; YOUTUBE_API_KEY privada; limites de vídeo aprovados; limpeza agendada; requisitos de exibição/privacidade resolvidos. Só depois avaliar VIDEO_ENABLED=true e testar POST /api/video com a seleção autorizada descrita em [VIDEO-ROUTE.md](VIDEO-ROUTE.md). Nenhum desses comandos de implantação foi acrescentado como ação automática.

## Consolidação e verificação desta fase

CHECKLIST e ROADMAP tinham duas menções que poderiam fazer o vídeo parecer ainda não implementado; foram atualizadas com ligação ao estado atual. USAGE-FLOW não tinha uma terceira ocorrência equivalente: recebeu o estado consolidado, sem inventar uma substituição. A frase de PLAN-HISTORY que exclui vídeo daquele Item 1 foi preservada, pois descreve o escopo histórico e o pedido proíbe alterar o histórico entregue.

Os registros antigos das fases permanecem identificados como históricos. A Fase 4 deste pedido termina a documentação do backend, não a etapa 4 de interface nem a etapa 5 de publicação do produto. Código, testes, migrações, dependências, flags e políticas permanecem como na Fase 3.

Regressão reexecutada nesta fase: npm test com 442 aprovados e npm run test:integration com 123 cenários aprovados, sem testes novos. A primeira tentativa de integração foi bloqueada pelo acesso do esbuild no sandbox antes dos testes; reexecução autorizada passou. Aviso comparado ao contrato e sintaxe do roteiro conferida sem chamada externa. Logs integrais e diff isolado acompanham a entrega. Nenhum resultado dependente da chave foi marcado como verificado.
