const { findById, updateMediaDescription, updateMediaTags, getTagsForMedia } = require('./database/index.js');
const { cleanDescriptionTags } = require('./utils/messageUtils');
const { clearDescriptionCmds, MAX_TAGS_LENGTH } = require('./commands');

const taggingMap = {};

async function handleTagEditing(client, message, chatId) {
  if (!taggingMap[chatId]) return false;

  if (message.type === 'chat' && message.body) {
    const mediaId = taggingMap[chatId];
    const newText = message.body.trim();

    if (newText.length > MAX_TAGS_LENGTH) {
      await client.sendText(chatId, `Texto muito longo. Limite de ${MAX_TAGS_LENGTH} caracteres.`);
      taggingMap[chatId] = null;
      return true;
    }

    try {
      const media = await findById(mediaId);
      if (!media) {
        await client.sendText(chatId, `Mídia com ID ${mediaId} não encontrada.`);
        taggingMap[chatId] = null;
        return true;
      }

      let newDescription = media.description || '';
      let newTags = await getTagsForMedia(media.id);

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

      if (parts.length === 1 && !newText.toLowerCase().startsWith('descricao:') && !newText.toLowerCase().startsWith('description:')) {
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
      const updatedTags = await getTagsForMedia(mediaId);
      const cleanUpdated = cleanDescriptionTags(
        updatedMedia.description,
        updatedTags
      );

      let updatedMessage = `✅ Figurinha Atualizada!\n\n` +
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

    return true;
  }

  return false;
}

function activateTaggingMode(chatId, mediaId) {
  taggingMap[chatId] = mediaId;
}

function isTaggingActive(chatId) {
  return !!taggingMap[chatId];
}

function deactivateTaggingMode(chatId) {
  taggingMap[chatId] = null;
}

module.exports = {
  handleTagEditing,
  activateTaggingMode,
  deactivateTaggingMode,
  isTaggingActive
};
