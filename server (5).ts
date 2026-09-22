import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("La clave GEMINI_API_KEY no está configurada en el entorno.");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

// Helper para convertir audio lineal PCM 16-bit 24kHz a formato WAV canónico con cabecera RIFF
function pcm16ToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // 1 = PCM uncompressed
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// API de verificación de estado
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Texto a Voz TTS" });
});

// Endpoint principal para sintetizar texto a archivo WAV directo
app.post("/api/synthesize", async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "El campo 'text' es obligatorio." });
    }

    const trimmedText = text.trim();
    // Limitar longitud para evitar abusos o timeouts
    const sanitizedText = trimmedText.slice(0, 5000);
    const selectedVoice = ["Kore", "Puck", "Fenrir", "Zephyr", "Charon"].includes(voice)
      ? voice
      : "Kore";

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: sanitizedText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const candidate = response.candidates?.[0]?.content?.parts?.[0];
    const base64Pcm = candidate?.inlineData?.data;

    if (!base64Pcm) {
      return res.status(500).json({
        error: "El servicio no devolvió datos de audio para el texto proporcionado.",
      });
    }

    const pcmBuffer = Buffer.from(base64Pcm, "base64");
    const wavBuffer = pcm16ToWav(pcmBuffer, 24000, 1, 16);
    const base64Wav = wavBuffer.toString("base64");
    const durationSeconds = +(pcmBuffer.length / (24000 * 2)).toFixed(2);

    res.json({
      success: true,
      audioBase64: base64Wav,
      mimeType: "audio/wav",
      voice: selectedVoice,
      durationSeconds,
      bytes: wavBuffer.length,
      fileName: `voz_${selectedVoice.toLowerCase()}_${Date.now()}.wav`,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Error en /api/synthesize:", errorMessage);
    res.status(500).json({
      error: errorMessage || "Error interno al generar el audio de voz.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor de Texto a Voz iniciado en http://localhost:${PORT}`);
  });
}

startServer();
