<p align="center">
  <img src="docs/brand/refeicao-facil-logo.png" alt="Refeição Fácil: prato e garfo em branco sobre fundo verde profundo" width="800">
</p>

# Refeição Fácil

**Sua próxima refeição, resolvida.**

Projeto de portfólio para facilitar a escolha entre cozinhar e pedir comida pronta, com histórico e resumos compartilháveis.

**Estado: PWA e backend integrados. O ambiente de preview possui sessão, D1, cotas e recursos de produto; produção continua deliberadamente desativada.**

## Arquitetura escolhida

- GitHub: código público e verificações automáticas.
- Cloudflare Pages: interface web instalável no celular.
- Pages Functions: backend executado na infraestrutura Workers, no mesmo endereço da interface.
- Cloudflare D1: histórico e preferências em SQL.
- Groq, modelo `openai/gpt-oss-20b`: geração estruturada de refeições.
- Groq, modelo candidato `qwen/qwen3.6-27b`: identificação de ingredientes por foto no primeiro PWA; primeira chamada real relatada pelo usuário, com erros de reconhecimento. Prompt revisado para pt-BR/evidência visual; qualidade e cotas ainda em avaliação.

Usamos Pages Functions para evitar um Worker separado e comunicação entre domínios nesta etapa. D1 possui integração direta com esse backend.

## Executar localmente

Requer Node.js 22 e npm.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Abra o endereço exibido no terminal. `/api/health` informa flags/configuração; as rotas de sessão, geração e análise de ingredientes retornam 503 com a configuração padrão desativada. Os testes de integração não chamam Groq; os scripts de teste real exigem ação explícita e chave privada.

```sh
npm test
npm run test:integration
npm run build
```

O banco local é simulado pelo Wrangler em `.wrangler/`, fora do Git. O ID zerado em `wrangler.jsonc` é apenas um marcador local, não uma credencial nem banco remoto.

## Configuração da nuvem

Consulte [configuração e decisões](docs/SETUP.md). Não envie chaves pelo README, código, issues ou commits. `.dev.vars.example` contém apenas nomes das variáveis esperadas.

## Escopo implementado

- Plano compacto com receitas e alternativas de pedir pronto, sem integração de delivery.
- Preferências guiadas e até 400 caracteres opcionais.
- Cotas separadas por visitante, rede e projeto, com orçamento de tokens e idempotência.
- Histórico por sessão e opção de apagar os dados do produto.
- Diário alimentar opcional: “Comi isso” ou registro manual, incluindo delivery, com data, edição e exclusão. Planejar não significa consumir.
- Personalização opcional por histórico recente para sugerir receitas e pratos de delivery, desligada por padrão e alterável nas configurações a qualquer momento. Desativar não apaga o diário. Uso desse contexto na IA somente com autorização; sem diagnóstico nutricional ou integração com catálogos de entrega.
- Tempo de preparo e custo identificados como estimativas. Totais apenas das refeições registradas, sem alegar representar todo o dia.
- Cartão de compartilhamento semanal com prévia e escolha dos campos.
- Já no primeiro PWA, no modo Cozinhar: digitar ingredientes, tirar/enviar foto ou combinar os dois. A lista reconhecida é editável e deve ser confirmada antes de gerar refeições; trocar de opção não apaga a lista.

A demo PWA não informa calorias ou valores nutricionais. Uma integração futura deverá usar uma fonte alimentar real e identificada.

As fotos são processadas sem persistência no D1 e precisam de revisão humana antes de alimentar uma geração. Segredos ficam apenas na Cloudflare; o repositório contém somente nomes de variáveis e configuração não sensível.

## Gratuidade e transparência

O objetivo é operar dentro das camadas gratuitas. Cotas e disponibilidade podem mudar. Não haverá migração automática para serviço pago. Atingir a cota deve bloquear novas gerações e manter o histórico acessível quando o banco estiver disponível.

O repositório não contém receitas pré-fabricadas para fingir respostas de IA. A demo não será orientação nutricional e não solicitará condições médicas ou alergias.

## Fontes técnicas

- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Preços do Workers](https://developers.cloudflare.com/workers/platform/pricing/)
- [Preços do D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Limites da Groq](https://console.groq.com/docs/rate-limits)

Autor: Renê Guimarães. Licença de distribuição a definir.

Identidade visual inicial: [conceito e origem da logo](docs/brand/README.md).
