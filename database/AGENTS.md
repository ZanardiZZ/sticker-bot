# Diretrizes para `database`

- Este diretório concentra a camada de dados (SQLite). Novas consultas devem ser implementadas como funções em `index.js` ou em submódulos especializados, sempre exportando interfaces claras.
- Utilize `db.serialize`/`db.run`/`db.all` com parâmetros (`?`) para evitar injeção de SQL. Nunca concatene valores diretamente em strings SQL.
- Alterações de esquema precisam ser refletidas em migrações dentro de `database/migrations`; documente passos manuais quando necessário.
- Funções de acesso ao banco devem retornar `Promise` e lidar com erros rejeitando com objetos `Error` contextualizados; não silencie exceções.
- Logue operações críticas com prefixos `[DB]` apenas quando indispensável e mantenha mensagens em português.
- Ao adicionar índices/tabelas novas, atualize a documentação pertinente e inclua testes que cubram consultas e migrações em `tests/database`.
