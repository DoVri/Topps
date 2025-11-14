const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const rateLimiter = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

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
  // Perbaikan: Status kode belum ditentukan saat logging
  console.log(
    `[${new Date().toLocaleString()}] ${req.method} ${req.url} - ${res.statusCode || 'N/A'}`
  );
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, headers: true }));

// Server configuration - diubah menjadi array
let servers = [
    { domain: 'mazda.privates.icu', name: 'MazdaPS', port: 17091 },
    { domain: 'runps.privates.icu', name: 'RunPS', port: 17092 }
];

// Route untuk menambah server
app.get('/add-servers', (req, res) => {
    const { add, name, port } = req.query;

    if (!add || !name || !port) {
        return res.status(400).send('Missing required parameters: add, name, port');
    }

    // Validasi port (harus angka)
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
        return res.status(400).send('Invalid port number');
    }

    // Tambahkan server baru ke array servers
    servers.push({ domain: add, name: name, port: portNum });

    console.log(`[SERVER ADDED] Domain: ${add}, Name: ${name}, Port: ${portNum}`);

    // Kembalikan response sukses
    res.json({
        status: 'success',
        message: `Server ${add} (${name}, Port ${portNum}) added successfully.`,
        servers: servers
    });
});

// Route untuk menghapus server
app.get('/delete-servers', (req, res) => {
    const { remove, name: nameToRemove, port: portToRemove } = req.query;

    if (!remove && !nameToRemove && !portToRemove) {
        return res.status(400).send('Missing required parameter: remove (domain), name, or port to identify the server');
    }

    // Temukan indeks server yang cocok dengan kriteria
    const index = servers.findIndex(server => {
        // Cocokkan berdasarkan domain dan/atau name dan/atau port
        // Jika parameter tidak disediakan, abaikan pengecekan untuk parameter tersebut
        const matchesDomain = !remove || server.domain === remove;
        const matchesName = !nameToRemove || server.name === nameToRemove;
        const matchesPort = !portToRemove || server.port === parseInt(portToRemove, 10);

        return matchesDomain && matchesName && matchesPort;
    });

    if (index !== -1) {
        const removedServer = servers[index];
        // Hapus server dari array servers
        servers.splice(index, 1);
        console.log(`[SERVER DELETED] Domain: ${removedServer.domain}, Name: ${removedServer.name}, Port: ${removedServer.port}`);
        res.json({
            status: 'success',
            message: `Server ${removedServer.domain} (${removedServer.name}, Port ${removedServer.port}) deleted successfully.`,
            servers: servers
        });
    } else {
        // Server tidak ditemukan
        console.log(`[DELETE FAILED] Server matching criteria not found.`);
        res.status(404).json({
            status: 'error',
            message: 'Server matching criteria not found.',
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
  // Cari server berdasarkan hostname dalam array
  const hostname = req.hostname;
  const foundServer = servers.find(server => server.domain === hostname);
  const serverName = foundServer ? foundServer.name : hostname.split(".")[0] || "MazdaPS";

  // Kirim data servers ke EJS
  res.render(__dirname + '/public/html/dashboard.ejs', {
     tData,
    serverName: serverName,
    servers: servers // <-- Tambahkan ini
  });
});

// Validasi login → generate token + accountAge: 2
app.all('/player/growid/login/validate', (req, res) => {
  const _token = req.body._token || '';
  const growId = req.body.growId || '';
  const password = req.body.password || '';
  const serverPort = req.body.server_port || '17091'; // Get selected server port

  // Check if it's a registration request (empty growId and password)
  if (!growId && !password) {
    // Create registration token
    const token = Buffer.from(
      `_token=${_token}&growId=&password=&server_port=${serverPort}`
    ).toString('base64');

    res.send(
      `{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia","accountAge":2}`
    );
  } else {
    // Create login token
    const token = Buffer.from(
      `_token=${_token}&growId=${growId}&password=${password}&server_port=${serverPort}`
    ).toString('base64');

    res.send(
      `{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia","accountAge":2}`
    );
  }
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
app.listen(5000, function () {
  console.log('Listening on port 5000');
});
