# How to Use Sticker Bot Custom Agents

This guide shows how to leverage custom agents for efficient development in the Sticker Bot repository.

## Quick Start

### For GitHub Copilot Users

The custom agent definitions automatically enhance GitHub Copilot's understanding of the repository:

1. **Open any file** in the repository
2. **Start coding** - Copilot will reference agent knowledge
3. **Use comments** to guide Copilot:
   ```javascript
   // Create a new bot command that sends top 5 stickers by user
   ```
4. **Copilot will suggest** code following repository patterns

### For AI-Assisted Development

When using AI assistants (ChatGPT, Claude, etc.):

1. **Share agent context**:
   ```
   I'm working on the Sticker Bot repository. 
   Please reference .github/agents/sticker-bot-expert.md for context.
   ```

2. **Describe your task**:
   ```
   I need to add a new command #mystickers that shows all stickers 
   uploaded by the current user.
   ```

3. **AI will provide** implementation following repository standards

### For Code Reviews

When reviewing code:

1. **Check alignment** with agent guidelines
2. **Verify patterns** match examples in agent definitions
3. **Ensure testing** follows validation procedures
4. **Confirm documentation** updates are included

## Common Scenarios

### Scenario 1: Adding a New Bot Command

**Task**: Create `#mystickers` command

**Using the Agent**:

