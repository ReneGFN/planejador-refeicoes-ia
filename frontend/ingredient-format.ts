export interface RecipeIngredient {
  quantity: number | string;
  unit: string;
  name: string;
}

type UnitLabel = { singular: string; plural: string };

// Os identificadores vêm do contrato; a tradução é apenas de apresentação.
const UNIT_LABELS: Record<string, UnitLabel> = {
  g: { singular: "g", plural: "g" },
  kg: { singular: "kg", plural: "kg" },
  ml: { singular: "ml", plural: "ml" },
  l: { singular: "l", plural: "l" },
  unit: { singular: "unidade", plural: "unidades" },
  teaspoon: { singular: "colher de chá", plural: "colheres de chá" },
  tablespoon: { singular: "colher de sopa", plural: "colheres de sopa" },
  cup: { singular: "xícara", plural: "xícaras" },
  pinch: { singular: "pitada", plural: "pitadas" },
};

function numericQuantity(value: number | string) {
  if (typeof value === "number") return value;
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatQuantity(value: number | string) {
  const numeric = numericQuantity(value);
  if (numeric === null) return String(value).trim();
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(numeric);
}

export function formatIngredient({ quantity, unit, name }: RecipeIngredient) {
  const numeric = numericQuantity(quantity);
  const label = UNIT_LABELS[unit];
  const displayedUnit = label ? (numeric === 1 ? label.singular : label.plural) : unit;
  return `${formatQuantity(quantity)} ${displayedUnit} de ${name}`;
}
