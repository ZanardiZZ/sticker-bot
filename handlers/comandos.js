// handlers/comandos.js
const {
  getShuffledSticker,
  buscarFigurinhaPorId,
  marcarFigurinhaComoUsada,
  topFigurinhas,
  existeVisualHash,   
  inserirFigurinha
} = require('../database.js');
const { forceAdd } = require('./stickerHandler.js');
const { sendSticker } = require('../utils/sendSticker.js');
const {
	getRandomStickerFromDB,
    getRandomStickerFromFolder
} = require('../stickerSource.js');
const path = require('path');
const { gerarDescricaoETag } = require('../utils/ia.js');
const { gerarHashVisual }        = require('../utils/hash.js');


async function processarComando(client, message, chatId) {
  const body = (message.body || '').trim();
  if (!body.startsWith('#')) return false;

  const args = body.slice(1).split(' ');
  const comando = args[0].toLowerCase();
  const resto = args.slice(1).join(' ');

  switch (comando) {

    case 'random': {
  /* 1️⃣ banco -------------------------------------------------------- */
  let stk = getRandomStickerFromDB();
  if (stk) {
    await sendSticker(client, chatId, stk.filePath);
    await client.sendText(
      chatId,
      `✅ Figurinha adicionada!\n\n📝 *Descrição:* ${stk.description}` +
      `\n🏷️ ${stk.tag}\n🆔 ${stk.id}`
    );
    return true;
  }

  /* 2️⃣ pasta, evitando duplicatas ---------------------------------- */
  const MAX = 15;
  let vHash, tentativa = 0;

  while (tentativa < MAX) {
    stk = getRandomStickerFromFolder();
    if (!stk) break;

    vHash = await gerarHashVisual(stk.filePath);
    if (!existeVisualHash(vHash)) break;     // inédita
    tentativa++;
  }

  if (!stk || tentativa >= MAX) {
    await client.sendText(chatId, '⚠️ Nenhuma figurinha nova disponível.');
    return true;
  }

  /* 3️⃣ IA + envio --------------------------------------------------- */
  try {
    const { description, tag } = await gerarDescricaoETag(stk.filePath);

    // envia a figurinha (tenta caminho; se falhar, buffer)
    try {
      await sendSticker(client, chatId, stk.filePath);
    } catch {
      const buf = fs.readFileSync(stk.filePath);
      await sendSticker(client, chatId, stk.filePath);
    }

    // insere no banco e obtém ID
    const novoId = inserirFigurinha({
      file: path.basename(stk.filePath),
      descricao: description,
      tag: tag.startsWith('#') ? tag : `#${tag}`,
      visual_hash: vHash,
      nsfw: 0,
      remetente: 'import',
      grupo: message.chatId,
    });

    // resposta padrão
    await client.sendText(
      chatId,
      `✅ Figurinha adicionada!\n\n📝 *Descrição:* ${description}` +
      `\n🏷️ ${tag}\n🆔 ${novoId}`
    );

  } catch (err) {
    console.error('IA-random:', err);
    await client.sendText(chatId, '⚠️ Erro ao gerar descrição automática.');
  }
  return true;
}


    case 'id': {
      if (args.length === 1 && message.isGroupMsg) {
        await client.sendText(chatId, `🆔 ID do grupo: *${chatId}*`);
        return true;
      }
      const idNum = parseInt(args[1], 10);
      if (!idNum) {
        await client.sendText(chatId, '❌ Use: `#id <número>`');
        return true;
      }
      const sticker = buscarFigurinhaPorId(idNum);
      if (!sticker) {
        await client.sendText(chatId, `❌ Figurinha ID ${idNum} não encontrada.`);
        return true;
      }
      await client.sendImageAsSticker(chatId, sticker.filePath);
      await client.sendText(
        chatId,
        `🆔 *ID:* ${sticker.id}\n📝 *Descrição:* ${sticker.description}\n🏷️ *Tag:* ${sticker.tag}`
      );
      marcarFigurinhaComoUsada(sticker.id);
      return true;
    }

    case 'forçar': {
      await forceAdd(client, message);
      return true;
    }

    case 'top10': {
      const top = topFigurinhas(10);
      if (!top.length) {
        await client.sendText(chatId, '⚠️ Nenhuma figurinha foi usada ainda.');
        return true;
      }
      const lista = top
        .map((f, i) => `${i + 1}. 🆔 ${f.id} - ${f.descricao.slice(0, 50)} (${f.shuffle_count} usos)`)
        .join('\n');
      await client.sendText(
        chatId,
        `📊 *Top 10 figurinhas mais usadas:*\n\n${lista}`
      );
      return true;
    }

    default: {
      await client.sendText(
        chatId,
        '🤖 Comando desconhecido: *#' + comando + '*\n\n' +
        'Comandos disponíveis:\n' +
        '• #random → Figurinha aleatória\n' +
        '• #id → Mostra o ID do grupo\n' +
        '• #id <número> → Envia figurinha por ID\n' +
        '• #top10 → Mais usadas\n' +
        '• #forçar → Confirma envio de figurinha parecida'
      );
      return true;
    }
  }
}

exports.processarComando = processarComando;
