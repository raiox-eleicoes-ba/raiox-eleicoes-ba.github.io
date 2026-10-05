const fmt = n => Math.round(n ?? 0).toLocaleString('pt-BR');
const pctN = (a, b) => b ? 100 * a / b : null;
const pct = (a, b) => b ? pctN(a, b).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '–';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = url => window.API ? API.get(url) : fetch(url).then(r => r.json());
const titulo = s => String(s ?? '').toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());

const filtros = { municipio: '', bairro: '', local: '' };
const qs = () => new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
const CENTRO_BA = [-12.9, -41.7];

// ---------- mapa base (compartilhado com comp.js) ----------
function novoMapa(id) {
  const m = L.map(id, { preferCanvas: true, scrollWheelZoom: false }).setView(CENTRO_BA, 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 18
  }).addTo(m);
  return m;
}
function enquadrar(m, pts) {
  if (pts.length && filtros.municipio) m.fitBounds(pts, { padding: [24, 24], maxZoom: 16 });
  else if (!filtros.municipio) m.setView(CENTRO_BA, 6);
}
// rampa sequencial azul (claro -> escuro)
const RAMPA = ['#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab', '#104281', '#0d366b'];
const corRampa = t => RAMPA[Math.min(RAMPA.length - 1, Math.floor(t * RAMPA.length))];

const mapa = novoMapa('mapa');
const camada = L.layerGroup().addTo(mapa);

async function carregarMapa() {
  const locais = (await get('/api/locais?' + qs())).filter(l => l.latitude && l.longitude && l.votos > 0);
  camada.clearLayers();
  const max = Math.max(1, ...locais.map(l => l.votos));
  locais.sort((a, b) => a.votos - b.votos);
  for (const l of locais) {
    const t = Math.sqrt(l.votos / max), c = corRampa(t);
    L.circleMarker([l.latitude, l.longitude], { radius: 4 + 16 * t, color: '#ffffff', weight: 1.5, fillColor: c, fillOpacity: .9 })
      .bindTooltip(`<b>${esc(titulo(l.nm_local))}</b><br>${esc(titulo(l.nm_municipio))}<br><b>${fmt(l.votos)}</b> votos`)
      .on('click', () => abrirLocal(l.cd_municipio, l.nr_zona, l.nr_local))
      .addTo(camada);
  }
  enquadrar(mapa, locais.map(l => [l.latitude, l.longitude]));
}

