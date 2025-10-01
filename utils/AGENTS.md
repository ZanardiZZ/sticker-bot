# Diretrizes para `utils`

- Os utilitários devem ser funções puras ou side-effect free sempre que possível; quando não for viável, injete dependências (ex.: cliente WhatsApp) via parâmetros.
- Mantenha a compatibilidade com CommonJS e documente funções públicas com JSDoc descrevendo parâmetros e retornos.
- Padronize mensagens e logs em português e utilize `utils/logCollector` para capturar logs extensos; evite `console.log` disperso.
- Não acople utilitários diretamente a bibliotecas web ou serviços; qualquer integração específica deve viver em `services/` ou `web/` e consumir utilitários via importação.
- Antes de introduzir novas dependências, verifique se já existe utilitário equivalente; adicione/atualize testes unitários em `tests/` quando alterar comportamento.
