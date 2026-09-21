# Item 6 — medição local do caminho da foto

Instrumento em [measure-image-path.mjs](../scripts/measure-image-path.mjs), sem alteração de código do produto. **Mede esta máquina em Node, NÃO o plano Free da Cloudflare.** Não existe aprovação/reprovação por milissegundos ou memória, nem conclusão sobre celular ou viabilidade na nuvem.

## Executar

```sh
npm run measure:images
```

Exige apenas o Node já usado pelo projeto e permissão para iniciar processos locais. Não pede chave, usa rede, chama Groq, acessa D1 ou lê fotos pessoais. Não grava imagens ou relatório automaticamente; imprime JSON no terminal. O comando npm acrescenta seu cabeçalho antes do JSON; para obter somente JSON, executar `node scripts/measure-image-path.mjs`.

O processo principal inicia sequencialmente um processo Node novo para cada tamanho: 0,5 MiB (524288 bytes), 2 MiB (2097152 bytes) e 5 MiB (5242880 bytes). Os filhos não herdam chaves nem configuração da aplicação. A opção interna `--sample` executa um único tamanho permitido; não aceita caminho de foto ou URL externa.

## O que percorre

1. Prepara em memória uma amostra de bytes variados, com assinatura JPEG, e um pedido multipart com uma única parte `image`.
2. Executa a função real `readImageUpload`: leitura limitada, envelope multipart, parser, pré-validação e checagem de assinatura.
3. Executa a função real `imageDataUrl`: repete a pré-validação/assinatura existente, lê os bytes e monta a data URL base64 em blocos.
4. Reporta duração, CPU e memória, preservando os valores numéricos medidos. Confere tamanho, assinatura e comprimento da codificação, mas não compara desempenho com um teto.

**As amostras não são fotos nem JPEGs decodificáveis.** Passam apenas pela triagem por assinatura que o produto faz hoje. São úteis para exercitar volume de bytes, multipart e base64; não verificam integridade visual, dimensões, EXIF/GPS, orientação, reconhecimento ou aceitação pela Groq. Não foram enviadas ao provedor.

Não há socket de upload: o multipart é produzido e consumido localmente. O cronômetro começa depois de criar a Request/amostra e inclui o consumo/serialização do corpo ainda pendente no Node. Não simula velocidade de internet. Também não inclui sessão, origem, cotas, D1, montagem/serialização do JSON completo do provedor, chamada de IA ou processamento da resposta.

## Como ler tempo e memória

- `duration_ms.upload_and_signature`: tempo decorrido para ler e validar o upload.
- `duration_ms.signature_and_base64`: tempo decorrido na função de codificação atual, incluindo sua segunda checagem de assinatura.
- `duration_ms.total`: do início da leitura ao retorno da data URL, incluindo a coleta intermediária de memória. Pode diferir da soma dos dois trechos.
- `cpu_ms.user/system`: CPU do processo durante esse intervalo. Não é CPU faturada/limitada pelo Worker e pode diferir do tempo de relógio.
- `memory.before/after_upload/after_base64`: fotografias numéricas da memória nesses pontos, em bytes. RSS é memória residente do processo; heap, memória externa e ArrayBuffers são categorias parcialmente sobrepostas. Não somar essas categorias como se fossem independentes.
- `process_peak_rss_kib_before/after`: pico residente acumulado do processo até cada leitura, em KiB, obtido por `process.resourceUsage().maxRSS`. Inclui inicialização, imports, amostra e instrumentação, não só o caminho medido. Se o contador não fornecer um valor positivo válido, aparece `null`, não zero.

Um processo novo por tamanho evita herdar o pico do tamanho anterior. Não elimina custo de inicialização, diferenças entre runtimes, coleta de lixo ou concorrência com outros programas. Não subtrair o pico inicial do final e chamar a diferença de “pico exclusivo do upload”. Amostrar memória apenas com um timer poderia perder alocações transitórias durante a codificação síncrona; por isso o instrumento usa o pico registrado pelo processo.

Uma amostra por tamanho, sem aquecimento, média, percentil ou inferência estatística. Os testes de `npm test` também executam o instrumento, mas não são um ambiente isolado de outras tarefas; para observar números, usar o comando dedicado e repetir manualmente se necessário. O timeout de subprocesso de 60 segundos evita um instrumento preso; é proteção operacional, não critério de desempenho ou limite da Cloudflare.

