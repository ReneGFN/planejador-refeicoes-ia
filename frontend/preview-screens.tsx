import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PreviewIcons as I } from "@/components/ui/preview-icons";
import { DragSheet } from "@/components/ui/drag-sheet";
import { SwipeAction } from "@/components/ui/swipe-action";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PantryPreview, PersonalizationPreview, type PantryEntry } from "@/components/ui/pantry-preview";
import { DiaryIcon } from "@/components/ui/diary-icon";
import { QuickSuggestions } from "@/components/ui/quick-suggestions";
import { api, ApiError, type MealRecord, type PantryRecord, type PlanRecord } from "./api-client";
import { formatIngredient } from "./ingredient-format";
import { Info, Sparkles } from "lucide-react";
import { WeeklyShareCard } from "@/components/ui/weekly-share-card";
import { MealRating } from "@/components/ui/meal-rating";
import { createActionLock } from "./action-lock.js";

type Route = "inicio" | "pedido" | "planos" | "compras" | "foto" | "diario" | "erros" | "config" | "resultado" | "despensa" | "personalizacao";
const routes: Route[] = ["inicio", "pedido", "planos", "compras", "foto", "diario", "erros", "config", "resultado", "despensa", "personalizacao"];
const currentRoute = () => routes.includes(location.hash.slice(1) as Route) ? location.hash.slice(1) as Route : "inicio";
const LOCAL_PANTRY_KEY = "refeicao-facil:local-pantry";
const readLocalPantry = (): PantryEntry[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_PANTRY_KEY) || "[]");
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === "string" && typeof item.name === "string") : [];
  } catch { return []; }
};
const go = (route: Route) => { location.hash = route; };
const openPlanner = () => document.dispatchEvent(new CustomEvent("refeicao:open-planner"));
const startWith = (meal: string) => {
  const field = document.getElementById("meal") as HTMLInputElement | null;
  if (field) { field.value = meal; field.dispatchEvent(new Event("input", { bubbles: true })); }
  openPlanner();
};
interface Entry { id: string; title: string; note: string; eatenAt?: string; remote?: boolean }
interface Suggestion { title: string; description?: string; servings?: number; total_minutes?: number; ingredients?: { quantity: string | number; unit: string; name: string }[]; steps?: string[] }
interface PlanMeal { id: string; rating: number | null }
interface Plan { id: string; suggestion: Suggestion; planId?: string; mode?: "cook" | "ready"; suggestionIndex?: number; mealLog?: PlanMeal }
type SuggestionMeta = Suggestion & { __planId?: string; __mode?: "cook" | "ready"; __index?: number };

function mealForSuggestion(meals: Array<{ id: string; side: "cook" | "ready"; suggestion_index: number; rating: number | null }>, side: "cook" | "ready", index: number) {
  const matches = meals.filter(meal => meal.side === side && meal.suggestion_index === index);
  // Dados antigos podem ter duplicata. A tela preserva o diário, mas mostra uma única
  // avaliação na alternativa correspondente e prioriza a que a pessoa já avaliou.
  return matches.find(meal => meal.rating !== null) ?? matches[0] ?? null;
}

function planCards(records: PlanRecord[]): Plan[] {
  return records.flatMap(plan => plan.data.suggestions.map((suggestion, index) => {
    const meal = mealForSuggestion(plan.meal_logs ?? [], plan.data.mode, index);
    return { id: `${plan.id}:${index}`, planId: plan.id, mode: plan.data.mode, suggestionIndex: index,
      suggestion: { ...(suggestion as unknown as Suggestion), __planId: plan.id, __mode: plan.data.mode, __index: index },
      ...(meal ? { mealLog: { id: meal.id, rating: meal.rating } } : {}) };
  }));
}

