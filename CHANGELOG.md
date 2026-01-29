# Changelog

## [0.13.6] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))

### Correções
- fix: Aceita hashes degenerados (imagens transparentes) na inserção (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2cb55621313563d7113972faddf169d1e1f69e92))
- fix: Corrige detecção de duplicatas - saveMedia não populava hash_buckets (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f598c3771becf032833f77e2f28a7695e42bb650))
- fix: Reduz threshold de detecção de hashes degenerados (90% → 80%) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/3b008ff0bca32d06b6bb0d76290062939c1ba36c))
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados também para rejeição de hash de imagem estática (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/366d65b26dfd950b98905a87c21ee21e2c2805d6))
- debug: Adiciona logs detalhados para diagnóstico de erro "formato não suportado" (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7f87103b0cbc51f39456afcf885b706eba28405a))
- debug: Adiciona logs detalhados de verificação de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ed410a009fa495ac0ef2f051730b1ea52084659d))
- debug: Adiciona log de entrada em findSimilarByHashVisual (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c18d010793066a3e1ee871a93c910f478c61f440))
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.5] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))

### Correções
- fix: Corrige detecção de duplicatas - saveMedia não populava hash_buckets (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f598c3771becf032833f77e2f28a7695e42bb650))
- fix: Reduz threshold de detecção de hashes degenerados (90% → 80%) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/3b008ff0bca32d06b6bb0d76290062939c1ba36c))
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados também para rejeição de hash de imagem estática (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/366d65b26dfd950b98905a87c21ee21e2c2805d6))
- debug: Adiciona logs detalhados para diagnóstico de erro "formato não suportado" (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7f87103b0cbc51f39456afcf885b706eba28405a))
- debug: Adiciona logs detalhados de verificação de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ed410a009fa495ac0ef2f051730b1ea52084659d))
- debug: Adiciona log de entrada em findSimilarByHashVisual (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c18d010793066a3e1ee871a93c910f478c61f440))
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.5] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))

### Correções
- fix: Corrige detecção de duplicatas - saveMedia não populava hash_buckets (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f598c3771becf032833f77e2f28a7695e42bb650))
- fix: Reduz threshold de detecção de hashes degenerados (90% → 80%) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/3b008ff0bca32d06b6bb0d76290062939c1ba36c))
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados para diagnóstico de erro "formato não suportado" (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7f87103b0cbc51f39456afcf885b706eba28405a))
- debug: Adiciona logs detalhados de verificação de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ed410a009fa495ac0ef2f051730b1ea52084659d))
- debug: Adiciona log de entrada em findSimilarByHashVisual (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c18d010793066a3e1ee871a93c910f478c61f440))
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.5] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))

### Correções
- fix: Corrige detecção de duplicatas - saveMedia não populava hash_buckets (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f598c3771becf032833f77e2f28a7695e42bb650))
- fix: Reduz threshold de detecção de hashes degenerados (90% → 80%) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/3b008ff0bca32d06b6bb0d76290062939c1ba36c))
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados de verificação de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ed410a009fa495ac0ef2f051730b1ea52084659d))
- debug: Adiciona log de entrada em findSimilarByHashVisual (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c18d010793066a3e1ee871a93c910f478c61f440))
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.4] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))

### Correções
- fix: Reduz threshold de detecção de hashes degenerados (90% → 80%) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/3b008ff0bca32d06b6bb0d76290062939c1ba36c))
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados de verificação de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ed410a009fa495ac0ef2f051730b1ea52084659d))
- debug: Adiciona log de entrada em findSimilarByHashVisual (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c18d010793066a3e1ee871a93c910f478c61f440))
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.4] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))

### Correções
- fix: Reduz threshold de detecção de hashes degenerados (90% → 80%) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/3b008ff0bca32d06b6bb0d76290062939c1ba36c))
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona log de entrada em findSimilarByHashVisual (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c18d010793066a3e1ee871a93c910f478c61f440))
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.4] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))

### Correções
- fix: Reduz threshold de detecção de hashes degenerados (90% → 80%) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/3b008ff0bca32d06b6bb0d76290062939c1ba36c))
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.3] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))

### Correções
- fix: Corrige detecção de hashes degenerados que causavam falsos positivos (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d786ef08b2e052f4b4e230929b6e63f6ec869a7d))
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.2] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.2] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

### Outros
- debug: Adiciona logs detalhados para detecção de duplicatas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d6a04a43b1f8cca09bc245499b5c5edb21fa828))

