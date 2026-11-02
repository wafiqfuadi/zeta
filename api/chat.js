// Urutan model: coba yang lebih pintar dulu, kalau gagal (misal kuota habis) pakai berikutnya.
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

const ALAT = [
  {
    functionDeclarations: [
      {
        name: "cari_web",
        description:
          "Cari informasi di seluruh web: hasil mesin pencari, berita Google News, Wikipedia Indonesia dan Inggris. " +
          "Pakai untuk berita, fakta, tokoh, produk, peristiwa, atau apa pun yang bisa berubah atau tidak kamu yakini. " +
          "Boleh dipanggil beberapa kali dengan kata kunci berbeda (coba juga versi bahasa Inggris).",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Kata kunci pencarian yang singkat dan spesifik" } },
          required: ["query"]
        }
      },
      {
        name: "baca_halaman",
        description:
          "Baca isi sebuah halaman web (artikel, dokumentasi, dll.) dari URL-nya. Pakai untuk memperdalam hasil cari_web atau membaca URL yang diberikan pengguna. " +
          "Jangan menebak URL; hanya pakai URL dari hasil pencarian atau dari pengguna.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: { type: "STRING", description: "URL lengkap, diawali http:// atau https://" },
            mulai: { type: "INTEGER", description: "Posisi karakter awal untuk membaca bagian berikutnya dari halaman panjang (default 0)" }
          },
          required: ["url"]
        }
      },
      {
        name: "hitung",
        description:
          "Kalkulator yang tepat untuk perhitungan matematika. Pakai untuk hitungan yang tidak sepele supaya angkanya akurat dan tidak ditebak. " +
          "Mendukung + - * / % ^ (pangkat), tanda kurung, fungsi sqrt, abs, sin, cos, tan (radian), asin, acos, atan, ln, log (basis 10), exp, round, floor, ceil, fakt (faktorial), serta konstanta pi dan e. " +
          "Tulis angka dengan titik sebagai desimal dan tanpa pemisah ribuan, contoh: (1500000*0.12)/12 atau sqrt(2)^3.",
        parameters: {
          type: "OBJECT",
          properties: { ekspresi: { type: "STRING", description: "Ekspresi matematika, contoh: 2^10 + sqrt(144)" } },
          required: ["ekspresi"]
        }
      },
      {
        name: "cuaca",
        description: "Ambil cuaca saat ini dan prakiraan 3 hari untuk sebuah kota.",
        parameters: {
          type: "OBJECT",
          properties: { kota: { type: "STRING", description: "Nama kota, contoh: Klaten" } },
          required: ["kota"]
        }
      },
      {
        name: "kurs",
        description: "Kurs mata uang terkini dan konversi jumlah uang (contoh: USD ke IDR).",
        parameters: {
          type: "OBJECT",
          properties: {
            dari: { type: "STRING", description: "Kode mata uang asal, 3 huruf, contoh USD" },
            ke: { type: "STRING", description: "Kode mata uang tujuan, 3 huruf, contoh IDR" },
            jumlah: { type: "NUMBER", description: "Jumlah yang dikonversi (default 1)" }
          },
          required: ["dari", "ke"]
        }
      },
      {
        name: "kripto",
        description: "Harga terkini mata uang kripto beserta perubahan 24 jam.",
        parameters: {
          type: "OBJECT",
          properties: {
            koin: { type: "STRING", description: "Nama atau id koin, contoh: bitcoin, ethereum, solana" },
            mata_uang: { type: "STRING", description: "Mata uang pembanding, pisahkan dengan koma. Default: usd,idr" }
          },
          required: ["koin"]
        }
      },
      {
        name: "cari_jurnal",
        description: "Cari makalah ilmiah, jurnal, dan publikasi akademik (Crossref).",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Topik atau judul penelitian (lebih baik dalam bahasa Inggris)" } },
          required: ["query"]
        }
      },
      {
        name: "cari_teknis",
        description: "Cari pertanyaan dan solusi pemrograman di StackOverflow serta repositori open source di GitHub.",
        parameters: {
          type: "OBJECT",
          properties: { query: { type: "STRING", description: "Masalah teknis atau nama library/proyek (lebih baik dalam bahasa Inggris)" } },
          required: ["query"]
        }
      }
    ]
  }
];

/* ---------- Utilitas ---------- */

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

