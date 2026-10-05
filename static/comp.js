// Comparativo 2022 x 2026 (usa funções de app.js)
const sinal = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const classe = n => n > 0 ? 'sobe' : n < 0 ? 'desce' : '';

let mapaComp, camadaComp, compCarregado = false;

// ---------- troca de aba ----------
function mostrar(v) {
  document.querySelectorAll('#visoes button').forEach(x => x.classList.toggle('ativa', x.dataset.v === v));
  document.querySelectorAll('main').forEach(m => m.hidden = m.id !== v);
  if (v === 'v-comp') {
    if (!mapaComp) { mapaComp = novoMapa('mapa-comp'); camadaComp = L.layerGroup().addTo(mapaComp); }
    if (!compCarregado) window.tudoComp();
    setTimeout(() => mapaComp.invalidateSize(), 50);
  } else setTimeout(() => mapa.invalidateSize(), 50);
  history.replaceState(null, '', v === 'v-comp' ? '#comparativo' : '#');
}
$('visoes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostrar(b.dataset.v); });

// ---------- números ----------
async function resumoComp() {
  const [r, res] = await Promise.all([get('/api/comp/resumo?' + qs()), get('/api/resumo')]);
  const b = r.base;
  let v22, v26, nota;
  if (!qs() && r.posicao22 && res.meta.oficial_votos) {
    // Bahia inteira: totais oficiais das duas eleições
    v22 = r.posicao22.votos; v26 = +res.meta.oficial_votos;
    nota = `Total de votos na Bahia. 2022: ${r.posicao22.posicao}º lugar. 2026: ${res.meta.oficial_posicao}º lugar` +
      (res.meta.oficial_secoes_pct && res.meta.oficial_secoes_pct !== '100,00' ? ` (com ${res.meta.oficial_secoes_pct}% das urnas apuradas).` : '.');
  } else {
    // com filtro: soma das urnas da área escolhida
    v22 = b.v22; v26 = b.v26;
    nota = `Votos nas urnas da área escolhida.`;
  }
  const d = (v26 || 0) - (v22 || 0);
  $('k-v22').textContent = fmt(v22);
  $('k-v26').textContent = fmt(v26);
  $('k-delta').innerHTML = `<span class="${classe(d)}">${sinal(d)}</span>`;
  $('comp-nota').textContent = nota;
}

// ---------- mapa ----------
async function mapaCompCarregar() {
  const ls = (await get('/api/comp/locais?' + qs())).filter(l => l.latitude && l.longitude && l.v26 !== l.v22);
  camadaComp.clearLayers();
  const max = Math.max(1, ...ls.map(l => Math.abs(l.v26 - l.v22)));
  ls.sort((a, b) => Math.abs(a.v26 - a.v22) - Math.abs(b.v26 - b.v22));
  const css = getComputedStyle(document.documentElement);
  const cG = css.getPropertyValue('--ganho').trim(), cP = css.getPropertyValue('--perda').trim();
  for (const l of ls) {
    const d = l.v26 - l.v22, t = Math.sqrt(Math.abs(d) / max);
    L.circleMarker([l.latitude, l.longitude], { radius: 4 + 16 * t, color: '#ffffff', weight: 1.5, fillColor: d > 0 ? cG : cP, fillOpacity: .85 })
      .bindTooltip(`<b>${esc(titulo(l.nm_local))}</b><br>${esc(titulo(l.nm_municipio))}<br>2022: ${fmt(l.v22)} · 2026: ${fmt(l.v26)}<br><b>${sinal(d)} votos</b>`)
      .on('click', () => localComp(l.cd_municipio, l.nr_zona, l.nr_local))
      .addTo(camadaComp);
  }
  enquadrar(mapaComp, ls.map(l => [l.latitude, l.longitude]));
}

async function localComp(mun, zona, local) {
  const s = (await get(`/api/comp/local/${mun}/${zona}/${local}`));
  if (!s.length) return;
  const i = s[0], amb = s.filter(x => x.situacao === 'ambas');
  const v22 = amb.reduce((a, x) => a + x.votos_22, 0), v26 = amb.reduce((a, x) => a + x.votos_26, 0);
  $('detalhe-comp').innerHTML = `
    <button class="fechar" aria-label="Fechar" onclick="fecharDetalhe('detalhe-comp-box')">×</button>
    <h3>${esc(titulo(i.nm_local || i.nm_local_22))}</h3>
    <p class="end">${esc(titulo(i.endereco))}${i.bairro ? ' · ' + esc(titulo(i.bairro)) : ''} · ${esc(titulo(i.nm_municipio))}</p>
    <div class="resumo"><div><b>${fmt(v22)}</b><small>2022</small></div><div><b>${fmt(v26)}</b><small>2026</small></div>
      <div><b class="${classe(v26 - v22)}">${sinal(v26 - v22)}</b><small>diferença</small></div></div>
    <table><thead><tr><th>Seção</th><th class="n">2022</th><th class="n">2026</th><th class="n">Diferença</th></tr></thead><tbody>
    ${amb.map(x => `<tr><td>${x.nr_secao}</td><td class="n">${fmt(x.votos_22)}</td><td class="n">${fmt(x.votos_26)}</td>
      <td class="n"><span class="${classe(x.votos_26 - x.votos_22)}">${sinal(x.votos_26 - x.votos_22)}</span></td></tr>`).join('')}
    </tbody></table>`;
  $('detalhe-comp-box').hidden = false;
  $('detalhe-comp-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- ranking ----------
let nivelC = 'municipio', ordemC = 'ganho';
async function rankingComp() {
  $('comp-titulo').textContent = ordemC === 'ganho' ? 'Onde mais cresceu' : 'Onde mais caiu';
  const d = (await get(`/api/comp/ranking/${nivelC}?ordem=${ordemC}&limite=2000&` + qs()))
    .filter(x => ordemC === 'ganho' ? x.delta > 0 : x.delta < 0);
  barras($('comp-ranking'), d, {
    valor: x => x.delta,
    rotulo: x => `<span class="${classe(x.delta)}">${sinal(x.delta)}</span>`,
    info: x => `${fmt(x.v22)} → ${fmt(x.v26)} votos`,
    cor: x => x.delta < 0 ? 'perda' : '',
    clique: x => x.nr_local && (() => localComp(x.cd_municipio, x.nr_zona, x.nr_local)),
  });
}
for (const [id, campo] of [['comp-nivel', 'n'], ['comp-ordem', 'o']]) {
  $(id).addEventListener('click', e => {
    const v = e.target.dataset[campo]; if (!v) return;
    document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('ativa', b === e.target));
    if (campo === 'n') nivelC = v; else ordemC = v;
    $('comp-ranking').dataset.aberto = ''; rankingComp();
  });
}

// ---------- tabela ----------
const tabelaComp = tabela({
  url: () => '/api/comp/tabela?', tbody: 'tbody-comp', busca: 'busca-comp', pag: 'pag-comp', ant: 'ant-comp', prox: 'prox-comp',
  campos: l => [l.municipio, l.local_2026, l.local_2022, l.bairro, l.secao],
  linha: l => {
    const ok = l.votos_22 != null && l.votos_26 != null;
    return `<tr><td>${esc(titulo(l.municipio))}</td><td>${esc(titulo(l.local_2026 || l.local_2022))}</td><td class="n">${l.secao}</td>
      <td class="n">${l.votos_22 != null ? fmt(l.votos_22) : '–'}</td><td class="n">${l.votos_26 != null ? fmt(l.votos_26) : '–'}</td>
      <td class="n">${ok ? `<span class="${classe(l.variacao)}">${sinal(l.variacao)}</span>` : '–'}</td></tr>`;
  },
});

window.tudoComp = () => {
  $('detalhe-comp-box').hidden = true;
  $('exp-comp-csv').href = '/api/comp/exportar.csv?' + qs();
  $('exp-comp-xlsx').href = '/api/comp/exportar.xlsx?' + qs();
  if ($('v-comp').hidden) { compCarregado = false; return; }
  compCarregado = true;
  resumoComp(); mapaCompCarregar(); rankingComp(); tabelaComp();
};

// link direto: http://localhost:8000/#comparativo
if (location.hash === '#comparativo') mostrar('v-comp');
