'use client';

import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Mic, Square } from 'lucide-react';

interface NoteCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onNoteCreated: () => void;
}

export default function NoteCreator({ isOpen, onClose, onNoteCreated }: NoteCreatorProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await handleTranscription(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Transcription failed');

      const data = await response.json();
      if (data.text) {
        setContent(prev => (prev ? prev + ' ' + data.text : data.text));
      }
    } catch (error) {
      console.error('Transcription error:', error);
      alert('Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

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
              <div className="relative">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  placeholder={isRecording ? "Listening..." : "Write your note here..."}
                  disabled={isRecording || isTranscribing}
                />
                
                {/* Recording Indicator Overlay */}
                {isRecording && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg backdrop-blur-sm">
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center"
                    >
                      <div className="w-8 h-8 bg-red-500 rounded-full" />
                    </motion.div>
                  </div>
                )}

                {/* Transcribing Overlay */}
                {isTranscribing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-zinc-300">Transcribing...</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-4">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing || isSubmitting}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    isRecording 
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square size={18} fill="currentColor" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic size={18} />
                      Voice Note
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || isRecording || isTranscribing || !content.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
