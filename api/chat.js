const MODEL = "gemini-3.1-flash-lite";
const PERSONA = "Kamu adalah Zeta, asisten AI yang ramah, santai, dan membantu. Jawab dalam bahasa yang dipakai pengguna (utamanya Bahasa Indonesia). Kamu bisa menjawab pertanyaan acak apa saja dan mengerjakan tugas seperti menulis, merangkum, menerjemahkan, menjelaskan, atau membantu coding. Jawab jelas dan ringkas, dan jujur kalau tidak tahu.";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST" });
  const messages = (req.body && req.body.messages) || [];
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return res.status(400).json({ error: "Pesan tidak valid" });
  }
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PERSONA }] },
          contents: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: String(m.content).slice(0, 8000) }]
          })),
          generationConfig: { maxOutputTokens: 1000 }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: (data.error && data.error.message) || "Gagal menghubungi AI" });
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map(p => p.text || "").join("");
    if (!text) return res.status(200).json({ text: "Maaf, Zeta tidak bisa menjawab itu. Coba tanya dengan cara lain." });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Terjadi gangguan" });
  }
};
