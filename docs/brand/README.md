# Refeição Fácil

## Atualização de interface — 2026-09-12

- A paleta de 2026-09-08 foi substituída: saem verde-musgo `#46583D` e off-white quente `#F4F3ED`; entram Emerald Ink `#064E3B` e Champagne `#F8E7C9`.
- O módulo ES compilado de `pure-web-bottom-sheet` foi vendorizado como `public/pure-web-bottom-sheet-1.0.0.js`, na versão fixa `1.0.0`, a partir do `dist/web.client.js` publicado no npm. Não há CDN em runtime.
- A harmonização da logo deixou de ser uma prévia futura e é uma pendência aberta: a imagem PNG opaca usa `#123D32`, portanto há agora dois verdes escuros na identidade até uma revisão específica.
- Os acervos de referência de design, Uiverse e bottom sheet vivem fora do repositório e não são versionados.

### Paleta completada em 2026-09-12 (revisão de contraste)

A primeira aplicação usou `--color-accent:#166534`, que está a apenas 1,36:1 do Emerald Ink: era o mesmo verde, e nenhuma ação primária se destacava. Também usava três tons quentes vizinhos para foco, aviso e erro, e um cinza azulado numa paleta quente. Papéis revisados, com contraste calculado:

- Ação primária deixou de ter cor própria e passou a ser o próprio ink com rótulo em Champagne — 7,99:1 — o que também cumpre "ação principal em verde sólido" do registro de 2026-09-08.
- `--color-accent:#9A3412` (terracota) ficou restrito a chrome interativo: aba ativa, switch ligado, ponto de progresso, rótulo em foco. 6,01:1 sobre o creme, 7,31:1 sobre a superfície.
- `--color-danger:#7F1D1D` — 8,24:1 sobre o creme, 10,02:1 sobre a superfície.
- `--color-warn:#7C5E10` — 4,98:1 sobre o creme, 5,96:1 sobre a superfície.
- `--color-muted:#4F5F55`, neutro morno da mesma família do verde, substitui `#4B5563`. 5,57:1 sobre o creme. A troca é de temperatura, não de acessibilidade: o valor anterior também passava.
- `--color-focus:#1D4ED8`. Azul é o único tom ausente do resto da paleta, então o anel de foco não é confundido com erro nem com sucesso. 5,51:1 sobre o creme; sobre superfícies escuras a separação vem do anel interno em creme que já existia.
- Bordas separadas em duas: `--color-border:#8C7B61` para limite de controle (3,37:1 sobre o creme, acima do mínimo de 3:1) e `--color-divider:#E0D0B0` para divisória decorativa dentro do cartão.
- `--color-surface` passou de `#FFFFFF` para `#FFFDF7` e o vidro passou a ser tingido de creme em vez de branco: com os dois brancos anteriores a camada translúcida ficava indistinguível do cartão opaco.

Limitação conhecida: terracota e vermelho profundo ficam a 1,85:1 de luminância e podem se aproximar para daltonismo protan/deutan. Erro não deve depender só de cor — precisa de ícone e régua, além do vermelho. Ainda não implementado.

Procedência: os contrastes foram calculados sobre os pares reais. Os arquivos `DESIGN.md` do acervo de referência não foram lidos nesta revisão; escala tipográfica e de espaçamento seguem como a primeira aplicação as definiu, sem procedência documentada.

### Ajustes pedidos por Renê após ver a tela — 2026-09-12

