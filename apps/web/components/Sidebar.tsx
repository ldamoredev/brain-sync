'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Brain, FileText, PlusCircle, Settings, LogOut } from 'lucide-react';
import NoteCreator from './NoteCreator';
import NoteViewer from './NoteViewer';
import { Note } from '@brain-sync/types';

export default function Sidebar() {
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const fetchNotes = async () => {
    try {
      const res = await fetch('/api/notes');
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch (error) {
      console.error('Failed to fetch notes', error);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const handleNoteCreated = () => {
    fetchNotes();
  };

  const handleNoteClick = async (noteId: string) => {
    try {
      const res = await fetch(`/api/notes/${noteId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedNote(data);
      }
    } catch (error) {
      console.error('Failed to fetch note details', error);
    }
  };

  return (
    <>
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col p-4">
        <div className="flex items-center gap-3 mb-8 px-2 py-3 rounded-lg bg-zinc-800/50">
          <Brain size={24} className="text-purple-400" />
          <span className="text-lg font-bold text-purple-300">Brain Sync</span>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto">
          <div className="px-4 py-2 text-xs text-zinc-500 font-semibold uppercase">My Notes</div>
          {notes.map(note => (
            <button
              key={note.id}
              onClick={() => handleNoteClick(note.id)}
              className="w-full text-left block px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg truncate"
            >
              {note.content}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-zinc-800 pt-4">
          <button
            onClick={() => setIsCreatorOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-200 hover:bg-zinc-700 transition-colors duration-200 group"
          >
            <PlusCircle size={20} className="text-zinc-400 group-hover:text-white" />
            <span className="font-medium">Nueva Nota</span>
          </button>
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
      <NoteCreator isOpen={isCreatorOpen} onClose={() => setIsCreatorOpen(false)} onNoteCreated={handleNoteCreated} />
      <NoteViewer note={selectedNote} onClose={() => setSelectedNote(null)} />
    </>
  );
}
