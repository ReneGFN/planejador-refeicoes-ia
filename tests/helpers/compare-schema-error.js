// Valores do corpo M04 fornecido pelo usuário; escapes de apresentação do chat
// interpretados, sem corrigir o conteúdo de failed_generation (576 bytes UTF-8).
// O final inválido é parte da evidência, não uma receita a normalizar.
export const M04_ERROR = Object.freeze({
  message: "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
  type: 'invalid_request_error',
  code: 'json_validate_failed',
  failed_generation: "{\"version\":1,\"mode\":\"compare\",\"cook\":{\"status\":\"not_suggested\",\"reason\":\"Não há fonte de calor nem equipamentos disponíveis para assar a pizza, e a restrição de não usar utensílios reutilizáveis impede qualquer preparação que gere resíduos em panelas, tábuas ou facas.\",\"suggestions\":null},\"ready\":{\"status\":\"suggested\",\"suggestions\":[{\"title\":\"Pizza Assada Pronta\",\"description\":\"Pizza já assada, pronta para consumo imediato. Ideal para quem não possui forno ou fogão em casa.\",\"search_term\":\"pizza assada pronta\",\"servings\":2,\"estimated_price_brl\":null}]}\"}}",
});
export const compareSchemaError = () => ({ error: { ...M04_ERROR } });
