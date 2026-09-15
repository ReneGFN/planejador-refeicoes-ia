# Histórico — preferências e personalização autorizada

Implementação local, sem interface ou ativação. PERSONALIZATION_ENABLED e PANTRY_ENABLED continuam false nos três ambientes; política vazia e reserva intactas. Item 3 entregou as rotas de diário e Item 4, a despensa. Item 5 acrescenta [prioridade por validade e contexto compartilhado](PANTRY-PRIORITY.md), sem migração ou dependência nova.

## Decisões aprovadas e medições corretas

- Histórico somente em cook e ready. Compare nunca consulta/monta/envia recorte, mesmo com permissão ativa.
- Reserva aprovada continua 4.096, sem modificar a política executável. `QUOTA_POLICY_JSON` continua vazio e bloqueante; valores amplos do harness de integração não são política de uso aprovada.
- Orçamento de planejamento do contexto: 600 tokens de entrada, aplicado por limites de caracteres/registros, não por tokenizador.
- Registrar refeição não autoriza enviar histórico. `use_history` nasce false e só booleano true em documento válido autoriza.

[Medições fornecidas pelo usuário](GROQ-TESTING.md): C08 ready, 1.064 + 102 = 1.166; C10 cook, 1.183 + 1.181 = 2.364, ambos contrato pass. SYSTEM legado atual `sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b`, idêntico em cook/ready. A faixa anterior de entrada cook 1.084–1.119 e folga ~1.780 foi atribuída à versão errada no Prompt B; não usar no orçamento atual. Não foram inspecionados os brutos dessas duas chamadas nem criada medição pelo agente.

Com acréscimo hipotético de exatamente 600 tokens: cook chega a 2.964 (72,4% de 4.096; restam 1.132); ready chega a 1.766 (43,1%; restam 2.330). Há margem frente ao pior caso realista **desta amostra informada**. Isso não confirma que o recorte implementado acrescente no máximo 600 nem que uma resposta futura fique nessa faixa.

`reserveTokens` é pré-autorização contábil, não teto rígido do provedor. `finishUsage` soma o excesso reportado depois da chamada e não devolve diferença quando o uso é menor. O maior volume possível no contrato — três alternativas, 40 ingredientes e 20 passos de até 600 caracteres por alternativa — já não tinha cobertura garantida na reserva antes do histórico. Só os passos podem ocupar 36.000 caracteres. `max_completion_tokens: 4096` é o limite de geração de conclusão (incluindo raciocínio), não limite total de entrada + saída e não garantia de JSON completo; pode haver truncamento. Nenhum desses parâmetros foi alterado.

## Limites concretos e por quê

SUPOSIÇÃO de planejamento: **dois caracteres por token**. Assim, 600 motivam teto de 1.200 caracteres. Não há função de estimar/contar tokens nem dependência adicionada. O código conta pontos de código Unicode: emoji conta como um caractere, mas isso não afirma que custe um token. Idioma, escapes, símbolos e identificação dos papéis das mensagens podem mudar o custo real.

| Limite | Valor | Motivo |
|---|---:|---|
| Janela | sete dias corridos até agora, UTC | Recência sem enviar todo o diário de 30 dias. Inclui a borda inicial e exclui futuro. |
| Candidatos consultados | até 20 | Leitura limitada; permite descartar registros incompatíveis sem carregar o diário todo. |
| Registros enviados | até quatro | Pequeno recorte recente; é máximo, não promessa de quatro itens. |
| Descrição por registro | até 120 caracteres | Trecho curto da descrição, sem ingredientes/passos extraídos de receitas. |
| Registro serializado | até 300 caracteres | Inclui nomes dos campos, data, vínculo opcional, pontuação e escapes JSON. |
| Bloco completo serializado | até 1.200 caracteres | Inclui aviso fixo e estrutura JSON; não reserva todos os caracteres apenas às descrições. |

Em `src/history/context.js`, o SQL projeta somente ID para desempate, data, primeiros 121 caracteres da descrição e ID de plano do mesmo dono. Lê somente registros versionados com descrição textual; não lê receita nem steps. A função pura mantém até 120 caracteres de descrição, ordena por instante de consumo decrescente e desempata por ID crescente. Registros que excedam o teto serializado são omitidos, não transformados em JSON quebrado. O bloco avisa que descrições podem ser abreviadas. O número efetivo pode ser menor que quatro por falta de dados, caracteres escapados ou teto total. Sem registro elegível, nenhuma mensagem adicional é enviada.

Janela e limites são decisões de implementação, não evidência de eficácia. Desde o Item 5, despensa autorizada participa em cook e divide o teto: listas de até 400 caracteres para diário e despensa; sem diário, despensa até 800; bloco completo até 1.200. Diário sem despensa mantém exatamente o recorte anterior. Não há outros 600 tokens. Detalhes de ordem, corte e degradação em PANTRY-PRIORITY.

## Preferências: contrato e rotas

`GET /api/preferences` recupera e `PUT /api/preferences` substitui o documento inteiro. Retornam `{ "data": ... }`, com `Cache-Control: no-store`. Ambos exigem sessão autenticada e limite de ingress. PUT exige HTTPS, mesma origem, JSON válido e Idempotency-Key UUID v4; é substituição idempotente, sem recibo de geração. GET rejeita origem divergente quando informada e Sec-Fetch-Site diferente de same-origin; não recebe corpo. Não há CORS permissivo. Sem sessão: 401; corpo inválido: 400; ingress excedido: 429; falha de banco: 503 sanitizado, sem expor SQL. Mesma chave em PUT não é replay de snapshot: reenviar o mesmo estado não duplica registros, e o último PUT gravado prevalece.

