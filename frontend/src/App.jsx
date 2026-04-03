import React, { useState, useEffect, useRef } from "react";
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

  // Integrate Voice Hook with Toggle States
  const { 
    isListening, 
    isVocalUplinkEnabled, 
    setIsVocalUplinkEnabled 
  } = useVoiceHandler(setInput, isThinking);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (!socket) {
      socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5000");
    }

    const handleReply = (reply) => {
      setLogs((prev) => [...prev, `[TARVIS]: ${reply}`]);
      setIsThinking(false);
    };

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
      setIsThinking(false);
    };

    const handleLog = (message) => {
      setLogs((prev) => [...prev, message]);
    };

    const handleUpdate = (data) => {
      setStats((prev) => ({ ...prev, ...data }));
    };

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
  }, []);

  // Auto-scroll logic for terminal output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;

    setIsThinking(true);
    socket.emit("user_message", input);
    setLogs((prev) => [...prev, `[USER]: ${input}`]);
    setInput("");
  };

  return (
    <div className="hud-root">
      <div className="scanline"></div>

      <header className="hud-header">
        <div className="system-id">
          <span className="blink">●</span> TARVIS (ARCH_LINUX_OPTIMIZED)
        </div>
        <div className="node-id">// Terminal Authorized Responsive Vocal Integrated System</div>
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
                          if (typeof child === "string") {
                            return child.replace(/\[\[EXEC:.*?\]\]/g, "");
                          }
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
                  ? "ANALYZING_SYSTEM_PARAMETERS..."
                  : isVocalUplinkEnabled
                    ? "LISTENING_FOR_COMMAND..."
                    : "Awaiting your command, Sir."
              }
              autoFocus
              autoComplete="off"
              spellCheck="false"
              disabled={isThinking}
            />

            {/* Hardware Override Button */}
            <button
              type="button"
              className={`voice-toggle-btn ${isVocalUplinkEnabled ? "enabled" : "disabled"}`}
              onClick={() => setIsVocalUplinkEnabled(!isVocalUplinkEnabled)}
              title={isVocalUplinkEnabled ? "Terminate Voice Logic" : "Initialize Voice Logic"}
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
