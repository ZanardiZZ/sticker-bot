# Diretrizes para `commands`

- Utilize módulos CommonJS (`require`/`module.exports`) e mantenha a estrutura de exportação centralizada em `commands/index.js`.
- Cada handler novo deve ser uma função assíncrona documentada com JSDoc e envolver chamadas I/O em blocos `try/catch`, retornando mensagens de erro em português para o usuário final.
- Use somente helpers expostos em `../utils` e `../database` para acessar funcionalidades compartilhadas; evite instanciar clientes externos diretamente dentro dos comandos.
- Validações de entrada pertencem a `validation.js` ou a novos utilitários análogos; mantenha a lógica de negócios dos handlers enxuta e delegue operações a serviços/DB.
- Ao adicionar um comando, atualize também os testes correspondentes em `tests/` e garanta que o comando não bloqueie o event loop (sem loops síncronos longos).