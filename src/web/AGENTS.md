# Diretrizes para `web`

- Este diretório hospeda o painel Express. Mantenha rotas, middlewares e serviços separados em subpastas e siga o padrão CommonJS.
- Toda rota nova deve exigir autenticação adequada (`requireLogin`/`requireAdmin`) e validar entrada antes de usar recursos sensíveis.
- Use `async/await` com tratamento de erros centralizado; registre falhas via `utils/logCollector` ou `console` com prefixos claros (ex.: `[WEB]`).
- Parâmetros de configuração devem vir de `process.env` com valores padrão seguros; nunca faça require direto de arquivos `.env` fora de `server.js`.
- Evite lógica de negócio pesada nas rotas: delegue para `services/` ou `database/`. Adicione testes de integração ou unitários relevantes em `tests/web` ao modificar comportamento crítico.
- Recursos estáticos devem residir em `web/public`; mantenha dependências front-end mínimas e documente instruções de build quando necessário.
