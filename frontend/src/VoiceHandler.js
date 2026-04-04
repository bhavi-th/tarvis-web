import { useState, useEffect, useRef } from "react";

export const useVoiceHandler = (
  setInput,
  isThinking,
  isSpeaking,
  onFinalTranscript,
  isVocalUplinkEnabled,
  setIsVocalUplinkEnabled,
) => {
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const terminateAllVoiceInternal = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onstart = null;
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log(e);
        }
      }
      setIsListening(false);
    };
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "en-IN";
    }

    const recognition = recognitionRef.current;

    recognition.onstart = () => setIsListening(true);

    recognition.onend = () => {
      setIsListening(false);

      if (isThinking || isSpeaking || !isVocalUplinkEnabled) {
        return;
      }

      if (isVocalUplinkEnabled) {
        timerRef.current = setTimeout(() => {
          if (isVocalUplinkEnabled && !isThinking && !isSpeaking) {
            try {
              recognition.start();
            } catch (e) {
              console.log(e);
            }
          }
        }, 500);
      }
    };

    recognition.onresult = (event) => {
      if(isSpeaking || isThinking) return;

      let transcript = "";
      let isFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }

      if (transcript.toLowerCase().includes("stop")) {
        setIsVocalUplinkEnabled(!isVocalUplinkEnabled);
        terminateAllVoiceInternal();
        return;
      }

      setInput(transcript);

      if (isFinal && onFinalTranscript) {
        onFinalTranscript(transcript);
      }
    };

    if (isVocalUplinkEnabled) {
      try {
        recognition.start();
      } catch (e) {
        console.log(e);
      }
    } else {
      terminateAllVoiceInternal();
    }

    return () => terminateAllVoiceInternal();
  }, [
    isVocalUplinkEnabled,
    setIsVocalUplinkEnabled,
    isThinking,
    setInput,
    onFinalTranscript,
    isSpeaking,
  ]);

  return { isListening, isVocalUplinkEnabled, setIsVocalUplinkEnabled };
};
