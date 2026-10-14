# Média Certa FSA — atualização de outubro de 2026

Calculadora acadêmica em HTML, CSS e JavaScript, com **simulador dentro de Minhas notas**.

## Abrir o site

1. Extraia o arquivo ZIP mantendo `index.html`, `style.css`, `script.js`, `calculator-core.js` e a pasta `assets` juntos.
2. Abra `index.html` em um navegador atualizado, ou publique a pasta em hospedagem estática (GitHub Pages, Vercel etc.).
3. Na primeira abertura, veja a tela **Como funciona**. Acesse **Minhas notas** e informe a P1.
4. O simulador aparecerá abaixo das notas, com os 21 cenários de P2, de 0,0 a 10,0 em intervalos de 0,5.

Os cálculos não dependem de internet nem de API. O projeto não usa bibliotecas externas.

## Arquivos

- `index.html`: tela inicial e seção Minhas notas com simulador integrado.
- `style.css`: design responsivo Menta & Graduação.
- `script.js`: interface, navegação, histórico, sincronização de ATV e persistência no navegador.
- `calculator-core.js`: funções matemáticas independentes do navegador.
- `assets/mascote-fsa-novo.png`: novo mascote fornecido pelo usuário, sem alterações na imagem.
- `test-core.js`: testes do cálculo com Node.js.
- `test-browser.py`: testes interativos com Playwright/Chromium; dependências de testes não são necessárias para usar o site.
- `VALIDACAO.md`: requisitos conferidos, resultados de teste e limitações.

## Regras matemáticas

Na modalidade **Tenho prova integrada**:

`M = 0.4 * (P1 + P2) + 0.1 * (PI + ATV)`

Na modalidade **Tenho apresentação valendo 0,5**:

`M = 0.4 * P1 + 0.4 * min(10, P2 + 0.5) + 0.2 * ATV`

Na modalidade **Não tenho nenhuma das duas**:

`M = 0.4 * (P1 + P2) + 0.2 * ATV`

O bônus da apresentação é adicionado **uma vez**, sem ultrapassar nota efetiva 10,0. As três modalidades somam 100% dos pesos.

### Arredondamento e aprovação

A média bruta é calculada em precisão completa. Após isso, a fração decimal de `0,00–0,24` cai no inteiro anterior, `0,25–0,74` é arredondada para meio ponto e `0,75–0,99` para o próximo inteiro. Para fins matemáticos, a aprovação começa em **4,750 de média bruta** (média arredondada 5,0). A aprovação real continua sujeita a eventuais outras exigências da instituição.

### ATV em branco

A ATV vazia é considerada **zero exclusivamente nas projeções**, não representa nota oficial zero e **não é preenchida no armazenamento**. Você pode digitar uma ATV estimada tanto na área de notas quanto no simulador. Ambos os campos apontam para o **mesmo valor** e se atualizam imediatamente. Ao alterar esse campo, o valor passa a ser tratado como a nota informada pelo usuário, inclusive nas notas salvas.

### P.I em branco

A P.I só é exigida na modalidade com prova integrada. Quando está vazia, não é inventada nem implicitamente zerada: cada cenário mostra **uma faixa de média** (P.I entre 0 e 10). Uma linha é classificada como:

- **Aprovado:** a nota da P2 garante aprovação mesmo com P.I = 0.
- **Reprovado:** não é possível aprovar mesmo com P.I = 10.
- **Depende da P.I:** o resultado muda conforme a nota da P.I; não se afirma aprovação ou reprovação.

A barra e os percentuais dividem **todas as 21 linhas** nas categorias acima. Quando existem indeterminados, é mostrada uma terceira taxa. Esses números são contagens de cenários, **não uma probabilidade estatística real**.

### P2 informada

A nota de P2 salva nunca é alterada pelos cenários. A tabela mostra todas as **21 hipóteses**, mesmo que a P2 já esteja preenchida, permitindo comparação. O cenário da P2 igual à nota registrada é marcado como “Sua nota” quando coincide com um dos passos de 0,5.

## Histórico e armazenamento

A aplicação mantém a chave de armazenamento `media-certa-state-v1` para conservar notas e históricos das versões anteriores. As outras disciplinas antes cadastradas não são excluídas, mas os controles para criá-las/trocá-las já haviam sido retirados, conforme solicitado anteriormente. O usuário pode salvar, restaurar ou excluir cenários do histórico da disciplina ativa.

## Itens removidos deliberadamente

- Aba independente do simulador: o simulador fica imediatamente abaixo das notas.
- Aba, interface, botões, OCR e importação de boletim por imagem.
- Seleção por botões de cada cenário da P2.
- Painel “Descobrir uma nota mínima”, assinalado na terceira imagem, e sua lógica de interface exclusiva.
- A imagem antiga do mascote e o texto antigo do rodapé.

O rodapé agora contém um link para [@odavifs no Instagram](https://www.instagram.com/odavifs_/).

## Testar o código

Com Node.js instalado:

```bash
node --check calculator-core.js
node --check script.js
node test-core.js
```

Para executar os testes de interface automatizados, com Python, Playwright e Chromium:

```bash
python test-browser.py
```

O ambiente de validação desta versão bloqueava navegar para `file://` no Chromium; o teste de interface carregou os **mesmos HTML/CSS/JS em memória** no navegador. Isso permitiu verificar interações, capturas de tela e layouts, mas não substitui uma checagem manual na hospedagem final.
