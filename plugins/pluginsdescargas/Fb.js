// commands/fb.js — Facebook interactivo (normal o documento) usando Sky API
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// === Config Sky ===
const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click";
const SKY_API_KEY = process.env.SKY_API_KEY || global.SKY_API_KEY || "Russellxz";

// --- helpers ---
function fmtDur(s) {
  const n = Number(s || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  return (h ? `${h}:` : "") + `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
async function downloadToFile(url, filePath) {
  const res = await axios.get(url, { responseType: "stream", timeout: 120000 });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(filePath);
    res.data.pipe(w);
    w.on("finish", resolve);
    w.on("error", reject);
  });
  return filePath;
}
async function callSkyFacebook(url) {
  const headers = { Authorization: `Bearer ${SKY_API_KEY}` };

  // 1) endpoint .js
  try {
    const r = await axios.get(`${API_BASE}/api/download/facebook`, {
      params: { url }, headers, timeout: 30000
    });
    if (r.data?.status === "true" && r.data?.data) return r.data;
  } catch (_) { /* fallback */ }

  // 2) fallback .php
  const r2 = await axios.get(`${API_BASE}/api/download/facebook.php`, {
    params: { url }, headers, timeout: 30000
  });
  if (r2.data?.status === "true" && r2.data?.data) return r2.data;

  const errMsg = r2.data?.error || "no_media_found";
  const httpMsg = r2.status ? `HTTP ${r2.status}` : "sin respuesta";
  throw new Error(`Sky API fallo: ${errMsg} (${httpMsg})`);
}

// --- estado temporal por mensaje preview ---
const pending = {}; // { [previewMsgId]: { chatId, videoUrl, title, duration, thumb } }

const handler = async (msg, { conn, args, command }) => {
  const chatId = msg.key.remoteJid;
  const text = (args.join(" ") || "").trim();
  const pref = (global.prefixes?.[0] || ".");

  if (!text) {
    return conn.sendMessage(chatId, {
      text:
`✳️ 𝙐𝙨𝙖:
${pref}${command} <enlace>
📌 Ej: ${pref}${command} https://fb.watch/xxxxxx/`
    }, { quoted: msg });
  }

  if (!/(facebook\.com|fb\.watch)/i.test(text)) {
    return conn.sendMessage(chatId, {
      text:
`❌ 𝙀𝙣𝙡𝙖𝙘𝙚 𝙞𝙣𝙫𝙖́𝙡𝙞𝙙𝙤.

✳️ 𝙐𝙨𝙖:
${pref}${command} <enlace>
📌 Ej: ${pref}${command} https://fb.watch/xxxxxx/`
    }, { quoted: msg });
  }

  try {
    await conn.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    // Llamar a tu API
    const sky = await callSkyFacebook(text);
    const d = sky.data || {};
    const videoUrl = d.video_hd || d.video_sd;
    if (!videoUrl) {
      return conn.sendMessage(chatId, { text: "🚫 No se pudo obtener el video." }, { quoted: msg });
    }

    // Caption + opciones (como play)
    const resos = [
      d.video_hd ? "HD" : null,
      d.video_sd && !d.video_hd ? "SD" : d.video_sd ? "SD (alt)" : null
    ].filter(Boolean).join(" · ") || "Auto";

    const caption =
`⚡ 𝗙𝗮𝗰𝗲𝗯𝗼𝗼𝗸 𝗩𝗶𝗱𝗲𝗼 — 𝗣𝗿𝗲𝘃𝗶𝗲𝘄

✦ 𝗧𝗶́𝘁𝘂𝗹𝗼: ${d.title || "Facebook Video"}
✦ 𝗗𝘂𝗿𝗮𝗰𝗶𝗼́𝗻: ${fmtDur(d.duration)}
✦ 𝗥𝗲𝘀𝗼𝗹𝘂𝗰𝗶𝗼́𝗻: ${resos}
✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click

Elige cómo enviarlo:
👍  video normal   ·  1
❤️  video documento ·  2

🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

    // Enviar preview con miniatura si hay
    const preview = d.thumbnail
      ? await conn.sendMessage(chatId, { image: { url: d.thumbnail }, caption }, { quoted: msg })
      : await conn.sendMessage(chatId, { text: caption }, { quoted: msg });

    // Guardar job
    pending[preview.key.id] = {
      chatId,
      videoUrl,
      title: d.title || "Facebook Video",
      duration: d.duration || 0
    };

    await conn.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    // Listener único para reacciones / respuestas
    if (!conn._fbInteractiveListener) {
      conn._fbInteractiveListener = true;

      conn.ev.on("messages.upsert", async ev => {
        for (const m of ev.messages) {
          // --- Reacciones ---
          if (m.message?.reactionMessage) {
            const { key: reactKey, text: emoji } = m.message.reactionMessage;
            const job = pending[reactKey.id];
            if (job) {
              const asDoc = emoji === "❤️"; // 👍 normal, ❤️ documento
              await sendVideo(conn, job, asDoc, m);
            }
          }

          // --- Respuestas citando el preview ---
          const ctx = m.message?.extendedTextMessage?.contextInfo;
          const quotedId = ctx?.stanzaId;
          const bodyTxt = (
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            ""
          ).trim().toLowerCase();

          if (quotedId && pending[quotedId]) {
            const job = pending[quotedId];
            if (["1", "video"].includes(bodyTxt)) {
              await sendVideo(conn, job, /*asDoc*/ false, m);
            } else if (["2", "videodoc", "doc", "documento"].includes(bodyTxt)) {
              await sendVideo(conn, job, /*asDoc*/ true, m);
            } else if (bodyTxt) {
              await conn.sendMessage(m.key.remoteJid, {
                text: "⚠️ Opciones: 1/👍 (video)  ·  2/❤️ (video documento)"
              }, { quoted: m });
            }
          }
        }
      });
    }

  } catch (err) {
    console.error("❌ Error en FB interactivo:", err?.message || err);
    await conn.sendMessage(chatId, {
      text: "❌ Ocurrió un error al procesar el video de Facebook."
    }, { quoted: msg });
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
  }
};

// Envío final del video (normal o documento)
async function sendVideo(conn, job, asDocument, triggerMsg) {
  const { chatId, videoUrl, title } = job;

  try {
    await conn.sendMessage(chatId, {
      react: { text: asDocument ? "📁" : "🎬", key: triggerMsg.key }
    });
    await conn.sendMessage(chatId, {
      text: `⏳ Descargando ${asDocument ? "video (documento)" : "video"}…`
    }, { quoted: triggerMsg });

    const tmpDir = path.resolve("./tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, `fb-${Date.now()}.mp4`);

    await downloadToFile(videoUrl, filePath);

    const caption = asDocument
      ? undefined
      : `⚡ 𝗙𝗮𝗰𝗲𝗯𝗼𝗼𝗸 𝗩𝗶𝗱𝗲𝗼 — 𝗟𝗶𝘀𝘁𝗼\n✦ 𝗧𝗶́𝘁𝘂𝗹𝗼: ${title}\n✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click\n\n🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

    await conn.sendMessage(chatId, {
      [asDocument ? "document" : "video"]: fs.readFileSync(filePath),
      mimetype: "video/mp4",
      fileName: `${title}.mp4`,
      caption
    }, { quoted: triggerMsg });

    try { fs.unlinkSync(filePath); } catch {}

    await conn.sendMessage(chatId, { react: { text: "✅", key: triggerMsg.key } });

    // limpiar el pending de ese preview
    // (lo dejamos, por si el user intenta otra opción? puedes borrar si quieres)
    // delete pending[previewId];

  } catch (e) {
    console.error("❌ FB sendVideo:", e?.message || e);
    await conn.sendMessage(chatId, {
      text: `❌ Error enviando el video: ${e?.message || e}`
    }, { quoted: triggerMsg });
    await conn.sendMessage(chatId, { react: { text: "❌", key: triggerMsg.key } });
  }
}

handler.command = ["facebook", "fb"];
handler.help = ["facebook <url>", "fb <url>"];
handler.tags = ["descargas"];
handler.register = true;

module.exports = handler;
