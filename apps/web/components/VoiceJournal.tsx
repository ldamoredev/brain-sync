'use client';

import { useState, useRef } from 'react';

export function VoiceJournal() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = handleStop;
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setTranscription(null);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Stop all tracks to release the microphone
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleStop = async () => {
    setIsProcessing(true);
    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
    
    const formData = new FormData();
    // IMPORTANT: The field name 'audio' must match upload.single('audio') in the backend
    formData.append('audio', audioBlob, 'journal_entry.webm');

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Transcription failed');

      const data = await response.json();
      setTranscription(data.transcription);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to transcribe audio.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white dark:bg-zinc-900">
      <h3 className="text-lg font-semibold mb-4">Voice Journal</h3>
      
      <div className="flex gap-4 mb-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Start Recording'}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 animate-pulse"
          >
            Stop Recording
          </button>
        )}
      </div>

      {transcription && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded-md">
          <p className="text-sm text-gray-500 mb-1">Transcription:</p>
          <p className="text-gray-900 dark:text-gray-100">{transcription}</p>
        </div>
      )}
    </div>
  );
}