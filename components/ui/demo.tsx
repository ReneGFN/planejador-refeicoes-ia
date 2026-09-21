import { Bell, House, CircleHelp, Settings, Shield, Mail, User, FileText, Lock } from "lucide-react";
import { ExpandableTabs, type TabItem } from "@/components/ui/expandable-tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function DefaultToggle() {
  return <div className="space-y-2 text-center"><div className="flex justify-center"><ThemeToggle /></div></div>;
}

export function DefaultDemo() {
  const tabs: TabItem[] = [
    { title: "Dashboard", icon: House }, { title: "Notifications", icon: Bell },
    { type: "separator" }, { title: "Settings", icon: Settings },
    { title: "Support", icon: CircleHelp }, { title: "Security", icon: Shield },
  ];
  return <div className="flex flex-col gap-4"><ExpandableTabs tabs={tabs} /></div>;
}

export function CustomColorDemo() {
  const tabs: TabItem[] = [
    { title: "Profile", icon: User }, { title: "Messages", icon: Mail },
    { type: "separator" }, { title: "Documents", icon: FileText }, { title: "Privacy", icon: Lock },
  ];
  return <div className="flex flex-col gap-4"><ExpandableTabs tabs={tabs}
    activeColor="text-blue-500" className="border-blue-200 dark:border-blue-800" /></div>;
}
