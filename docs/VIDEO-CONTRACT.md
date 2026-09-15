# Vídeo de apoio — Fase 1: contrato e adaptador

Implementado localmente, sem rota pública ou ativação. O adaptador usa fetch nativo, não chama LLM e não altera geração, histórico, cotas, cálculo, migrações ou dependências. Cache/cota são Fase 2; rota/alternativa HTTP são Fase 3. O documento próprio do aviso e consolidação de conteúdo são Fase 4 deste pedido, não uma interface.

A Fase 0 foi aprovada. Fica registrada a leitura aprovada: VIDEO_ENABLED false impedirá busca externa/entrega de vídeo, permitindo apenas a alternativa na futura rota protegida; rejeições de segurança permanecem. Nenhuma flag foi criada nesta fase. Tetos de uso e margem continuam sem números escolhidos.

## O que cada arquivo faz

- src/contracts/video.js: funções puras de entrada, saída, envelope mínimo do YouTube e classificação de erros. Usa ContractError existente sem modificar o contrato de geração.
- src/providers/youtube.js: monta uma requisição, limita espera/leitura, valida e devolve somente o resultado interno. Nunca devolve o corpo bruto ou a mensagem de erro do Google.
- tests/video-contract.test.js: nove testes de normalização, seleção, estrutura, ausência e erros.
- tests/youtube.test.js: quinze testes de transporte simulado, privacidade dos parâmetros, falhas, tamanho, prazo e concorrência.

## Entrada: somente o título

validateVideoInput recebe somente um objeto com title. Ingredientes, plano, visitante, preferências e qualquer campo extra são rejeitados. Retorna title normalizado, sem modificar o objeto recebido.

Na futura rota, o título deverá ser extraído da alternativa pertencente à sessão autenticada; este contrato puro **não autentica nem comprova propriedade**. Não aceitar qualquer título do navegador como prova de escolha do plano.

Normalização escolhida:

1. Limitar primeiro o tamanho bruto, evitando processamento de texto arbitrariamente grande.
2. Aplicar Unicode NFC: letras visualmente iguais com representação composta/decomposta ficam consistentes.
3. Remover espaços externos, reunir espaços repetidos e converter caixa em pt-BR.
4. Exigir até 100 caracteres normalizados, o teto já usado para títulos da geração; não truncar.
5. Aceitar letras, marcas de acento, números, espaços, apóstrofos e hífen interno. Exigir alguma letra.
6. Rejeitar links/HTML, caracteres invisíveis, operadores como barra vertical e menos no início de palavra. Não “limpar” retirando trechos que poderiam mudar o prato.

A consulta q é exatamente esse título: nenhum ingrediente adicional, preferência, identificador ou comando para a LLM é anexado. “Risoto de frango” mantém “frango” porque ele integra o nome, não porque a despensa foi consultada.

O título normalizado também poderá ser a base da chave global na Fase 2; não há cache agora. Preservar acentos evita juntar indiscriminadamente nomes. Grafias diferentes podem produzir buscas diferentes.

Limitação explícita: uma lista de caracteres não detecta todos os dados pessoais. “Arroz da Maria” passa, por exemplo; não afirmar anonimização de um título livre. Títulos com pontuação fora da lista podem ser recusados mesmo vindo de uma geração válida. A futura rota deve tratar isso como impossibilidade de busca complementar, sem invalidar a receita e sem reenviar o título rejeitado ao Google.

## Busca e escolha determinística

