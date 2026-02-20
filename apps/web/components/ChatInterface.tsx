'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Brain, User, Sparkles, Terminal, Layers, ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { createParser, type EventSourceMessage } from 'eventsource-parser';

// ✅ Stable id per message — prevents React from re-rendering all messages
// on every token append (previously used array index as key)
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    // ✅ isFaithful is now stored per message and shown in the UI
    // Previously the eval event was received and silently console.logged
    isFaithful?: boolean;
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

    // ✅ Replaced EventSource with fetch + eventsource-parser
    //
    // Why: EventSource only supports GET, forcing the prompt into the URL
    // which has a ~2000 char browser limit. Using fetch + POST allows a JSON
    // body with no size constraints.
    //
    // eventsource-parser handles the SSE buffer chunking internally —
    // the same logic we'd otherwise write manually (split on \n\n, keep
    // incomplete frames, regex for event/data fields).
    async function streamChat(prompt: string) {
        setIsLoading(true);

        setHistory(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant', content: '' },
        ]);

        const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!res.ok || !res.body) {
            setIsLoading(false);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        // createParser handles all buffer + frame parsing
        // v3 API: takes a ParserCallbacks object { onEvent } instead of a bare function
        // onEvent only fires for actual data events — comment lines (': ping') are ignored automatically
        const parser = createParser({
            onEvent(event: EventSourceMessage) {
                // ✅ data is always a JSON object now (fixed in ChatController)
                // Previously token sent a raw string primitive: data: "Hello"
                // Now it sends an object:                       data: {"content":"Hello"}
                const data = JSON.parse(event.data);

                if (event.event === 'token') {
                    setHistory(prev => {
                        const last = prev[prev.length - 1];
                        if (!last || last.role !== 'assistant') return prev;
                        return [
                            ...prev.slice(0, -1),
                            { ...last, content: last.content + data.content },
                        ];
                    });
                } else if (event.event === 'meta') {
                    setSources(data.sources ?? []);
                } else if (event.event === 'eval') {
                    // ✅ isFaithful stored on the message and rendered as a badge
                    setHistory(prev => {
                        const last = prev[prev.length - 1];
                        if (!last) return prev;
                        return [...prev.slice(0, -1), { ...last, isFaithful: data.isFaithful }];
                    });
                } else if (event.event === 'done' || event.event === 'error') {
                    setIsLoading(false);
                }
            },
        });

        // Feed raw byte chunks into the parser — it handles incomplete frames
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            parser.feed(decoder.decode(value, { stream: true }));
        }

        setIsLoading(false);
    }

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        setSources([]);
        setHistory(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: 'user', content: input },
        ]);

        const prompt = input;
        setInput('');

        streamChat(prompt);
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
                        <h2 className="font-bold text-zinc-100">Inteligencia Artificial</h2>
                        <p className="text-xs text-zinc-500">Ollama Engine: Phi-3 Mini</p>
                    </div>
                </div>
                <Layers className="text-zinc-400" />
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-8 space-y-8">
                <AnimatePresence>
                    {history.map((msg, idx) => (
                        // ✅ key={msg.id} instead of key={idx}
                        // Stable keys prevent React from re-rendering all previous messages
                        // on every token append during streaming
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn('flex gap-4', msg.role === 'user' && 'flex-row-reverse')}
                        >
                            <div className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                msg.role === 'user'
                                    ? 'bg-zinc-100 text-zinc-900'
                                    : 'bg-purple-600/10 text-purple-400'
                            )}>
                                {msg.role === 'user' ? <User size={20} /> : <Brain size={20} />}
                            </div>

                            <div className={cn(
                                'max-w-[80%] px-5 py-3.5 rounded-2xl',
                                msg.role === 'user'
                                    ? 'bg-zinc-800 text-zinc-100'
                                    : 'bg-zinc-900/40 border border-zinc-800/50 text-zinc-300'
                            )}>
                                <article className="prose prose-invert">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </article>

                                {/* ✅ Streaming cursor — visible while tokens are arriving
                                    Disappears once isLoading is false or it's not the last message */}
                                {isLoading && idx === history.length - 1 && msg.role === 'assistant' && (
                                    <span className="inline-block w-[2px] h-4 bg-purple-400 animate-pulse ml-0.5 align-middle" />
                                )}

                                {/* ✅ Faithfulness badge — rendered from the eval event
                                    Previously this data was received but only console.logged */}
                                {msg.role === 'assistant' && msg.isFaithful !== undefined && (
                                    <div className="mt-2 flex items-center gap-1.5">
                                        {msg.isFaithful ? (
                                            <>
                                                <ShieldCheck size={12} className="text-green-400" />
                                                <span className="text-[10px] text-green-400">Verificado</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldAlert size={12} className="text-yellow-400" />
                                                <span className="text-[10px] text-yellow-400">No verificado</span>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Sources */}
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

                {/* Pensando spinner — only shown before the first token arrives */}
                {isLoading &&
                    history[history.length - 1]?.role === 'assistant' &&
                    history[history.length - 1]?.content === '' && (
                        <div className="flex justify-center items-center p-4">
                            <div className="flex items-center gap-2 text-zinc-500">
                                <Sparkles className="animate-pulse" />
                                <span>Pensando...</span>
                            </div>
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
                    className="bg-zinc-100 text-zinc-900 px-4 rounded-xl disabled:opacity-50"
                >
                    <Send />
                </button>
            </form>
        </div>
    );
}