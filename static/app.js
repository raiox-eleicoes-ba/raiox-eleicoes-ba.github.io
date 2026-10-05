const fmt = n => Math.round(n ?? 0).toLocaleString('pt-BR');
const pctN = (a, b) => b ? 100 * a / b : null;
const pct = (a, b) => b ? pctN(a, b).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '–';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = url => window.API ? API.get(url) : fetch(url).then(r => r.json());
const titulo = s => String(s ?? '').toLowerCase().replace(/(^|[\s\-/('])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Das|Dos|E)(?=\s)|\bD(?=')/g, w => w.toLowerCase())   // "Rio de Contas", "Dias d'Ávila"
  .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, w => w.toUpperCase());      // "Dom Pedro II"

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
  const locais = (await get('api/locais?' + qs())).filter(l => l.latitude && l.longitude && l.votos > 0);
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
  const d = await get(`api/local/${mun}/${zona}/${local}`);
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
  const r = await get('api/resumo?' + qs());
  const m = r.meta, f = r.filtro;
  $('t-nome').textContent = m.candidato; $('t-num').textContent = m.numero; $('t-cargo').textContent = m.cargo;
  if (m.slug && $('t-foto').hidden) { $('t-foto').src = `../fotos/${m.slug}.jpeg`; $('t-foto').onload = () => $('t-foto').hidden = false; }
  if (m.situacao_texto) {
    const tipo = m.situacao_tipo.replace('_calc', '');
    const ic = { eleito: '✔', suplente: '↻', nao_eleito: '✕', aguardando: '⏳' }[tipo] || '';
    if (m.situacao_tipo.endsWith('_calc')) $('t-sit').title = 'Pela distribuição de vagas do TSE · confirmação oficial pendente';
    $('t-sit').className = 't-sit ' + tipo; $('t-sit').textContent = `${ic} ${m.situacao_texto}`; $('t-sit').hidden = false;
  }
  document.title = `${m.candidato} · votos por urna`;
  if (m.genero === 'F') { $('t-onde').textContent = 'Onde ela foi votada'; $('t-mais').textContent = 'Onde ela teve mais votos'; }
  // sem candidatura em 2022: esconde a aba do comparativo
  const semComp = !m.nr_2022;
  document.querySelector('#visoes [data-v="v-comp"]').hidden = semComp;
  if (semComp && !$('v-comp').hidden) mostrar('v-2026');
  $('status').textContent = m.oficial_secoes_pct === '100,00'
    ? (m.situacao_tipo === 'aguardando' || m.situacao_tipo.endsWith('_calc') ? '100% das urnas apuradas · totalização final do TSE pendente' : 'Resultado final do TSE · 100% das urnas apuradas')
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
  resultadoFiltro(f);
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
  const dados = await get(`api/ranking/${nivel}?limite=2000&` + qs());
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
  url: () => 'api/secoes?', tbody: 'tbody', busca: 'busca', pag: 'pag', ant: 'ant', prox: 'prox',
  campos: l => [l.municipio, l.local, l.bairro, l.secao],
  linha: l => `<tr><td>${esc(titulo(l.municipio))}</td><td>${esc(titulo(l.local))}</td><td class="n">${l.secao}</td>
    <td class="n"><b>${fmt(l.votos)}</b></td><td class="n">${pct(l.votos, l.validos)}</td></tr>`,
});

