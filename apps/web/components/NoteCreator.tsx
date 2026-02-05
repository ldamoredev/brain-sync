'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface NoteCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onNoteCreated: () => void;
}

export default function NoteCreator({ isOpen, onClose, onNoteCreated }: NoteCreatorProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        throw new Error('Failed to save note');
      }
      
      setContent('');
      onNoteCreated(); // Trigger the callback to refresh the note list
      onClose(); // Close modal on success
    } catch (error) {
      console.error(error);
      // Here you could show an error message to the user
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-zinc-900 rounded-xl p-6 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Create a New Note</h2>
              <button onClick={onClose} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Write your note here..."
              />
              <div className="flex justify-end mt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