## [0.13.2] - 2026-01-29

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: Corrige nome de coluna em getLastSentSticker (file_hash → hash_md5) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/26b5c4b65ed6ccde9472185453625aad75cc9fe6))
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

## [0.13.1] - 2026-01-28

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: Corrige falsos positivos na detecção de duplicatas (estática vs GIF) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/111ca4ae4e8240e1f365c5f624358f72d208b0a9))
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

## [0.13.0] - 2026-01-28

### Novidades
- feat: Adiciona tool compareMediaHashes ao AdminWatcher (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/06ba4ed45939f86b82f33b192657d5270f46e300))
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

## [0.12.3] - 2026-01-28

### Novidades
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: CAUSA RAIZ FINAL - Remove documentação obsoleta que ensinava agent a criar media_queue (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e62fb600f77a064fc9964c0f95e586ebccfa4243))
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

## [0.12.2] - 2026-01-28

### Novidades
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: Remove referências enganosas a media_queue que confundiam o agent (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/677acdcf02d9c06de859e382d5f0a382f5c9c6cf))
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

## [0.12.1] - 2026-01-28

### Novidades
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))

### Correções
- fix: Fortalece restrições do AdminWatcher contra criação de tabelas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5a47e3f80bafc9beab3efddbf4bfb5e900bb4b65))

## [0.12.0] - 2026-01-28

### Novidades
- feat: Sistema de auto-deploy via GitHub webhook (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9b0ee51ffbd9d39247d87c0a5aca29bef6bbf542))
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))
- feat: Adiciona comando #reacts para ranking de stickers mais reagidas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/574608634a43b91eadc23618e85cd7c57c3b2d0b))
- feat: Linkar messageId de stickers enviadas para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/41cd6ca5619d136cd93d6dfcc25956324221ed30))

### Correções
- fix: Evita duplicação de commits do bot no changelog (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e07e443c2e5d9b3c2ee60f27361a298e1bd7296e))
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs: Adiciona guia de teste para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/455aa13487fa874ccf6ce8053932ce6458f1fc2a))

## [0.11.0] - 2026-01-28

### Novidades
- feat: Adiciona changelog resumido nas notificações de versão (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/03e3e55178f364b35b28ecd3ca935ecb3264b414))
- feat: Adiciona comando #reacts para ranking de stickers mais reagidas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/574608634a43b91eadc23618e85cd7c57c3b2d0b))
- feat: Linkar messageId de stickers enviadas para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/41cd6ca5619d136cd93d6dfcc25956324221ed30))

### Correções
- fix: Evita duplicação de commits do bot no changelog (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e07e443c2e5d9b3c2ee60f27361a298e1bd7296e))
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs: Adiciona guia de teste para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/455aa13487fa874ccf6ce8053932ce6458f1fc2a))

## [0.10.0] - 2026-01-28

### Novidades
- feat: Adiciona comando #reacts para ranking de stickers mais reagidas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/574608634a43b91eadc23618e85cd7c57c3b2d0b))
- feat: Linkar messageId de stickers enviadas para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/41cd6ca5619d136cd93d6dfcc25956324221ed30))
- feat: Script para reprocessar WebPs sem hash_md5 (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/91b6a46c27df1d02a02be86183417a405a37be0f))
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))

### Correções
- fix: Evita duplicação de commits do bot no changelog (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e07e443c2e5d9b3c2ee60f27361a298e1bd7296e))
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs: Adiciona guia de teste para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/455aa13487fa874ccf6ce8053932ce6458f1fc2a))

## [0.10.0] - 2026-01-27

### Novidades
- feat: Adiciona comando #reacts para ranking de stickers mais reagidas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/574608634a43b91eadc23618e85cd7c57c3b2d0b))
- feat: Linkar messageId de stickers enviadas para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/41cd6ca5619d136cd93d6dfcc25956324221ed30))
- feat: Script para reprocessar WebPs sem hash_md5 (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/91b6a46c27df1d02a02be86183417a405a37be0f))
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))

### Correções
- fix: Evita duplicação de commits do bot no changelog (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e07e443c2e5d9b3c2ee60f27361a298e1bd7296e))
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs: Adiciona guia de teste para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/455aa13487fa874ccf6ce8053932ce6458f1fc2a))

## [0.10.0] - 2026-01-27

### Novidades
- feat: Adiciona comando #reacts para ranking de stickers mais reagidas (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/574608634a43b91eadc23618e85cd7c57c3b2d0b))
- feat: Linkar messageId de stickers enviadas para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/41cd6ca5619d136cd93d6dfcc25956324221ed30))
- feat: Script para reprocessar WebPs sem hash_md5 (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/91b6a46c27df1d02a02be86183417a405a37be0f))
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))

