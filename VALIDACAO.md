# Validação da versão Média Certa FSA

## Escopo implementado

| Requisito pedido | Estado |
| --- | --- |
| Navegação apenas com “Como funciona” e “Minhas notas” | Implementado |
| Simulador incorporado abaixo do formulário de notas | Implementado |
| Boletim por imagem e dependência OCR removidos | Implementado |
| Simulador oculto até haver nota válida na P1; P1 apagada o oculta | Implementado |
| P2 de 0,0 a 10,0, com 21 linhas crescentes e sem botões individuais | Implementado |
| Média bruta, arredondada, resultado e primeira aprovação destacada | Implementado |
| Percentuais de aprovação/reprovação calculados com os cenários reais | Implementado |
| Se a P.I estiver ausente, classificação e porcentagem indeterminadas explícitas | Implementado |
| ATV editável no simulador com sincronização bidirecional | Implementado |
| Fórmula oficial, bônus único e escala 0–10 preservados | Implementado |
| Novo mascote do arquivo enviado, preservado | Implementado |
| Rodapé com @odavifs e URL solicitada | Implementado |
| Bloco “Descobrir uma nota mínima” removido | Implementado |
| Histórico e persistência de notas preservados | Implementado |
| Desktop, tablet e celular | CSS responsivo implementado; testes interativos realizados |

## Testes realmente executados

- `node --check script.js` e `node --check calculator-core.js`: **passaram**.
- `node test-core.js`: **passou**. Foram testados fórmula, arredondamentos nas fronteiras, as três modalidades, soma dos pesos, bônus limitado a 10, notas inválidas, distribuição das 21 P2, primeira P2 aprovada, ATV assumida zero apenas na projeção, P.I ausente com resultados indeterminados e imutabilidade das notas oficiais.
- `python test-browser.py` usando Playwright com Chromium: **passou em 1440 × 900 (desktop), 820 × 1180 (tablet) e 390 × 844 (celular)**. Em cada tamanho foram verificados: tela inicial, imagem carregada, duas abas, ausência do OCR e do painel de nota mínima, formulário e simulador, P1 condicionando a aparição, ATV isolada não ativando o simulador, 21 cenários, atualizações, P.I ausente, sincronização de ATV nos dois sentidos, mudança de modalidades, bônus, minimizar/expandir, ocultação após apagar P1, histórico e ausência de rolagem horizontal no documento. Nenhum erro JavaScript não tratado foi observado.
- Capturas para inspeção: `preview-desktop.png`, `preview-tablet.png` e `preview-mobile.png` foram geradas durante o teste e usadas internamente na conferência do design; não são necessárias para executar a aplicação.

## Limitações

- O ambiente do Chromium bloqueia navegar diretamente para arquivos `file://` com erro `ERR_BLOCKED_BY_ADMINISTRATOR`. Por isso, os testes interativos utilizaram injeção dos próprios bytes do HTML, CSS e JavaScript numa página em memória. **Não houve validação fim a fim de uma publicação em Vercel/GitHub Pages ou no aparelho físico do aluno.**
- Sem a P.I na modalidade correspondente, a média final não é determinada; as linhas mostram faixas e são classificadas como aprovadas/reprovadas apenas quando essa conclusão é garantida. Percentuais incluem a categoria “Indeterminados” quando aplicável.
- A ATV em branco é considerada zero **por instrução expressa para a simulação atual**. Isso não significa que o aluno recebeu zero na atividade.
- O bônus de 0,5 é adicionado à P2 base, limitado a 10. Na modalidade de apresentação, a ATV tem peso 20% para que os pesos somem 100%, conforme interpretação já documentada na versão anterior.
- O navegador armazena as notas localmente, não há login nem sincronização entre diferentes dispositivos.
- A barra de seleção de disciplinas já havia sido removida por autorização anterior; notas de disciplinas antigas continuam no armazenamento, embora não exista controle visual para alterná-las.

## Alterações matemáticas de compatibilidade

A regra antiga que restringia as notas de P2 a um valor maior ou igual à P1 foi substituída pela **regra explícita mais recente**: todas as notas hipotéticas da P2 entre 0 e 10 em intervalos de 0,5. A P1 permanece fixa na fórmula, e cada simulação da P2 é independente. Isso evita omitir cenários válidos de P2 abaixo da P1.