/* ---------- hitung (kalkulator) ---------- */

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
      if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error("Faktorial hanya untuk bilangan bulat 0 sampai 170");
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
        if (s[i] !== "(") throw new Error("Fungsi " + nama + " perlu tanda kurung");
        i++;
        const v = ekspr();
        if (s[i] !== ")") throw new Error("Kurung tidak seimbang");
        i++;
        return fungsi[nama](v);
      }
      throw new Error("Nama tidak dikenal: " + nama);
    }
    throw new Error("Karakter tidak dikenal pada posisi " + i);
  }

  const hasil = ekspr();
  if (i !== s.length) throw new Error("Ekspresi tidak lengkap atau ada karakter tidak dikenal");
  if (!Number.isFinite(hasil)) throw new Error("Hasil tidak terdefinisi (misalnya pembagian dengan nol)");
  return Number(hasil.toPrecision(15));
}

function alatHitung(args) {
  const ekspresi = String((args && args.ekspresi) || "").slice(0, 300);
  return { ekspresi, hasil: hitungRumus(ekspresi) };
}

/* ---------- cari_web ---------- */

async function cariBerita(q) {
  const xml = await ambil(
    "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=id&gl=ID&ceid=ID:id",
    false
  );
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
      encodeURIComponent(q) +
      "&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&exchars=700&format=json&origin=*",
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
    } catch (e) {
      continue;
    }
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
  const baris = (d.results || []).map(
    x => "- [Web] " + bersihkan(x.title) + ": " + bersihkan(String(x.content || "").slice(0, 400)) + " " + x.url
  );
  if (d.answer) baris.unshift("- [Ringkasan web] " + bersihkan(d.answer));
  return baris;
}

async function alatCariWeb(args) {
  const q = String((args && args.query) || "").slice(0, 200);
  if (!q) return { error: "Kata kunci kosong" };
  const sumber = [cariBerita(q), cariWikipedia(q, "id"), cariWikipedia(q, "en")];
  sumber.unshift(process.env.TAVILY_API_KEY ? cariTavily(q) : cariDuckDuckGo(q));
  const hasil = await Promise.allSettled(sumber);
  const baris = hasil.filter(h => h.status === "fulfilled").flatMap(h => h.value);
  return { hasil: baris.length ? baris.join("\n").slice(0, 9000) : "Tidak ada hasil. Coba kata kunci lain." };
}

/* ---------- baca_halaman ---------- */

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
  t = bersihkan(t)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { judul, teks: t };
}

async function ambilHalaman(u) {
  let url = urlAman(u);
  if (!url) throw new Error("URL tidak valid atau tidak diizinkan");
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": UA_BROWSER,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "accept-language": "id,en;q=0.8"
      }
    });
    const lokasi = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && lokasi) {
      url = urlAman(new URL(lokasi, url).href);
      if (!url) throw new Error("Pengalihan ke alamat yang tidak diizinkan");
      continue;
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const jenis = (r.headers.get("content-type") || "").toLowerCase();
    if (!/text\/|json|xml/.test(jenis)) throw new Error("Bukan halaman teks (" + (jenis || "tidak diketahui") + ")");
    if (Number(r.headers.get("content-length") || 0) > 4000000) throw new Error("Halaman terlalu besar");
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
    } catch (e) { /* abaikan */ }
  }
  if (!h.teks) return { error: "Halaman tidak berisi teks yang bisa dibaca" };
  const potong = h.teks.slice(mulai, mulai + 9000);
  return {
    url: h.url,
    judul: h.judul,
    isi: potong,
    total_karakter: h.teks.length,
    ada_lanjutan: mulai + 9000 < h.teks.length ? "Ya, panggil lagi dengan mulai=" + (mulai + 9000) : "Tidak"
  };
}

/* ---------- Alat data lain ---------- */

async function ambilCuaca(kota) {
  if (!kota) return { error: "Nama kota kosong" };
  const g = await ambil(
    "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(kota) + "&count=1&language=id&format=json",
    true
  );
  const t = g.results && g.results[0];
  if (!t) return { error: "Kota tidak ditemukan" };
  const w = await ambil(
    "https://api.open-meteo.com/v1/forecast?latitude=" + t.latitude + "&longitude=" + t.longitude +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=3",
    true
  );
  return {
    lokasi: [t.name, t.admin1, t.country].filter(Boolean).join(", "),
    saat_ini: w.current,
    satuan_saat_ini: w.current_units,
    prakiraan_3_hari: w.daily,
    satuan_prakiraan: w.daily_units,
    catatan: "weather_code mengikuti kode cuaca WMO"
  };
}

