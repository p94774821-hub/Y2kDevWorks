require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ===== ADICIONADO - WebSocket para Terminal =====
const http = require('http');
const WebSocket = require('ws');

const app = express();
// ===== MODIFICADO - Usar server HTTP para WebSocket =====
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Y2k2024@';

// ===== ADICIONADO - Configurações do Terminal =====
const TERMINAL_SECRET = process.env.TERMINAL_SECRET || 'y2k-terminal-secret-2024';

// ===== ADICIONADO - Estado do site para controle via terminal =====
let siteStatus = {
  online: true,
  maintenanceMode: false,
  lastToggle: null,
  accessLogs: []
};

// Hash da senha
let ADMIN_PASSWORD_HASH = '';

async function initPasswordHash() {
  try {
    ADMIN_PASSWORD_HASH = await bcrypt.hash(ADMIN_PASSWORD, 10);
    console.log('✅ Senha admin inicializada com segurança');
  } catch (error) {
    console.error('Erro ao gerar hash da senha:', error);
  }
}
initPasswordHash();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ===== ADICIONADO - Middleware para verificar se site está online =====
app.use((req, res, next) => {
  // Permitir acesso ao painel admin, API, e páginas de status mesmo offline
  if (req.path === '/admin.html' || 
      req.path === '/Admin.html' ||
      req.path.startsWith('/api') || 
      req.path === '/offline.html' ||
      req.path === '/maintenance.html' ||
      req.path === '/health') {
    return next();
  }
  
  // Se site estiver offline
  if (!siteStatus.online) {
    // Verificar se o arquivo offline.html existe
    const offlinePath = path.join(__dirname, 'offline.html');
    if (fs.existsSync(offlinePath)) {
      return res.status(503).sendFile(offlinePath);
    }
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Site Offline</title></head>
      <body style="background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
        <div style="text-align:center"><h1 style="color:#a855f7">🔴 Site Offline</h1><p>O site está temporariamente offline.</p></div>
      </body>
      </html>
    `);
  }
  
  // Se estiver em manutenção
  if (siteStatus.maintenanceMode) {
    const maintenancePath = path.join(__dirname, 'maintenance.html');
    if (fs.existsSync(maintenancePath)) {
      return res.status(503).sendFile(maintenancePath);
    }
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Em Manutenção</title></head>
      <body style="background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
        <div style="text-align:center"><h1 style="color:#f59e0b">⚠️ Em Manutenção</h1><p>Estamos realizando melhorias. Volte em breve!</p></div>
      </body>
      </html>
    `);
  }
  
  next();
});

// ===== MIDDLEWARE DE AUTENTICAÇÃO JWT =====
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    req.user = user;
    next();
  });
}

// ===== MIDDLEWARE DE BLOQUEIO MOBILE =====
function blockMobile(req, res, next) {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  if (isMobile && req.path.startsWith('/api/')) {
    if (req.path === '/api/login' || req.path === '/api/bot/heartbeat' || req.path === '/api/site-status' || req.path === '/api/save-site-status') {
      return next();
    }
    return res.status(403).json({ error: 'Acesso administrativo apenas por desktop' });
  }
  next();
}

app.use('/api', blockMobile);

// ===== ROTAS PÚBLICAS =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/Admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'Admin.html'));
});

// ===== ADICIONADO - Rota Health Check (Railway) =====
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    site: siteStatus.online ? 'online' : 'offline',
    maintenance: siteStatus.maintenanceMode,
    timestamp: new Date().toISOString()
  });
});

// ===== ADICIONADO - Rota para OBTER status do site =====
app.get('/api/site-status', (req, res) => {
  res.json({
    online: siteStatus.online,
    maintenanceMode: siteStatus.maintenanceMode,
    lastToggle: siteStatus.lastToggle,
    logs: siteStatus.accessLogs.slice(-20)
  });
});

