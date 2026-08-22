/**
 * Command validation utilities
 */

const { normalizeText } = require('../utils/commandNormalizer');

/**
 * List of valid commands
 */
const VALID_COMMANDS = [
  '#memorias',
  '#memoria',
  '#esquecer',
  '#random',
  '#editar',
  '#deletar',
  '#top10',
  '#top5users',
  '#top5comandos',
  '#id',
  '#forcar',
  '#forçar',
  '#pesquisar',
  '#verificar',
  '#verify',
  '#perfil',
  '#ping',
  '#pong',
  '#criar',
  '#download',
  '#downloadmp3',
  '#fotohd',
  '#pinga',
  '#ban',
  '#issue',
  '#topreactions',
  '#comandos',
  '#reavaliar'
];

const HELP_ENTRIES = [
  {
    command: '#criar <descrição ou áudio>',
    description: 'Gera um meme inteligente. Use "texto em cima" / "texto em baixo" para legendar.',
    example: '#criar usuário nerd reclamando, texto em cima MIMIMIMI, texto em baixo ODEIO STICKERS'
  },
  {
    command: '#pesquisar <situação, emoção ou referência>',
    description: 'Pesquisa stickers por descrição e metadados internos.',
    example: '#pesquisar reação de surpresa'
  },
  {
    command: '#topreactions [dias]',
    description: 'Mostra o ranking de reações dos últimos 7 dias. Informe 1 a 30 dias, por exemplo #topreactions 30 dias.',
    example: '#topreactions 30 dias'
  },
  {
    command: '#memorias / #memoria',
    description: 'Mostra as memórias disponíveis sobre você e o contexto do bot.',
    example: '#memorias'
  },
  {
    command: '#esquecer <termo>',
    description: 'Solicita a remoção de uma memória específica.',
    example: '#esquecer apelido'
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
    command: '#perfil',
    description: 'Mostra seu resumo de figurinhas e comandos utilizados.',
    example: '#perfil'
  },
  {
    command: '#download <URL>',
    description: 'Baixa vídeo: até 60s segue para figurinha; acima disso envia somente o vídeo para download, sem processamento.',
    example: '#download https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#downloadmp3 <URL>',
    description: 'Extrai o áudio em MP3 de um vídeo curto das plataformas suportadas.',
    example: '#downloadmp3 https://youtube.com/watch?v=xxxxx'
  },
  {
    command: '#ban @usuário',
    description: 'Remove usuário mencionado do grupo (somente admins).',
    example: '#ban @5511000000000'
  },
  {
    command: '#issue <texto>',
    description: 'Registra uma issue/relato para acompanhamento.',
    example: '#issue sticker sem metadata no #random'
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
    command: '#verify / #verificar',
    description: 'Gera o código para vincular seu WhatsApp ao cadastro no site do Sticker Bot.',
    example: '#verify'
  },
  {
    command: '#fotohd (respondendo a uma imagem ou figurinha)',
    description: 'Amplia a imagem respondida em 2x com IA local; usa Lanczos3 como fallback.',
    example: '#fotohd'
  },
  {
    command: '#reavaliar <id> [geral|personagem|texto|referencia]',
    description: 'Reavalia um sticker com o Gemma 12B. Use uma flag para limitar o foco da revisão.',
    example: '#reavaliar 5120 texto'
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
