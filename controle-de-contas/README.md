# Controle de Contas

App de controle financeiro com **servidor próprio**. Não depende de nenhum
serviço externo (nem do Claude) — só do Node.js, que já vem instalado em
praticamente qualquer computador ou serviço de hospedagem.

Os dados ficam guardados no arquivo `dados.json`, no próprio servidor.
Nenhuma biblioteca externa é necessária (não precisa rodar `npm install`).

## Como rodar no seu computador

1. Instale o [Node.js](https://nodejs.org) (versão 18 ou mais recente), se ainda não tiver.
2. Abra um terminal dentro da pasta `controle-de-contas`.
3. Rode:
   ```
   node server.js
   ```
4. No navegador do computador, acesse: `http://localhost:3000`

## Como acessar pelo celular (mesma rede Wi-Fi)

1. Com o servidor rodando no computador, descubra o IP local dele:
   - Windows: `ipconfig` (procure "Endereço IPv4", ex: 192.168.0.10)
   - Mac/Linux: `ifconfig` ou `ip a`
2. No celular, conectado na **mesma rede Wi-Fi**, abra o navegador e acesse:
   ```
   http://SEU_IP_AQUI:3000
   ```
   Exemplo: `http://192.168.0.10:3000`
3. Para deixar mais rápido de acessar, adicione essa página à tela inicial do
   celular (no navegador: menu → "Adicionar à tela inicial").

## Como deixar acessível de qualquer lugar (fora de casa)

Para acessar o app de qualquer lugar (não só na sua rede Wi-Fi), hospede-o
em um servidor na nuvem. Opções simples e com plano gratuito:

- **Render.com** — suporta Node.js nativamente, é só conectar o repositório
- **Railway.app** — parecido com o Render
- Um servidor próprio (VPS) via **Hostinger, DigitalOcean, Contabo**, etc.

Nesses casos, ao subir o projeto, apenas rode `node server.js` como comando
de início — não é necessário `npm install`, já que o app não usa nenhuma
biblioteca externa.

**Atenção:** o `dados.json` guarda os dados em um arquivo simples. Isso
funciona bem para uso pessoal. Se for hospedar num serviço em nuvem que
"reinicia" o sistema de arquivos a cada deploy (alguns planos gratuitos
fazem isso), os dados podem ser perdidos — nesse caso, vale configurar um
volume persistente ou migrar para um banco de dados de verdade no futuro.

## Estrutura

```
controle-de-contas/
├── server.js       ← servidor (API + arquivos estáticos)
├── dados.json      ← seus lançamentos (criado automaticamente)
└── public/
    └── index.html  ← a interface do app
```
