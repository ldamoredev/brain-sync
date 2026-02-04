import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils'; // Necesitarás este archivo
import { ThemeProvider } from '@/components/ThemeProvider';
import React from 'react'; // Y este

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Brain Sync AI',
    description: 'Your AI-powered Second Brain',
};

export default function RootLayout({ children, }: Readonly<{ children: React.ReactNode; }>) {
    return (
        <html lang="en" suppressHydrationWarning>
        <body className={cn(
            'min-h-screen bg-background font-sans antialiased dark', // Forzamos dark mode
            inter.className,
        )}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            {children}
        </ThemeProvider>
        </body>
        </html>
    );
}