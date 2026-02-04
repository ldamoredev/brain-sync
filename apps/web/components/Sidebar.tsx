// apps/web/src/components/Sidebar.tsx
import { Brain, FileText, PlusCircle, Settings, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function Sidebar() {
    return (
        <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col p-4">
            <div className="flex items-center gap-3 mb-8 px-2 py-3 rounded-lg bg-zinc-800/50">
                <Brain size={24} className="text-purple-400" />
                <span className="text-lg font-bold text-purple-300">Brain Sync</span>
            </div>

            <nav className="flex-1 space-y-2">
                <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-200 hover:bg-zinc-700 transition-colors duration-200 group">
                    <FileText size={20} className="text-zinc-400 group-hover:text-white" />
                    <span className="font-medium">Mis Notas</span>
                </Link>
                <Link href="/notes/new" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-200 hover:bg-zinc-700 transition-colors duration-200 group">
                    <PlusCircle size={20} className="text-zinc-400 group-hover:text-white" />
                    <span className="font-medium">Nueva Nota</span>
                </Link>
            </nav>

            <div className="mt-auto space-y-2 border-t border-zinc-800 pt-4">
                <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors duration-200 group">
                    <Settings size={20} className="group-hover:text-white" />
                    <span>Ajustes</span>
                </Link>
                <button className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-red-400 hover:bg-zinc-800 transition-colors duration-200 group">
                    <LogOut size={20} className="group-hover:text-red-300" />
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </aside>
    );
}