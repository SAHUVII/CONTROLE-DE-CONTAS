const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERRO: defina as variáveis de ambiente SUPABASE_URL e SUPABASE_KEY no Render.');
}

const DADOS_INICIAIS = [
  { data: '2026-08-05', desc: 'Salário', categoria: 'Salário', tipo: 'receita', valor: 4500 },
  { data: '2026-08-06', desc: 'Aluguel', categoria: 'Moradia', tipo: 'despesa', valor: 1200 },
];

// ---------------- Supabase (REST) ----------------

function headersSupabase(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function buscarUsuario(usuario) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/usuarios?usuario=eq.${encodeURIComponent(usuario)}&select=*`,
    { headers: headersSupabase() }
  );
  const dados = await resp.json();
  return Array.isArray(dados) ? dados[0] || null : null;
}

async function inserirUsuario(usuario, salt, hash) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/usuarios`, {
    method: 'POST',
    headers: headersSupabase({ Prefer: 'return=representation' }),
    body: JSON.stringify([{ usuario, salt, hash }]),
  });
  if (!resp.ok) {
    throw new Error('Não foi possível criar o usuário (' + resp.status + ')');
  }
}

async function listarLancamentos(usuario) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/lancamentos?usuario=eq.${encodeURIComponent(usuario)}&select=*&order=data.asc`,
    { headers: headersSupabase() }
  );
  const dados = await resp.json();
  return Array.isArray(dados) ? dados : [];
}

async function inserirLancamento(item) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/lancamentos`, {
    method: 'POST',
    headers: headersSupabase({ Prefer: 'return=representation' }),
    body: JSON.stringify([item]),
  });
  const dados = await resp.json();
  return dados[0];
}

async function atualizarLancamento(id, usuario, alteracoes) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/lancamentos?id=eq.${encodeURIComponent(id)}&usuario=eq.${encodeURIComponent(usuario)}`,
    {
      method: 'PATCH',
      headers: headersSupabase({ Prefer: 'return=representation' }),
      body: JSON.stringify(alteracoes),
    }
  );
  const dados = await resp.json();
  return dados[0] || null;
}

async function removerLancamento(id, usuario) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/lancamentos?id=eq.${encodeURIComponent(id)}&usuario=eq.${encodeURIComponent(usuario)}`,
    { method: 'DELETE', headers: headersSupabase() }
  );
}

// ---------------- Usuários / senha ----------------

function sanitizarUsuario(usuario) {
  return String(usuario || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, 64).toString('hex');
}

async function criarUsuario(usuarioBruto, senha) {
  const usuario = sanitizarUsuario(usuarioBruto);
  if (!usuario) throw new Error('Nome de usuário inválido');
  if (!senha || senha.length < 4) throw new Error('Senha deve ter ao menos 4 caracteres');

  const existente = await buscarUsuario(usuario);
  if (existente) throw new Error('Usuário já existe');

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashSenha(senha, salt);
  await inserirUsuario(usuario, salt, hash);

  for (const seed of DADOS_INICIAIS) {
    await inserirLancamento({ id: gerarId(), usuario, ...seed });
  }

  return usuario;
}

