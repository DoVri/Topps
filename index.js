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
  console.log(
    `[${new Date().toLocaleString()}] ${req.method} ${req.url} - ${
      res.statusCode
    }`,
  );
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, headers: true }));

// Server configuration
const servers = {
    'mazda.privates.icu': { name: 'MazdaPS', port: 17091 },
    'runps.privates.icu': { name: 'RunPS', port: 17092 },
    'growtopia1.com': { name: 'GTPS #1', port: 17091 },
    'growtopia2.com': { name: 'GTPS #2', port: 17092 }
};

// Route to add new server to the list
app.get('/addlist', (req, res) => {
  const serverName = req.query.server;
  const port = req.query.port;
  
  if (!serverName || !port) {
    return res.json({ status: 'failed', message: 'Missing server name or port parameter' });
  }
  
  // Check if port is already used
  for (const [key, value] of Object.entries(servers)) {
    if (value.port.toString() === port.toString()) {
      return res.json({ status: 'failed', message: 'Port already in use by another server' });
    }
  }
  
  // Add new server (use a dummy hostname for now)
  const hostname = `${serverName.toLowerCase().replace(/\s+/g, '')}.privates.icu`;
  servers[hostname] = { name: serverName, port: parseInt(port) };
  
  console.log(`[DYNAMIC] Added server ${serverName} on port ${port} with hostname ${hostname}`);
  res.json({ status: 'success', message: `Server ${serverName} added successfully on port ${port}` });
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
  const serverName = servers[hostname]?.name || hostname.split(".")[0] || "MazdaPS";

  res.render(__dirname + '/public/html/dashboard.ejs', { 
     tData,
    serverName: serverName,
    servers: Object.values(servers).map(server => server.name)
  });
});

// Validasi login → generate token + accountAge: 2
app.all('/player/growid/login/validate', (req, res) => {
  const _token = req.body._token || '';
  const growId = req.body.growId || '';
  const password = req.body.password || '';
  const serverName = req.body.server_name || 'MazdaPS'; // Get selected server name
  const serverPort = req.body.server_port || '17091'; // Get selected server port

  // Check if it's a registration request (empty growId and password)
  if (!growId && !password) {
    // Create registration token with the selected server port
    const token = Buffer.from(
      `_token=${_token}&growId=&password=&server_name=${serverName}&server_port=${serverPort}`
    ).toString('base64');

    res.send(
      `{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia","accountAge":2}`
    );
  } else {
    // Create login token with the selected server port
    const token = Buffer.from(
      `_token=${_token}&growId=${growId}&password=${password}&server_name=${serverName}&server_port=${serverPort}`
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
  
  // Log available servers at startup
  console.log('\x1b[36mAvailable servers:\x1b[0m');
  for (const [hostname, config] of Object.entries(servers)) {
    console.log(`- ${config.name} (${hostname}) on port ${config.port}`);
  }
});
