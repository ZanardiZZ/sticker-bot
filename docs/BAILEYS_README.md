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
- To run bot with Baileys adapter: set USE_BAILEYS=true and start your bot normally

Example
USE_BAILEYS=true node index.js

Notes
- Messages are forwarded to registered clients only for allowed chats provided on register/subscribe.
- Client methods exposed: sendText, sendFile, sendRawWebpAsSticker, sendImageAsSticker, sendImageAsStickerGif (not implemented, falls back), sendMp4AsSticker (not implemented).
- Adapter emits messages via onAnyMessage/onMessage with an OpenWA-like shape.