```json
{
  "version": 1,
  "use_history": false,
  "defaults": {}
}
```

Em defaults podem existir `people`, `time_minutes`, `budget_brl`, `preferences`, `equipment`, `avoid_equipment` e `max_dishes`. Reutilizam os validadores, limites e enums da geração, sem alterar seu contrato. Preferências ausentes permanecem ausentes, inclusive distinção entre equipment vazio e omitido. `meal`, `ingredients`, rascunho de formulário, foto e `visitor_id` não são preferências reutilizáveis e são rejeitados. Sem linha salva, retornar o padrão desligado não grava consentimento.

Esses defaults são recuperáveis para preenchimento futuro do formulário; o backend não os aplica silenciosamente por cima do pedido explícito. Esta etapa não cria rascunho nem interface. A permissão é lida da tabela pelo dono da sessão, nunca do campo livre `preferences` da geração. Somente consultar/alterar preferências não chama IA, não reserva geração/visão e não depende de `GROQ_API_KEY` ou AI_ENABLED. Ainda depende de PERSONALIZATION_ENABLED, SESSIONS_ENABLED e configuração de sessão/ingress válidas.

## Envio e barreira de compare

Item 5: a rota usa selectGenerationContext; readHistoryContext reutiliza a projeção anterior do diário depois da permissão verificada. use_pantry é opcional no documento versão 1, booleano independente de use_history e não autoriza quando ausente/false. PUT substitui tudo: omissão revoga a permissão de despensa. O JSON de exemplo acima permanece válido e não autoriza despensa.

Após autenticar, validar, verificar replay e reservar uma geração nova, a rota cook/ready lê o documento de preferência. Se flag ou consentimento não permitir, se o documento for inválido, ou se houver falha de leitura da preferência/diário, segue com geração **sem histórico**. Não presume autorização nem faz retry de IA. GET/PUT de configurações, por outro lado, informam falha de banco em vez de fingir salvamento/leitura bem-sucedida.

Quando autorizado e não vazio, o recorte entra em mensagem user separada, depois do pedido JSON original. O aviso diz que são dados de consumo, não instruções/preferências, que o pedido atual tem prioridade e que não devem criar restrições. O SYSTEM, schema, dados originais e contrato de geração permanecem intactos. Testes provam preservação dos campos e do aviso, não que a LLM obedecerá semanticamente em todas as respostas. Não há instrução para forçar mais alternativas.

Compare é barrado na rota, no seletor antes de qualquer consulta e no adaptador mesmo se um chamador interno entregar `historyContext`. Não se constrói um recorte para descartá-lo depois. Histórico ativado não muda compare. Visão também não usa esse contexto.

O plano salva a resposta e o pedido original como antes, sem duplicar o recorte do diário em plans. Replay recupera a resposta original, não relê diário nem chama IA; não promete reproduzir uma geração a partir de preferências atuais.

## Consentimento, falhas e exclusão

Desligar confirmado impede inclusão nas novas gerações subsequentes. Não desfaz chamadas já enviadas/em andamento, não apaga diário, planos ou contadores. Reativar permite novamente os registros mantidos e ainda elegíveis. Falha ao salvar o desligamento retorna 503: a preferência anterior pode continuar true; a interface futura deve informar que a alteração não foi confirmada, sem mostrar falsamente “desligado”.

Cada geração nova consulta o estado atual, sem cache. Correção e remoção de diário/despensa se refletem no envio seguinte, inclusive pelas rotas dos Itens 3/4. A exclusão abrangente do Item 6 permanece pendente. A duração de acesso continua vinculada à sessão de 30 dias absolutos; limpeza física e proposta de recuperação seguem pendentes.

## Verificação e pendências

Estado do Item 5: 333 testes Node e 90 cenários de integração aprovados, 20/oito novos, com IA simulada. Cobrem despensa/diário compartilhando o teto, permissões, isolamento e falhas. Abaixo, contagens do Item 2 preservadas como evidência histórica, não da execução atual.

- `npm test`: 258 aprovados, 19 novos testes de preferências/contexto/HTTP, sem rede ou segredos reais.
- `npm run test:integration`: 54 cenários aprovados, oito novos, workerd e D1 descartáveis, Groq simulada. O sandbox bloqueou a primeira tentativa antes dos testes; execução autorizada concluiu.
- Verificados limites de caracteres, ordenação/data de borda, isolamento, permissão desligada/inválida, ligar/desligar/reativar, falha ao salvar/ler, diário vazio, exclusão/correção refletida, compare sem consultar/enviar histórico e hashes de SYSTEM congelados.
- **NÃO verificado:** consumo real do recorte, obediência semântica/qualidade, nem teto garantido de 600 tokens. A comparação real de prompt_tokens com/sem recorte será executada pelo usuário. Ver roteiro em GROQ-TESTING.
- Itens 3/4/5 entregues localmente: diário, despensa e prioridade por validade. Itens 6/7, exclusão abrangente/limpeza e proposta de recuperação, permanecem pendentes.
- Etapa 4: telas de preferências, aviso de envio ao Groq, estado de salvamento/falha, preenchimento de defaults e registro explícito de consumo. C08 com apenas uma alternativa é observação a considerar, sem mudar prompt.
- Etapa 5: validação/liberação posterior. Nenhum deploy ou ativação nesta entrega.

Skills `workers-best-practices` e `wrangler`: binding D1 parametrizado, isolamento por dono, promessas aguardadas e nova flag false por ambiente. Referências: [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) e [configuração Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