1. **Reference the agent section** on "Adding New Bot Commands"
2. **Follow the pattern**:
   ```javascript
   // commands/myStickers.js
   const { getMediaByUser } = require('../database/models/media');
   const { recordCommandUsage } = require('../database/models/commandUsage');
   
   async function handleMyStickers(sock, msg) {
     const userJid = msg.key.participant || msg.key.remoteJid;
     
     try {
       const media = await getMediaByUser(userJid, 10);
       
       if (media.length === 0) {
         await sock.sendMessage(msg.key.remoteJid, {
           text: '📭 Você ainda não enviou nenhuma figurinha.'
         });
         return;
       }
       
       const response = `🎨 Suas últimas ${media.length} figurinhas:\n\n` +
         media.map(m => `• #${m.id} - ${m.description || 'Sem descrição'}`).join('\n');
       
       await sock.sendMessage(msg.key.remoteJid, { text: response });
       
       // Record usage for analytics
       await recordCommandUsage('mystickers', msg.key.remoteJid, userJid);
       
     } catch (error) {
       console.error('[MYSTICKERS] Error:', error.message);
       await sock.sendMessage(msg.key.remoteJid, {
         text: '❌ Erro ao buscar suas figurinhas.'
       });
     }
   }
   
   module.exports = { handleMyStickers };
   ```

3. **Register in command dispatcher**
4. **Test the command**:
   ```bash
   npm run bot
   # Send #mystickers to the bot
   ```

5. **Update documentation** in README

### Scenario 2: Adding a Web API Endpoint

**Task**: Create `/api/user/stickers` endpoint

**Using the Agent**:

1. **Reference "Adding Web Interface Features"**
2. **Implement following the pattern**:
   ```javascript
   // In server.js
   app.get('/api/user/stickers', auth.requireAuth, async (req, res) => {
     try {
       const userId = req.session.userId;
       const page = parseInt(req.query.page) || 1;
       const limit = parseInt(req.query.limit) || 20;
       const offset = (page - 1) * limit;
       
       const stickers = await dataAccess.getUserStickers(userId, limit, offset);
       const total = await dataAccess.getUserStickersCount(userId);
       
       res.json({
         success: true,
         data: stickers,
         pagination: {
           page,
           limit,
           total,
           pages: Math.ceil(total / limit)
         }
       });
     } catch (error) {
       console.error('[API] Error fetching user stickers:', error);
       res.status(500).json({
         success: false,
         error: 'Failed to fetch stickers'
       });
     }
   });
   ```

3. **Add data access method**:
   ```javascript
   // In web/dataAccess.js
   async function getUserStickers(userId, limit, offset) {
     const sql = `
       SELECT m.* FROM media m
       JOIN contacts c ON m.sender_id = c.id
       JOIN users u ON c.whatsapp_id = u.whatsapp_id
       WHERE u.id = ?
       ORDER BY m.timestamp DESC
       LIMIT ? OFFSET ?
     `;
     return await dbAll(sql, [userId, limit, offset]);
   }
   ```

4. **Test the endpoint**:
   ```bash
   npm run web
   # Visit http://localhost:3000/api/user/stickers (authenticated)
   ```

### Scenario 3: Database Migration

**Task**: Add rating system for stickers

**Using the Agent**:

1. **Reference "Database Changes"** section
2. **Create migration script**:
   ```javascript
   // scripts/add-ratings-table.js
   const db = require('../database/db');
   
   async function migrate() {
     console.log('[MIGRATION] Adding ratings table...');
     
     try {
       await db.run(`
         CREATE TABLE IF NOT EXISTS media_ratings (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           media_id INTEGER NOT NULL,
           user_id INTEGER NOT NULL,
           rating INTEGER CHECK(rating >= 1 AND rating <= 5),
           timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
           FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
           UNIQUE(media_id, user_id)
         )
       `);
       
       await db.run(`
         CREATE INDEX IF NOT EXISTS idx_media_ratings_media_id 
         ON media_ratings(media_id)
       `);
       
       await db.run(`
         CREATE INDEX IF NOT EXISTS idx_media_ratings_user_id 
         ON media_ratings(user_id)
       `);
       
       console.log('[MIGRATION] ✅ Ratings table created successfully');
     } catch (error) {
       console.error('[MIGRATION] ❌ Failed:', error.message);
       throw error;
     }
   }
   
   if (require.main === module) {
     migrate()
       .then(() => process.exit(0))
       .catch(() => process.exit(1));
   }
   
   module.exports = { migrate };
   ```

3. **Test migration**:
   ```bash
   node scripts/add-ratings-table.js
   ```

4. **Create data access methods**:
   ```javascript
   // database/models/ratings.js
   async function addRating(mediaId, userId, rating) {
     await db.run(
       `INSERT OR REPLACE INTO media_ratings (media_id, user_id, rating) 
        VALUES (?, ?, ?)`,
       [mediaId, userId, rating]
     );
   }
   
   async function getAverageRating(mediaId) {
     const result = await db.get(
       'SELECT AVG(rating) as avg FROM media_ratings WHERE media_id = ?',
       [mediaId]
     );
     return result?.avg || 0;
   }
   ```

### Scenario 4: AI Feature Integration

**Task**: Add automatic content warnings

**Using the Agent**:

1. **Reference "AI Feature Integration"**
2. **Check OpenAI availability**:
   ```javascript
   const { getOpenAI, isAIAvailable } = require('./services/ai');
   
   async function analyzeContent(imageBuffer) {
     if (!isAIAvailable()) {
       console.log('[AI] OpenAI not available, skipping analysis');
       return { warning: null, safe: true };
     }
     
     try {
       const openai = getOpenAI();
       const base64Image = imageBuffer.toString('base64');
       
       const response = await openai.chat.completions.create({
         model: 'gpt-4o-mini',
         messages: [{
           role: 'user',
           content: [
             {
               type: 'text',
               text: 'Analyze this image and determine if it contains any sensitive content. Respond with JSON: {"warning": "description if sensitive, null otherwise", "safe": boolean}'
             },
             {
               type: 'image_url',
               image_url: {
                 url: `data:image/jpeg;base64,${base64Image}`
               }
             }
           ]
         }],
         max_tokens: 300
       });
       
       return JSON.parse(response.choices[0].message.content);
     } catch (error) {
       console.error('[AI] Content analysis failed:', error.message);
       return { warning: null, safe: true }; // Fail open
     }
   }
   ```

3. **Integrate into media processing pipeline**
4. **Test with/without API key**

## Best Practices from the Agent

### 1. Always Use Environment Checks

```javascript
// Good - graceful degradation
if (isAIAvailable()) {
  await enhanceWithAI(data);
} else {
  useBasicProcessing(data);
}

