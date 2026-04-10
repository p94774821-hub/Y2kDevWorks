require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Y2k2024@';

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
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

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
    if (req.path === '/api/login' || req.path === '/api/bot/heartbeat') {
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

// ===== API DE AUTENTICAÇÃO =====
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Senha não fornecida' });
  }
  
  try {
    const isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    
    const token = jwt.sign(
      { user: 'admin', role: 'administrator' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
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

// ===== API PARA VERIFICAR TOKEN =====
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user,
    message: 'Token válido'
  });
});

// ===== DADOS DOS BOTS (COM TOKENS DO .ENV) =====
const botsData = {
  insight: {
    id: 'insight',
    nome: 'Insight',
    avatar: 'fa-lightbulb',
    status: 'offline',
    servidores: 0,
    usuarios: 0,
    comandos: 0,
    ping: 0,
    uptime: '0%',
    versao: '2.1.0',
    ultimaAtualizacao: null,
    token: process.env.INSIGHT_TOKEN || 'INSIGHT_TOKEN_123',
    descricao: 'Sistema de sugestões com votação e análise de engajamento'
  },
  atlas: {
    id: 'atlas',
    nome: 'Atlas',
    avatar: 'fa-building',
    status: 'offline',
    servidores: 0,
    usuarios: 0,
    comandos: 0,
    ping: 0,
    uptime: '0%',
    versao: '1.5.2',
    ultimaAtualizacao: null,
    token: process.env.ATLAS_TOKEN || 'ATLAS_TOKEN_456',
    descricao: 'Sistema de registro e gerenciamento de imóveis para servidores RP'
  },
  vehix: {
    id: 'vehix',
    nome: 'Vehix',
    avatar: 'fa-car',
    status: 'offline',
    servidores: 0,
    usuarios: 0,
    comandos: 0,
    ping: 0,
    uptime: '0%',
    versao: '1.2.0',
    ultimaAtualizacao: null,
    token: process.env.VEHIX_TOKEN || 'VEHIX_TOKEN_789',
    descricao: 'Sistema completo de registro e controle de veículos'
  }
};

// ===== ENDPOINT PARA OS BOTS ATUALIZAREM SEU STATUS (HEARTBEAT) =====
// Este endpoint NÃO requer JWT, apenas o token do bot
app.post('/api/bot/heartbeat', (req, res) => {
  const { botId, token, status, servidores, usuarios, comandos, ping, uptime, versao } = req.body;
  
  if (!botId || !token) {
    return res.status(400).json({ error: 'botId e token são obrigatórios' });
  }
  
  const bot = botsData[botId];
  if (!bot) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }
  
  // Verifica o token do bot
  if (token !== bot.token) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  
  // Atualiza os dados do bot
  if (status) bot.status = status;
  if (servidores !== undefined) bot.servidores = parseInt(servidores) || 0;
  if (usuarios !== undefined) bot.usuarios = parseInt(usuarios) || 0;
  if (comandos !== undefined) bot.comandos = parseInt(comandos) || 0;
  if (ping !== undefined) bot.ping = parseInt(ping) || 0;
  if (uptime) bot.uptime = uptime;
  if (versao) bot.versao = versao;
  
  bot.ultimaAtualizacao = new Date().toISOString();
  
  console.log(`📡 Heartbeat recebido: ${bot.nome} - Status: ${bot.status}, Servidores: ${bot.servidores}, Usuários: ${bot.usuarios}`);
  
  res.json({
    success: true,
    message: 'Status atualizado com sucesso!',
    receivedAt: new Date().toISOString()
  });
});

// ===== API DE BOTS =====

// Rota para obter todos os bots (protegida - sem tokens)
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
    totalServidores: bots.reduce((acc, b) => acc + b.servidores, 0),
    totalUsuarios: bots.reduce((acc, b) => acc + b.usuarios, 0),
    updatedAt: new Date().toISOString()
  });
});

// Rota para obter um bot específico (protegida - sem token)
app.get('/api/bots/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const bot = botsData[id];
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }
  
  const { token, ...botSemToken } = bot;
  
  res.json({
    success: true,
    bot: botSemToken
  });
});

// Rota para obter token de um bot (MUITO PROTEGIDA)
app.get('/api/bots/:id/token', authenticateToken, (req, res) => {
  const { id } = req.params;
  const bot = botsData[id];
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }
  
  if (req.user.role !== 'administrator') {
    return res.status(403).json({ error: 'Permissão negada' });
  }
  
  res.json({
    success: true,
    bot: {
      id: bot.id,
      nome: bot.nome,
      token: bot.token
    }
  });
});

