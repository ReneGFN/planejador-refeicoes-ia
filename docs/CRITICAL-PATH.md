# Item 8 — caminho crítico do Refeição Fácil

Organização do escopo existente em 2026-09-11. **Somente planejamento: nenhuma etapa de produto implementada, teste real de IA executado ou publicação realizada neste item.** As referências abaixo apontam para tarefas já presentes no [CHECKLIST](CHECKLIST.md), [ROADMAP](ROADMAP.md) e [USAGE-FLOW](USAGE-FLOW.md); não são funcionalidades novas.

## Diagnóstico: fundação adiantada, experiência ainda por construir

A inspeção local encontrou:

- Contratos, transporte Groq, sessões, reserva de cotas, idempotência e rotas integrados; testes usam provedor simulado.
- `public/index.html` é apenas uma página de desenvolvimento, sem formulário de geração, câmera, painel ou resultados. Não há manifesto ou service worker no inventário de arquivos públicos.
- `preferences`, `plans` e `meal_logs` existem no esquema, mas não há operações de produto para salvar/consultar/excluir esses dados. Ter tabela não equivale a ter histórico.
- Flags de IA/sessão/visão desligadas e política vazia nos arquivos de configuração. Isso é bloqueio intencional, não defeito a remover sem calibrar.
- Nenhuma medição real de geração registrada; o instrumento do Item 1 não substitui a execução privada pelo usuário. O teste local do Item 6 não mede o plano Free.
- Há registros anteriores de hospedagem da página de desenvolvimento. Isso não comprova publicação funcional da demo de IA; nenhuma conta/implantação remota foi consultada nesta revisão.

**Uma parte substancial da fundação foi construída antes de validar a primeira receita real e a experiência humana.** Ela será reaproveitada, mas o próximo avanço não é continuar acrescentando mecanismos ao backend sem fechar esse ciclo. Para a demo completa, as grandes frentes abertas são justamente as etapas 3 (histórico), 4 (interface/PWA) e 5 (testar/publicar) do plano do usuário. Não há medição de esforço que permita declarar porcentagem concluída ou data de entrega.

## Dois marcos, sem reduzir o escopo combinado

**M1 — primeira experiência controlada por texto:** uma pessoa abre no navegador do celular, preenche um pedido, recebe uma refeição real e verifica os limites. É o alvo literal deste Item 8, não um novo produto ou uma demo completa.

**M2 — demo PWA combinada:** além de M1, cumprir histórico/exclusão, fotos, interface acordada, instalação e demais funcionalidades de demo já aprovadas, testadas antes da divulgação correspondente.

Histórico não é dependência técnica da resposta HTTP atual: ela pode ser mostrada sem salvar um plano. Por isso ele pode ficar fora de M1, **mas não sai do escopo nem pode ser anunciado como pronto**. A mesma distinção vale para foto e instalação. Não proponho publicar uma demo reduzida no lugar da combinada sem uma nova decisão do usuário.

## Menor sequência até M1

Os números abaixo são ordem de dependência, não tarefas concluídas ou autorização de execução.

| Ordem | Trabalho existente a executar | Por que vem aqui / evidência para avançar | Onde já estava previsto |
|---|---|---|---|
| 1 | Usuário executar a avaliação real de geração com sua chave privada e revisar a rubrica. | Sem isso, desconhecemos qualidade pt-BR, pedidos inviáveis, consumo e truncamento. Precisamos de respostas/tokens reportados e avaliação humana, não só JSON válido. | Geração real e controles; Item 1; GROQ-TESTING. |
| 2 | Calibrar política de geração, entrada e sessão; decidir parâmetros do modelo e tratamento da recusa com base na evidência. | Preencher política bloqueante com valores aprovados, sem copiar os números dos testes nem assumir que 4096 basta. Se a avaliação falhar, tratar o problema já registrado antes de liberar; não forçar receita nem escolher uma correção automaticamente. | Medir tokens; calibrar teto global e QUOTA_POLICY_JSON; decisão de canal de recusa. |
| 3 | Implementar o trecho por texto da interface móvel existente no plano: sessão, formulário, envio, carregamento, resultado e erro/limite. | Hoje não há como uma pessoa fazer a ação pela página. Reusar contrato e rotas, sem chave no navegador, retry automático ou HTML da IA tratado como confiável. Estados de erro e acessibilidade não são acabamento adiável. | Integrar cookie; interface móvel; fluxos guiados; receitas/porções/preparo; estados e acessibilidade. |
| 4 | Preparar e verificar o ambiente de preview, com dados/segredos separados, binding e migrações técnicas necessários; publicar apenas quando autorizado. | Uma execução Node não prova cookies, banco ou rotas publicados. Manter bloqueado enquanto configuração, política e controles não estiverem aprovados; depois habilitar somente o necessário para o teste autorizado. | Configuração na nuvem; preview; separação de ambientes; USAGE-FLOW. |
| 5 | Verificar no ambiente real o percurso por texto, uso de recursos, observabilidade sem dados sensíveis e configuração efetiva. | Health com motivo ok verifica configuração, não prova acesso Groq, esquema D1 ou receita válida. Confirmar a rota real, sem tratar teste simulado ou tempo do CLI como medição da nuvem. Se falhar, parar a liberação e corrigir a causa já no escopo. | Validar CPU/memória e observabilidade; testes reais; verificação em preview. |
| 6 | No celular, fazer o pedido por texto, revisar a refeição recebida e exercitar a cota/idempotência no mesmo visitante. | Só aqui o alvo humano está demonstrado: formulário utilizável, resposta real e limite funcionando no servidor, não apenas um botão desabilitado. | Testar fluxo no celular, limites, reenvios e erros; etapa 5. |

