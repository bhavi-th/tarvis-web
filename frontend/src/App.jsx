import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import ReactMarkdown from 'react-markdown';
import "./App.css";

// Connect to the Node.js relay server
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
  const scrollRef = useRef(null);

  useEffect(() => {
    // Initialize socket only once
    if (!socket) {
      socket = io("http://localhost:5000");
    }

    const handleReply = (reply) => {
      setLogs((prev) => [...prev, `[TARVIS]: ${reply}`]);
      setIsThinking(false);
    };

    const handleLog = (message) => {
      setLogs((prev) => [...prev, message]);
    };

    const handleUpdate = (data) => {
      setStats((prev) => ({ ...prev, ...data }));
    };

    socket.on("tarvis_reply", handleReply);
    socket.on("new_log", handleLog);
    socket.on("system_update", handleUpdate);

    return () => {
      socket.off("tarvis_reply", handleReply);
      socket.off("new_log", handleLog);
      socket.off("system_update", handleUpdate);
    };
  }, []);

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
          <span className="blink">●</span> TARVIS (Optimized to interact with os)
        </div>
        <div className="node-id">NODE_SRV: 127.0.0.1:5000</div>
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

          <div className="stat-module mini">
            <label>UPLINK_STABILITY</label>
            <div className="stat-value small">NOMINAL</div>
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
              <div key={i} className={`log-line ${log.startsWith("[TARVIS]") ? "ai" : ""}`}>
                <ReactMarkdown
                  components={{
                    strong: ({ ...props }) => <span className="terminal-bold" {...props} />,
                    code: ({ ...props }) => <code className="terminal-code" {...props} />,
                    p: ({ ...props }) => <span {...props} />,
                  }}
                >
                  {log}
                </ReactMarkdown>
              </div>
            ))}
            {isThinking && <div className="log-line ai">...PROCESSING_DIRECTIVE...</div>}
          </div>

          <form className="terminal-input-zone" onSubmit={handleSubmit}>
            <span className="prompt">❯</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isThinking ? "SYSTEM_BUSY" : "Execute command..."}
              autoFocus
              autoComplete="off"
              spellCheck="false"
              disabled={isThinking}
            />
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
