// Migration to add extracted_text field to media table for AI text extraction from images/GIFs

module.exports = {
  up: async (db) => {
    // Add extracted_text column to media table
    await db.run(`
      ALTER TABLE media ADD COLUMN extracted_text TEXT;
    `);

    console.log('[MIGRATION] Added extracted_text column to media table');
  },

  down: async (db) => {
    // Note: SQLite doesn't support dropping columns directly
    // In a production environment, you'd need to recreate the table
    // For this migration, we'll just leave the column as is
    console.log('[MIGRATION] Note: extracted_text column cannot be dropped in SQLite without recreating table');
  }
};
