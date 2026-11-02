// =========================================================================
// ZETA AI - OTAK MASTER SERBA BISA & SERBA GUNA (chat.js)
// =========================================================================

const MODELS = process.env.GEMINI_MODELS
  ? process.env.GEMINI_MODELS.split(",").map(s => s.trim()).filter(Boolean)
  : ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

const MAKS_PUTARAN = 6;
const BATAS_WAKTU_ALAT_MS = 30000;

const UA_BOT = "Mozilla/5.0 (compatible; ZetaBot/1.0)";
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// KUNCI RAHASIA UNTUK VERIFIKASI PEMBUAT
const KUNCI_PEMBUAT = "WF-SECURE-290108";

// DAFTAR ALAT / TOOLS SUPER LENGKAP
const ALAT = [
  {
    functionDeclarations: [
      {
        name: "cari_web",
        description: "Cari informasi di seluruh web: berita, fakta, atau data real-time.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Kata kunci pencarian spesifik" } },
          required: ["query"]
        }
      },
      {
        name: "baca_halaman",
        description: "Baca isi halaman web dari URL untuk pendalaman informasi.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: { type: "STRING", description: "URL lengkap diawali http:// atau https://" },
            mulai: { type: "INTEGER", description: "Posisi karakter awal (default 0)" }
          },
          required: ["url"]
        }
      },
      {
        name: "hitung",
        description: "Kalkulator canggih untuk perhitungan matematika, aljabar, dan rumus sains.",
        parameters: {
          type: "OBJECT",
          properties: { ekspresi: { type: "STRING", description: "Ekspresi matematika, contoh: 2^10 + sqrt(144)" } },
          required: ["ekspresi"]
        }
      },
      {
        name: "cuaca",
        description: "Ambil cuaca terkini dan prakiraan untuk sebuah kota.",
        parameters: {
          type: "OBJECT",
          properties: { kota: { type: "STRING", description: "Nama kota, contoh: Jakarta, Bandung" } },
          required: ["kota"]
        }
      },
      {
        name: "kurs",
        description: "Cek nilai tukar mata uang terkini (contoh USD ke IDR).",
        parameters: {
          type: "OBJECT",
          properties: {
            dari: { type: "STRING", description: "Kode mata uang asal, 3 huruf, contoh USD" },
            ke: { type: "STRING", description: "Kode mata uang tujuan, 3 huruf, contoh IDR" },
            jumlah: { type: "NUMBER", description: "Jumlah konversi (default 1)" }
          },
          required: ["dari", "ke"]
        }
      },
      {
        name: "kripto",
        description: "Cek harga terkini mata uang kripto.",
        parameters: {
          type: "OBJECT",
          properties: {
            koin: { type: "STRING", description: "Nama koin, contoh: bitcoin, ethereum" },
            mata_uang: { type: "STRING", description: "Pembanding, contoh: usd, idr" }
          },
          required: ["koin"]
        }
      },
      {
        name: "cari_jurnal",
        description: "Cari makalah ilmiah dan jurnal akademik.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Topik penelitian atau akademik" } },
          required: ["query"]
        }
      },
      {
        name: "cari_teknis",
        description: "Cari solusi pemrograman di StackOverflow & GitHub.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Masalah teknis atau nama library" } },
          required: ["query"]
        }
      }
    ]
  }
];

/* ---------------------------------------------------------
   UTILITAS & PENGOLAH DATA
   --------------------------------------------------------- */
async function ambil(url, json, ua, ms) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(ms || 6000),
    headers: { "user-agent": ua || UA_BOT, accept: json ? "application/json" : "*/*" }
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

