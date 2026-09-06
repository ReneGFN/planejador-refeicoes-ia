# Configuração e decisões

## Nesta etapa

Wrangler é a ferramenta oficial para executar Pages Functions e D1 localmente. A versão instalada fica fixada em package.json e package-lock.json. GitHub Actions verifica o código, compila as funções e aplica o esquema num banco temporário local.

## Contas e publicação futura

1. Entrar no Cloudflare e manter Workers no plano Free.
2. Criar um projeto Pages com integração GitHub para este repositório, branch `main`. Comando de build: `npm run build`. Pasta publicada: `public`.
3. Criar D1 com `npx wrangler d1 create planejador-refeicoes-ia` na conta autenticada.
4. Substituir o ID local em wrangler.jsonc pelo database_id retornado. O ID do banco não é segredo; credenciais de acesso são.
5. Aplicar o esquema remoto somente depois de conferir conta e banco: `npx wrangler d1 migrations apply DB --remote`.
6. Adicionar GROQ_API_KEY, SESSION_SECRET e IP_HASH_SECRET como secrets no Pages, sem valores no Git. Configurar produção e preview separadamente; preview não deve ter acesso ao histórico de produção.
7. Manter AI_ENABLED=false até concluir e validar geração, sessões, exclusão e cotas.

Essas operações remotas não são executadas por npm install, build, testes ou CI. Não existe workflow de deploy remoto neste estágio.

## Persistência e segurança a implementar

Um ID de visitante sozinho não deve dar acesso ao histórico. Usaremos sessão com token aleatório de alta entropia, hash no banco e cookie HttpOnly/Secure/SameSite. Consultas deverão validar a posse da sessão e filtrar pelo visitante. A arquitetura no mesmo domínio simplifica cookies.

O identificador de rede será derivado por HMAC com segredo e rotação por dia, com expiração. É pseudonimização, não anonimização garantida. Redes compartilhadas exigem limite mais tolerante que o individual. Controle por IP não é autenticação.

As três gerações individuais e o teto global de 80 são configurações propostas, ainda não implementadas. O controle precisa reservar cota atomicamente antes de chamar a IA e considerar tokens de entrada, saída e raciocínio, limites por minuto, tentativas e erros. 800 tokens não é um orçamento validado para cinco receitas completas; medir antes de fechar o contrato.

## Banco

Cinco tabelas iniciais: visitors, preferences, plans, meal_logs e usage_buckets. Receitas e compras ficam no JSON do plano nesta fundação; não é necessário criar um banco por categoria. Exclusão de visitante remove seus registros vinculados. Contadores de abuso têm expiração própria.

Não armazenar fotos nesta etapa. Na futura função visual, informar o envio ao provedor e verificar a política de retenção dele; não prometer apagar dados dos servidores de terceiros sem garantia contratual.