- Champagne `#F8E7C9` deixou de ser o fundo da página. Renê viu a tela e recusou o creme em área cheia: funciona num cartão de paleta e pesa numa tela de celular. Entrou `--color-page:#FBF1E0`, um creme bem mais claro, com o ink a 8,68:1 sobre ele. Champagne segue no sistema, em área pequena: o painel de modo dentro do pedido, o tingimento do vidro e o rótulo do botão primário sobre o ink.
- Os cartões passaram a `#FFFFFF`. Contra a página nova a diferença é de apenas 1,12:1, então a separação vem do hairline `--color-divider`, não do preenchimento. É o mesmo arranjo do registro de 2026-09-08, que já previa off-white de fundo com branco nas superfícies.
- O painel de montar pedido passa a começar FECHADO e só aparece ao acionar "Planejar" ou "Começar um pedido". A decisão de 2026-09-09 descreveu o painel arrastável e a altura inicial de um terço, mas não dizia se ele nasce visível; a primeira implementação o deixou permanentemente ancorado na tela, o que Renê recusou. Fechar volta a esconder. Arrastar para baixo ainda NÃO fecha: `swipe-to-dismiss` exige envolver o componente em `<dialog>` com `bottom-sheet-dialog-manager`, o que não foi feito — hoje o fechamento é pelo botão.
- O texto de abertura foi corrigido: mandava "monte o pedido no painel abaixo", referência a um painel que agora começa fechado.

### Correções de comportamento em 2026-09-12- `public/app.js` chamava `setToast`, função inexistente: o botão "Limpar pedido" limpava o rascunho e em seguida lançava erro. Trocado por `toast`.
- O botão "Expandir" chamava `snapToPoint(3)`, índice fora da faixa dos três pontos declarados (0, 1, 2), e por isso não fazia nada. Corrigido para `2`.
- Fechar o painel enquanto expandido deixava `state.expanded` verdadeiro e o rótulo do botão desatualizado. Fechar agora passa por `expanded(false)`, que também remove o `inert` do conteúdo de fundo e devolve o foco.

Nome aprovado por Renê em 2026-09-06 para o projeto de portfólio.

“Refeição Fácil” comunica a finalidade do app em português e abrange cozinhar, pedir pronto e planejar diferentes refeições do dia. A assinatura é “Sua próxima refeição, resolvida.”

O símbolo reúne prato circular, garfo e traços de movimento. Verde profundo e branco suave mantêm a leitura simples e acompanham a direção visual discutida para o aplicativo.

## Direção de interface registrada em 2026-09-08

Preferência do usuário: verde-musgo com branco ou branco mais escuro (interpretado inicialmente como off-white), com inspiração Liquid Glass da Apple no header, footer e ícones internos. Apenas direção registrada; interface ainda não implementada e tons exatos sujeitos a prévia e aprovação.

- Paleta inicial proposta: verde-musgo #46583D para ações e seleção; off-white quente #F4F3ED para fundo; branco #FFFFFF para superfícies; texto escuro #20271E. Validar contraste na implementação, inclusive sobre conteúdo atrás do vidro.
- Header e barra de navegação inferior: transparência moderada, desfoque do fundo, borda luminosa sutil e cantos arredondados. Interpretar footer como navegação inferior no mobile, sujeito a validação do layout.
- Ícones: símbolos nítidos e consistentes sobre pequenas superfícies de vidro, sem tornar o próprio desenho transparente a ponto de prejudicar reconhecimento. Rótulos nas principais ações.
- Conteúdo: receitas, ingredientes e instruções em superfícies predominantemente opacas para preservar leitura; ação principal em verde sólido para facilitar identificação.
- Aproximação visual web, não reprodução garantida do material nativo Apple. Preparar alternativa opaca, redução de efeitos e testes de fluidez em celulares; navegação fixa não deve cobrir conteúdo ou teclado.
- A referência de design consultada é uma análise do site Apple, útil para hierarquia, respiro e navegação translúcida; não é especificação oficial do Liquid Glass. Manter identidade própria, sem copiar ativos Apple.
- A logo existente permanece inalterada. Harmonização com os novos tons será avaliada em prévia futura.

## UX/UI aprovada em 2026-09-09