### Correções
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/b95bcfa765393504e5a6307c0b66be5346f9df3c))
- docs: Adiciona guia de teste para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/455aa13487fa874ccf6ce8053932ce6458f1fc2a))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5e740a9821978c91f5f859fde090f35f51cfc88c))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c05bdba436319d55d44b8571d24652bff675280d))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/a4b7d0efb7452e0c445785872435b87d567cd5f5))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7dd2a539305370d6efd187ed0a9dff61d8378624))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0cad8f476f993f78963f43a7ead553a75e2c561b))

### Tarefas
- chore: bump version to 0.10.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/8cafeb4fa57e36bd713f80e342d49bf070ce0b7c))
- chore: bump version to 0.9.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/60332e704b7f6be93b922bf0166d66b9e7bd6d3b))
- chore: bump version to 0.8.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/be116d62d0835955202939001609fc1bd96ddc87))
- chore: bump version to 0.8.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/1c96d313f28a566d3413a33cb6ea56214ca6c889))
- chore: bump version to 0.7.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e4e1103aa365e089c01d954edef45b29a7866088))

## [0.9.0] - 2026-01-27

### Novidades
- feat: Linkar messageId de stickers enviadas para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/41cd6ca5619d136cd93d6dfcc25956324221ed30))
- feat: Script para reprocessar WebPs sem hash_md5 (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/91b6a46c27df1d02a02be86183417a405a37be0f))
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))

### Correções
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs: Adiciona guia de teste para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/455aa13487fa874ccf6ce8053932ce6458f1fc2a))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5e740a9821978c91f5f859fde090f35f51cfc88c))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c05bdba436319d55d44b8571d24652bff675280d))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/a4b7d0efb7452e0c445785872435b87d567cd5f5))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7dd2a539305370d6efd187ed0a9dff61d8378624))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0cad8f476f993f78963f43a7ead553a75e2c561b))

### Tarefas
- chore: bump version to 0.9.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/60332e704b7f6be93b922bf0166d66b9e7bd6d3b))
- chore: bump version to 0.8.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/be116d62d0835955202939001609fc1bd96ddc87))
- chore: bump version to 0.8.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/1c96d313f28a566d3413a33cb6ea56214ca6c889))
- chore: bump version to 0.7.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e4e1103aa365e089c01d954edef45b29a7866088))

## [0.9.0] - 2026-01-27

### Novidades
- feat: Linkar messageId de stickers enviadas para tracking de reações (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/41cd6ca5619d136cd93d6dfcc25956324221ed30))
- feat: Script para reprocessar WebPs sem hash_md5 (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/91b6a46c27df1d02a02be86183417a405a37be0f))
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))

### Correções
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c05bdba436319d55d44b8571d24652bff675280d))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/a4b7d0efb7452e0c445785872435b87d567cd5f5))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7dd2a539305370d6efd187ed0a9dff61d8378624))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0cad8f476f993f78963f43a7ead553a75e2c561b))

### Tarefas
- chore: bump version to 0.9.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/60332e704b7f6be93b922bf0166d66b9e7bd6d3b))
- chore: bump version to 0.8.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/be116d62d0835955202939001609fc1bd96ddc87))
- chore: bump version to 0.8.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/1c96d313f28a566d3413a33cb6ea56214ca6c889))
- chore: bump version to 0.7.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e4e1103aa365e089c01d954edef45b29a7866088))

## [0.8.1] - 2026-01-27

### Novidades
- feat: Script para reprocessar WebPs sem hash_md5 (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/91b6a46c27df1d02a02be86183417a405a37be0f))
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))

### Correções
- fix: Checkpoint WAL mais resiliente para prevenir crescimento descontrolado (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/2e35ab6b14b0cc7be8cd6a42015ee06e1694a68e))

### Documentação
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/a4b7d0efb7452e0c445785872435b87d567cd5f5))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7dd2a539305370d6efd187ed0a9dff61d8378624))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0cad8f476f993f78963f43a7ead553a75e2c561b))

### Tarefas
- chore: bump version to 0.8.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/be116d62d0835955202939001609fc1bd96ddc87))
- chore: bump version to 0.8.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/1c96d313f28a566d3413a33cb6ea56214ca6c889))
- chore: bump version to 0.7.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e4e1103aa365e089c01d954edef45b29a7866088))

## [0.8.0] - 2026-01-27