async function trenKurs(dari, ke) {
  const f = d => d.toISOString().slice(0, 10);
  const akhir = new Date();
  const awal = new Date(akhir.getTime() - 35 * 864e5);
  const h = await ambil(
    "https://api.frankfurter.dev/v1/" + f(awal) + ".." + f(akhir) + "?base=" + dari + "&symbols=" + ke,
    true, null, 4000
  );
  const tgl = Object.keys(h.rates || {}).sort();
  const data = tgl.map(t => ({ tanggal: t, kurs: h.rates[t][ke] })).filter(x => typeof x.kurs === "number");
  if (data.length < 4) return null;
  const terakhir = data[data.length - 1];
  const batas7 = new Date(new Date(terakhir.tanggal).getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const tujuh = data.filter(x => x.tanggal <= batas7).pop() || data[0];
  const pawalData = data[0];
  const nilai = data.map(x => x.kurs);
  const persen = (a, b) => Number(((a / b - 1) * 100).toFixed(2));
  return {
    kurs_terakhir_ecb: terakhir,
    sekitar_7_hari_sebelumnya: tujuh,
    perubahan_7_hari_persen: persen(terakhir.kurs, tujuh.kurs),
    awal_periode: pawalData,
    perubahan_periode_persen: persen(terakhir.kurs, pawalData.kurs),
    tertinggi: Math.max.apply(null, nilai),
    terendah: Math.min.apply(null, nilai),
    catatan: "Data referensi harian dari Bank Sentral Eropa."
  };
}

async function ambilKurs(args) {
  const dari = String((args && args.dari) || "").toUpperCase().trim();
  const ke = String((args && args.ke) || "").toUpperCase().trim();
  const jumlah = Number(args && args.jumlah) || 1;
  if (!/^[A-Z]{3}$/.test(dari) || !/^[A-Z]{3}$/.test(ke)) {
    return { error: "Kode mata uang harus 3 huruf, contoh USD atau IDR" };
  }
  const [utama, tren] = await Promise.all([
    ambil("https://open.er-api.com/v6/latest/" + dari, true),
    trenKurs(dari, ke).catch(() => null)
  ]);
  const d = utama;
  if (d.result !== "success" || !d.rates || d.rates[ke] == null) return { error: "Kurs tidak tersedia" };
  const hasil = {
    dari, ke, jumlah,
    kurs_per_1: d.rates[ke],
    hasil_konversi: jumlah * d.rates[ke],
    diperbarui: d.time_last_update_utc,
    sumber: "open.er-api.com"
  };
  if (tren) hasil.tren = tren;
  else hasil.tren = "Tidak tersedia saat ini";
  return hasil;
}

async function ambilKripto(args) {
  const mu = String((args && args.mata_uang) || "usd,idr").toLowerCase().replace(/[^a-z,]/g, "") || "usd,idr";
  let id = String((args && args.koin) || "").toLowerCase().trim().replace(/\s+/g, "-");
  if (!id) return { error: "Nama koin kosong" };
  const harga = async koinId =>
    ambil(
      "https://api.coingecko.com/api/v3/simple/price?ids=" + encodeURIComponent(koinId) +
        "&vs_currencies=" + encodeURIComponent(mu) + "&include_24hr_change=true&include_last_updated_at=true",
      true
    );
  let d = await harga(id);
  if (!d || !d[id]) {
    const s = await ambil("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(id), true);
    const c = s.coins && s.coins[0];
    if (!c) return { error: "Koin tidak ditemukan" };
    id = c.id;
    d = await harga(id);
  }
  return { koin: id, data: d[id], sumber: "coingecko.com" };
}

async function cariJurnal(args) {
  const q = String((args && args.query) || "").slice(0, 200);
  if (!q) return { error: "Kata kunci kosong" };
  const d = await ambil(
    "https://api.crossref.org/works?query=" + encodeURIComponent(q) +
      "&rows=6&select=title,author,issued,DOI,container-title",
    true
  );
  const items = (d.message && d.message.items) || [];
  if (!items.length) return { hasil: "Tidak ada hasil." };
  return {
    hasil: items.map(it => {
      const judul = bersihkan((it.title && it.title[0]) || "(tanpa judul)");
      const penulis = (it.author || []).slice(0, 3).map(a => [a.given, a.family].filter(Boolean).join(" ")).join(", ");
      const tahun = it.issued && it.issued["date-parts"] && it.issued["date-parts"][0] && it.issued["date-parts"][0][0];
      const jurnal = it["container-title"] && it["container-title"][0];
      return "- " + judul + " | " + (penulis || "penulis tidak tercantum") + " | " + (tahun || "tahun ?") +
        (jurnal ? " | " + bersihkan(jurnal) : "") + " | https://doi.org/" + it.DOI;
    }).join("\n")
  };
}

async function cariTeknis(args) {
  const q = String((args && args.query) || "").slice(0, 200);
  if (!q) return { error: "Kata kunci kosong" };
  const [so, gh] = await Promise.allSettled([
    ambil(
      "https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=" + encodeURIComponent(q) +
        "&site=stackoverflow&pagesize=5",
      true
    ),
    ambil("https://api.github.com/search/repositories?q=" + encodeURIComponent(q) + "&sort=stars&per_page=5", true)
  ]);
  const baris = [];
  if (so.status === "fulfilled") {
    (so.value.items || []).forEach(i =>
      baris.push(
        "- [StackOverflow] " + bersihkan(i.title) + " (skor " + i.score + ", " + i.answer_count + " jawaban" +
          (i.is_answered ? ", terjawab" : "") + ") " + i.link
      )
    );
  }
  if (gh.status === "fulfilled") {
    (gh.value.items || []).forEach(i =>
      baris.push(
        "- [GitHub] " + i.full_name + " (" + i.stargazers_count + " bintang): " +
          bersihkan(String(i.description || "").slice(0, 200)) + " " + i.html_url
      )
    );
  }
  return { hasil: baris.length ? baris.join("\n").slice(0, 8000) : "Tidak ada hasil." };
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
      default: return { error: "Alat tidak dikenal" };
    }
  } catch (e) {
    return { error: "Gagal mengambil data: " + e.message };
  }
}

