
import { useState, useEffect, useCallback, useRef } from 'react';
import { TTS_DELAY, TTS_RATE } from '../constants';

interface TTSHook {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
}

const useTTS = (): TTSHook => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef<string[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    } else {
      console.warn('Text-to-Speech not supported in this browser.');
    }

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const processQueue = useCallback(() => {
    if (!synthRef.current || isSpeaking || queueRef.current.length === 0) {
      return;
    }

    const textToSpeak = queueRef.current.shift();
    if (textToSpeak) {
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      currentUtteranceRef.current = utterance;
      utterance.rate = TTS_RATE; 
      // utterance.voice = ... // Optionally set voice
      
      utterance.onend = () => {
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
        setTimeout(processQueue, TTS_DELAY * 1000); 
      };
      utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
        setTimeout(processQueue, TTS_DELAY * 1000); 
      };
      synthRef.current.speak(utterance);
    }
  }, [isSpeaking]);

  useEffect(() => {
    processQueue();
  }, [isSpeaking, processQueue]);

  const speak = useCallback((text: string) => {
    if (!synthRef.current || !text) {
      console.log(`TTS (disabled or no text): ${text}`);
      return;
    }
    queueRef.current.push(text);
    processQueue();
  }, [processQueue]);

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    queueRef.current = [];
    setIsSpeaking(false);
    currentUtteranceRef.current = null;
  }, []);

  return { speak, stop, isSpeaking };
};

export default useTTS;
    