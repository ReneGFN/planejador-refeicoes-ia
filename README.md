<p align="center">
  <img src="docs/brand/refeicao-facil-logo.png" alt="Refeição Fácil: prato e garfo em branco sobre fundo verde profundo" width="800">
</p>

# Refeição Fácil

**Sua próxima refeição, resolvida.**

Projeto de portfólio para facilitar a escolha entre cozinhar e pedir comida pronta, com histórico e resumos compartilháveis.

**Estado: fundação técnica. Ainda não há demo funcional de IA nem PWA instalável.**

Acompanhe o [checklist de implementação](docs/CHECKLIST.md), com o que já foi verificado e as etapas pendentes.

## Arquitetura escolhida

- GitHub: código público e verificações automáticas.
- Cloudflare Pages: interface web, futuramente instalável no celular.
- Pages Functions: backend executado na infraestrutura Workers, no mesmo endereço da interface.
- Cloudflare D1: histórico e preferências em SQL.
- Groq, modelo `openai/gpt-oss-20b`: geração de refeições, a integrar.

Usamos Pages Functions para evitar um Worker separado e comunicação entre domínios nesta etapa. D1 possui integração direta com esse backend. Nenhuma assinatura paga é necessária para esta fundação.

## Executar localmente

Requer Node.js 22 e npm.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Abra o endereço exibido no terminal. `/api/health` retorna o estado do serviço; `POST /api/generate` retorna 503 intencionalmente. Não há chamadas à Groq nesta fase.

```sh
npm test
npm run build
```

O banco local é simulado pelo Wrangler em `.wrangler/`, fora do Git. O ID zerado em `wrangler.jsonc` é apenas um marcador local, não uma credencial nem banco remoto.

## Configuração da nuvem

Consulte [configuração e decisões](docs/SETUP.md). Não envie chaves pelo README, código, issues ou commits. `.dev.vars.example` contém apenas nomes das variáveis esperadas.

## Escopo planejado

- Plano compacto com receitas e alternativas de pedir pronto, sem integração de delivery.
- Preferências guiadas e até 400 caracteres opcionais.
- Três gerações por visitante/dia; teto global inicial de 80, sujeito a medição real de tokens.
- Histórico no mesmo navegador e opção de apagar dados.
- Registro separado do que foi planejado e do que foi consumido.
- Tempo de preparo, custo e calorias identificados como estimativas. Totais apenas das refeições registradas, sem alegar representar todo o dia.
- Cartão de compartilhamento semanal com prévia e escolha dos campos.
- Etapa posterior: reconhecimento de ingredientes por foto, com outro modelo e confirmação humana.

Nenhuma dessas funções de produto é anunciada como implementada nesta primeira etapa. Ver [plano de implementação](docs/ROADMAP.md).

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
