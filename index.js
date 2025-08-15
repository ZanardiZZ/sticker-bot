require('dotenv').config();
const { create } = require('@open-wa/wa-automate');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const {
  saveMedia,
  getRandomMedia,
  incrementRandomCount,
  getMD5,
  getHashVisual,
  findByHashVisual,
  findById,    
  updateMediaTags,
  processOldStickers,
  getMediaWithLowestRandomCount
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

async function sendRandomMediaToGroup(client) {
  if (!AUTO_SEND_GROUP_ID) {
    console.warn('AUTO_SEND_GROUP_ID não configurado no .env');
    return;
  }
  try {
    const novasMedias = await processOldStickers();

    let media;
    if (novasMedias.length > 0) {
      media = {
        id: novasMedias[novasMedias.length - 1].id,
        file_path: novasMedias[novasMedias.length - 1].filePath,
        mimetype: 'image/webp',
      };
    } else {
      media = await getMediaWithLowestRandomCount();
    }
    if (!media) {
      console.log('Nenhuma mídia disponível para envio automático.');
      return;
    }

    await incrementRandomCount(media.id);

    if (media.mimetype.startsWith('image/')) {
      await client.sendImageAsSticker(AUTO_SEND_GROUP_ID, media.file_path, {
        pack: 'StickerBot',
        author: 'Bot',
      });
    } else {
      await client.sendFile(AUTO_SEND_GROUP_ID, media.file_path, 'media', 'Aqui está sua mídia aleatória!');
    }

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

  // Agenda para 09:00, 14:00 e 20:00 todos os dias
  cron.schedule('0 9 * * *', () => sendRandomMediaToGroup(client));
  cron.schedule('0 14 * * *', () => sendRandomMediaToGroup(client));
  cron.schedule('0 20 * * *', () => sendRandomMediaToGroup(client));

  console.log('Agendamento de envios automáticos configurado.');
}

async function start(client) {
  console.log('Bot iniciado!');

  scheduleAutoSend(client);

  client.onMessage(async message => {
    const chatId = message.from;



    const validCommands = [
      '#random',
      '#editar ID',
      '#top10',
      '#top5users',
      '#ID',
      '#forçar'
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
        // Processa a pasta antiga e insere mídias novas no DB com IA
        const novasMedias = await processOldStickers();

        let media;
        if (novasMedias.length > 0) {
          // Prioriza a última mídia inserida da pasta antiga
          media = {
            id: novasMedias[novasMedias.length - 1].id,
            file_path: novasMedias[novasMedias.length - 1].filePath,
            mimetype: 'image/webp',
          };
        } else {
          // Se não houver mídia nova, pega a do banco com menor count_random
          media = await getMediaWithLowestRandomCount();
        }

        if (!media) {
          await client.sendText(chatId, 'Nenhuma mídia salva ainda.');
          return;
        }

        await incrementRandomCount(media.id);

        if (media.mimetype.startsWith('image/')) {
          await client.sendImageAsSticker(chatId, media.file_path, {
            pack: 'StickerBot',
            author: 'Bot',
          });
        } else {
          await client.sendFile(chatId, media.file_path, 'media', 'Aqui está sua mídia aleatória!');
        }
      } catch (err) {
        console.error('Erro no comando #random:', err);
        await client.sendText(chatId, 'Erro ao buscar mídia.');
      }
      return;
    }

    if (taggingMap[chatId]) {
      if (message.type === 'chat' && message.body) {
        const mediaId = taggingMap[chatId];
        const newTagsText = message.body.trim();

        if (newTagsText.length > MAX_TAGS_LENGTH) {
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

          let updatedTags = media.tags ? media.tags + ',' + newTagsText : newTagsText;
          if (updatedTags.length > MAX_TAGS_LENGTH) {
            updatedTags = updatedTags.substring(0, MAX_TAGS_LENGTH);
          }

          // Atualiza as tags no banco
          await updateMediaTags(mediaId, updatedTags);

          await client.sendText(chatId, `Tags atualizadas para a mídia ID ${mediaId}.`);
          taggingMap[chatId] = null;

        } catch (err) {
          console.error('Erro ao adicionar tags:', err);
          await client.sendText(chatId, 'Erro ao adicionar tags.');
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
        await client.sendText(chatId, `Modo edição ativado para a mídia ID ${mediaId}. Envie o texto das tags/descrição para adicionar.`);
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
        await client.sendImageAsSticker(chatId, media.filePath, {
          pack: 'Top10',
          author: 'Bot',
        });
      } else {
        await client.sendFile(chatId, media.filePath, 'media', `Mídia usada ${media.usage_count} vezes.`);
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
    topUsers.forEach((user, idx) => {
      reply += `${idx + 1}. ${user.chat_id} - ${user.sticker_count} figurinhas\n`;
    });

    await client.sendText(chatId, reply);
  } catch (err) {
    console.error('Erro ao buscar top 5 usuários:', err);
    await client.sendText(chatId, 'Erro ao buscar top 5 usuários.');
  }
  return;
}

   // Comando #ID XXX para enviar figurinha específica pelo ID
    if (message.body && message.body.startsWith('#ID ')) {
      const parts = message.body.split(' ');
      if (parts.length === 2) {
        const mediaId = parts[1];
        try {
          const media = await findById(mediaId);
          if (!media) {
            await client.sendText(chatId, `Mídia com ID ${mediaId} não encontrada.`);
            return;
          }

          if (media.mimetype.startsWith('image/')) {
            await client.sendImageAsSticker(chatId, media.filePath, {
              pack: 'StickerBot',
              author: 'Bot',
            });
          } else {
            await client.sendFile(chatId, media.filePath, 'media', 'Aqui está sua mídia solicitada!');
          }
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
      const buffer = await client.decryptFile(message);
      const ext = message.mimetype.split('/')[1] || 'bin';

      const hashMd5 = getMD5(buffer);
      const hashVisual = await getHashVisual(buffer);

      const forceInsert = !!forceMap[chatId];

      if (!forceInsert) {
        const existing = await findByHashVisual(hashVisual);
        if (existing) {
          await client.sendText(
            chatId,
            'Mídia visualmente semelhante já existe no banco. Use #forçar respondendo à mídia para salvar duplicado.'
          );
          return;
        }
      } else {
        forceMap[chatId] = false;
      }

      const dir = path.resolve(__dirname, 'media');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const fileName = `media-${Date.now()}.${ext}`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, buffer);

      const groupId = message.from.endsWith('@g.us') ? message.from : null;

      const nsfw = await isNSFW(buffer);

      let description = null;
      let tags = null;

      if (!nsfw) {
        if (message.mimetype.startsWith('video/')) {
          try {
            const aiResult = await processVideo(filePath);
            description = aiResult.description;
            tags = aiResult.tags ? aiResult.tags.join(',') : null;
          } catch (err) {
            console.warn('Erro ao processar vídeo:', err);
          }
        } else if (message.mimetype.startsWith('image/')) {
          const aiResult = await getAiAnnotations(buffer);
          description = aiResult.description;
          tags = aiResult.tags ? aiResult.tags.join(',') : null;
        } else if (message.mimetype.startsWith('audio/')) {
          try {
            description = await transcribeAudioBuffer(buffer);

            if (description) {
              const prompt = `
Você é um assistente que recebe a transcrição de um áudio em português e deve gerar até 5 tags relevantes, separadas por vírgula, relacionadas ao conteúdo dessa transcrição.

Transcrição:
${description}

Resposta (tags separadas por vírgula):
              `.trim();

              const tagResult = await getAiAnnotationsFromPrompt(prompt);
              tags = tagResult.tags ? tagResult.tags.join(',') : null;
            } else {
              tags = null;
            }
          } catch (err) {
            console.warn('Erro ao processar áudio:', err);
            description = 'Áudio salvo sem descrição AI.';
            tags = null;
          }
        }
      } else {
        console.log('Mídia NSFW detectada, pulando IA');
      }

      await saveMedia({
        chatId,
        groupId,
        filePath,
        mimetype: message.mimetype,
        timestamp: Date.now(),
        description,
        tags,
        hashVisual,
        hashMd5,
        nsfw: nsfw ? 1 : 0
      });

      await client.sendText(chatId, `Mídia salva como ${fileName}`);

      if (message.mimetype.startsWith('image/')) {
        await client.sendImageAsSticker(chatId, filePath, {
          pack: 'StickerBot',
          author: 'Bot'
        });
      }
    } catch (e) {
      console.error('Erro ao processar mídia:', e);
      await client.sendText(chatId, 'Erro ao processar sua mídia.');
    }
  });
}