require('dotenv').config();
const express = require("express");
const http = require("http");
const path = require('path');
const { Server } = require("socket.io");
const vosk = require('vosk');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  transports: ["polling", "websocket", "webtransport"]
});

const PORT = process.env.PORT || 8000
const MODEL_PATH = "./vosk-model-small-en-in-0.4";
const OPENROUTER_AI_APIKEY = process.env.OPENROUTER_AI_APIKEY;
const SAMPLE_RATE = 16000;

vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);
const recognizer = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_AI_APIKEY,
})

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get("/api/stream", (req, res) => {
  res.json({ message: "Streaming API working!" });
});

app.get("/api/stream", (req, res) => {
  res.json({ message: "Streaming API working!" });
});

app.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');
  let isOpen = true;
  req.on('close', ()=> {isOpen = false});
  let timeout = setTimeout(() => {!res.writableEnded ? (res.end(' :: stream end'),isOpen=false) : ''}, 5000);
  sendToOllama(req.query.prompt || "hello", (text) => {
    if (res.writableEnded) {
      isOpen = false;
    };
    if (!isOpen) {
      return;
    }
    clearTimeout(timeout);
    timeout = setTimeout(() => {!res.writableEnded ? res.end(' :: stream end') : ''}, 5000)
    res.write(text);
  })
});

io.on("connection", (socket) => {
  try {
    console.log("A user connected");
    socket.on("log", (log) => { console.log(`[client]::`, log) });
    socket.on("rawaudio", (event) => { transcription(socket, event) });
    socket.on("disconnect", () => console.log("User disconnected"));
  } catch (error) {
    console.error("❌ Error processing audio of user:", socket && socket.id,  error);
    try {
      socket.disconnect()
    } catch (error) {
      console.error("Error while disconnecting...")
    }
  }
});

const transcription = async (socket, event) => {
  if (recognizer.acceptWaveform(event)) {
    const text = recognizer.result().text.trim();
    if (text.length > 0) {
      console.log("✅ Final Transcription:", text);
      sendToOllama(text, (g_text) => {
        console.log('[index]::g_text::', typeof(g_text), g_text);
        if (g_text && g_text.length > 0) {
          socket.emit("final-transcription", g_text);
        }
      })
    }
  } else {
    const text = recognizer.partialResult().partial.trim();
    if (text.length > 0) {
      console.log("🟡 Partial Transcription:", text);
      socket.emit("partial-transcription", text);
    }
  }
}

const sendToOllama = async (text, callback) => {
  const stream = await client.chat.completions.create({
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    messages: [{ role: 'user', content: text }],
    temperature: 0.3,
    max_tokens: 100,
    top_p: 0.8,
    stream: true
  });
  let line = "";
  for await (const chunk of stream) {
    let hasChunk = chunk.choices[0]?.delta?.content || '';
    if (hasChunk === "") {
      callback(line);
      line = hasChunk;
    } else if (typeof hasChunk == 'string' && hasChunk.includes('.')) {
      let ch = hasChunk.split('.');
      callback(line + ch.shift())
      line = ch.join('');
    } else {
      line += hasChunk;
    }
  }
  callback(line);
  line = "";
}

server.listen(PORT, async () => { 
  console.log("Server running on http://localhost:"+ PORT)
});