O adaptador faz um GET para o endpoint fixo search.list. Envia part=snippet, type=video, videoEmbeddable=true, videoSyndicated=true, relevanceLanguage=pt, regionCode=BR, safeSearch=strict, order=relevance e maxResults=5. Usa fields para receber apenas items/id e os campos selecionados de snippet. Uma página somente; não há paginação ou segunda consulta. [Referência oficial](https://developers.google.com/youtube/v3/docs/search/list).

**Cinco candidatos não são cinco chamadas nem um limite de uso por pessoa.** É o tamanho máximo da página que o contrato aceita, escolhido como conjunto pequeno para procurar uma correspondência sem aumentar páginas.

Cada candidato precisa ter id.kind de vídeo, ID de vídeo com 11 caracteres permitidos, canal com prefixo UC e 22 caracteres subsequentes, título não vazio até 200 caracteres e nome do canal até 100. Esses são limites defensivos deste contrato: mudança de formato causa falha segura, não uma tentativa de adivinhar o identificador.

O envelope é fechado em todos os níveis. Também se validam candidatos depois do primeiro possível resultado; se algum vier malformado ou com campo extra, a resposta inteira é rejeitada. Não selecionar um vídeo de uma resposta que violou o contrato.

Entre candidatos válidos, selecionar o primeiro cujo título contenha todas as palavras do nome do prato em sequência, mantendo acentos e ignorando caixa/pontuação na comparação. A ordem é a recebida do YouTube; não ordenar por popularidade, canal ou pontuação própria.

Exemplos de comportamento local para “risoto de frango”:

- “Como preparar RISOTO DE FRANGO” pode ser selecionado.
- “Risoto de camarão” não pode.
- “Risoto fácil de frango” também não passa: as palavras completas não estão consecutivas.
- “Risoto de frango com legumes” pode passar, mas isso **não comprova** que ensine a receita escrita.

Escolhi um critério conservador para evitar aceitar qualquer resultado da página. Ele pode perder vídeos úteis e ainda pode aceitar um título enganoso. Não analisa o vídeo, não confirma técnicas/ingredientes e não certifica idioma, segurança, incorporação futura ou qualidade. Os filtros do provedor são enviados, não auditados pelo app.

## Saída interna fechada

A saída contém somente version, status e video.

- version é 1.
- status é found ou not_found.
- found exige video com id, title, channel_id e channel_title.
- not_found exige video nulo.

ID do canal foi incluído para atribuição/link futuro, sem buscar perfil do canal. Título e canal retornados são preservados como texto, sem tradução, avaliação ou interpretação de HTML. A futura interface precisa renderizá-los como texto, não como marcação executável.

not_found significa **nenhum candidato aceito nesta página**, incluindo uma lista vazia. Não significa que não exista tutorial em todo o YouTube. O cliente futuro ainda terá “Buscar no YouTube”.

Esta saída ainda não contém o aviso, URL de player, consulta/URL do botão, orçamento ou status de cache. Essas partes pertencem à rota/conteúdo posteriores. Nenhum campo é acrescentado à resposta de geração.

## Transporte e credencial

searchYouTubeVideo aceita apiKey, fetchImpl e timeoutMs como opções internas. A futura origem da credencial é o segredo de servidor YOUTUBE_API_KEY; não existe valor desse segredo no repositório nem leitura de segredo real nesta entrega.

Enviar pelo cabeçalho X-Goog-Api-Key, não pela URL, seguindo a orientação do Google para chaves em requisições REST. O uso com a conta/YouTube real permanece não verificado; não há tentativa alternativa por query se falhar. [Orientação oficial](https://docs.cloud.google.com/docs/authentication/api-keys-use#using_an_api_key_with_rest).

O URL contém o nome do prato e parâmetros fixos; não contém credencial, identificador de visitante/plano, cookie ou corpo de geração. Não registrar esse URL ou os cabeçalhos.

Limites escolhidos para o complemento:

- Prazo padrão de cinco segundos; configuração interna inteira entre 1 e 10.000 milissegundos.
- Uma única data-limite cobre espera por cabeçalhos e corpo; aborta também a leitura parada.
- Até 16 KiB efetivamente lidos, inclusive quando Content-Length é ausente ou enganoso.
- UTF-8 inválido e JSON malformado são rejeitados.
- Redirecionamentos desabilitados: não encaminhar a credencial a um endereço fornecido pelo provedor.
- Nenhum retry, paginação, busca alternativa ou chamada de IA.
- Cancelamento/erro tardio tem tratamento, sem transformar resposta atrasada em sucesso.

O limite pequeno de bytes segue a orientação de leitura limitada para Workers, sem alterar a data de compatibilidade existente nem introduzir biblioteca. [Streams em Workers](https://developers.cloudflare.com/workers/runtime-apis/streams/readablestream/).

Os limites são decisões de implementação, não medidas de latência, CPU ou qualidade da API real. Testes Node não comprovam adequação ao orçamento de CPU na nuvem. Não foi ativado fluxo de logs/traces ou configuração de produção nesta fase isolada.

## Falhas não são ausência

VideoProviderError contém apenas nome, código interno e mensagem fixa em pt-BR. Não inclui causa, corpo do provedor, URL, cabeçalhos ou valores do pedido.

| Situação | Código interno |
| --- | --- |
| Configuração inválida/ausente | VIDEO_CONFIG_ERROR |
| Prazo excedido | VIDEO_TIMEOUT |
| Resposta de sucesso grande demais | VIDEO_RESPONSE_TOO_LARGE |
| JSON, UTF-8, esquema ou estado inválido | VIDEO_INVALID_RESPONSE |
| HTTP 403 com diagnóstico fechado quotaExceeded | VIDEO_QUOTA_EXCEEDED |
| HTTP 429 ou 403 com motivo de frequência reconhecido | VIDEO_RATE_LIMITED |
| HTTP 401 ou demais 403 | VIDEO_ACCESS_DENIED |
| Demais HTTP 4xx | VIDEO_REQUEST_REJECTED |
| HTTP 5xx/outro HTTP não bem-sucedido | VIDEO_UNAVAILABLE |
| Falha do transporte | VIDEO_NETWORK_ERROR |

O diagnóstico 403 é lido com o mesmo teto/prazo e validado por contrato, incluindo coerência de error.code com o HTTP. Só motivos reconhecidos produzem classificação específica. Corpo de erro extra/desconhecido/grande/malformado mantém acesso negado sanitizado; timeout mantém timeout. Não pressupor que todo 403 seja cota diária. [Erros do YouTube](https://developers.google.com/youtube/v3/docs/errors).

Essa diferenciação permite à Fase 2 não gravar uma indisponibilidade como cache de ausência e à Fase 3 produzir a alternativa tranquila. **O adaptador ainda lança erros internos; não existe resposta HTTP de vídeo nem botão implementado.** O mapa ERRORS da geração ficou intacto.

## Verificação e pendências

24 testes novos rodam automaticamente em npm test, que já usa node --test. Todo fetch novo é injetado e simulado. O marcador da credencial é somente o nome da variável YOUTUBE_API_KEY; não há chave real, chave fictícia semelhante à real, token gerado ou leitura de ambiente. Identificadores de vídeos/canais são sintéticos, não resultados pesquisados.

Testados: normalização/entrada fechada; seleção/ausência; campos desconhecidos em todos os níveis; limite de candidatos; metadados preservados; HTTP/cota/frequência; JSON/UTF-8; fronteira e excesso de bytes; corpo parado; cabeçalhos que ignoram abort; resposta/rejeição tardia; concorrência sem estado compartilhado; uma chamada por tentativa.

Resultados reais: npm test com 378 aprovados, zero falhas; npm run test:integration com 99 cenários aprovados. A integração teve uma tentativa inicial bloqueada pela leitura do esbuild no sandbox e passou na reexecução autorizada com workerd/D1 descartável e Groq simulada. Saídas integrais no pacote da entrega.

Integração existente é regressão do backend atual, não integração desta nova função no runtime: rota de vídeo e seus cenários workerd são Fase 3. Sem consulta real, header/chave/quota efetiva/seleção útil ainda dependem da validação posterior autorizada.

Faltam cache/cota/coordenação, escolha de tetos, migração, rota autenticada/ingress/flag, aviso/alternativa, limpeza do cache, MadeForKids antes de eventual player e teste real. Não implementar recuperação ou limpeza de histórico como consequência desta fase. Nenhuma etapa 4/5 de produto iniciada.

Parar e aguardar aprovação antes da Fase 2.
