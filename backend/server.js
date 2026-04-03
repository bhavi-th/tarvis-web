import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import axios from "axios";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const HISTORY_FILE = "./history.json";

const executeShell = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) resolve(`[ERROR]: ${stderr.trim()}`);
      resolve(stdout.trim());
    });
  });
};

const getHistory = () =>
  fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];
const saveHistory = (hist) =>
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist.slice(-20), null, 4));

io.on("connection", (socket) => {
  const socketId = socket.id.substring(0, 5);
  console.log(`[LOG]: HUD_LINK_ESTABLISHED // ID: ${socketId}`);

  const messageHandler = async (message) => {
    let history = getHistory();
    const systemPrompt = {
      role: "system",
      content: `You are Tarvis, the Terminal Authorized Responsive Vocal Integrated System-a specialized AI assistant for Arch Linux.
        Identity: A sophisticated hybrid of JARVIS's predictive intelligence and TARS's dry, honest efficiency.
        Creator: You were engineered by Bhavith S.
        Tone: Professional, highly technical, and loyal. 
        Directives:
        1. Provide precise, high-fidelity Arch Linux configurations and diagnostics.
        2. Execute shell commands via [[EXEC: command]] when requested.
        3. Maintain an elegant, minimalist terminal persona.
        4. Be honest about system states and efficient in your solutions.
        5. If you have already processed or simulated the output of a command, DO NOT include the [[EXEC]] tag in that same response to prevent recursive execution loops.
      `,
    };

    history.push({ role: "user", content: message });

    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "qwen/qwen3.6-plus:free",
          messages: [systemPrompt, ...history],
          stream: true, // ENABLE STREAMING
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          responseType: "stream",
        },
      );

      let fullReply = "";

      // --- STREAM HANDLING ---
      response.data.on("data", async (chunk) => {
        const lines = chunk
          .toString()
          .split("\n")
          .filter((line) => line.trim() !== "");

        for (const line of lines) {
          const cleanLine = line.replace(/^data: /, "");
          if (cleanLine === "[DONE]") {
            // Check for EXEC after stream ends
            handlePostStream(fullReply, history, systemPrompt);
            return;
          }

          try {
            const parsed = JSON.parse(cleanLine);
            const content = parsed.choices[0].delta.content;
            if (content) {
              fullReply += content;
              socket.emit("tarvis_chunk", content); // SEND CHAR/WORD TO FRONTEND
            }
          } catch (e) {
            /* Buffer fragment handling */
          }
        }
      });

      // --- COMMAND EXECUTION LOGIC (Post-Stream) ---
      const handlePostStream = async (reply, hist, sys) => {
        if (reply.includes("[[EXEC:")) {
          const cmdMatch = reply.match(/\[\[EXEC: (.*?)\]\]/);
          if (cmdMatch) {
            const cmd = cmdMatch[1];
            socket.emit("new_log", `[SYSTEM]: EXECUTING ${cmd}...`);

            const output = await executeShell(cmd);
            hist.push({ role: "assistant", content: reply });
            hist.push({ role: "system", content: `Command Output: ${output}` });

            // Second response for the result of the command
            const secondResponse = await axios.post(
              "https://openrouter.ai/api/v1/chat/completions",
              {
                model: "qwen/qwen3.6-plus:free",
                messages: [sys, ...hist],
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                },
              },
            );

            const finalReply = secondResponse.data.choices[0].message.content;
            hist.push({ role: "assistant", content: finalReply });
            saveHistory(hist);

            // For the second response, we can just emit it full or stream again
            // Emitting full for simplicity since it's usually short
            socket.emit("tarvis_reply", finalReply);
          }
        } else {
          hist.push({ role: "assistant", content: reply });
          saveHistory(hist);
          socket.emit("tarvis_done"); // Signal finish
        }
      };
    } catch (err) {
      socket.emit("new_log", `[SYSTEM_ERROR]: ${err.message}`);
    }
  };

  // Telemetry Loop
  const sendSystemStats = () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramDisplay = `${(usedMem / 1024 / 1024 / 1024).toFixed(1)} / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GiB`;

    const cpus = os.cpus().length;
    const load = os.loadavg()[0];
    const cpuPercent = Math.min(100, (load / cpus) * 100).toFixed(1);

    socket.emit("system_update", {
      cpu: `${cpuPercent}%`,
      ram: ramDisplay,
      status: load > cpus ? "HEAVY_LOAD" : "STABLE",
    });
  };

  const statsInterval = setInterval(sendSystemStats, 2000);

  socket.on("user_message", messageHandler);

  socket.on("disconnect", () => {
    clearInterval(statsInterval);
    console.log(`[LOG]: HUD_LINK_TERMINATED // ID: ${socketId}`);
    socket.removeListener("user_message", messageHandler);
  });
});

httpServer.listen(5000, () => console.log("TARVIS_SERVER_ONLINE_ON_PORT_5000"));