// ===== ⭐⭐⭐ ADICIONADO - Rota para SALVAR status do site ⭐⭐⭐ =====
app.post('/api/site-status', authenticateToken, (req, res) => {
  const { online, maintenanceMode } = req.body;
  
  try {
    // Atualizar status
    if (online !== undefined) siteStatus.online = online;
    if (maintenanceMode !== undefined) siteStatus.maintenanceMode = maintenanceMode;
    
    siteStatus.lastToggle = Date.now();
    
    // Registrar log
    let statusText = 'online';
    if (!siteStatus.online) statusText = 'offline';
    else if (siteStatus.maintenanceMode) statusText = 'maintenance';
    
    siteStatus.accessLogs.push({
      timestamp: Date.now(),
      action: `[API] Site alterado para: ${statusText} por ${req.user.user}`
    });
    
    console.log(`🌐 Status do site alterado: ${statusText} por ${req.user.user}`);
    
    // Transmitir para terminais conectados
    broadcastStatus();
    
    res.json({
      success: true,
      message: 'Status do site atualizado com sucesso!',
      status: {
        online: siteStatus.online,
        maintenanceMode: siteStatus.maintenanceMode,
        lastToggle: siteStatus.lastToggle
      }
    });
  } catch (error) {
    console.error('Erro ao salvar status:', error);
    res.status(500).json({ error: 'Erro ao salvar status do site' });
  }
});

