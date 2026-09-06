// Fail closed: esta etapa não chama provedores nem grava dados de visitantes.
export function onRequestPost() {
  return Response.json(
    {
      code: "NOT_READY",
      message: "A geração com IA está em preparação. Nenhuma geração foi consumida.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
