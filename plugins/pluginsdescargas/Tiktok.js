// tt.js — TikTok via api-sky.ultraplus.click (Suki style, 1 video)
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_BASE = "https://api-sky.ultraplus.click";
const SKY_API_KEY = "Russellxz";   // <- tu API key
const MAX_MB = 99;

const isTT = u => /(tiktok\.com|vm\.tiktok\.com)/i.test(u || "");
const fmtSec = s => {
  const n = Number(s || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  return (h ? `${h}:` : "") + `${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;
};

async function callSkyTikTok(url) {
  const headers = { Authorization: `Bearer ${SKY_API_KEY}` };
  // 1) endpoint JS
  try {
    const r = await axios.get(`${API_BASE}/api/download/tiktok`, { params: { url }, headers, timeout: 30000 });
    if ((r.data?.status === "true" || r.data?.status === true) && r.data?.data) return r.data.data;
  } catch (e) { /* try php */ }

  // 2) fallback PHP
  const r2 = await axios.get(`${API_BASE}/api/download/tiktok.php`, { params: { url }, headers, timeout: 30000 });
  if ((r2.data?.status === "true" || r2.data?.status === true) && r2.data?.data) return r2.data.data;

  throw new Error(r2.data?.error || `Sky API error (HTTP ${r2.status || "?"})`);
}

/** Selecciona UNA sola URL de video (prioriza sin marca de agua) */
function pickVideoUrl(d) {
  const cand = [
    d?.video_nowm, d?.video_no_watermark, d?.no_watermark, d?.nowm,
    d?.hd, d?.video_hd, d?.play, d?.download, d?.video, d?.url,
    d?.media?.org, d?.media?.hd, d?.media?.no_wm
  ].filter(Boolean);
  return cand[0] || "";
}

function getStr(o, keys, def = "") {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return def;
}

async function downloadTmp(fileUrl, prefer = "mp4") {
  const tmp = path.resolve("./tmp");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

  const res = await axios.get(fileUrl, {
    responseType: "stream",
    timeout: 120000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "*/*",
      Referer: "https://www.tiktok.com/"
    }
  });

  const ct = String(res.headers["content-type"] || "");
  const ext = ct.includes("mp4") ? "mp4" : prefer;
  const filePath = path.join(tmp, `tt-${Date.now()}-${Math.floor(Math.random()*1e5)}.${ext}`);

  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(filePath);
    res.data.pipe(w);
    w.on("finish", resolve);
    w.on("error", reject);
  });

  return filePath;
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
Ej: ${pref}${command} https://vm.tiktok.com/ZMjdrFCtg/`
    }, { quoted: msg });
  }

  if (!/^https?:\/\//i.test(text) || !isTT(text)) {
    return conn.sendMessage(chatId, { text: "❌ 𝙀𝙣𝙡𝙖𝙘𝙚 𝙙𝙚 𝙏𝙞𝙠𝙏𝙤𝙠 𝙞𝙣𝙫𝙖́𝙡𝙞𝙙𝙤." }, { quoted: msg });
  }

  try {
    await conn.sendMessage(chatId, { react: { text: "⏱️", key: msg.key } });

    // Llama a tu API Sky
    const d = await callSkyTikTok(text);

    // Meta
    const title   = getStr(d, ["title","desc","description","caption"], "Sin título");
    const author  = getStr(d, ["author","nickname","uniqueId","username","user","owner"], "Desconocido");
    const dur     = Number(getStr(d, ["duration","duration_ms","duration_s"], 0));
    const likes   = getStr(d, ["likes","like","diggCount"], "0");
    const comments= getStr(d, ["comments","comment","commentCount"], "0");
    const views   = getStr(d, ["views","playCount"], "");

    // URL única de video
    const videoUrl = pickVideoUrl(d);
    if (!videoUrl) throw new Error("no_video_url");

    // Descarga temporal
    const filePath = await downloadTmp(videoUrl, "mp4");
    const sizeMB = fs.statSync(filePath).size / (1024 * 1024);
    if (sizeMB > MAX_MB) {
      fs.unlinkSync(filePath);
      return conn.sendMessage(chatId, {
        text: `❌ 𝙀𝙡 𝙖𝙧𝙘𝙝𝙞𝙫𝙤 𝙥𝙚𝙨𝙖 ${sizeMB.toFixed(2)} MB y supera el límite de ${MAX_MB} MB.`
      }, { quoted: msg });
    }

    // Caption “Suki” futurista (fuente Sky)
    const caption =
`⚡ 𝗧𝗶𝗸𝗧𝗼𝗸 — 𝗩𝗶𝗱𝗲𝗼 𝗹𝗶𝘀𝘁𝗼

✦ 𝗧𝗶́𝘁𝘂𝗹𝗼: ${title}
✦ 𝗔𝘂𝘁𝗼𝗿: ${author}
✦ 𝗗𝘂𝗿𝗮𝗰𝗶𝗼́𝗻: ${fmtSec(dur)}
✦ 𝗟𝗶𝗸𝗲𝘀: ${likes}  •  𝗖𝗼𝗺𝗲𝗻𝘁𝗮𝗿𝗶𝗼𝘀: ${comments}${views ? `  •  𝗩𝗶𝘀𝘁𝗮𝘀: ${views}` : ""}

✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click
────────────
🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

    await conn.sendMessage(chatId, {
      video: fs.readFileSync(filePath),
      mimetype: "video/mp4",
      caption
    }, { quoted: msg });

    fs.unlinkSync(filePath);
    await conn.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

  } catch (error) {
    console.error("❌ Error en comando TikTok (Sky):", error?.message || error);
    let msgErr = "❌ *Ocurrió un error al procesar el enlace de TikTok.*";
    if (/401|missing_api_key/i.test(String(error))) msgErr = "🔐 API Key inválida o ausente en api-sky.ultraplus.click.";
    if (/404/.test(String(error))) msgErr = "❌ API 404: revisa la ruta /api/download/tiktok en tu servidor.";
    if (/no_video_url/i.test(String(error))) msgErr = "🚫 No se encontró un video descargable en ese enlace.";
    await conn.sendMessage(chatId, { text: msgErr }, { quoted: msg });
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
  }
};

handler.command = ["tiktok", "tt"];
handler.help = ["tiktok <url>", "tt <url>"];
handler.tags = ["descargas"];
handler.register = true;

module.exports = handler;
