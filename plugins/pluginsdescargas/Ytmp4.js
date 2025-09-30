// comandos/ytmp4.js — YouTube -> VIDEO (lógica de yt2.js) + banner estilo Suki
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click";
const API_KEY  = process.env.API_KEY  || "Russellxz";
const MAX_MB   = 99;

function isYouTube(u) {
  return /^https?:\/\//i.test(u) && /(youtube\.com|youtu\.be|music\.youtube\.com)/i.test(u);
}

function fmtDur(s) {
  const n = Number(s || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  return (h ? `${h}:` : "") + `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

const handler = async (msg, { conn, args, command }) => {
  const jid  = msg.key.remoteJid;
  const url  = (args.join(" ") || "").trim();
  const pref = global.prefixes?.[0] || ".";

  if (!url) {
    return conn.sendMessage(jid, {
      text: `✳️ *Usa:*\n${pref}${command} <url>\nEj: ${pref}${command} https://youtu.be/xxxxxx`
    }, { quoted: msg });
  }
  if (!isYouTube(url)) {
    return conn.sendMessage(jid, { text: "❌ *URL de YouTube inválida.*" }, { quoted: msg });
  }

  try {
    await conn.sendMessage(jid, { react: { text: "⏱️", key: msg.key } });

    // === Llamada a TU Sky API (misma lógica que yt2.js) ===
    const r = await axios.get(`${API_BASE}/api/download/yt.php`, {
      params: { url, format: "video" },
      headers: { Authorization: `Bearer ${API_KEY}`, "X-API-Key": API_KEY },
      timeout: 30000,
      validateStatus: s => s < 500, // igual que tu yt2.js
    });

    if (r.status !== 200 || r.data?.status !== "true") {
      throw new Error(`API ${r.status}: ${JSON.stringify(r.data)}`);
    }

    const d = r.data.data || {};
    const mediaUrl = d.video || d.audio; // fallback por si upstream devolviera audio
    if (!mediaUrl) throw new Error("El API no devolvió video.");

    // Descarga a tmp (1 solo archivo)
    const tmpDir = path.resolve("./tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `yt-v-${Date.now()}.mp4`);

    const resp = await axios.get(mediaUrl, { responseType: "stream", timeout: 120000 });
    await new Promise((res, rej) => {
      const w = fs.createWriteStream(filePath);
      resp.data.pipe(w);
      w.on("finish", res);
      w.on("error", rej);
    });

    // Límite 99 MB
    const sizeMB = fs.statSync(filePath).size / (1024 * 1024);
    if (sizeMB > MAX_MB) {
      fs.unlinkSync(filePath);
      await conn.sendMessage(jid, { text: `❌ Archivo de ${sizeMB.toFixed(2)}MB excede ${MAX_MB}MB.` }, { quoted: msg });
      await conn.sendMessage(jid, { react: { text: "❌", key: msg.key } });
      return;
    }

    // Caption “Suki” futurista + Source Sky
    const caption =
`⚡ 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 𝗩𝗶𝗱𝗲𝗼 — 𝗟𝗶𝘀𝘁𝗼

✦ 𝗧𝗶́𝘁𝘂𝗹𝗼: ${d.title || "YouTube Video"}
✦ 𝗗𝘂𝗿𝗮𝗰𝗶𝗼́𝗻: ${d.duration ? fmtDur(d.duration) : "—"}
✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click

🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

    await conn.sendMessage(jid, {
      video: fs.readFileSync(filePath),
      mimetype: "video/mp4",
      caption
    }, { quoted: msg });

    fs.unlinkSync(filePath);
    await conn.sendMessage(jid, { react: { text: "✅", key: msg.key } });

  } catch (err) {
    console.error("ytmp4 error:", err?.message || err);
    try {
      await conn.sendMessage(jid, { text: `❌ ${err?.message || "Error procesando el enlace."}` }, { quoted: msg });
      await conn.sendMessage(jid, { react: { text: "❌", key: msg.key } });
    } catch {}
  }
};

handler.command = ["ytmp4","ytv"];
module.exports = handler;
