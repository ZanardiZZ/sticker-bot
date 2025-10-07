# Sistema de Aprovação de Edições

## Visão Geral

O sistema de aprovação foi implementado para controlar edições de figurinhas feitas pelos usuários. 

## Como Funciona

### Quem Pode Editar Diretamente
- **Administradores**: Podem editar qualquer figurinha sem aprovação
- **Autor Original**: O usuário que enviou originalmente a figurinha pode editá-la sem aprovação

### Quem Precisa de Aprovação
- **Usuários comuns**: Edições feitas por usuários que não são admins nem autores originais

### Processo de Aprovação
1. **Submissão**: Usuário faz uma edição (tags, descrição, NSFW)
2. **Pendência**: A edição fica com status "pending" (pendente)
3. **Votação**: Outros usuários podem votar "aprovar" ou "rejeitar"
4. **Aprovação Automática**: 
   - 3 votos de "aprovar" → edição é aplicada automaticamente
   - 3 votos de "rejeitar" → edição é rejeitada automaticamente
   - 1 voto de admin → edição é aprovada/rejeitada imediatamente

### Tipos de Edição Suportados
- **tags**: Modificação das tags da figurinha
- **description**: Modificação da descrição
- **nsfw**: Alteração do status NSFW/SFW

## Endpoints da API

### GET /api/pending-edits
Lista edições pendentes
- Query params: `status` (pending, approved, rejected)
- Retorna: Array de edições pendentes

### POST /api/pending-edits/:id/vote
Votar em uma edição pendente
- Body: `{ vote: "approve" | "reject" }`
- Restrições: Usuários não podem votar em suas próprias edições

### POST /api/pending-edits/:id/admin-decision
Decisão administrativa (apenas admins)
- Body: `{ decision: "approve" | "reject", reason?: string }`

### GET /api/stickers/:id/pending-edits
Lista edições pendentes para uma figurinha específica

## Estrutura do Banco de Dados

### Tabela `pending_edits`
- `id`: ID único da edição pendente
- `media_id`: ID da figurinha sendo editada
- `user_id`: ID do usuário que fez a edição
- `edit_type`: Tipo de edição (tags, description, nsfw)
- `old_value`: Valor anterior (JSON)
- `new_value`: Valor proposto (JSON)
- `status`: Status (pending, approved, rejected)
- `created_at`: Data de criação
- `approved_by`: ID do usuário que aprovou/rejeitou
- `approved_at`: Data da aprovação/rejeição
- `reason`: Motivo da rejeição (opcional)

### Tabela `edit_votes`
- `id`: ID único do voto
- `pending_edit_id`: ID da edição pendente
- `user_id`: ID do usuário que votou
- `vote`: Voto (approve, reject)
- `created_at`: Data do voto

## Interface Web

### Página Principal: `/admin-pending-edits.html`
Interface dedicada para gerenciar aprovações

### Tab no Admin: Tab "Aprovações" 
Integrada na interface de admin existente

### Funcionalidades da Interface
- Filtrar por status (pendente, aprovada, rejeitada)
- Votar em edições pendentes
- Decisões administrativas
- Visualizar histórico de aprovações

## Fluxo de Uso

### Para Usuários Comuns
1. Fazer edição em uma figurinha
2. Sistema informa que edição está pendente
3. Aguardar votação de outros usuários
4. Receber feedback do resultado

### Para Votantes
1. Acessar página de aprovações
2. Revisar edições pendentes
3. Votar "aprovar" ou "rejeitar"
4. Sistema aplica automaticamente se atingir 3 votos

### Para Administradores
1. Acesso a todas as funcionalidades acima
2. Poder de aprovação/rejeição imediata
3. Edição direta sem aprovação

## Arquivos Modificados/Criados

### Backend
- `database/models/pendingEdits.js` - Modelo de dados
- `database/migrations/approval_system.sql` - Schema SQL
- `database/migrations/schema.js` - Adicionadas tabelas
- `database/index.js` - Export do modelo
- `utils/approvalUtils.js` - Utilitários de aprovação
- `web/server.js` - Endpoints da API e modificação dos existentes

### Frontend
- `web/public/admin-pending-edits.html` - Página dedicada
- `web/public/admin.html` - Tab de aprovações
- `web/public/admin.js` - Funcionalidades JavaScript

## Segurança

- CSRF token obrigatório para todas as operações
- Verificação de permissões em cada endpoint
- Validação de dados de entrada
- Prevenção de auto-votação
- Logs de auditoria para decisões administrativas
