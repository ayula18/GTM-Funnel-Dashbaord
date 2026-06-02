'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Filter,
  Upload,
  Database,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Funnels', href: '/funnels', icon: Filter },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Master List', href: '/master-list', icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="fixed inset-y-0 left-0 w-[260px] bg-card border-r border-border flex flex-col z-50">
      <div className="flex items-center gap-3 px-6 h-16 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
          <Target className="w-5 h-5" />
        </div>
        <span className="font-semibold text-lg tracking-tight">ICP Dashboard</span>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary/10 text-primary relative" 
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
              )}
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-6 border-t border-border">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          Reo.Dev GTM Engine
        </div>
      </div>
    </div>
  );
}
