const fs   = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { spawn }      = require('child_process');
const { decryptFile } = require('../utils/decrypt.js');
const { gerarDescricaoVideo } = require('../utils/ia.js');
const {
  inserirVideo,
  jaExisteVideo,
  getVideoById,
  atualizarDescricaoVideo
} = require('../database.js');

const localPath = '/mnt/nas/Media/Figurinhas/Videos';
if (!fs.existsSync(localPath)) {
  fs.mkdirSync(localPath, { recursive: true });
}
function normalizeChatId(id) {
  if (!id) return id;
  if (id.endsWith('@lid')) return id.replace('@lid', '@c.us');
  return id;
}



async function handleVideo(client, message) {
  let destino = normalizeChatId(message.chatId || message.from);
  console.log('handleVideo - Recebido destino:', destino);

  const buffer = await decryptFile(client, message);;
  if (!buffer) throw new Error('404 - Falha ao baixar vídeo');

  const hash = createHash('md5').update(buffer).digest('hex');
  const existente = jaExisteVideo(hash);
  if (existente && existente.descricao) {
    return client.sendText(destino,
      `♻️ Já processado!\n📝 Descrição: ${existente.descricao}\n🆔 ID: ${existente.id}`
    );
  }

  const filePath = path.join(localPath, `${hash}.mp4`);
  fs.writeFileSync(filePath, buffer);

  try {
    // 1) chama IA e 2) debug
    const iaResult = await gerarDescricaoVideo(filePath);
    console.log('💡 IA retornou:', iaResult);

    // pega tanto em inglês quanto pt-br
    const description = iaResult.description
                      ?? iaResult.descricao
                      ?? 'Sem descrição.';
    const tag         = iaResult.tag
                      ?? iaResult.hashtag
                      ?? pickHashtag(description);

    let id;
    if (existente) {
      id = existente.id;
      atualizarDescricaoVideo(id, description, tag);
    } else {
      id = inserirVideo({
        file: hash,
        descricao: description,
        tag,
        remetente: message.sender?.id || message.author || 'desconhecido',
        grupo: message.chatId || message.from
      });
    }

    await client.sendText(destino,
      `✅ Vídeo processado!\n📝 Descrição: ${description}\n🏷️ Tag: ${tag}\n🆔 ID: ${id}`
    );
  } catch (err) {
    console.error('❌ falha IA vídeo:', err);
    await client.sendText(destino,
      '❌ Erro ao gerar descrição. Tente novamente mais tarde.'
    );
  }
}
module.exports = handleVideo;