-- Schema para sistema de aprovação de edições
-- Este script adiciona as tabelas necessárias para o sistema de aprovação

-- Tabela para armazenar edições pendentes
CREATE TABLE IF NOT EXISTS pending_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  edit_type TEXT NOT NULL, -- 'tags', 'description', 'nsfw'
  old_value TEXT, -- JSON string do valor antigo
  new_value TEXT, -- JSON string do valor novo
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at INTEGER NOT NULL,
  approved_by INTEGER, -- user_id do aprovador
  approved_at INTEGER,
  reason TEXT, -- motivo de rejeição (opcional)
  FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Tabela para rastrear votos de usuários em edições
CREATE TABLE IF NOT EXISTS edit_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pending_edit_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote TEXT NOT NULL, -- 'approve', 'reject'
  created_at INTEGER NOT NULL,
  UNIQUE(pending_edit_id, user_id),
  FOREIGN KEY(pending_edit_id) REFERENCES pending_edits(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pending_edits_media_id ON pending_edits(media_id);
CREATE INDEX IF NOT EXISTS idx_pending_edits_user_id ON pending_edits(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_edits_status ON pending_edits(status);
CREATE INDEX IF NOT EXISTS idx_edit_votes_pending_edit_id ON edit_votes(pending_edit_id);
CREATE INDEX IF NOT EXISTS idx_edit_votes_user_id ON edit_votes(user_id);
