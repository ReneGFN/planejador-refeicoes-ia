# Item 7 — B na demo PWA; A reservada para o aplicativo

Decisão do usuário em 2026-09-11: **B para a demo PWA — retirar calorias e valores nutricionais da promessa; A para a futura fase do aplicativo — integrar uma fonte real, começando pela avaliação da TACO.** A pesquisa abaixo fica preservada para essa retomada. Não há integração nutricional ou calculadora implementada. Não confundir esta escolha A/B com a cortesia B já escolhida no Item 5.

## Diagnóstico no repositório

Antes da decisão, o README prometia calorias estimadas e o checklist condicionava isso a uma base suficiente. Essa promessa foi retirada da demo; o roadmap agora reserva a integração para a futura fase do aplicativo. O diagnóstico técnico permanece:

- Não há catálogo nutricional, correspondência de alimentos, conversão alimentar para gramas ou cálculo de energia.
- [generation.js](../src/contracts/generation.js) aceita nomes livres e unidades g, kg, ml, l, unit, teaspoon, tablespoon, cup e pinch. A saída não contém calorias, identificador TACO ou estado de preparo estruturado.
- [groq.js](../src/providers/groq.js) e [groq-vision.js](../src/providers/groq-vision.js) proíbem inventar calorias. O contrato de visão devolve nomes, não pesos; uma foto não resolve a quantidade.
- Em ready, a resposta contém título, descrição, termo de busca e porções, sem composição do prato ou massa.

Conclusão: **o app atual não informa calorias e não tem base para cumprir a promessa.** Escrever “estimativa” não torna um número sem origem aceitável. Não afrouxei os prompts, os contratos ou a rubrica do Item 1 para contornar isso.

## A — integrar uma fonte real na futura fase do aplicativo

Reservada a pedido do usuário para depois da demo PWA. Mudar de plataforma não resolve sozinho identificação, pesos, preparo ou procedência. Retomar os requisitos abaixo e verificar novamente fontes, condições de uso e custos antes de implementar; não há data ou integração garantida.

### Obtenção, versão e tamanho