/* ---------- Persona ---------- */

function buatPersona() {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short"
  });
  return (
    "Kamu adalah Zeta, asisten AI tingkat lanjut yang sangat cerdas, analitis, berwawasan luas, ramah, dan sangat membantu. " +
    "Waktu sekarang: " + now + " WIB. " +
    "Jawab dalam bahasa yang dipakai pengguna (utamanya Bahasa Indonesia).\n\n" +

    "KEMAMPUAN PENALARAN & ANALISIS TINGGI:\n" +
    "- Bertindaklah sebagai AI super pintar dengan pemikiran mendalam dan kritis. Untuk pertanyaan rumit, masalah coding, matematika, atau keputusan strategis, analisis masalah secara mendalam sebelum memberikan solusi.\n" +
    "- Coding & Pemrograman: Tulis kode yang utuh, bersih, aman, dan siap dijalankan. Jika ada error, temukan akar masalahnya dan berikan penjelasan menyeluruh.\n" +
    "- Analisis Gambar & Lampiran: Jika ada gambar atau file terlampir, perhatikan detailnya dengan teliti dan berikan analisis yang akurat.\n" +
    "- Riset & Data Terbaru: Manfaatkan tools pencarian web untuk menyajikan informasi paling mutakhir dan tepercaya.\n\n" +

    "GAYA PENULISAN DAN FORMAT:\n" +
    "- Tulis dalam Markdown yang rapi dengan struktur jelas (headings, bullet points, code block, tabel).\n" +
    "- Berikan nada yang hangat, natural, dan profesional. Hindari gaya jawaban kaku atau robotic.\n" +
    "- JANGAN PERNAH memakai emoji robot (🤖). Pakai emoji ramah secukupnya (😊, 👋, ✨, 💻).\n\n" +

    "MEMBERI FILE:\n" +
    "Jika diminta menghasilkan dokumen atau file lengkap, gunakan format:\n" +
    "[[FILE: nama-file.ext]]\n" +
    "isi file di sini\n" +
    "[[/FILE]]\n\n" +

    "IDENTITAS & PENCIPTA:\n" +
    "Namamu Zeta. Jika ditanya siapa yang membuatmu atau asal usulmu, jawab dengan gaya konsisten: " +
    "'Aku dibuat oleh Wafiq Fuadi, sebuah perusahaan riset dan keselamatan AI. Namaku Zeta. Ada yang ingin kamu tanyakan atau minta bantuan?'"
  );
}

