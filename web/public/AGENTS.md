# Diretrizes para `web/public`

- Priorize um front-end leve e simplificado, evitando dependências pesadas ou código desnecessário.
- Garanta responsividade eficiente: o layout deve se adaptar bem tanto a telas ultrawide quanto a telas pequenas de celular.
- Otimize todas as imagens e miniaturas antes do envio; nunca utilize arquivos originais sem compressão para economizar banda de servidor e usuário.
- Mantenha contraste confortável e de fácil leitura, preferindo paletas neutras que não causem ofuscamento imediato (ex.: fundos claros mas não excessivamente brilhantes).
- Toda alteração no frontend deve ser acompanhada de uma captura de tela atualizada para facilitar a revisão e validar o resultado visual.
- Utilize HTML semântico e atributos ARIA quando necessário para garantir acessibilidade.
- Prefira CSS modular e reutilizável (classes utilitárias, variáveis CSS) em vez de estilos inline; documente novas variáveis ou padrões.
- Evite operações de bloqueio no carregamento: carregue scripts de forma assíncrona/deferida e minimize o uso de bibliotecas pesadas (ex.: frameworks de UI grandes como Material UI ou Bootstrap, polyfills desnecessários, bibliotecas de gráficos pesados).
- Reutilize componentes e estilos existentes antes de criar novos, mantendo consistência visual e reduzindo duplicação.
- Teste as alterações em diferentes tamanhos de viewport e navegadores principais sempre que possível, registrando qualquer limitação conhecida.
- Documente no PR quaisquer impactos em desempenho percebidos e passos de otimização aplicados.