A [página oficial do NEPA/UNICAMP](https://nepa.unicamp.br/publicacoes/) disponibiliza Excel e PDF. A edição consultada é a quarta, de 2011; a pasta do site com data de 2023 não significa atualização dos valores para 2023. A introdução do PDF informa 597 alimentos. Trata-se de referência por 100 g de parte comestível, não de um catálogo atual de restaurantes. [TACO oficial](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf)

Medição do conteúdo recebido por HTTPS nesta pesquisa, sem gravar os arquivos no repositório:

| Arquivo oficial | Tamanho recebido | Uso proposto, não implementado |
|---|---:|---|
| [Excel da 4ª edição](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/Taco-4a-Edicao.xlsx) | 322270 bytes | Fonte para uma importação revisada, fora do caminho de cada pedido. |
| [PDF da 4ª edição](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf) | 744346 bytes | Metodologia, autorização e conferência de descrições/valores. |

O [endereço oficial de Excel](https://nepa.unicamp.br/publicacoes/tabela-taco-excel/) redirecionou ao XLSX acima. A transferência não exigiu conta, chave ou pagamento. Não foi encontrada uma API oficial de consulta nas páginas examinadas; a opção proposta usa arquivo versionado, sem depender de uma API por receita.

Rastreabilidade da transferência (SHA-256; não são credenciais):

- XLSX: `a66b8ec528daeabc63bc2b015fc9bd8c6d76b941c2fc0ed93a4311d449302d14`.
- PDF: `2002aec5615b5b1395aaa8fa675635bbb7f712c33f278af5e332f1cac8f108c8`.

O tamanho foi medido, mas **o XLSX não foi importado nem auditado célula por célula**. Não se mediu tamanho do futuro JSON, índice ou memória em runtime. O arquivo comprimido não determina esses custos. Não copiar um JSON de terceiros e presumir que é equivalente ou tem licença própria sobre os dados originais.

### Permissão de uso

O expediente do PDF (página impressa iii, quinta página do arquivo) autoriza reprodução integral ou parcial com citação da fonte. É uma autorização expressa de reprodução com atribuição; não identifiquei ali licença MIT, CC0 ou autorização para apresentar os dados como nossos. Preservar autoria, edição, referência e aviso de origem; separar a licença do código da procedência da tabela.

Para redistribuição transformada ou uso comercial cuja extensão não esteja clara nessa redação, confirmar as condições com o NEPA antes de publicar o catálogo derivado. Não trate esta leitura como parecer jurídico ou liberação irrestrita. A pesquisa não contatou a instituição nem incluiu dados no aplicativo. [Expediente oficial](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf#page=5)

### Caminho técnico proposto

Na retomada de A para o aplicativo futuro, importar uma versão fixa para dados estruturados revisados, preservando identificador da fonte, descrição, estado de preparo, energia por 100 g e ausência de valores. Registrar fonte/versão e testar a extração antes de usar. O runtime consultaria esse conjunto, não abriria Excel/PDF nem pesquisaria na internet a cada geração. Nenhuma dependência de importação foi escolhida ou instalada.

Isso seria uma **tabela de composição**, não receitas pré-fabricadas para fingir IA. A LLM continuaria gerando sugestões; os números nutricionais teriam outra origem. Não enviar a tabela inteira ao modelo nem pedir que ele calcule calorias ou invente correspondências.

### É possível casar nomes livres com confiabilidade?

**Não de forma geral e automática com o contrato atual.** Uma associação é defensável somente quando há identificação suficiente e uma regra revisada. A TACO diferencia alimentos/estados; só encontrar uma palavra parecida não resolve a equivalência. As [diretrizes FAO/INFOODS](https://www.fao.org/infoods/infoods/standards-guidelines/en/) tratam a correspondência alimentar como etapa própria, não simples busca textual.

Proposta de comportamento, ainda sem implementação:

| Entrada ilustrativa, não resultado medido | Problema | Tratamento necessário |
|---|---|---|
| “arroz” | Tipo e estado não especificados. | Pedir identificação; não escolher cru/cozido silenciosamente. |
| “frango” | Corte, pele e preparo indefinidos. | Solicitar detalhe ou deixar calorias indisponíveis. |
| “1 xícara de arroz” | Volume não identifica massa nem estado. | Usar conversão específica e documentada, ou pedir peso. |
| “1 banana” | Unidade não informa massa comestível. | Peso ou referência revisada de tamanho/parte comestível. |
| “molho” ou “pizza do delivery” | Composição e quantidade desconhecidas. | Não atribuir número de um produto genérico como se fosse o consumido. |

Normalizar caixa, espaços e acentos pode ajudar a pesquisar. Não remover palavras de preparo, corte ou composição. Um dicionário pequeno de sinônimos revisados pode associar termos a identificadores exatos; busca aproximada pode oferecer candidatos, mas não autorizar cálculo sozinha. Se existir ambiguidade, exigir confirmação; se não existir correspondência, manter indisponível. Não criar um percentual de confiança sem avaliação.

Essa política troca cobertura por rastreabilidade. Não promete reconhecer todas as formas de escrever, marcas, receitas regionais ou pratos de entrega. Escolher A exige aceitar que **algumas sugestões não terão calorias**.

### Quantidade, preparo e cálculo

Para cada ingrediente aceito, seria preciso uma massa da parte comestível compatível com o estado do item de referência. Converter kg para g é determinístico. Converter volume, unidade, colher ou pitada exige densidade/medida específica, peso informado ou fonte adequada; não assumir genericamente ml igual a g. Valores ausentes não podem virar zero. [FAO: expressão e ausência de dados](https://www.fao.org/4/y4705e/y4705e14.htm)

Como desenho matemático, não função implementada: energia do ingrediente = massa compatível em gramas × energia da referência por 100 g ÷ 100. Código faria multiplicação, soma e arredondamento; a LLM não faria contas. Dividir o total por porções só representa uma distribuição planejada igual, não o que cada pessoa realmente comeu.

Esse cálculo simples não resolve automaticamente cozimento: massas cruas/cozidas não são intercambiáveis; descarte, absorção de óleo e rendimento precisam de tratamento sustentado por dados. A [FAO descreve cálculo de receitas e ajustes de preparo](https://www.fao.org/4/y4705e/y4705E23.htm). Não somar ingredientes crus e apresentar o resultado como energia comprovada do prato pronto sem explicitar e validar as hipóteses.

Quantidades sugeridas pela IA não são pesagens. Mesmo com cálculo correto, seriam estimativas da receita planejada, sujeitas a revisão; registrar consumo exigiria quantidades/porções efetivamente informadas. A análise de foto atual não fornece esse dado. Não afirmar precisão numérica que as entradas e a fonte não sustentam.

### Quando faltar informação

Proposta conservadora para A: sem identidade, massa/conversão ou energia utilizável de algum ingrediente, **não apresentar um total completo da receita**. Informar a razão da indisponibilidade e permitir correção futura. Não omitir o ingrediente da soma, tratar ausente como zero, usar o vizinho mais parecido ou pedir à IA que preencha a lacuna.

Uma futura saída precisaria distinguir estimativa de indisponibilidade e registrar a versão da fonte, método, referências usadas e origem das quantidades. Isso exige desenho/validação de contrato separado dos metadados de tokens do provedor. Nenhum campo foi acrescentado ao JSON atual.

Em ready, falta composição real e peso. A TACO sozinha não permite prometer calorias do delivery sugerido. Sem outra fonte específica e quantidades confiáveis, a proposta manteria calorias indisponíveis nesse modo. Não foi pesquisada ou autorizada integração de catálogo de delivery.

### Custo de A

- **Dados:** acesso aos arquivos oficiais sem cobrança; nenhuma assinatura/API paga necessária para o desenho com catálogo local.
- **Infraestrutura:** dados/índice precisam ser distribuídos ou carregados em algum lugar. Não há medição de bundle, CPU ou memória no Worker; não prometer custo total zero ou adequação ao Free. Nenhum serviço foi contratado.
- **Engenharia:** importação e conferência, associação revisada, tratamento de unidades/preparo, contrato calculado e testes. Isso é o custo principal, além de manutenção e revisão da qualidade.
- **Experiência:** confirmação de alimento/peso torna o uso mais trabalhoso. A interface necessária é etapa 4; não foi criada.

Estimativa preliminar de esforço, **não medição, orçamento contratado ou prazo garantido**: para um recorte pequeno com massas em g/kg, estados explícitos e recusa de casos não cobertos, 8–16 h de importação/conferência; 12–32 h de correspondência revisada; 8–16 h de cálculo/contrato; 8–16 h de testes/documentação. Total estimado: 36–80 h de trabalho técnico. Não inclui interface, histórico, ampliação para medidas caseiras/preparos gerais, revisão especializada, esclarecimentos de licença, publicação ou aprendizado da stack. Esses itens podem ampliar bastante o esforço; não há valor em reais sem uma taxa e escopo acordados.

## B — escolhida e aplicada à documentação da demo

Declaração adotada: a demo PWA não informa calorias ou valores nutricionais. A permanece registrada somente para a futura fase do aplicativo.

A escolha do usuário autorizou retirar especificamente essa promessa do README, do planejamento e da referência nutricional da demo. No checklist, a única mudança na seção de UI/PWA foi remover calorias da linha de tempo/custo, mantendo a tarefa desmarcada. Não é implementação dessa etapa. Diário, widgets, integrações futuras e demais tarefas foram preservados; widgets só poderão considerar calorias na fase futura com fonte verificada.

O runtime já não possui campos de calorias e já proíbe invenção. B não exigiu tabela, cálculo, migração ou liberação da IA para opinar sobre nutrientes. A revisão documental distingue referências futuras e proibições de uma promessa para a demo.

Custo: sem nova infraestrutura, catálogo ou consulta nutricional. A estimativa preliminar da pesquisa foi de 1–3 h para revisão documental e verificações, não um tempo medido desta execução; nenhuma tela existe para modificar. O custo de produto é adiar essa funcionalidade para o aplicativo futuro. Essa retomada exige o trabalho de fonte/mapeamento, não apenas voltar a escrever a promessa.

## Fronteiras e retomada futura

B escolhida para a demo e aplicada à documentação; A preservada para o aplicativo futuro. Não importei TACO nem implementei cálculos. O README e a explicação documental do contrato foram alinhados à decisão, mas o contrato executável, prompts e testes atuais permanecem intactos. Não há funcionalidade nutricional anunciada como pronta.

Um catálogo de referência e cálculo transitório não exigem histórico alimentar. Já salvar estimativas com planos, recuperar valores anteriores e fazer totais de consumo dependem da etapa 3. Confirmação visual de correspondência/peso depende da etapa 4; validação real e publicação pertencem à etapa 5. Nenhuma delas foi iniciada.

Critérios futuros para A: testar separação cru/cozido e corte, aliases ambíguos, desconhecidos, massa comestível, unidades sem conversão, valores ausentes, versão da fonte, soma/porções/arredondamento e bloqueio de total incompleto. Medir falsos acertos e taxa de indisponibilidade com casos revisados; hoje não existem essas medições. São critérios, não testes implementados.

Verificação desta entrega documental: `npm test` executado com 116 aprovados, zero falhas; são os testes existentes, não validação nutricional. Integração não executada novamente, pois nenhuma rota ou banco foi alterado. Tamanhos dos dois arquivos oficiais foram medidos em consultas públicas; nenhuma chave ou dado de visitante foi usado.

A skill de PDF e a consulta às fontes oficiais orientaram a pesquisa anterior da autorização e da base dos dados, sem instalar conversores ou importar a tabela. Após a escolha do usuário, checklist, roadmap e fluxo registram B para a demo e A para o aplicativo futuro. Próximo item: 8, após aprovação; as pendências de 4 e 5 continuam reservadas para depois dele.