### Novidades
- feat: Script para reprocessar WebPs sem hash_md5 (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/91b6a46c27df1d02a02be86183417a405a37be0f))
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))
- feat: Sistema de auto-diagnóstico AdminWatcher e melhorias de integridade de hashes (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5b9ba4368df1f0ae2b09589261a3dcd1e229cbfe))

### Correções
- fix: Script de versionamento agora funciona no CI sem banco de dados (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/108bdd4c77324695acd6b222b4d92dff251fc0c3))
- fix: WAL checkpoint timer leak causing SQLITE_MISUSE warnings (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acc053d0790054812dbc00a529879291be86d0f3))

### Documentação
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7dd2a539305370d6efd187ed0a9dff61d8378624))
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0cad8f476f993f78963f43a7ead553a75e2c561b))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d423fb78664f58d0b74903abebf8cc225737bb1))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ea480237793f5f18c48ab642ff613fa31acd1b3a))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf606bd78ac24bb7ced654bf2de7c35dfc8c1a5))

### Tarefas
- chore: bump version to 0.8.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/1c96d313f28a566d3413a33cb6ea56214ca6c889))
- chore: bump version to 0.7.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e4e1103aa365e089c01d954edef45b29a7866088))
- chore: bump version to 0.6.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d4f12b2994696a0e8ac5eeb2470b531f4a9f40ea))

## [0.7.0] - 2026-01-27

### Novidades
- feat: Bloqueia AdminWatcher de criar tabelas desnecessárias (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ef0707fce19a914119b31ca25d3656f2477450d2))
- feat: Sistema de auto-diagnóstico AdminWatcher e melhorias de integridade de hashes (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5b9ba4368df1f0ae2b09589261a3dcd1e229cbfe))

### Correções
- fix: Script de versionamento agora funciona no CI sem banco de dados (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/108bdd4c77324695acd6b222b4d92dff251fc0c3))
- fix: WAL checkpoint timer leak causing SQLITE_MISUSE warnings (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acc053d0790054812dbc00a529879291be86d0f3))

### Documentação
- docs(changelog): atualizações de 2026-01-27 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0cad8f476f993f78963f43a7ead553a75e2c561b))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d423fb78664f58d0b74903abebf8cc225737bb1))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ea480237793f5f18c48ab642ff613fa31acd1b3a))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf606bd78ac24bb7ced654bf2de7c35dfc8c1a5))

### Tarefas
- chore: bump version to 0.7.0 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e4e1103aa365e089c01d954edef45b29a7866088))
- chore: bump version to 0.6.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d4f12b2994696a0e8ac5eeb2470b531f4a9f40ea))

## [0.6.1] - 2026-01-27

### Novidades
- feat: Sistema de auto-diagnóstico AdminWatcher e melhorias de integridade de hashes (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5b9ba4368df1f0ae2b09589261a3dcd1e229cbfe))

### Correções
- fix: Script de versionamento agora funciona no CI sem banco de dados (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/108bdd4c77324695acd6b222b4d92dff251fc0c3))
- fix: WAL checkpoint timer leak causing SQLITE_MISUSE warnings (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acc053d0790054812dbc00a529879291be86d0f3))

### Documentação
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5d423fb78664f58d0b74903abebf8cc225737bb1))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ea480237793f5f18c48ab642ff613fa31acd1b3a))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf606bd78ac24bb7ced654bf2de7c35dfc8c1a5))

### Tarefas
- chore: bump version to 0.6.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d4f12b2994696a0e8ac5eeb2470b531f4a9f40ea))

## [0.6.1] - 2026-01-26

### Novidades
- feat: Sistema de auto-diagnóstico AdminWatcher e melhorias de integridade de hashes (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5b9ba4368df1f0ae2b09589261a3dcd1e229cbfe))

### Correções
- fix: Script de versionamento agora funciona no CI sem banco de dados (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/108bdd4c77324695acd6b222b4d92dff251fc0c3))
- fix: WAL checkpoint timer leak causing SQLITE_MISUSE warnings (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acc053d0790054812dbc00a529879291be86d0f3))

### Documentação
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ea480237793f5f18c48ab642ff613fa31acd1b3a))
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf606bd78ac24bb7ced654bf2de7c35dfc8c1a5))

### Tarefas
- chore: bump version to 0.6.1 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d4f12b2994696a0e8ac5eeb2470b531f4a9f40ea))

## [0.6.0] - 2026-01-26

### Novidades
- feat: Sistema de auto-diagnóstico AdminWatcher e melhorias de integridade de hashes (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5b9ba4368df1f0ae2b09589261a3dcd1e229cbfe))

