'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Filter,
  Upload,
  Database,
  Target,
  Megaphone,
  BarChart3,
  MessageSquareText,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavSection {
  label: string;
  icon: React.ElementType;
  items: { name: string; href: string; icon: React.ElementType }[];
}

const sections: NavSection[] = [
  {
    label: 'GTM Dashboard',
    icon: Target,
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Funnels', href: '/funnels', icon: Filter },
      { name: 'Categorization', href: '/categorization', icon: Target },
      { name: 'Upload', href: '/upload', icon: Upload },
      { name: 'Master List', href: '/master-list', icon: Database },
    ],
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    items: [
      { name: 'Overview', href: '/marketing', icon: BarChart3 },
      { name: 'Campaigns', href: '/marketing/campaigns', icon: Megaphone },
      { name: 'Comment Intel', href: '/marketing/comments', icon: MessageSquareText },
      { name: 'Already Customer', href: '/marketing/customers', icon: Database },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  // Determine which section is active based on current path
  const getActiveSection = () => {
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].items.some(item =>
        item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
      )) return i;
    }
    return 0;
  };

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Auto-expand the active section on mount and path change
  useEffect(() => {
    const activeIdx = getActiveSection();
    setExpanded(prev => ({ ...prev, [activeIdx]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleSection = (idx: number) => {
    setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="fixed inset-y-0 left-0 w-[260px] bg-card border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
          <Target className="w-5 h-5" />
        </div>
        <span className="font-semibold text-lg tracking-tight">Reo.Dev Engine</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
        {sections.map((section, sIdx) => {
          const isExpanded = expanded[sIdx] ?? false;
          const sectionActive = section.items.some(item =>
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          );

          return (
            <div key={section.label}>
              {/* Section header */}
              <button
                onClick={() => toggleSection(sIdx)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors",
                  sectionActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <section.icon className="w-4 h-4" />
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 transition-transform duration-200",
                    isExpanded ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>

              {/* Section items */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  isExpanded ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="ml-3 pl-3 border-l border-border/50 space-y-0.5 py-1">
                  {section.items.map((item) => {
                    const isActive = item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href);

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        )}
                      >
                        <item.icon className="w-3.5 h-3.5" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Settings + Footer */}
      <div className="border-t border-border">
        <div className="px-3 py-2">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              pathname === '/settings'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
        </div>
        <div className="px-6 py-3 border-t border-border">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Reo.Dev GTM Engine
          </div>
        </div>
      </div>
    </div>
  );
}