// ---------- seletor de local (cidade › bairro › escola) ----------
// Uma linha "Mostrando: X" + caminho clicável. Ao tocar, abre um painel com busca e listas com os votos do candidato,
// para descer da Bahia → cidade → bairro → escola. Escola = "zona-local" (o número do local se repete entre zonas).
const nomes = { municipio: '', bairro: '', local: '' };
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function desenharEscopo() {
  $('esc-atual').textContent = titulo(nomes.local || nomes.bairro || nomes.municipio) || 'Toda a Bahia';
  const tr = $('esc-trilha');
  if (!filtros.municipio) { tr.hidden = true; tr.innerHTML = ''; return; }
  const niveis = [['bahia', 'Bahia'], ['municipio', nomes.municipio], ['bairro', nomes.bairro], ['local', nomes.local]].filter(([k, n]) => k === 'bahia' || (filtros[k] && n));
  tr.innerHTML = niveis.map(([k, n], i) => (i ? '<span class="sep">›</span>' : '') +
    (i < niveis.length - 1 ? `<button type="button" data-n="${k}">${esc(titulo(n))}</button>` : `<b>${esc(titulo(n))}</b>`)).join('') +
    `<span class="res" id="f-res"></span>`;
  tr.hidden = false;
}
// "15 urnas · 2.487 votos (68,4% dos válidos)", preenchido pelo resumo
function resultadoFiltro(f) {
  const r = $('f-res'); if (!r) return;
  r.innerHTML = qs() ? `<b>${fmt(f.secoes)}</b> ${f.secoes === 1 ? 'urna' : 'urnas'} · <b>${fmt(f.votos)}</b> ${f.votos === 1 ? 'voto' : 'votos'} (${pct(f.votos, f.validos)} dos válidos)` : '';
}
function aplicar(novos, novosNomes) {
  Object.assign(filtros, { municipio: '', bairro: '', local: '' }, novos);
  Object.assign(nomes, { municipio: '', bairro: '', local: '' }, novosNomes);
  fecharFolha(); desenharEscopo(); tudo();
}
$('esc-trilha').addEventListener('click', e => {
  const k = e.target.dataset.n; if (!k) return;
  const ate = { bahia: 0, municipio: 1, bairro: 2 }[k], ordem = ['municipio', 'bairro', 'local'];
  const f = {}, n = {}; ordem.slice(0, ate).forEach(x => { f[x] = filtros[x]; n[x] = nomes[x]; });
  aplicar(f, n);
});

// ---------- dados das listas ----------
let indice = null;
async function carregarIndice() {
  if (indice) return indice;
  const linhas = await get('api/indice');
  const cid = new Map(), bai = new Map();
  for (const [cd, cidade, bairro] of linhas) { cid.set(cd, cidade); if (bairro) bai.set(cd + '|' + bairro, [cd, cidade, bairro]); }
  indice = {
    cidades: [...cid].map(([cd, n]) => ({ tipo: 'cidade', cd, nome: n, chave: semAcento(n) })),
    bairros: [...bai.values()].map(([cd, c, b]) => ({ tipo: 'bairro', cd, cidade: c, nome: b, chave: semAcento(b) })),
    escolas: linhas.map(([cd, c, b, id, e]) => ({ tipo: 'escola', cd, cidade: c, bairro: b, id, nome: e, chave: semAcento(e) })),
  };
  return indice;
}
const cacheVotos = {};
async function votos(nivel, extra = '') {     // {chave: {votos, validos}} do candidato
  const url = `api/ranking/${nivel}?limite=100000${extra}`;
  if (cacheVotos[url]) return cacheVotos[url];
  const m = {};
  for (const r of await get(url)) {
    const k = nivel === 'municipio' ? r.nome : nivel === 'bairro' ? r.bairro : `${+r.nr_zona}-${+r.nr_local}`;
    m[k] = r;
  }
  return (cacheVotos[url] = m);
}

// ---------- painel ----------
const fl = { nivel: 'bahia', cd: '', cidade: '', bairro: '', aba: 'bairros' };
function abrirFolha() {
  Object.assign(fl, filtros.bairro ? { nivel: 'bairro', cd: filtros.municipio, cidade: nomes.municipio, bairro: filtros.bairro }
    : filtros.municipio ? { nivel: 'cidade', cd: filtros.municipio, cidade: nomes.municipio, bairro: '' } : { nivel: 'bahia', cd: '', cidade: '', bairro: '' });
  $('f-busca').value = '';
  $('folha').hidden = false; document.body.style.overflow = 'hidden';
  renderFolha();
  if (innerWidth > 700) setTimeout(() => $('f-busca').focus(), 50);
}
function fecharFolha() { $('folha').hidden = true; document.body.style.overflow = ''; }
$('esc-abrir').addEventListener('click', abrirFolha);
$('folha-fechar').addEventListener('click', fecharFolha);
$('folha').addEventListener('click', e => { if (e.target.id === 'folha') fecharFolha(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('folha').hidden) fecharFolha(); });
$('folha-voltar').addEventListener('click', () => {
  if ($('f-busca').value) { $('f-busca').value = ''; return renderFolha(); }
  if (fl.nivel === 'bairro') Object.assign(fl, { nivel: 'cidade', bairro: '' }); else Object.assign(fl, { nivel: 'bahia', cd: '', cidade: '' });
  renderFolha();
});
$('folha-abas').addEventListener('click', e => {
  const a = e.target.dataset.a; if (!a) return;
  fl.aba = a; renderFolha();
});

