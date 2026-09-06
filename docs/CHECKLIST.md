# Checklist do Refeição Fácil

Atualizado em 2026-09-06. Marcar apenas funcionalidades implementadas e verificadas. Configuração ou decisão documentada não significa funcionalidade pronta.

## Fundação concluída

- [x] Repositório público independente no GitHub, branch main.
- [x] README com objetivo, arquitetura e estado real do projeto.
- [x] Nome Refeição Fácil e logo no README.
- [x] Origem da identidade e prompts documentados; versão anterior preservada.
- [x] Wrangler 4.129.0 instalado e versões fixadas em package-lock.json.
- [x] Configuração local de Pages Functions e D1.
- [x] Esquema inicial com cinco tabelas aplicado no D1 local.
- [x] Rota health que informa fundação, sem geração disponível.
- [x] Rota generate bloqueada com 503, sem chamadas à IA.
- [x] Arquivos de segredos e banco local excluídos do Git.
- [x] Verificações automáticas de sintaxe, testes, build e migração local.
- [x] Três primeiros commits verificados com sucesso pelo GitHub Actions.

Evidência mais recente desta revisão: [verificação do commit f982530](https://github.com/ReneGFN/planejador-refeicoes-ia/actions/runs/34048342668).

## Configuração na nuvem

- [ ] Autenticar Cloudflare e verificar plano gratuito.
- [ ] Conectar Pages ao GitHub e configurar publicação.
- [ ] Criar D1 remoto, configurar binding DB e aplicar migrações.
- [ ] Separar dados e segredos de produção e testes.
- [ ] Configurar chave Groq como segredo e conferir modelos/cotas na conta.
- [ ] Gerar segredos de sessão e de pseudonimização de IP.

## Geração real e controles

- [ ] Definir contrato de entrada e saída da IA e validar no servidor.
- [ ] Integrar GPT-OSS 20B pela Groq e testar qualidade em português.
- [ ] Medir tokens incluindo raciocínio e definir tamanho suficiente das receitas.
- [ ] Implementar três gerações por visitante/dia.
- [ ] Calibrar teto global provisório de 80 com consumo real e margem.
- [ ] Implementar controle por rede e por minuto sem bloquear injustamente redes compartilhadas.
- [ ] Reservar cotas de forma atômica e tratar erros/repetições.
- [ ] Informar limite atingido e indisponibilidade sem simular respostas de IA.

## Histórico e privacidade

- [ ] Implementar sessões protegidas e isolamento entre visitantes.
- [ ] Salvar e recuperar preferências e planos no mesmo navegador.
- [ ] Implementar exclusão de dados e expiração dos contadores.
- [ ] Informar limitações da demo e evitar coleta de condições médicas/alergias.

## Experiência e PWA

- [ ] Criar interface móvel com identidade Refeição Fácil.
- [ ] Fluxos cozinhar e pedir pronto com formulário guiado e texto opcional de 400 caracteres.
- [ ] Receitas, porções, preparo e compras consolidadas.
- [ ] Tempo e custo estimados; calorias estimadas quando houver base suficiente.
- [ ] Distinguir gasto informado de custo estimado.
- [ ] Registro de consumo separado do planejamento.
- [ ] Resumos semanais/mensais limitados às refeições registradas.
- [ ] Cartão bonito com prévia, campos opcionais e exportação local.
- [ ] Manifesto, ícones instaláveis e estratégia de cache/offline.
- [ ] Estados de carregamento, vazio, erro e acessibilidade.
- [ ] Testar fluxo completo no celular, incluindo histórico, limite e exclusão.
- [ ] Publicar link funcional da demo no README.

## Etapa posterior

- [ ] Câmera/upload e segundo modelo com visão, após validar cota e disponibilidade.
- [ ] Confirmar ingredientes reconhecidos antes de usar no plano.
- [ ] Rever envio e retenção das imagens junto ao provedor.
- [ ] Preparar demonstração de e-mail semanal; envio real e automação permanecem fora da primeira versão acordada.

## Manutenção identificada

- [ ] Atualizar actions/checkout e actions/setup-node para versões com runtime atual, validando compatibilidade. Os checks passaram, mas o primeiro run registrou aviso de depreciação do runtime Node 20 dessas actions. Isso é separado do Node 22 usado pelo projeto.

Próxima etapa recomendada: configurar Cloudflare/D1/Groq no plano gratuito; depois definir e testar o contrato de geração antes de habilitar a interface.
