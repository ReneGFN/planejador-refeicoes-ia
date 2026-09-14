import { PreviewIcons as I } from "./preview-icons";

export function QuickSuggestions({ label = "Escolhas comuns", options, selected, onSelect }: {
  label?: string;
  options: string[];
  selected?: string | string[];
  onSelect: (value: string) => void;
}) {
  const chosen = (value: string) => Array.isArray(selected) ? selected.includes(value) : selected === value;
  return <div className="quick-suggestions"><span className="suggestions-label">{label}</span><div className="suggestion-list">
    {options.map(option => <button key={option} type="button" className="suggestion-chip" aria-pressed={chosen(option)} onClick={() => onSelect(option)}>{chosen(option) && <I.check size={14} />}{option}</button>)}
  </div></div>;
}
