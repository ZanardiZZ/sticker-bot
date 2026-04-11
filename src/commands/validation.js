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
  '#forcar',
  '#forçar',
  '#count',
  '#tema',
  '#theme',
  '#verificar',
  '#verify',
  '#perfil',
  '#ping',
  '#pong',
  '#criar',
  '#exportarmemes',
  '#download',
  '#baixar',
  '#downloadmp3',
  '#baixarmp3',
  '#baixaraudio',
  '#fotohd',
  '#pinga',
  '#ban',
  '#issue',
  '#pack',
  '#addpack',
  '#reacts',
  '#comandos'
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
    command: '#theme <palavras-chave> <quantidade opcional>',
    description: 'Alias de #tema.',
    example: '#theme carros futuristas 3'
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
    command: '#forçar / #forcar',
    description: 'Força salvar duplicatas e converte o próximo vídeo em figurinha animada ignorando o áudio.',
    example: '#forcar'
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
    command: '#download <URL>',
    description: 'Baixa mídia da URL (quando suportado pelo bot).',
    example: '#download https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#baixar <URL>',
    description: 'Alias de #download.',
    example: '#baixar https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#downloadmp3 <URL>',
    description: 'Extrai o áudio em MP3 de um vídeo curto das plataformas suportadas. Use #baixarmp3 ou #baixaraudio como atalho.',
    example: '#downloadmp3 https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#baixarmp3 <URL>',
    description: 'Alias de #downloadmp3.',
    example: '#baixarmp3 https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#baixaraudio <URL>',
    description: 'Alias de #downloadmp3.',
    example: '#baixaraudio https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#ban @usuário',
    description: 'Remove usuário mencionado do grupo (somente admins).',
    example: '#ban @5511999999999'
  },
  {
    command: '#issue <texto>',
    description: 'Registra uma issue/relato para acompanhamento.',
    example: '#issue sticker sem metadata no #random'
  },
  {
    command: '#pack <nome>',
    description: 'Envia figurinhas de um pack salvo.',
    example: '#pack memes'
  },
  {
    command: '#addpack <nome>',
    description: 'Adiciona figurinha respondida a um pack.',
    example: '#addpack memes'
  },
  {
    command: '#reacts <texto>',
    description: 'Configura/aciona reações conforme implementação atual do bot.',
    example: '#reacts 👍😂🔥'
  },
  {
    command: '#ping',
    description: 'Exibe informações de status do bot.',
    example: '#ping'
  },
  {
    command: '#pinga',
    description: 'Envia uma figurinha de bebida priorizando a menos usada do tema.',
    example: '#pinga'
  },
  {
    command: '#pong',
    description: 'Resposta rápida de saúde do bot com latência, status WS e fila.',
    example: '#pong'
  },
  {
    command: '#verificar / #verify',
    description: 'Verifica status da mídia/entrada de acordo com as regras do bot.',
    example: '#verificar'
  },
  {
    command: '#fotohd (respondendo a uma figurinha) 4x',
    description: 'Amplia a imagem respondida com IA local (configure REAL_ESRGAN_BIN) e usa Lanczos3 como fallback. Opcionalmente informe o fator de ampliação (ex: 4x). Padrão 2x, use 4x para ampliar quatro vezes.',
    example: '#fotohd 4x'
  },
  {
    command: '#comandos',
    description: 'Exibe esta lista de comandos.',
    example: '#comandos'
  }
];

function isValidCommand(messageBody) {
  if (!messageBody.startsWith('#')) return true;

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

async function handleInvalidCommand(client, chatId) {
  const header = '╭══════════════════════╗\n' +
                 '┃  🤖 Comandos do Sticker Bot\n' +
                 '╰══════════════════════╯';
  const body = HELP_ENTRIES.map(({ command, description, example }) =>
    [
      '╭ ' + command,
      '├ ' + description,
      example ? ('╰ Exemplo: ' + example) : '╰ '
    ].join('\n')
  ).join('\n\n');
  await client.sendText(chatId, header + '\n' + body);
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
