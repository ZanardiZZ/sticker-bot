Baileys migration (adapter + WS server)

Setup
- npm install
- Configure environment:
  - BAILEYS_WS_PORT=8765 (server)
  - BAILEYS_ALLOWED_TOKENS=dev (comma-separated)
  - BAILEYS_WS_URL=ws://localhost:8765 (client)
  - BAILEYS_CLIENT_TOKEN=dev (client)
  - BAILEYS_AUTH_DIR=auth_info_baileys (server, default)

Run
- Start Baileys server: npm run baileys:server
- Scan QR in terminal once to persist session in auth_info_baileys
- Create adapter in your app with require('./waAdapter').createAdapter()
- The bot runs on this adapter by default; just start it normally once the bridge is online.

Example
node index.js

Notes
- Messages are forwarded to registered clients only for allowed chats provided on register/subscribe.
- Client methods exposed: sendText, sendFile, sendRawWebpAsSticker, sendImageAsSticker, sendImageAsStickerGif (not implemented, falls back), sendMp4AsSticker (not implemented).
- Adapter emits messages via onAnyMessage/onMessage with an OpenWA-like shape.