### Correções
- fix: WAL checkpoint timer leak causing SQLITE_MISUSE warnings (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acc053d0790054812dbc00a529879291be86d0f3))

### Documentação
- docs(changelog): atualizações de 2026-01-26 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf606bd78ac24bb7ced654bf2de7c35dfc8c1a5))

## [0.6.0] - 2026-01-26

### Novidades
- feat: Sistema de auto-diagnóstico AdminWatcher e melhorias de integridade de hashes (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/5b9ba4368df1f0ae2b09589261a3dcd1e229cbfe))

## [0.6.0] - 2026-01-25

### Novidades
- feat: Adiciona instalador web com wizard interativo (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9949d92f298959ff4832efad841fea11b37760d9))

### Documentação
- docs(changelog): atualizações de 2026-01-24 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/486fbf9edc14dfe10da16e934180cacd1895a327))

## [0.6.0] - 2026-01-24

### Novidades
- feat: Adiciona instalador web com wizard interativo (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9949d92f298959ff4832efad841fea11b37760d9))
- feat: Adiciona métricas de performance ao comando #ping (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/87ff940a6d2cc556ef7313c919d8d0a1d51935ea))
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Correções
- fix: Calcula tamanho real da pasta mídia ao invés de soma parcial (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf2177ad6dd0a6473f7a60b13b6110ac5f22474))

### Documentação
- docs(changelog): atualizações de 2026-01-24 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/8656b54e7be7bf87ecd02faffd8075f49108933a))
- docs(changelog): atualizações de 2026-01-24 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f02a3604c35b09e6d8ea419770b626eb066b8cfb))
- docs: Reorganização agressiva da pasta docs/ (Opção B) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9f3dcd668821b90658a67910c67159d824c953d9))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f2060ab4fe5ae05cf6e822672b7fc025f8576cff))
- docs: Adiciona plano completo para instalador web cross-platform (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c6a2baa89b830d160763e32d2eaf28301cc0a241))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0afd41c23dad94e7e8e73c7a86f04cfc0b0a4051))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/8b684d1e030473aebe3e551181cbb05a5331dfbc))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d5462b9e0558e86222552218ac63f325b9e33246))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6742f3cb7cc2a3b04f72bbb12021dc6216d6ffd1))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 3 (Refatoração Profunda) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/63f113dfa14160d230bae8b2e1eb848187e17651))
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-24

### Novidades
- feat: Adiciona métricas de performance ao comando #ping (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/87ff940a6d2cc556ef7313c919d8d0a1d51935ea))
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Correções
- fix: Calcula tamanho real da pasta mídia ao invés de soma parcial (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf2177ad6dd0a6473f7a60b13b6110ac5f22474))

### Documentação
- docs(changelog): atualizações de 2026-01-24 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f02a3604c35b09e6d8ea419770b626eb066b8cfb))
- docs: Reorganização agressiva da pasta docs/ (Opção B) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9f3dcd668821b90658a67910c67159d824c953d9))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f2060ab4fe5ae05cf6e822672b7fc025f8576cff))
- docs: Adiciona plano completo para instalador web cross-platform (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c6a2baa89b830d160763e32d2eaf28301cc0a241))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0afd41c23dad94e7e8e73c7a86f04cfc0b0a4051))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/8b684d1e030473aebe3e551181cbb05a5331dfbc))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d5462b9e0558e86222552218ac63f325b9e33246))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6742f3cb7cc2a3b04f72bbb12021dc6216d6ffd1))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 3 (Refatoração Profunda) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/63f113dfa14160d230bae8b2e1eb848187e17651))
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-24

### Novidades
- feat: Adiciona métricas de performance ao comando #ping (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/87ff940a6d2cc556ef7313c919d8d0a1d51935ea))
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Correções
- fix: Calcula tamanho real da pasta mídia ao invés de soma parcial (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf2177ad6dd0a6473f7a60b13b6110ac5f22474))

### Documentação
- docs: Reorganização agressiva da pasta docs/ (Opção B) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/9f3dcd668821b90658a67910c67159d824c953d9))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/f2060ab4fe5ae05cf6e822672b7fc025f8576cff))
- docs: Adiciona plano completo para instalador web cross-platform (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c6a2baa89b830d160763e32d2eaf28301cc0a241))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0afd41c23dad94e7e8e73c7a86f04cfc0b0a4051))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/8b684d1e030473aebe3e551181cbb05a5331dfbc))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d5462b9e0558e86222552218ac63f325b9e33246))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6742f3cb7cc2a3b04f72bbb12021dc6216d6ffd1))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 3 (Refatoração Profunda) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/63f113dfa14160d230bae8b2e1eb848187e17651))
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Adiciona métricas de performance ao comando #ping (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/87ff940a6d2cc556ef7313c919d8d0a1d51935ea))
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Correções
- fix: Calcula tamanho real da pasta mídia ao invés de soma parcial (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf2177ad6dd0a6473f7a60b13b6110ac5f22474))

