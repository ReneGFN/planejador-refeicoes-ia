# Configuração e decisões

## Estado atual do backend — 2026-09-11

Sessão, cotas atômicas e rotas de geração/análise foram integradas e testadas localmente com Groq simulado. Migração 0002 acrescenta uma sexta tabela técnica de reservas, ainda não aplicada remotamente. Flags `AI_ENABLED`, `SESSIONS_ENABLED` e `VISION_ENABLED` continuam `false` e `QUOTA_POLICY_JSON` vazio; a política definitiva exige calibração. Ver [configuração e fluxo atuais](USAGE-FLOW.md), que substituem as descrições de trabalho pendente nos registros históricos abaixo. Não houve publicação nesta etapa.

## Nesta etapa

Wrangler é a ferramenta oficial para executar Pages Functions e D1 localmente. A versão instalada fica fixada em package.json e package-lock.json. GitHub Actions verifica o código, compila as funções e aplica o esquema num banco temporário local.

## Contas e publicação futura

### Estado verificado em 2026-09-08

Wrangler e MCPs autenticados. Plano Free confirmado pelo usuário no painel; consulta de assinatura por MCP não autorizada.

Dois bancos remotos criados e migração `0001_initial.sql` aplicada com sucesso (9 comandos em cada um):

- Demo: `planejador-refeicoes-ia`, ID `fe6371c5-bfb6-497e-94a1-ba467e060ff3`.
- Testes: `planejador-refeicoes-ia-preview`, ID `c4a549cf-8629-44ec-a179-ba9968c2efae`.

`wrangler.d1.jsonc` é exclusivo para administração remota, com conta e IDs explícitos. Exemplo: `npx wrangler d1 migrations apply planejador-refeicoes-ia-preview --remote --config wrangler.d1.jsonc`. Os identificadores não são credenciais. O `wrangler.jsonc` principal continua local; ligação DB por ambiente ainda pendente. Não usar o arquivo administrativo para deploy da aplicação. Nenhum dado pessoal ou receita foi inserido.

Pages/GitHub e segredos ainda não configurados. As instruções abaixo são etapas futuras, não evidência de publicação.

1. Entrar no Cloudflare e manter Workers no plano Free.
2. Criar um projeto Pages com integração GitHub para este repositório, branch `main`. Comando de build: `npm run build`. Pasta publicada: `public`.
3. Criar D1 com `npx wrangler d1 create planejador-refeicoes-ia` na conta autenticada.
4. Substituir o ID local em wrangler.jsonc pelo database_id retornado. O ID do banco não é segredo; credenciais de acesso são.
5. Aplicar o esquema remoto somente depois de conferir conta e banco: `npx wrangler d1 migrations apply DB --remote`.
6. Adicionar GROQ_API_KEY, SESSION_SECRET e IP_HASH_SECRET como secrets no Pages, sem valores no Git. Configurar produção e preview separadamente; preview não deve ter acesso ao histórico de produção.
7. Manter AI_ENABLED=false até concluir e validar geração, sessões, exclusão e cotas.

Essas operações remotas não são executadas por npm install, build, testes ou CI. Não existe workflow de deploy remoto neste estágio.

## Persistência e segurança a implementar

Um ID de visitante sozinho não deve dar acesso ao histórico. A base interna de sessão já usa token aleatório de alta entropia, HMAC no banco e cookie HttpOnly/Secure/SameSite, com testes locais; ainda não está ligada a endpoint público. Consultas de histórico deverão validar a posse da sessão e filtrar pelo visitante. A arquitetura no mesmo domínio simplifica cookies. Ver [sessões e limitações](SESSIONS.md), incluindo prazo provisório de 30 dias e ausência de recuperação entre dispositivos.

O identificador de rede será derivado por HMAC com segredo e rotação por dia, com expiração. É pseudonimização, não anonimização garantida. Redes compartilhadas exigem limite mais tolerante que o individual. Controle por IP não é autenticação.

As três tentativas individuais de geração por dia UTC já são exigidas pela política validada; teto global de 80 permanece proposta não ativa. Reservas atômicas e limites por operação/dia/minuto foram implementados, com orçamentos globais de tokens, sem estorno automático em falhas. Tetos de fotos e reservas de tokens precisam de medição/configuração; número de sugestões não é número de gerações.

## Banco

Cinco tabelas iniciais: visitors, preferences, plans, meal_logs e usage_buckets. Receitas e compras ficam no JSON do plano nesta fundação; não é necessário criar um banco por categoria. Exclusão de visitante remove seus registros vinculados. Contadores de abuso têm expiração própria.

Análise de fotos integra o primeiro PWA, mas não será necessário armazenar as imagens no D1. Proposta: processar a foto transitoriamente e persistir apenas a lista confirmada e o pedido/plano quando o histórico for implementado. Não registrar bytes, base64 ou URLs de fotos em logs, cache ou histórico. Informar o envio ao provedor e verificar sua política de retenção antes de publicar; não prometer apagar dados dos servidores de terceiros sem garantia contratual.

Fluxo simplificado aprovado: encaminhar o original ao Qwen sem decoder/redimensionamento/compactação/remoção de metadados no Worker. Manter verificação leve de upload e validação do JSON retornado. O adaptador local está preparado, mas não conectado a endpoint público nem validado com chamada real. Metadados podem ser enviados junto da imagem; isso deve constar no aviso ao usuário. Revisão aprofundada e remoção de metadados entram no roadmap de lançamento, sem retirar os controles básicos da demo.

Não foi criada migração de banco para fotos. Os campos JSON existentes de preferências/planos comportam listas de ingredientes; a persistência de pedidos deve ter validação e versão próprias, sem alterar implicitamente o contrato de saída da IA. Em `usage_buckets`, uma proposta é usar chaves com prefixo de operação/modelo (por exemplo, `vision:qwen3.6-27b:…` e `generation:gpt-oss-20b:…`), derivadas no servidor. Essa convenção e as reservas atômicas ainda precisam ser implementadas e testadas; trocar o modelo não deve permitir reiniciar a cota individual da operação. Ver [contrato visual](IMAGE-ANALYSIS-CONTRACT.md).
