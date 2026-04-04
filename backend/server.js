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
const TARGET_MODEL = "qwen/qwen3.6-plus:free";

const executeShell = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) resolve(`[ERROR]: ${stderr.trim()}`);
      resolve(stdout.trim() || "[SUCCESS]: Operation completed.");
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
          model: TARGET_MODEL,
          messages: [systemPrompt, ...history],
          stream: true,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          responseType: "stream",
        },
      );

      let fullReply = "";

      response.data.on("data", (chunk) => {
        const lines = chunk
          .toString()
          .split("\n")
          .filter((l) => l.trim());
        for (const line of lines) {
          const clean = line.replace(/^data: /, "");
          if (clean === "[DONE]") return;
          try {
            const parsed = JSON.parse(clean);
            const content = parsed.choices[0].delta.content;
            if (content) {
              fullReply += content;
              socket.emit("tarvis_chunk", content);
            }
          } catch (e) { }
        }
      });

      response.data.on("end", async () => {
        const match = fullReply.match(/\[\[EXEC:\s*(.*?)\]\]/);

        if (match) {
          const cmd = match[1];
          socket.emit("new_log", `[SYSTEM]: EXECUTING ${cmd}...`);
          const output = await executeShell(cmd);

          history.push({ role: "assistant", content: fullReply });
          history.push({
            role: "system",
            content: `Command Output: ${output}`,
          });

          socket.emit("new_log", `[SYSTEM]: COOLING DOWN (1s)...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const secondResponse = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              model: TARGET_MODEL,
              messages: [systemPrompt, ...history],
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              },
            },
          );

          const finalReply = secondResponse.data.choices[0].message.content;
          socket.emit("tarvis_reply", finalReply);
          history.push({ role: "assistant", content: finalReply });
          saveHistory(history);
        } else {
          history.push({ role: "assistant", content: fullReply });
          saveHistory(history);
          socket.emit("tarvis_done");
        }
      });
    } catch (err) {
      socket.emit("new_log", `[SYSTEM_ERROR]: ${err.message}`);
      socket.emit("tarvis_done");
    }
  };

  const statsInterval = setInterval(() => {
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    const load = os.loadavg()[0];
    socket.emit("system_update", {
      cpu: `${((load / os.cpus().length) * 100).toFixed(1)}%`,
      ram: `${(usedMem / 1024 ** 3).toFixed(1)} / ${(totalMem / 1024 ** 3).toFixed(1)} GiB`,
    });
  }, 2000);

  socket.on("user_message", messageHandler);
  socket.on("disconnect", () => {
    clearInterval(statsInterval);
    socket.removeListener("user_message", messageHandler);
  });
});

httpServer.listen(5000);