### Documentação
- docs: Adiciona plano completo para instalador web cross-platform (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/c6a2baa89b830d160763e32d2eaf28301cc0a241))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0afd41c23dad94e7e8e73c7a86f04cfc0b0a4051))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/8b684d1e030473aebe3e551181cbb05a5331dfbc))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d5462b9e0558e86222552218ac63f325b9e33246))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6742f3cb7cc2a3b04f72bbb12021dc6216d6ffd1))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 3 (Refatoração Profunda) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/63f113dfa14160d230bae8b2e1eb848187e17651))
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Adiciona métricas de performance ao comando #ping (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/87ff940a6d2cc556ef7313c919d8d0a1d51935ea))
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Correções
- fix: Calcula tamanho real da pasta mídia ao invés de soma parcial (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/acf2177ad6dd0a6473f7a60b13b6110ac5f22474))

### Documentação
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/8b684d1e030473aebe3e551181cbb05a5331dfbc))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d5462b9e0558e86222552218ac63f325b9e33246))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6742f3cb7cc2a3b04f72bbb12021dc6216d6ffd1))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 3 (Refatoração Profunda) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/63f113dfa14160d230bae8b2e1eb848187e17651))
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Adiciona métricas de performance ao comando #ping (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/87ff940a6d2cc556ef7313c919d8d0a1d51935ea))
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Documentação
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/d5462b9e0558e86222552218ac63f325b9e33246))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6742f3cb7cc2a3b04f72bbb12021dc6216d6ffd1))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 3 (Refatoração Profunda) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/63f113dfa14160d230bae8b2e1eb848187e17651))
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Documentação
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6742f3cb7cc2a3b04f72bbb12021dc6216d6ffd1))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 3 (Refatoração Profunda) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/63f113dfa14160d230bae8b2e1eb848187e17651))
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Documentação
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/7cc80867ef3d52822a6c9c91b7d3a389cc4bfd54))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 2 (Processamento de Vídeo) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/56f7d56c4f88644cb23f8ad86042b5c85077ee4e))
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Documentação
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec6101aeb3161b0e1ace14f1bffa7a0ca375636e))
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

### Desempenho
- perf: Implementa otimizações Fase 1 (Quick Wins) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/575519817f5bc9c0768860d3e475f8a822f3a3d4))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

### Documentação
- docs: Adiciona plano detalhado de otimizações (OTIMIZACOES.md) (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cc15780634b2fa562035a2467785b2ae31df568a))
- docs(changelog): atualizações de 2026-01-23 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/35ae81c99dfb8a4b8210115ad5af5861ac0b00d2))

## [0.6.0] - 2026-01-23

### Novidades
- feat: Upgrade hash visual de 64-bit para 1024-bit e correções gerais (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6429ee53681a1ca15aefca3928c0403e51da2e71))

## [0.6.0] - 2026-01-21

### Documentação
- docs(changelog): atualizações de 2026-01-20 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/55101fa28dbd57fa306aaaeda1629cd97ef19483))

## [0.6.0] - 2026-01-20

### Documentação
- docs(changelog): atualizações de 2026-01-19 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/0d1b48d75eaf10279938d8940465684395aa493d))

## [0.6.0] - 2026-01-19

### Novidades
- feat: Sistema de notificação de versão e workflow automático (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6a7d6c3b0591b8c23223d4da230ad568e1782a4b))

### Correções
- fix: Remove permissão inválida 'metadata' do workflow (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/29353428bfbd7d70dabc5013891bfe5fa2abd4b4))
- fix: Filtra hashes degenerados no backfill de mídia animada (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6966e5b5f264a595e68bf3228e3a792298f42965))
- fix: Melhora detecção de hashes degenerados (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/749d8577652836f0b7d24ee309c50fc8270a074c))
- fix: Ignora hashes degenerados na comparação de similaridade (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cb119315a4312b81a95a40f5747066c0fe30e4b2))
- fix: Corrige hammingDistance para suportar hashes multi-frame (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec875913d452fa4167754babddf0a9399a30d678))
- fix: Corrige erro de coluna updated_at na tabela bot_config (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6e0aa6730948f38a980dcb85cf871bef152f68d9))
- fix: Atualiza script de versão para seguir Conventional Commits (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/09ef2c00026b753d5c563fa12fc345e23dd18192))

