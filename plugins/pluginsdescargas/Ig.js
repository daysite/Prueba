// ig.js — SOLO 1 video (el primero) desde api-sky.ultraplus.click
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_BASE = "https://api-sky.ultraplus.click";
const SKY_API_KEY = "Russellxz";   // tu API Key
const MAX_MB = 99;

function isIG(u = "") { return /(instagram\.com|instagr\.am)/i.test(u); }
function mb(n) { return n / (1024 * 1024); }
function extFromCT(ct = "", def = "bin") {
  const c = ct.toLowerCase();
  if (c.includes("mp4")) return "mp4";
  if (c.includes("jpeg")) return "jpg";
  if (c.includes("jpg")) return "jpg";
  if (c.includes("png")) return "png";
  if (c.includes("webp")) return "webp";
  return def;
}

// Llama a tu API (ruta JS y fallback PHP)
async function callSkyInstagram(url) {
  const headers = { Authorization: `Bearer ${SKY_API_KEY}` };
  try {
    const r = await axios.get(`${API_BASE}/api/download/instagram`, { params: { url }, headers, timeout: 30000 });
    if ((r.data?.status === "true" || r.data?.status === true) && r.data?.data?.media?.length) return r.data.data;
    throw new Error(r.data?.error || "no_media");
  } catch (e) {
    if (e?.response?.status === 404) {
      const r2 = await axios.get(`${API_BASE}/api/download/instagram.php`, { params: { url }, headers, timeout: 30000 });
      if ((r2.data?.status === "true" || r2.data?.status === true) && r2.data?.data?.media?.length) return r2.data.data;
      throw new Error(r2.data?.error || `HTTP ${r2.status}`);
    }
    throw e;
  }
}

async function downloadToTmp(fileUrl, preferExt = "bin") {
  const tmp = path.resolve("./tmp");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

  const res = await axios.get(fileUrl, {
    responseType: "stream",
    timeout: 120000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://www.instagram.com/",
      Accept: "*/*",
    },
    maxRedirects: 5,
  });

  const ext = extFromCT(res.headers["content-type"], preferExt);
  const filePath = path.join(tmp, `ig-${Date.now()}-${Math.floor(Math.random() * 1e5)}.${ext}`);

  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(filePath);
    res.data.pipe(w);
    w.on("finish", resolve);
    w.on("error", reject);
  });

  return { path: filePath, mime: res.headers["content-type"] || "application/octet-stream" };
}

const handler = async (msg, { conn, args, command }) => {
  const chatId = msg.key.remoteJid;
  const text = (args.join(" ") || "").trim();
  const pref = global.prefixes?.[0] || ".";

  if (!text) {
    return conn.sendMessage(chatId, {
      text:
`✳️ 𝙐𝙨𝙖:
${pref}${command} <enlace>
Ej: ${pref}${command} https://www.instagram.com/reel/DPO9MwWjjY_/`
    }, { quoted: msg });
  }

  if (!isIG(text)) {
    return conn.sendMessage(chatId, {
      text:
`❌ 𝙀𝙣𝙡𝙖𝙘𝙚 𝙞𝙣𝙫𝙖́𝙡𝙞𝙙𝙤.

✳️ 𝙐𝙨𝙖:
${pref}${command} <enlace IG>`
    }, { quoted: msg });
  }

  try {
    await conn.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    // pide a tu API
    const data = await callSkyInstagram(text);
    const media = Array.isArray(data.media) ? data.media : [];

    // SOLO el primer VIDEO
    const firstVideo = media.find(it => String(it.type || "").toLowerCase() === "video");
    if (!firstVideo) {
      return conn.sendMessage(chatId, { text: "🚫 𝙀𝙨𝙚 𝙚𝙣𝙡𝙖𝙘𝙚 𝙣𝙤 𝙩𝙞𝙚𝙣𝙚 𝙫𝙞𝙙𝙚𝙤 𝙙𝙚𝙨𝙘𝙖𝙧𝙜𝙖𝙗𝙡𝙚." }, { quoted: msg });
    }

    // descarga temporal solo del primer video
    const { path: fpath } = await downloadToTmp(firstVideo.url, "mp4");
    const sizeMB = mb(fs.statSync(fpath).size);
    if (sizeMB > MAX_MB) {
      fs.unlinkSync(fpath);
      return conn.sendMessage(chatId, {
        text: `❌ 𝙑𝙞𝙙𝙚𝙤 ≈ ${sizeMB.toFixed(2)} MB — supera el límite de ${MAX_MB} MB.\n🔗 𝙀𝙣𝙡𝙖𝙘𝙚: ${firstVideo.url}`
      }, { quoted: msg });
    }

    const caption =
`⚡ 𝗜𝗻𝘀𝘁𝗮𝗴𝗿𝗮𝗺 — 𝗩𝗶𝗱𝗲𝗼 𝗹𝗶𝘀𝘁𝗼

✦ 𝗔𝘂𝘁𝗼𝗿: ${data.author ? '@' + data.author : 'desconocido'}
✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click

────────────
🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

    await conn.sendMessage(chatId, {
      video: fs.readFileSync(fpath),
      mimetype: "video/mp4",
      caption
    }, { quoted: msg });

    fs.unlinkSync(fpath);
    await conn.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

  } catch (err) {
    console.error("❌ Error en comando Instagram (Sky .js):", err?.message || err);
    const msgTxt =
      /404/.test(String(err?.message)) ? "❌ API 404: revisa /api/download/instagram en tu servidor." :
      /401|missing_api_key|invalid/.test(String(err?.message)) ? "🔐 API Key inválida o ausente en api-sky.ultraplus.click." :
      /no_media|no_video/i.test(String(err?.message)) ? "🚫 No se encontró video descargable en ese enlace." :
      "❌ Ocurrió un error al procesar el enlace de Instagram.";
    await conn.sendMessage(chatId, { text: msgTxt }, { quoted: msg });
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
  }
};

handler.command = ["instagram", "ig"];
handler.help = ["instagram <url>", "ig <url>"];
handler.tags = ["descargas"];
handler.register = true;

module.exports = handler;
