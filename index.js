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

  res.render(__dirname + '/public/html/dashboard.ejs', { data: tData });
});

// Validasi login → generate token + accountAge: 2
app.all('/player/growid/login/validate', (req, res) => {
  const _token = req.body._token;
  const growId = req.body.growId;
  const password = req.body.password;

  // Email diabaikan karena tidak dipakai di checkToken versi kedua
  const tokenData = `_token=${_token}&growId=${growId}&password=${password}`;
  const token = Buffer.from(tokenData).toString('base64');

  res.send(
    JSON.stringify({
      status: 'success',
      message: 'Account Validated.',
      token: token,
      url: '',
      accountType: 'growtopia',
      accountAge: 2,
    }),
  );
});

// Check token → validasi dan refresh token + accountAge: 2
app.all('/player/growid/checkToken', (req, res) => {
  try {
    const { refreshToken, clientData } = req.body;

    if (!refreshToken || !clientData) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing refreshToken or clientData',
      });
    }

    let decoded = Buffer.from(refreshToken, 'base64').toString('utf-8');

    // Ganti _token lama dengan yang baru dari clientData
    const newTokenData = decoded.replace(
      /(_token=)[^&]*/,
      `_token=${Buffer.from(clientData).toString('base64')}`
    );

    const newToken = Buffer.from(newTokenData).toString('base64');

    res.json({
      status: 'success',
      message: 'Token is valid.',
      token: newToken,
      url: '',
      accountType: 'growtopia',
      accountAge: 2,
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
    });
  }
});

// Root
app.get('/', function (req, res) {
  res.send('Hello World!');
});

// Start server
app.listen(5000, function () {
  console.log('Listening on port 5000');
});
