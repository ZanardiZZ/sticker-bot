# Memória do StickerBot2

## Arquitetura atual

- JSON local: fonte estruturada para fatos e exclusão rápida;
- OpenViking: busca semântica e enriquecimento de contexto;
- endpoint: `http://127.0.0.1:1933`;
- o antigo Memory-Bridge em `:8766` não faz parte do runtime.

## Escrita

1. `POST /api/v1/sessions`;
2. usar o `result.session_id` retornado;
3. adicionar mensagem em `/messages`;
4. executar `/commit`;
5. aguardar o processamento assíncrono antes da busca.

O cliente registra os IDs canônicos no índice local do usuário.

## Comandos

- `#memorias`: lista fatos estruturados;
- `#esquecer`: remove o índice JSON e solicita a exclusão das sessões OpenViking rastreadas.

## Recuperação semântica

- O bot usa a mensagem recente como consulta semântica;
- a busca é limitada por `MEMORY_SEMANTIC_SEARCH_TIMEOUT_MS` (padrão: 600 ms) e `MEMORY_SEMANTIC_SEARCH_LIMIT` (padrão: 4);
- a consulta só usa `viking://session/<id>/history/` para sessões registradas no índice JSON local;
- buscas globais sem sessão rastreada são bloqueadas para evitar vazamento entre usuários/grupos;
- documentos de índice `.overview.md` e `.abstract.md` não entram no prompt;
- resultados são incluídos no prompt como contexto provável, não como fato absoluto.

## Verificação

Uma integração saudável exige `/health` com `healthy: true`, `CONVERSATION_ENABLE_MEMORY_CONTEXT=1`, sessões rastreadas no índice local, busca restrita às sessões retornando memórias concretas e contexto semântico no prompt.
