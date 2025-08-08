// utils/erro.js
async function tratarErro(client, message, err) {
  console.error('❌ Erro ao processar mensagem:', err);

  let resposta = '❌ Ocorreu um erro inesperado. Tente novamente mais tarde.';
  const msg = err.message || '';

  if (msg.includes('NSFW')) {
    resposta = '🚫 Conteúdo impróprio (NSFW). Ação cancelada.';
  } else if (
    msg.includes('404') ||
    msg.includes('Falha ao baixar') ||
    msg.includes('decryptFile')
  ) {
    resposta = '❌ Não foi possível obter o arquivo enviado. Verifique se está no formato correto.';
  } else if (msg.match(/database|SQLITE/i)) {
    resposta = '⚠️ Erro ao acessar o banco de dados. Aguarde e tente novamente.';
  } else if (msg.match(/(IA|description|Erro na IA)/i)) {
    resposta = '🤖 Erro ao processar com IA. Tente novamente mais tarde.';
  }

  try {
    await client.sendText(message.from, resposta);
  } catch (sendErr) {
    console.error('❌ Falha ao enviar mensagem de erro ao usuário:', sendErr);
  }
}

module.exports = { tratarErro };
