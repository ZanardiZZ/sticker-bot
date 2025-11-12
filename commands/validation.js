/**
 * Command validation utilities
 */

const { normalizeText } = require('../utils/commandNormalizer');

/**
 * List of valid commands
 */
const VALID_COMMANDS = [
  '#random',
  '#editar',
  '#deletar',
  '#top10',
  '#top5users',
  '#top5comandos',
  '#id',
  '#forçar',
  '#count',
  '#tema',
  '#theme',
  '#verificar',
  '#verify',
  '#perfil',
  '#ping',
  '#criar',
  '#exportarmemes',
  '#downloadmp3',
  '#baixarmp3',
  '#baixaraudio',
  '#fotohd'
];

const HELP_ENTRIES = [
  {
    command: '#criar <descrição ou áudio>',
    description: 'Gera um meme inteligente. Use "texto em cima" / "texto em baixo" para legendar.',
    example: '#criar usuário nerd reclamando, texto em cima MIMIMIMI, texto em baixo ODEIO STICKERS'
  },
  {
    command: '#tema <palavras-chave> <quantidade opcional>',
    description: 'Busca stickers existentes pelo tema informado.',
    example: '#tema carros futuristas 3'
  },
  {
    command: '#random',
    description: 'Envia uma figurinha aleatória do acervo.',
    example: '#random'
  },
  {
    command: '#top10',
    description: 'Mostra as 10 figurinhas mais usadas.',
    example: '#top10'
  },
  {
    command: '#top5comandos',
    description: 'Mostra os 5 comandos mais usados no bot.',
    example: '#top5comandos'
  },
  {
    command: '#top5users',
    description: 'Ranking dos usuários que mais enviaram figurinhas.',
    example: '#top5users'
  },
  {
    command: '#id <número>',
    description: 'Resgata uma figurinha específica pelo ID.',
    example: '#id 5120'
  },
  {
    command: '#deletar ID <número>',
    description: 'Solicita a exclusão de uma mídia. Admins ou autores deletam na hora; demais precisam atingir o limite de votos.',
    example: '#deletar ID 5120'
  },
  {
    command: '#editar',
    description: 'Responde a uma figurinha para atualizar descrição e tags.',
    example: '#editar'
  },
  {
    command: '#forçar',
    description: 'Salva uma figurinha semelhante mesmo com duplicidade.',
    example: '#forçar'
  },
  {
    command: '#count',
    description: 'Informa quantas figurinhas existem no acervo.',
    example: '#count'
  },
  {
    command: '#perfil',
    description: 'Mostra seu resumo de figurinhas e comandos utilizados.',
    example: '#perfil'
  },
  {
    command: '#exportarmemes',
    description: 'Exporta os memes bem avaliados e o dataset de treinamento.',
    example: '#exportarmemes'
  },
  {
    command: '#downloadmp3 <URL>',
    description: 'Extrai o áudio em MP3 de um vídeo curto das plataformas suportadas. Use #baixarmp3 ou #baixaraudio como atalho.',
    example: '#downloadmp3 https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#ping',
    description: 'Exibe informações de status do bot.',
    example: '#ping'
  },
  {
    command: '#fotohd (respondendo a uma figurinha) 4x',
    description: 'Amplia a imagem respondida com IA local (configure REAL_ESRGAN_BIN) e usa Lanczos3 como fallback. Opcionalmente informe 4x para aumentar mais.',
    example: '#fotohd 4x'
  }
];

/**
 * Checks if a message is a valid command
 * @param {string} messageBody - Message text
 * @returns {boolean} True if valid command
 */
function isValidCommand(messageBody) {
  if (!messageBody.startsWith('#')) return true; // não é comando

  const normalizedMessage = normalizeText(messageBody);
  
  const isValid = VALID_COMMANDS.some(cmd => {
    const normalizedCmd = normalizeText(cmd);
    if (normalizedCmd.endsWith('id')) {
      return normalizedMessage.startsWith(normalizedCmd + ' ');
    }
    return normalizedMessage === normalizedCmd || normalizedMessage.startsWith(normalizedCmd + ' ');
  });

  return isValid;
}

/**
 * Sends invalid command message
 * @param {object} client - WhatsApp client
 * @param {string} chatId - Chat ID
 */
async function handleInvalidCommand(client, chatId) {
  const header = '╭══════════════════════╗\n' +
                 '┃  🤖 Comandos do Sticker Bot\n' +
                 '╰══════════════════════╯';
  const body = HELP_ENTRIES.map(({ command, description, example }) =>
    [`╭ ${command}`, `├ ${description}`, example ? `╰ Exemplo: ${example}` : '╰ '].join('\n')
  ).join('\n\n');
  await client.sendText(chatId, `${header}\n${body}`);
}

/**
 * Cleans description and tags from AI-generated bad phrases
 * @param {string} description - Description text
 * @param {string} tags - Tags text
 * @returns {object} Cleaned description and tags
 */
function cleanDescriptionTags(description, tags) {
  const badPhrases = [
    'desculpe',
    'não posso ajudar',
    'não disponível',
    'sem descrição',
    'audio salvo sem descrição ai'
  ];
  
  let cleanDesc = description ? description.toLowerCase() : '';
  if (badPhrases.some(phrase => cleanDesc.includes(phrase))) {
    cleanDesc = '';
  } else {
    cleanDesc = description || '';
  }
  
  let cleanTags = tags ? tags.toLowerCase() : '';
  if (badPhrases.some(phrase => cleanTags.includes(phrase))) {
    cleanTags = '';
  } else {
    cleanTags = tags || '';
  }
  
  return { description: cleanDesc, tags: cleanTags };
}

module.exports = {
  VALID_COMMANDS,
  HELP_ENTRIES,
  isValidCommand,
  handleInvalidCommand,
  cleanDescriptionTags
};
