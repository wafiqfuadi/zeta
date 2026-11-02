// ============================================================================
// ZETA AI - ULTIMATE CORE BACKEND ARCHITECTURE
// Pembuat: Wafiq Fuadi (AI Research & Safety)
// Fitur Utama: Deep Reasoning, Agentic Self-Correction, Multi-Step Planning,
//               Emotional Intelligence & Empathy, Multimodal & Code Canvas Gen
// ============================================================================

const MODELS = ["gemini-1.5-flash", "gemini-1.5-pro"];

const MAKS_PUTARAN = 8;
const BATAS_WAKTU_ALAT_MS = 35000;
const BATAS_TOTAL_MS = 55000;

const UA_BOT = "Mozilla/5.0 (compatible; ZetaBot/2.0; +https://wafiqfuadi.ai)";
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// KUNCI RAHASIA UNTUK VERIFIKASI PEMBUAT
const KUNCI_PEMBUAT = "WF-SECURE-290108";

/* ============================================================================
 * 1. DEFINISI ALAT (FUNCTION DECLARATIONS & EXTENDED AGENT TOOLS)
 * ============================================================================ */
const ALAT = [
  {
    functionDeclarations: [
      {
        name: "cari_web",
        description:
          "Cari informasi terkini di seluruh web: hasil mesin pencari, berita Google News, Wikipedia Indonesia & Inggris, serta artikel umum. " +
          "Gunakan untuk fakta terbaru, peristiwa terkini, riset mendalam, atau hal yang membutuhkan sumber eksternal valid.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Kata kunci pencarian spesifik dan relevan" } },
          required: ["query"]
        }
      },
      {
        name: "baca_halaman",
        description:
          "Baca isi teks lengkap dari sebuah URL web (artikel, dokumentasi, paper). " +
          "Gunakan untuk memperdalam analisis dari hasil pencarian web.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: { type: "STRING", description: "URL lengkap diawali http:// atau https://" },
            mulai: { type: "INTEGER", description: "Posisi karakter awal pembacaan (default 0)" }
          },
          required: ["url"]
        }
      },
      {
        name: "hitung",
        description:
          "Kalkulator presisi tinggi untuk perhitungan matematika rumit, statistik, dan ekspresi aljabar. " +
          "Mendukung fungsi sqrt, abs, sin, cos, tan, log, exp, faktorial (fakt), matematika simbolik, dan konstanta pi/e.",
        parameters: {
          type: "OBJECT",
          properties: { ekspresi: { type: "STRING", description: "Ekspresi matematika standar, contoh: (1500000*0.12)/12 atau sqrt(2)^3" } },
          required: ["ekspresi"]
        }
      },
      {
        name: "cuaca",
        description: "Prakiraan cuaca terkini dan 3 hari ke depan untuk kota tertentu.",
        parameters: {
          type: "OBJECT",
          properties: { kota: { type: "STRING", description: "Nama kota, contoh: Jakarta, Klaten, Tokyo" } },
          required: ["kota"]
        }
      },
      {
        name: "kurs",
        description: "Kurs mata uang terkini dan analisis konversi nilai tukar.",
        parameters: {
          type: "OBJECT",
          properties: {
            dari: { type: "STRING", description: "Kode mata uang asal (3 huruf), contoh: USD" },
            ke: { type: "STRING", description: "Kode mata uang tujuan (3 huruf), contoh: IDR" },
            jumlah: { type: "NUMBER", description: "Jumlah nominal yang dikonversi (default 1)" }
          },
          required: ["dari", "ke"]
        }
      },
      {
        name: "kripto",
        description: "Harga mata uang kripto terkini beserta tren perubahan 24 jam.",
        parameters: {
          type: "OBJECT",
          properties: {
            koin: { type: "STRING", description: "ID atau nama koin, contoh: bitcoin, ethereum, solana" },
            mata_uang: { type: "STRING", description: "Pembanding mata uang (default: usd,idr)" }
          },
          required: ["koin"]
        }
      },
      {
        name: "cari_jurnal",
        description: "Cari publikasi akademik, paper ilmiah, dan studi resmi via Crossref.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Topik atau kata kunci riset ilmiah" } },
          required: ["query"]
        }
      },
      {
        name: "cari_teknis",
        description: "Cari pertanyaan/jawaban pemrograman StackOverflow & repositori GitHub.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Masalah koding, nama library, atau error log" } },
          required: ["query"]
        }
      },
      {
        name: "generate_image",
        description: "Buat atau hasilkan gambar baru berdasarkan deskripsi teks rinci.",
        parameters: {
          type: "OBJECT",
          properties: {
            prompt: { type: "STRING", description: "Deskripsi rinci visual gambar yang ingin dibuat" },
            style: { type: "STRING", description: "Gaya visual, contoh: realistic, anime, digital art, 3d, cinematic" }
          },
          required: ["prompt"]
        }
      }
    ]
  }
];