Sem dependências novas, relatório de diagnóstico completo do Node ou despejo de variáveis de ambiente. Falhas operacionais retornam mensagem sanitizada e código de saída diferente de zero, sem conclusão sobre a nuvem.

Referência de unidades e APIs consultada: [Node 22.16 — resourceUsage](https://nodejs.org/download/release/v22.16.0/docs/api/process.html#processresourceusage), [memoryUsage](https://nodejs.org/download/release/v22.16.0/docs/api/process.html#processmemoryusage) e [cpuUsage](https://nodejs.org/download/release/v22.16.0/docs/api/process.html#processcpuusagepreviousvalue). A medição foi feita na versão instalada, sem substituir ferramentas do projeto.

## Uma execução real local, não um veredito

Execução em 2026-09-11, Node v22.16.0, Windows x64. Valores de tempo arredondados apenas nesta tabela; JSON do comando mantém a precisão retornada.

| Amostra (MiB) | Tempo total local (ms) | Pico RSS do processo (KiB) | Caracteres base64, sem prefixo |
|---|---|---|---|
| 0,5 | 29,00 | 58660 | 699052 |
| 2 | 91,73 | 75364 | 2796204 |
| 5 | 215,43 | 112928 | 6990508 |

Esses valores não significam “cabe” ou “não cabe” no Free. O resultado de 5 MiB gera 6990508 caracteres base64, mais o prefixo da data URL. Comprimento da string não equivale a toda a memória usada: há buffers, cópias e estruturas do parser/runtime.

## Se a medição futura na nuvem exceder o orçamento

Primeiro distinguir CPU, memória, tamanho de payload ou recusa do provedor por evidência real; os números acima não identificam qual seria o gargalo na nuvem. Nenhuma saída abaixo foi escolhida ou implementada:

| Saída | O que mudaria | Custo e limitação |
|---|---|---|
| Reduzir o teto de 5 MiB | Rejeitar arquivos maiores com contrato/limites/testes coerentes. | Menor esforço de código, mas mais fotos recusadas e trabalho manual para a pessoa. O leitor atual aloca pelo teto do corpo (6 MiB); reduzir só o teto do arquivo não reduz essa alocação fixa. Não há novo valor escolhido nem garantia de resolver CPU. |
| Exigir redimensionamento/compactação no cliente | A futura interface produziria arquivo menor antes do envio; servidor ainda validaria tamanho/tipo. | Trabalho na etapa 4, testes em aparelhos/navegadores, CPU/memória/bateria no celular, tratamento de orientação e formatos. Rótulos podem perder legibilidade. Não afirmar remoção de metadados sem verificá-la. Evita serviço adicional para essa transformação, mas não comprova gratuidade do fluxo inteiro. |
| Processar de outra forma | Investigar menos cópias no multipart/base64 ou, se insuficiente, mover a preparação para ambiente com orçamento adequado. | Refatoração exige testes de bytes, limites e segurança; o JSON do provedor e seus limites ainda precisam ser atendidos. Outro serviço pode adicionar cobrança, latência, segredos e tratamento/armazenamento temporário de fotos. Exige arquitetura, preços e retenção verificados antes de aprovar; não há valor monetário confiável sem escolher e dimensionar o serviço. |

Não resolver com retries de IA, remoção de controles de entrada ou armazenamento improvisado de fotos. Se uma saída exigir persistência temporária ou infraestrutura adicional, pedir autorização específica. Não alterar cotas, subir de plano ou publicar como consequência automática deste diagnóstico.

## Aviso antes do envio

Texto pronto em [PHOTO-UPLOAD-NOTICE.md](PHOTO-UPLOAD-NOTICE.md), separado do instrumento. É conteúdo para a futura interface, não uma tela implementada nem uma política de retenção verificada do provedor. O original e seus eventuais metadados continuam no caminho atual.

## Verificação e pendências

Cinco testes novos em [image-path-measurement.test.js](../tests/image-path-measurement.test.js) verificam tamanhos, triagem sintética, formato de relatório, subprocessos e argumentos inválidos. Sem asserção de desempenho. `npm test`: 116 aprovados; `npm run measure:images`: três medições locais concluídas. Integração workerd/D1 não executada novamente neste item: rotas e banco não foram alterados.

Nenhum upload/adaptador, prompt, contrato do produto, quota ou migração alterados; sem chamada real à IA, remoção de metadados, interface ou publicação. Item 7 fica para a próxima entrega. Retomadas dos Itens 4 e 5 após concluir o Item 8 registradas em [ROADMAP.md](ROADMAP.md).
