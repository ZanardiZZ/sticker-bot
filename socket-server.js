const { create } = require('@open-wa/wa-automate');

create({
  sessionId: 'StickerBotSession',
  headless: true,
  socket: true,
  key: 'your_api_key', // <-- Replace with your actual API key
  port: 8002,
  host: '0.0.0.0', // Allows external connections
  executablePath: '/home/dev/work/sticker-bot2/chrome/linux-139.0.7258.154/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
}).then(async (client) => {
  if (typeof client.startSocketServer === 'function') {
    await client.startSocketServer();
    console.log(`✅ Socket server manually started on port 8002`);
  } else {
    console.log('⚠️ startSocketServer not available on client object');
  }
}).catch((err) => {
  console.error('❌ Error:', err);
});