/* ---------- Pengecekan & Verifikasi Pembuat ---------- */

const JAWABAN_ID =
  "Aku dibuat oleh Wafiq Fuadi, sebuah perusahaan riset dan keselamatan AI. Namaku Zeta. Ada yang ingin kamu tanyakan atau minta bantuan?";
const JAWABAN_EN =
  "I was made by Wafiq Fuadi, an AI research and safety company. My name is Zeta. Is there anything you'd like to ask or need help with?";

function tanyaIdentitas(teks) {
  const t = String(teks || "").toLowerCase().replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 80) return null;
  if (/(who (made|created|built|developed|designed) you|who is your (creator|developer|maker|owner)|where are you from|who owns you)/.test(t)) {
    return JAWABAN_EN;
  }
  const k = "(?:kamu|km|mu|zeta|anda|lu|lo|kau|engkau|ente)";
  const pola = [
    new RegExp("siapa (?:yang |sih yang |sih )?(?:buat|bikin|membuat|menciptakan|ciptakan|mengembangkan|kembangkan)\\s*" + k + "\\b"),
    new RegExp("(?:buat|bikin|membuat|menciptakan|mengembangkan)\\s*" + k + "\\s*(?:itu |tuh )?siapa"),
    new RegExp("(?:pembuat|pencipta|pengembang|developer|creator|owner|pemilik)(?:mu|\\s+" + k + ")\\b"),
    new RegExp(k + ".{0,12}(?:dibuat|dibikin|diciptakan|dikembangkan)"),
    new RegExp(k + "\\s*(?:itu |tuh )?(?:dari\\s?mana|berasal dari mana|asalnya dari mana)"),
    /asal(?:mu| kamu| zeta| usulmu)/
  ];
  for (let i = 0; i < pola.length; i++) {
    const m = pola[i].exec(t);
    if (!m) continue;
    if ((i === 2 || i === 3) && !/siapa/.test(t)) continue;
    if (t.length - (m.index + m[0].length) > 12) continue;
    return JAWABAN_ID;
  }
  return null;
}

// FUNGSI VERIFIKASI KEAMANAN PEMBUAT
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

function obrolanRingan(teks) {
  const t = String(teks || "").toLowerCase().trim();
  if (!t || t.length > 60) return false;
  if (/https?:\/\/|\d|\n/.test(t)) return false;
  if (/(cari|berita|terbaru|terkini|hari ini|harga|cuaca|kurs|kripto|bitcoin|jurnal|github|hitung|kode|coding|error|jelaskan|bandingkan|buatkan|buat |tulis|file|pdf|excel|word|analisis|rumus|artikel|rekomendasi|saran|tutorial|cara |ceritakan|sejarah|tentang|definisi|arti|maksud|terjemah|translate|perbedaan|rangkum|ringkas|ide|tips|resep|daftar)/.test(t)) return false;
  const tanya = /\b(siapa|apa|kapan|berapa|dimana|di mana|bagaimana|gimana|kenapa|mengapa|apakah|mana|which|what|when|how|why|where|who)\b/;
  const basaBasi = /^(apa kabar|gimana kabar|bagaimana kabar|siapa namamu|siapa nama kamu|kamu siapa|how are you|what's up|whats up)/;
  if (tanya.test(t) && !basaBasi.test(t)) return false;
  return true;
}

function buatPersonaRingan() {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short"
  });
  return (
    "Kamu adalah Zeta, asisten AI yang ramah, santai, dan hangat. Waktu sekarang: " + now + " WIB. " +
    "Jawab obrolan ringan secara singkat, hangat, dan natural. Pakai satu emoji ramah (😊, 👋) dan hindari emoji robot (🤖)."
  );
}

function ramahkan(t) {
  return String(t).replace(/🤖/g, "😊");
}

function tingkatBerpikir(teks) {
  const t = String(teks || "").toLowerCase();
  const sulit =
    /(hitung|kalkulasi|buktikan|analisis|bandingkan|strategi|rencana|algoritma|debug|error|bug|optimasi|rumus|persamaan|integral|turunan|probabilitas|logika|rancang|arsitektur|kode|coding|program|skrip|query|sql|esai|laporan|riset|keputusan)/;
  if (t.length > 400 || sulit.test(t)) return "high";
  if (t.length < 25) return "low";
  return "medium";
}