// ===== API DE AUTENTICAÇÃO =====
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Senha não fornecida' });
  }
  
  try {
    const isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    
    if (!isValid) {
      siteStatus.accessLogs.push({
        timestamp: Date.now(),
        action: '[API] Tentativa de login falhou'
      });
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    
    const token = jwt.sign(
      { user: 'admin', role: 'administrator' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    siteStatus.accessLogs.push({
      timestamp: Date.now(),
      action: '[API] Login realizado com sucesso'
    });
    
    res.json({
      success: true,
      token: token,
      expiresIn: 86400
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// ===== API PÚBLICA (LEITURA) =====
app.get('/api/content', (req, res) => {
  try {
    const dataPath = path.join(__dirname, 'data', 'content.json');
    
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'));
    }
    
    if (!fs.existsSync(dataPath)) {
      const defaultData = getDefaultContent();
      fs.writeFileSync(dataPath, JSON.stringify(defaultData, null, 2));
    }
    
    const data = fs.readFileSync(dataPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Erro ao carregar conteúdo:', error);
    res.status(500).json({ error: 'Erro ao carregar conteúdo' });
  }
});

// ===== API PROTEGIDA (ESCRITA) =====
app.post('/api/save', authenticateToken, (req, res) => {
  const { content } = req.body;
  
  if (!content || typeof content !== 'object') {
    return res.status(400).json({ error: 'Conteúdo inválido' });
  }
  
  const sanitizedContent = sanitizeContent(content);
  
  try {
    const dataPath = path.join(__dirname, 'data', 'content.json');
    fs.writeFileSync(dataPath, JSON.stringify(sanitizedContent, null, 2));
    
    siteStatus.accessLogs.push({
      timestamp: Date.now(),
      action: `[API] Conteúdo salvo por ${req.user.user}`
    });
    
    console.log(`✅ Conteúdo salvo por ${req.user.user} em ${new Date().toISOString()}`);
    
    res.json({
      success: true,
      message: 'Conteúdo salvo com sucesso!',
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao salvar conteúdo:', error);
    res.status(500).json({ error: 'Erro ao salvar conteúdo' });
  }
});

// ===== API PARA SALVAR TEMA E COR =====
app.post('/api/save-theme', authenticateToken, (req, res) => {
  const { theme, primaryColor } = req.body;
  
  try {
    const dataPath = path.join(__dirname, 'data', 'content.json');
    
    let data = {};
    if (fs.existsSync(dataPath)) {
      data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
    
    data.theme = data.theme || {};
    data.theme.mode = theme;
    data.theme.primaryColor = primaryColor;
    
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    
    siteStatus.accessLogs.push({
      timestamp: Date.now(),
      action: `[TEMA] Alterado para ${theme} - Cor: ${primaryColor}`
    });
    
    console.log(`🎨 Tema salvo: ${theme} - ${primaryColor}`);
    
    res.json({ 
      success: true,
      message: 'Tema salvo com sucesso!',
      theme: theme,
      primaryColor: primaryColor
    });
  } catch (error) {
    console.error('Erro ao salvar tema:', error);
    res.status(500).json({ error: 'Erro ao salvar tema' });
  }
});

// ===== API PARA VERIFICAR TOKEN =====
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user,
    message: 'Token válido'
  });
});

// ===== DADOS DO BOT (APENAS INSIGHT) =====
const botsData = {
  insight: {
    id: 'insight',
    nome: 'Insight',
    avatar: 'fa-lightbulb',
    status: 'offline',
    servidores: 0,
    guildIds: [],
    usuarios: 0,
    userIds: [],
    comandos: 0,
    ping: 0,
    uptime: '0%',
    versao: '2.1.0',
    ultimaAtualizacao: null,
    token: process.env.INSIGHT_TOKEN || 'INSIGHT_TOKEN_123',
    descricao: 'Sistema de sugestões com votação e análise de engajamento'
  }
};

// ===== FUNÇÕES PARA CALCULAR TOTAIS ÚNICOS =====
function calcularServidoresUnicos() {
  const todosIds = new Set();
  
  Object.values(botsData).forEach(bot => {
    if (bot.status === 'online' && bot.guildIds && Array.isArray(bot.guildIds)) {
      bot.guildIds.forEach(id => todosIds.add(id));
    }
  });
  
  return todosIds.size;
}

function calcularUsuariosUnicos() {
  const todosIds = new Set();
  
  Object.values(botsData).forEach(bot => {
    if (bot.status === 'online' && bot.userIds && Array.isArray(bot.userIds)) {
      bot.userIds.forEach(id => todosIds.add(id));
    }
  });
  
  return todosIds.size;
}

// ===== ENDPOINT PARA O BOT ATUALIZAR SEU STATUS (HEARTBEAT) =====
app.post('/api/bot/heartbeat', (req, res) => {
  const { botId, token, status, servidores, guildIds, usuarios, userIds, comandos, ping, uptime, versao } = req.body;
  
  if (!botId || !token) {
    return res.status(400).json({ error: 'botId e token são obrigatórios' });
  }
  
  const bot = botsData[botId];
  if (!bot) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }
  
  if (token !== bot.token) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  
  if (status) bot.status = status;
  if (servidores !== undefined) bot.servidores = parseInt(servidores) || 0;
  if (guildIds && Array.isArray(guildIds)) bot.guildIds = guildIds;
  if (usuarios !== undefined) bot.usuarios = parseInt(usuarios) || 0;
  if (userIds && Array.isArray(userIds)) bot.userIds = userIds;
  if (comandos !== undefined) bot.comandos = parseInt(comandos) || 0;
  if (ping !== undefined) bot.ping = parseInt(ping) || 0;
  if (uptime) bot.uptime = uptime;
  if (versao) bot.versao = versao;
  
  bot.ultimaAtualizacao = new Date().toISOString();
  
  siteStatus.accessLogs.push({
    timestamp: Date.now(),
    action: `[HEARTBEAT] ${bot.nome} - Status: ${bot.status}`
  });
  
  console.log(`📡 Heartbeat recebido: ${bot.nome} - Status: ${bot.status}, Servidores: ${bot.servidores}, Usuários: ${bot.usuarios}`);
  
  res.json({
    success: true,
    message: 'Status atualizado com sucesso!',
    receivedAt: new Date().toISOString()
  });
});

// ===== API DE BOTS =====
app.get('/api/bots', authenticateToken, (req, res) => {
  const bots = Object.values(botsData).map(bot => ({
    id: bot.id,
    nome: bot.nome,
    avatar: bot.avatar,
    status: bot.status,
    servidores: bot.servidores,
    usuarios: bot.usuarios,
    comandos: bot.comandos,
    ping: bot.ping,
    uptime: bot.uptime,
    versao: bot.versao,
    ultimaAtualizacao: bot.ultimaAtualizacao,
    descricao: bot.descricao
  }));
  
  res.json({
    success: true,
    bots: bots,
    totalBots: bots.length,
    botsOnline: bots.filter(b => b.status === 'online').length,
    totalServidores: calcularServidoresUnicos(),
    totalUsuarios: calcularUsuariosUnicos(),
    updatedAt: new Date().toISOString()
  });
});

// ===== API para atualizar status do bot via admin =====
app.post('/api/bots/:botId/status', authenticateToken, (req, res) => {
  const { botId } = req.params;
  const { ping } = req.body;
  
  const bot = botsData[botId];
  if (!bot) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }
  
  if (ping !== undefined) {
    bot.ping = parseInt(ping) || 0;
  }
  
  bot.ultimaAtualizacao = new Date().toISOString();
  
  siteStatus.accessLogs.push({
    timestamp: Date.now(),
    action: `[ADMIN] Status do bot ${bot.nome} atualizado`
  });
  
  res.json({
    success: true,
    message: 'Status do bot atualizado'
  });
});

// ===== FUNÇÕES AUXILIARES =====
function getDefaultContent() {
  return {
    hero: {
      badge: "Y2K_DevWorks // online",
      titulo: "Sistemas e automação para Discord",
      bio: "𝙳𝚎𝚜𝚎𝚗𝚟𝚘𝚕𝚟𝚎𝚍𝚘𝚛 𝚍𝚎 𝚜𝚒𝚜𝚝𝚎𝚖𝚊𝚜 𝚙𝚊𝚛𝚊 𝙳𝚒𝚜𝚌𝚘𝚛𝚍",
      descricao: "Sistemas profissionais para Discord. Automação e soluções personalizadas para seu servidor."
    },
    stats: [
      { valor: 150, label: "Usuários Ajudados" },
      { valor: 3, label: "Sistemas Ativos" },
      { valor: 1, label: "Ano de Experiência" }
    ],
    projetos: [
      { id: "proj_1", nome: "Insight", tipo: "Sistema de Sugestões", descricao: "Sistema completo de sugestões com votação e análise de engajamento.", icone: "fa-lightbulb" },
      { id: "proj_2", nome: "Atlas", tipo: "Registro de Propriedades", descricao: "Sistema de registro de imóveis para servidores RP.", icone: "fa-building" },
      { id: "proj_3", nome: "Vehix", tipo: "Registro de Veículos", descricao: "Sistema completo de registro e gerenciamento de veículos.", icone: "fa-car" }
    ],
    sobre: {
      nome: "Isac",
      bio: "𝙳𝚎𝚜𝚎𝚗𝚟𝚘𝚕𝚟𝚎𝚍𝚘𝚛 𝚍𝚎 𝚜𝚒𝚜𝚝𝚎𝚖𝚊𝚜 𝚙𝚊𝚛𝚊 𝙳𝚒𝚜𝚌𝚘𝚛𝚍",
      texto: "Meu nome é Isac, desenvolvedor de sistemas e automação para Discord com 1 ano de experiência em JavaScript e Python. Foco em criar soluções eficientes e personalizadas para cada servidor.",
      skills: ["JavaScript", "Python", "Discord.js", "Node.js", "Automação", "APIs"]
    },
    contato: {
      discord: "@Y2k_Nat",
      email: "Y2k_Nat@hotmail.com",
      horario_semana: "13h às 21h",
      horario_fim: "14h às 22h"
    },
    theme: {
      mode: "dark",
      primaryColor: "#a855f7"
    }
  };
}

function sanitizeContent(content) {
  const sanitized = { ...content };
  
  if (sanitized.hero) {
    sanitized.hero.badge = String(sanitized.hero.badge || '').trim().substring(0, 100);
    sanitized.hero.titulo = String(sanitized.hero.titulo || '').trim().substring(0, 200);
    sanitized.hero.bio = String(sanitized.hero.bio || '').trim().substring(0, 500);
    sanitized.hero.descricao = String(sanitized.hero.descricao || '').trim().substring(0, 1000);
  }
  
  if (Array.isArray(sanitized.stats)) {
    sanitized.stats = sanitized.stats.map(stat => ({
      valor: parseInt(stat.valor) || 0,
      label: String(stat.label || '').trim().substring(0, 50)
    }));
  }
  
  if (Array.isArray(sanitized.projetos)) {
    sanitized.projetos = sanitized.projetos.map(proj => ({
      id: proj.id || 'proj_' + Date.now() + '_' + Math.random().toString(36),
      nome: String(proj.nome || '').trim().substring(0, 100),
      tipo: String(proj.tipo || '').trim().substring(0, 100),
      descricao: String(proj.descricao || '').trim().substring(0, 500),
      icone: String(proj.icone || 'fa-code').trim().substring(0, 50)
    }));
  }
  
  if (sanitized.sobre) {
    sanitized.sobre.nome = String(sanitized.sobre.nome || '').trim().substring(0, 100);
    sanitized.sobre.bio = String(sanitized.sobre.bio || '').trim().substring(0, 500);
    sanitized.sobre.texto = String(sanitized.sobre.texto || '').trim().substring(0, 2000);
    if (Array.isArray(sanitized.sobre.skills)) {
      sanitized.sobre.skills = sanitized.sobre.skills.map(s => String(s).trim().substring(0, 50)).filter(s => s.length > 0);
    }
  }
  
  if (sanitized.contato) {
    sanitized.contato.discord = String(sanitized.contato.discord || '').trim().substring(0, 100);
    sanitized.contato.email = String(sanitized.contato.email || '').trim().toLowerCase().substring(0, 100);
    sanitized.contato.horario_semana = String(sanitized.contato.horario_semana || '').trim().substring(0, 50);
    sanitized.contato.horario_fim = String(sanitized.contato.horario_fim || '').trim().substring(0, 50);
  }
  
  if (content.theme) {
    sanitized.theme = content.theme;
  }
  
  return sanitized;
}

// ===== SISTEMA DE TERMINAL VIA WEBSOCKET =====
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`🖥️ Terminal conectado de ${clientIP}`);
  let authenticated = false;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (!authenticated) {
        if (data.type === 'auth' && data.secret === TERMINAL_SECRET) {
          authenticated = true;
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: '✅ Autenticado com sucesso no Y2K Terminal!',
            prompt: 'y2k> '
          }));
          
          ws.send(JSON.stringify({
            type: 'status',
            data: siteStatus
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: '❌ Falha na autenticação. Secret inválido.'
          }));
          ws.close();
        }
        return;
      }
      
      if (data.type === 'command') {
        handleTerminalCommand(data.command, ws);
      }
      
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: `❌ Erro: ${error.message}`
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`🖥️ Terminal desconectado de ${clientIP}`);
  });
});

