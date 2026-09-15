# Fase 3 — medição e propostas (sem implementação)

Base: commit 0d633e6. Clone local sem arquivos ignorados em .build/phase3-clean.
Antes: Test-Path public/ui = False. npm ci e npm run build aprovados: geraram JS e CSS.
package.json: build -> build:ui -> tsc --noEmit + vite build. vite.config.ts aponta
frontend/navigation.tsx para public/ui, formato ES em modo biblioteca. CI executa build.
Logo, não falta um gerador: falta garantir que todo deploy execute o build antes de
publicar public. A configuração de build do painel Pages não foi auditada nesta fase;
sucesso no CI não prova sozinho que o painel use o mesmo comando.

## Tamanhos medidos

| Arquivo | Bytes locais | gzip local | Brotli local |
|---|---:|---:|---:|
| navigation.js | 604748 | 156569 | 131477 |
| navigation.css | 34536 | 8008 | 7140 |
| pure-web-bottom-sheet-1.0.0.js | 14376 | 4228 | 3740 |
| app.js | 8259 | 2880 | 2529 |
| generation-client.js | 3397 | 1232 | 1089 |

GET real no preview 1b7fec4a: JS HTTP 200 application/javascript, content-encoding br,
159674 bytes; CSS HTTP 200 text/css, br, 8420 bytes. Compressão local é comparação,
não previsão exata da compressão usada no edge.

## O que é carregado

navigation.js é bundle próprio, não pacote baixado chamado navigation. Entrada
frontend/navigation.tsx; versão de produto 0.1.0, Vite 8.3.0, React/React DOM 19.3.0,
Framer Motion 13.2.0 e Lucide 1.45.0 conforme dependências locais/lockfile.
Monta navegação, tema, status PWA, logotipo, ícones do formulário e PreviewScreens.
PreviewScreens inclui início, planos, compras, despensa, diário, foto, erros,
configurações, personalização, resultados e cartão semanal. Imports estáticos:
nenhum lazy/import dinâmico encontrado nessas fontes.
app.js usa o formulário e bottom-sheet e se comunica com React por eventos.
Todos esses módulos são alcançáveis; isso não significa que todas as telas executam
na abertura. Não há coverage/trace de navegador nesta medição: percentual de código
executado e tempo de CPU em celular permanecem não medidos.

Contabilidade do bundler: 2284 módulos transformados, 323 módulos no chunk.
renderedLength antes da minificação final: react-dom 536767, conjunto motion 272567,
aplicação 100674, tailwind-merge 56672, React 17246, Lucide 14240 bytes.
Esses valores NÃO somam o arquivo final nem representam savings diretamente removíveis.
O modo biblioteca ES preserva whitespace para tree shaking conforme documentação Vite.
O bottom-sheet é um custom element vendorizado com versão 1.0.0 no nome; origem
upstream/licença não estão demonstradas por esse arquivo minificado nem pelo lockfile.

## Custo estimado, com hipóteses explícitas

JS+CSS realmente transferidos: 168094 bytes. Só transmissão, sem RTT/TLS/servidor/CPU:
1 Mbps = 1,34 s; 5 Mbps = 0,27 s; 10 Mbps = 0,13 s. São cenários de banda efetiva,
não uma medição de rede móvel típica. Sem compressão: 639284 bytes, 5,11/1,02/0,51 s.
Execução móvel: não medida. Não converter KB em milissegundos de CPU com falsa precisão.
Imports module são adiados em relação ao parser, mas as telas principais dependem
do React. Adiar o bundle inteiro pode adiar o conteúdo visível; não há shell funcional
completo no HTML inicial. Separar telas secundárias é diferente de adiar toda a UI.

## Três alternativas para decisão

| Opção | Custo e consequência | Estimativa de esforço, não medição |
|---|---|---|
| i. Versionar public/ui | +639284 bytes lógicos por snapshot inicial (Git comprime); exige regeneração e controle de drift; não reduz download/CPU | 1–2 h com verificações |
| ii. Dependências + build | Já implementada: npm ci + build:ui. Não há pacote navigation para instalar/copiar. Formalizar build Pages e validar assets/MIME/SHELL em CI mantém fonte reproduzível | 2–4 h para reforço e validação |
| iii. Substituir/reorganizar por algo menor | Primeiro separar rotas secundárias, revisar modo biblioteca e dependências de motion/utilitários; reescrever React seria decisão maior e arriscaria interações aprovadas. Economia exata depende de protótipo | 1–3 dias para splitting/QA; reescrita fora desta estimativa |

Recomendação para aprovação: ii, preservando geração de assets; depois proposta
delimitada de iii com medição antes/depois. Nenhuma alteração aplicada.

## Service worker

addAll rejeita se qualquer resposta não for 2xx; waitUntil rejeitado impede completar
a instalação dessa versão do worker. Isso não prova sozinho indisponibilidade da
instalação PWA em todo navegador. navigation.js é essencial hoje: ignorar sua falta
instalaria um shell sem as telas. Proposta: manter essenciais atômicos e tratar só
recursos genuinamente opcionais separadamente. Verificar também MIME/conteúdo: fallback
HTML com 200 para JS ausente pode ser cacheado sem erro por addAll.
Cache tem nome fixo v2 e assets sem hash, com query manual: atualizações precisam de
versionamento coerente; caso contrário um SW inalterado pode continuar servindo JS velho.

Fontes: https://developer.mozilla.org/en-US/docs/Web/API/Cache/addAll e
https://vite.dev/config/build-options (build.minify, Library Mode).

Validação em clone limpo: 481 testes aprovados; integração e build registrados em
.build/phase3-tests.txt e .build/phase3-integration.txt. Nenhum código do produto,
flag, cota, dependência declarada ou deploy alterado. Documentação local apenas.
Observação do npm ci: informou 3 vulnerabilidades altas no lockfile; não foi executado
audit fix. Triagem detalhada permanece pendente, sem atribuir exposição ao app nesta fase.
