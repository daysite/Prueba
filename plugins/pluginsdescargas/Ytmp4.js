// comandos/ytmp4.js — YouTube -> VIDEO (Sky API) con selección 👍 / ❤️ o 1 / 2, SIN límite
const axios = require("axios");

const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click";
const API_KEY  = process.env.API_KEY  || "Russellxz";

function isYouTube(u) {
  return /^https?:\/\//i.test(u) && /(youtube\.com|youtu\.be|music\.youtube\.com)/i.test(u);
}
function fmtDur(s) {
  const n = Number(s || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  return (h ? `${h}:` : "") + `${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;
}

// Jobs pendientes por id del mensaje con opciones
const pendingYTV = Object.create(null);

async function callSkyYtVideo(url){
  const r = await axios.get(`${API_BASE}/api/download/yt.php`, {
    params: { url, format: "video" },
    headers: { Authorization: `Bearer ${API_KEY}`, "X-API-Key": API_KEY },
    timeout: 30000,
    validateStatus: s => s < 500
  });
  if (r.status !== 200 || r.data?.status !== "true")
    throw new Error(`API ${r.status}: ${JSON.stringify(r.data)}`);
  const d = r.data.data || {};
  const mediaUrl = d.video || d.audio;
  if (!mediaUrl) throw new Error("El API no devolvió video.");
  return { mediaUrl, meta: d };
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

    // 1) Pide a tu API
    const { mediaUrl, meta } = await callSkyYtVideo(url);
    const title = meta.title || "YouTube Video";
    const dur   = meta.duration ? fmtDur(meta.duration) : "—";
    const thumb = meta.thumbnail || "";

    // 2) Mensaje de selección (reacciones o números)
    const caption =
`⚡ 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 — 𝗩𝗶𝗱𝗲𝗼

Elige cómo enviarlo:
👍 𝗩𝗶𝗱𝗲𝗼 (normal)
❤️ 𝗩𝗶𝗱𝗲𝗼 𝗰𝗼𝗺𝗼 𝗱𝗼𝗰𝘂𝗺𝗲𝗻𝘁𝗼
— 𝗼 responde: 1 = video · 2 = documento

✦ 𝗧𝗶́𝘁𝘂𝗹𝗼: ${title}
✦ 𝗗𝘂𝗿𝗮𝗰𝗶𝗼́𝗻: ${dur}
✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click
────────────
🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

    let selectorMsg;
    if (thumb) {
      selectorMsg = await conn.sendMessage(jid, { image: { url: thumb }, caption }, { quoted: msg });
    } else {
      selectorMsg = await conn.sendMessage(jid, { text: caption }, { quoted: msg });
    }

    // Guarda el job
    pendingYTV[selectorMsg.key.id] = {
      chatId: jid,
      mediaUrl,
      title,
      baseMsg: msg
    };

    await conn.sendMessage(jid, { react: { text: "✅", key: msg.key } });

    // 3) Listener único para reacciones / respuestas
    if (!conn._ytvListener) {
      conn._ytvListener = true;
      conn.ev.on("messages.upsert", async (ev) => {
        for (const m of ev.messages) {
          try {
            // REACCIÓN
            if (m.message?.reactionMessage) {
              const { key: reactedKey, text: emoji } = m.message.reactionMessage;
              const job = pendingYTV[reactedKey.id];
              if (job) {
                const asDoc = emoji === "❤️";
                await sendVideo(conn, job, asDoc, m);
                delete pendingYTV[reactedKey.id];
              }
            }
            // RESPUESTA con 1 / 2
            const ctx = m.message?.extendedTextMessage?.contextInfo;
            const replyTo = ctx?.stanzaId;
            const txt = (m.message?.conversation || m.message?.extendedTextMessage?.text || "").trim().toLowerCase();
            if (replyTo && pendingYTV[replyTo]) {
              const job = pendingYTV[replyTo];
              if (txt === "1" || txt === "2") {
                const asDoc = txt === "2";
                await sendVideo(conn, job, asDoc, m);
                delete pendingYTV[replyTo];
              } else {
                await conn.sendMessage(job.chatId, {
                  text: "⚠️ Responde con *1* (video) o *2* (documento), o reacciona con 👍 / ❤️."
                }, { quoted: job.baseMsg });
              }
            }
          } catch (e) {
            console.error("ytmp4 listener error:", e);
          }
        }
      });
    }

  } catch (err) {
    console.error("ytmp4 error:", err?.message || err);
    try {
      await conn.sendMessage(jid, { text: `❌ ${err?.message || "Error procesando el enlace."}` }, { quoted: msg });
      await conn.sendMessage(jid, { react: { text: "❌", key: msg.key } });
    } catch {}
  }
};

async function sendVideo(conn, job, asDocument, triggerMsg){
  const { chatId, mediaUrl, title, baseMsg } = job;

  await conn.sendMessage(chatId, { react: { text: asDocument ? "📁" : "🎬", key: triggerMsg.key } });
  await conn.sendMessage(chatId, { text: `⏳ Enviando ${asDocument ? "como documento" : "video"}…` }, { quoted: baseMsg });

  // SIN límite de tamaño: mandamos por URL directo
  const caption =
`⚡ 𝗬𝗼𝘂𝗧𝘂𝗯𝗲 𝗩𝗶𝗱𝗲𝗼 — 𝗟𝗶𝘀𝘁𝗼

✦ 𝗧𝗶́𝘁𝘂𝗹𝗼: ${title}
✦ 𝗦𝗼𝘂𝗿𝗰𝗲: api-sky.ultraplus.click

🤖 𝙎𝙪𝙠𝙞 𝘽𝙤𝙩`;

  if (asDocument) {
    await conn.sendMessage(chatId, {
      document: { url: mediaUrl },
      mimetype: "video/mp4",
      fileName: `${title}.mp4`,
      caption
    }, { quoted: baseMsg });
  } else {
    await conn.sendMessage(chatId, {
      video: { url: mediaUrl },
      mimetype: "video/mp4",
      caption
    }, { quoted: baseMsg });
  }

  await conn.sendMessage(chatId, { react: { text: "✅", key: triggerMsg.key } });
}

handler.command = ["ytmp4","ytv"];
module.exports = handler;