function Empty({ icon, children }: { icon: keyof typeof I; children: ReactNode }) {
  const Icon = I[icon];
  return <div className="preview-empty"><span className="empty-icon"><Icon /></span><p>{children}</p></div>;
}
function VideoSupportBlock({ suggestion }: { suggestion: SuggestionMeta }) {
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState<Awaited<ReturnType<typeof api.video>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const supportId = `video-support-${suggestion.__planId ?? suggestion.title.replace(/\W/gu, "")}-${suggestion.__index ?? 0}`;
  const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(suggestion.title)}`;
  async function reveal() {
    const next = !open; setOpen(next);
    if (!next || support || loading || unavailable || !suggestion.__planId || !suggestion.__mode || suggestion.__index === undefined) return;
    setLoading(true);
    try { setSupport(await api.video({ plan_id: suggestion.__planId, side: suggestion.__mode, suggestion_index: suggestion.__index })); }
    catch { setUnavailable(true); }
    finally { setLoading(false); }
  }
  if (!suggestion.__planId || !suggestion.__mode || suggestion.__index === undefined) return null;
  return <section className="video-support" aria-labelledby={`${supportId}-heading`}>
    <div className="video-support-head"><div><h3 id={`${supportId}-heading`}>Vídeo de apoio</h3><p>Abra uma busca de tutorial no YouTube.</p></div><button type="button" className="icon pressable video-info" aria-label="Sobre o vídeo de apoio" aria-expanded={open} aria-controls={supportId} onClick={reveal}><Info size={17} /></button></div>
    <button type="button" className="text-action video-support-toggle" aria-expanded={open} aria-controls={supportId} onClick={reveal}>{open ? "Ocultar apoio em vídeo" : "Ver apoio em vídeo"}<I.chevDown /></button>
    {open && <div id={supportId} className="video-support-body" role="status" aria-live="polite">
      {loading && <p>Carregando apoio em vídeo…</p>}
      {support && <><p className="preview-notice"><I.warnIcon />{support.notice.text}</p><p className="video-origin">YouTube</p><a className="button secondary pressable video-search-link" href={support.search.url} target="_blank" rel="noopener noreferrer"><I.link />Buscar no YouTube<span className="visually-hidden">: abre uma nova aba no YouTube</span></a></>}
      {unavailable && <><p className="video-unavailable">Não foi possível preparar o apoio em vídeo agora. Você ainda pode pesquisar esta receita diretamente.</p><a className="button secondary pressable video-search-link" href={fallbackUrl} target="_blank" rel="noopener noreferrer"><I.link />Buscar no YouTube<span className="visually-hidden">: abre uma nova aba no YouTube</span></a></>}
    </div>}
  </section>;
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="preview-card"><h2 className="preview-card-label">{title}</h2>{children}</section>;
}
function Back({ title }: { title: string }) {
  return <><button className="text-action preview-back pressable" onClick={() => go("inicio")}><I.chevLeft />Voltar</button><h1 tabIndex={-1}>{title}</h1></>;
}
function DataNotice({ connected }: { connected: boolean }) { return <p className="session-note">{connected ? "Sincronizado com este navegador." : "Modo local: o servidor ainda não está ativado; itens mantidos nesta sessão."}</p>; }

function EntryForm({ kind, initial, onSave, onCancel }: { kind: "diario" | "compras"; initial?: Entry; onSave: (title: string, note: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim()) onSave(title.trim(), note.trim()); };
  return <form className="preview-form" onSubmit={submit}>
    <label>Nome<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
    {!initial && <QuickSuggestions options={kind === "diario" ? ["Café da manhã", "Almoço", "Lanche", "Jantar"] : ["Arroz", "Feijão", "Tomate", "Leite"]} selected={title} onSelect={setTitle} />}
    <label>Observação (opcional)<input maxLength={180} value={note} onChange={e => setNote(e.target.value)} /></label>
    <div className="preview-actions"><button type="button" className="button secondary pressable" onClick={onCancel}>Cancelar</button><button className="button primary pressable" disabled={!title.trim()}><I.save size={17} />Salvar na sessão</button></div>
  </form>;
}

function PhotoScreen() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  useEffect(() => { if (!file) { setUrl(undefined); return; } const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <><Back title="Ingredientes por foto" /><p className="copy">Selecione uma foto para conferir seus ingredientes.</p>
    <p className="preview-notice"><I.warnIcon />Ao analisar, a foto original será enviada à Groq. Ela pode conter metadados; confira os ingredientes antes de usar.</p>
    <label className="photo-picker pressable"><span className="guided-icon"><I.camera size={24} /></span><span>Selecionar foto</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
      const next = e.target.files?.[0]; if (!next) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size > 5 * 1024 * 1024) { setError("Escolha uma imagem JPEG, PNG ou WebP de até 5 MB."); e.target.value = ""; return; }
      setError(""); setAnalyzed(false); setFile(next);
    }} /></label>
    {error && <p role="alert" className="status">{error}</p>}
    {url ? <div className="photo-preview"><img src={url} width="640" height="480" alt="Foto dos ingredientes selecionada por você" /><div className="preview-actions"><button className="text-action" onClick={() => setFile(null)}><I.x />Remover</button><button className="button secondary glow-action" disabled={analyzing} onClick={async () => { setAnalyzing(true); setError(""); try { const result = await api.analyze(file!); setAnalyzed(true); setIngredients(result.ingredients.join(", ")); if (result.status !== "recognized") setError(result.status === "unreadable" ? "Não foi possível ler a foto. Tente outra ou digite os ingredientes." : "Nenhum ingrediente foi reconhecido. Você pode digitá-los."); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível analisar a foto."); } finally { setAnalyzing(false); } }}><Sparkles />{analyzing ? "Analisando…" : analyzed ? "Analisar novamente" : "Analisar foto"}</button></div></div> : <Empty icon="camera">Sua foto aparecerá aqui</Empty>}
    <form className="preview-form" onSubmit={e => { e.preventDefault(); const field = document.getElementById("ingredients") as HTMLTextAreaElement; const mode = document.getElementById("mode") as HTMLInputElement; const policy = document.getElementById("policy") as HTMLSelectElement; mode.checked = false; mode.dispatchEvent(new Event("change", { bubbles: true })); if (policy.value === "suggest") { policy.value = "can_buy_missing"; policy.dispatchEvent(new Event("change", { bubbles: true })); } field.value = ingredients.trim(); field.dispatchEvent(new Event("input", { bubbles: true })); openPlanner(); }}>
      <label>{analyzed ? "Revise os ingredientes reconhecidos" : "Confirme os ingredientes manualmente"}<textarea required maxLength={1200} value={ingredients} onChange={e => setIngredients(e.target.value)} placeholder="Ex.: arroz, tomate, ovos" /></label>
      <QuickSuggestions label="Ingredientes comuns" options={["Arroz", "Tomate", "Ovos", "Frango", "Feijão"]} selected={ingredients.split(",").map(x => x.trim()).filter(Boolean)} onSelect={value => setIngredients(current => { const parts = current.split(",").map(x => x.trim()).filter(Boolean); return parts.includes(value) ? parts.filter(x => x !== value).join(", ") : [...parts, value].join(", "); })} />
      <button className="button primary pressable glow-action" disabled={!ingredients.trim()}><I.check />Usar no pedido</button>
    </form></>;
}

export function PreviewScreens() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [diary, setDiary] = useState<Entry[]>([]);
  const [shopping, setShopping] = useState<Entry[]>([]);
  const [pantry, setPantryState] = useState<PantryEntry[]>(readLocalPantry);
  const setPantry = (items: PantryEntry[]) => {
    setPantryState(items);
    try { localStorage.setItem(LOCAL_PANTRY_KEY, JSON.stringify(items)); } catch { /* Persistência local é opcional. */ }
  };
  const [personalization, setPersonalization] = useState({ history: false, pantry: false });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [modal, setModal] = useState<{ kind: "diario" | "compras"; entry?: Entry } | null>(null);
  const [remove, setRemove] = useState<{ kind: "diario" | "compras" | "planos"; id: string; title: string } | null>(null);
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [ratingPending, setRatingPending] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const screen = useRef<HTMLDivElement>(null);
  const initialRoute = useRef(true);
  const actionLock = useRef(createActionLock());

  const startAction = (key: string) => {
    if (!actionLock.current.start(key)) return false;
    setPendingActions(previous => new Set(previous).add(key));
    return true;
  };
  const finishAction = (key: string) => {
    actionLock.current.finish(key);
    setPendingActions(previous => { const next = new Set(previous); next.delete(key); return next; });
  };
  const consumePlanSuggestion = async (meta: SuggestionMeta) => {
    if (!meta.__planId || !meta.__mode || meta.__index === undefined) {
      setMessage("Salve e sincronize o plano antes de registrar o consumo.");
      return;
    }
    const action = `consume:${meta.__planId}:${meta.__mode}:${meta.__index}`;
    if (!startAction(action)) return;
    try {
      const state = await api.meals.consume({ plan_id: meta.__planId, side: meta.__mode, suggestion_index: meta.__index });
      setDiary(previous => previous.some(item => item.id === state.meal.id) ? previous
        : [{ id: state.meal.id, title: state.meal.description, note: "", eatenAt: state.meal.eaten_at, remote: true }, ...previous]);
      if (state.plan_meal_log) setPlans(previous => previous.map(plan => plan.planId === meta.__planId
        && plan.mode === meta.__mode && plan.suggestionIndex === meta.__index
        ? { ...plan, mealLog: { id: state.plan_meal_log!.id, rating: state.plan_meal_log!.rating } } : plan));
      setMessage("Refeição registrada no diário.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível registrar."); }
    finally { finishAction(action); }
  };

  useEffect(() => {
    const update = () => { setRoute(currentRoute()); setModal(null); setRemove(null); setMessage(""); };
    const results = (e: Event) => { const detail = (e as CustomEvent<{items: Suggestion[]; planId: string | null; mode: "cook" | "ready"}>).detail; if (!Array.isArray(detail?.items)) return; setSuggestions(detail.items.map((item, index) => ({ ...item, __planId: detail.planId, __mode: detail.mode, __index: index }))); go("resultado"); };
    const failure = (e: Event) => { const text = (e as CustomEvent<string>).detail; if (typeof text === "string") setErrors(prev => [...prev.slice(-9), text]); };
    window.addEventListener("hashchange", update);
    document.addEventListener("refeicao:results-ready", results);
    document.addEventListener("refeicao:request-error", failure);
    return () => { window.removeEventListener("hashchange", update); document.removeEventListener("refeicao:results-ready", results); document.removeEventListener("refeicao:request-error", failure); };
  }, []);
  useEffect(() => {
    let active = true;
    api.bootstrap().then(data => {
      if (!active) return;
      setDiary(data.meals.map(meal => ({ id: meal.id, title: meal.description, note: "", eatenAt: meal.eaten_at, remote: true })));
      setPantry(data.pantry.map(item => ({ id: item.id, name: item.name, quantity: item.quantity?.toString() || "", unit: item.unit || "", expiry: item.expires_at || "", revision: item.revision, remote: true })));
      setPersonalization({ history: data.preferences.use_history, pantry: Boolean(data.preferences.use_pantry) });
      setPlans(planCards(data.plans)); setConnected(true);
    }).catch(() => {});
    const local = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    document.addEventListener("refeicao:local-message", local);
    return () => { active = false; document.removeEventListener("refeicao:local-message", local); };
  }, []);
  useEffect(() => {
    // Mostrar nomes no formulário é uma sugestão local. Só o consentimento explícito
    // permite que o servidor envie a despensa completa automaticamente ao provedor de IA.
    const items = [...new Set(pantry.map(item => item.name.trim()).filter(Boolean))];
    document.dispatchEvent(new CustomEvent("refeicao:pantry-suggestions", { detail: { items } }));
  }, [pantry]);
  useEffect(() => {
    if (initialRoute.current) { initialRoute.current = false; return; }
    window.scrollTo({ top: 0, behavior: "instant" });
    screen.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [route]);

  async function saveEntry(title: string, note: string) {
    if (!modal) return;
    const set = modal.kind === "diario" ? setDiary : setShopping;
    const id = modal.entry?.id ?? crypto.randomUUID();
    const description = note ? `${title} — ${note}` : title;
    if (modal.kind === "diario") try {
      if (modal.entry?.remote) await api.meals.update({ id, description: modal.entry.title, eaten_at: modal.entry.eatenAt! }, description);
      else { const response = await api.meals.create(description); const created = await api.meals.list(); setDiary(created.map(meal => ({ id: meal.id, title: meal.description, note: "", eatenAt: meal.eaten_at, remote: true }))); setConnected(true); setModal(null); setMessage("Refeição salva."); return response; }
    } catch (e) { if (!(e instanceof ApiError) || e.code !== "NOT_READY") setMessage(e instanceof Error ? e.message : "Não foi possível salvar."); }
    set(prev => modal.entry ? prev.map(item => item.id === id ? { ...item, title, note } : item) : [...prev, { id, title, note, eatenAt: new Date().toISOString() }]);
    setModal(null); setMessage(connected ? "Alteração salva." : "Salvo no modo local.");
  }
  async function confirmRemoval() {
    if (!remove) return;
    const action = `remove:${remove.kind}:${remove.id}`;
    if (!startAction(action)) return;
    try {
      if (remove.kind === "diario") { const entry = diary.find(x => x.id === remove.id); if (entry?.remote) await api.meals.remove(entry.id); setDiary(prev => prev.filter(x => x.id !== remove.id)); }
      else if (remove.kind === "compras") setShopping(prev => prev.filter(x => x.id !== remove.id));
      else { const plan = plans.find(x => x.id === remove.id); if (plan?.planId) { await api.plans.remove(plan.planId); setPlans(prev => prev.filter(x => x.planId !== plan.planId)); } else setPlans(prev => prev.filter(x => x.id !== remove.id)); }
      setRemove(null); setMessage("Item removido da sessão.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível excluir."); }
    finally { finishAction(action); }
  }
  async function saveRating(mealId: string, rating: number | null) {
    const action = `rating:${mealId}`;
    if (!startAction(action)) return;
    setRatingPending(mealId);
    try {
      await api.meals.rate(mealId, rating);
      setPlans(previous => previous.map(plan => plan.mealLog?.id === mealId ? { ...plan, mealLog: { ...plan.mealLog, rating } } : plan));
      setMessage(rating === null ? "Avaliação removida." : "Avaliação salva.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a avaliação. A nota anterior foi mantida.");
    } finally { setRatingPending(null); finishAction(action); }
  }
  const entries = route === "diario" ? diary : shopping;
  return <>
    <div ref={screen} key={route} id={route} className={`preview-screen ${route === "inicio" ? "screen-enter" : "screen-enter-up"}`}>
      {route === "inicio" && <>
        <p className="eyebrow">Sua próxima refeição, resolvida.</p><h1 tabIndex={-1}>O que facilita sua refeição hoje?</h1>
        <p className="copy">Monte um pedido e receba sugestões — a IA só é chamada ao confirmar.</p>
        <div className="quick-actions">
          <a href="#foto" className="quick-action quick-photo pressable"><span className="quick-icon flip-icon"><span className="flip-icon-inner"><span><I.camera /></span><span><I.check /></span></span></span><span>Foto</span></a>
          <a href="#diario" className="quick-action quick-diary pressable"><span className="quick-icon"><DiaryIcon /></span><span>Diário</span></a>
          <a href="#erros" className="quick-action quick-errors pressable"><span className="quick-icon warning-icon"><I.alert /></span><span>Erros</span></a>
        </div>
        <section className="start-card"><p className="eyebrow">Comece agora</p><h2>{suggestions.length ? "Vamos planejar outra refeição?" : "Nenhuma geração feita ainda"}</h2><p>Monte seu pedido e receba sugestões de refeição.</p><button onClick={openPlanner} className="start-button pressable"><I.plus size={17} />Começar um pedido</button></section>
        <WeeklyShareCard diary={diary} />
        <Card title="Refeições salvas">{plans.length ? <a className="summary-link" href="#planos"><I.save />{plans.length} sugestões salvas nesta sessão<I.chevDown /></a> : <Empty icon="save">Nada salvo ainda</Empty>}</Card>
        <Card title="Lista de compras">{shopping.length ? <a className="summary-link" href="#compras"><I.cart />{shopping.length} itens nesta sessão<I.chevDown /></a> : <Empty icon="cart">Lista vazia</Empty>}</Card>
        <p className="preview-footnote"><I.clock size={14} />Sua cota será verificada ao confirmar o pedido.</p>
      </>}
      {(route === "compras" || route === "despensa") && <nav className="shopping-segments" aria-label="Compras e despensa"><a href="#compras" aria-current={route === "compras" ? "page" : undefined}>Lista de compras</a><a href="#despensa" aria-current={route === "despensa" ? "page" : undefined}>Despensa</a></nav>}
      {route === "despensa" && <><h1 className="visually-hidden" tabIndex={-1}>Despensa</h1><PantryPreview items={pantry} connected={connected} onChange={setPantry} /></>}
      {route === "personalizacao" && <><button className="text-action preview-back pressable" onClick={() => go("config")}><I.chevLeft />Voltar</button><p className="eyebrow">Preferências</p><h1 tabIndex={-1}>Personalização</h1><PersonalizationPreview value={personalization} connected={connected} onChange={async next => { setPersonalization(next); try { await api.preferences.save(next); setConnected(true); setMessage("Preferências salvas."); } catch (e) { setMessage(e instanceof Error ? e.message : "Preferência mantida localmente."); } }} /></>}
      {(route === "diario" || route === "compras") && <>
        <Back title={route === "diario" ? "Diário de refeições" : "Lista de compras"} /><DataNotice connected={route === "diario" && connected} />
        <button className="button primary pressable" onClick={() => setModal({ kind: route })}><I.plus />{route === "diario" ? "Registrar manualmente" : "Novo item"}</button>
        {!entries.length ? <Empty icon={route === "diario" ? "book" : "cart"}>{route === "diario" ? "Nenhuma refeição registrada" : "Sua lista está vazia"}</Empty> : <p className="session-note">Arraste um item para a esquerda para revelar a ação.</p>}
        {entries.map(entry => <SwipeAction key={entry.id} label={route === "compras" ? "Dar baixa" : "Excluir"} onAction={() => setRemove({ kind: route, id: entry.id, title: entry.title })}>
          <div className="entry-content"><span className="entry-icon">{route === "diario" ? <I.book /> : <I.cart />}</span><div><h2>{entry.title}</h2>{entry.note && <p>{entry.note}</p>}</div><button className="icon pressable" aria-label={`Editar ${entry.title}`} onClick={() => setModal({ kind: route, entry })}><I.edit size={17} /></button></div>
        </SwipeAction>)}
      </>}
      {route === "planos" && <><Back title="Planos anteriores" /><DataNotice connected={connected} />
        {!plans.length && <><Empty icon="history">Nenhum plano salvo ainda</Empty><QuickSuggestions label="Ideias para começar" options={["Jantar rápido", "Marmita da semana", "Refeição econômica", "Almoço em família"]} onSelect={startWith} /><button className="button primary pressable glow-action" onClick={openPlanner}><I.plus />Começar um pedido</button></>}
        {plans.map(plan => {
          const suggestion: SuggestionMeta = { ...plan.suggestion, __planId: plan.planId, __mode: plan.mode, __index: plan.suggestionIndex };
          return <SwipeAction key={plan.id} label="Excluir plano" onAction={() => setRemove({kind:"planos",id:plan.id,title:plan.suggestion.title})}>
            <details className="saved-plan"><summary><I.history /><span>{suggestion.title}</span><I.chevDown /></summary><div className="saved-plan-body">
              {suggestion.description && <p>{suggestion.description}</p>}
              <p className="result-meta"><I.people size={15} />{suggestion.servings ?? "—"} pessoas {suggestion.total_minutes && <><I.clock size={15} />{suggestion.total_minutes} min</>}</p>
              {suggestion.ingredients && <section className="saved-plan-section"><h3>Ingredientes</h3><ul>{suggestion.ingredients.map((ingredient, index) => <li key={index}>{formatIngredient(ingredient)}</li>)}</ul></section>}
              {suggestion.steps && <><p className="preview-notice recipe-guidance"><I.warnIcon />Sugestão de preparo: confira se a sequência, o tempo e o cozimento fazem sentido para os ingredientes antes de começar.</p><section className="saved-plan-section"><h3>Modo de preparo</h3><ol className="recipe-steps">{suggestion.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></section></>}
              <VideoSupportBlock suggestion={suggestion} />
              {!plan.mealLog && plan.planId && plan.mode && plan.suggestionIndex !== undefined && (() => {
                const action = `consume:${plan.planId}:${plan.mode}:${plan.suggestionIndex}`;
                const pending = pendingActions.has(action);
                return <button className="button secondary pressable" disabled={pending} onClick={() => consumePlanSuggestion({ ...suggestion, __planId: plan.planId, __mode: plan.mode, __index: plan.suggestionIndex })}><I.check />{pending ? "Salvando…" : "Comi isso"}</button>;
              })()}
              {plan.mealLog && <MealRating value={plan.mealLog.rating} pending={ratingPending === plan.mealLog.id} onRate={rating => saveRating(plan.mealLog!.id, rating)} onRemove={() => saveRating(plan.mealLog!.id, null)} />}
            </div></details>
          </SwipeAction>;
        })}
      </>}
      {route === "foto" && <PhotoScreen />}
      {route === "config" && <><Back title="Configurações" /><Card title="Preferências"><a className="summary-link" href="#personalizacao"><I.settings /><span>Personalização</span><I.chevLeft className="icon-forward" /></a></Card><Card title="Aparência"><div className="settings-row"><span>Usar tema escuro</span><ThemeToggle /></div></Card><p className="copy">A escolha de tema fica salva neste navegador. As demais preferências de conta ainda não estão conectadas.</p></>}
      {route === "erros" && <><Back title="Erros do sistema" /><p className="copy">Mensagens das solicitações feitas nesta sessão.</p>{errors.length ? errors.map((error,i)=><div key={i} className="preview-notice error-notice"><I.alert /><p>{error}</p></div>) : <Empty icon="alert">Nenhum erro registrado nesta sessão</Empty>}</>}
      {route === "resultado" && <><Back title="Sugestões para você" />{!suggestions.length && <Empty icon="plan">Nenhuma sugestão recebida ainda</Empty>}
        {suggestions.map((s, i) => <article className="preview-result" key={i}><h2>{s.title}</h2><p className="result-meta"><I.people size={15} />{s.servings ?? "—"} pessoas {s.total_minutes && <><I.clock size={15} />{s.total_minutes} min</>}</p>{s.description && <p>{s.description}</p>}
          {s.ingredients && <ul>{s.ingredients.map((ingredient,j)=><li key={j}>{formatIngredient(ingredient)}</li>)}</ul>}
          {s.steps && <p className="preview-notice recipe-guidance"><I.warnIcon />Sugestão de preparo: confira se a sequência, o tempo e o cozimento fazem sentido para os ingredientes antes de começar.</p>}
          {s.steps && <div className="recipe-steps">{s.steps.map((step,j)=><p key={j}>{step}</p>)}</div>}
          {s.steps && (!s.steps.length || /^\s*(?:[2-9]|[1-9]\d+)\s*[.)]/.test(s.steps[0])) && <p className="preview-notice"><I.warnIcon />Confira a sequência: ela parece incompleta.</p>}
          <div className="preview-actions">{(() => {
            const meta = s as SuggestionMeta;
            const action = `consume:${meta.__planId}:${meta.__mode}:${meta.__index}`;
            const pending = pendingActions.has(action);
            return <button className="button secondary pressable" disabled={pending} onClick={() => consumePlanSuggestion(meta)}><I.check />{pending ? "Salvando…" : "Comi isso"}</button>;
          })()}<button className="button primary pressable" disabled={plans.some(p=>p.suggestion===s)} onClick={() => { const meta = s as SuggestionMeta; setPlans(prev=>[...prev,{id:crypto.randomUUID(),suggestion:s,planId:meta.__planId,mode:meta.__mode,suggestionIndex:meta.__index}]); setMessage("Sugestão salva."); }}><I.save />{plans.some(p=>p.suggestion===s) ? "Salvo" : "Salvar sugestão"}</button></div>
          <VideoSupportBlock suggestion={s as SuggestionMeta} />
        </article>)}
      </>}
      {message && <p role="status" className="local-feedback"><I.check />{message}</p>}
    </div>
    {modal && <DragSheet title={modal.entry ? "Editar registro" : modal.kind === "diario" ? "Registrar refeição" : "Adicionar item"} onClose={() => setModal(null)}><EntryForm kind={modal.kind} initial={modal.entry} onSave={saveEntry} onCancel={()=>setModal(null)} /></DragSheet>}
    {remove && (() => { const pending = pendingActions.has(`remove:${remove.kind}:${remove.id}`); return <DragSheet title={remove.kind === "compras" ? "Dar baixa no item?" : "Excluir este registro?"} onClose={() => !pending && setRemove(null)}><p>{remove.title}</p><p className="copy">Este item será removido apenas da prévia desta sessão.</p><div className="preview-actions"><button className="button secondary pressable" disabled={pending} onClick={() => setRemove(null)}>Cancelar</button><button className="button primary pressable" disabled={pending} onClick={confirmRemoval}><I.trash />{pending ? "Excluindo…" : "Confirmar"}</button></div></DragSheet>; })()}
  </>;
}
