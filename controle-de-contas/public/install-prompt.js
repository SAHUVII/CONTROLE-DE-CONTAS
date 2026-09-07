(function () {
  // não mostrar se já está instalado (rodando como app)
  const jaInstalado = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (jaInstalado) return;

  // não mostrar se a pessoa já fechou o banner nos últimos 7 dias
  const fechadoEm = localStorage.getItem('banner_instalar_fechado_em');
  if (fechadoEm && (Date.now() - Number(fechadoEm)) < 7 * 24 * 60 * 60 * 1000) return;

  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  let deferredPrompt = null;

  function criarBanner(conteudoHTML, aoClicarBotao) {
    const banner = document.createElement('div');
    banner.id = 'banner-instalar-app';
    banner.style.cssText = `
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
      background: #1f2937; color: #f3f4f6; padding: 14px 16px;
      display: flex; align-items: center; gap: 12px;
      font-family: system-ui, sans-serif; font-size: 14px;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
    `;
    banner.innerHTML = conteudoHTML;
    document.body.appendChild(banner);

    const btnFechar = banner.querySelector('#banner-fechar');
    btnFechar.addEventListener('click', () => {
      localStorage.setItem('banner_instalar_fechado_em', String(Date.now()));
      banner.remove();
    });

    const btnAcao = banner.querySelector('#banner-instalar-btn');
    if (btnAcao && aoClicarBotao) {
      btnAcao.addEventListener('click', aoClicarBotao);
    }
  }

  if (ehIOS) {
    criarBanner(`
      <span style="flex:1;">
        📲 Instale este app: toque em <strong>Compartilhar</strong>
        e depois em <strong>"Adicionar à Tela de Início"</strong>.
      </span>
      <button id="banner-fechar" style="background:none; border:none; color:#9ca3af; font-size:20px; cursor:pointer; padding:0 6px;">×</button>
    `);
  } else {
    window.addEventListener('beforeinstallprompt', (evento) => {
      evento.preventDefault();
      deferredPrompt = evento;

      criarBanner(`
        <span style="flex:1;">📲 Instale o Controle de Contas na sua tela inicial</span>
        <button id="banner-instalar-btn" style="background:#2563eb; color:white; border:none; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer;">Instalar</button>
        <button id="banner-fechar" style="background:none; border:none; color:#9ca3af; font-size:20px; cursor:pointer; padding:0 6px;">×</button>
      `, async () => {
        const banner = document.getElementById('banner-instalar-app');
        if (banner) banner.remove();
        if (deferredPrompt) {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
        }
      });
    });
  }
})();
