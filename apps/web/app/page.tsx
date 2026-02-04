import ChatInterface from '@/components/ChatInterface';
import Sidebar from '@/components/Sidebar'; // Lo crearemos en el siguiente paso

export default function Home() {
    return (
        <main className="flex h-screen overflow-hidden bg-zinc-950 text-white">
            {/* Background sutil */}
            <div className="fixed inset-0 z-[-1] opacity-30 bg-[radial-gradient(circle_at_50%_50%,#1a1a1a_0%,#000_100%)]" />

            {/* Sidebar de navegación - lo implementaremos luego */}
            <Sidebar />

            {/* Área principal del chat */}
            <div className="flex-1 flex flex-col">
                <ChatInterface />
            </div>
        </main>
    );
}