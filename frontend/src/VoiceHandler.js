import { useEffect, useRef, useState } from 'react';

/**
 * TARVIS Vocal Uplink: Direct Stream Edition
 * Continuous mapping of voice to text with a "Hard Terminate" safety.
 */
export const useVoiceHandler = (setInput, isThinking) => {
  const [isListening, setIsListening] = useState(true); // Always active by default
  const [isVocalUplinkEnabled, setIsVocalUplinkEnabled] = useState(true);
  
  const recognitionRef = useRef(null);
  const activeRef = useRef(true); 
  const isThinkingRef = useRef(isThinking);

  // Sync isThinking status to prevent Tarvis from hearing himself
  useEffect(() => { 
    isThinkingRef.current = isThinking; 
  }, [isThinking]);

  useEffect(() => {
    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognition) return;

    const streamEngine = () => {
      if (!activeRef.current) return;

      const recognition = new SpeechRecognition();
      
      // CONFIG: Continuous capture with real-time interim results
      recognition.continuous = false; // False + onend loop is safer for CPU than true
      recognition.interimResults = true; 
      recognition.lang = 'en-IN';

      recognition.onresult = (event) => {
        if (isThinkingRef.current || !activeRef.current) return;

        const results = Array.from(event.results);
        const transcript = results[results.length - 1][0].transcript.toLowerCase().trim();

        // --- THE TERMINATE PROTOCOL ---
        if (transcript.includes("terminate")) {
          console.log("[CRITICAL]: COMMAND_TERMINATE_DETECTED // SHUTTING_DOWN");
          activeRef.current = false; 
          setIsVocalUplinkEnabled(false);
          setIsListening(false);
          
          if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
          }
          return;
        }

        // --- DIRECT MAPPING ---
        // Every word detected is pushed to the main input field immediately
        setInput(results[results.length - 1][0].transcript);
      };

      recognition.onend = () => {
        // Immediate restart to maintain the "Always Listening" feel
        if (activeRef.current) {
          setTimeout(() => {
            if (activeRef.current) streamEngine();
          }, 5000);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        console.error(`[SYSTEM_ERROR]: ${event.error}`);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {console.log(e);}
    };

    activeRef.current = true;
    streamEngine();

    return () => {
      activeRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, [setInput]);

  return { isListening, setIsListening, isVocalUplinkEnabled, setIsVocalUplinkEnabled };
};