### Documentação
- docs(changelog): atualizações de 2026-01-18 (por github-actions[bot]) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/49ddb37c4a5d27245399fcf5266073be0a7a593b))

### Outros
- Implementa contagem de reações para stickers e permissões de comandos por grupo (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/24ddba264b64ccfa23e8a71db1d110a75a5cde09))
- Melhora performance do web server (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ca9c6e52327d231628529c864592f590c22e09a8))
- Remove menções de usuários e usa primeira pessoa nas respostas do bot (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e23c086b197ebca677f273375714de90ef0d4a37))
- Implementa detecção de duplicatas por distância de Hamming (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/486bc93242496df0a24e8103a2fcdc7cd09d0ba4))
- Add CLAUDE.md for Claude Code guidance (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/4a5aaeeb153b46475e17f48e753b92bbf55923bc))

## [0.6.0] - 2026-01-18

### Novidades
- feat: Sistema de notificação de versão e workflow automático (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6a7d6c3b0591b8c23223d4da230ad568e1782a4b))

### Correções
- fix: Remove permissão inválida 'metadata' do workflow (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/29353428bfbd7d70dabc5013891bfe5fa2abd4b4))
- fix: Filtra hashes degenerados no backfill de mídia animada (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6966e5b5f264a595e68bf3228e3a792298f42965))
- fix: Melhora detecção de hashes degenerados (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/749d8577652836f0b7d24ee309c50fc8270a074c))
- fix: Ignora hashes degenerados na comparação de similaridade (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/cb119315a4312b81a95a40f5747066c0fe30e4b2))
- fix: Corrige hammingDistance para suportar hashes multi-frame (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ec875913d452fa4167754babddf0a9399a30d678))
- fix: Corrige erro de coluna updated_at na tabela bot_config (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/6e0aa6730948f38a980dcb85cf871bef152f68d9))
- fix: Atualiza script de versão para seguir Conventional Commits (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/09ef2c00026b753d5c563fa12fc345e23dd18192))

