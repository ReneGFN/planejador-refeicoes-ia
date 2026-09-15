# Recuperação entre dispositivos — Item 7, proposta

**Somente desenho, sem implementação ou ativação.** Nenhuma rota, migração, credencial, segredo ou flag foi criada neste item. Aprovar este documento não deve ser confundido com autorizar uma implementação.

## Recomendação e limite da demo

Proponho uma transferência de acesso por código exportável/importável, sem e-mail, senha escolhida ou cadastro. Continua sendo uma credencial secreta: “sem senha” não significa “sem algo que precisa ser guardado”. Quem possui o código pode assumir o acesso.

Recomendação para a primeira demo: manter a proposta registrada, mas só implementá-la após fechar a limpeza automática por prazo e aprovar os detalhes de autenticação. Um mecanismo de recuperação também é uma nova porta de acesso ao diário, não um simples botão de copiar. Não prometê-lo na interface enquanto não existir.

A sessão atual usa um único session_token_hash por visitante e prazo absoluto calculado de created_at em src/security/session.js. Por isso, **transferir e desativar a sessão antiga** é um primeiro desenho menor que permitir vários dispositivos simultâneos. Sincronização com múltiplas sessões exigiria outro modelo de sessões/revogação.

Trocar de dispositivo hoje perde o vínculo de acesso; não apaga automaticamente as linhas do banco. Tampouco este código seria um backup dos alimentos ou receitas.

## Prazo e cotas não mudam

A recuperação proposta aponta para o mesmo visitor_id técnico e os mesmos dados, permissões, recibos e contadores. Não cria outro visitante nem reinicia o saldo diário. Limites por rede continuam usando a rede da nova requisição; os limites por visitante/global não se renovam.

Código, preparação da transferência e nova sessão nunca ultrapassariam o fim dos 30 dias originais. Recuperar no dia 29 daria somente o tempo restante, não mais 30 dias. Sessão expirada continua irrecuperável mesmo se as linhas ainda não tiverem sido limpas fisicamente.

Isso **não resolve acumular meses de histórico**. Para isso, precisaríamos decidir separadamente identidade durável, duração de acesso e retenção dos dados, sem estender automaticamente o prazo aprovado.

## Geração, derivação e armazenamento

Proposta específica do projeto, ainda sem código:

- Gerar 32 bytes aleatórios com fonte criptográfica, não PIN curto, UUID como senha, nome, IP, ingredientes ou saída de LLM. São 256 bits antes da codificação.
- Codificar em base64url canônico, 43 caracteres sem padding, mais prefixo de versão. O prefixo não contém dono ou dados alimentares. Validar tamanho/formato antes de trabalho no banco.
- Derivar HMAC-SHA-256 com segredo próprio RECOVERY_SECRET e domínio fixo de recuperação versão 1, sobre os bytes do código. Separar do segredo/domínio usados para sessão.
- Armazenar apenas HMAC, versão de chave/formato, vínculo técnico ao visitante e datas/estado. HMAC não é criptografia reversível: não permite ao servidor reexibir o código original.
- Não usar JWT autocontido: revogação, uso único e retenção já precisam de estado no banco. Não derivar o código de uma senha humana.
- Exibir/exportar o segredo somente após ação explícita. Arquivo exportado conteria versão, código e prazo, não uma cópia do histórico. Avisar que o arquivo é uma chave de acesso; sugerir armazenamento privado, sem enviar a terceiros.
- Não enviar segredo em URL, analytics, log, erro, README, cartão de compartilhamento ou prompt da IA. Envio por corpo HTTPS com resposta no-store. Não prometer ausência de risco na área de transferência ou no dispositivo.

A referência da [OWASP para tokens de recuperação](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) fundamenta aleatoriedade, comprimento, proteção, expiração, uso único e limites de tentativas. Os 32 bytes, HMAC separado e fluxo abaixo são decisões propostas aqui, não uma certificação OWASP nem um fluxo de redefinição de senha copiado integralmente.