async function verificarLogin(usuarioBruto, senha) {
  const usuario = sanitizarUsuario(usuarioBruto);
  const registro = await buscarUsuario(usuario);
  if (!registro) return null;
  const hashTentativa = hashSenha(senha || '', registro.salt);
  const a = Buffer.from(hashTentativa, 'hex');
  const b = Buffer.from(registro.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return usuario;
}

// ---------------- Sessões (em memória) ----------------

const SESSOES = new Map();

function criarSessao(usuario) {
  const sid = crypto.randomBytes(24).toString('hex');
  SESSOES.set(sid, usuario);
  return sid;
}

function obterUsuarioDaSessao(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sid = cookies.sid;
  if (!sid) return null;
  return SESSOES.get(sid) || null;
}

function parseCookies(cabecalho) {
  const resultado = {};
  cabecalho.split(';').forEach((parte) => {
    const idx = parte.indexOf('=');
    if (idx === -1) return;
    const chave = parte.slice(0, idx).trim();
    const valor = parte.slice(idx + 1).trim();
    if (chave) resultado[chave] = decodeURIComponent(valor);
  });
  return resultado;
}

// ---------------- Utilitários HTTP ----------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function enviarJSON(res, status, obj, headersExtra) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headersExtra || {}));
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

// ---------------- Servidor ----------------

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch (e) {
    res.writeHead(400);
    return res.end('Requisição inválida');
  }
  const pathname = url.pathname;
  const usuarioLogado = obterUsuarioDaSessao(req);

  // ---------------- Autenticação ----------------

  if (pathname === '/api/registrar' && req.method === 'POST') {
    try {
      const { usuario, senha } = await lerCorpo(req);
      const nomeCriado = await criarUsuario(usuario, senha);
      const sid = criarSessao(nomeCriado);
      return enviarJSON(res, 201, { usuario: nomeCriado }, {
        'Set-Cookie': `sid=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`,
      });
    } catch (e) {
      return enviarJSON(res, 400, { erro: e.message });
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const { usuario, senha } = await lerCorpo(req);
      const nome = await verificarLogin(usuario, senha);
      if (!nome) return enviarJSON(res, 401, { erro: 'Usuário ou senha inválidos' });
      const sid = criarSessao(nome);
      return enviarJSON(res, 200, { usuario: nome }, {
        'Set-Cookie': `sid=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`,
      });
    } catch (e) {
      return enviarJSON(res, 400, { erro: 'Requisição inválida' });
    }
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.sid) SESSOES.delete(cookies.sid);
    return enviarJSON(res, 200, { ok: true }, {
      'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax',
    });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    if (!usuarioLogado) return enviarJSON(res, 401, { erro: 'Não autenticado' });
    return enviarJSON(res, 200, { usuario: usuarioLogado });
  }

  // ---------------- API de lançamentos (protegida) ----------------

  if (pathname.startsWith('/api/lancamentos')) {
    if (!usuarioLogado) return enviarJSON(res, 401, { erro: 'Não autenticado' });

    try {
      if (pathname === '/api/lancamentos' && req.method === 'GET') {
        return enviarJSON(res, 200, await listarLancamentos(usuarioLogado));
      }

      if (pathname === '/api/lancamentos' && req.method === 'POST') {
        const novo = await lerCorpo(req);
        const item = {
          id: gerarId(),
          usuario: usuarioLogado,
          data: novo.data || new Date().toISOString().slice(0, 10),
          desc: novo.desc || 'Novo lançamento',
          categoria: novo.categoria || 'Outros',
          tipo: novo.tipo === 'receita' ? 'receita' : 'despesa',
          valor: Number(novo.valor) || 0,
        };
        const criado = await inserirLancamento(item);
        return enviarJSON(res, 201, criado || item);
      }

      const matchItem = pathname.match(/^\/api\/lancamentos\/([^/]+)$/);

      if (matchItem && req.method === 'PUT') {
        const id = matchItem[1];
        const alteracoes = await lerCorpo(req);
        if (alteracoes.valor !== undefined) alteracoes.valor = Number(alteracoes.valor) || 0;
        const atualizado = await atualizarLancamento(id, usuarioLogado, alteracoes);
        if (!atualizado) return enviarJSON(res, 404, { erro: 'Não encontrado' });
        return enviarJSON(res, 200, atualizado);
      }

      if (matchItem && req.method === 'DELETE') {
        await removerLancamento(matchItem[1], usuarioLogado);
        return enviarJSON(res, 200, { ok: true });
      }

      if (pathname === '/api/lancamentos.csv' && req.method === 'GET') {
        const dados = await listarLancamentos(usuarioLogado);
        let csv = 'Data,Descrição,Categoria,Tipo,Valor\n';
        dados.forEach((d) => {
          csv += `${d.data},"${d.desc}",${d.categoria},${d.tipo},${Number(d.valor).toFixed(2)}\n`;
        });
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="meus-lancamentos.csv"',
        });
        return res.end(csv);
      }
    } catch (e) {
      return enviarJSON(res, 500, { erro: 'Erro ao acessar o banco de dados' });
    }
  }

  // ------------- Arquivos estáticos -------------

  let filePath = pathname;
  if (pathname === '/') {
    filePath = usuarioLogado ? '/index.html' : '/login.html';
  }
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
});

