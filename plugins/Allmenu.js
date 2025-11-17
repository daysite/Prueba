const handler = async (msg, { conn }) => {
  const chatId  = msg.key.remoteJid;
  const prefijo = global.prefixes?.[0] || ".";

  await conn.sendMessage2(chatId, { react: { text: "🧩", key: msg.key } }, msg);

  const todosLosComandos = [
    ...new Set(
      (global.plugins || [])
        .flatMap(p => {
          const c = p?.command;
          if (!c) return [];
          const arr = Array.isArray(c) ? c : [c];
          return arr.filter(x => typeof x === "string");
        })
    )
  ].sort((a, b) => a.localeCompare(b));

  const total = todosLosComandos.length;

  const caption = `
╔════════════════════╗
║🤖 *ALL MENU ANEKA BOT*
╚════════════════════╝

🧠 *Bot creado desde cero.*
🔧 *Total comandos activos:* ${total}
🔑 *Prefijo actual:* ${prefijo}

📦 *Lista de comandos:*
${todosLosComandos.map(c => `➤ ${prefijo}${c}`).join("\n")}
  
💫 *Gracias por usar Aneka.*
`.trim();

  return conn.sendMessage2(chatId, {
    image: { url: "https://files.catbox.moe/qjxfxs.jpg" },
    caption
  }, msg);
};

handler.command = ["allmenu"];
handler.help = ["allmenu"];
handler.tags = ["menu"];

module.exports = handler;
