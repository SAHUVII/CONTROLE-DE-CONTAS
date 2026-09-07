const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const USERS_FILE = path.join(__dirname, 'usuarios.json');

const DADOS_INICIAIS = [
  { id: 'seed1', data: '2026-08-05', desc: 'Salário', categoria: 'Salário', tipo: 'receita', valor: 4500 },
  { id: 'seed2', data: '2026-08-06', desc: 'Aluguel', categoria: 'Moradia', tipo: 'despesa', valor: 1200 },
];

// ---------------- Usuários ----------------

function lerUsuarios() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function salvarUsuarios(usuarios) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(usuarios, null, 2), 'utf-8');
}

function sanitizarUsuario(usuario) {
  return String(usuario || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, 64).toString('hex');
}

function criarUsuario(usuarioBruto, senha) {
  const usuario = sanitizarUsuario(usuarioBruto);
  if (!usuario) throw new Error('Nome de usuário inválido');
  if (!senha || senha.length < 4) throw new Error('Senha deve ter ao menos 4 caracteres');

  const usuarios = lerUsuarios();
  if (usuarios[usuario]) throw new Error('Usuário já existe');

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashSenha(senha, salt);
  usuarios[usuario] = { salt, hash };
  salvarUsuarios(usuarios);

  // cria arquivo de dados inicial para esse usuário
  salvarDadosUsuario(usuario, DADOS_INICIAIS);
  return usuario;
}

function verificarLogin(usuarioBruto, senha) {
  const usuario = sanitizarUsuario(usuarioBruto);
  const usuarios = lerUsuarios();
  const registro = usuarios[usuario];
  if (!registro) return null;
  const hashTentativa = hashSenha(senha || '', registro.salt);
  const a = Buffer.from(hashTentativa, 'hex');
  const b = Buffer.from(registro.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return usuario;
}

// ---------------- Sessões (em memória) ----------------

const SESSOES = new Map(); // sid -> usuario

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

// ---------------- Dados por usuário ----------------

function arquivoDadosDoUsuario(usuario) {
  return path.join(__dirname, dados-${usuario}.json);
}

function lerDadosUsuario(usuario) {
  try {
    const raw = fs.readFileSync(arquivoDadosDoUsuario(usuario), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function salvarDadosUsuario(usuario, dados) {
  fs.writeFileSync(arquivoDadosDoUsuario(usuario), JSON.stringify(dados, null, 2), 'utf-8');
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
    url = new URL(req.url, http://${req.headers.host});
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
      const nomeCriado = criarUsuario(usuario, senha);
      const sid = criarSessao(nomeCriado);
      return enviarJSON(res, 201, { usuario: nomeCriado }, {
        'Set-Cookie': sid=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax,
      });
    } catch (e) {
      return enviarJSON(res, 400, { erro: e.message });
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const { usuario, senha } = await lerCorpo(req);
      const nome = verificarLogin(usuario, senha);
      if (!nome) return enviarJSON(res, 401, { erro: 'Usuário ou senha inválidos' });
      const sid = criarSessao(nome);
      return enviarJSON(res, 200, { usuario: nome }, {
        'Set-Cookie': sid=${sid}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax,
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

    if (pathname === '/api/lancamentos' && req.method === 'GET') {
      return enviarJSON(res, 200, lerDadosUsuario(usuarioLogado));
    }

    if (pathname === '/api/lancamentos' && req.method === 'POST') {
      try {
        const novo = await lerCorpo(req);
        const dados = lerDadosUsuario(usuarioLogado);
        const item = {
          id: gerarId(),
          data: novo.data || new Date().toISOString().slice(0, 10),
          desc: novo.desc || 'Novo lançamento',
          categoria: novo.categoria || 'Outros',
          tipo: novo.tipo === 'receita' ? 'receita' : 'despesa',
          valor: Number(novo.valor) || 0,
        };
        dados.push(item);
        salvarDadosUsuario(usuarioLogado, dados);
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
        const dados = lerDadosUsuario(usuarioLogado);
        const idx = dados.findIndex((d) => d.id === id);
        if (idx === -1) return enviarJSON(res, 404, { erro: 'Não encontrado' });
        const atualizado = { ...dados[idx], ...alteracoes, id };
        if (alteracoes.valor !== undefined) atualizado.valor = Number(alteracoes.valor) || 0;
        dados[idx] = atualizado;
        salvarDadosUsuario(usuarioLogado, dados);
        return enviarJSON(res, 200, atualizado);
      } catch (e) {
        return enviarJSON(res, 400, { erro: 'JSON inválido' });
      }
    }

    if (matchItem && req.method === 'DELETE') {
      const id = matchItem[1];
      const dados = lerDadosUsuario(usuarioLogado);
      const restantes = dados.filter((d) => d.id !== id);
      salvarDadosUsuario(usuarioLogado, restantes);
      return enviarJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/lancamentos.csv' && req.method === 'GET') {
      const dados = lerDadosUsuario(usuarioLogado);
      let csv = 'Data,Descrição,Categoria,Tipo,Valor\n';
      dados.forEach((d) => {
        csv += ${d.data},"${d.desc}",${d.categoria},${d.tipo},${d.valor.toFixed(2)}\n;
      });
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="meus-lancamentos.csv"',
      });
      return res.end(csv);
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
  console.log(Controle de Contas rodando em http://localhost:${PORT});
})
