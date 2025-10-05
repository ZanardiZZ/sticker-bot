# Repository Guidelines for sticker-bot

## Architectural Principles
- Keep the WhatsApp client implementation agnostic. All logic that depends on the
  underlying library (OpenWA, Baileys, Venom, etc.) must live behind
  abstraction layers so that clients can be swapped with minimal changes.
- Socket mode is mandatory. Any new feature must ensure the socket server stays
  the single entry point for bot interactions, allowing external processors to
  connect, restart, or update with minimal downtime.
- Processing functions must be decoupled from the bot runtime. Implement new
  behavior as plug-in style services that connect to the socket server instead
  of coupling directly to the library client.
- Prefer stateless or easily reloadable processors so deployments can roll out
  safely without interrupting the active socket session.

## Code Organization
- Place library-specific adapters in `services/clients` (create the folder if it
  does not exist). Cross-library logic should consume only the adapter
  interface.
- Shared socket-related utilities belong in `socket-server.js` or a dedicated
  helper within `utils/`.
- When modifying processing pipelines, ensure each processor can be restarted
  independently and that reconnection logic is resilient.

## Testing and Maintenance
- Add or update automated tests in `tests/` whenever you change behavior or add
  new abstractions.
- Verify that socket reconnection works after your changes, using any available
  scripts or manual testing notes in `SOCKET_MODE_GUIDE.md`.
- Document new adapters or processors in `README.md` or a dedicated guide.

## Pull Requests
- Summaries must highlight any changes that affect socket stability or client
  abstraction layers.
- Call out required follow-up tasks if support for alternative libraries (e.g.,
  Baileys) still needs additional work.