// ig.js — comando Instagram adaptado a api-sky.ultraplus.click (JS) con estilo “Suki”
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_BASE = "https://api-sky.ultraplus.click";
const SKY_API_KEY = "Russellxz";           // ← tu API Key
const MAX_MB = 99;

function isIG(u = "") {
  return /(instagram\.com|instagr\.am)/i.test(u);
}
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

// ---- Llama a tu API Sky (intenta .js y si 404, hace fallback al .php)
async function callSkyInstagram(url) {
  const headers = { Authorization: `Bearer ${SKY_API_KEY}` };
  try {
    const r = await axios.get(`${API_BASE}/api/download/instagram`, {
      params: { url }, headers, timeout: 30000,
    });
    if ((r.data?.status === "true" || r.data?.status === true) && r.data?.data?.media?.length) {
      return r.data.data; // { shortcode, author, caption, media:[{type,url,...}] }
    }
    throw new Error(r.data?.error || "no_media");
  } catch (e) {
    // fallback si fue 404 / not found / route legacy
    if (e?.response?.status === 404) {
      const r2 = await axios.get(`${API_BASE}/api/download/instagram.php`, {
        params: { url }, headers, timeout: 30000,
      });
      if ((r2.data?.status === "true" || r2.data?.status === true) && r2.data?.data?.media?.length) {
        return r2.data.data;
      }
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
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

    // 1) Pide a tu API
    const data = await callSkyInstagram(text);
    const items = data.media || [];
    if (!items.length) throw new Error("no_media");

    // 2) Caption estilo Suki futurista
    const author = data.author ? `@${data.author}` : "desconocido";
    const caption =
`⚡ 𝗜𝗻𝘀𝘁𝗮𝗴𝗿𝗮𝗺 — 𝗗𝗲𝘀𝗰𝗮𝗿𝗴𝗮 𝗹𝗶𝘀𝘁𝗮

✦ 𝗔𝘂𝘁𝗼𝗿: ${author}
✦ 𝗘𝗹𝗲𝗺𝗲𝗻𝘁𝗼𝘀: ${items.length}
✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click

────────────
🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

    // 3) Envío (respeta límite 99 MB en videos)
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const isVideo = String(it.type || "").toLowerCase() === "video";
      const url = it.url;

      // descarga temporal
      const { path: fpath, mime } = await downloadToTmp(url, isVideo ? "mp4" : "jpg");
      const size = fs.statSync(fpath).size;
      const sizeMB = mb(size);

      if (isVideo && sizeMB > MAX_MB) {
        fs.unlinkSync(fpath);
        await conn.sendMessage(chatId, {
          text:
`❌ 𝙑𝙞𝙙𝙚𝙤 ${i + 1}/${items.length} ≈ ${sizeMB.toFixed(2)} MB — supera el límite de ${MAX_MB} MB.
🔗 𝙀𝙣𝙡𝙖𝙘𝙚: ${url}`
        }, { quoted: msg });
        continue;
      }

      try {
        if (isVideo) {
          await conn.sendMessage(chatId, {
            video: fs.readFileSync(fpath),
            mimetype: "video/mp4",
            caption: i === 0 ? caption : undefined
          }, { quoted: msg });
        } else {
          await conn.sendMessage(chatId, {
            image: fs.readFileSync(fpath),
            mimetype: mime || "image/jpeg",
            caption: i === 0 ? caption : undefined
          }, { quoted: msg });
        }
      } finally {
        fs.unlinkSync(fpath);
      }
    }

    await conn.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

  } catch (err) {
    console.error("❌ Error en comando Instagram (Sky .js):", err?.message || err);
    // mensajes más claros según el caso común
    const msgTxt =
      /404/.test(String(err?.message)) ? "❌ Ruta de API no encontrada (404). Verifica /api/download/instagram en tu servidor." :
      /401|missing_api_key|invalid/.test(String(err?.message)) ? "🔐 API Key inválida o ausente en api-sky.ultraplus.click." :
      /no_media|no_video/i.test(String(err?.message)) ? "🚫 No se encontró media descargable en ese enlace." :
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
