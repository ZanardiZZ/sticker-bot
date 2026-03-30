/**
 * Account management routes - password change, user info
 */

const bcrypt = require('bcryptjs');
const { requireLogin } = require('../auth');

function createAccountRoutes(db) {
  const router = require('express').Router();

  // Get account information
  router.get('/account', requireLogin, (req, res) => {
    db.get(`SELECT id, username, role, COALESCE(must_change_password,0) AS must_change_password, password_updated_at
            FROM users WHERE id = ?`, [req.user.id], (err, row) => {
      if (err) return res.status(500).json({ error: 'db_error' });
      if (!row) return res.status(404).json({ error: 'not_found' });
      res.json(row);
    });
  });

  // Change password
  router.post('/account/change-password', requireLogin, async (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'weak_password', msg: 'A senha deve ter pelo menos 8 caracteres.' });
    }
    db.get(`SELECT password_hash FROM users WHERE id = ?`, [req.user.id], async (err, row) => {
      if (err) return res.status(500).json({ error: 'db_error' });
      if (!row) return res.status(404).json({ error: 'not_found' });
      const ok = await bcrypt.compare(current_password, row.password_hash);
      if (!ok) return res.status(401).json({ error: 'invalid_password' });
      const hash = await bcrypt.hash(new_password, 12);
      db.run(`UPDATE users SET password_hash = ?, must_change_password = 0, password_updated_at = ? WHERE id = ?`,
        [hash, Date.now(), req.user.id],
        function (e2) {
          if (e2) return res.status(500).json({ error: 'db_error' });
          res.json({ ok: true });
        });
    });
  });

  return router;
}

module.exports = createAccountRoutes;