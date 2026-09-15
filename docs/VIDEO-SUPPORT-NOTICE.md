# Aviso do vídeo de apoio

Conteúdo em pt-BR para a futura interface, ainda não exibido no aplicativo. Mostrar junto ao vídeo, antes de qualquer reprodução, sem esconder em tooltip, rodapé distante ou área recolhida por padrão. Encontrar o mesmo nome de prato não comprova equivalência com a receita gerada.

## Texto principal

**Vídeo de apoio**

Este tutorial pode usar ingredientes, quantidades, equipamentos e tempos
diferentes. Use-o para entender as técnicas; para manter as escolhas feitas no
aplicativo, siga a receita escrita.

## Rótulos e alternativa

- Alternativa, inclusive quando há vídeo: “Buscar no YouTube”.
- Mensagem quando o apoio não está disponível: “Você pode buscar um tutorial no YouTube. Sua receita continua disponível.”
- Origem do conteúdo claramente identificada como YouTube, separada do aviso do aplicativo.

A consulta e o endereço vêm de data.search na resposta autorizada da rota; não pedir à LLM para montar links. Abrir o endereço por ação da pessoa. A receita escrita deve continuar disponível independentemente do vídeo.

## Notas para a implementação futura

Nenhuma tela, botão visual, iframe, player, CSS ou captura de aceite foi implementada. O backend já fornece notice e search; isso não significa que o aviso esteja visível no app. As quebras de linha acima podem acompanhar a largura da tela, mas as palavras e a pontuação não devem mudar.

Nunca apresentar como “verificado pela IA”, “aprovado pela IA”, “vídeo desta receita” ou garantia de adequação nutricional. A LLM não participa da escolha do vídeo. Não afirmar correspondência entre ingredientes, quantidades, equipamentos ou tempos: é justamente a diferença que este aviso explica.

Em data.status=found, mostrar o apoio com aviso e busca. Em not_found, unavailable ou disabled, mostrar a alternativa sem player vazio, erro alarmante ou repetição automática. Falha posterior de reprodução também deve preservar aviso, receita e busca. Enquanto carrega, não bloquear a leitura da receita ou disparar outra geração.

Erros de sessão, seleção, origem e ingress não viram autorização. Nesses casos, a interface deve manter a receita e a alternativa já disponíveis localmente, sem revelar outro plano nem repetir a chamada automaticamente. O backend não inventa consulta se não consegue identificar uma seleção autorizada. [Contrato da rota](VIDEO-ROUTE.md).

O aviso não substitui termos, privacidade, atribuição ou requisitos de incorporação. Antes de criar player, cumprir os critérios em [VIDEO-SETUP.md](VIDEO-SETUP.md#requisitos-da-etapa-4-do-produto). Não chamar a implementação da interface ou a publicação de concluídas com base neste documento.
