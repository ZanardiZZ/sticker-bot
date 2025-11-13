# Sticker Bot Custom Agents Configuration

This directory contains custom agent definitions for improving agent-based coding efficiency in the Sticker Bot repository.

## Available Agents

### 1. Sticker Bot Expert (`sticker-bot-expert.md`)

**Purpose**: Comprehensive expert agent for all Sticker Bot development tasks

**Expertise Areas**:
- WhatsApp bot development (Baileys, WebSocket bridges)
- Media processing (images, videos, GIFs, WebP conversion)
- Node.js backend development (Express, SQLite, async operations)
- AI integration (OpenAI, content filtering, transcription)
- Web administration (authentication, analytics, user management)
- Database management (SQLite WAL mode, migrations, queues)

**When to Use**:
- Implementing new bot commands
- Adding web interface features
- Database migrations and schema changes
- Media processing improvements
- AI feature integration
- Bug fixes and optimizations
- Security enhancements
- Performance tuning

**Key Capabilities**:
- ✅ Understands repository architecture and patterns
- ✅ Knows network/firewall restrictions and workarounds
- ✅ Follows established coding standards and conventions
- ✅ Implements proper error handling and logging
- ✅ Respects minimal change philosophy
- ✅ Includes testing and validation procedures
- ✅ Documents changes appropriately

## Using Custom Agents

### For GitHub Copilot

The agent definitions in this directory serve as context for GitHub Copilot and other AI assistants working on this repository. They provide:

1. **Domain Knowledge**: Detailed understanding of repository structure and patterns
2. **Best Practices**: Coding standards, testing procedures, and security guidelines
3. **Common Tasks**: Step-by-step guides for frequent development scenarios
4. **Troubleshooting**: Solutions to common issues and error messages

### For Agent-Based Tools

When using agent-based coding tools:

1. **Reference the appropriate agent** based on your task
2. **Provide context** from the agent's expertise areas
3. **Follow the guidelines** in the agent definition
4. **Validate changes** using the testing procedures outlined

### Agent Selection Guide

| Task Type | Recommended Agent | Why |
|-----------|------------------|-----|
| Bot command development | Sticker Bot Expert | Complete WhatsApp/Baileys expertise |
| Web interface changes | Sticker Bot Expert | Knows Express/auth patterns |
| Database operations | Sticker Bot Expert | SQLite/migration expertise |
| Media processing | Sticker Bot Expert | Sharp/FFmpeg/AI integration |
| AI features | Sticker Bot Expert | OpenAI integration patterns |
| General development | Sticker Bot Expert | Comprehensive repository knowledge |

## Agent Development Guidelines

When creating new agents for this repository:

### 1. Structure
```markdown
# Agent Name

[Brief description of agent's purpose and expertise]

## Your Expertise
[List specific areas of expertise]

## Repository Context
[Relevant repository information]

## Common Tasks
[Step-by-step guides for common scenarios]

## Best Practices
[Coding standards and guidelines]

## Quick Reference
[Helpful commands, file locations, patterns]
```

### 2. Content Requirements

Include:
- ✅ Clear expertise definition
- ✅ Repository architecture overview
- ✅ Development workflow guidelines
- ✅ Testing and validation procedures
- ✅ Common patterns and examples
- ✅ Troubleshooting guide
- ✅ Quick reference section

Avoid:
- ❌ Overly generic advice
- ❌ Outdated information
- ❌ Conflicting guidelines
- ❌ Unnecessary complexity

### 3. Maintenance

Keep agents updated:
- Review when major changes occur
- Update examples with actual code
- Add new patterns as they emerge
- Remove deprecated information
- Sync with README changes

## Integration with Existing Docs

These custom agents complement existing documentation:

### `.github/copilot-instructions.md`
- Main Copilot configuration
- Repository-wide guidelines
- Referenced by all agents

### `.codex/` Directory
- Task-specific agent definitions
- Feature implementation guides
- Example: `agent-meme-generator.md`

### `web/public/AGENTS.md`
- Frontend-specific guidelines
- UI/UX best practices
- Web development standards

### `docs/` Directory
- Feature documentation
- Migration guides
- Operational procedures

## Testing Agent Effectiveness

To validate custom agents are helpful:

1. **Before Using Agent**: Note the complexity and time estimate for task
2. **After Using Agent**: Compare actual implementation to estimate
3. **Quality Check**: Verify code follows repository patterns
4. **Performance**: Measure if agent improved development speed

### Success Metrics

Good custom agents should:
- ✅ Reduce time to implement common tasks
- ✅ Decrease errors from unfamiliarity with patterns
- ✅ Improve code consistency across changes
- ✅ Lower cognitive load for new contributors
- ✅ Provide faster onboarding for new developers

## Contributing

To improve or add agents:

1. **Create agent file** in `.github/agents/`
2. **Follow structure guidelines** above
3. **Test with real tasks** to validate usefulness
4. **Update this README** with new agent info
5. **Submit PR** with examples of improved efficiency

## Future Enhancements

Potential new agents:

- **Database Migration Expert**: Specialized in SQLite migrations and schema evolution
- **WhatsApp Protocol Expert**: Deep Baileys library and protocol knowledge
- **Media Pipeline Expert**: Advanced FFmpeg, Sharp, and media processing
- **Web Security Expert**: Authentication, rate limiting, input validation
- **Performance Optimizer**: Database query optimization, caching, profiling

## Resources

### Related Documentation
- [Main README](../../README.md) - General repository overview
- [Copilot Instructions](../copilot-instructions.md) - GitHub Copilot config
- [Web Agents Guide](../../web/public/AGENTS.md) - Frontend guidelines
- [Command Analytics](../../docs/COMMAND_USAGE_ANALYTICS.md) - Analytics integration

### External Resources
- [Baileys Documentation](https://github.com/WhiskeySockets/Baileys) - WhatsApp library
- [Sharp Documentation](https://sharp.pixelplumbing.com/) - Image processing
- [SQLite Documentation](https://www.sqlite.org/docs.html) - Database reference
- [Express.js Guide](https://expressjs.com/) - Web framework

---

**Last Updated**: November 2024  
**Maintainer**: Repository contributors  
**Version**: 1.0.0
