
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');


const { gerarDescricaoVideo } = require('../utils/ia.js');
const {
  inserirVideo,
  jaExisteVideo,

  atualizarDescricaoVideo
} = require('../database.js');

const localPath = '/mnt/nas/Media/Figurinhas/Videos';
if (!fs.existsSync(localPath)) {
  fs.mkdirSync(localPath, { recursive: true });
}

async function handleVideo(client, message) {
  const destino = message.chatId || message.from;
  console.log('handleVideo - Recebido destino:', destino);

  const buffer = await client.decryptFile(message);
  if (!buffer) throw new Error('404 - Falha ao baixar vídeo');

  const hash = createHash('md5').update(buffer).digest('hex');
  const existente = jaExisteVideo(hash);
  if (existente && existente.descricao) {

    console.log('handleVideo - Vídeo já processado, respondendo...');
    return client.sendText(destino,
      `♻️ Já processado!\n📝 Descrição: ${existente.descricao}\n🆔 ID: ${existente.id}`
    );
  }

  const filePath = path.join(localPath, `${hash}.mp4`);
  fs.writeFileSync(filePath, buffer);

  try {

    const iaResult = await gerarDescricaoVideo(filePath);
    console.log('💡 IA retornou:', iaResult);








    const description = iaResult.description ?? iaResult.descricao ?? 'Sem descrição.';
    const tag = iaResult.tag ?? iaResult.hashtag ?? '';

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

        grupo: destino
      });
    }


    console.log('handleVideo - Enviando mensagem para:', destino);
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