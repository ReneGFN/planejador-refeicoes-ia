# Aviso antes de enviar uma foto

Conteúdo em pt-BR para a futura interface, ainda não exibido no aplicativo. Mostrar antes do envio, junto de uma ação explícita; abrir câmera/galeria ou selecionar arquivo não deve, por si só, autorizar o envio.

## Texto principal

**Antes de enviar sua foto**

Sua foto original será enviada à Groq, o serviço de IA usado para identificar ingredientes. Nesta demo, não removemos metadados do arquivo. Se houver dados como localização GPS, data da captura ou informações do aparelho, eles também poderão ser enviados.

Confira o que aparece na imagem. Evite rostos, documentos, endereços e outras informações pessoais. Se preferir, não envie a foto e digite os ingredientes.

A IA pode errar na identificação. Revise a lista de ingredientes antes de usá-la.

## Rótulos sugeridos

- Ação de envio: “Enviar foto à Groq”.
- Alternativa sem envio: “Digitar ingredientes”.
- Cancelamento: “Voltar sem enviar”.

## Notas para a implementação futura

Nenhuma tela, botão ou captura de aceite foi implementada neste item. Não esconder este aviso depois do envio. A escolha de digitar deve continuar disponível e não chamar a IA de visão.

O texto não afirma que a foto sempre contém GPS, que foi anonimizada, que o provedor apaga imediatamente o arquivo ou que este aviso, sozinho, resolve obrigações de privacidade. Retenção e tratamento pela Groq precisam ser verificados antes da publicação; não foram pesquisados ou certificados neste item.

Filtrar o resultado JSON não remove dados que já foram enviados. O aviso não implementa remoção de EXIF/GPS, redimensionamento, compactação ou mudanças de segurança.
