# Avaliação das refeições

Uma avaliação é a opinião opcional da pessoa sobre **uma refeição que ela registrou como
consumida**. Vai de 1 a 5; `NULL` significa “sem avaliação” e não equivale a 1. Não é
uma medida nutricional, confirmação de qualidade, diagnóstico, nem uma inferência do
aplicativo sobre o que a pessoa gostou.

## Onde fica e quem vê

A avaliação fica na coluna estruturada `meal_logs.rating`, com `CHECK` de inteiro entre
1 e 5. Ela não fica em `data_json`, que guarda o conteúdo alimentar declarado, e não é
obrigatória para registrar, editar ou excluir uma refeição.

Ela pertence ao visitante dono de `meal_logs`. A listagem de planos expõe somente os
registros de consumo vinculados aos planos do mesmo visitante, para que a interface mostre
o controle apenas onde houve consumo real. Com `DIARY_ENABLED` desligado, esse vínculo não
é exposto e a interface não mostra uma ação que não conseguiria salvar.

## Retenção e exclusão

A avaliação acompanha o registro de diário: expira com `meal_logs` e é removida quando o
registro ou o histórico do visitante é excluído. Os recibos de mutação permanecem técnicos
e não carregam a nota.

Excluir um plano é diferente de excluir o consumo: `meal_logs.plan_id` usa `ON DELETE SET
NULL`, portanto o consumo e sua avaliação sobrevivem, mas deixam de aparecer associados ao
plano apagado. Isso evita apresentar a remoção de um plano como se tivesse apagado uma
refeição registrada.

## Limites desta entrega

A avaliação não é enviada para a IA, não entra no recorte de histórico e não altera
sugestões em cook, ready ou compare. A tela confirma a gravação no servidor antes de
alterar a nota exibida; se a rede falhar, conserva a nota anterior.

Usar avaliações para personalização é decisão futura, separada. Antes disso será preciso
definir consentimento específico, finalidade compreensível, campos e limite de contexto,
retenção, revogação e exclusão, além de preservar a regra de que compare não recebe
histórico. Nada disso está implementado ou ativado por este recurso.
