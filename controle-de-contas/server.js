const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'dados.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const DADOS_INICIAIS = [
  { id: 'seed1', data: '2026-08-05', desc: 'Salário', categoria: 'Salário', tipo: 'receita', valor: 4500 },
  { id: 'seed2', data: '2026-08-06', desc: 'Aluguel', categoria: 'Moradia', tipo: 'despesa', valor: 1200 },
  { id: 'seed3', data: '2026-08-08', desc: 'Supermercado', categoria: 'Alimentação', tipo: 'despesa', valor: 650 },
  { id: 'seed4', data: '2026-08-12', desc: 'Uber', categoria: 'Transporte', tipo: 'despesa', valor: 180 },
  { id: 'seed5', data: '2026-08-20', desc: 'Cinema', categoria: 'Lazer', tipo: 'despesa', valor: 90 },
  { id: 'seed6', data: '2026-09-05', desc: 'Salário', categoria: 'Salário', tipo: 'receita', valor: 4500 },
  { id: 'seed7', data: '2026-09-07', desc: 'Aluguel', categoria: 'Moradia', tipo: 'despesa', valor: 1200 },
  { id: 'seed8', data: '2026-09-10', desc: 'Farmácia', categoria: 'Saúde', tipo: 'despesa', valor: 220 },
];

function lerDados() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DADOS_INICIAIS;
  } catch (e) {
    return DADOS_INICIAIS;
  }
}

function salvarDados(dados) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(dados, null, 2), 'utf-8');
}

if (!fs.existsSync(DATA_FILE)) {
  salvarDados(DADOS_INICIAIS);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function enviarJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch (e) {
    res.writeHead(400);
    return res.end('Requisição inválida');
  }
  const pathname = url.pathname;

  // ---------------- API ----------------
  if (pathname === '/api/lancamentos' && req.method === 'GET') {
    return enviarJSON(res, 200, lerDados());
  }

  if (pathname === '/api/lancamentos' && req.method === 'POST') {
    try {
      const novo = await lerCorpo(req);
      const dados = lerDados();
      const item = {
        id: gerarId(),
        data: novo.data || new Date().toISOString().slice(0, 10),
        desc: novo.desc || 'Novo lançamento',
        categoria: novo.categoria || 'Outros',
        tipo: novo.tipo === 'receita' ? 'receita' : 'despesa',
        valor: Number(novo.valor) || 0,
      };
      dados.push(item);
      salvarDados(dados);
      return enviarJSON(res, 201, item);
    } catch (e) {
      return enviarJSON(res, 400, { erro: 'JSON inválido' });
    }
  }

  const matchItem = pathname.match(/^\/api\/lancamentos\/([^/]+)$/);

  if (matchItem && req.method === 'PUT') {
    try {
      const id = matchItem[1];
      const alteracoes = await lerCorpo(req);
      const dados = lerDados();
      const idx = dados.findIndex((d) => d.id === id);
      if (idx === -1) return enviarJSON(res, 404, { erro: 'Não encontrado' });
      const atualizado = { ...dados[idx], ...alteracoes, id };
      if (alteracoes.valor !== undefined) atualizado.valor = Number(alteracoes.valor) || 0;
      dados[idx] = atualizado;
      salvarDados(dados);
      return enviarJSON(res, 200, atualizado);
    } catch (e) {
      return enviarJSON(res, 400, { erro: 'JSON inválido' });
    }
  }

  if (matchItem && req.method === 'DELETE') {
    const id = matchItem[1];
    const dados = lerDados();
    const restantes = dados.filter((d) => d.id !== id);
    salvarDados(restantes);
    return enviarJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/lancamentos.csv' && req.method === 'GET') {
    const dados = lerDados();
    let csv = 'Data,Descrição,Categoria,Tipo,Valor\n';
    dados.forEach((d) => {
      csv += `${d.data},"${d.desc}",${d.categoria},${d.tipo},${d.valor.toFixed(2)}\n`;
    });
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="meus-lancamentos.csv"',
    });
    return res.end(csv);
  }

  // ------------- Arquivos estáticos -------------
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Proibido');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Controle de Contas rodando em http://localhost:${PORT}`);
  console.log('Para acessar de outro aparelho na mesma rede, use o IP deste computador.');
});
