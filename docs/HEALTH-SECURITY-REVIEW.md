# Pendência antes de produção

O endpoint /api/health é público e não exige autenticação. A exposição de categorias
de configuração, inclusive secret_invalid, foi conscientemente aceita para a demo.
Antes de produção, revisar se o endpoint público deve retornar somente disponibilidade
e mover os motivos técnicos para diagnóstico autenticado ou logs do servidor.
Não retornar valores de segredos. Não confundir formato válido com autenticação Groq válida.

Produção: IP_HASH_SECRET é obrigatório, com mínimo de 32 caracteres após trim
e máximo de 1024. Sem ele as operações protegidas por configuração/cotas falham
fechadas em 503. Incluí-lo no provisionamento junto de SESSION_SECRET e GROQ_API_KEY;
validar configuração antes de liberar tráfego. O health público continua respondendo
200 com disponibilidade falsa; não confundir isso com geração disponível.