Trocar/perder RECOVERY_SECRET pode invalidar códigos existentes; estratégia de versões e rotação precisa ser aprovada antes da implementação. Um HMAC não protege contra comprometimento simultâneo do aplicativo, banco e segredo.

## Fluxo proposto: preparar e confirmar

1. **Emitir/exportar:** com sessão autenticada, a pessoa pede um código, recebe explicação e salva-o. Substituir um código exige confirmação, pois invalidaria cópias anteriores. Propor preparação/ativação separadas também nesta troca: falha de entrega não deve invalidar silenciosamente o código ativo anterior.
2. **Importar:** no novo dispositivo, a pessoa apresenta o código. Aplicar limites antes de procurar seu HMAC. Um código válido autentica uma operação limitada de recuperação; não permite escolher visitor_id no corpo nem consultar diretamente dados de produto.
3. **Preparar transferência:** criar um desafio secreto curto e um novo código de recuperação pendente, com validade de preparação proposta de cinco minutos, limitada ao prazo restante. Manter sessão/código anteriores ativos enquanto a preparação não for confirmada. Guardar HMACs, não os segredos retornados.
4. **Salvar e confirmar:** pedir confirmação explícita de que o novo código foi guardado e de que o dispositivo anterior será desconectado. A confirmação exige prova do desafio secreto, não somente ID público ou booleano.
5. **Efetivar atomicamente:** conferir código/revisões/prazo esperados, consumir o código anterior, ativar o novo, substituir o token de sessão do mesmo visitante e invalidar preparações concorrentes. Só então emitir cookie protegido com o tempo restante. Somente um concorrente pode vencer.
6. **Falha de comunicação:** se a preparação não chegou, a credencial anterior ainda funciona. Se a confirmação gravou mas a resposta/cookie se perdeu, o novo código previamente salvo permite iniciar outra transferência. Se nada gravou, o antigo permanece válido. Não declarar conclusão sem evidência, nem reativar o código consumido para “facilitar o retry”.

Esse fluxo exige novas persistências técnicas de código/desafio/recibo e tratamento explícito de reenvio; uma Idempotency-Key sozinha não autoriza reemitir credenciais. O status de uma preparação também exige prova secreta e nunca devolve conteúdo alimentar. O contrato detalhado de entrega/consulta, os limites de preparações simultâneas e sua limpeza são condições para implementação, não algo testado nesta proposta.

Se o dispositivo de destino já tiver outro histórico, avisar antes de substituir seu cookie; não mesclar identidades, somar cotas, transferir recibos ou apagar aquele outro histórico. A pessoa precisaria guardar uma forma de acesso a ele, caso desejasse preservá-lo.

## Sessão antiga, exclusão e concorrência

Após a transferência, novas requisições com o cookie antigo seriam rejeitadas. Revogar um token não cancela o que já foi recebido, enviado ao provedor ou está na tela. [OWASP — gestão de sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) orienta rotação e invalidação no servidor; o efeito em requisições em andamento precisa de proteção própria.

Proponho vincular a versão de autenticação capturada na validação da sessão às escritas sensíveis. Apenas trocar session_token_hash ou reler history_revision depois de autenticar não fecha todas as corridas. A migração/guardas futuras devem testar requisições autenticadas antes da transferência, mas ainda não gravadas, sem alterar o contrato de geração ou estornar IA já usada.

Na exclusão de histórico do Item 6, revogar também código de recuperação e preparações ativas, mantendo apenas recibos técnicos pelo prazo definido. Preservar a sessão atual como já aprovado; permitir emitir outro código por nova ação. A confirmação de transferência deve conferir também a revisão de exclusão esperada, para não disputar a identidade depois de apagar. Nada disso altera hoje a rota entregue no Item 6.

Importar é um **novo mecanismo de autenticação**, que precisará de autorização específica: não pode simplesmente exigir o cookie antigo, pois ele pode ter sido perdido. O HMAC válido identifica o dono no serviço de autenticação; só depois da nova sessão as consultas de produto continuam filtradas pelo dono autenticado. IDs informados no pedido nunca substituem a credencial. Não foi aberta exceção no código atual à regra de isolamento.

