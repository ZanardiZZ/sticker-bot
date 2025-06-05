require('dotenv').config();
const venom = require('venom-bot');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { OpenAI } = require('openai');
const isImageNSFW = require('./is_nsfw');
const { inserirFigurinha, jaExiste } = require('./database');

// Inicializa o cliente OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Pasta onde as figurinhas serão salvas localmente
const localPath = 'stickers';
if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);

venom
  .create({ session: 'sticker-bot' })
  .then(client => start(client))
  .catch(err => {
    console.error('Erro ao iniciar o bot:', err);
  });

function start(client) {
  console.log('🤖 Bot iniciado e aguardando mensagens...');

  client.onMessage(async message => {
    try {
      console.log(`📩 Mensagem recebida de ${message.sender.id}`);
      console.log(`📎 Tipo: ${message.type}`);
      console.log(`🗨️ Texto: ${message.body}`);

      if (message.type === 'sticker') {
        console.log('📥 Iniciando processamento da figurinha...');

        const buffer = await client.decryptFile(message);
        console.log('🧩 Figurinha decodificada.');

        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        console.log('🔑 Hash MD5:', hash);

        if (jaExiste(hash)) {
          console.log('⚠️ Figurinha já registrada. Ignorando...');
          return;
        }

        const isNSFW = await isImageNSFW(buffer);
        console.log('🚫 NSFW?', isNSFW);

        const { description , tag } = await gerarDescricaoETag(buffer);
        console.log('🧠 Descrição:', description);

        const filePath = path.join(localPath, `${hash}.webp`);
        fs.writeFileSync(filePath, buffer);

        inserirFigurinha({
          file: hash,
          descricao: description,
          nsfw: isNSFW,
          remetente: message.sender.id,
          grupo: message.chatId,
          data: new Date().toISOString()

        });

        console.log('✅ Figurinha registrada no banco de dados.');

        // ✅ Envia resposta ao grupo
try {
  await client.sendText(
    message.from,
    `✅ Figurinha adicionada!\n\n📝 *Descrição:* ${description}\n🏷️ *Tag:* ${tag}`
  );
} catch (err) {
  console.error('❌ Erro ao enviar mensagem:', err);
}

      }
    } catch (err) {
      console.error('❌ Erro ao processar figurinha:', err);
    }
  });
}

const sharp = require('sharp');

async function gerarDescricaoETag(buffer) {
  try {
    const base64 = (await sharp(buffer).webp().toBuffer()).toString('base64');

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `Você é um assistente que gera descrições curtas de figurinhas de WhatsApp e atribui uma hashtag apropriada.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Descreva a imagem abaixo em no máximo 150 caracteres e sugira uma hashtag.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/webp;base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const resposta = response.choices[0].message.content;
    
    // Separar a resposta em descrição e tag
    const partes = resposta.split(/#(\w+)/); // separa pela primeira hashtag
    const descricao = partes[0].trim();
    const tag = partes[1] ? `#${partes[1].trim()}` : '#figura';

    return { description: descricao, tag };
  } catch (error) {
    console.error('❌ Erro ao gerar descrição e tag:', error);
    return { description: 'Sem descrição.', tag: '#desconhecida' };
  }
}

module.exports = { gerarDescricaoETag };