// Rota para atualizar status de um bot (protegida)
app.post('/api/bots/:id/status', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status, servidores, ping, comandos, uptime } = req.body;
  
  if (!botsData[id]) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }
  
  if (status) botsData[id].status = status;
  if (servidores !== undefined) botsData[id].servidores = parseInt(servidores) || 0;
  if (ping !== undefined) botsData[id].ping = parseInt(ping) || 0;
  if (comandos !== undefined) botsData[id].comandos = parseInt(comandos) || 0;
  if (uptime) botsData[id].uptime = uptime;
  
  botsData[id].ultimaAtualizacao = new Date().toISOString().split('T')[0];
  
  console.log(`✅ Bot ${botsData[id].nome} atualizado por ${req.user.user}`);
  
  res.json({
    success: true,
    bot: {
      id: botsData[id].id,
      nome: botsData[id].nome,
      status: botsData[id].status,
      servidores: botsData[id].servidores,
      ping: botsData[id].ping,
      uptime: botsData[id].uptime,
      ultimaAtualizacao: botsData[id].ultimaAtualizacao
    },
    message: 'Status atualizado com sucesso!'
  });
});

// Rota para reiniciar um bot (simulado)
app.post('/api/bots/:id/restart', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  if (!botsData[id]) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }
  
  botsData[id].status = 'manutencao';
  
  setTimeout(() => {
    botsData[id].status = 'online';
    botsData[id].ultimaAtualizacao = new Date().toISOString().split('T')[0];
    console.log(`✅ Bot ${botsData[id].nome} reiniciado com sucesso`);
  }, 3000);
  
  res.json({
    success: true,
    message: `Bot ${botsData[id].nome} está reiniciando...`,
    estimatedTime: '3 segundos'
  });
});

// Rota para estatísticas gerais dos bots
app.get('/api/bots/stats/summary', authenticateToken, (req, res) => {
  const bots = Object.values(botsData);
  
  res.json({
    success: true,
    summary: {
      total: bots.length,
      online: bots.filter(b => b.status === 'online').length,
      manutencao: bots.filter(b => b.status === 'manutencao').length,
      offline: bots.filter(b => b.status === 'offline').length,
      totalServidores: bots.reduce((acc, b) => acc + b.servidores, 0),
      totalUsuarios: bots.reduce((acc, b) => acc + b.usuarios, 0),
      totalComandos: bots.reduce((acc, b) => acc + b.comandos, 0),
      pingMedio: Math.round(bots.reduce((acc, b) => acc + b.ping, 0) / bots.length)
    }
  });
});

// ===== FUNÇÕES AUXILIARES =====
function getDefaultContent() {
  return {
    hero: {
      badge: "Y2K_DevWorks // online",
      titulo: "Bots Discord que fazem a diferença",
      bio: "𝙳𝚎𝚜𝚎𝚗𝚟𝚘𝚕𝚟𝚎𝚍𝚘𝚛 𝚍𝚎 𝚜𝚒𝚜𝚝𝚎𝚖𝚊𝚜 𝚙𝚊𝚛𝚊 𝙳𝚒𝚜𝚌𝚘𝚛𝚍",
      descricao: "Sistemas personalizados para seu servidor Discord. Automação inteligente, moderação eficiente e whitelist profissional."
    },
    stats: [
      { valor: 150, label: "Usuários Ajudados" },
      { valor: 3, label: "Projetos Ativos" },
      { valor: 1, label: "Ano de XP" }
    ],
    projetos: [
      { id: "proj_1", nome: "Insight", tipo: "Sistema de Sugestões", descricao: "Sistema completo de sugestões com votação.", icone: "fa-lightbulb" },
      { id: "proj_2", nome: "Atlas", tipo: "Registro de Imóveis", descricao: "Sistema de registro de propriedades para RP.", icone: "fa-building" },
      { id: "proj_3", nome: "Vehix", tipo: "Registro de Veículos", descricao: "Sistema completo de registro de veículos.", icone: "fa-car" }
    ],
    sobre: {
      nome: "Isac",
      bio: "𝙳𝚎𝚜𝚎𝚗𝚟𝚘𝚕𝚟𝚎𝚍𝚘𝚛 𝚍𝚎 𝚜𝚒𝚜𝚝𝚎𝚖𝚊𝚜 𝚙𝚊𝚛𝚊 𝙳𝚒𝚜𝚌𝚘𝚛𝚍",
      texto: "Meu nome é Isac, desenvolvedor de bots e sistemas para Discord com 1 ano de experiência em JavaScript e Python.",
      skills: ["JavaScript", "Python", "HTML", "Discord.js", "Node.js", "Automação"]
    },
    contato: {
      discord: "@Y2k_Nat",
      email: "Y2k_Nat@hotmail.com",
      horario_semana: "13h às 21h",
      horario_fim: "14h às 22h"
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
  
  return sanitized;
}

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔐 JWT configurado com segurança`);
  console.log(`🤖 Monitor de Bots ativo (${Object.keys(botsData).length} bots)`);
  console.log(`📡 Endpoint Heartbeat: /api/bot/heartbeat`);
  console.log(`📁 Diretório: ${__dirname}`);
});