import React from 'react';

export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface TabBarProps<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}

export function TabBar<T extends string>({ tabs, active, onChange, className = '' }: TabBarProps<T>) {
  return (
    <div className={`flex border-b-2 border-stone-200 dark:border-stone-700 ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors -mb-0.5 ${
            active === tab.id
              ? 'border-b-2 border-stone-800 dark:border-stone-300 text-stone-900 dark:text-stone-100'
              : 'border-b-2 border-transparent text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
