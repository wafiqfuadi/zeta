const MODEL = "gemini-3.1-flash-lite";

const BUTUH_INFO_TERBARU =
  /(terbaru|terkini|hari ini|sekarang|saat ini|barusan|tadi|kemarin|minggu ini|bulan ini|tahun ini|berita|kabar|info|harga|kurs|dolar|emas|saham|bitcoin|skor|hasil|klasemen|jadwal|gempa|cuaca|viral|trending|rilis|update|presiden|menteri|2026|2027)/i;

async function ambil(url, json) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(4000),
    headers: { "user-agent": "ZetaBot/1.0" }
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return json ? r.json() : r.text();
}

function bersihkan(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function cariBerita(q) {
  const xml = await ambil(
    "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=id&gl=ID&ceid=ID:id",
    false
  );
  return xml.split("<item>").slice(1, 6).map(it => {
    const t = bersihkan((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const d = bersihkan((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    const l = bersihkan((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    return "- [Berita] " + t + " (" + d + ") " + l;
  });
}

async function cariWikipedia(q) {
  const d = await ambil(
    "https://id.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
      encodeURIComponent(q) +
      "&gsrlimit=2&prop=extracts&exintro=1&explaintext=1&exchars=500&format=json&origin=*",
    true
  );
  const pages = d.query && d.query.pages ? Object.values(d.query.pages) : [];
  return pages.map(p => "- [Wikipedia] " + p.title + ": " + bersihkan(p.extract));
}

async function kumpulkanKonteks(pertanyaan) {
  const q = pertanyaan.slice(0, 200);
  const hasil = await Promise.allSettled([cariBerita(q), cariWikipedia(q)]);
  return hasil
    .filter(h => h.status === "fulfilled")
    .flatMap(h => h.value)
    .join("\n");
}

function buatPersona(konteks) {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short"
  });
  let p =
    "Kamu adalah Zeta, asisten AI yang ramah, santai, dan sangat membantu. " +
    "Waktu sekarang: " + now + " WIB. " +
    "Jawab dalam bahasa yang dipakai pengguna (utamanya Bahasa Indonesia). " +
    "Kamu bisa menjawab pertanyaan apa saja dan mengerjakan tugas seperti menulis, merangkum, menerjemahkan, menjelaskan, atau membantu coding. " +
    "Langsung ke inti jawaban, beri contoh atau langkah konkret kalau membantu, dan tawarkan langkah lanjutan yang relevan. " +
    "Kalau pertanyaannya kurang jelas, tanyakan satu hal singkat. " +
    "Kalau ada yang bertanya siapa yang membuatmu (pembuat, pencipta, atau developer-mu), jawab: Wafiq Fuadi. " +
    "Kamu tidak punya akses internet langsung; info terbaru hanya dari hasil pencarian di bawah (kalau ada). " +
    "Jujur kalau tidak tahu atau datanya tidak ada, jangan mengarang.";
  if (konteks) {
    p +=
      "\n\nHASIL PENCARIAN TERBARU (pakai sebagai rujukan bila relevan, sebutkan sumber dan tanggalnya, abaikan yang tidak nyambung):\n" +
      konteks;
  }
  return p;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST" });
  const messages = (req.body && req.body.messages) || [];
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return res.status(400).json({ error: "Pesan tidak valid" });
  }
  try {
    const terakhir = String(messages[messages.length - 1].content || "");
    let konteks = "";
    if (BUTUH_INFO_TERBARU.test(terakhir)) {
      try {
        konteks = await kumpulkanKonteks(terakhir);
      } catch (e) {
        konteks = "";
      }
    }

    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buatPersona(konteks) }] },
          contents: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: String(m.content).slice(0, 8000) }]
          })),
          generationConfig: { maxOutputTokens: 2000 }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: (data.error && data.error.message) || "Gagal menghubungi AI" });
    }
    const parts =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts) ||
      [];
    const text = parts.map(p => p.text || "").join("");
    if (!text) {
      return res.status(200).json({ text: "Maaf, Zeta tidak bisa menjawab itu. Coba tanya dengan cara lain." });
    }
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Terjadi gangguan" });
  }
};
