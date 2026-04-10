const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Rota para servir o site
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para carregar o conteúdo
app.get('/api/content', (req, res) => {
  try {
    const data = fs.readFileSync('./data/content.json', 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar conteúdo' });
  }
});

// Rota para salvar o conteúdo (protegida por senha)
app.post('/api/save', (req, res) => {
  const { password, content } = req.body;
  const ADMIN_PASSWORD = 'Y2k2024@'; // ALTERE SUA SENHA AQUI
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  
  try {
    fs.writeFileSync('./data/content.json', JSON.stringify(content, null, 2));
    res.json({ success: true, message: 'Conteúdo salvo com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar conteúdo' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