// Bad - hard requirement
const openai = getOpenAI(); // Throws if not configured
```

### 2. Consistent Error Handling

```javascript
// Good - user-friendly error messages
try {
  await processMedia(msg);
} catch (error) {
  console.error('[MEDIA] Processing failed:', error.message);
  await sock.sendMessage(jid, {
    text: '❌ Não foi possível processar a mídia. Tente novamente.'
  });
}

// Bad - generic or no error handling
await processMedia(msg); // May crash bot
```

### 3. Logging Standards

```javascript
// Good - consistent prefixes and context
console.log('[BOT] Command received:', command);
console.log('[DB] Saved sticker:', stickerId);
console.error('[ERROR] Failed to download:', url, error.message);

// Bad - inconsistent or missing context
console.log('Received command'); // Which module?
console.log(error); // Not descriptive
```

### 4. Database Operations

```javascript
// Good - parameterized queries
await db.run('SELECT * FROM media WHERE id = ?', [userId]);

// Bad - SQL injection risk
await db.run(`SELECT * FROM media WHERE id = ${userId}`);
```

## Validation Checklist

Before committing, verify using agent guidelines:

- [ ] **Installation**: Tested with `npm install --ignore-scripts && npm rebuild sqlite3 sharp`
- [ ] **Web interface**: Tested with `npm run web` (1-2 seconds startup)
- [ ] **Bot startup**: Tested with `npm run bot` (3-5 seconds)
- [ ] **Database**: Migration tested if applicable
- [ ] **Error handling**: All errors caught and logged
- [ ] **Logging**: Consistent prefixes used
- [ ] **Documentation**: README updated if needed
- [ ] **Security**: Input validated, parameterized queries used
- [ ] **Patterns**: Matches existing repository code style

## Advanced Usage

### Creating Task-Specific Prompts

When working on complex features, create focused prompts:

```
Task: Implement duplicate media detection with perceptual hashing

Context: Use the Sticker Bot Expert agent guidelines

Requirements:
- Use existing database models
- Follow queue system patterns
- Handle errors gracefully
- Log with [DUPLICATE] prefix
- Support batch processing

Reference sections:
- Database Operations
- Media Processing
- Common Patterns
```

### Combining Multiple Agents

For cross-cutting concerns:

```
I'm adding a new web page that displays user statistics.

Please reference:
- .github/agents/sticker-bot-expert.md for backend patterns
- web/public/AGENTS.md for frontend guidelines

Ensure the page is:
- Mobile responsive (frontend agent)
- Uses proper authentication (expert agent)
- Follows database access patterns (expert agent)
- Optimizes images (frontend agent)
```

## Troubleshooting Agent Usage

### Agent Suggestions Not Helpful

**Problem**: Agent suggests outdated patterns
**Solution**: Check if agent needs updating, reference specific sections

### Missing Context

**Problem**: Agent doesn't understand repository specifics
**Solution**: Explicitly reference the agent file and relevant sections

### Conflicting Guidelines

**Problem**: Different agents suggest different approaches
**Solution**: Follow the hierarchy:
1. Sticker Bot Expert (most specific)
2. Web/Frontend Agents (domain-specific)
3. General Copilot Instructions (fallback)

## Feedback and Improvements

Help improve the custom agents:

1. **Report issues** when agent guidelines are unclear
2. **Suggest additions** for common tasks not covered
3. **Submit examples** of successful agent-assisted development
4. **Update agents** when repository patterns change

See [`.github/agents/README.md`](README.md) for contribution guidelines.

---

**Last Updated**: November 2024  
**Next Review**: When major patterns change or new features are added
