/**
 * Pack routes - handles sticker pack download links
 */

const express = require('express');
const path = require('path');
const { getPackByName, getPackStickers, getTagsForMedia } = require('../../database');
const { generateWastickersZip, WASTICKERS_DIR } = require('../../services/wastickersGenerator');

/**
 * Creates pack-related routes
 * @param {object} db - Database instance
 * @returns {express.Router} Express router
 */
function createPackRoutes(db) {
  const router = express.Router();

  /**
   * GET /api/packs
   * Lists all available packs
   */
  router.get('/packs', async (req, res) => {
    try {
      const { listPacks } = require('../../database');
      const packs = await listPacks(null, 100);
      
      res.json({
        success: true,
        packs: packs.map(pack => ({
          id: pack.id,
          pack_id: pack.pack_id,
          name: pack.name,
          description: pack.description,
          sticker_count: pack.sticker_count,
          max_stickers: pack.max_stickers,
          created_at: pack.created_at,
          download_url: `/api/packs/${encodeURIComponent(pack.name)}/download`
        }))
      });
    } catch (error) {
      console.error('[API] Error listing packs:', error);
      res.status(500).json({ success: false, error: 'Failed to list packs' });
    }
  });

  /**
   * GET /api/packs/:name
   * Get pack details by name
   */
  router.get('/packs/:name', async (req, res) => {
    try {
      const packName = decodeURIComponent(req.params.name);
      const pack = await getPackByName(packName);
      
      if (!pack) {
        return res.status(404).json({ success: false, error: 'Pack not found' });
      }

      const stickers = await getPackStickers(pack.id);
      
      res.json({
        success: true,
        pack: {
          id: pack.id,
          pack_id: pack.pack_id,
          name: pack.name,
          description: pack.description,
          sticker_count: pack.sticker_count,
          max_stickers: pack.max_stickers,
          created_at: pack.created_at,
          stickers: stickers.length,
          download_url: `/api/packs/${encodeURIComponent(pack.name)}/download`,
          share_url: `${req.protocol}://${req.get('host')}/pack/${encodeURIComponent(pack.name)}`
        }
      });
    } catch (error) {
      console.error('[API] Error getting pack:', error);
      res.status(500).json({ success: false, error: 'Failed to get pack details' });
    }
  });

  /**
   * GET /api/packs/:name/download
   * Download pack as .wastickers file
   */
  router.get('/packs/:name/download', async (req, res) => {
    try {
      const packName = decodeURIComponent(req.params.name);
      const pack = await getPackByName(packName);
      
      if (!pack) {
        return res.status(404).json({ success: false, error: 'Pack not found' });
      }

      const stickers = await getPackStickers(pack.id);
      
      if (!stickers || stickers.length === 0) {
        return res.status(404).json({ success: false, error: 'Pack is empty' });
      }

      // Prepare stickers with tags
      const stickersWithTags = [];
      for (const media of stickers) {
        const tags = await getTagsForMedia(media.id);
        stickersWithTags.push({
          ...media,
          tags: tags.map(t => t.replace('#', ''))
        });
      }

      // Generate wastickers file
      const zipPath = await generateWastickersZip(pack, stickersWithTags);
      
      // Set headers for file download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${pack.name}.wastickers"`);
      
      // Send file
      res.sendFile(zipPath, (err) => {
        if (err) {
          console.error('[API] Error sending pack file:', err);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Failed to send pack file' });
          }
        }
      });
    } catch (error) {
      console.error('[API] Error downloading pack:', error);
      res.status(500).json({ success: false, error: 'Failed to generate pack file' });
    }
  });

  /**
   * GET /pack/:name
   * Pack download page (HTML)
   */
  router.get('/pack/:name', async (req, res) => {
    try {
      const packName = decodeURIComponent(req.params.name);
      const pack = await getPackByName(packName);
      
      if (!pack) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pack not found</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              h1 { color: #dc3545; }
            </style>
          </head>
          <body>
            <h1>❌ Pack não encontrado</h1>
            <p>O pack "${packName}" não existe ou foi removido.</p>
          </body>
          </html>
        `);
      }

      const stickers = await getPackStickers(pack.id);
      const percentage = Math.round((pack.sticker_count / pack.max_stickers) * 100);
      
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${pack.name} - Sticker Pack</title>
          <meta property="og:title" content="${pack.name} - Sticker Pack">
          <meta property="og:description" content="${pack.description || 'Download this WhatsApp sticker pack'} - ${pack.sticker_count} stickers">
          <meta property="og:type" content="website">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container {
              background: white;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              max-width: 500px;
              width: 100%;
              padding: 40px;
              text-align: center;
            }
            .icon { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
            .description { color: #666; margin-bottom: 20px; font-size: 16px; }
            .stats {
              background: #f8f9fa;
              border-radius: 10px;
              padding: 20px;
              margin: 20px 0;
            }
            .stat { margin: 10px 0; color: #555; font-size: 14px; }
            .stat strong { color: #333; }
            .progress-bar {
              background: #e9ecef;
              border-radius: 10px;
              height: 20px;
              overflow: hidden;
              margin: 15px 0;
            }
            .progress-fill {
              background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
              height: 100%;
              width: ${percentage}%;
              transition: width 0.3s ease;
            }
            .download-btn {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 10px;
              padding: 15px 30px;
              font-size: 18px;
              font-weight: bold;
              cursor: pointer;
              width: 100%;
              margin: 20px 0;
              transition: transform 0.2s, box-shadow 0.2s;
            }
            .download-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
            }
            .download-btn:active { transform: translateY(0); }
            .instructions {
              background: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 10px;
              padding: 15px;
              margin-top: 20px;
              text-align: left;
            }
            .instructions h3 {
              color: #856404;
              margin-bottom: 10px;
              font-size: 16px;
            }
            .instructions ol {
              color: #856404;
              padding-left: 20px;
              font-size: 14px;
            }
            .instructions li { margin: 5px 0; }
            .apps {
              margin-top: 15px;
              font-size: 12px;
              color: #999;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">📦</div>
            <h1>${pack.name}</h1>
            ${pack.description ? `<p class="description">${pack.description}</p>` : ''}
            
            <div class="stats">
              <div class="stat">
                <strong>${pack.sticker_count}</strong> de <strong>${pack.max_stickers}</strong> stickers
              </div>
              <div class="progress-bar">
                <div class="progress-fill"></div>
              </div>
              <div class="stat">${percentage}% preenchido</div>
            </div>

            <button class="download-btn" onclick="downloadPack()">
              ⬇️ Baixar Pack
            </button>

            <div class="instructions">
              <h3>📱 Como importar:</h3>
              <ol>
                <li>Baixe o arquivo .wastickers</li>
                <li>Abra com um app de stickers do WhatsApp</li>
                <li>Adicione todos os stickers de uma vez!</li>
              </ol>
              <div class="apps">
                Apps compatíveis: Personal Stickers, Sticker Maker, WAStickers
              </div>
            </div>
          </div>

          <script>
            function downloadPack() {
              window.location.href = '/api/packs/${encodeURIComponent(pack.name)}/download';
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('[API] Error rendering pack page:', error);
      res.status(500).send('Error loading pack page');
    }
  });

  return router;
}

module.exports = createPackRoutes;