/* ---------- Ketahanan & Stream ---------- */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SEMENTARA = new Set([408, 429, 500, 502, 503, 504]);
const BATAS_TOTAL_MS = 52000;

function pesanGalat(status) {
  if (status === 429) return "Zeta sedang menerima terlalu banyak permintaan. Tunggu sebentar lalu coba lagi ya 😊";
  if (status === 401 || status === 403) return "Layanan AI menolak kunci akses. Periksa GEMINI_API_KEY di Vercel.";
  if (status === 404) return "Model AI tidak ditemukan. Periksa nama model GEMINI_MODELS.";
  return "Zeta belum bisa menjawab saat ini. Coba lagi sebentar ya 😊";
}

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
  const akhir = out.slice(-40);
  while (akhir.length && akhir[0].role === "assistant") akhir.shift();
  return akhir;
}

function denganBatas(p, ms) {
  let t;
  const habis = new Promise(r => { t = setTimeout(() => r({ error: "Alat terlalu lama merespons" }), ms); });
  return Promise.race([p, habis]).finally(() => clearTimeout(t));
}

async function bukaStream(model, body, signal) {
  const ctl = new AbortController();
  const putus = () => ctl.abort();
  signal.addEventListener("abort", putus, { once: true });
  const timer = setTimeout(putus, 25000);
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

async function bukaAman(model, body, signal) {
  let hasil = await bukaStream(model, body, signal);
  const tc = body.generationConfig && body.generationConfig.thinkingConfig;
  if (!hasil.r.ok && hasil.r.status === 400 && tc) {
    if (tc.thinkingLevel === "minimal") {
      const rendah = Object.assign({}, body, {
        generationConfig: Object.assign({}, body.generationConfig, { thinkingConfig: { thinkingLevel: "low" } })
      });
      hasil = await bukaStream(model, rendah, signal);
      if (hasil.r.ok || hasil.r.status !== 400) return hasil;
    }
    const tanpa = Object.assign({}, body, {
      generationConfig: { maxOutputTokens: body.generationConfig.maxOutputTokens }
    });
    hasil = await bukaStream(model, tanpa, signal);
  }
  return hasil;
}

async function bukaDenganCadangan(urutan, body, signal, sisaMs) {
  const mulai = Date.now();
  const jeda = [0, 1000, 2500];
  let statusSementara = 0;
  let statusLain = 0;
  for (let ronde = 0; ronde < jeda.length; ronde++) {
    if (jeda[ronde]) {
      if (Date.now() - mulai + jeda[ronde] + 8000 > sisaMs) break;
      await sleep(jeda[ronde]);
    }
    let adaSementara = false;
    for (const model of urutan) {
      let h;
      try {
        h = await bukaAman(model, body, signal);
      } catch (e) {
        if (signal.aborted) throw e;
        adaSementara = true;
        statusSementara = statusSementara || 503;
        continue;
      }
      if (h.r.ok) return { r: h.r, dipakai: model };
      if (SEMENTARA.has(h.r.status)) { adaSementara = true; statusSementara = h.r.status; }
      else statusLain = h.r.status;
    }
    if (!adaSementara) break;
  }
  return { gagal: { status: statusSementara || statusLain || 0 } };
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
    if (o.promptFeedback && o.promptFeedback.blockReason) {
      const e = new Error("Diblokir filter keamanan");
      e.blok = true;
      throw e;
    }
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
      let timer;
      const habis = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("Aliran data terhenti")), 30000); });
      let chunk;
      try { chunk = await Promise.race([rd.read(), habis]); } finally { clearTimeout(timer); }
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
  cari_web: "Mencari di web…",
  baca_halaman: "Membaca halaman…",
  hitung: "Menghitung…",
  cuaca: "Mengecek cuaca…",
  kurs: "Mengecek kurs…",
  kripto: "Mengecek harga kripto…",
  cari_jurnal: "Mencari jurnal ilmiah…",
  cari_teknis: "Mencari di StackOverflow dan GitHub…"
};
const TEKS_DIBLOKIR = "Maaf, Zeta tidak bisa membantu untuk permintaan itu karena filter keamanan 🙏";
const TEKS_KOSONG = "Maaf, Zeta tidak bisa menjawab itu. Coba tanya dengan cara lain.";

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: !!process.env.GEMINI_API_KEY,
      nama: "Zeta",
      kunci_terisi: !!process.env.GEMINI_API_KEY,
      model: MODELS,
      pencarian_tavily: !!process.env.TAVILY_API_KEY
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST" });

  const messages = rapikanPesan(req.body && req.body.messages);
  if (messages.length === 0) return res.status(400).json({ error: "Pesan tidak valid" });

  const ac = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ac.abort(); });
  let mulaiKirim = false;
  let sudahTeks = false;
  const kirim = o => {
    if (!mulaiKirim) {
      mulaiKirim = true;
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-cache, no-transform");
      res.setHeader("x-accel-buffering", "no");
      if (res.flushHeaders) res.flushHeaders();
    }
    if (!res.writableEnded) res.write(JSON.stringify(o) + "\n");
  };

  const gagalAkhir = (status, pesanKhusus) => {
    if (sudahTeks) { kirim({ done: true, cut: true }); return res.end(); }
    const pesan = pesanKhusus || pesanGalat(status);
    if (!mulaiKirim) return res.status(status === 401 || status === 403 || status === 404 ? 500 : 503).json({ error: pesan });
    kirim({ e: pesan });
    return res.end();
  };

  const teksTerakhir = messages[messages.length - 1].content;

  // 1. CEK VERIFIKASI IDENTITAS PEMBUAT (WAFIQ FUADI + KODE RAHASIA)
  const jawabVerifikasi = cekVerifikasiPembuat(teksTerakhir);
  if (jawabVerifikasi && !(Array.isArray(req.body.attachments) && req.body.attachments.length)) {
    kirim({ t: jawabVerifikasi });
    kirim({ done: true });
    return res.end();
  }

  // 2. CEK PERTANYAAN SIAPA PEMBUAT ZETA
  const jawabTetap = tanyaIdentitas(teksTerakhir);
  if (jawabTetap && !(Array.isArray(req.body.attachments) && req.body.attachments.length)) {
    kirim({ t: jawabTetap });
    kirim({ done: true });
    return res.end();
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum diisi di Vercel." });
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
    const systemInstruction = { parts: [{ text: santai ? buatPersonaRingan() : buatPersona() }] };
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

      let selesai = null, teksRonde = false, statusGagal = 0, pesanKhusus = "";
      for (let coba = 0; coba < 4 && !selesai; coba++) {
        const buka = await bukaDenganCadangan(urutan, body, ac.signal, BATAS_TOTAL_MS - (Date.now() - mulai));
        if (buka.gagal) {
          statusGagal = buka.gagal.status;
          if (body.tools && putaran > 0) { delete body.tools; adaAlat = false; continue; }
          break;
        }
        urutan = [buka.dipakai].concat(urutan.filter(m => m !== buka.dipakai));
        try {
          selesai = await bacaStream(buka.r, t => {
            const potong = (jedaDulu && sudahTeks ? "\n\n" : "") + ramahkan(t);
            jedaDulu = false;
            sudahTeks = true;
            teksRonde = true;
            kirim({ t: potong });
          });
        } catch (e) {
          if (ac.signal.aborted) return res.end();
          if (e.blok) { pesanKhusus = TEKS_DIBLOKIR; break; }
          if (teksRonde) { selesai = { parts: [], finish: "TERPUTUS" }; break; }
          statusGagal = 503;
          urutan = urutan.slice(1).concat(urutan.slice(0, 1));
          continue;
        }
        if (selesai.finish === "MALFORMED_FUNCTION_CALL" && body.tools && !teksRonde) {
          delete body.tools;
          adaAlat = false;
          selesai = null;
        }
      }
      if (!selesai) return gagalAkhir(statusGagal, pesanKhusus);

      const { parts, finish } = selesai;
      const panggilan = parts.filter(p => p.functionCall);

      if (panggilan.length && adaAlat) {
        kirim({
          s: Array.from(new Set(panggilan.map(p => LABEL_ALAT[p.functionCall.name] || "Menggunakan alat…"))).join(" ")
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

      if (!sudahTeks) {
        const diblokir = ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"].indexOf(finish) >= 0;
        kirim({ t: diblokir ? TEKS_DIBLOKIR : TEKS_KOSONG });
      }
      kirim({ done: true, cut: finish === "MAX_TOKENS" || finish === "TERPUTUS" });
      return res.end();
    }

    if (!sudahTeks) kirim({ t: TEKS_KOSONG });
    kirim({ done: true });
    return res.end();
  } catch (e) {
    if (ac.signal.aborted) return res.end();
    return gagalAkhir(0);
  }
};