function fecharDetalhe(box) { $(box).hidden = true; }
async function abrirLocal(mun, zona, local) {
  const d = await get(`/api/local/${mun}/${zona}/${local}`);
  const tv = d.secoes.reduce((s, x) => s + x.votos_candidato, 0);
  const tvv = d.secoes.reduce((s, x) => s + x.validos, 0);
  $('detalhe').innerHTML = `
    <button class="fechar" aria-label="Fechar" onclick="fecharDetalhe('detalhe-box')">×</button>
    <h3>${esc(titulo(d.info.nm_local))}</h3>
    <p class="end">${esc(titulo(d.info.endereco))}${d.info.bairro ? ' · ' + esc(titulo(d.info.bairro)) : ''} · ${esc(titulo(d.info.nm_municipio))}</p>
    <div class="resumo"><div><b>${fmt(tv)}</b><small>votos</small></div><div><b>${pct(tv, tvv)}</b><small>dos válidos</small></div></div>
    <table><thead><tr><th>Seção</th><th class="n">Votos</th><th class="n">%</th></tr></thead>
    <tbody>${d.secoes.map(s => `<tr><td>${s.nr_secao}</td><td class="n"><b>${fmt(s.votos_candidato)}</b></td>
      <td class="n">${pct(s.votos_candidato, s.validos)}</td></tr>`).join('')}</tbody></table>`;
  $('detalhe-box').hidden = false;
  $('detalhe-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- números ----------
async function carregarResumo() {
  const r = await get('/api/resumo?' + qs());
  const m = r.meta, f = r.filtro;
  $('status').textContent = m.oficial_secoes_pct === '100,00'
    ? 'Resultado final do TSE · 100% das urnas apuradas'
    : `Apuração do TSE: ${m.oficial_secoes_pct}% das urnas · atualizado em ${m.atualizado_em}`;
  // Sem filtro, mostra o total oficial do TSE (inclui urnas cujo boletim ainda não foi publicado)
  if (!qs() && m.oficial_votos) {
    $('c-votos').textContent = fmt(+m.oficial_votos);
    $('c-pct').textContent = m.oficial_pct + '%';
    $('c-pos').textContent = m.oficial_posicao + 'º';
  } else {
    $('c-votos').textContent = fmt(f.votos);
    $('c-pct').textContent = pct(f.votos, f.validos);
  }
  $('c-pos-box').hidden = !!qs();
}

// ---------- ranking em barras ----------
// Lista em barras: mostra os 10 primeiros; "Ver todos" abre a lista completa numa caixa com rolagem e busca.
function barras(el, dados, { valor, rotulo, info, cor, clique }) {
  const TOP = 10;
  const max = Math.max(1, ...dados.map(d => Math.abs(valor(d))));
  const linha = (d, i) => `
    <div class="barra-linha${clique && clique(d) ? ' clicavel' : ''}" data-i="${i}">
      <span class="pos">${i + 1}º</span>
      <span class="nome">${esc(titulo(d.nome))}</span><span class="val">${rotulo(d)}</span>
      <div class="sub"><div class="trilho"><div class="preench ${cor ? cor(d) : ''}" style="width:${100 * Math.abs(valor(d)) / max}%"></div></div>
      <span class="info">${info(d)}</span></div>
    </div>`;
  if (!dados.length) { el.innerHTML = '<p class="vazio">Nenhum resultado para este filtro.</p>'; el.onclick = null; return; }

  const aberto = el.dataset.aberto === '1' && dados.length > TOP;
  el.innerHTML = aberto ? `
      <input type="search" class="busca-lista" placeholder="Procurar na lista de ${fmt(dados.length)}">
      <div class="lista-rolagem">${dados.map(linha).join('')}</div>
      <button class="mais">Mostrar só os ${TOP} primeiros ▲</button>`
    : dados.slice(0, TOP).map(linha).join('') +
      (dados.length > TOP ? `<button class="mais">Ver todos (${fmt(dados.length)}) ▼</button>` : '');

  const busca = el.querySelector('.busca-lista');
  if (busca) busca.oninput = () => {
    const t = busca.value.trim().toLowerCase();
    el.querySelectorAll('.lista-rolagem .barra-linha').forEach(li =>
      li.hidden = t && !li.querySelector('.nome').textContent.toLowerCase().includes(t));
  };
  el.onclick = e => {
    if (e.target.classList.contains('mais')) {
      el.dataset.aberto = aberto ? '' : '1';
      barras(el, dados, { valor, rotulo, info, cor, clique });
      if (aberto) el.closest('.bloco').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const li = e.target.closest('.barra-linha.clicavel');
    if (li) clique(dados[+li.dataset.i])();
  };
}

let nivel = 'municipio';
async function carregarRanking() {
  const dados = await get(`/api/ranking/${nivel}?limite=2000&` + qs());
  barras($('ranking'), dados, {
    valor: d => d.votos,
    rotulo: d => fmt(d.votos),
    info: d => `${pct(d.votos, d.validos)} dos válidos`,
    clique: d => d.nr_local && (() => abrirLocal(d.cd_municipio, d.nr_zona, d.nr_local)),
  });
}
$('abas').addEventListener('click', e => {
  if (!e.target.dataset.n) return;
  document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('ativa', b === e.target));
  nivel = e.target.dataset.n; $('ranking').dataset.aberto = ''; carregarRanking();
});

// ---------- tabela paginada (reaproveitada no comparativo) ----------
function tabela({ url, tbody, busca, pag, ant, prox, campos, linha }) {
  let linhas = [], filtradas = [], p = 0;
  const POR = 25;
  const desenhar = () => {
    const tot = Math.max(1, Math.ceil(filtradas.length / POR));
    $(tbody).innerHTML = filtradas.slice(p * POR, (p + 1) * POR).map(linha).join('')
      || '<tr><td colspan="6" class="vazio">Nada encontrado.</td></tr>';
    $(pag).textContent = `Página ${p + 1} de ${tot}`;
  };
  const filtrar = () => {
    const t = $(busca).value.trim().toLowerCase();
    filtradas = !t ? linhas : linhas.filter(l => campos(l).join(' ').toLowerCase().includes(t));
    p = 0; desenhar();
  };
  $(busca).addEventListener('input', filtrar);
  $(ant).onclick = () => { if (p > 0) { p--; desenhar(); } };
  $(prox).onclick = () => { if ((p + 1) * POR < filtradas.length) { p++; desenhar(); } };
  return async () => { linhas = await get(url() + qs()); filtrar(); };
}
const carregarTabela = tabela({
  url: () => '/api/secoes?', tbody: 'tbody', busca: 'busca', pag: 'pag', ant: 'ant', prox: 'prox',
  campos: l => [l.municipio, l.local, l.bairro, l.secao],
  linha: l => `<tr><td>${esc(titulo(l.municipio))}</td><td>${esc(titulo(l.local))}</td><td class="n">${l.secao}</td>
    <td class="n"><b>${fmt(l.votos)}</b></td><td class="n">${pct(l.votos, l.validos)}</td></tr>`,
});

// ---------- filtros ----------
function preencher(sel, itens, rotulo, val = x => x, txt = x => x) {
  sel.innerHTML = `<option value="">${rotulo}</option>` + (itens || []).map(i => `<option value="${esc(val(i))}">${esc(titulo(txt(i)))}</option>`).join('');
  sel.disabled = !itens || !itens.length;
}
async function atualizarOpcoes() {
  const o = await get('/api/opcoes?' + qs());
  if ($('f-municipio').options.length <= 1)
    preencher($('f-municipio'), o.municipios, 'Toda a Bahia', x => x.id, x => x.nome);
  preencher($('f-bairro'), o.bairros, 'Todos');
  preencher($('f-local'), o.locais, 'Todas', x => x.id, x => x.nome);
  $('f-bairro').value = filtros.bairro; $('f-local').value = filtros.local;
  $('limpar').hidden = !qs();
}
const ordem = ['municipio', 'bairro', 'local'];
ordem.forEach((k, i) => $('f-' + k).addEventListener('change', async e => {
  filtros[k] = e.target.value;
  ordem.slice(i + 1).forEach(x => filtros[x] = '');
  await atualizarOpcoes(); tudo();
}));
$('limpar').onclick = async () => {
  ordem.forEach(k => filtros[k] = ''); $('f-municipio').value = '';
  await atualizarOpcoes(); tudo();
};
const exportar = () => {
  $('exp-csv').href = '/api/exportar.csv?' + qs();
  $('exp-xlsx').href = '/api/exportar.xlsx?' + qs();
};

function tudo() {
  $('detalhe-box').hidden = true;
  carregarResumo(); carregarMapa(); carregarRanking(); carregarTabela(); exportar();
  window.tudoComp?.();
}
atualizarOpcoes().then(tudo);
