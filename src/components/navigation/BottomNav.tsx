"use client";

import type { LucideIcon } from "lucide-react";

export type TabKey = "calendar" | "standings" | "chessboard" | "statistics" | "profile" | "admin";

export type BottomTab = {
  key: TabKey;
  label: string;
  icon: LucideIcon;
};

export function BottomNav({ tabs, activeTab, onChange }: { tabs: BottomTab[]; activeTab: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => onChange(tab.key)} aria-label={tab.label}>
            <Icon size={20} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
