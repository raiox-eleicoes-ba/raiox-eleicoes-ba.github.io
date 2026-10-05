// Substitui o servidor (web/app.py) quando o painel roda como site estático (GitHub Pages).
// Responde às mesmas rotas /api/... com os mesmos formatos, a partir de dados/painel.json.
(function () {
  const NR = { m: 0, z: 1, s: 2, l: 3, li: 4, ap: 5, cp: 6, vv: 7, br: 8, nu: 9, v: 10, ag: 11, v22: 12, vv22: 13, n22: 14 };
  let D, R;
  const pronto = fetch('dados/painel.json').then(r => r.json()).then(d => {
    D = d;
    R = d.rows.map(r => {
      const L = d.locais[r[NR.li]];
      return {
        cd_municipio: r[NR.m], nr_zona: r[NR.z], nr_secao: r[NR.s], nr_local: r[NR.l],
        nm_municipio: L[0], nm_local: L[1], endereco: L[2], bairro: L[3], cep: L[4], latitude: L[5], longitude: L[6],
        aptos: r[NR.ap], comparecimento: r[NR.cp], validos: r[NR.vv], brancos: r[NR.br], nulos: r[NR.nu],
        votos: r[NR.v], secoes_agregadas: r[NR.ag], v22: r[NR.v22], vv22: r[NR.vv22],
        nm_local_22: r[NR.n22] ?? (r[NR.v22] != null ? L[1] : null), ambas: r[NR.v22] != null,
      };
    });
  });

  const soma = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
  const agrupar = (a, chave) => { const g = new Map(); for (const x of a) { const k = chave(x); (g.get(k) || g.set(k, []).get(k)).push(x); } return [...g.values()]; };
  const r2 = x => x == null ? null : Math.round(x * 100) / 100;
  function filtrar(p, soAmbas) {
    const m = p.get('municipio'), b = p.get('bairro'), l = p.get('local'), z = p.get('zona');
    return R.filter(r => (!m || r.cd_municipio == m) && (!z || r.nr_zona == z) && (!b || r.bairro === b) &&
      (!l || r.nr_local == l) && (!soAmbas || r.ambas));
  }

  const NOMES = {
    municipio: g => g[0].nm_municipio,
    bairro: g => (g[0].bairro ?? '(sem bairro)') + ' — ' + g[0].nm_municipio,
    local: g => g[0].nm_local + ' — ' + g[0].nm_municipio,
    secao: g => 'Zona ' + g[0].nr_zona + ' / Seção ' + g[0].nr_secao + ' — ' + (g[0].nm_local ?? '?'),
  };
  const CHAVES = {
    municipio: r => r.cd_municipio, bairro: r => r.cd_municipio + '|' + r.bairro,
    local: r => r.cd_municipio + '|' + r.nr_zona + '|' + r.nr_local, secao: r => r.cd_municipio + '|' + r.nr_zona + '|' + r.nr_secao,
  };
  const ids = (n, g) => n === 'local' ? { cd_municipio: g[0].cd_municipio, nr_zona: g[0].nr_zona, nr_local: g[0].nr_local } : {};

  function tabela(rs) {
    return rs.map(r => ({
      municipio: r.nm_municipio, zona: r.nr_zona, secao: r.nr_secao, secoes_agregadas: r.secoes_agregadas, local: r.nm_local,
      endereco: r.endereco, bairro: r.bairro, aptos: r.aptos, comparecimento: r.comparecimento, validos: r.validos,
      votos: r.votos, pct_validos: r.validos ? r2(100 * r.votos / r.validos) : null, latitude: r.latitude, longitude: r.longitude,
    })).sort((a, b) => b.votos - a.votos || a.municipio.localeCompare(b.municipio) || a.zona - b.zona || a.secao - b.secao);
  }
  function tabelaComp(rs) {
    return rs.map(r => ({
      municipio: r.nm_municipio, zona: r.nr_zona, secao: r.nr_secao, local_2026: r.nm_local, local_2022: r.nm_local_22,
      bairro: r.bairro, situacao: 'ambas', votos_22: r.v22, validos_22: r.vv22, votos_26: r.votos, validos_26: r.validos,
      variacao: r.votos - r.v22, pct_2022: r.vv22 ? r2(100 * r.v22 / r.vv22) : null, pct_2026: r.validos ? r2(100 * r.votos / r.validos) : null,
    })).sort((a, b) => a.variacao - b.variacao);
  }

  const ROTAS = [
    [/^\/api\/resumo$/, p => {
      const f = filtrar(p);
      return {
        meta: D.meta, posicao: D.posicao, candidatos: D.candidatos, validos_estado: soma(R, r => r.validos),
        filtro: { secoes: f.length, votos: soma(f, r => r.votos), validos: soma(f, r => r.validos), secoes_com_voto: f.filter(r => r.votos > 0).length },
      };
    }],
    [/^\/api\/opcoes$/, p => {
      const mun = p.get('municipio'), zona = p.get('zona'), bairro = p.get('bairro');
      const ms = new Map(); for (const r of R) ms.set(r.cd_municipio, r.nm_municipio);
      const o = { municipios: [...ms].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)) };
      if (mun) {
        let a = R.filter(r => r.cd_municipio == mun);
        o.zonas = [...new Set(a.map(r => r.nr_zona))].sort((x, y) => x - y);
        if (zona) a = a.filter(r => r.nr_zona == zona);
        o.bairros = [...new Set(a.map(r => r.bairro).filter(Boolean))].sort();
        if (bairro) a = a.filter(r => r.bairro === bairro);
        const ls = new Map(); for (const r of a) if (r.nm_local) ls.set(r.nr_local + '|' + r.nm_local, { id: r.nr_local, nome: r.nm_local });
        o.locais = [...ls.values()].sort((x, y) => x.nome.localeCompare(y.nome));
      }
      return o;
    }],
    [/^\/api\/locais$/, p => agrupar(filtrar(p), CHAVES.local).map(g => ({
      cd_municipio: g[0].cd_municipio, nm_municipio: g[0].nm_municipio, nr_zona: g[0].nr_zona, nr_local: g[0].nr_local,
      nm_local: g[0].nm_local, bairro: g[0].bairro, latitude: g[0].latitude, longitude: g[0].longitude,
      secoes: g.length, votos: soma(g, r => r.votos), validos: soma(g, r => r.validos),
    }))],
    [/^\/api\/local\/(\d+)\/(\d+)\/(\d+)$/, (p, m) => {
      const g = R.filter(r => r.cd_municipio == m[1] && r.nr_zona == m[2] && r.nr_local == m[3]).sort((a, b) => a.nr_secao - b.nr_secao);
      return {
        info: g.length ? { nm_local: g[0].nm_local, endereco: g[0].endereco, bairro: g[0].bairro, cep: g[0].cep, nm_municipio: g[0].nm_municipio } : {},
        secoes: g.map(r => ({ nr_secao: r.nr_secao, secoes_agregadas: r.secoes_agregadas, aptos: r.aptos, comparecimento: r.comparecimento,
          validos: r.validos, brancos: r.brancos, nulos: r.nulos, votos_candidato: r.votos })),
      };
    }],
    [/^\/api\/ranking\/(\w+)$/, (p, m) => {
      const n = m[1], lim = +(p.get('limite') || 20);
      return agrupar(filtrar(p), CHAVES[n]).map(g => ({ nome: NOMES[n](g), ...ids(n, g), votos: soma(g, r => r.votos), validos: soma(g, r => r.validos), secoes: g.length }))
        .filter(x => x.votos > 0).sort((a, b) => b.votos - a.votos).slice(0, lim);
    }],
    [/^\/api\/secoes$/, p => tabela(filtrar(p))],
    [/^\/api\/comp\/resumo$/, p => {
      const f = filtrar(p, true);
      return {
        base: { secoes: f.length, v22: soma(f, r => r.v22), v26: soma(f, r => r.votos), vv22: soma(f, r => r.vv22), vv26: soma(f, r => r.validos),
          ganhou: f.filter(r => r.votos > r.v22).length, perdeu: f.filter(r => r.votos < r.v22).length },
        posicao22: D.posicao22, cobertura: { ambas: R.filter(r => r.ambas).length },
      };
    }],
    [/^\/api\/comp\/ranking\/(\w+)$/, (p, m) => {
      const n = m[1], lim = +(p.get('limite') || 30), ordem = p.get('ordem') || 'ganho';
      const L = agrupar(filtrar(p, true), CHAVES[n]).map(g => {
        const v22 = soma(g, r => r.v22), v26 = soma(g, r => r.votos), vv22 = soma(g, r => r.vv22), vv26 = soma(g, r => r.validos);
        return { nome: n === 'secao' ? 'Z' + g[0].nr_zona + ' / S' + g[0].nr_secao + ' — ' + (g[0].nm_local ?? '?') + ' — ' + g[0].nm_municipio : NOMES[n](g),
          ...ids(n, g), v22, v26, delta: v26 - v22, vv22, vv26, secoes: g.length,
          dpp: vv22 && vv26 ? r2(100 * v26 / vv26 - 100 * v22 / vv22) : null };
      });
      L.sort(ordem === 'perda' ? (a, b) => a.delta - b.delta : (a, b) => b.delta - a.delta);
      return L.slice(0, lim);
    }],
    [/^\/api\/comp\/locais$/, p => agrupar(filtrar(p, true), CHAVES.local).map(g => ({
      cd_municipio: g[0].cd_municipio, nm_municipio: g[0].nm_municipio, nr_zona: g[0].nr_zona, nr_local: g[0].nr_local, nm_local: g[0].nm_local,
      latitude: g[0].latitude, longitude: g[0].longitude, v22: soma(g, r => r.v22), v26: soma(g, r => r.votos),
    }))],
    [/^\/api\/comp\/local\/(\d+)\/(\d+)\/(\d+)$/, (p, m) => R.filter(r => r.cd_municipio == m[1] && r.nr_zona == m[2] && r.nr_local == m[3])
      .sort((a, b) => a.nr_secao - b.nr_secao).map(r => ({
        nr_secao: r.nr_secao, situacao: r.ambas ? 'ambas' : 'so_2026', votos_22: r.v22, validos_22: r.vv22, votos_26: r.votos, validos_26: r.validos,
        nm_local: r.nm_local, nm_local_22: r.nm_local_22, endereco: r.endereco, bairro: r.bairro, nm_municipio: r.nm_municipio,
      }))],
    [/^\/api\/comp\/tabela$/, p => tabelaComp(filtrar(p, true))],
  ];

  async function get(url) {
    await pronto;
    const u = new URL(url, location.href);
    for (const [re, fn] of ROTAS) { const m = u.pathname.match(re); if (m) return fn(u.searchParams, m); }
    throw new Error('Rota desconhecida: ' + u.pathname);
  }

  // Exportação CSV/Excel no navegador (os links do painel apontam para /api/exportar.* e /api/comp/exportar.*)
  function baixar(nome, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  document.addEventListener('click', async e => {
    const a = e.target.closest('a[href*="/api/"][href*="exportar."]');
    if (!a) return;
    e.preventDefault();
    await pronto;
    const u = new URL(a.getAttribute('href'), location.href);
    const comp = u.pathname.includes('/comp/'), fmtArq = u.pathname.endsWith('.xlsx') ? 'xlsx' : 'csv';
    const linhas = comp ? tabelaComp(filtrar(u.searchParams, true)) : tabela(filtrar(u.searchParams));
    const nome = comp ? 'ricardo_maia_2022x2026' : 'ricardo_maia_secoes';
    if (fmtArq === 'xlsx' && window.XLSX) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), comp ? '2022 x 2026' : 'Seções');
      XLSX.writeFile(wb, nome + '.xlsx');
    } else {
      const cols = Object.keys(linhas[0] || {});
      const cel = v => v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : '"' + String(v).replace(/"/g, '""') + '"';
      const csv = [cols.join(';'), ...linhas.map(l => cols.map(c => cel(l[c])).join(';'))].join('\r\n');
      baixar(nome + '.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    }
  });

  window.API = { get };
})();
