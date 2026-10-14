"""Testes de interface via Chromium: o ambiente bloqueia URLs locais, por isso
os mesmos bytes são injetados em uma página de teste em memória.
Execução: python test-browser.py (requer playwright + Chromium)."""
from pathlib import Path
from base64 import b64encode
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).parent
html = (ROOT/'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', '')
html = html.replace('<script src="calculator-core.js"></script>', '').replace('<script src="script.js"></script>', '')
image = b64encode((ROOT/'assets/mascote-fsa-novo.png').read_bytes()).decode('ascii')
html = html.replace('src="assets/mascote-fsa-novo.png"', f'src="data:image/png;base64,{image}"')
js = (ROOT/'script.js').read_text()
core = (ROOT/'calculator-core.js').read_text()
css = (ROOT/'style.css').read_text()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    for width, height, label in [(1440, 900, 'desktop'), (820, 1180, 'tablet'), (390, 844, 'mobile')]:
        page = browser.new_page(viewport={'width':width,'height':height}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(html, wait_until='domcontentloaded')
        page.add_style_tag(content=css)
        page.evaluate('''() => { const store = {}; Object.defineProperty(window, 'localStorage', {configurable: true, value: {
          getItem: k => store[k] ?? null, setItem: (k,v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
        }}); }''')
        page.add_script_tag(content=core)
        page.add_script_tag(content=js)
        assert page.locator('#view-intro').is_visible(), f'intro ausente ({label})'
        assert page.locator('.mascot-image').evaluate('(el) => el.complete && el.naturalWidth > 0'), 'mascote indisponível'
        assert page.locator('.main-nav .nav-link').count() == 2, 'abas removidas presentes'
        assert page.locator('#view-boletim').count() == 0
        assert page.locator('#target-select').count() == 0
        page.get_by_role('button', name='Preencher minhas notas').click()
        assert page.locator('#simulator-card').is_hidden()
        page.locator('#grade-ATV').fill('5')
        assert page.locator('#simulator-card').is_hidden(), 'ATV isolada ativou simulador'
        page.locator('#grade-P1').fill('3')
        assert page.locator('#simulator-card').is_visible()
        assert page.locator('#scenario-table-body tr').count() == 21
        assert page.locator('#scenario-table-body tr').first.locator('td').first.inner_text().startswith('0,0')
        assert page.locator('#scenario-table-body tr').last.locator('td').first.inner_text().startswith('10,0')
        assert page.locator('.scenario-kpis .kpi').count() == 3, 'P.I ausente deveria gerar resultado indeterminado'
        page.locator('#grade-PI').fill('10')
        assert page.locator('.scenario-kpis .kpi').count() == 2
        assert page.locator('#scenario-table-body tr').count() == 21
        page.locator('#simulator-ATV').fill('7,5')
        assert page.locator('#grade-ATV').input_value() == '7,5', 'ATV não sincronizou para cima'
        page.locator('#grade-ATV').fill('8')
        assert page.locator('#simulator-ATV').input_value() == '8', 'ATV não sincronizou para baixo'
        page.locator('#assessment-mode-select').select_option('presentation')
        assert page.locator('#field-PI').is_hidden()
        assert page.locator('#scenario-table-body tr').count() == 21
        page.locator('#grade-P2').fill('9,8')
        assert '10,000' in page.locator('#p2-effective-note').inner_text()
        page.locator('#assessment-mode-select').select_option('none')
        assert page.locator('#p2-effective-note').is_hidden()
        page.locator('#assessment-mode-select').select_option('pi')
        assert page.locator('#field-PI').is_visible()
        page.locator('#toggle-simulator').click()
        assert page.locator('#simulator-content').is_hidden()
        page.locator('#toggle-simulator').click()
        assert page.locator('#simulator-content').is_visible()
        page.locator('#grade-P1').fill('')
        assert page.locator('#simulator-card').is_hidden()
        page.locator('#grade-P1').fill('3')
        page.locator('#save-snapshot').click()
        assert page.locator('.history-item').count() >= 1
        page.screenshot(path=str(ROOT/f'preview-{label}.png'),full_page=True)
        if errors: raise AssertionError(f'JavaScript: {errors}')
        doc_width = page.evaluate('document.documentElement.scrollWidth')
        viewport = page.evaluate('window.innerWidth')
        assert doc_width <= viewport + 2, f'rolagem horizontal {label}: {doc_width}/{viewport}'
        print(f'PASSOU {label}: navegação, simulador, 21 linhas, ATV bidirecional, modalidades, histórico, responsividade e JS')
        page.close()
    browser.close()