const item = (acao, nome, sub, v, extraCls = '') => `<button type="button" class="fl-item ${extraCls}" data-acao='${esc(JSON.stringify(acao)).replace(/'/g, '&#39;')}'>
  <span class="tx"><span class="nm">${nome}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</span>
  <span class="v">${v ? `${fmt(v.votos)}<small>${pct(v.votos, v.validos)}</small>` : '<small>0 votos</small>'}</span></button>`;
const porVotos = (lista, chave, mapa) => lista.map(x => [x, mapa[chave(x)]]).sort((a, b) => ((b[1]?.votos || 0) - (a[1]?.votos || 0)) || a[0].nome.localeCompare(b[0].nome));

async function renderFolha() {
  const L = $('folha-lista'); L.innerHTML = '<p class="vazio">Carregando…</p>';
  await carregarIndice();
  const busca = $('f-busca').value.trim();
  $('folha-voltar').hidden = fl.nivel === 'bahia' && !busca;
  $('folha-abas').hidden = busca || fl.nivel !== 'cidade';
  document.querySelectorAll('#folha-abas button').forEach(b => b.classList.toggle('ativa', b.dataset.a === fl.aba));
  if (busca) return renderBusca(busca);
  if (fl.nivel === 'bahia') {
    $('folha-tit').textContent = 'Escolha a cidade';
    const vm = await votos('municipio');
    L.innerHTML = item({ t: 'bahia' }, 'Toda a Bahia', '', null, 'todo').replace('<small>0 votos</small>', '') +
      '<h4>Cidades · da que mais votou para a que menos</h4>' +
      porVotos(indice.cidades, c => c.nome, vm).map(([c, v]) => item({ t: 'cidade', cd: c.cd, n: c.nome }, esc(titulo(c.nome)), '', v)).join('');
  } else if (fl.nivel === 'cidade') {
    $('folha-tit').textContent = titulo(fl.cidade);
    const vc = (await votos('municipio'))[fl.cidade];
    let h = item({ t: 'cidade-toda', cd: fl.cd, n: fl.cidade }, `Ver toda a cidade de ${esc(titulo(fl.cidade))}`, '', vc, 'todo');
    if (fl.aba === 'bairros') {
      const vb = await votos('bairro', `&municipio=${fl.cd}`);
      const bs = indice.bairros.filter(b => b.cd == fl.cd);
      h += `<h4>${bs.length} bairros · toque para ver as escolas</h4>` +
        porVotos(bs, b => b.nome, vb).map(([b, v]) => item({ t: 'bairro', b: b.nome }, esc(titulo(b.nome)), '', v)).join('');
    } else {
      const ve = await votos('local', `&municipio=${fl.cd}`);
      const es = indice.escolas.filter(e => e.cd == fl.cd);
      h += `<h4>${es.length} escolas</h4>` +
        porVotos(es, e => e.id, ve).map(([e, v]) => item({ t: 'escola', cd: e.cd, n: e.cidade, b: e.bairro, id: e.id, e: e.nome },
          esc(titulo(e.nome)), esc(titulo(e.bairro)), v)).join('');
    }
    L.innerHTML = h;
  } else {
    $('folha-tit').textContent = titulo(fl.bairro);
    const vb = (await votos('bairro', `&municipio=${fl.cd}`))[fl.bairro];
    const ve = await votos('local', `&municipio=${fl.cd}&bairro=${encodeURIComponent(fl.bairro)}`);
    const es = indice.escolas.filter(e => e.cd == fl.cd && e.bairro === fl.bairro);
    L.innerHTML = item({ t: 'bairro-todo', b: fl.bairro }, `Ver todo o bairro ${esc(titulo(fl.bairro))}`, esc(titulo(fl.cidade)), vb, 'todo') +
      `<h4>${es.length} ${es.length === 1 ? 'escola' : 'escolas'}</h4>` +
      porVotos(es, e => e.id, ve).map(([e, v]) => item({ t: 'escola', cd: e.cd, n: e.cidade, b: e.bairro, id: e.id, e: e.nome }, esc(titulo(e.nome)), '', v)).join('');
  }
  L.scrollTop = 0;
}

