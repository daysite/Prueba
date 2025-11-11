// plugins/setpeliculas.js
const fs = require("fs");
const path = require("path");

// ——— Helpers LID-aware + texto ———
const DIGITS = (s = "") => String(s).replace(/\D/g, "");

/** Normaliza: si un participante viene como @lid y trae .jid (real), usa ese real */
function lidParser(participants = []) {
  try {
    return participants.map(v => ({
      id: (typeof v?.id === "string" && v.id.endsWith("@lid") && v.jid) ? v.jid : v.id,
      admin: v?.admin ?? null,
      raw: v
    }));
  } catch {
    return participants || [];
  }
}

/** Admin por NÚMERO real (sirve en LID y no-LID) */
async function isAdminByNumber(conn, chatId, number) {
  try {
    const meta = await conn.groupMetadata(chatId);
    const raw  = Array.isArray(meta?.participants) ? meta.participants : [];
    const norm = lidParser(raw);

    const adminNums = new Set();
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i], n = norm[i];
      const isAdm = (r?.admin === "admin" || r?.admin === "superadmin" ||
                     n?.admin === "admin" || n?.admin === "superadmin");
      if (isAdm) {
        [r?.id, r?.jid, n?.id].forEach(x => {
          const d = DIGITS(x || "");
          if (d) adminNums.add(d);
        });
      }
    }
    return adminNums.has(number);
  } catch {
    return false;
  }
}

/** Desencapsula viewOnce/ephemeral y retorna el nodo interno */
function unwrapMessage(m) {
  let node = m;
  while (
    node?.viewOnceMessage?.message ||
    node?.viewOnceMessageV2?.message ||
    node?.viewOnceMessageV2Extension?.message ||
    node?.ephemeralMessage?.message
  ) {
    node =
      node.viewOnceMessage?.message ||
      node.viewOnceMessageV2?.message ||
      node.viewOnceMessageV2Extension?.message ||
      node.ephemeralMessage?.message;
  }
  return node;
}

/** Texto del mensaje citado (preserva saltos/espacios) */
function getQuotedText(msg) {
  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q) return null;
  const inner = unwrapMessage(q);
  return inner?.conversation || inner?.extendedTextMessage?.text || null;
}

/** Cuerpo crudo del mensaje (sin tocar) */
function getBody(msg) {
  return (
    msg.message?.extendedTextMessage?.text ??
    msg.message?.conversation ??
    ""
  );
}

/** Extrae el texto que viene después del comando, preservando formato */
function extractAfterCommand(body, cmd, prefixes = []) {
  const low = body.toLowerCase();
  for (const p of prefixes) {
    const tag = (p + cmd).toLowerCase();
    if (low.startsWith(tag)) {
      const out = body.slice(tag.length);
      return out.startsWith(" ") ? out.slice(1) : out;
    }
  }
  return "";
}

/** Extrae imageMessage del citado (soporta viewOnce/ephemeral) */
function getQuotedImageMessage(msg) {
  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q) return null;
  const inner = unwrapMessage(q);
  return inner?.imageMessage || null;
}

/** Obtiene wa.downloadContentFromMessage desde donde esté inyectado */
function ensureWA(wa, conn) {
  if (wa && typeof wa.downloadContentFromMessage === "function") return wa;
  if (conn && conn.wa && typeof conn.wa.downloadContentFromMessage === "function") return conn.wa;
  if (global.wa && typeof global.wa.downloadContentFromMessage === "function") return global.wa;
  return null;
}

const handler = async (msg, { conn, args, text, wa }) => {
  const chatId    = msg.key.remoteJid;
  const isGroup   = chatId.endsWith("@g.us");
  const senderJid = msg.key.participant || msg.key.remoteJid; // puede ser @lid
  const senderNum = DIGITS(senderJid);
  const isFromMe  = !!msg.key.fromMe;

  if (!isGroup) {
    return conn.sendMessage(chatId, { text: "❌ Este comando solo funciona en grupos." }, { quoted: msg });
  }

  // Permisos: admin / owner / bot
  const isAdmin = await isAdminByNumber(conn, chatId, senderNum);
  const owners  = Array.isArray(global.owner) ? global.owner : [];
  const isOwner = owners.some(([id]) => id === senderNum);

  if (!isAdmin && !isOwner && !isFromMe) {
    return conn.sendMessage(chatId, { text: "🚫 Este comando solo puede ser usado por administradores." }, { quoted: msg });
  }

  // ——— Texto multilínea preservado ———
  const bodyRaw       = getBody(msg);
  const prefixes      = Array.isArray(global.prefixes) ? global.prefixes : ["."];
  const textoFromBody = extractAfterCommand(bodyRaw, "setpeliculas", prefixes);
  const textoCrudo    = (textoFromBody !== "" ? textoFromBody : (typeof text === "string" ? text : (Array.isArray(args) ? args.join(" ") : "")));

  // Texto del citado si no escribieron nada
  const quotedText = !textoCrudo ? getQuotedText(msg) : null;

  // ¿Imagen citada? (con soporte a viewOnce/ephemeral)
  const quotedImage = getQuotedImageMessage(msg);

  if (!textoCrudo && !quotedText && !quotedImage) {
    return conn.sendMessage(
      chatId,
      { text: "🎬 Usa el comando así:\n\n• *setpeliculas <texto>* (multilínea permitido)\n• O responde a una *imagen* con: *setpeliculas <texto>*" },
      { quoted: msg }
    );
  }

  // Descargar imagen si fue citada
  let imagenBase64 = null;
  if (quotedImage) {
    try {
      const WA = ensureWA(wa, conn);
      if (!WA) throw new Error("downloadContentFromMessage no disponible");
      const stream = await WA.downloadContentFromMessage(quotedImage, "image");
      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length) imagenBase64 = buffer.toString("base64");
    } catch (e) {
      console.error("[setpeliculas] error leyendo imagen citada:", e);
    }
  }

  const textoFinal = (textoCrudo || quotedText || "");

  // Guardar EXACTO
  const filePath = "./ventas365.json";
  let data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
  if (!data[chatId]) data[chatId] = {};
  data[chatId]["setpeliculas"] = {
    texto: textoFinal,   // 👈 se guarda tal cual, con saltos/espacios
    imagen: imagenBase64 // null si no hay
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  await conn.sendMessage(chatId, { text: "✅ *PELÍCULAS actualizadas correctamente.*" }, { quoted: msg });
};

handler.command = ["setpeliculas"];
module.exports = handler;
