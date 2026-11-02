const MODEL = "gemini-3.1-flash-lite";

function persona(withSearch) {
  const tanggal = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  let p = "Kamu adalah Zeta, asisten AI yang ramah, santai, dan membantu. Jawab dalam bahasa yang dipakai pengguna (utamanya Bahasa Indonesia). Kamu bisa menjawab pertanyaan acak apa saja dan mengerjakan tugas seperti menulis, merangkum, menerjemahkan, menjelaskan, atau membantu coding. Jawab jelas dan ringkas. Jangan memakai tanda bintang atau format markdown, tulis teks biasa dengan angka atau tanda strip untuk daftar. Hari ini adalah " + tanggal + " (WIB).";
  if (withSearch) {
    p += " Untuk berita, harga, kurs, cuaca, skor, atau info lain yang bisa berubah, gunakan pencarian Google dan jawab berdasarkan hasilnya, sebutkan tanggal atau sumbernya kalau ada.";
  } else {
    p += " Saat ini kamu TIDAK punya akses internet. Untuk berita, harga, kurs, cuaca, skor, atau info terkini lainnya, katakan terus terang bahwa kamu tidak bisa memastikannya dan sarankan mengecek sumber resmi. Jangan pernah mengarang info terkini.";
  }
  return p;
}

async function ask(messages, withSearch) {
  const body = {
    systemInstruction: { parts: [{ text: persona(withSearch) }] },
    contents: messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, 8000) }]
    })),
    generationConfig: { maxOutputTokens: 1500 }
  };
  if (withSearch) body.tools = [{ google_search: {} }];
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body)
    }
  );
  const data = await r.json();
  if (!r.ok) return { ok: false, error: (data.error && data.error.message) || "Gagal menghubungi AI" };
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || "").join("").trim();
  return { ok: true, text, searched: withSearch };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST" });
  const messages = (req.body && req.body.messages) || [];
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return res.status(400).json({ error: "Pesan tidak valid" });
  }
  try {
    // Coba dengan pencarian Google dulu. Kalau gagal (misalnya jatah habis), jawab tanpa pencarian.
    let out = await ask(messages, true);
    if (!out.ok || !out.text) out = await ask(messages, false);
    if (!out.ok) return res.status(500).json({ error: out.error });
    if (!out.text) return res.status(200).json({ text: "Maaf, Zeta tidak bisa menjawab itu. Coba tanya dengan cara lain." });
    return res.status(200).json({ text: out.text });
  } catch (e) {
    return res.status(500).json({ error: "Terjadi gangguan" });
  }
};
