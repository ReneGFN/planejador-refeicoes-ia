# Menu React — Refeição Fácil

Atualização: os detalhes e telas do preview foram recuperados posteriormente;
consulte `FRONTEND-PREVIEW-DETAILS.md`. O texto abaixo registra a integração inicial do menu.

O menu foi integrado como uma ilha React na página existente. Isto não migra todas
as telas do ZIP: preserva o formulário e o cliente HTTP atuais e substitui apenas
a navegação. Nenhuma rota, contrato, migração, flag ou configuração do backend foi alterada.

## Estrutura e comandos

- `components/ui/expandable-tabs.tsx`: componente reutilizável solicitado.
- `components/ui/demo.tsx`: os dois exemplos do prompt, tipados e fora do bundle do app.
- `lib/utils.ts`: `cn` com clsx e tailwind-merge.
- `frontend/navigation.tsx`: integração com Início, Planejar, Planos e Compras.
- `frontend/styles.css`: Tailwind 4 e estilos da integração, sem reset global.
- `public/styles.css`: CSS existente, extraído do HTML para manter CSP sem liberar inline.
- `components.json`, `tsconfig.json`, `vite.config.ts`: convenções shadcn, alias `@/`
  apontando à raiz e compilação somente do frontend. `src/` continua sendo backend.

`components/ui` foi criado na raiz: é o caminho compartilhado pelos imports do prompt
e pelo alias `ui` do shadcn. Mantém componentes reutilizáveis separados do adaptador
específico do aplicativo. Não é necessário executar `shadcn init` para este menu:
a configuração e as dependências necessárias já estão instaladas.

```bash
npm ci
npm run build:ui
npm run preview:ui
```

A prévia em `http://127.0.0.1:5173` é local e apenas visual: `/api/*` retorna 503,
sem acionar provedores. Para o aplicativo com API local, usar `npm run dev`.
Durante edição, executar `npm run dev:ui` em outro terminal para recompilar e
recarregar o navegador. `npm run build` também compila o menu antes do build existente.
O bundle é gerado em `public/ui`, ignorado pelo Git; o build não apaga `public`.

React 19, TypeScript 5, Tailwind 4 e Vite 8 seguem as tecnologias do ZIP. O menu
usa Framer Motion, usehooks-ts e Lucide. Nenhum provider, imagem ou serviço externo
é necessário. Não foram adicionadas fotos Unsplash porque este componente só usa ícones.

Configuração baseada na [instalação manual do shadcn](https://ui.shadcn.com/docs/installation/manual)
e no [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite).

## Referências e decisões

| Decisão | Referência | Aplicação |
| --- | --- | --- |
| Paleta e vidro | `TelasRefeicaoAI-atualizado.zip`, `BottomNav` | Verde #064E3B, champagne #FBF1E0, destaque terracota #9A3412, barra arredondada |
| Rótulo expansível | ExpandableTabs fornecido no prompt | Ícones persistentes e expansão do nome selecionado |
| Navegação | Destinos já existentes | Links de fragmento para seções; Planejar abre o painel, não uma nova página |
| Movimento e acesso | Refero, referências motion/craft-details | Transição de 320 ms sem atraso, reduced-motion, nomes acessíveis, alvos de pelo menos 44 × 48 px |

O componente mantém a assinatura original e acrescenta `activeIndex` controlado,
links opcionais e atributos para controlar o painel. `onChange(null)` recolhe o
rótulo, mas o adaptador não troca o destino. Fechar Planejar recupera a seção anterior.
As teclas direcionais, Home e End movem o foco; Enter ativa; Escape recolhe o texto.
O histórico de fragmentos mantém os links e o botão Voltar do navegador úteis.

O painel existente recebe um evento local `refeicao:open-planner`; isso não faz
requisições HTTP. O adaptador observa sua visibilidade para sincronizar o menu.
As posições de snap foram corrigidas para 1 (compacto) e 3 (expandido), conforme
a API do componente vendorizado. O painel fica acima do menu; o compacto ganha
altura mínima adaptativa em celulares curtos para manter pergunta e controles visíveis.

## Verificação

- `npm run build:ui`: TypeScript e bundle aprovados.
- `npm run check`: verificação existente aprovada.
- `npm test`: 442 testes aprovados.
- Navegador local com a CSP de `public/_headers`: sem erros de console observados.
- Inspeção visual desktop, 390 × 844 e 320 × 740; sem overflow horizontal em 320 px.
- Navegação por teclado até Compras; abertura de Planejar e retorno a Planos ao fechar.
- Movimento reduzido implementado no componente; emulação dessa preferência não
  estava disponível no controle de navegador usado nesta verificação.

A auditoria npm encontrou três alertas altos na cadeia existente
`wrangler → miniflare → sharp`. Não houve atualização dessa cadeia nesta tarefa.
As novas dependências do menu não foram apontadas nessa auditoria.
