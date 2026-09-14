import { normalizePantryName, quantityMillis } from '../contracts/pantry.js';

// Função pura. Só usa ingredientes estruturados do instantâneo; não consulta passos ou a LLM.
export function planPantryDeduction(meal, pantry) {
  if (meal.source !== 'plan_suggestion' || meal.side !== 'cook' || meal.snapshot?.side !== 'cook') {
    return { status: 'not_applicable', reason: 'no_structured_recipe', items: [] };
  }
  if (meal.description !== meal.snapshot.title) return { status: 'not_applicable', reason: 'meal_changed', items: [] };
  const portion = meal.servings_consumed;
  if (typeof portion !== 'number' || !Number.isFinite(portion) || portion <= 0 || portion > meal.snapshot.servings) {
    return { status: 'not_applicable', reason: 'servings_unconfirmed', items: [] };
  }
  const ingredients = meal.snapshot.ingredients;
  const frequencies = new Map();
  for (const ingredient of ingredients) {
    const name = normalizePantryName(ingredient.name);
    frequencies.set(name, (frequencies.get(name) ?? 0) + 1);
  }
  const items = ingredients.map((ingredient, ingredient_index) => {
    const normalized = normalizePantryName(ingredient.name);
    const matches = pantry.filter(item => normalizePantryName(item.name) === normalized);
    const base = { ingredient_index, name: ingredient.name, unit: ingredient.unit };
    const skip = reason => ({ ...base, status: 'skipped', reason });
    if (frequencies.get(normalized) !== 1 || matches.length > 1) return skip('ambiguous_name');
    if (!matches.length) return skip('not_found');
    const item = matches[0];
    if (item.unit === undefined || item.quantity === undefined) return skip('quantity_unknown');
    if (item.unit !== ingredient.unit) return skip('unit_mismatch');
    const stock = quantityMillis(item.quantity);
    const quantity = ingredient.quantity * portion / meal.snapshot.servings;
    const used = quantityMillis(quantity);
    if (stock === null || used === null || used < 1) return skip('precision_unsupported');
    if (stock < used) return skip('insufficient_quantity');
    return { ...base, status: 'eligible', pantry_item_id: item.id, revision: item.revision,
      // Conta proporcional de uma sugestão da IA, não pesagem real, mesmo após confirmação da pessoa.
      origin: 'calculado', based_on_estimates: true,
      sources: ['snapshot.ingredients.' + ingredient_index + '.quantity', 'snapshot.servings',
        'servings_consumed', 'pantry_items.' + item.id + '.quantity'],
      quantity: used / 1000, quantity_before: stock / 1000, quantity_after: (stock - used) / 1000 };
  });
  return { status: items.some(item => item.status === 'eligible') ? 'review_required' : 'no_changes', items };
}
