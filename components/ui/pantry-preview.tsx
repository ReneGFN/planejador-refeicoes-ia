import { useState, type FormEvent } from "react";
import { DragSheet } from "./drag-sheet";
import { PreviewIcons as I } from "./preview-icons";
import { QuickSuggestions } from "./quick-suggestions";
import { api } from "@/frontend/api-client";

export interface PantryEntry { id: string; name: string; quantity: string; unit: string; expiry: string; revision?: number; remote?: boolean }
export function PantryPreview({ items, onChange, connected }: { items: PantryEntry[]; onChange: (items: PantryEntry[]) => void; connected: boolean }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PantryEntry | null>(null);
  const [draftName, setDraftName] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const quantity = String(data.get("quantity") ?? ""), unit = String(data.get("unit") ?? ""), expiry = String(data.get("expiry") ?? "");
    try {
      await api.pantry.create({ name, ...(quantity ? { quantity: Number(quantity) } : {}), ...(unit ? { unit } : {}), ...(expiry ? { expires_at: expiry } : {}) });
      const fresh = await api.pantry.list(); onChange(fresh.map(item => ({ id: item.id, name: item.name, quantity: item.quantity?.toString() || "", unit: item.unit || "", expiry: item.expires_at || "", revision: item.revision, remote: true })));
    } catch { onChange([...items, { id: crypto.randomUUID(), name, quantity, unit, expiry }]); }
    setAdding(false); setDraftName("");
  }
  return <>
    <div className="pantry-heading"><h2 className="preview-card-label">Itens cadastrados</h2><button className="button primary pressable" onClick={() => setAdding(true)}><I.plus size={16} />Novo item</button></div>
    <p className="copy">A ordem de uso considera validade — sem julgamento sobre o estado do alimento.</p>
    <p className="session-note">{connected ? "Despensa sincronizada com este navegador." : "Modo local: a despensa será sincronizada quando o servidor for ativado."}</p>
    {!items.length && <p className="preview-empty">Nenhum item cadastrado ainda.</p>}
    {[...items].sort((a, b) => (a.expiry || "9999").localeCompare(b.expiry || "9999")).map(item => <article key={item.id} className="pantry-item"><div><h3>{item.name}</h3><p>{[item.quantity && `${item.quantity} ${item.unit}`.trim(), item.expiry && `vence ${item.expiry.split("-").reverse().join("/")}`].filter(Boolean).join(" · ") || "Quantidade e validade não informadas"}</p></div><button className="outline" onClick={() => setRemoving(item)}>Dar baixa</button></article>)}
    {adding && <DragSheet title="Novo item da despensa" onClose={() => setAdding(false)}><form className="preview-form" onSubmit={save}>
      <label>Nome<input name="name" required maxLength={80} value={draftName} onChange={e => setDraftName(e.target.value)} /></label>
      <QuickSuggestions options={["Arroz", "Feijão", "Ovos", "Leite", "Azeite de oliva"]} selected={draftName} onSelect={setDraftName} />
      <label>Quantidade (opcional)<input name="quantity" type="number" min="0" max="100000" step="0.001" /></label>
      <label>Unidade<select name="unit"><option value="">Não informada</option><option>kg</option><option>g</option><option>l</option><option>ml</option><option>unidade</option></select></label>
      <label>Validade (opcional)<input name="expiry" type="date" /></label>
      <div className="preview-actions"><button type="button" className="button secondary" onClick={() => { setAdding(false); setDraftName(""); }}>Cancelar</button><button className="button primary glow-action">Salvar na sessão</button></div>
    </form></DragSheet>}
    {removing && <DragSheet title="Dar baixa no item?" onClose={() => setRemoving(null)}><p>{removing.name}</p><p className="copy">O item inteiro será removido. Essa ação não registra uma refeição no diário.</p><div className="preview-actions"><button className="button secondary" onClick={() => setRemoving(null)}>Cancelar</button><button className="button primary" onClick={async () => { if (removing.remote && removing.revision) try { await api.pantry.remove({ id: removing.id, name: removing.name, revision: removing.revision }); } catch { return; } onChange(items.filter(item => item.id !== removing.id)); setRemoving(null); }}>Confirmar baixa</button></div></DragSheet>}
  </>;
}

export function PersonalizationPreview({ value, onChange, connected }: { value: { history: boolean; pantry: boolean }; onChange: (value: { history: boolean; pantry: boolean }) => void | Promise<void>; connected: boolean }) {
  return <><div className="personalization-options">{([
    ["history", "Usar meu histórico", "Seus planos anteriores serão enviados ao provedor de IA."],
    ["pantry", "Usar minha despensa", "Os itens da sua despensa serão enviados ao provedor de IA."],
  ] as const).map(([key, title, description]) => <div className="personalization-row" key={key}><div><h2 id={`permission-${key}`}>{title}</h2><p id={`permission-${key}-description`}>{description}</p></div><button type="button" className="permission-switch" role="switch" aria-checked={value[key]} aria-labelledby={`permission-${key}`} aria-describedby={`permission-${key}-description personalization-preview-note`} onClick={() => onChange({ ...value, [key]: !value[key] })}><span /></button></div>)}</div><p className="session-note" id="personalization-preview-note">{connected ? "Suas escolhas ficam salvas no servidor e podem ser alteradas a qualquer momento." : "Modo local: estas escolhas serão sincronizadas quando o servidor for ativado."}</p></>;
}