### Outros
- Implementa contagem de reações para stickers e permissões de comandos por grupo (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/24ddba264b64ccfa23e8a71db1d110a75a5cde09))
- Melhora performance do web server (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/ca9c6e52327d231628529c864592f590c22e09a8))
- Remove menções de usuários e usa primeira pessoa nas respostas do bot (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/e23c086b197ebca677f273375714de90ef0d4a37))
- Implementa detecção de duplicatas por distância de Hamming (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/486bc93242496df0a24e8103a2fcdc7cd09d0ba4))
- Add CLAUDE.md for Claude Code guidance (por root) ([link](https://github.com/ZanardiZZ/sticker-bot/commit/4a5aaeeb153b46475e17f48e753b92bbf55923bc))

> Log de mudanças com foco em usuários: novidades, correções e melhorias relevantes.

## [0.5.0] - 2025-11-13

### 🔧 Sistema de Versionamento

- **Novo sistema de versionamento automático** - Versão agora inicia em 0.5 e incrementa automaticamente
  - Auto-incremento de 0.1 (minor version) a cada geração de changelog
  - **Suporte para patch-only updates** - Use a palavra `patch` no commit para incrementar apenas o patch (0.5.0 → 0.5.1)
  - Suporte para bump manual via commit messages (e.g., `bump: version 1.0`)
  - Histórico de versões armazenado no banco de dados
  - Integração com workflow de changelog diário
  - Script `scripts/increment-version.js` para gerenciamento manual
  - Documentação completa em `docs/VERSION_MANAGEMENT.md`

### 📝 Detalhes Técnicos

- Versões armazenadas na tabela `version_info` do banco de dados
- Formato: `major.minor.patch` (ex: 0.5.0, 0.5.1, 0.6.0, 1.0.0)
- Workflow do GitHub Actions atualizado para incrementar versão antes do changelog
- Testes unitários adicionados para validar incremento de versão
- Package.json sincronizado automaticamente com versão do banco
- Patch updates não resetam a versão minor (ideal para pequenos fixes)

## [1.0.0] - 2025

### 🚀 Major Changes

#### Migration to Baileys
- **Migrated from OpenWA to Baileys** - WhatsApp library upgrade for better stability and support
- **WebSocket Bridge Architecture** - Separated WhatsApp session from bot logic
  - Start bridge: `npm run baileys:server`
  - Start bot: `npm run bot`
  - Restart bot without rescanning QR code
- **Persistent Sessions** - Session data stored in `auth_info_baileys/`

### ✨ New Commands

#### Media Commands
- **#criar** - Generate memes using AI (DALL-E integration)
- **#exportarmemes** - Export all generated memes (admin only)
- **#fotohd** - Upscale photos to HD quality using AI
- **#downloadmp3** / **#baixarmp3** / **#baixaraudio** - Download audio from video URLs

#### Utility Commands
- **#perfil** - Show user profile and statistics
- **#ping** - Check bot status, uptime, and version
- **#tema** - Get random sticker by theme/topic
- **#issue** - Report issues to developers

#### Moderation Commands
- **#deletar** - Delete sticker by ID using voting system (3 votes, or immediate for original sender/admins)

### 🎨 Features

#### AI Integration
- **Automatic tagging** - AI-powered content analysis and tagging
- **Audio transcription** - OpenAI Whisper integration for voice messages
- **Image upscaling** - HD photo enhancement
- **Meme generation** - AI-generated memes from text prompts
- **NSFW filtering** - Automatic content moderation with external providers

#### Media Processing
- **Animated WebP support** - Process animated stickers with Sharp
- **GIF optimization** - Automatic conversion and size optimization
- **Video downloads** - Support for YouTube, TikTok, Instagram, Twitter, and more
- **Audio extraction** - Download audio from video platforms
- **Queue system** - High-volume media processing with retry logic

#### Web Interface
- **User verification** - Link WhatsApp account to web account with `#verificar`
- **Analytics dashboard** - Usage statistics and user rankings
- **Duplicate management** - Detect and remove duplicate media
- **IP rules** - Allow/block specific IP addresses
- **Command usage tracking** - `#top5comandos` ranking

#### Database & Performance
- **WAL mode** - Better concurrency for SQLite
- **Contact migration** - Historical sender ID migration tools
- **LID support** - WhatsApp's new Local Identifier system
- **Automatic retries** - Handle SQLITE_BUSY errors gracefully

### 🛡️ Security & Moderation

- **Rate limiting** - Protection against abuse
- **Request logging** - Detailed analytics and monitoring
- **Ban command** - Remove users from groups (`#ban @user`)
- **Force save** - Admin override for media processing
- **NSFW detection** - Multiple providers (HuggingFace, OpenAI, local TensorFlow)

### 🔧 Configuration

#### New Environment Variables
- `BAILEYS_WS_PORT` - WebSocket bridge port (default: 8765)
- `BAILEYS_WS_URL` - Bridge URL for bot connection
- `BAILEYS_CLIENT_TOKEN` - Authentication token
- `OPENAI_API_KEY_MEMECREATOR` - Dedicated key for meme generation
- `MEME_IMAGE_SIZE` - Image dimensions (default: 1024x1024)
- `MEME_IMAGE_QUALITY` - Quality setting (default: low)
- `NSFW_EXTERNAL_PROVIDER` - External NSFW detection providers
- `HUGGINGFACE_API_KEY` - HuggingFace API integration
- `DISABLE_MULTIFRAME_WEBP_ANALYSIS` - Disable multi-frame analysis

### 🐛 Bug Fixes

- **Large GIF conversion** - Fixed conversion failing on large files
- **LID counter** - Fixed sticker counter after WhatsApp LID migration
- **Animated WebP processing** - Replaced FFmpeg with Sharp for better support
- **Multi-frame analysis** - Optional disable to prevent resource contention
- **Missing sender IDs** - Migration tool for historical data

### 📚 Documentation

- **Updated README** - Reflects Baileys architecture and new commands
- **Legacy documentation** - Socket Mode guides marked as legacy
- **Command guides** - Detailed usage for all commands
- **Migration guides** - Database migration documentation
- **Testing docs** - Integration and unit test documentation

### 🗑️ Deprecated

- **OpenWA library** - Completely removed in favor of Baileys
- **Socket.IO mode** - Legacy open-wa socket mode no longer supported
- **Direct mode** - Replaced by WebSocket bridge architecture

---

## Migration from OpenWA

If you're upgrading from an OpenWA-based version:

1. **Backup your database** - Copy `stickers.db` to a safe location
2. **Clear old sessions** - Remove old OpenWA session directories
3. **Install dependencies** - Run `PUPPETEER_SKIP_DOWNLOAD=true npm install --ignore-scripts`
4. **Configure Baileys** - Update `.env` with Baileys settings
5. **Start bridge** - Run `npm run baileys:server` and scan QR code
6. **Start bot** - Run `npm run bot` to connect

---

For detailed information about specific features, see the [README.md](README.md) and documentation in the `docs/` directory.