## Tentativas e abuso

Proponho ingress mais uma política técnica exclusiva de recuperação, sem tokens de IA. Importações válidas, inválidas e reenvios contam; trocar Idempotency-Key não deve driblar esse limite. Aplicar contadores atômicos antes da consulta da credencial, inclusive sem sessão.

Ponto inicial **para discussão e teste, não medição ou configuração aprovada**: por rede, cinco tentativas por minuto e vinte por dia; global, vinte por minuto e duzentas por dia. Agregar IPv6 por /64 e pseudonimizar a rede seguindo a disciplina existente; não persistir IP puro. Emissão por sessão também precisa de teto próprio, proposto em três por dia. Não adicionar estes números à política executável agora.

Rede compartilhada pode bloquear pessoas legítimas; rede distribuída pode tentar contornar o limite local. Teto global limita impacto, mas permite indisponibilidade provocada. Não bloquear permanentemente o visitante porque alguém digitou códigos ruins. Usar resposta genérica para código desconhecido, consumido, revogado ou expirado, sem expor dono/datas; evitar diferenças observáveis desnecessárias, sem prometer tempo perfeitamente constante.

Limites e código aleatório não evitam o uso de um código roubado. Preparações devem ser limitadas e limpas sem apagar contadores/recibos ainda necessários. Não prometer custo zero, desempenho ou capacidade sem medir a implementação.

## Se o código vazar ou for perdido

Quem obtiver o código poderá tentar assumir a identidade, ler dados e praticar as ações permitidas. Após uso legítimo, o código anterior deixa de funcionar; antes disso, não há como distinguir dono e ladrão apenas pelo mesmo segredo.

Se ainda tiver sessão válida, a pessoa poderá revogar/substituir o código comprometido. Se o invasor concluir a transferência primeiro, a sessão antiga deixará de autenticar; sem segundo fator/canal externo não existe comprovação de propriedade para recuperar com segurança. Não prometer resgate administrativo baseado em descrição de receitas. Isso é um risco explícito do desenho sem cadastro.

Perder sessão e código, expirar o prazo, excluir os dados ou perder o segredo do servidor pode tornar o acesso irrecuperável. Não resolve backup, acesso simultâneo, sincronização, recuperação de conteúdo apagado, dispositivo comprometido ou retenção de longo prazo.

## O que a etapa 4 deverá mostrar

Enquanto não implementado: “Seu histórico fica vinculado a este navegador por até 30 dias. Apagar os cookies, trocar de navegador/dispositivo ou deixar a sessão expirar pode fazer você perder o acesso. Não há recuperação disponível nesta demo.”

Se aprovado e implementado: explicar que o código é uma chave, onde guardá-lo, a data final original, a desconexão do acesso anterior, a troca por um novo código e os estados preparando, aguardando confirmação, concluído, indisponível/limitado e resultado incerto. Nenhuma tela, CSS, PWA ou aviso foi implementado neste item.

## Critérios de aprovação futura

Antes de escrever código: aprovar transferência exclusiva versus múltiplas sessões, manutenção dos 30 dias, nova autenticação por código, fluxo em duas etapas, política de limites, rotação de segredos, migração/retenção técnica e mensagem sobre roubo irreversível. Recomendo o desenho acima, mas não trato suas escolhas como aprovadas.

Testes futuros obrigatórios: duas identidades isoladas; importação sem cookie sem aceitar dono no corpo; código antigo inválido após sucesso; não renovar prazo/cota; dois concorrentes com um vencedor; falha/rollback antes e depois de confirmar; confirmação perdida com novo código salvo; revogação e exclusão durante transferência; gravação antiga rejeitada; segredo errado/rotacionado; limites de rede/global; ausência de segredos em logs/respostas de erro. Esses testes **não existem** nesta entrega.

O Item 7 entrega somente esta proposta. A etapa 3 continua com limpeza automática/retenção física pendente e custo real de contexto não medido. Etapas 4/5 não foram iniciadas. As suítes atuais reexecutadas verificam regressão do backend existente, não segurança ou funcionamento desta recuperação inexistente.
