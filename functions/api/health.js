export function onRequestGet() {
  return Response.json(
    { status: "ok", stage: "foundation", generationAvailable: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
