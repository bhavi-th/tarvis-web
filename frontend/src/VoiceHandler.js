import { useState, useEffect} from "react";

export const useVoiceHandler = (setInput, isThinking) => {
  const [isListening, setIsListening] = useState(false);
  const [isVocalUplinkEnabled, setIsVocalUplinkEnabled] = useState(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    if (isVocalUplinkEnabled && !isThinking) {
      recognition.start();
    } else {
      recognition.stop();
    }

    return () => recognition.stop();
  }, [isVocalUplinkEnabled, isThinking, setInput]);

  return { isListening, isVocalUplinkEnabled, setIsVocalUplinkEnabled };
};
