// Apenas transporte SIMULADO: preenche os nulls obrigatórios sem limpar defeitos.
// Não usar no produto; a normalização real pertence ao contrato.
export function compareWire(value) {
  const raw = structuredClone(value);
  for (const mode of ['cook', 'ready']) {
    const side = raw?.[mode];
    if (!side || typeof side !== 'object' || Array.isArray(side)) continue;
    for (const field of ['suggestions', 'reason']) {
      if (!Object.hasOwn(side, field)) side[field] = null;
    }
    if (mode === 'ready' && Array.isArray(side.suggestions)) {
      for (const item of side.suggestions) {
        if (item && typeof item === 'object' && !Array.isArray(item) && !Object.hasOwn(item, 'estimated_price_brl')) {
          item.estimated_price_brl = null;
        }
      }
    }
  }
  return raw;
}