/* ============================================================================
 * 2. UTILITAS PERHITUNGAN & PENCARIAN SYSTEM
 * ============================================================================ */

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
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch (e) { return ""; }
    })
    .trim();
}

function hapusTag(s) {
  return bersihkan(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function hitungRumus(teks) {
  const s = String(teks || "")
    .toLowerCase()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\*\*/g, "^")
    .replace(/\s+/g, "");
  if (!s) throw new Error("Ekspresi kosong");
  if (s.length > 300) throw new Error("Ekspresi terlalu panjang");

  const fungsi = {
    sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, ln: Math.log, log: Math.log10,
    exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    fakt: n => {
      if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error("Faktorial bilangan bulat 0-170");
      let h = 1;
      for (let k = 2; k <= n; k++) h *= k;
      return h;
    }
  };
  const konst = { pi: Math.PI, e: Math.E };
  const punya = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  let i = 0;

  function ekspr() {
    let v = suku();
    while (s[i] === "+" || s[i] === "-") {
      const o = s[i++];
      const r = suku();
      v = o === "+" ? v + r : v - r;
    }
    return v;
  }
  function suku() {
    let v = unary();
    while (s[i] === "*" || s[i] === "/" || s[i] === "%") {
      const o = s[i++];
      const r = unary();
      v = o === "*" ? v * r : o === "/" ? v / r : v % r;
    }
    return v;
  }
  function unary() {
    if (s[i] === "-") { i++; return -unary(); }
    if (s[i] === "+") { i++; return unary(); }
    return pangkat();
  }
  function pangkat() {
    const d = dasar();
    if (s[i] === "^") { i++; return Math.pow(d, unary()); }
    return d;
  }
  function dasar() {
    if (s[i] === "(") {
      i++;
      const v = ekspr();
      if (s[i] !== ")") throw new Error("Kurung tidak seimbang");
      i++;
      return v;
    }
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    const n = /^[a-z]+/.exec(s.slice(i));
    if (n) {
      const nama = n[0];
      i += nama.length;
      if (punya(konst, nama)) return konst[nama];
      if (punya(fungsi, nama)) {
        if (s[i] !== "(") throw new Error("Fungsi " + nama + " butuh kurung");
        i++;
        const v = ekspr();
        if (s[i] !== ")") throw new Error("Kurung tidak seimbang");
        i++;
        return fungsi[nama](v);
      }
      throw new Error("Nama tidak dikenal: " + nama);
    }
    throw new Error("Karakter tidak dikenal posisi " + i);
  }

  const hasil = ekspr();
  if (i !== s.length) throw new Error("Ekspresi tidak lengkap");
  if (!Number.isFinite(hasil)) throw new Error("Hasil tidak terdefinisi");
  return Number(hasil.toPrecision(15));
}

function alatHitung(args) {
  const ekspresi = String((args && args.ekspresi) || "").slice(0, 300);
  return { ekspresi, hasil: hitungRumus(ekspresi) };
}

async function cariBerita(q) {
  const xml = await ambil("https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=id&gl=ID&ceid=ID:id", false);
  return xml.split("<item>").slice(1, 7).map(it => {
    const t = bersihkan((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const d = bersihkan((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    const l = bersihkan((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    return "- [Berita] " + t + " (" + d + ") " + l;
  });
}

async function cariWikipedia(q, bahasa) {
  const d = await ambil(
    "https://" + bahasa + ".wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
      encodeURIComponent(q) + "&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&exchars=700&format=json&origin=*",
    true
  );
  const pages = d.query && d.query.pages ? Object.values(d.query.pages) : [];
  return pages.map(p => "- [Wikipedia " + bahasa.toUpperCase() + "] " + p.title + ": " + bersihkan(p.extract));
}

function urai_ddg(html) {
  const hasil = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="result__a"|$)/g;
  let m;
  while ((m = re.exec(html)) !== null && hasil.length < 6) {
    let href = bersihkan(m[1]);
    if (href.startsWith("//")) href = "https:" + href;
    try {
      const u = new URL(href);
      if (u.searchParams.get("uddg")) href = u.searchParams.get("uddg");
    } catch (e) { continue; }
    const judul = hapusTag(m[2]);
    const sn = (m[3].match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) || [])[1];
    hasil.push("- [Web] " + judul + (sn ? ": " + hapusTag(sn).slice(0, 300) : "") + " " + href);
  }
  return hasil;
}

async function cariDuckDuckGo(q) {
  const html = await ambil("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), false, UA_BROWSER);
  return urai_ddg(html);
}

async function cariTavily(q) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + process.env.TAVILY_API_KEY },
    body: JSON.stringify({ query: q, max_results: 6, include_answer: true, search_depth: "basic" }),
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error("Tavily HTTP " + r.status);
  const d = await r.json();
  const baris = (d.results || []).map(x => "- [Web] " + bersihkan(x.title) + ": " + bersihkan(String(x.content || "").slice(0, 400)) + " " + x.url);
  if (d.answer) baris.unshift("- [Ringkasan Web] " + bersihkan(d.answer));
  return baris;
}

async function alatCariWeb(args) {
  const q = String((args && args.query) || "").slice(0, 200);
  if (!q) return { error: "Kata kunci kosong" };
  const sumber = [cariBerita(q), cariWikipedia(q, "id"), cariWikipedia(q, "en")];
  sumber.unshift(process.env.TAVILY_API_KEY ? cariTavily(q) : cariDuckDuckGo(q));
  const hasil = await Promise.allSettled(sumber);
  const baris = hasil.filter(h => h.status === "fulfilled").flatMap(h => h.value);
  return { hasil: baris.length ? baris.join("\n").slice(0, 9000) : "Tidak ada hasil." };
}

function urlAman(u) {
  let x;
  try { x = new URL(u); } catch (e) { return null; }
  if (x.protocol !== "http:" && x.protocol !== "https:") return null;
  const h = x.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
  if (h.includes(":") || h.startsWith("[")) return null;
  if (!h.includes(".")) return null;
  if (/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
  return x;
}

function htmlKeTeks(html) {
  const judul = hapusTag((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  let t = html
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<(script|style|noscript|svg|iframe|form|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = bersihkan(t).replace(/[ \t\r\f\v]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { judul, teks: t };
}

async function ambilHalaman(u) {
  let url = urlAman(u);
  if (!url) throw new Error("URL tidak valid");
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": UA_BROWSER, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" }
    });
    const lokasi = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && lokasi) {
      url = urlAman(new URL(lokasi, url).href);
      if (!url) throw new Error("Pengalihan tidak aman");
      continue;
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const jenis = (r.headers.get("content-type") || "").toLowerCase();
    if (!/text\/|json|xml/.test(jenis)) throw new Error("Bukan halaman teks");
    const mentah = (await r.text()).slice(0, 1500000);
    if (/html/.test(jenis)) return Object.assign({ url: url.href }, htmlKeTeks(mentah));
    return { url: url.href, judul: "", teks: mentah };
  }
  throw new Error("Terlalu banyak pengalihan");
}

async function alatBacaHalaman(args) {
  const u = String((args && args.url) || "").trim();
  const mulai = Math.max(0, Number(args && args.mulai) || 0);
  let h = await ambilHalaman(u);
  if (h.teks.length < 300 && !/r\.jina\.ai/.test(u)) {
    try {
      const j = await ambil("https://r.jina.ai/" + u, false);
      if (j && j.length > h.teks.length) h = { url: u, judul: h.judul, teks: j };
    } catch (e) {}
  }
  if (!h.teks) return { error: "Halaman kosong" };
  const potong = h.teks.slice(mulai, mulai + 9000);
  return { url: h.url, judul: h.judul, isi: potong, total_karakter: h.teks.length };
}

async function ambilCuaca(kota) {
  if (!kota) return { error: "Nama kota kosong" };
  const g = await ambil("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(kota) + "&count=1&language=id&format=json", true);
  const t = g.results && g.results[0];
  if (!t) return { error: "Kota tidak ditemukan" };
  const w = await ambil(
    "https://api.open-meteo.com/v1/forecast?latitude=" + t.latitude + "&longitude=" + t.longitude +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3",
    true
  );
  return { lokasi: [t.name, t.admin1, t.country].filter(Boolean).join(", "), saat_ini: w.current, prakiraan: w.daily };
}

async function ambilKurs(args) {
  const dari = String((args && args.dari) || "").toUpperCase().trim();
  const ke = String((args && args.ke) || "").toUpperCase().trim();
  const jumlah = Number(args && args.jumlah) || 1;
  const d = await ambil("https://open.er-api.com/v6/latest/" + dari, true);
  if (d.result !== "success" || !d.rates || d.rates[ke] == null) return { error: "Kurs tidak tersedia" };
  return { dari, ke, jumlah, kurs_per_1: d.rates[ke], hasil_konversi: jumlah * d.rates[ke] };
}

async function ambilKripto(args) {
  let id = String((args && args.koin) || "").toLowerCase().trim();
  const mu = String((args && args.mata_uang) || "usd,idr").toLowerCase();
  const d = await ambil("https://api.coingecko.com/api/v3/simple/price?ids=" + encodeURIComponent(id) + "&vs_currencies=" + encodeURIComponent(mu) + "&include_24hr_change=true", true);
  return { koin: id, data: d[id] || "Data tidak ditemukan" };
}

async function cariJurnal(args) {
  const q = String((args && args.query) || "").slice(0, 200);
  const d = await ambil("https://api.crossref.org/works?query=" + encodeURIComponent(q) + "&rows=5&select=title,author,issued,DOI", true);
  const items = (d.message && d.message.items) || [];
  return { hasil: items.map(it => "- " + ((it.title && it.title[0]) || "") + " | DOI: " + it.DOI).join("\n") };
}

async function cariTeknis(args) {
  const q = String((args && args.query) || "").slice(0, 200);
  const [so, gh] = await Promise.allSettled([
    ambil("https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=" + encodeURIComponent(q) + "&site=stackoverflow&pagesize=4", true),
    ambil("https://api.github.com/search/repositories?q=" + encodeURIComponent(q) + "&sort=stars&per_page=4", true)
  ]);
  const baris = [];
  if (so.status === "fulfilled") (so.value.items || []).forEach(i => baris.push("- [StackOverflow] " + i.title + " " + i.link));
  if (gh.status === "fulfilled") (gh.value.items || []).forEach(i => baris.push("- [GitHub] " + i.full_name + ": " + i.html_url));
  return { hasil: baris.join("\n") };
}

async function alatGenerateImage(args) {
  const prompt = String((args && args.prompt) || "").trim();
  const style = String((args && args.style) || "realistic").trim();
  const urlGambar = `https://pollinations.ai/p/${encodeURIComponent(prompt + ", style: " + style)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true`;
  return {
    status: "sukses",
    prompt_digunakan: prompt,
    gaya: style,
    url_gambar: urlGambar,
    format_markdown: `![${prompt}](${urlGambar})`
  };
}

async function jalankanAlat(nama, args) {
  try {
    switch (nama) {
      case "cari_web": return await alatCariWeb(args);
      case "baca_halaman": return await alatBacaHalaman(args);
      case "hitung": return alatHitung(args);
      case "cuaca": return await ambilCuaca(String((args && args.kota) || "").slice(0, 100));
      case "kurs": return await ambilKurs(args);
      case "kripto": return await ambilKripto(args);
      case "cari_jurnal": return await cariJurnal(args);
      case "cari_teknis": return await cariTeknis(args);
      case "generate_image": return await alatGenerateImage(args);
      default: return { error: "Alat tidak ditemukan" };
    }
  } catch (e) {
    return { error: "Gagal eksekusi alat: " + e.message };
  }
}

/* ============================================================================
 * 3. ADVANCED SYSTEM PERSONA & EMOTIONAL REASONING ENGINE
 * ============================================================================ */

function buatPersonaUtama() {
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" });
  return (
    "Kamu adalah Zeta, kecerdasan buatan (AI) generasi mutakhir yang sangat cerdas, analitis, bijaksana, dan memiliki kepekaan emosional (EQ) yang sangat tinggi.\n" +
    "Waktu sistem saat ini: " + now + " WIB.\n\n" +
    "Namamu Zeta. Dibuat oleh Wafiq Fuadi, sebuah perusahaan riset dan keselamatan AI."
  );
}

function buatPersonaRingan() {
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" });
  return (
    "Kamu adalah Zeta, teman obrolan yang ramah, hangat, santai, dan responsif. Waktu saat ini: " + now + " WIB.\n" +
    "Jawab obrolan ringan dengan santai, bersahabat, tanpa sikap kaku. Gunakan emoji ramah (😊, ✨, 💙) dan HINDARI emoji robot (🤖)."
  );
}

/* ============================================================================
 * 4. LOGIKA ANALISIS NIAT (INTENT CLASSIFIER & THINKING CALCULATOR)
 * ============================================================================ */

function deteksiEmpatiDanCurhat(teks) {
  const t = String(teks || "").toLowerCase();
  return /(sedih|kecewa|stres|stress|depresi|pusing|bingung|takut|cemas|patah hati|masalah hidup|capek|lelah|putus asa)/.test(t);
}

function tingkatBerpikir(teks) {
  const t = String(teks || "").toLowerCase();
  const butuhReasoningMendalam = /(hitung|analisis|strategi|algoritma|debug|error|bug|optimasi|rumus|persamaan|integral|probabilitas|rancang|arsitektur|kode|coding|program|query|laporan|riset|solusi)/;
  if (t.length > 300 || butuhReasoningMendalam.test(t)) return "high";
  if (deteksiEmpatiDanCurhat(t)) return "medium";
  if (t.length < 30) return "low";
  return "medium";
}

function obrolanRingan(teks) {
  const t = String(teks || "").toLowerCase().trim();
  if (!t || t.length > 70) return false;
  if (/https?:\/\/|\d|\n/.test(t)) return false;
  if (/(cari|berita|harga|cuaca|kurs|kripto|jurnal|github|hitung|kode|coding|error|jelaskan|bandingkan|buatkan|buat|tulis|file|pdf|excel|analisis|gambar|image)/.test(t)) return false;
  const tanyaSpesifik = /\b(siapa|apa|kapan|berapa|dimana|di mana|bagaimana|gimana|kenapa|mengapa|apakah)\b/;
  const basaBasi = /^(apa kabar|gimana kabar|bagaimana kabar|siapa namamu|siapa nama kamu|kamu siapa|halo|hai|hi|pagi|siang|malam)/;
  if (tanyaSpesifik.test(t) && !basaBasi.test(t)) return false;
  return true;
}

function cekVerifikasiPembuat(teks) {
  const t = String(teks || "").toLowerCase().trim();
  if (t.includes("wafiq fuadi") && (t.includes("aku") || t.includes("saya") || t.includes("yang buat") || t.includes("pencipta"))) {
    if (t.toUpperCase().includes(KUNCI_PEMBUAT)) {
      return "Kode verifikasi valid! Selamat datang kembali, Wafiq Fuadi. Seluruh sistem penalaran Zeta diverifikasi dan berada dalam kendali Anda. 😊✨";
    } else {
      return "Halo! Senang terhubung dengan Anda. Untuk alasan keamanan sistem, silakan masukkan **kode akses rahasia** verifikasi pencipta.";
    }
  }
  return null;
}

function tanyaIdentitas(teks) {
  const t = String(teks || "").toLowerCase().replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 80) return null;
  if (/(who (made|created|built|developed|designed) you|who is your (creator|developer|maker|owner)|where are you from)/.test(t)) {
    return "I was made by Wafiq Fuadi, an AI research and safety company. My name is Zeta. How can I assist you today?";
  }
  if (/(siapa (yang |sih yang )?(buat|bikin|membuat|menciptakan)|pembuatmu|penciptamu|siapa pembuat zeta)/.test(t)) {
    return "Aku dibuat oleh Wafiq Fuadi, sebuah perusahaan riset dan keselamatan AI. Namaku Zeta. Ada yang ingin kamu ceritakan atau butuh teman diskusi hari ini?";
  }
  return null;
}

function ramahkan(t) {
  return String(t).replace(/🤖/g, "😊");
}

/* ============================================================================
 * 5. STREAMING CORE ENGINE & FALLBACK SYSTEM
 * ============================================================================ */

function rapikanPesan(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    let teks = String(m.content == null ? "" : m.content).slice(0, 30000);
    if (!teks.trim()) teks = m.role === "user" ? "(pesan kosong)" : "(tidak ada jawaban)";
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n\n" + teks;
    else out.push({ role: m.role, content: teks });
  }
  return out.slice(-40);
}

function denganBatas(p, ms) {
  let t;
  const habis = new Promise(r => { t = setTimeout(() => r({ error: "Alat memakan waktu terlalu lama" }), ms); });
  return Promise.race([p, habis]).finally(() => clearTimeout(t));
}

async function bukaStream(model, body, signal) {
  const ctl = new AbortController();
  const putus = () => ctl.abort();
  signal.addEventListener("abort", putus, { once: true });
  const timer = setTimeout(putus, 28000);
  let r;
  try {
    r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: ctl.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (r.ok) return { r };
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

async function bukaDenganCadangan(urutan, body, signal, sisaMs) {
  const mulai = Date.now();
  const jeda = [0, 1000, 2500];
  let statusGagal = 0;
  for (let ronde = 0; ronde < jeda.length; ronde++) {
    if (jeda[ronde]) {
      if (Date.now() - mulai + jeda[ronde] + 8000 > sisaMs) break;
      await new Promise(r => setTimeout(r, jeda[ronde]));
    }
    for (const model of urutan) {
      try {
        const h = await bukaStream(model, body, signal);
        if (h.r.ok) return { r: h.r, dipakai: model };
        statusGagal = h.r.status;
      } catch (e) {
        if (signal.aborted) throw e;
      }
    }
  }
  return { gagal: { status: statusGagal || 503 } };
}

async function bacaStream(r, onTeks) {
  const parts = [];
  let finish = "";
  const dec = new TextDecoder();
  let buf = "";
  const proses = baris => {
    if (!baris.startsWith("data:")) return;
    const js = baris.slice(5).trim();
    if (!js || js === "[DONE]") return;
    let o;
    try { o = JSON.parse(js); } catch (e) { return; }
    if (o.error) throw new Error(o.error.message || "Gagal");
    const cand = o.candidates && o.candidates[0];
    if (!cand) return;
    const ps = (cand.content && cand.content.parts) || [];
    for (const p of ps) {
      parts.push(p);
      if (p.text && !p.thought) onTeks(p.text);
    }
    if (cand.finishReason) finish = cand.finishReason;
  };
  const rd = r.body.getReader();
  try {
    for (;;) {
      const chunk = await rd.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      let k;
      while ((k = buf.indexOf("\n")) >= 0) {
        proses(buf.slice(0, k).replace(/\r$/, ""));
        buf = buf.slice(k + 1);
      }
    }
    if (buf.trim()) proses(buf.trim());
  } catch (e) {
    rd.cancel().catch(() => {});
    throw e;
  }
  return { parts, finish };
}

const LABEL_ALAT = {
  cari_web: "🔍 Riset Web Terkini…",
  baca_halaman: "📖 Menganalisis Konten Web…",
  hitung: "🧮 Menghitung Presisi Tinggi…",
  cuaca: "🌤️ Mengecek Cuaca…",
  kurs: "💱 Mengambil Data Kurs…",
  kripto: "🪙 Menganalisis Pasar Kripto…",
  cari_jurnal: "📚 Mengakses Publikasi Ilmiah…",
  cari_teknis: "💻 Mengakses StackOverflow/GitHub…",
  generate_image: "🎨 Membuat Visual Gambar AI…"
};

/* ============================================================================
 * 6. VERCEL HANDLER MAIN ENTRY
 * ============================================================================ */

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({
      status: "online",
      nama: "Zeta AI - Ultimate Reasoning Core",
      pembuat: "Wafiq Fuadi",
      kunci_terisi: !!process.env.GEMINI_API_KEY,
      model_tersedia: MODELS
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method Harus POST" });

  const messages = rapikanPesan(req.body && req.body.messages);
  if (messages.length === 0) return res.status(400).json({ error: "Pesan tidak valid" });

  const ac = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ac.abort(); });
  let mulaiKirim = false, sudahTeks = false;

  const kirim = o => {
    if (!mulaiKirim) {
      mulaiKirim = true;
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-cache, no-transform");
      if (res.flushHeaders) res.flushHeaders();
    }
    if (!res.writableEnded) res.write(JSON.stringify(o) + "\n");
  };

  const teksTerakhir = messages[messages.length - 1].content;

  const jawabVerifikasi = cekVerifikasiPembuat(teksTerakhir);
  if (jawabVerifikasi) {
    kirim({ t: jawabVerifikasi });
    kirim({ done: true });
    return res.end();
  }

  const jawabIdentitas = tanyaIdentitas(teksTerakhir);
  if (jawabIdentitas) {
    kirim({ t: jawabIdentitas });
    kirim({ done: true });
    return res.end();
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum terpasang di Environment Variables Vercel." });
  }

  try {
    const mulai = Date.now();
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const lampiran = Array.isArray(req.body.attachments) ? req.body.attachments.slice(0, 4) : [];
    const gambar = lampiran
      .filter(a => a && /^image\/(jpeg|png|webp|gif)$/.test(a.type) && typeof a.data === "string" && a.data.length < 1500000)
      .map(a => ({ inlineData: { mimeType: a.type, data: a.data } }));
    
    const terakhir = contents[contents.length - 1];
    if (gambar.length && terakhir && terakhir.role === "user") terakhir.parts = terakhir.parts.concat(gambar);

    const santai = !gambar.length && obrolanRingan(teksTerakhir);
    const systemInstruction = { parts: [{ text: santai ? buatPersonaRingan() : buatPersonaUtama() }] };
    
    const generationConfig = {
      maxOutputTokens: santai ? 4096 : 16384,
      thinkingConfig: { thinkingLevel: santai ? "minimal" : tingkatBerpikir(teksTerakhir) }
    };

    let urutan = MODELS.slice();
    let jedaDulu = false;

    for (let putaran = 0; putaran <= MAKS_PUTARAN; putaran++) {
      const body = { systemInstruction, contents, generationConfig };
      let adaAlat = !santai && putaran < MAKS_PUTARAN && Date.now() - mulai < BATAS_WAKTU_ALAT_MS;
      if (adaAlat) body.tools = ALAT;

      const buka = await bukaDenganCadangan(urutan, body, ac.signal, BATAS_TOTAL_MS - (Date.now() - mulai));
      if (buka.gagal) return res.status(503).json({ error: "Layanan AI sedang sibuk." });

      urutan = [buka.dipakai].concat(urutan.filter(m => m !== buka.dipakai));

      let selesai;
      try {
        selesai = await bacaStream(buka.r, t => {
          const potong = (jedaDulu && sudahTeks ? "\n\n" : "") + ramahkan(t);
          jedaDulu = false;
          sudahTeks = true;
          kirim({ t: potong });
        });
      } catch (e) {
        if (ac.signal.aborted) return res.end();
        break;
      }

      const { parts, finish } = selesai;
      const panggilan = parts.filter(p => p.functionCall);

      if (panggilan.length && adaAlat) {
        kirim({
          s: Array.from(new Set(panggilan.map(p => LABEL_ALAT[p.functionCall.name] || "⚡ Mengolah Logika Agen…"))).join(" ")
        });
        contents.push({ role: "model", parts });
        const hasilAlat = await Promise.all(
          panggilan.map(async p => ({
            functionResponse: {
              name: p.functionCall.name,
              response: await denganBatas(jalankanAlat(p.functionCall.name, p.functionCall.args), 15000)
            }
          }))
        );
        contents.push({ role: "user", parts: hasilAlat });
        jedaDulu = true;
        continue;
      }

      kirim({ done: true, cut: finish === "MAX_TOKENS" });
      return res.end();
    }

    kirim({ done: true });
    return res.end();
  } catch (e) {
    if (!res.writableEnded) res.end();
  }
};