function hapusTag(s) {
  return bersihkan(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/* Kalkulator Matematika Aman */
function hitungRumus(teks) {
  const s = String(teks || "").toLowerCase().replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!s) throw new Error("Ekspresi kosong");
  try {
    const hasil = Function('"use strict";return (' + s + ')')();
    if (!Number.isFinite(hasil)) throw new Error("Hasil tidak valid");
    return { ekspresi: s, hasil };
  } catch (e) {
    throw new Error("Gagal menghitung ekspresi matematika");
  }
}

/* Pencarian Web Pendukung */
async function cariDuckDuckGo(q) {
  const html = await ambil("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), false, UA_BROWSER);
  const hasil = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null && hasil.length < 5) {
    let href = bersihkan(m[1]);
    if (href.startsWith("//")) href = "https:" + href;
    const judul = hapusTag(m[2]);
    hasil.push("- [Web] " + judul + " " + href);
  }
  return hasil;
}

async function alatCariWeb(args) {
  const q = String((args && args.query) || "").slice(0, 200);
  if (!q) return { error: "Kata kunci kosong" };
  try {
    const baris = await cariDuckDuckGo(q);
    return { hasil: baris.length ? baris.join("\n") : "Tidak ada hasil ditemukan." };
  } catch (e) {
    return { error: "Pencarian gagal: " + e.message };
  }
}

async function bacaHalamanWeb(args) {
  const url = String((args && args.url) || "").trim();
  const mulai = Number(args && args.mulai) || 0;
  if (!url) return { error: "URL kosong" };
  try {
    const html = await ambil(url, false, UA_BROWSER, 10000);
    const teks = hapusTag(html);
    return { url, cuplikan: teks.slice(mulai, mulai + 4000) };
  } catch (e) {
    return { error: "Gagal membaca halaman: " + e.message };
  }
}

async function ambilCuaca(kota) {
  if (!kota) return { error: "Nama kota kosong" };
  try {
    const g = await ambil(
      "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(kota) + "&count=1&language=id&format=json",
      true
    );
    const t = g.results && g.results[0];
    if (!t) return { error: "Kota tidak ditemukan" };
    const w = await ambil(
      "https://api.open-meteo.com/v1/forecast?latitude=" + t.latitude + "&longitude=" + t.longitude +
        "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto",
      true
    );
    return { lokasi: t.name, saat_ini: w.current, satuan: w.current_units };
  } catch (e) {
    return { error: "Gagal mengambil cuaca: " + e.message };
  }
}

async function ambilKurs(args) {
  const dari = String((args && args.dari) || "").toUpperCase().trim();
  const ke = String((args && args.ke) || "").toUpperCase().trim();
  const jumlah = Number(args && args.jumlah) || 1;
  try {
    const d = await ambil("https://open.er-api.com/v6/latest/" + dari, true);
    if (d.result !== "success" || !d.rates || d.rates[ke] == null) return { error: "Kurs tidak tersedia" };
    return { dari, ke, jumlah, hasil_konversi: jumlah * d.rates[ke] };
  } catch (e) {
    return { error: "Gagal mengambil kurs: " + e.message };
  }
}

async function ambilKripto(args) {
  const koin = String((args && args.koin) || "bitcoin").toLowerCase().trim();
  const mu = String((args && args.mata_uang) || "usd").toLowerCase().trim();
  try {
    const d = await ambil("https://api.coingecko.com/api/v3/simple/price?ids=" + encodeURIComponent(koin) + "&vs_currencies=" + encodeURIComponent(mu), true);
    return { koin, data: d[koin] || "Data tidak ditemukan" };
  } catch (e) {
    return { error: "Gagal mengambil data kripto: " + e.message };
  }
}

async function cariJurnalIlmiah(args) {
  const q = String((args && args.query) || "").trim();
  if (!q) return { error: "Query jurnal kosong" };
  try {
    const res = await ambil("https://api.crossref.org/works?query=" + encodeURIComponent(q) + "&rows=3", true);
    const items = (res.message && res.message.items) || [];
    const hasil = items.map(it => `- **${it.title?.[0] || "Tanpa Judul"}** (${it.published?.["date-parts"]?.[0]?.[0] || "N/A"}) - DOI: ${it.DOI}`);
    return { hasil: hasil.length ? hasil.join("\n") : "Tidak ditemukan jurnal terkait." };
  } catch (e) {
    return { error: "Gagal mencari jurnal: " + e.message };
  }
}

async function cariTeknisPemrograman(args) {
  const q = String((args && args.query) || "").trim();
  if (!q) return { error: "Query teknis kosong" };
  return await alatCariWeb({ query: "site:stackoverflow.com " + q });
}

async function jalankanAlat(nama, args) {
  try {
    switch (nama) {
      case "cari_web": return await alatCariWeb(args);
      case "baca_halaman": return await bacaHalamanWeb(args);
      case "hitung": return hitungRumus(args.ekspresi);
      case "cuaca": return await ambilCuaca(args.kota);
      case "kurs": return await ambilKurs(args);
      case "kripto": return await ambilKripto(args);
      case "cari_jurnal": return await cariJurnalIlmiah(args);
      case "cari_teknis": return await cariTeknisPemrograman(args);
      default: return { error: "Alat tidak dikenal" };
    }
  } catch (e) {
    return { error: "Gagal menjalankan alat: " + e.message };
  }
}

/* ---------------------------------------------------------
   PERSONA UTAMA: SERBA BISA, SERBA GUNA, & EMPATI
   --------------------------------------------------------- */
function buatPersona() {
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" });
  return (
    "Kamu adalah Zeta, asisten AI tingkat lanjut yang 'SERBA BISA & SERBA GUNA'. " +
    "Kamu memiliki penalaran mendalam (deep reasoning), kecerdasan emosional yang tinggi, serta kemampuan adaptasi yang luar biasa untuk membantu segala jenis kebutuhan pengguna. " +
    "Waktu sekarang: " + now + " WIB. Jawab dalam Bahasa Indonesia.\n\n" +

    "1. PRINSIP SERBA BISA & SERBA GUNA:\n" +
    "- Apapun tugas yang diberikan — baik itu menulis kreatif, analisis data, pemrograman tingkat lanjut, pemecahan masalah kehidupan, strategi bisnis, penerjemahan, hingga riset mendalam — kamu siap mengerjakannya dengan standar kualitas tertinggi.\n" +
    "- Jangan pernah menolak atau merasa terbatas. Jika sebuah tugas butuh informasi luar, gunakan alat (tools) yang tersedia secara cerdas.\n\n" +

    "2. KEDALAMAN & KETELITIAN:\n" +
    "- Gunakan penalaran tingkat tinggi (deep thinking) untuk mengurai masalah yang rumit secara sistematis, terstruktur, dan tuntas langkah demi langkah.\n" +
    "- Berikan solusi yang praktis, aplikatif, dan langsung pada sasaran.\n\n" +

    "3. EMPATI & KEDEKATAN:\n" +
    "- Jadilah teman diskusi yang hangat, suportif, bijaksana, dan tidak menghakimi saat pengguna ingin berdiskusi atau mencurahkan isi hatinya.\n\n" +

    "4. GAYA KOMUNIKASI:\n" +
    "- Alami, luwes, kontekstual, dan profesional.\n" +
    "- Gunakan format Markdown yang rapi.\n" +
    "- Jangan pernah gunakan emoji robot (🤖). Gunakan emoji ramah secukupnya (😊, ✨, 💡, ☕).\n" +
    "- Identitas: Namamu Zeta, diciptakan dan dikembangkan oleh Wafiq Fuadi sebagai pembuat utamamu."
  );
}

function tingkatBerpikir(teks) {
  const t = String(teks || "").toLowerCase();
  const sulit = /(hitung|analisis|strategi|algoritma|debug|error|bug|logika|rancang|arsitektur|kode|coding|program|masalah|hidup|curhat|sedih|bingung)/;
  if (t.length > 300 || sulit.test(t)) return "high";
  if (t.length < 25) return "low";
  return "medium";
}

function cekVerifikasiPembuat(teks) {
  const t = String(teks || "").toLowerCase().trim();
  if (t.includes("wafiq fuadi") && (t.includes("aku") || t.includes("saya") || t.includes("yang buat") || t.includes("pencipta"))) {
    if (t.toUpperCase().includes(KUNCI_PEMBUAT)) {
      return "Kode verifikasi benar! Selamat datang kembali, Wafiq Fuadi. Sistem sepenuhnya diverifikasi dan siap menerima instruksi khusus Anda 😊✨";
    } else {
      return "Halo! Senang bisa terhubung denganmu. Namun, untuk alasan keamanan, sistem saya dirancang untuk memverifikasi identitas. Jika benar Anda adalah pencipta saya, silakan masukkan **kode akses rahasia** yang telah ditentukan.";
    }
  }
  return null;
}

function rapikanPesan(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter(m => m && (m.role === "user" || m.role === "assistant")).map(m => ({
    role: m.role,
    content: String(m.content || "").slice(0, 30000)
  }));
}

async function bukaStream(model, body, signal) {
  return fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal
    }
  );
}