function handleTerminalCommand(cmd, ws) {
  const args = cmd.trim().split(/\s+/);
  const command = args[0].toLowerCase();
  
  const commands = {
    help: () => {
      return `
╔══════════════════════════════════════════════════════════╗
║           🖥️  Y2K TERMINAL ADMINISTRATIVO  🖥️            ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  🌐 CONTROLE DO SITE:                                    ║
║    status              - Ver status atual                ║
║    offline             - Deixar site OFFLINE             ║
║    online              - Reativar site                   ║
║    maintenance on/off  - Modo manutenção                 ║
║    toggle              - Alternar online/offline         ║
║                                                          ║
║  🤖 SISTEMAS:                                            ║
║    bots                - Listar sistemas                 ║
║    bot-status <id>     - Ver status de um sistema        ║
║                                                          ║
║  🔐 ADMIN:                                               ║
║    check-password <s>  - Verificar senha do admin        ║
║                                                          ║
║  📊 LOGS:                                                ║
║    logs [limite]       - Ver últimos logs                ║
║    clear-logs          - Limpar logs                     ║
║                                                          ║
║  🖥️ TERMINAL:                                            ║
║    clear               - Limpar tela                     ║
║    exit                - Desconectar                     ║
║    help                - Esta ajuda                      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`;
    },
    
    status: () => {
      return `
📊 STATUS DO SITE - ${new Date().toLocaleString('pt-BR')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Site: ${siteStatus.online ? '🟢 ONLINE' : '🔴 OFFLINE'}
🔧 Manutenção: ${siteStatus.maintenanceMode ? '⚠️ ATIVADA' : '✅ DESATIVADA'}
🕐 Última alteração: ${siteStatus.lastToggle ? new Date(siteStatus.lastToggle).toLocaleString('pt-BR') : 'Nunca'}
📝 Logs registrados: ${siteStatus.accessLogs.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    },
    
    offline: () => {
      if (!siteStatus.online) return '⚠️ Site já está OFFLINE.';
      siteStatus.online = false;
      siteStatus.maintenanceMode = false;
      siteStatus.lastToggle = Date.now();
      siteStatus.accessLogs.push({ timestamp: Date.now(), action: '[TERMINAL] Site OFFLINE' });
      broadcastStatus();
      return '🔴 Site OFFLINE!';
    },
    
    online: () => {
      if (siteStatus.online && !siteStatus.maintenanceMode) return '⚠️ Site já está ONLINE.';
      siteStatus.online = true;
      siteStatus.maintenanceMode = false;
      siteStatus.lastToggle = Date.now();
      siteStatus.accessLogs.push({ timestamp: Date.now(), action: '[TERMINAL] Site ONLINE' });
      broadcastStatus();
      return '🟢 Site ONLINE!';
    },
    
    maintenance: () => {
      const action = args[1]?.toLowerCase();
      if (action === 'on') {
        siteStatus.online = true;
        siteStatus.maintenanceMode = true;
        siteStatus.lastToggle = Date.now();
        siteStatus.accessLogs.push({ timestamp: Date.now(), action: '[TERMINAL] Manutenção ATIVADA' });
        broadcastStatus();
        return '⚠️ Modo manutenção ATIVADO.';
      } else if (action === 'off') {
        siteStatus.maintenanceMode = false;
        siteStatus.lastToggle = Date.now();
        siteStatus.accessLogs.push({ timestamp: Date.now(), action: '[TERMINAL] Manutenção DESATIVADA' });
        broadcastStatus();
        return '✅ Modo manutenção DESATIVADO.';
      }
      return `🔧 Modo manutenção: ${siteStatus.maintenanceMode ? 'ATIVADO' : 'DESATIVADO'}\n💡 Use: maintenance on/off`;
    },
    
    toggle: () => {
      siteStatus.online = !siteStatus.online;
      siteStatus.maintenanceMode = false;
      siteStatus.lastToggle = Date.now();
      siteStatus.accessLogs.push({ timestamp: Date.now(), action: `[TERMINAL] Toggle para ${siteStatus.online ? 'ONLINE' : 'OFFLINE'}` });
      broadcastStatus();
      return siteStatus.online ? '🟢 ONLINE' : '🔴 OFFLINE';
    },
    
    bots: () => {
      const bots = Object.values(botsData);
      return `
🤖 SISTEMAS:
${bots.map(b => `${b.nome}: ${b.status === 'online' ? '🟢' : '🔴'} ${b.status}`).join('\n')}
Total: ${bots.length}
`;
    },
    
    'bot-status': () => {
      const botId = args[1];
      if (!botId) return '❌ ID necessário';
      const bot = botsData[botId];
      if (!bot) return '❌ Não encontrado';
      return `${bot.nome}: ${bot.status} | Servidores: ${bot.servidores} | Ping: ${bot.ping}ms`;
    },
    
    'check-password': () => {
      return args[1] === ADMIN_PASSWORD ? '✅ Correta!' : '❌ Incorreta!';
    },
    
    logs: () => {
      const limit = parseInt(args[1]) || 10;
      const logs = siteStatus.accessLogs.slice(-limit);
      if (logs.length === 0) return '📝 Nenhum log.';
      return logs.map(log => `[${new Date(log.timestamp).toLocaleString('pt-BR')}] ${log.action}`).join('\n');
    },
    
    'clear-logs': () => {
      siteStatus.accessLogs = [];
      return '🧹 Logs limpos!';
    },
    
    clear: () => '\x1b[2J\x1b[H',
    exit: () => { ws.close(); return null; }
  };
  
  let response = commands[command] ? commands[command]() : `❌ Comando desconhecido: "${command}"\n💡 Digite "help"`;
  
  if (response !== null) {
    ws.send(JSON.stringify({ type: 'response', message: response, prompt: 'y2k> ' }));
  }
}

function broadcastStatus() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'status_update', data: siteStatus }));
    }
  });
}

// ===== INICIAR SERVIDOR =====
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║         🚀 Y2K DEVWORKS - SERVIDOR INICIADO 🚀          ║
╠══════════════════════════════════════════════════════════╣
║  📡 Servidor: http://localhost:${PORT}
║  🔐 Painel: http://localhost:${PORT}/Admin.html
║  🖥️ Terminal: ws://localhost:${PORT}
║  🌐 Status: ONLINE | Manutenção: DESATIVADA
╚══════════════════════════════════════════════════════════╝
  `);
});