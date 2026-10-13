# Média Certa FSA

Aplicação web de notas semestrais, feita com HTML5, CSS3 e JavaScript, com armazenamento local no navegador.

## Arquivos

- `index.html` — estrutura das telas e navegação.
- `style.css` — identidade visual Menta & Graduação e layout responsivo.
- `script.js` — eventos, interface, persistência, histórico e importação assistida de boletins.
- `calculator-core.js` — fórmulas, pesos, arredondamento, cálculo de nota mínima e cenários de prova reutilizados por toda a interface.
- `test-core.js` — testes automatizados do núcleo matemático.
- `assets/mascote-fsa.png` — imagem do mascote fornecida pelo usuário, usada sem redesenho nem recorte.

## Como executar

1. Extraia o ZIP mantendo todos os arquivos e a pasta `assets` juntos.
2. Abra `index.html` em um navegador moderno.
3. Na primeira utilização, a tela inicial será **Como funciona**. Ao entrar em outra aba, essa escolha fica registrada no `localStorage`; em visitas futuras a aplicação abre em **Minhas notas**.
4. Preencha as notas disponíveis e escolha a modalidade de avaliação. A aba **Simulador da Minha Média** se atualiza com os dados atuais.

Não é necessário instalar bibliotecas para os cálculos principais. O recurso OCR de boletins precisa de internet para carregar Tesseract.js e o modelo de idioma português de uma CDN. Também é possível colar o texto do boletim e revisar os dados antes da importação.

## Regras implementadas

### Modalidades

- **Tenho prova integrada:** P1 40%, P2 40%, P.I 10% e ATV 10%.
- **Tenho apresentação valendo 0,5:** o bônus é aplicado uma única vez à P2, com limite de 10,0; sem P.I, a ATV vale 20%.
- **Não tenho nenhuma das duas:** sem P.I e sem bônus; a ATV vale 20%.

### Média e notas ausentes

O núcleo mantém a fórmula original e o arredondamento personalizado. A meta de aprovação corresponde a média bruta mínima de 4,750 antes do arredondamento.

Se a ATV estiver vazia, a aplicação usa 0 apenas na projeção, informa essa suposição e mantém o campo oficial em branco. As outras notas ausentes continuam desconhecidas; uma média final só é apresentada quando todos os componentes restantes necessários estiverem disponíveis. Para estimar uma ATV, digite o valor no próprio campo ATV — não existe um simulador individual separado para essa atividade.

### Cenários da próxima prova

As opções usam a escala de 0,0 a 10,0 em intervalos de 0,5. Se P1 estiver preenchida e P2 vazia, o simulador começa no menor valor da escala que seja maior ou igual à nota de P1. Por exemplo, P1 = 3,4 começa em 3,5; P1 = 9,8 começa em 10,0. Se P1 e P2 estiverem vazias, a simulação começa em P1 com 0,0. Se P2 estiver preenchida e P1 vazia, o simulador não calcula retroativamente uma P1. Valores simulados nunca substituem notas oficiais.

## Persistência e disciplinas

As notas, as modalidades e o histórico são guardados em `localStorage`. Conforme autorizado no redesign, o seletor e o botão de criar disciplina foram retirados da interface e os registros existentes não são apagados. A aplicação continua importando linhas de boletim como registros locais; ao importar, o primeiro registro importado se torna o registro ativo. Como o seletor de disciplina está oculto/removido por decisão visual, não há um controle na tela para alternar entre disciplinas salvas.

## Rodar os testes do núcleo

Com Node.js instalado, abra o terminal na pasta do projeto e execute:

```bash
node test-core.js
```

O teste confere a escala de 0,5, os cinco casos de marco inicial, a ordem cronológica, os pesos, a aplicação única do bônus, a ATV como hipótese de zero, arredondamento e os cenários matemáticos de referência.

Para reiniciar a apresentação inicial no navegador, abra as ferramentas de desenvolvedor e execute:

```js
localStorage.removeItem('media-certa-intro-seen-v1');
```

A aplicação não depende de uma API de inteligência artificial. O OCR é assistido e exige revisão humana antes de importar as notas reconhecidas.
