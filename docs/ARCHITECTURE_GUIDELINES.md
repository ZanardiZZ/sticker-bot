# Repository Guidelines for sticker-bot

## Architectural Principles
- Keep the WhatsApp client implementation routed through adapters. The current
  production path is the Baileys WebSocket bridge, but abstractions should
  remain thin enough to accommodate future client swaps.
- The Baileys bridge (`server.js`) is mandatory. Any new feature must preserve
  the single entry point so workers can restart without forcing a new QR code
  pairing.
- Processing functions must be decoupled from the bot runtime. Implement new
  behavior as plug-in style services that connect to the Baileys bridge instead
  of coupling directly to the library client.
- Prefer stateless or easily reloadable processors so deployments can roll out
  safely without interrupting the active socket session.

## Code Organization
- Place library-specific adapters in `services/clients` (create the folder if it
  does not exist). Cross-library logic should consume only the adapter
  interface.
- Shared bridge utilities belong in `server.js` or a dedicated helper within
  `utils/`.
- When modifying processing pipelines, ensure each processor can be restarted
  independently and that reconnection logic is resilient.

## Testing and Maintenance
- Add or update automated tests in `tests/` whenever you change behavior or add
  new abstractions.
- Verify that bridge reconnection works after your changes, using the manual
  testing notes in the legacy guides if needed.
- Document new adapters or processors in `README.md` or a dedicated guide.

## Pull Requests
- Summaries must highlight any changes that affect socket stability or client
  abstraction layers.
- Call out required follow-up tasks if support for alternative libraries (e.g.,
  Baileys) still needs additional work.
