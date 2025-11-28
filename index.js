const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const rateLimiter = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const fs = require('fs').promises;

app.use(express.static(path.join(__dirname, 'public')));
app.use(
  compression({
    level: 5,
    threshold: 0,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);
app.set('view engine', 'ejs');
app.set('trust proxy', 1);
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept',
  );
  console.log(
    `[${new Date().toLocaleString()}] ${req.method} ${req.url} - ${res.statusCode || 'N/A'}`
  );
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, headers: true }));

// Initialize servers with NewPS included by default
let servers = [
  { name: 'MazdaPS', port: 17091 },
  { name: 'NewPS', port: 17092 }
];

// Load servers from file (if exists)
async function loadServers() {
  try {
    const data = await fs.readFile('servers.json', 'utf8');
    const loadedServers = JSON.parse(data);
    
    // Check if our default servers are already in the loaded list
    const hasMazdaPS = loadedServers.some(s => s.name === 'MazdaPS');
    const hasNewPS = loadedServers.some(s => s.name === 'NewPS');
    
    // If not, add them
    if (!hasMazdaPS) {
      loadedServers.unshift({ name: 'MazdaPS', port: 17091 });
    }
    if (!hasNewPS) {
      loadedServers.push({ name: 'NewPS', port: 17092 });
    }
    
    servers = loadedServers;
    console.log(`[LOADED] ${servers.length} servers from persistent storage`);
  } catch (error) {
    // If file doesn't exist, use our default servers with NewPS
    console.log(`[INIT] Using default servers with NewPS`);
    servers = [
      { name: 'MazdaPS', port: 17091 },
      { name: 'NewPS', port: 17092 }
    ];
    await saveServers();
  }
}

// Save servers to file
async function saveServers() {
  try {
    await fs.writeFile('servers.json', JSON.stringify(servers, null, 2));
    console.log(`[SAVED] ${servers.length} servers to persistent storage`);
  } catch (error) {
    console.error(`[SAVE ERROR] Failed to save servers:`, error);
  }
}

// Initialize servers on startup
loadServers();

// Route untuk menambah server
app.get('/addlist', async (req, res) => {
    const { name, port } = req.query;

    if (!name || !port) {
        return res.status(400).send('Missing required parameters: name, port');
    }

    // Validasi port (harus angka)
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
        return res.status(400).send('Invalid port number');
    }

    // Check if server name already exists
    const existingServer = servers.find(server => server.name === name);
    if (existingServer) {
        return res.status(400).send(`Server with name ${name} already exists`);
    }

    // Tambahkan server baru ke array servers
    servers.push({ name: name, port: portNum });

    // Simpan ke file
    await saveServers();

    console.log(`[SERVER ADDED] Name: ${name}, Port: ${portNum}`);

    // Kembalikan response sukses
    res.json({
        status: 'success',
        message: `Server ${name} (Port ${portNum}) added successfully.`,
        servers: servers
    });
});

// Route untuk menghapus server
app.get('/deletelist', async (req, res) => {
    const { name: nameToRemove, port: portToRemove } = req.query;

    if (!nameToRemove && !portToRemove) {
        return res.status(400).send('Missing required parameter: name or port to identify the server');
    }

    // Temukan indeks server yang cocok dengan kriteria
    const index = servers.findIndex(server => {
        // Don't allow deletion of default servers
        if (server.name === 'MazdaPS' || server.name === 'NewPS') {
            return false;
        }
        // Cocokkan berdasarkan name dan/atau port
        const matchesName = !nameToRemove || server.name === nameToRemove;
        const matchesPort = !portToRemove || server.port === parseInt(portToRemove, 10);
        return matchesName && matchesPort;
    });

    if (index !== -1) {
        const removedServer = servers[index];
        // Hapus server dari array servers
        servers.splice(index, 1);
        
        // Simpan ke file
        await saveServers();
        
        console.log(`[SERVER DELETED] Name: ${removedServer.name}, Port: ${removedServer.port}`);
        res.json({
            status: 'success',
            message: `Server ${removedServer.name} (Port ${removedServer.port}) deleted successfully.`,
            servers: servers
        });
    } else {
        // Server tidak ditemukan atau is default server
        console.log(`[DELETE FAILED] Server matching criteria not found or is default server.`);
        res.status(404).json({
            status: 'error',
            message: 'Server matching criteria not found or cannot delete default servers.',
            servers: servers
        });
    }
});

// Favicon
app.get('/favicon.:ext', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// Dashboard login (frontend parsing tidak diubah)
app.all('/player/login/dashboard', function (req, res) {
  const tData = {};
  try {
    const uData = JSON.stringify(req.body).split('"')[1].split('\\n');
    const uName = uData[0].split('|');
    const uPass = uData[1].split('|');
    for (let i = 0; i < uData.length - 1; i++) {
      const d = uData[i].split('|');
      tData[d[0]] = d[1];
    }
    if (uName[1] && uPass[1]) {
      res.redirect('/player/growid/login/validate');
    }
  } catch (why) {
    console.log(`Warning: ${why}`);
  }

  // Get server name from hostname
  const hostname = req.hostname;
  const foundServer = servers.find(server => server.name.toLowerCase().includes(hostname.split('.')[0].toLowerCase()));
  const serverName = foundServer ? foundServer.name : hostname.split(".")[0] || "MazdaPS";

  // Kirim data servers ke EJS
  res.render(__dirname + '/public/html/dashboard.ejs', {
     tData,
    serverName: serverName,
    servers: servers
  });
});

// Validasi login → generate token + accountAge: 2
app.all('/player/growid/login/validate', (req, res) => {
  const _token = req.body._token || '';
  const growId = req.body.growId || '';
  const password = req.body.password || '';
  const serverPort = req.body.server_port || '17091'; // Get selected server port

  // Create token with server port information in the correct format for LToken handler
  const tokenData = `_token=${_token}&growId=${growId}&password=${password}&server_port=${serverPort}`;
  const token = Buffer.from(tokenData).toString('base64');

  res.send(
    `{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia","accountAge":2}`
  );
});

// Check token → validasi dan refresh token + accountAge: 2
app.all('/player/growid/checktoken', (req, res) => {
    const { refreshToken } = req.body;
    try {
    const decoded = Buffer.from(refreshToken, 'base64').toString('utf-8');
    if (typeof decoded !== 'string' && !decoded.startsWith('growId=') && !decoded.includes('passwords=')) return res.render(__dirname + '/public/html/dashboard.ejs');
    res.json({
        status: 'success',
        message: 'Account Validated.',
        token: refreshToken,
        url: '',
        accountType: 'growtopia',
        accountAge: 2
    });
    } catch (error) {
        console.log("Redirecting to player login dashboard");
        res.render(__dirname + '/public/html/dashboard.ejs');
    }
});

// Root
app.get('/', function (req, res) {
  res.send('Welcome to MazdaPS Multi-Server Login URL!');
});

// Start server
app.listen(process.env.PORT || 5000, function () {
  console.log('Listening on port ' + (process.env.PORT || 5000));
  console.log('Default servers: MazdaPS (17091), NewPS (17092)');
});
