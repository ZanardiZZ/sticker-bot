# Legacy Documentation

This folder contains historical documentation of features that have been implemented, bugs that have been fixed, and migrations that have been completed.

These documents are preserved for historical reference but are no longer actively maintained.

## 📁 Structure

### fixes/
Bug fixes and issue resolutions that have been implemented:
- FIX_GROUP_COUNTING_ISSUE.md - Group sticker counting fix
- FIX_LARGE_GIF_CONVERSION.md - GIF conversion optimization
- FIX_LARGE_QUEUE_ERRORS.md - Queue processing improvements
- FIX_LID_COUNTER.md - LID counter fix
- OLD_STICKERS_TAGS_FIX.md - Tags migration fix

### migrations/
One-time database and system migrations that have been completed:
- LID_MIGRATION.md - WhatsApp LID system migration
- SENDER_ID_MIGRATION.md - Sender ID data migration
- WHATSAPP_VERIFICATION.md - Verification system implementation

### implementations/
Feature implementations and system designs that are now part of the codebase:
- ANIMATED_WEBP_SHARP_IMPLEMENTATION.md - WebP processing
- GIF_PROCESSING_IMPROVEMENTS.md - GIF optimization
- ID_REUSE_FUNCTIONALITY.md - ID reuse system
- QUEUE_AND_DUPLICATE_MANAGEMENT.md - Queue management
- APPROVAL_SYSTEM.md - Edit approval system
- SEMVER_IMPLEMENTATION.md - Semantic versioning
- SOCKET_MODE_GUIDE.md - Old socket mode
- SOCKET_MODE_IMPLEMENTATION.md - Socket implementation

### features/
Implemented features with detailed guides (now integrated):
- MESSAGE_HISTORY_RECOVERY.md - History recovery feature
- PACK_FEATURE_GUIDE.md - Sticker pack system
- WEB_PACK_SHARING.md - Web pack sharing
- WASTICKERS_IMPLEMENTATION.md - WhatsApp pack integration
- VIDEO_DOWNLOAD_FEATURE.md - Video download
- VERSION_MANAGEMENT.md - Version system
- MULTIFRAME_ANALYSIS_DISABLE.md - Multi-frame config
- COMMAND_USAGE_ANALYTICS.md - Command analytics

## 🎯 Purpose

These documents are kept for:
- Historical reference - Understanding past decisions
- Troubleshooting - Similar issues in the future
- Learning - How features were implemented
- Onboarding - New developers understanding the system evolution

## 📚 Current Documentation

For current and active documentation, see the main docs/ folder.

## ⚠️ Note

Documents in this folder may reference code that has since changed or been refactored. Always verify against the current codebase.
