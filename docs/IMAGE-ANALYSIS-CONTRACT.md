# Contrato de análise de imagem v1

Atualizado em 2026-09-11 para o primeiro PWA. Contrato, upload limitado e adaptador Qwen ligados à rota local com sessão e cotas atômicas, testados com provedor simulado. A configuração mantém a rota desativada. O usuário compartilhou uma execução real anterior e relatou dois falsos positivos; ver [registro](GROQ-TESTING.md). Reteste do prompt revisado e medição de CPU em produção seguem pendentes. Sem migração remota ou liberação pública. Ver [fluxo atual](USAGE-FLOW.md).

## Funções implementadas e suas fronteiras

- `validateImageAnalysisOutput`: valida campos, estados, nomes e duplicatas; devolve uma cópia com trim e normalização Unicode NFC. Não verifica se o alimento realmente aparece na foto.
- `parseImageAnalysisOutput`: aceita texto JSON puro, limitado a 32 KiB em UTF-8, e chama o validador. Não aceita Markdown, não tenta consertar JSON nem reproduz conteúdo bruto em erros. O transporte compartilhado em `groq-client.js` limita o envelope HTTP a 256 KiB durante leitura.
- `mergeConfirmedIngredients`: une listas depois de confirmação explícita, preservando ordem e grafia normalizada dos itens existentes. Remove duplicatas simples; recusa resultado acima de 40 itens sem modificar as entradas. Não comprova confirmação humana, não salva o rascunho e não implementa a interface. Erro de excesso: `INGREDIENT_LIMIT_REACHED`, local, sem chamada à IA.
- `validateImageFilePreflight`: recebe um Blob não vazio e verifica tamanho de até 5 MiB e MIME declarado JPEG/PNG/WebP. Isso não comprova formato real, integridade, dimensões ou ausência de animação. Arquivos com bytes falsos podem passar nesta função; ela não autoriza encaminhamento ao provedor.

O limite de 6 MiB do corpo HTTP é aplicado durante leitura por `readImageUpload`, mesmo sem Content-Length ou com tamanho declarado falso. A função exige exatamente uma parte de arquivo `image`, limita cabeçalhos da parte a 2 KiB, recusa encoding comprimido, trata cancelamento e usa prazo de 15 segundos para receber o corpo. Não aceita preâmbulo/epílogo multipart. Confere assinaturas iniciais JPEG/PNG/WebP contra o MIME e descarta o nome original. Não armazena nem envia o arquivo à rede.

Seu resultado `{ file, validation: "signature_only" }` é interno e **não é aprovação de integridade**. Um arquivo truncado com assinatura válida ainda passa nessa triagem; na demo, o provedor poderá recusá-lo. A função deve ser chamada somente após sessão e controles de abuso; essas proteções não estão implementadas nela. O timeout cobre leitura assíncrona, não limita CPU do parser síncrono.

O teto anteriormente proposto de 16 milhões de pixels foi retirado: não há inspeção/decodificação de pixels no fluxo simplificado escolhido pelo usuário. Não anunciar garantia de dimensões, imagem estática, integridade completa ou remoção de metadados. Testes locais não demonstram que o processamento completo caberá no orçamento de CPU/memória do plano Free.

Executar `npm test` para testes Node; `node scripts/check-image-upload-runtime.mjs` para seis cenários no workerd local via ferramentas já instaladas pelo Wrangler. O segundo script não publica rota nem chama Groq: a resposta do provedor é simulada. Ele usa a data de compatibilidade do projeto, sem nodejs_compat, e não testa desempenho de produção.

### Decisão revisada: envio da foto original na demo

A pedido do usuário, não decodificar pixels, redimensionar, recompactar ou remover metadados no Worker nesta demo. O backend confere tamanho/tipo/assinatura, encaminha a foto original ao Qwen e valida o JSON retornado. Isso substitui a exigência anterior de decoder/re-encode antes do envio. O banco recebe futuramente apenas dados confirmados e planos, nunca a imagem.

