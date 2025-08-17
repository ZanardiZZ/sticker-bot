require('dotenv').config();
const { create } = require('@open-wa/wa-automate');
const fs = require('fs');
const sharp = require('sharp'); 
const path = require('path');
const cron = require('node-cron');
const mime = require('mime-types');
const { decryptMedia } = require('@open-wa/wa-decrypt');
const {
  saveMedia,
  incrementRandomCount,
  getMD5,
  getHashVisual,
  findByHashVisual,
  findById,
  updateMediaTags,
  processOldStickers,
  getMediaWithLowestRandomCount,
  getTop10Media,
  getTop5UsersByStickerCount,
  countMedia
} = require('./database');
const { isNSFW } = require('./services/nsfwFilter');
const { getAiAnnotations, transcribeAudioBuffer, getAiAnnotationsFromPrompt } = require('./services/ai');
const { processVideo } = require('./services/videoProcessor');

const forceMap = {};
const taggingMap = {}; // { chatId: mediaId } para modo edição de tags
const MAX_TAGS_LENGTH = 500;
const ADMIN_NUMBER = process.env.ADMIN_NUMBER; // Seu número pessoal no formato 5511999999999@c.us no .env
const AUTO_SEND_GROUP_ID = process.env.AUTO_SEND_GROUP_ID; // Grupo para envio automático

create({
  sessionId: 'StickerBotSession',
  headless: true,
  qrTimeout: 0,
  authTimeout: 0,
  autoRefresh: true,
  restartOnCrash: start
})
  .then(client => start(client))
  .catch(e => console.error('Erro ao iniciar cliente:', e));

async function fetchRandomMedia() {
  const novasMedias = await processOldStickers();
  if (novasMedias.length > 0) {
    const last = novasMedias[novasMedias.length - 1];
    const media = await findById(last.id);
    if (media) return media;
    return {
      id: last.id,
      file_path: last.filePath,
      mimetype: 'image/webp',
      description: '',
      tags: []
    };
  }
  return await getMediaWithLowestRandomCount();
}

async function sendMedia(client, media, chatId) {
  if (media.mimetype === 'image/webp' || media.file_path.endsWith('.webp')) {
    await client.sendRawWebpAsSticker(chatId, media.file_path, {
      pack: 'StickerBot',
      author: 'ZZ-Bot',
    });
  } else if (media.mimetype === 'image/gif' || media.file_path.endsWith('.gif')) {
    await client.sendFile(chatId, media.file_path, 'media', 'Aqui está seu GIF!');
  } else if (media.mimetype && media.mimetype.startsWith('image/')) {
    await client.sendImageAsSticker(chatId, media.file_path, {
      pack: 'StickerBot',
      author: 'ZZ-Bot',
    });
  } else {
    await client.sendFile(chatId, media.file_path, 'media', 'Aqui está sua mídia aleatória!');
  }
}

function buildMediaResponse(media) {
  const clean = cleanDescriptionTags(
    media.description,
    media.tags ? (typeof media.tags === 'string' ? media.tags.split(',') : media.tags) : []
  );

  return `\n📝 ${clean.description || ''}\n` +
    `🏷️ ${clean.tags.length > 0 ? clean.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n` +
    `🆔 ${media.id}`;
}

async function sendRandomMediaToGroup(client) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }
  try {
    const media = await fetchRandomMedia();
    if (!media) {
      console.log('Nenhuma mídia disponível para envio automático.');
      return;
    }

    await incrementRandomCount(media.id);
    await sendMedia(client, media, AUTO_SEND_GROUP_ID);

    const responseMessage = buildMediaResponse(media);
    await client.sendText(AUTO_SEND_GROUP_ID, responseMessage);

    console.log('Mídia enviada automaticamente ao grupo.');
  } catch (err) {
    console.error('Erro no envio automático:', err);
  }
}

function scheduleAutoSend(client) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }

  // Agenda toda hora cheia das 08:00 às 21:00
  cron.schedule('0 8-21 * * *', () => sendRandomMediaToGroup(client));

  console.log('Agendamento de envios automáticos configurado (todas as horas entre 08 e 21).');
}

function cleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe',
    'não posso ajudar',
    'não disponível',
    'sem descrição',
    'audio salvo sem descrição ai'
  ];
  let cleanDesc = description ? description.toLowerCase() : '';
  // Se descrição conter alguma frase ruim, limpar
  if (badPhrases.some(phrase => cleanDesc.includes(phrase))) {
    cleanDesc = '';
  } else {
    cleanDesc = description; // mantém original
  }

  // Limpa tags que sejam obviamente ruins ou que comecem com ## etc
  let cleanTags = [];
  if (tags && Array.isArray(tags)) {
    cleanTags = tags.filter(t => {
      if (!t) return false;
      // tags que tenham ## ou palavras ruins
      if (t.includes('##')) return false;
      const low = t.toLowerCase();
      if (badPhrases.some(phrase => low.includes(phrase))) return false;
      return true;
    });
  } else if (typeof tags === 'string') {
    cleanTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  return { description: cleanDesc, tags: cleanTags };
}


async function start(client) {
  console.log('Bot iniciado!');
  if (ADMIN_NUMBER) {
    try {
      // Primeiro, envia o vCard para adicionar o admin como contato
      await client.sendContactVcard(ADMIN_NUMBER, ADMIN_NUMBER, 'Admin');
      console.log('Cartão de contato enviado ao admin para adicioná-lo.');
      
      // Depois envia a mensagem de início
      await client.sendText(ADMIN_NUMBER, '🤖 Bot iniciado com sucesso!');
      console.log('Mensagem de início enviada para o admin.');
    } catch (err) {
      console.error('Erro ao enviar mensagem para o admin:', err);
    }
  }
  scheduleAutoSend(client);

  client.onMessage(async message => {
    const chatId = message.from;



    const validCommands = [
  '#random',
  '#editar ID',
  '#top10',
  '#top5users',
  '#ID',
  '#forçar',
  '#count'
];

    // Tratamento comando inválido
    if (message.body.startsWith('#')) {
      // Verifica se começa com algum comando válido
      const isValid = validCommands.some(cmd => {
        if (cmd.endsWith('ID')) {
          return message.body.startsWith(cmd);
        }
        return message.body === cmd || message.body.startsWith(cmd + ' ');
      });
      if (!isValid) {
        await client.sendText(chatId,
          `Comando não reconhecido.\nComandos disponíveis:\n` +
          validCommands.map(c => c.replace('ID', 'XXX')).join('\n'));
        return;
      }
    }
      // Comando #random para enviar mídia aleatória
      if (message.body === '#random') {
        try {
          const media = await fetchRandomMedia();
          if (!media) {
            await client.sendText(chatId, 'Nenhuma mídia salva ainda.');
            return;
          }

          await incrementRandomCount(media.id);
          await sendMedia(client, media, chatId);

          const responseMessageRandom = buildMediaResponse(media);
          await client.sendText(chatId, responseMessageRandom);
        } catch (err) {
          console.error('Erro no comando #random:', err);
          await client.sendText(chatId, 'Erro ao buscar mídia.');
        }
        return;
      }
if (message.body === '#count') {
  try {
    const total = await countMedia();
    await client.sendText(chatId, `Existem ${total} figurinhas salvas no banco de dados.`);
  } catch (err) {
    console.error('Erro ao contar figurinhas:', err);
    await client.sendText(chatId, 'Erro ao obter contagem de figurinhas.');
  }
  return;
}
//#EDITAR
if (taggingMap[chatId]) {
      if (message.type === 'chat' && message.body) {
        const mediaId = taggingMap[chatId];
        const newText = message.body.trim();

        if (newText.length > MAX_TAGS_LENGTH) {
          await client.sendText(chatId, `Texto muito longo. Limite de ${MAX_TAGS_LENGTH} caracteres.`);
          taggingMap[chatId] = null;
          return;
        }

        try {
          const media = await findById(mediaId);
          if (!media) {
            await client.sendText(chatId, `Mídia com ID ${mediaId} não encontrada.`);
            taggingMap[chatId] = null;
            return;
          }

          // Parse formato: descricao: texto; tags: tag1,tag2
          let newDescription = media.description || '';
          let newTags = media.tags ? (typeof media.tags === 'string' ? media.tags.split(',') : media.tags) : [];

          // Se o usuário quer limpar a descrição, pode enviar descricao: nenhum ou descricao: limpar
          const clearDescriptionCmds = ['nenhum', 'limpar', 'clear', 'apagar', 'remover'];

          const parts = newText.split(';');
          for (const part of parts) {
            const [key, ...rest] = part.split(':');
            if (!key || rest.length === 0) continue;
            const value = rest.join(':').trim();
            if (key.trim().toLowerCase() === 'descricao' || key.trim().toLowerCase() === 'description') {
              if (clearDescriptionCmds.includes(value.toLowerCase())) {
                newDescription = '';
              } else {
                newDescription = value;
              }
            } else if (key.trim().toLowerCase() === 'tags') {
              const tagsArr = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
              newTags = tagsArr;
            }
          }

          if (parts.length === 1) {
            // Caso o texto seja apenas tags simples separados por vírgula
            if (!newText.toLowerCase().startsWith('descricao:') && !newText.toLowerCase().startsWith('description:')) {
              newTags = newText.split(',').map(t => t.trim()).filter(t => t.length > 0);
            }
          }

          let combinedLength = (newDescription.length || 0) + (newTags.join(',').length || 0);
          if (combinedLength > MAX_TAGS_LENGTH) {
            const allowedTagsLength = Math.max(0, MAX_TAGS_LENGTH - newDescription.length);
            let tagsStr = newTags.join(',');
            if (tagsStr.length > allowedTagsLength) {
              tagsStr = tagsStr.substring(0, allowedTagsLength);
              newTags = tagsStr.split(',').map(t => t.trim());
            }
          }

          const updateDescription = newDescription;
          const updateTags = newTags.join(',');

          await updateMediaDescription(mediaId, updateDescription);
          await updateMediaTags(mediaId, updateTags);

          await client.sendText(chatId, `Descrição e tags atualizadas para a mídia ID ${mediaId}.`);
          taggingMap[chatId] = null;

        } catch (err) {
          console.error('Erro ao adicionar tags:', err);
          await client.sendText(chatId, 'Erro ao adicionar tags/descrição.');
          taggingMap[chatId] = null;
        }

        return;
      }
    }

    if (message.body && message.body.startsWith('#editar ID ')) {
      const parts = message.body.split(' ');
      if (parts.length === 3) {
        const mediaId = parts[2];

        taggingMap[chatId] = mediaId;
        await client.sendText(chatId,
          `Modo edição ativado para a mídia ID ${mediaId}.
Por favor, envie a mensagem no formato:

descricao: [sua descrição aqui]; tags: tag1, tag2, tag3

Você pode enviar apenas tags, por exemplo:
tags: tag1, tag2, tag3

Ou apenas descrição:
descricao: sua descrição aqui

Limite total de ${MAX_TAGS_LENGTH} caracteres.`
        );
        return;
      }
    }

    if (taggingMap[chatId]) {
      if (message.type === 'chat' && message.body) {
        const mediaId = taggingMap[chatId];
        const newText = message.body.trim();

        if (newText.length > MAX_TAGS_LENGTH) {
          await client.sendText(chatId, `Texto muito longo. Limite de ${MAX_TAGS_LENGTH} caracteres.`);
          taggingMap[chatId] = null;
          return;
        }

        try {
          const media = await findById(mediaId);
          if (!media) {
            await client.sendText(chatId, `Mídia com ID ${mediaId} não encontrada.`);
            taggingMap[chatId] = null;
            return;
          }

          // Parse formato: descricao: texto; tags: tag1,tag2
          let newDescription = media.description || '';
          let newTags = media.tags ? (typeof media.tags === 'string' ? media.tags.split(',') : media.tags) : [];

         const parts = newText.split(';');
      for (const part of parts) {
        const [key, ...rest] = part.split(':');
        if (!key || rest.length === 0) continue;
        const value = rest.join(':').trim();
        const keyLower = key.trim().toLowerCase();
        if (keyLower === 'descricao' || keyLower === 'descrição' || keyLower === 'description') {
          if (clearDescriptionCmds.includes(value.toLowerCase())) {
            newDescription = '';
          } else {
            newDescription = value;
          }
        } else if (keyLower === 'tags') {
          const tagsArr = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
          newTags = tagsArr;
        }
      }

          if (parts.length === 1) {
            newTags = newText.split(',').map(t => t.trim()).filter(t => t.length > 0);
          }

          let combinedLength = (newDescription.length || 0) + (newTags.join(',').length || 0);
          if (combinedLength > MAX_TAGS_LENGTH) {
            const allowedTagsLength = Math.max(0, MAX_TAGS_LENGTH - newDescription.length);
            let tagsStr = newTags.join(',');
            if (tagsStr.length > allowedTagsLength) {
              tagsStr = tagsStr.substring(0, allowedTagsLength);
              newTags = tagsStr.split(',').map(t => t.trim());
            }
          }

          const updateDescription = newDescription;
          const updateTags = newTags.join(',');

          await updateMediaDescription(mediaId, updateDescription);
          await updateMediaTags(mediaId, updateTags);

          const updatedMedia = await findById(mediaId);
      const cleanUpdated = cleanDescriptionTags(
        updatedMedia.description,
        updatedMedia.tags ? (typeof updatedMedia.tags === 'string' ? updatedMedia.tags.split(',') : updatedMedia.tags) : []
      );

      let updatedMessage = `[32m[1m[4m[7m[42m✅ Figurinha Atualizada![0m\n\n` +
        `📝 ${cleanUpdated.description || ''}\n` +
        `🏷️ ${cleanUpdated.tags.length > 0 ? cleanUpdated.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n` +
        `🆔 ${updatedMedia.id}`;

      await client.sendText(chatId, updatedMessage);
          taggingMap[chatId] = null;

        } catch (err) {
          console.error('Erro ao adicionar tags:', err);
          await client.sendText(chatId, 'Erro ao adicionar tags/descrição.');
          taggingMap[chatId] = null;
        }

        return;
      }
    }



if (message.body === '#top10') {
  try {
    const top10 = await getTop10Media();
    if (!top10 || top10.length === 0) {
      await client.sendText(chatId, 'Nenhuma figurinha encontrada.');
      return;
    }

    await client.sendText(chatId, 'Top 10 figurinhas mais usadas:');
    for (const media of top10) {
      if (media.mimetype.startsWith('image/')) {
        await client.sendRawWebpAsSticker(chatId, media.file_path, {
          pack: 'Top10',
          author: 'Bot',
        });
      } else {
        await client.sendFile(chatId, media.file_path, 'media', `Mídia usada ${media.count_random} vezes.`);
      }
    }
  } catch (err) {
    console.error('Erro ao enviar top10:', err);
    await client.sendText(chatId, 'Erro ao buscar top 10 figurinhas.');
  }
  return;
}
if (message.body === '#top5users') {
  try {
    const topUsers = await getTop5UsersByStickerCount();
    if (!topUsers || topUsers.length === 0) {
      await client.sendText(chatId, 'Nenhum usuário encontrado.');
      return;
    }

    let reply = 'Top 5 usuários que enviaram figurinhas:\n\n';

    // Buscar nomes dos usuários no WhatsApp para melhor exibicao
    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i];
      let userName = null;

      try {
        // Tenta pegar o contato
        const contact = await client.getContact(user.chat_id);
        if (contact) {
          if (contact.pushname) {
            userName = contact.pushname;
          } else if (contact.formattedName) {
            userName = contact.formattedName;
          }
        }
      } catch (err) {
        console.warn(`Não foi possível obter o contato para ${user.chat_id}`);
      }

      // Se não conseguiu nome, tenta extrair telefone (antes do @)
      if (!userName) {
        userName = user.chat_id.split('@')[0];
      }

      reply += `${i + 1}. ${userName} - ${user.sticker_count} figurinhas\n`;
    }

    await client.sendText(chatId, reply);
  } catch (err) {
    console.error('Erro ao buscar top 5 usuários:', err);
    await client.sendText(chatId, 'Erro ao buscar top 5 usuários.');
  }
  return;
}
 // Ativar modo edição respondendo a uma figurinha
    if (message.hasQuotedMsg && message.body && message.body.toLowerCase().startsWith('#editar')) {
      try {
        const quotedMsg = await client.getQuotedMessage(message.id);
        if (quotedMsg.isMedia) {
          // Obtém buffer da mídia respondida
          const buffer = await decryptMedia(quotedMsg);
          const hashVisual = await getHashVisual(buffer);
          const mediaRecord = await findByHashVisual(hashVisual);

          if (mediaRecord) {
            taggingMap[chatId] = mediaRecord.id;
            await client.sendText(chatId,
              `Modo edição ativado para a mídia ID ${mediaRecord.id}.
Por favor, envie a mensagem no formato:\n\ndescricao: [sua descrição]; tags: tag1, tag2, tag3
Você pode enviar apenas tags ou apenas descrição.
Limite total de ${MAX_TAGS_LENGTH} caracteres.`);
            return;
          } else {
            await client.sendText(chatId, 'Não foi possível encontrar o ID da mídia respondida.');
          }
        } else {
          await client.sendText(chatId, 'Por favor responda a uma mensagem que contenha mídia para editar.');
        }
      } catch (err) {
        console.error('Erro ao ativar modo edição via resposta:', err);
        await client.sendText(chatId, 'Erro ao tentar ativar o modo edição.');
      }
    }
   // Comando #ID XXX para enviar figurinha específica pelo ID
    if (message.body && message.body.startsWith('#ID ')) {
  const parts = message.body.split(' ');
  if (parts.length === 2) {
    const mediaId = parts[1];
    try {
      const media = await findById(mediaId);
      if (media.mimetype === 'image/webp' || media.file_path.endsWith('.webp')) {
  await client.sendRawWebpAsSticker(chatId, media.file_path, {
    pack: 'StickerBot',
    author: 'ZZ-Bot',
  });
} else if (media.mimetype === 'image/gif' || media.file_path.endsWith('.gif')) {
  await client.sendFile(chatId, media.file_path, 'media', 'Aqui está seu GIF!');
} else {
  await client.sendFile(chatId, media.file_path, 'media', 'Aqui está sua mídia solicitada!');
}

if (media.mimetype === 'image/webp' || media.file_path.endsWith('.webp')) {
  await client.sendRawWebpAsSticker(chatId, media.file_path, {
    pack: 'StickerBot',
    author: 'ZZ-Bot',
  });
} else if (media.mimetype === 'image/gif' || media.file_path.endsWith('.gif')) {
  await client.sendFile(chatId, media.file_path, 'media', 'Aqui está seu GIF!');
} else if (media.mimetype.startsWith('image/')) {
  await client.sendImageAsSticker(chatId, media.file_path, {
    pack: 'StickerBot',
    author: 'ZZ-Bot',
  });
} else {
  await client.sendFile(chatId, media.file_path, 'media', 'Aqui está sua mídia aleatória!');
}

      // Enviar descrição e tags no formato esperado
      const cleanMediaInfo = cleanDescriptionTags(media.description, media.tags ? (typeof media.tags === 'string' ? media.tags.split(',') : media.tags) : []);
      let responseMessageID = `\n📝 ${cleanMediaInfo.description || ''}\n` +
        `🏷️ ${cleanMediaInfo.tags.length > 0 ? cleanMediaInfo.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n` +
        `🆔 ${media.id}`;

      await client.sendText(chatId, responseMessageID);

    } catch (err) {
      console.error('Erro ao buscar mídia pelo ID:', err);
      await client.sendText(chatId, 'Erro ao buscar essa mídia.');
    }
    return;
  }
}

    // Implementação do comando #forçar
    if (message.body && message.body.trim() === '#forçar') {
      if (message.hasQuotedMsg) {
        try {
          const quotedMsg = await client.getQuotedMessage(message.id);
          const isMedia =
            quotedMsg.isMedia &&
            ['image', 'video', 'sticker', 'audio'].some(type =>
              quotedMsg.mimetype?.startsWith(type)
            );
          if (isMedia) {
            forceMap[chatId] = true;
            await client.sendText(chatId, 'Modo #forçar ativado para a próxima mídia.');
            return;
          }
        } catch {
          // Ignorar erro ao obter mensagem respondida
        }
      } else {
        forceMap[chatId] = true;
        await client.sendText(chatId, 'Modo #forçar ativado. Envie a mídia que deseja salvar.');
        return;
      }
    }

    if (!message.isMedia) return;

     try {
      // Para descriptografar, pegar as propriedades necessárias da mensagem (mimetype, media data)
      // A função decryptMedia da wa-decrypt aceita a mensagem inteira
      const buffer = await decryptMedia(message);

      const ext = message.mimetype.split('/')[1] || 'bin';
      
      console.log(`Processando mídia do tipo: ${message.mimetype}, extensão detectada: ${ext}`);

// Conversão para webp se for imagem, exceto gifs
let bufferWebp = buffer;
let extToSave = ext;
let mimetypeToSave = message.mimetype;
if (message.mimetype.startsWith('image/') && message.mimetype !== 'image/gif') {
  console.log('Convertendo imagem para webp para garantir compatibilidade...');
  bufferWebp = await sharp(buffer).webp().toBuffer();
  extToSave = 'webp';
  mimetypeToSave = 'image/webp';
  console.log('Conversao para webp finalizada com sucesso.');
} else if (message.mimetype === 'image/gif') {
  // Manter gif sem converter
  bufferWebp = buffer;
  extToSave = 'gif';
  mimetypeToSave = 'image/gif';
}

      const pngBuffer = await sharp(bufferWebp).png().toBuffer();
      const hashMd5 = getMD5(bufferWebp);
      const hashVisual = await getHashVisual(bufferWebp);

      const forceInsert = !!forceMap[chatId];

      if (!forceInsert) {
  const existing = await findByHashVisual(hashVisual);
  if (existing) {
    await client.sendText(
      chatId,
      `Mídia visualmente semelhante já existe no banco. ID: ${existing.id}. Use #forçar respondendo à mídia para salvar duplicado ou use #ID ${existing.id} para solicitar esta mídia.`
    );
    return;
  }
} else {
  forceMap[chatId] = false;
}

      const dir = path.resolve(__dirname, 'media');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const fileName = `media-${Date.now()}.${extToSave}`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, bufferWebp);

      const groupId = message.from.endsWith('@g.us') ? message.from : null;

      const nsfw = await isNSFW(pngBuffer);

      let description = null;
      let tags = null;

      if (!nsfw) {
  if (message.mimetype.startsWith('video/')) {
    try {
      const aiResult = await processVideo(filePath);
      const clean = cleanDescriptionTags(aiResult.description, aiResult.tags);
      description = clean.description;
      tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
    } catch (err) {
      console.warn('Erro ao processar vídeo:', err);
    }
  } else if (mimetypeToSave.startsWith('image/')) {
    const aiResult = await getAiAnnotations(pngBuffer);
    const clean = cleanDescriptionTags(aiResult.description, aiResult.tags);
    description = clean.description;
    tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
  } else if (message.mimetype.startsWith('audio/')) {
    try {
      description = await transcribeAudioBuffer(buffer);
      if (description) {
        const prompt = `\nVocê é um assistente que recebe a transcrição de um áudio em português e deve gerar até 5 tags relevantes, separadas por vírgula, relacionadas ao conteúdo dessa transcrição.\n\nTranscrição:\n${description}\n\nResposta (tags separadas por vírgula):\n              `.trim();
        const tagResult = await getAiAnnotationsFromPrompt(prompt);
        const clean = cleanDescriptionTags(null, tagResult.tags);
        tags = clean.tags.length > 0 ? clean.tags.join(',') : '';
      } else {
        tags = '';
      }
    } catch (err) {
      console.warn('Erro ao processar áudio:', err);
      description = '';
      tags = '';
    }
  }
} else {
  console.log('Mídia NSFW detectada, pulando IA');
  description = '';
  tags = '';
}
const senderId = (message.sender && message.sender.id) ? message.sender.id : message.from;
      await saveMedia({
  chatId,
  groupId,
  senderId,
  filePath,
  mimetype: mimetypeToSave,
  timestamp: Date.now(),
  description,
  tags,
  hashVisual,
  hashMd5,
  nsfw: nsfw ? 1 : 0
});

      // Busca mídia salva para obter ID e dados
const savedMedia = await findByHashVisual(hashVisual);

// Limpa novamente para exibir
const clean = cleanDescriptionTags(savedMedia.description, savedMedia.tags ? (typeof savedMedia.tags === 'string' ? savedMedia.tags.split(',') : savedMedia.tags) : []);

let responseMessage = `✅ Figurinha adicionada!\n\n`;
responseMessage += `📝 ${clean.description || ''}\n`;
responseMessage += `🏷️ ${clean.tags.length > 0 ? clean.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''}\n`;
responseMessage += `🆔 ${savedMedia.id}`;

await client.sendText(chatId, responseMessage);

    } catch (e) {
        console.error('Erro ao processar mídia:', e);
        if (e.response && e.response.data) {
          console.error('Detalhes do erro de resposta:', e.response.data);
        }
        await client.sendText(chatId, 'Erro ao processar sua mídia.');}

      })
    }

async function updateMediaDescription(id, description) {
  return new Promise((resolve, reject) => {
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    const dbPath = path.resolve(__dirname, 'media.db');
    const db = new sqlite3.Database(dbPath);

    db.run(`UPDATE media SET description = ? WHERE id = ?`, [description, id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });

    db.close();
  });
}