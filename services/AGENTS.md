# Diretrizes para `services`

- Serviços encapsulam integrações externas (IA, fila de mídia, filtros). Estruture módulos como funções ou classes que recebam dependências por parâmetro para facilitar testes.
- Utilize CommonJS e documente APIs públicas com JSDoc. Exporte apenas a superfície necessária para outros módulos.
- Evite guardar estado global persistente; se necessário, proteja com estruturas resilientes e exponha métodos de inicialização/encerramento explícitos.
- Acesso a banco deve ocorrer via `../database` utilizando consultas parametrizadas; nunca monte SQL com interpolação direta.
- Prefira logging com prefixos (`[SERVICE:<nome>]`) e trate exceções propagando erros significativos para quem consome o serviço.
- Adicione ou atualize testes em `tests/services` para cobrir fluxos principais e use mocks para dependências externas pesadas.
