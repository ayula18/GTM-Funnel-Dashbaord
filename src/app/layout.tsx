import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Sidebar } from '@/components/sidebar';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'ICP Dashboard — Reo.Dev',
  description: 'GTM Pipeline and ICP classification',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground flex min-h-screen`}>
        <TooltipProvider>
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 ml-[260px] min-h-screen">
            {children}
          </main>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
