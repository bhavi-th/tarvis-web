import React, { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
import ReactMarkdown from "react-markdown";
import "./App.css";
import { useVoiceHandler } from "./VoiceHandler";

let socket;

function App() {
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState(["[SYSTEM]: TARVIS_CORE_LINK_ESTABLISHED"]);
  const [stats, setStats] = useState({
    cpu: "0%",
    ram: "0/0 GiB",
    status: "STABLE",
  });
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [isVocalUplinkEnabled, setIsVocalUplinkEnabled] = useState(false);

  const scrollRef = useRef(null);
  const sendMessageRef = useRef(null);
  const wasVocalEnabledRef = useRef(false);
  const micLockRef = useRef(false);

  const cleanTextForSpeech = (text) => {
    return text
      .replace(/\[\[EXEC:.*?\]\]/g, "")
      .replace(/\[TARVIS\]:/g, "")
      .replace(/[*#_`~]/g, "")
      .trim();
  };

  const sendMessage = useCallback(
    (message) => {
      const cleanMessage = message?.trim();
      if (!cleanMessage || isThinking) return;

      micLockRef.current = true;
      wasVocalEnabledRef.current = isVocalUplinkEnabled;

      setIsVocalUplinkEnabled(false);
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsThinking(true);

      socket.emit("user_message", cleanMessage);
      setLogs((prev) => [...prev, `[USER]: ${cleanMessage}`]);
      setInput("");
    },
    [isThinking, isVocalUplinkEnabled, setIsVocalUplinkEnabled],
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const { isListening } = useVoiceHandler(
    setInput,
    isThinking,
    isSpeaking,
    useCallback((finalText) => {
      if (!micLockRef.current && sendMessageRef.current) {
        sendMessageRef.current(finalText);
      }
    }, []),
    isVocalUplinkEnabled,
    setIsVocalUplinkEnabled,
  );

  const speak = useCallback(
    (text) => {
      if (!window.speechSynthesis) return;

      micLockRef.current = true;
      setIsSpeaking(true);
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text));
      utterance.rate = 1.0;
      utterance.pitch = 0.8;

      const handleSpeechEnd = () => {
        setTimeout(() => {
          setIsSpeaking(false);
          micLockRef.current = false;
          if (wasVocalEnabledRef.current) {
            setIsVocalUplinkEnabled(true);
          }
        }, 500);
      };

      utterance.onstart = () => {
        console.log("Speaking : ", text);
      };
      utterance.onend = () => {
        console.log("Stopped speaking : ", text);
        handleSpeechEnd();
      };
      utterance.onerror = () => {
        console.log("Erorr speaking : ", text);
        handleSpeechEnd();
      };

      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 100);
    },
    [setIsVocalUplinkEnabled],
  );

  useEffect(() => {
    if (!socket) {
      socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000");
    }

    const handleChunk = (chunk) => {
      setLogs((prev) => {
        const lastLog = prev[prev.length - 1];
        if (lastLog && lastLog.startsWith("[TARVIS]:")) {
          const newLogs = [...prev];
          newLogs[newLogs.length - 1] = lastLog + chunk;
          return newLogs;
        } else {
          return [...prev, `[TARVIS]: ${chunk}`];
        }
      });
    };

    const handleDone = () => {
      setIsSpeaking(true);
      setIsThinking(false);

      // Access the latest logs to speak the completed message
      setLogs((currentLogs) => {
        const lastLog = currentLogs[currentLogs.length - 1];
        if (lastLog && lastLog.startsWith("[TARVIS]:")) {
          speak(lastLog);
        } else {
          setIsSpeaking(false);
        }
        return currentLogs;
      });
    };

    const handleReply = () => setIsThinking(false);
    const handleLog = (message) => setLogs((prev) => [...prev, message]);
    const handleUpdate = (data) => setStats((prev) => ({ ...prev, ...data }));

    socket.on("tarvis_reply", handleReply);
    socket.on("tarvis_chunk", handleChunk);
    socket.on("tarvis_done", handleDone);
    socket.on("new_log", handleLog);
    socket.on("system_update", handleUpdate);

    return () => {
      socket.off("tarvis_reply", handleReply);
      socket.off("tarvis_chunk", handleChunk);
      socket.off("tarvis_done", handleDone);
      socket.off("new_log", handleLog);
      socket.off("system_update", handleUpdate);
    };
  }, [speak]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="hud-root">
      <div className="scanline"></div>
      <header className="hud-header">
        <div className="system-id">
          <span className="blink">●</span> TARVIS (ARCH_LINUX_OPTIMIZED)
        </div>
        <div className="node-id">
          // Terminal Authorized Responsive Vocal Integrated System
        </div>
      </header>

      <div className="hud-grid">
        <aside className="vitals-sidebar">
          <div className="stat-module">
            <label>CPU_LOAD</label>
            <div className="stat-value">{stats.cpu}</div>
            <div className="progress-bg">
              <div className="progress-bar" style={{ width: stats.cpu }}></div>
            </div>
          </div>
          <div className="stat-module">
            <label>MEM_RESIDENT</label>
            <div className="stat-value">{stats.ram}</div>
          </div>
        </aside>

        <main className="terminal-container">
          <div className="terminal-window-header">
            <span className="dot red"></span>
            <span className="dot yellow"></span>
            <span className="dot green"></span>
            <span className="window-title">tarvis@arch:~</span>
          </div>

          <div className="terminal-output" ref={scrollRef}>
            {logs.map((log, i) => (
              <div
                key={i}
                className={`log-line ${log.startsWith("[TARVIS]") ? "ai" : ""}`}
              >
                <ReactMarkdown
                  components={{
                    strong: ({ ...props }) => (
                      <span className="terminal-bold" {...props} />
                    ),
                    code: ({ ...props }) => (
                      <code className="terminal-code" {...props} />
                    ),
                    p: ({ children, ...props }) => {
                      const cleanChildren = React.Children.map(
                        children,
                        (child) => {
                          if (typeof child === "string")
                            return child.replace(/\[\[EXEC:.*?\]\]/g, "");
                          return child;
                        },
                      );
                      return <p {...props}>{cleanChildren}</p>;
                    },
                  }}
                >
                  {log}
                </ReactMarkdown>
              </div>
            ))}
            {isThinking && (
              <div className="log-line ai">
                PROCESSING_INSTRUCTION...<span className="blink">_</span>
              </div>
            )}
          </div>

          <form
            className={`terminal-input-zone ${isListening ? "voice-active" : ""}`}
            onSubmit={handleSubmit}
          >
            <span className={`prompt ${isListening ? "blink-red" : ""}`}>
              {isListening ? "🎤" : "❯"}
            </span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isThinking
                  ? "ANALYZING..."
                  : isVocalUplinkEnabled
                    ? "LISTENING..."
                    : "Awaiting command..."
              }
              autoFocus
              autoComplete="off"
              spellCheck="false"
              disabled={isThinking}
            />
            <button
              type="button"
              className={`voice-toggle-btn ${isVocalUplinkEnabled ? "enabled" : "disabled"}`}
              onClick={() => setIsVocalUplinkEnabled(!isVocalUplinkEnabled)}
            >
              {isVocalUplinkEnabled ? "V_ON" : "V_OFF"}
            </button>
          </form>
        </main>
      </div>

      <footer className="hud-footer">
        <div className="coord">SEC_ZONE: BENGALURU_IN</div>
        <div className="time">{new Date().toLocaleTimeString()}</div>
      </footer>
    </div>
  );
}

export default App;
