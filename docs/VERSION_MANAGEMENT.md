# Version Management System

This document describes the automated version management system for the Sticker Bot.

## Overview

The bot uses a decimal versioning system (0.5, 0.6, 0.7, etc.) that automatically increments when the changelog is generated. The current version is stored in both:
- `package.json` - for npm and application metadata
- Database (`version_info` table) - for version history and tracking

## Version Format

Versions follow the format: `major.minor.patch`

- **Major**: Represents breaking changes or major milestones (e.g., 0.x, 1.x, 2.x)
- **Minor**: Auto-increments by 1 for each changelog generation (represents 0.1 increments)
- **Patch**: Used for hotfixes or small changes that don't warrant a minor version bump

Examples:
- `0.5.0` - Initial version (starting point)
- `0.5.1` - Patch update (small fix)
- `0.6.0` - After first changelog generation (minor increment)
- `0.7.0` - After second changelog generation
- `1.0.0` - Major milestone (manual bump)
- `1.1.0` - After changelog generation following 1.0.0

## Automatic Version Increment

The version automatically increments when the daily changelog GitHub Action runs:

1. The workflow runs the `scripts/increment-version.js` script
2. The script checks recent commits for manual bump or patch-only instructions (see below)
3. If a "patch" keyword is found, only the patch version is incremented
4. If no manual instruction is found, it auto-increments the minor version by 1
5. The new version is committed to `package.json`
6. The changelog is generated with the new version number

## Patch-Only Updates

For small changes that don't warrant a full version bump, you can use the `patch` keyword in your commit message:

### How It Works

- Include the word `patch` anywhere in your commit message
- The script will increment only the patch version (e.g., `0.5.0` → `0.5.1`)
- The minor version remains unchanged

### Examples

```bash
# Small bug fix
git commit -m "fix: patch - correct typo in message"

# Documentation update
git commit -m "docs: patch update for README"

# Minor style fix
git commit -m "style: patch - adjust button alignment"
```

When the changelog workflow runs with a patch commit:
- Version `0.5.0` → `0.5.1`
- Version `0.6.2` → `0.6.3`
- The minor version stays the same

## Manual Version Bumps

You can manually set the version to any specific number using a commit message:

### Commit Message Format

Include one of these patterns in your commit message:
- `bump: version X.Y` (e.g., `bump: version 1.0`)
- `bump: X.Y` (e.g., `bump: 1.0`)

### Examples

```bash
# Bump to version 1.0
git commit -m "feat: major release - bump: version 1.0"

# Bump to version 2.0
git commit -m "chore: bump: 2.0"

# Bump to version 0.8
git commit -m "bump: version 0.8"
```

When the changelog workflow runs, it will:
1. Detect the bump instruction in recent commits (last 10 commits)
2. Set the version to the specified number (with patch reset to 0)
3. Continue from that version in future auto-increments

## Manual Script Usage

You can also run the version increment script manually:

```bash
# Auto-increment (0.5 → 0.6)
node scripts/increment-version.js

# Set specific version
node scripts/increment-version.js --set 0.5
node scripts/increment-version.js --set 1.0

# Check for version bump in commits
node scripts/increment-version.js --check
```

## Version History

All version changes are tracked in the `version_info` database table with:
- Version number (major, minor, patch)
- Creation timestamp
- Creator (system, manual, commit-instruction)
- Description
- Hidden metadata (previous version, increment type, etc.)

You can query version history using the database models in `database/models/version.js`.

## Integration with Changelog

The changelog automatically includes the version number in section titles:

```markdown
## [0.6.0] - 2024-11-13

### Novidades
- Feature 1
- Feature 2
```

## Testing

Run the version increment tests:

```bash
# Run all unit tests (includes version tests)
npm run test:unit

# Run version increment script test specifically
node tests/unit/incrementVersion.test.js
```

## Workflow

The daily changelog workflow (`.github/workflows/daily-changelog.yml`) includes these steps:

1. **Checkout repository** - with full history
2. **Setup Node.js** - version 20
3. **Install dependencies** - using `PUPPETEER_SKIP_DOWNLOAD=true npm install --ignore-scripts`
4. **Increment version** - runs the increment script
5. **Commit version** - commits the new version to package.json
6. **Generate changelog** - creates changelog entry with version number
7. **Commit changelog** - commits the updated CHANGELOG.md

## Database Schema

The `version_info` table schema:

```sql
CREATE TABLE version_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  major INTEGER NOT NULL DEFAULT 1,
  minor INTEGER NOT NULL DEFAULT 0,
  patch INTEGER NOT NULL DEFAULT 0,
  pre_release TEXT,
  build_metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
  created_by TEXT,
  description TEXT,
  hidden_data TEXT,
  is_current INTEGER DEFAULT 1
);
```

## Best Practices

1. **Use auto-increment for regular updates**: Let the system automatically bump versions during daily changelog generation
2. **Use manual bumps for milestones**: When reaching major milestones (1.0, 2.0), use commit message bumps
3. **Document breaking changes**: When manually bumping major versions, ensure PRs are labeled appropriately
4. **Verify version before release**: Check that `package.json` has the expected version before tagging releases

## Troubleshooting

### Version not incrementing

- Check if the workflow has proper permissions to commit
- Verify the script runs without errors in the Actions log
- Ensure dependencies are installed correctly

### Version jumped unexpectedly

- Check recent commits for bump instructions (`git log -10 --grep="bump:"`)
- Review the workflow run logs in GitHub Actions

### Database version mismatch

- The database version is the source of truth
- If `package.json` doesn't match, run: `node scripts/increment-version.js --set X.Y` to sync
