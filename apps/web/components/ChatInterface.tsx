'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send,
    Brain,
    User,
    Sparkles,
    Terminal,
    Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const META_REGEX = new RegExp('<<META>>([\\s\\S]*?)<</META>>');

function extractMeta(text: string) {
    const match = text.match(META_REGEX);
    if (!match) return null;

    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

function stripMeta(text: string) {
    return text.replace(META_REGEX, '').trim();
}

export default function ChatInterface() {
    const [history, setHistory] = useState<Message[]>([]);
    const [sources, setSources] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [history]);

    async function streamChat(prompt: string) {
        setIsLoading(true);

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!res.body) {
            setIsLoading(false);
            throw new Error('No stream body');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';

        setHistory(prev => [...prev, { role: 'assistant', content: '' }]);

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const meta = extractMeta(buffer);
            if (meta) {
                setSources(meta.sources || meta);
                buffer = stripMeta(buffer);
            }

            setHistory(prev => {
                const last = prev[prev.length - 1];
                if (!last || last.role !== 'assistant') return prev;

                return [
                    ...prev.slice(0, -1),
                    { role: 'assistant', content: buffer },
                ];
            });
        }

        setIsLoading(false);
    }

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        setSources([]);
        setHistory(prev => [...prev, { role: 'user', content: input }]);

        const prompt = input;
        setInput('');

        await streamChat(prompt);
    };

    return (
        <div className="flex flex-col min-h-screen max-w-5xl mx-auto w-full px-6">
            {/* Header */}
            <header className="flex items-center justify-between py-6 border-b border-zinc-800/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Brain className="text-purple-500" size={24} />
                    </div>
                    <div>
                        <h2 className="font-bold text-zinc-100">Brain Sync Session</h2>
                        <p className="text-xs text-zinc-500">
                            Ollama Engine: Phi-3 Mini
                        </p>
                    </div>
                </div>
                <Layers className="text-zinc-400" />
            </header>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-8 space-y-8"
            >
                <AnimatePresence>
                    {history.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                'flex gap-4',
                                msg.role === 'user' && 'flex-row-reverse'
                            )}
                        >
                            <div className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center',
                                msg.role === 'user'
                                    ? 'bg-zinc-100 text-zinc-900'
                                    : 'bg-purple-600/10 text-purple-400'
                            )}>
                                {msg.role === 'user'
                                    ? <User size={20} />
                                    : <Brain size={20} />}
                            </div>

                            <div className={cn(
                                'max-w-[80%] px-5 py-3.5 rounded-2xl',
                                msg.role === 'user'
                                    ? 'bg-zinc-800 text-zinc-100'
                                    : 'bg-zinc-900/40 border border-zinc-800/50 text-zinc-300'
                            )}>
                                <pre className="whitespace-pre-wrap font-sans">
                                    {msg.content}
                                </pre>

                                {msg.role === 'assistant' &&
                                    idx === history.length - 1 &&
                                    sources.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-zinc-800/50">
                                            <div className="flex gap-2 text-xs text-purple-400 mb-2">
                                                <Terminal size={14} />
                                                CONTEXTO RECUPERADO
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {sources.map((s: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        className="px-2 py-1 bg-zinc-800/50 rounded text-[10px]"
                                                    >
                                                        Nota #{s.id?.slice(0, 4)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isLoading && (
                    <div className="flex gap-4 opacity-60">
                        <Sparkles className="animate-pulse" />
                        Pensando…
                    </div>
                )}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} className="py-6 flex gap-4">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100"
                    placeholder="Escribí tu pregunta…"
                />
                <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-zinc-100 text-zinc-900 px-4 rounded-xl"
                >
                    <Send />
                </button>
            </form>
        </div>
    );
}
