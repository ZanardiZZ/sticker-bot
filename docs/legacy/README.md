# Legacy Documentation

This directory contains documentation for deprecated features and systems that are no longer part of the active codebase.

## Contents

### Socket Mode (open-wa)

The following documents describe the former Socket Mode implementation using the open-wa library:

- **SOCKET_MODE_GUIDE.md** - User guide for the deprecated open-wa socket mode
- **SOCKET_MODE_IMPLEMENTATION.md** - Technical implementation details of the deprecated system

**Status:** Deprecated as of Baileys migration

**Current System:** The project now uses Baileys WebSocket bridge exclusively. See the main README.md for current architecture.

## Why Keep Legacy Documentation?

These documents are retained for:
- Historical reference
- Understanding migration context
- Learning from previous implementations
- Troubleshooting old deployments (if any still exist)

## Current Architecture

For current documentation, see:
- `/README.md` - User guide with current architecture
- `/CLAUDE.md` - Technical guide for developers and AI assistants
- `/docs/BAILEYS_README.md` - Baileys-specific documentation (if available)

## Migration Notes

The project migrated from open-wa to Baileys for improved stability and maintenance. The socket mode concept remains (separating WhatsApp connection from bot logic), but the implementation is entirely different:

**Old:** open-wa + Socket.IO
**New:** Baileys + WebSocket (ws library)

For migration information, see the main CHANGELOG.md.
