# Detalhes recuperados do preview aprovado

Fonte visual: `C:\Users\rene0\Downloads\preview_refeicao_facil.jsx`.
Esta entrega amplia a integração inicial descrita em `FRONTEND-MENU.md`:
o conteúdo principal agora também é React, mantendo o formulário existente,
o menu expansível e o seletor de tema. Não é uma cópia dos serviços simulados do preview.

## Referência e implementação

| Elemento do preview | Implementação |
| --- | --- |
| 22 ícones SVG de linha e marca com tigela | `components/ui/preview-icons.tsx`, com os paths originais e `currentColor` para ambos os temas |
| Foto / Diário / Erros | Atalhos e telas em `frontend/preview-screens.tsx` |
| Câmera que gira para check | Duas faces 3D; hover, foco por teclado e pressionamento |
| CTA verde, ícones dos estados vazios | Tela inicial restaurada, sem inventar refeições nem cota diária |
| Destaque deslizante e realce do ícone ativo | Integrados ao ExpandableTabs, sem remover a expansão dos rótulos |
| Entrada das telas | 280 ms, +14 px no início e −10 px nas telas secundárias |
| Resposta ao pressionar | Transform e opacidade, 120 ms |
| Arrastar itens para revelar ação | `components/ui/swipe-action.tsx`, com botão alternativo para teclado |
| Arrastar painel para fechar | `components/ui/drag-sheet.tsx`, dialog modal nativo, Escape e restauração de foco |
| Alça do pedido | `frontend/planner-details.ts`, arraste para expandir/recolher/fechar; clique também funciona |
| Setas, lixeira e demais controles do pedido | Ícones montados sem sobrescrever os listeners existentes |
| Carregamento | Spinner circular, mantendo o estado real de envio |

A skill Refero orientou a comparação com o arquivo enviado e os cuidados de movimento
reduzido, foco, contraste e identidade. A direção visual continua sendo o preview,
com as modificações de menu e tema solicitadas posteriormente pelo usuário.

## Limites funcionais explícitos

- Diário e compras aceitam inclusão, edição e remoção **somente na sessão atual**.
  Isso permite experimentar os gestos sem fabricar registros de conta ou chamar APIs.
- Excluir/dar baixa pede confirmação. O gesto sozinho não remove dados.
- Foto aceita JPEG/PNG/WebP até 10 MB e mostra prévia local; nenhum arquivo é enviado.
  A interface informa que reconhecimento por IA não está conectado. Ingredientes
  digitados podem ser transferidos ao formulário existente.
- Sugestões recebidas pelo cliente HTTP existente aparecem na tela de resultado.
  Salvar coloca a sugestão em Planos apenas nesta sessão. Sem respostas fictícias.
- Erros mostra mensagens de falha das solicitações da sessão; não finge consultar
  monitoramento, cotas ou estado de produção.
- Configurações preserva o seletor de tema; preferências de conta não conectadas
  ficam identificadas, sem sucesso de salvamento simulado.
- O backend, seus contratos, flags e migrações permanecem intactos.

Em `public/_headers`, somente imagens receberam `img-src 'self' blob:` para a
prévia local de fotos. Scripts e estilos continuam restritos, sem `unsafe-inline`
e sem origens externas adicionadas. O script da prévia foi reiniciado para ler a política.

## Verificação

- `npm run build:ui`: TypeScript e bundle aprovados.
- `node --test --test-reporter=dot`: 453 testes aprovados, incluindo seis novos
  testes sobre os componentes reais compilados de TSX.
- Browser: claro e escuro, 390 × 844 e 320 × 740; início sem overflow horizontal.
- Câmera: giro de 180° confirmado via foco por teclado; navegação Foto funciona.
- Diário: inclusão de um registro de teste, swipe para revelar Excluir, confirmação
  e remoção desse registro. Nenhum registro de teste ficou na sessão.
- Painel de registro: arraste para fechar; foco voltou ao botão de abertura.
- Pedido: ícones visíveis; arraste da alça confirmou `data-sheet-state="expanded"`.
- Movimento reduzido coberto por CSS e pelo hook do menu; a emulação dessa preferência
  não está disponível no controle de navegador desta sessão.

Para abrir: `npm run preview:ui`, em `http://127.0.0.1:5173`.
A prévia responde 503 em `/api/*`, sem chamadas externas a IA.
