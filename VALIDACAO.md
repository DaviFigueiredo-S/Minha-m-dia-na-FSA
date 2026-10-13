# Checklist de implementação e validação — Média Certa FSA

Data da atualização: 12/10/2026

## Implementado

- [x] Identidade visual Menta & Graduação com `#0D9488`, `#CCFBF1`, `#334155`, `#F59E0B` e `#F1F5F9`.
- [x] Introdução inicial “Como funciona”, usando a imagem do mascote fornecida como arquivo de imagem e `object-fit: contain` para preservar sua proporção.
- [x] Navegação entre Como funciona, Minhas notas, Simulador da Minha Média e Boletim por imagem.
- [x] Persistência da preferência de não repetir a introdução após visitar outra seção.
- [x] Remoção da barra visível de disciplina e do botão Nova disciplina, preservando registros existentes em armazenamento local.
- [x] Remoção do simulador exclusivo da ATV e dos botões de cenário ATV.
- [x] Projeção de ATV vazia como zero, com aviso visível e sem gravar 0 no campo oficial.
- [x] ATV estimada pode ser informada diretamente no campo Minhas notas.
- [x] Cenários hipotéticos para a próxima prova em escala padronizada de 0,5, com valores limitados a 10,0.
- [x] Ordem cronológica: P1 é simulada quando ainda não há P1/P2; P2 inicia na primeira nota de 0,5 maior ou igual à P1; P1 não é calculada retroativamente a partir da P2.
- [x] Resultado de cenário sem substituir as notas oficiais.
- [x] As funções atuais de média, nota mínima, modalidade e arredondamento continuam centralizadas em `calculator-core.js`.
- [x] Importação assistida de boletim, revisão manual, histórico, botão de limpar notas e minimização do simulador principal preservados.
- [x] CSS reorganizado e regras responsivas para desktop, tablet e celular.

## Testes executados

- [x] `node --check calculator-core.js` — passou.
- [x] `node --check script.js` — passou.
- [x] `node test-core.js` — passou: invariantes, casos de referência, projeções de ATV e ordem cronológica.
- [x] HTML analisado com `HTMLParser`: 61 IDs, sem IDs duplicados.
- [x] Referências estáticas `$()` do JavaScript conferidas: nenhum ID literal ausente no HTML.
- [x] Referências aos antigos controles `activity-sim-panel`, `data-activity-scenario`, `subject-select`, `add-subject` e `load-preset` conferidas: nenhuma referência restante.
- [x] Presença do arquivo `assets/mascote-fsa.png` conferida.

## Cobertura matemática incluída no `test-core.js`

- [x] P1 = 3,0 começa em 3,0.
- [x] P1 = 3,4 começa em 3,5.
- [x] P1 = 2,2 começa em 2,5.
- [x] P1 = 6,7 começa em 7,0.
- [x] P1 = 9,8 começa em 10,0.
- [x] Nenhum cenário supera 10,0 ou sai de intervalos de 0,5.
- [x] Cenário sem P1/P2 começa em P1; P2 com P1 em branco bloqueia retrocálculo; P1 e P2 preenchidas não geram outro cenário de prova.
- [x] Pesos totalizam 100% nas três modalidades.
- [x] P.I é ignorada sem prova integrada.
- [x] Bônus da apresentação fica limitado a 10,0 e o cálculo é feito sobre a nota original, sem mutação repetida.
- [x] ATV vazia vira 0 apenas na projeção; o objeto de notas oficiais permanece vazio.
- [x] Cenários matemáticos de referência A e F.

## Limitação declarada

O Chromium instalado no ambiente não conseguiu concluir nem uma navegação simples headless antes do timeout. Por isso, não foi possível verificar visualmente a renderização real ou simular cliques ponta a ponta em navegador nesta sessão. As verificações de sintaxe, DOM estático e núcleo matemático foram executadas; responsividade visual em tamanhos reais de tela ainda precisa de uma conferência manual no navegador do usuário.

A leitura OCR com uma imagem real também não foi executada nesta etapa. Esse recurso depende de conexão com internet para carregar Tesseract.js e o modelo português.

## Decisão visual preservada

O seletor e o botão de criação de disciplinas foram retirados da interface conforme autorizado, mas os registros locais não são apagados. Isso deixa as disciplinas previamente salvas sem alternância visual entre elas. O comportamento está documentado no README.
