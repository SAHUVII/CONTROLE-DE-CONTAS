const CACHE_NOME = 'controle-de-contas-v2';

const ARQUIVOS_ESSENCIAIS = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/icone-192.png',
  '/icone-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOME).then((cache) => {
      return cache.addAll(ARQUIVOS_ESSENCIAIS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NOME)
          .map((nome) => caches.delete(nome))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  // nunca guardar em cache as chamadas de API (dados devem sempre vir do servidor)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      return respostaCache || fetch(evento.request);
    })
  );
});