function marcar(txt, termo) {
  const t = titulo(txt), i = semAcento(t).indexOf(termo);
  return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + termo.length)) + '</mark>' + esc(t.slice(i + termo.length));
}
function renderBusca(termo) {
  const t = semAcento(termo), palavras = t.split(/\s+/);
  $('folha-tit').textContent = 'Resultados da busca';
  const casa = x => palavras.every(p => x.chave.includes(p) || semAcento(x.cidade).includes(p) || semAcento(x.bairro).includes(p));
  const nota = x => (x.chave.startsWith(t) ? 0 : x.chave.includes(t) ? 1 : 2);
  const top = (lista, n) => lista.filter(casa).sort((a, b) => nota(a) - nota(b) || a.nome.localeCompare(b.nome)).slice(0, n);
  const grupos = [['Cidades', top(indice.cidades, 6)], ['Bairros', top(indice.bairros, 8)], ['Escolas', top(indice.escolas, 12)]]
    .filter(g => g[1].length).sort((a, b) => Math.min(...a[1].map(nota)) - Math.min(...b[1].map(nota)));
  $('folha-lista').innerHTML = grupos.length ? grupos.map(([rot, l]) => `<h4>${rot}</h4>` + l.map(x =>
      x.tipo === 'cidade' ? item({ t: 'cidade', cd: x.cd, n: x.nome }, marcar(x.nome, t), 'Cidade', null).replace('<small>0 votos</small>', '›')
    : x.tipo === 'bairro' ? item({ t: 'bairro-de', cd: x.cd, n: x.cidade, b: x.nome }, marcar(x.nome, t), esc(titulo(x.cidade)), null).replace('<small>0 votos</small>', '›')
    : item({ t: 'escola', cd: x.cd, n: x.cidade, b: x.bairro, id: x.id, e: x.nome }, marcar(x.nome, t),
        esc([titulo(x.bairro), titulo(x.cidade)].filter(Boolean).join(' · ')), null).replace('<small>0 votos</small>', '›')).join('')).join('')
    : '<p class="vazio">Nada encontrado. Confira a grafia ou procure pelo nome da cidade.</p>';
}
$('f-busca').addEventListener('input', () => { $('folha-voltar').hidden = !$('f-busca').value && fl.nivel === 'bahia'; renderFolha(); });
$('f-busca').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('folha-lista').querySelector('.fl-item:not(.todo)')?.click(); }
});

$('folha-lista').addEventListener('click', e => {
  const b = e.target.closest('.fl-item'); if (!b) return;
  const a = JSON.parse(b.dataset.acao);
  if (a.t === 'bahia') return aplicar({}, {});
  if (a.t === 'cidade') { Object.assign(fl, { nivel: 'cidade', cd: String(a.cd), cidade: a.n, bairro: '', aba: 'bairros' }); $('f-busca').value = ''; return renderFolha(); }
  if (a.t === 'cidade-toda') return aplicar({ municipio: String(a.cd) }, { municipio: a.n });
  if (a.t === 'bairro') { Object.assign(fl, { nivel: 'bairro', bairro: a.b }); return renderFolha(); }
  if (a.t === 'bairro-de') { Object.assign(fl, { nivel: 'bairro', cd: String(a.cd), cidade: a.n, bairro: a.b }); $('f-busca').value = ''; return renderFolha(); }
  if (a.t === 'bairro-todo') return aplicar({ municipio: String(fl.cd), bairro: a.b }, { municipio: fl.cidade, bairro: a.b });
  if (a.t === 'escola') return aplicar({ municipio: String(a.cd), bairro: a.b || '', local: a.id }, { municipio: a.n, bairro: a.b || '', local: a.e });
});

const exportar = () => {
  $('exp-csv').href = 'api/exportar.csv?' + qs();
  $('exp-xlsx').href = 'api/exportar.xlsx?' + qs();
};

function tudo() {
  $('detalhe-box').hidden = true;
  carregarResumo(); carregarMapa(); carregarRanking(); carregarTabela(); exportar();
  window.tudoComp?.();
}
desenharEscopo(); tudo();
if (location.hash === "#escolher") abrirFolha();   // link direto: painel.html#escolher abre o seletor
