'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Note } from '@brain-sync/types';
import ReactMarkdown from 'react-markdown';

interface NoteViewerProps {
  note: Note | null;
  onClose: () => void;
}

export default function NoteViewer({ note, onClose }: NoteViewerProps) {
  return (
    <AnimatePresence>
      {note && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-zinc-900 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Note Details</h2>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2">
              <article className="prose prose-invert">
                <ReactMarkdown>{note.content}</ReactMarkdown>
              </article>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
