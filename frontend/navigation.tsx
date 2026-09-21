import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PreviewIcons as I, PreviewLogo } from "@/components/ui/preview-icons";
import { PreviewScreens } from "./preview-screens";
import { ExpandableTabs, type TabItem } from "@/components/ui/expandable-tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PwaStatus } from "@/components/ui/pwa-status";
import { ShoppingBag, Utensils } from "lucide-react";
import "./styles.css";
import "./preview-details.css";

const destinations = ["inicio", "planejar", "planos", "compras", "config"];
const destinationIndex = () => {
  const route = location.hash.slice(1);
  const index = destinations.indexOf(route === "personalizacao" ? "config" : route === "despensa" ? "compras" : route);
  return index > 1 ? index : 0;
};

function MealNavigation() {
  const [destination, setDestination] = useState(destinationIndex);
  const [plannerOpen, setPlannerOpen] = useState(() => location.hash === "#pedido");

  useEffect(() => {
    const syncHash = () => { setDestination(destinationIndex()); setPlannerOpen(location.hash === "#pedido"); };
    window.addEventListener("hashchange", syncHash);
    syncHash();
    return () => { window.removeEventListener("hashchange", syncHash); };
  }, []);

  const tabs: TabItem[] = [
    { title: "Início", icon: I.home, href: "#inicio" },
    { title: "Planejar", icon: I.plan, controls: "meal-screen", expanded: plannerOpen },
    { title: "Planos", icon: I.history, href: "#planos" },
    { title: "Compras", icon: I.cart, href: "#compras" },
    { title: "Configurações", icon: I.settings, href: "#config" },
  ];

  function navigate(index: number | null) {
    // An outside click only collapses the label; it must not change the destination.
    if (index === null) return;
    if (index === 1) {
      document.dispatchEvent(new CustomEvent("refeicao:open-planner"));
      return;
    }
    if (plannerOpen) document.getElementById("close")?.click();
    setDestination(index);
    document.getElementById(destinations[index])?.focus({ preventScroll: true });
  }

  return <nav className="meal-navigation" aria-label="Navegação principal">
    <ExpandableTabs tabs={tabs} persistentLabels activeIndex={plannerOpen ? 1 : destination}
      onChange={navigate} activeColor="text-accent" className="meal-navigation-glass" />
  </nav>;
}

const root = document.getElementById("meal-navigation");
if (root) createRoot(root).render(<MealNavigation />);
const themeRoot = document.getElementById("theme-toggle");
if (themeRoot) createRoot(themeRoot).render(<ThemeToggle />);
const pwaRoot = document.getElementById("pwa-status");
if (pwaRoot) createRoot(pwaRoot).render(<PwaStatus />);
const screenRoot = document.getElementById("meal-screens");
if (screenRoot) createRoot(screenRoot).render(<PreviewScreens />);
const brandRoot = document.getElementById("preview-brand");
if (brandRoot) createRoot(brandRoot).render(<PreviewLogo />);
const detailIcons = { "toggle-icon": I.chevUp, "clear-icon": I.trash, "close-icon": I.x, "back-icon": I.chevLeft, "next-icon": I.chevLeft, "generate-icon": I.plan };
for (const [id, Icon] of Object.entries(detailIcons)) { const element = document.getElementById(id); if (element) createRoot(element).render(<Icon size={16} />); }
const modeIcons = { "mode-cook-icon": Utensils, "mode-ready-icon": ShoppingBag };
for (const [id, Icon] of Object.entries(modeIcons)) { const element = document.getElementById(id); if (element) createRoot(element).render(<Icon size={21} strokeWidth={1.9} />); }