O trabalho da interface (3) pode avançar com os contratos atuais enquanto chegam as medições (1–2); preparar o ambiente (4) também não exige esperar toda a interface. **Habilitar IA e aceitar M1 exige que essas frentes se encontrem com os controles verificados.** Isso descreve dependências, não autoriza iniciar a etapa 4 antes de uma nova tarefa aprovada.

Para M1, basta exercitar uma escolha cook por texto, mantendo ready no trabalho já previsto da interface e da demo. Os campos opcionais não precisam impedir o primeiro teste se omitidos; quando forem expostos, sua validação e limitações precisam ser apresentadas corretamente. Não é autorização para abandonar modos ou a direção visual aprovada.

### O que conta como “o limite funciona”

Critérios já implícitos no trabalho de cotas e testes, aplicados ao cenário real:

- Preservar o mesmo visitante autenticado e a mesma janela diária UTC. Nova ação usa nova chave; reenvio da mesma ação preserva a chave. Recarga da página não pode ser tratada como novo direito diário.
- Verificar três tentativas comuns reservadas e o bloqueio de uma nova tentativa comum ao atingir o teto, sem nova chamada ao provedor. Falhas depois de reservar também contam; não são três receitas garantidas.
- Evitar que um limite por minuto, de rede ou global masque o teste individual. O HTTP 429 sozinho não identifica qual teto foi alcançado: conferir evidência técnica sanitizada de contadores/chamadas no ambiente de teste, sem relaxar limites de produção.
- Verificar reenvio sem chamada extra e mensagem coerente. O 409 atual não recupera a resposta anterior; a interface não deve prometer replay.
- Se a cortesia B do Item 5 já estiver implementada e habilitada nesse futuro teste, diferenciar franquia comum de crédito elegível. Após três sucessos comuns sem crédito, a quarta ação deve bloquear; crédito permitido por falha elegível é outra regra a testar, sem afirmar que toda quarta chamada sempre bloqueia.

Este item não executou esses testes reais, não forneceu cotas definitivas e não criou consulta de saldo ou dashboard. A observação técnica necessária já faz parte da verificação de limites/observabilidade pendente.

## De M1 até M2: etapas de produto que continuam obrigatórias

A ordem abaixo mantém o plano existente; não equivale a implementar nada:

1. **Etapa 3 — histórico:** definir retenção/recuperação; salvar, consultar e excluir preferências/planos por visitante; testar isolamento, reenvio e exclusão sem reiniciar contadores. Sessões/cotas existentes não resolvem isso. Sem essa etapa, não prometer que a pessoa volta e encontra suas coisas.
2. **Etapas 3 e 4 — diário e personalização aprovados:** contrato de consumo, registro/edição/exclusão, permissão alterável desligada por padrão e contexto limitado somente quando autorizado. Diário não nasce de uma geração e personalização não pode preceder a consulta segura do histórico.
3. **Etapa 4 — completar interface e PWA:** fluxos cook/ready, painel compacto/expandido com rascunho preservado, histórico, receitas/compras, resumos e compartilhamento previstos; manifesto/ícones/cache adequado. Calorias estão fora da demo pela decisão do Item 7; não há campo nutricional a construir agora.
4. **Fotos, antes de anunciar esse fluxo:** usuário retestar visão real; avaliar consumo/qualidade e limites, implementar câmera/galeria, aviso pré-envio, revisão/mescla de ingredientes e fallback para digitação. Conferir retenção do provedor e recursos na nuvem antes de habilitar visão. A medição sintética do Item 6 não libera fotos, e o reteste segue adiado até a retomada autorizada.
5. **Etapa 5 — validar o conjunto e divulgar:** testar ambos os fluxos no celular, retorno ao histórico, exclusão, limites independentes, falhas e instalação. Verificar configuração/migrações do ambiente alvo e publicação autorizada; só então atualizar o README com o link e com o que foi efetivamente demonstrado.

