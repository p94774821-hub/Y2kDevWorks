require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Y2k2024@';

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Rota principal - serve o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para o painel admin
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// API: Carregar conteúdo
app.get('/api/content', (req, res) => {
  try {
    const dataPath = path.join(__dirname, 'data', 'content.json');
    
    // Se a pasta data não existir, cria
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'));
    }
    
    // Se o arquivo não existir, cria com dados padrão
    if (!fs.existsSync(dataPath)) {
      const defaultData = {
        hero: {
          badge: "Y2K_DevWorks // online",
          titulo: "Bots Discord que fazem a diferença",
          bio: "𝙳𝚎𝚜𝚎𝚗𝚟𝚘𝚕𝚟𝚎𝚍𝚘𝚛 𝚍𝚎 𝚜𝚒𝚜𝚝𝚎𝚖𝚊𝚜 𝚙𝚊𝚛𝚊 𝙳𝚒𝚜𝚌𝚘𝚛𝚍",
          descricao: "Sistemas personalizados para seu servidor Discord. Automação inteligente, moderação eficiente e whitelist profissional."
        },
        stats: [
          { valor: 150, label: "Usuários Ajudados" },
          { valor: 6, label: "Projetos Ativos" },
          { valor: 1, label: "Ano de XP" }
        ],
        projetos: [
          {
            nome: "Insight",
            tipo: "Sistema de Sugestões",
            descricao: "Sistema completo de sugestões com votação, comentários e análise de engajamento.",
            icone: "fa-lightbulb"
          },
          {
            nome: "Atlas",
            tipo: "Registro de Imóveis",
            descricao: "Sistema de registro e gerenciamento de propriedades para servidores de RP.",
            icone: "fa-building"
          },
          {
            nome: "Vehix",
            tipo: "Registro de Veículos",
            descricao: "Sistema completo de registro e controle de veículos com painel administrativo.",
            icone: "fa-car"
          },
          {
            nome: "HostVille Services",
            tipo: "Moderação & Staff",
            descricao: "Bots de moderação, sistema de warns e avaliação de equipe staff.",
            icone: "fa-shield-alt"
          },
          {
            nome: "Cidade de Deus RP",
            tipo: "WhiteList Completa",
            descricao: "Bot completo de whitelist para servidor de Roleplay com todas as funcionalidades.",
            icone: "fa-list-check"
          },
          {
            nome: "Seu Projeto",
            tipo: "Sob Demanda",
            descricao: "Precisa de um sistema personalizado? Entre em contato para desenvolvermos juntos.",
            icone: "fa-plus-circle"
          }
        ],
        sobre: {
          nome: "Isac",
          bio: "𝙳𝚎𝚜𝚎𝚗𝚟𝚘𝚕𝚟𝚎𝚍𝚘𝚛 𝚍𝚎 𝚜𝚒𝚜𝚝𝚎𝚖𝚊𝚜 𝚙𝚊𝚛𝚊 𝙳𝚒𝚜𝚌𝚘𝚛𝚍",
          texto: "Meu nome é Isac, desenvolvedor de bots e sistemas para Discord com 1 ano de experiência em JavaScript e Python. Comecei criando pequenas automações e hoje desenvolvo sistemas completos de whitelist, moderação e gestão.\n\nMinha paixão por lógica e resolução de problemas vem da matemática, onde conquistei o bicampeonato paulista olímpico. Essa mesma lógica aplico no desenvolvimento de bots eficientes e bem estruturados.",
          skills: ["JavaScript", "Python", "HTML", "Discord.js", "Node.js", "Automação"]
        },
        contato: {
          discord: "@Y2k_Nat",
          email: "Y2k_Nat@hotmail.com",
          horario_semana: "13h às 21h",
          horario_fim: "14h às 22h"
        }
      };
      fs.writeFileSync(dataPath, JSON.stringify(defaultData, null, 2));
    }
    
    const data = fs.readFileSync(dataPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Erro ao carregar conteúdo:', error);
    res.status(500).json({ error: 'Erro ao carregar conteúdo' });
  }
});

// API: Salvar conteúdo
app.post('/api/save', (req, res) => {
  const { password, content } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  
  try {
    const dataPath = path.join(__dirname, 'data', 'content.json');
    fs.writeFileSync(dataPath, JSON.stringify(content, null, 2));
    res.json({ success: true, message: 'Conteúdo salvo com sucesso!' });
  } catch (error) {
    console.error('Erro ao salvar conteúdo:', error);
    res.status(500).json({ error: 'Erro ao salvar conteúdo' });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📁 Diretório: ${__dirname}`);
  console.log(`🔐 Painel admin: /admin.html`);
});