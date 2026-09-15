# Operação controlada do ambiente de preview

O preview é o único ambiente habilitado nesta fase. Produção e desenvolvimento permanecem com as flags de IA desligadas. A política abaixo é um limite operacional inicial, não uma promessa de capacidade.

## Limites ativos

- Entrada JSON de geração: até 16 KiB, com limites adicionais por campo no contrato.
- Contexto de histórico: até 1.200 caracteres, selecionado somente mediante consentimento.
- Foto: JPEG, PNG ou WebP de até 5 MiB; corpo total de até 6 MiB; a foto não é persistida.
- Geração: 3 por visitante/dia, 1 por visitante/minuto, 20 no projeto/dia e 1 no projeto/minuto.
- Foto: 2 por visitante/dia, 5 no projeto/dia e 1 no projeto/minuto.
- Reserva: 6.144 tokens por geração e 4.096 por foto; tetos globais de 120.000 e 30.000 tokens/dia, respectivamente.

As reservas são conservadoras e não equivalem ao uso cobrado. O uso real retornado pela Groq é gravado apenas como contagens numéricas nos metadados do plano; nunca se registra chave, cookie, IP, foto ou texto do pedido em logs.

## Observabilidade e privacidade

Pages Functions não aceita o bloco `observability` no `wrangler.jsonc`. O código não emite corpos, cabeçalhos, cookies, IPs ou respostas da IA em `console`. O `wrangler pages deployment tail` inclui metadados da requisição e não deve ser usado como coletor persistente, mesmo com filtro de mensagem. Use as métricas agregadas do painel da Cloudflare; tokens e latência vêm dos metadados validados do provedor e das tabelas técnicas do D1.

## Critérios antes de produção

1. Executar somente casos canônicos sem dados pessoais.
2. Confirmar sucesso, replay idempotente e nenhum segundo consumo.
3. Criar duas sessões e comprovar que plano, diário, despensa e exclusão não atravessam usuários.
4. Confirmar exclusão do histórico e ausência da foto no D1.
5. Registrar apenas totais: status, duração, CPU, tokens de entrada/saída/raciocínio e custo calculado.
6. Recalibrar reservas e limites com p95 observado antes de habilitar produção.

Preços usados para estimativa em 14/09/2026 para `openai/gpt-oss-20b`: US$ 0,075 por milhão de tokens de entrada e US$ 0,30 por milhão de tokens de saída. Conferir novamente a página oficial da Groq antes de qualquer orçamento ou lançamento.