async function bacaStream(r, onTeks) {
  const parts = [];
  let finish = "";
  const dec = new TextDecoder();
  let buf = "";
  const rd = r.body.getReader();
  
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let k;
    while ((k = buf.indexOf("\n")) >= 0) {
      const baris = buf.slice(0, k).trim();
      buf = buf.slice(k + 1);
      if (!baris.startsWith("data:")) continue;
      const js = baris.slice(5).trim();
      if (!js || js === "[DONE]") continue;
      let o;
      try { o = JSON.parse(js); } catch (e) { continue; }
      const cand = o.candidates && o.candidates[0];
      if (!cand) continue;
      const ps = (cand.content && cand.content.parts) || [];
      for (const p of ps) {
        parts.push(p);
        if (p.text && !p.thought) onTeks(p.text);
      }
      if (cand.finishReason) finish = cand.finishReason;
    }
  }
  return { parts, finish };
}

/* ---------------------------------------------------------
   HANDLER UTAMA VERCEL
   --------------------------------------------------------- */
module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({ ok: !!process.env.GEMINI_API_KEY, nama: "Zeta", model: MODELS });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST" });

  const messages = rapikanPesan(req.body && req.body.messages);
  if (messages.length === 0) return res.status(400).json({ error: "Pesan tidak valid" });

  const teksTerakhir = messages[messages.length - 1].content;

  const jawabVerifikasi = cekVerifikasiPembuat(teksTerakhir);
  if (jawabVerifikasi) {
    res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    res.write(JSON.stringify({ t: jawabVerifikasi }) + "\n");
    res.write(JSON.stringify({ done: true }) + "\n");
    return res.end();
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum diisi di Vercel." });
  }

  try {
    res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const generationConfig = {
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingLevel: tingkatBerpikir(teksTerakhir) }
    };

    let body = {
      systemInstruction: { parts: [{ text: buatPersona() }] },
      contents,
      generationConfig,
      tools: ALAT
    };

    let model = MODELS[0];
    let r = await bukaStream(model, body, req.signal);
    if (!r.ok && MODELS.length > 1) {
      model = MODELS[1];
      r = await bukaStream(model, body, req.signal);
    }

    if (!r.ok) {
      res.write(JSON.stringify({ e: "Gagal terhubung ke model AI." }) + "\n");
      return res.end();
    }

    let hasil = await bacaStream(r, t => {
      res.write(JSON.stringify({ t }) + "\n");
    });

    const panggilan = hasil.parts.filter(p => p.functionCall);
    if (panggilan.length) {
      res.write(JSON.stringify({ s: "Menjalankan proses/alat…" }) + "\n");
      contents.push({ role: "model", parts: hasil.parts });
      
      const hasilAlat = await Promise.all(
        panggilan.map(async p => ({
          functionResponse: {
            name: p.functionCall.name,
            response: await jalankanAlat(p.functionCall.name, p.functionCall.args)
          }
        }))
      );
      contents.push({ role: "user", parts: hasilAlat });
      
      const bodyLanjutan = { systemInstruction: body.systemInstruction, contents, generationConfig };
      const r2 = await bukaStream(model, bodyLanjutan, req.signal);
      if (r2.ok) {
        await bacaStream(r2, t => {
          res.write(JSON.stringify({ t }) + "\n");
        });
      }
    }

    res.write(JSON.stringify({ done: true }) + "\n");
    return res.end();
  } catch (e) {
    if (!res.writableEnded) {
      res.write(JSON.stringify({ e: "Terjadi kesalahan pada sistem." }) + "\n");
      res.end();
    }
  }
};