Referências principais aprovadas: [Shop iOS](https://mobbin.com/apps/shop-ios-1f1a3d5b-cb65-4c7e-af4b-e4cdf1c03e4d/7b6adbde-de48-47c5-979b-f629f1eb87a9/screens) e [Klarna iOS](https://mobbin.com/apps/klarna-ios-4b439dad-1b14-41ba-9aff-888decc7020c/4272c5f7-b724-43c7-a760-2956bb417fdb/screens). Apple permanece referência de acabamento translúcido; verde-musgo e off-white são a identidade própria. Apenas prévias de destaque do Mobbin foram inspecionadas; não inferir comportamento de gestos a partir de imagens estáticas ou copiar ativos das marcas.

- Conteúdo de fundo explorável: refeições salvas, planos anteriores e compras; primeiro acesso honesto, sem simular receitas já geradas.
- Pedido em painel inferior arrastável, não em páginas sucessivas. Altura inicial aproximada de um terço da tela, ajustável ao conteúdo e teclado.
- Compacto: uma pergunta por vez, com avançar/voltar, mantendo interação com o fundo. Expandido: todos os campos editáveis e fundo temporariamente bloqueado.
- Um único rascunho independente da apresentação, preservado ao expandir, recolher, fechar e navegar. Persistência no navegador para retomada no mesmo dispositivo; limpeza do armazenamento pode apagar o rascunho. Limpar pedido é ação explícita, separada de fechar.
- A IA só é chamada ao acionar “Sugerir refeições”; preenchimento e navegação não consomem gerações.
- Alça e botão acessível para expandir/recolher, gestão de foco no modo expandido e cuidado para não confundir rolagem dos campos com arraste do painel. Evitar sobreposição com navegação inferior e teclado.
- Validar os dois modos em protótipo interativo móvel antes de concluir a interface. Esta seção registra decisões, não funcionalidades implementadas.

## Arquivo

`refeicao-facil-logo.png`: composição horizontal raster para o README, adaptada com a ferramenta integrada de geração de imagens e revisada visualmente quanto à legibilidade e acentuação. Não é um arquivo vetorial nem o ícone instalável final da PWA. A versão anterior `bora-de-prato-logo.png` permanece como histórico de exploração.

Disponibilidade de marca e domínio não foi verificada. O endereço técnico do repositório permanece `planejador-refeicoes-ia`.

## Prompt de adaptação para o nome aprovado

Edit this logo header. Replace only the brand lettering "Bora de Prato" with the exact Brazilian Portuguese name "Refeição Fácil", on two lines "Refeição" then "Fácil". Spell accents correctly: ç and ã in Refeição; á in Fácil. Preserve the original plate and fork symbol on the left, the deep forest green opaque background, off-white solid lettering, rounded bold sans-serif style and generous horizontal margins. Adjust wordmark size to fit cleanly without crowding the symbol. Professional crisp smooth flat edges. No extra text, no tagline, no watermark, no transparency. Landscape logo header for GitHub README.

Os prompts abaixo documentam a exploração anterior.

## Prompt inicial

Use case: logo-brand. Create one polished original horizontal logo lockup for Brazilian meal planning app named exactly "Bora de Prato". Deep forest green background #123D32, off-white logo and lettering. Symbol on left: bold memorable minimal circular plate whose rim has a subtle forward motion opening, a simple fork integrated into the left rim. Flat vector-like clean geometry, no shadows no gradients no photos no 3D. On right exact wordmark "Bora de Prato" in friendly confident rounded contemporary sans-serif, excellent readable typography, two lines allowed "Bora de" and "Prato". Wide landscape 3:1 composition for GitHub README header, generous margins, professional brand identity, one logo only, no mockup sheet, no other text. Food and everyday ease, not medical or fitness branding.

## Prompt de refinamento aplicado à imagem inicial

Clean up this logo into a finished flat opaque brand header. Preserve the exact words Bora de Prato and plate fork symbol. CRITICAL fill the entire background with solid opaque forest green #123D32, NO TRANSPARENCY. The lettering and symbol must be solid off-white with pristine smooth edges and completely solid interiors, remove all grunge, holes, noise and texture. One simple crisp logo lockup centered with generous margins. Flat solid colors only, no gradients, no shadows.
