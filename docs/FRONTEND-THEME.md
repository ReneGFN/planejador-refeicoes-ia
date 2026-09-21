# Escolha de tema

O seletor do prompt foi adaptado em `components/ui/theme-toggle.tsx` e montado
no cabeçalho. `className` continua opcional. `DefaultToggle` foi acrescentado
ao `components/ui/demo.tsx`, preservando os exemplos do menu.

O projeto já possui React, TypeScript, Tailwind 4, Lucide e estrutura shadcn
(`components.json`). Não há dependências novas nem necessidade de executar
`shadcn init`. Componentes ficam em `components/ui`; estilos React em
`frontend/styles.css`; os estilos existentes permanecem em `public/styles.css`.

## Referências e cores

| Decisão | Fonte | Aplicação |
| --- | --- | --- |
| Claro intacto | App e ZIP aprovados | Champagne #FBF1E0, verde #064E3B, terracota #9A3412 |
| Escuro verde e preto | Pedido do usuário | Fundo #080D0B, superfícies #111C17, ação #65D69A |
| Hierarquia legível | Refero / color.md | Texto #E4F3EA, secundário #A7BDB0, alertas âmbar e erros coral |
| Controle compacto com dois ícones | ThemeToggle do prompt | Lua e sol Lucide; indicador deslizante de 200 ms |

A referência de cores da skill Refero orientou a separação entre superfícies,
textos, ações e estados de erro. Não se inverteu mecanicamente a paleta clara.
O escuro cobre menu, cabeçalho, cartões, formulário, painel, mensagens e controles nativos.
O layout claro se mantém; o cabeçalho adapta o espaçamento para acomodar o seletor.
Nenhuma fotografia é necessária para este componente.

## Estado e acessibilidade

- Padrão inicial: claro, independentemente do sistema, preservando o app original.
- Escolha salva em `localStorage`, chave `refeicao-facil:theme`.
- `public/theme-init.js`, externo e executado antes do CSS, restaura a escolha
  antes da primeira pintura. A CSP não foi relaxada.
- `lib/theme.ts` e `useSyncExternalStore` sincronizam a interface, inclusive
  outras abas; armazenamento bloqueado não impede a alternância durante a sessão.
- `.dark`, `data-theme`, `color-scheme` e a meta `theme-color` acompanham a escolha.
- Botão nativo com `role="switch"`, `aria-checked`, nome acessível, foco visível,
  ativação por Enter/Espaço e alvo de 64 × 44 px. Movimento reduzido respeitado.
- Não usa next-themes, provider, cookie, endpoint ou chamada a IA.

## Validação

`npm run build:ui` compila o componente e verifica TypeScript.
`node --test tests/theme.test.js` verifica preferência inicial, restauração,
persistência, falha de armazenamento, sincronização e contraste dos principais
pares de texto no escuro (mínimo 4,5:1). Esses testes integram `npm test`.

Prévia: `npm run preview:ui` e `http://127.0.0.1:5173`.
Nenhum arquivo de backend, rota, migração ou configuração foi alterado nesta tarefa.