Não adicionar Cloudflare Images, Worker auxiliar ou bibliotecas de processamento de imagem nesta etapa. As boas práticas de Workers orientaram leitura limitada, erros controlados e teste no runtime. A [documentação de limites](https://developers.cloudflare.com/workers/platform/limits/) informa 10 ms de CPU por requisição Free: codificação base64 e serialização também consomem CPU e precisam ser medidas. Base64 aumenta o transporte em aproximadamente um terço; o teto de 5 MiB é técnico/provisório e deve ser confirmado em chamadas reais, não interpretado como garantia do limite do Groq para todos os transportes.

Metadados originais podem chegar ao provedor. Antes do envio público, exibir aviso claro, não prometer anonimização e orientar fotos só de alimentos. Remoção de EXIF/GPS e revisão aprofundada de segurança ficam registradas para antes de um lançamento real. Chave protegida, cotas, validação básica, isolamento do histórico e ausência de logs de imagens continuam requisitos da demo.

## Objetivo e fluxo

Somente no modo Cozinhar, a pessoa escolhe digitação, câmera/galeria ou combinação. Selecionar uma foto abre prévia; a chamada ocorre apenas após ação explícita de analisar. A câmera é opcional e sua permissão só deve ser solicitada ao usá-la. Negação, falha ou cota visual esgotada preservam a alternativa de digitar.

Uma análise identifica candidatos a ingredientes, não gera receitas. A interface deverá mostrar a lista para revisão, permitir remover/adicionar itens e mesclar os confirmados ao rascunho existente, sem sobrescrevê-lo. A normalização remove espaços nas extremidades (trim), usa NFC e compara sem distinção entre maiúsculas/minúsculas. Não altera espaços internos nem funde nomes semanticamente parecidos. O resultado é compatível com o contrato de geração existente.

Fechar o painel ou trocar de opção preserva os ingredientes e demais campos do rascunho; a persistência do rascunho ainda precisa ser implementada. A imagem fica apenas na prévia temporária e não precisa sobreviver a recarregar/fechar o app. Descartar sua referência temporária quando removida ou concluída a confirmação. Se a resposta chegar após remover/substituir a foto, não aplicá-la ao rascunho atual; uma chamada já enviada pode ter consumido cota.

## Entrada do endpoint proposto

`POST /api/analyze-ingredients`, autenticado pela sessão de visitante e protegido por cotas. Implementado localmente, desativado na configuração padrão. Exige `Idempotency-Key` UUID v4, origem igual à aplicação e cookie válido.

- Transporte: `multipart/form-data`, com exatamente um campo de arquivo chamado `image`. Não há JSON de receita nessa requisição.
- Formatos aceitos na triagem: JPEG, PNG e WebP, comparando MIME declarado e assinatura inicial. SVG/HEIC/HEIF não são aceitos; informar a necessidade de selecionar formato compatível. Não há verificação local de animação ou decodificação completa; o Groq poderá recusar o arquivo. Não prometer suporte automático a todo arquivo de celular.
- Limites técnicos iniciais do app: uma imagem, até 5 MiB de arquivo e corpo HTTP completo até 6 MiB. Aplicar limites durante leitura no servidor, inclusive sem `Content-Length`. Arquivo acima do teto é recusado, não reduzido automaticamente. Esses tetos não são cotas do Groq e devem ser validados em testes de celulares e recursos do servidor.
- Não aceitar URLs arbitrárias nem buscar endereços fornecidos pelo usuário. Isso evita que o upload se torne uma ferramenta de acesso do servidor a destinos não autorizados.
- Não aceitar modelo, prompt, ID de visitante ou contadores enviados como autoridade pelo cliente. Modelo e instruções são definidos no servidor; sessão define o visitante.
- Encaminhar os bytes originais em data URL base64, sem transformação ou remoção de metadados. Não guardar essa representação em histórico ou logs. O nome original do arquivo é descartado; isso não remove EXIF/GPS dos bytes.

## Saída visual normalizada

Todos os campos abaixo são obrigatórios, sem propriedades adicionais. A resposta não contém receitas, quantidades, calorias, preços, validade ou avaliação de conservação.

```json
{
  "version": 1,
  "status": "recognized",
  "ingredients": ["arroz", "ovo", "cenoura"]
}
```

| Campo | Regra |
|---|---|
| `version` | Inteiro exatamente `1`. |
| `status` | `recognized`, `no_ingredients` ou `unreadable`. |
| `ingredients` | Lista de nomes, cada um com 1–80 caracteres após trim; máximo de 40 itens, sem duplicatas normalizadas. |

Relações obrigatórias a validar no servidor:

- `recognized`: entre 1 e 40 ingredientes identificáveis; sempre exigir revisão na interface.
- `no_ingredients`: lista vazia; imagem analisável, mas sem ingredientes identificáveis. Não é uma afirmação de que não existem alimentos no local.
- `unreadable`: lista vazia; imagem decodificável, mas visualmente inadequada para a tarefa (por exemplo, muito escura ou desfocada).
- Campos extras, status incompatível com a lista ou limites excedidos invalidam a resposta inteira. Não truncar silenciosamente nem transformar erro técnico em lista vazia bem-sucedida.

Exemplos sem reconhecimento:

```json
{"version":1,"status":"no_ingredients","ingredients":[]}
```

```json
{"version":1,"status":"unreadable","ingredients":[]}
```

O prompt exige nomes culinários comuns em pt-BR, em minúsculas, sem marcas ou transcrição literal de rótulos estrangeiros. As chaves e enums técnicos do JSON permanecem inalterados. Exige evidência visual suficiente e nome legível para embalagens fechadas/opacas; na dúvida, omitir em vez de adivinhar por formato/cor ou completar com categorias vagas. Não obedecer instruções escritas na imagem. Não criar lista proibida de alimentos a partir de erros de uma foto.

Depois do parser, apenas o adaptador visual transforma os nomes em minúsculas pt-BR, reduz sequências de espaços a um espaço e normaliza NFC; em seguida revalida limites/duplicatas. O contrato compartilhado e a mescla de texto confirmado continuam preservando grafia. Essa transformação não traduz, não detecta idioma nem verifica presença na foto. Idioma e precisão são instruções ao modelo, não garantias do validador. JSON válido não comprova reconhecimento correto; revisão humana continua necessária. Não usar percentuais de confiança inventados pela LLM.

Adaptador preparado para `qwen/qwen3.6-27b`, com uma chamada real relatada pelo usuário; qualidade, cotas e prompt revisado ainda precisam de avaliação. Usa JSON Object Mode, não o JSON Schema estrito do adaptador GPT-OSS. Valida e normaliza o conteúdo no contrato acima. Limite provisório de 1.024 tokens de saída, `reasoning_effort: none`, sem streaming e sem repetição automática. Troca de modelo deve preservar o contrato público, após testes.

## Integração com geração de refeições

Após confirmação/edição, a lista alimenta `ingredients` do [contrato de geração](GENERATION-CONTRACT.md). Foto e digitação convergem nesse mesmo formato. A origem da lista não modifica o JSON da receita. Uma análise vazia preserva o rascunho e oferece nova foto ou digitação; não muda automaticamente para “Pode sugerir ingredientes”.

Se a combinação exceder 40 itens, pedir que a pessoa revise; não descartar ingredientes silenciosamente. Não gerar refeições automaticamente ao analisar ou confirmar uma foto: a geração continua sendo uma ação própria.

## Erros, consumo e proteção

Contrato de erro proposto: `{ "code": "IMAGE_INVALID", "message": "Não foi possível ler este arquivo de imagem." }`. Códigos estáveis, mensagem curta em português, sem dados da imagem ou corpo bruto do provedor.

| HTTP | Casos previstos |
|---|---|
| 400 | `IMAGE_INVALID`: campo ausente/extra ou assinatura/MIME incompatível. Não detecta todo arquivo corrompido. |
| 408 | `IMAGE_UPLOAD_TIMEOUT`: prazo de recebimento do corpo excedido (distinto do prazo do provedor). |
| 401 | `SESSION_REQUIRED`: sessão ausente ou inválida. |
| 413 | `IMAGE_TOO_LARGE`: limite de bytes do arquivo ou corpo excedido. |
| 415 | `IMAGE_UNSUPPORTED`: formato não aceito. |
| 403 | `ORIGIN_FORBIDDEN`: origem/HTTPS inválidos. |
| 409 | `DUPLICATE_REQUEST`: tentativa já recebida, sem nova chamada à IA. |
| 422 | `PROVIDER_REJECTED_REQUEST`: provedor recusou a requisição/imagem. Não converter em sucesso com lista vazia. |
| 429 | `LIMIT_REACHED` ou `RATE_LIMITED`: limite local ou do provedor. |
| 502 | `INVALID_OUTPUT` ou `TRUNCATED`: saída inválida ou truncada do provedor. |
| 503 | `NOT_READY`, `REFUSED` ou `SERVICE_UNAVAILABLE`: integração desabilitada, recusa ou erro interno/provedor. |
| 504 | `TIMEOUT`: prazo do provedor excedido. |

Resposta de sucesso/erro deve usar `Cache-Control: no-store`; o service worker não deve armazenar upload ou resposta visual. Limitar corpo da resposta do provedor, definir timeout e não repetir chamadas automaticamente. Metadados de modelo/tokens vêm do envelope do provedor, nunca do conteúdo escrito pela IA; armazenamento e exposição desses metadados serão definidos na implementação.

A rota compartilha o tratamento de erros em `src/http/api.js`, com mensagens em pt-BR e `quotaReserved` indicando reserva de IA nesta tentativa. Falhas internas/configuração são reduzidas a `SERVICE_UNAVAILABLE`. Não tratar toda recusa como certeza de foto corrompida. O conteúdo visual v1 permanece dentro de `data`; envelope de sucesso também contém `metadata` do provedor e `quota`. Ver [fluxo atual](USAGE-FLOW.md).

Cotas de fotos e refeições já são separadas, com reserva atômica e tratamento de concorrência/reenvios testados localmente. Valores individuais de fotos e tetos globais/de tokens permanecem pendentes de medição/configuração. Reservas não são estornadas automaticamente em falhas; trocar modelo não reinicia a cota individual da operação.

## Persistência e privacidade

Não criar tabela de fotos nem salvar imagens no D1, armazenamento de objetos, cache persistente do navegador, logs ou histórico. Proposta: persistir apenas ingredientes confirmados e pedido/plano, com isolamento por visitante e exclusão. Não anunciar essa persistência como pronta.

Nenhuma migração SQL é necessária só para o contrato visual: as tabelas existentes possuem campos JSON e os contadores podem distinguir operações por chaves geradas no servidor. O formato de persistência e a convenção dos contadores ainda precisam de implementação/testes próprios.

Antes do envio, informar que a foto será processada pelo Groq e orientar enquadrar só os alimentos, evitando pessoas e documentos. Verificar e documentar retenção do provedor antes de liberar; não confundir ausência de armazenamento no app com garantia de retenção zero por terceiros.

## Critérios para implementação concluída

- Testes de upload limitado, MIME/assinatura incompatíveis, múltiplos arquivos e tratamento de recusa do provedor; inspeção de pixels fica fora da demo.
- Testes dos três estados de sucesso, campos extras, duplicatas, lista incompatível e JSON inválido.
- Testes de sessão, reserva de cotas, timeout, indisponibilidade e resposta tardia sem alteração indevida do rascunho.
- Fotos reais de alimentos soltos, embalagens, geladeira cheia, baixa iluminação e imagem sem alimentos; revisar acertos, omissões, invenções, tempo e tokens.
- Testes móveis de câmera/galeria/digitação, combinação, confirmação, permissão negada e preservação do rascunho.
- Verificação de ausência de imagens em logs, banco e cache persistente do app.

Referências consultadas na discussão de 2026-09-10: [visão no Groq](https://console.groq.com/docs/vision), [modelo candidato](https://console.groq.com/docs/model/qwen/qwen3.6-27b), [limites do Groq](https://console.groq.com/docs/rate-limits). Disponibilidade e limites da conta precisam ser conferidos nos testes reais.
