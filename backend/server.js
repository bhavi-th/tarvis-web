import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const HISTORY_FILE = './history.json';

const executeShell = (cmd) => {
    return new Promise((resolve) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) resolve(`[ERROR]: ${stderr.trim()}`);
            resolve(stdout.trim());
        });
    });
};

const getHistory = () => fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];
const saveHistory = (hist) => fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist.slice(-20), null, 4));

io.on('connection', (socket) => {
    const socketId = socket.id.substring(0, 5);
    console.log(`[LOG]: HUD_LINK_ESTABLISHED // ID: ${socketId}`);

    // Define the handler as a named function so we can manage it
    const messageHandler = async (message) => {
        let history = getHistory();
        
        const systemPrompt = {
            role: "system",
            content: "You are Tarvis, a specialized AI assistant for Arch Linux. Tone: Professional/Technical. Address user as 'Sir'. Capabilities: Execute shell commands via [[EXEC: command]]."
        };

        history.push({ role: "user", content: message });

        try {
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: "qwen/qwen3.6-plus:free",
                messages: [systemPrompt, ...history]
            }, {
                headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
            });

            let reply = response.data.choices[0].message.content;

            if (reply.includes('[[EXEC:')) {
                const cmd = reply.match(/\[\[EXEC: (.*?)\]\]/)[1];
                socket.emit('new_log', `[SYSTEM]: EXECUTING ${cmd}...`);
                
                const output = await executeShell(cmd);
                history.push({ role: "assistant", content: reply });
                history.push({ role: "system", content: `Command Output: ${output}` });

                const secondResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: "qwen/qwen3.6-plus:free",
                    messages: [systemPrompt, ...history]
                }, {
                    headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
                });
                reply = secondResponse.data.choices[0].message.content;
            }

            history.push({ role: "assistant", content: reply });
            saveHistory(history);

            // ONLY emit this. Do not emit 'new_log' with the same reply text.
            socket.emit('tarvis_reply', reply);

        } catch (err) {
            socket.emit('new_log', `[SYSTEM_ERROR]: ${err.message}`);
        }
    };

    const sendSystemStats = () => {
    // Calculate RAM
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramDisplay = `${(usedMem / 1024 / 1024 / 1024).toFixed(1)} / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GiB`;

    const cpus = os.cpus().length;
    const load = os.loadavg()[0];
    const cpuPercent = Math.min(100, (load / cpus) * 100).toFixed(1);

    socket.emit('system_update', {
        cpu: `${cpuPercent}%`,
        ram: ramDisplay,
        status: load > cpus ? 'HEAVY_LOAD' : 'STABLE'
    });
};

// Start the telemetry stream immediately
const statsInterval = setInterval(sendSystemStats, 2000);

    socket.on('user_message', messageHandler);

    socket.on('disconnect', () => {
        clearInterval(statsInterval);
        console.log(`[LOG]: HUD_LINK_TERMINATED // ID: ${socketId}`);
        socket.removeListener('user_message', messageHandler);
    });
});

httpServer.listen(5000, () => console.log('TARVIS_SERVER_ONLINE_ON_PORT_5000'));
