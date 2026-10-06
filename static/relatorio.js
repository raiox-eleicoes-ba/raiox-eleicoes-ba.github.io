// Relatório para imprimir / salvar PDF do que está filtrado no painel (usa funções de app.js e comp.js).
// O nível do relatório acompanha o filtro: Bahia → cidades; cidade → escolas + urnas; bairro/escola → urnas.
(function () {
  const pctTxt = (a, b) => b ? (100 * a / b).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '–';
  const bai = b => (filtros.municipio == 39373 && /^centro$/i.test((b || '').trim())) ? 'Sede' : titulo(b || '');
  const sel = id => id === 'f-bairro' ? bai(nomes.bairro) : titulo(nomes[{ 'f-municipio': 'municipio', 'f-local': 'local' }[id]] || '');

  function cabecalho(meta, titulo) {
    const filtro = [sel('f-municipio'), sel('f-bairro'), sel('f-local')].filter(Boolean).join(' · ') || 'Toda a Bahia';
    const foto = $('t-foto') && !$('t-foto').hidden ? `<img src="${$('t-foto').src}" alt="">` : '';
    return `<header class="rel-cab">${foto}
      <div><h1>${esc(meta.candidato)} <span>${esc(meta.numero)}</span></h1>
        <p>${esc(meta.cargo)} · ${esc(meta.partido || '')} · Bahia · Eleição 2026${meta.situacao_texto ? ' · ' + esc(meta.situacao_texto) + ((meta.situacao_tipo || '').endsWith('_calc') ? ' (pela distribuição de vagas do TSE; confirmação oficial pendente)' : '') : ''}</p>
        <p class="rel-filtro"><b>${titulo}</b> — ${esc(filtro)}</p></div></header>`;
  }
  const tabela = (cols, linhas) => `<table><thead><tr>${cols.map(c => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${cols.map(c => `<td class="${c[2] || ''}">${c[1](l)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const n = v => v == null ? '–' : fmt(v);
  const dif = v => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));

  async function rel2026() {
    const r = await get('api/resumo?' + qs()), m = r.meta, f = r.filtro;
    const nivel = !filtros.municipio ? 'bahia' : (filtros.bairro || filtros.local) ? 'urnas' : 'cidade';
    let h = cabecalho(m, 'Votos 2026');
    h += `<div class="rel-num"><div><b>${fmt(f.votos)}</b>votos</div><div><b>${pctTxt(f.votos, f.validos)}</b>dos votos válidos</div>
      <div><b>${fmt(f.secoes)}</b>urnas</div>${nivel === 'bahia' ? `<div><b>${m.oficial_posicao}º</b>lugar na Bahia</div>` : ''}</div>`;
    if (nivel === 'bahia') {
      const c = await get('api/ranking/municipio?limite=5000&' + qs());
      h += `<h2>Votos por cidade (${c.length} cidades com voto)</h2>` + tabela([
        ['#', (l) => c.indexOf(l) + 1, 'n'], ['Cidade', l => esc(titulo(l.nome))], ['Votos', l => fmt(l.votos), 'n'], ['% válidos', l => pctTxt(l.votos, l.validos), 'n']], c);
      h += `<p class="rel-obs">Para imprimir escola por escola e urna por urna, escolha uma cidade no filtro.</p>`;
    } else {
      if (nivel === 'cidade') {
        // bairros e povoados (no cadastro do TSE, povoados e distritos aparecem como bairro)
        const b = await get('api/ranking/bairro?limite=5000&' + qs());
        h += `<h2>Sede e povoados (${b.length} com voto)</h2>` + tabela([
          ['#', l => b.indexOf(l) + 1, 'n'], ['Sede / povoado', l => esc(bai(l.bairro || l.nome.split(' — ')[0]))], ['Votos', l => fmt(l.votos), 'n'],
          ['% válidos', l => pctTxt(l.votos, l.validos), 'n'], ['Urnas', l => l.secoes, 'n']], b);
        const e = await get('api/ranking/local?limite=5000&' + qs());
        h += `<h2>Escolas (${e.length} com voto)</h2>` + tabela([
          ['#', l => e.indexOf(l) + 1, 'n'], ['Escola', l => esc(titulo(l.nome.split(' — ')[0]))], ['Sede / povoado', l => esc(bai(l.bairro))],
          ['Votos', l => fmt(l.votos), 'n'], ['% válidos', l => pctTxt(l.votos, l.validos), 'n'], ['Urnas', l => l.secoes, 'n']], e);
      }
      const u = (await get('api/secoes?' + qs())).sort((a, b) => (a.local || '').localeCompare(b.local || '') || a.secao - b.secao);
      // escola filtrada: o nome já está no cabeçalho, as colunas Escola/Bairro seriam repetição
      const cols = [['Seção', l => l.secao, 'n'], ['Válidos', l => fmt(l.validos), 'n'], ['Votos', l => `<b>${fmt(l.votos)}</b>`, 'n'],
        ['%', l => pctTxt(l.votos, l.validos), 'n']];
      if (!filtros.local) cols.unshift(['Escola', l => esc(titulo(l.local))], ...(filtros.bairro ? [] : [['Sede / povoado', l => esc(bai(l.bairro))]]));
      h += `<h2>Urna por urna (${u.length})</h2>` + tabela(cols, u);
    }
    return h;
  }

  async function relComp() {
    const [r, res] = await Promise.all([get('api/comp/resumo?' + qs()), get('api/resumo')]);
    const m = res.meta, b = r.base, bahia = !filtros.municipio;
    const v22 = bahia && r.posicao22 ? r.posicao22.votos : b.v22, v26 = bahia ? +m.oficial_votos : b.v26;
    let h = cabecalho(m, 'Comparação 2022 × 2026');
    h += `<div class="rel-num"><div><b>${fmt(v22)}</b>votos em 2022</div><div><b>${fmt(v26)}</b>votos em 2026</div>
      <div><b>${dif(v26 - v22)}</b>diferença</div></div>`;
    if (m.nr_2022 && m.nr_2022 !== m.numero) h += `<p class="rel-obs">Em 2022 concorreu com o nº ${esc(m.nr_2022)}.</p>`;
    if (bahia) {
      const c = (await get('api/comp/ranking/municipio?ordem=ganho&limite=5000&' + qs())).filter(x => x.v22 || x.v26)
        .sort((a, b) => a.nome.localeCompare(b.nome));
      h += `<h2>Por cidade (${c.length})</h2>` + tabela([
        ['Cidade', l => esc(titulo(l.nome))], ['2022', l => fmt(l.v22), 'n'], ['2026', l => fmt(l.v26), 'n'], ['Diferença', l => dif(l.delta), 'n']], c);
      h += `<p class="rel-obs">Para imprimir urna por urna, escolha uma cidade no filtro.</p>`;
    } else {
      if (!filtros.bairro && !filtros.local) {   // cidade: comparação por bairro/povoado
        const b = (await get('api/comp/ranking/bairro?ordem=ganho&limite=5000&' + qs())).filter(x => x.v22 || x.v26)
          .sort((x, y) => (y.v26 - x.v26) || (y.v22 - x.v22));
        h += `<h2>Sede e povoados (${b.length})</h2>` + tabela([
          ['Sede / povoado', l => esc(bai(l.bairro || l.nome.split(' — ')[0]))], ['2022', l => fmt(l.v22), 'n'], ['2026', l => fmt(l.v26), 'n'],
          ['Diferença', l => dif(l.delta), 'n']], b);
      }
      const u = (await get('api/comp/tabela?' + qs())).sort((a, b) => (a.local_2026 || '').localeCompare(b.local_2026 || '') || a.secao - b.secao);
      h += `<h2>Urna por urna (${u.length})</h2>` + tabela([
        ...(filtros.local ? [] : [['Escola', l => esc(titulo(l.local_2026 || l.local_2022))]]), ['Seção', l => l.secao, 'n'], ['Situação', l => esc(l.situacao)],
        ['2022', l => n(l.votos_22), 'n'], ['2026', l => n(l.votos_26), 'n'], ['Diferença', l => dif(l.variacao), 'n']], u);
    }
    return h;
  }

  async function imprimir() {
    const btn = $('btn-imprimir'); btn.disabled = true; const txt = btn.innerHTML; btn.textContent = 'Preparando…';
    try {
      const comp = !$('v-comp').hidden;
      const corpo = comp ? await relComp() : await rel2026();
      $('relatorio').innerHTML = corpo + `<footer class="rel-rod">Fonte: Tribunal Superior Eleitoral (TSE) — resultado oficial e boletins de urna de 2026${comp ? ' e votação por seção de 2022' : ''}.
        Gerado em ${new Date().toLocaleString('pt-BR')} · ${esc(location.href.split('#')[0])}</footer>`;
      document.title = `${$('t-nome').textContent} - ${[sel('f-municipio'), sel('f-local')].filter(Boolean).join(' - ') || 'Bahia'}`;
      setTimeout(() => window.print(), 300);
    } finally { btn.disabled = false; btn.innerHTML = txt; }
  }
  $('btn-imprimir').addEventListener('click', imprimir);
})();