As frentes podem ter preparação paralela, mas há dependências reais: histórico antes de personalizar por histórico; revisão de foto antes de usar os ingredientes; comportamento implementado antes de anunciá-lo. Não existe uma data estimada para essas frentes nesta entrega.

## O que sai do primeiro caminho crítico — sem desaparecer do plano

| Item existente | Classificação | Motivo / condição |
|---|---|---|
| Histórico, preferências e exclusão | Fora de M1; necessário para M2. | Não bloqueia mostrar uma resposta HTTP, mas sustenta a promessa de retorno e controle dos dados. |
| Fotos, avaliação de visão, aviso e mescla | Fora do primeiro teste por texto; necessário antes de anunciar foto em M2. | Digitação já é alternativa acordada. Não ligar visão não verificada só para completar uma tela. |
| Manifesto, instalação e cache | Fora de M1; necessário para chamar o resultado de PWA instalável. | O primeiro teste abre no navegador. Não confundir responsividade com instalação/offline. |
| Painel arrastável completo, preservação do rascunho e refinamento visual | Não bloqueiam o primeiro percurso por texto; mantidos na interface acordada. | Construir o trecho funcional antes de completar interações, sem criar outra identidade ou dispensar usabilidade básica. |
| Diário, personalização, resumos, compras consolidadas e cartão de compartilhamento | Fora de M1; permanecem funcionalidades da demo planejada. | Não são necessários para obter a primeira refeição; dependem de dados/ações adicionais já previstas. |
| Estimativas de custo e distinção gasto/estimativa | Fora de M1; continuam no planejamento. | Não impedem texto, receita e cota; não inventar preços enquanto faltam bases. |
| compare, Item 3 | Fora de M1; bloqueado por medições. | Cook e ready já possuem contratos; não ampliar saída/token budget antes dos dados requeridos. |
| Cortesia B, Item 5 | Não é requisito técnico para testar a franquia atual; retomada após este item por decisão do usuário. | Não descartar a escolha B nem anunciá-la pronta. Precisa de esquema técnico, parâmetros, atomicidade e testes próprios. |
| Conformidade de equipamento/louça, Item 4 | Retomada após este item; necessária ao avaliar as restrições oferecidas. | Entrada já implementada; não precisa de refação. Um teste sem opções não comprova que a IA as obedece. |
| Calorias/TACO, Health, widgets nativos e e-mail | Fora da demo conforme decisões registradas. | A nutricional foi reservada ao aplicativo futuro; não adicioná-la ao caminho atual. |
| Atualização das actions por aviso de runtime | Manutenção separada enquanto não houver bloqueio comprovado da entrega. | Aviso anterior não prova falha atual; se CI/deploy ficar bloqueado, a manutenção passa a ser pré-requisito operacional. Nenhum CI remoto foi consultado aqui. |

Não saem do caminho: qualidade mínima da geração, política de limites aprovada, sessão/origem, segredos só no servidor, validação de entrada/saída, erros honestos, verificações de ambiente e usabilidade no celular. Escopo menor para um teste não autoriza remover esses controles.

## Próxima retomada, conforme pedido do usuário

**Item 8 entregue como documento; parar para aprovação.** Depois, retomar primeiro os pontos pendentes de 4 e então 5, um por vez:

- **4:** avaliar respeito real a equipamento/louça e tratar a limitação de validação semântica sem inventar contagem garantida. Medições reais continuam a cargo do usuário; não corrigir a divergência de recusa sem decisão.
- **5:** detalhar implementação da cortesia B, incluindo contrato técnico, parâmetros e funcionamento inicialmente desativado conforme a discussão. Não inferir tetos, executar migração, habilitar crédito ou chamar IA só porque chegou a vez.

Essa é a ordem de retomada autorizada pelo usuário, distinta da ordem de dependências de M1. Ela não transforma 4/5 em pré-requisitos técnicos de todo teste mínimo, nem permite ignorá-los. Se a pendência exigir dados ou decisão ausentes, explicitar o ponto antes de implementar.

## Verificação desta entrega

Somente este documento e notas em CHECKLIST, ROADMAP e USAGE-FLOW. Nenhuma marcação de conclusão ou reescrita de tarefas das etapas 3, 4 e 5. Nada novo de escopo, interface, histórico, configuração, dependência, migração, push ou deploy.

`npm test`: 116 testes existentes aprovados, zero falhas. Eles comprovam a suíte local atual, não M1 ou M2. Integração não executada novamente porque nenhuma rota ou banco foi alterado; os resultados anteriores continuam identificados como anteriores.

A skill de boas práticas de Workers orientou conferir flags, pontos de reserva e limites do diagnóstico local, sem extrapolar para a nuvem ou reformular a arquitetura. Os marcos e prioridades são uma análise das dependências do projeto, não estimativas de prazo nem evidência de implementação.
