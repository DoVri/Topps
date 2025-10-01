const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const rateLimiter = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

const app = express();

// Session setup
app.use(
  session({
    secret: 'mazdapssecretkeysession', // GANTI DI PRODUKSI!
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // true jika HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 jam
    },
  })
);

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
app.set('views', path.join(__dirname, 'public/html'));
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept',
  );
  console.log(
    `[${new Date().toLocaleString()}] ${req.method} ${req.url} - ${res.statusCode || 'pending'}`
  );
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, headers: true }));

// Serve static files (like favicon)
app.use(express.static(path.join(__dirname, 'public')));

// Route: Dashboard (cek session dulu)
app.all('/player/login/dashboard', (req, res) => {
  if (req.session.isLoggedIn) {
    return res.json({
      status: 'success',
      message: 'Already logged in',
      growId: req.session.growId,
    });
  }

  const tData = {};
  try {
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr && bodyStr !== '{}' && bodyStr.includes('\\n')) {
      const uData = bodyStr.split('"')[1].split('\\n');
      for (let i = 0; i < uData.length - 1; i++) {
        const d = uData[i].split('|');
        if (d[0] && d[1]) tData[d[0]] = d[1];
      }
      const uName = uData[0]?.split('|') || [];
      const uPass = uData[1]?.split('|') || [];
      if (uName[1] && uPass[1]) {
        return res.redirect('/player/growid/login/validate');
      }
    }
  } catch (why) {
    console.log(`Warning parsing body: ${why}`);
  }

  res.render('dashboard', { 
    data: tData,
    isLoggedIn: req.session.isLoggedIn,
    growId: req.session.growId || ''
  });
});

// Route: Validasi login → set session
app.all('/player/growid/login/validate', (req, res) => {
  const _token = req.body._token || '';
  const growId = (req.body.growId || '').trim();
  const password = (req.body.password || '').trim();

  if (!growId || !password) {
    return res.status(400).send('Missing growId or password');
  }

  // Simpan ke session (tanpa password!)
  req.session.isLoggedIn = true;
  req.session.growId = growId;

  const token = Buffer.from(
    `_token=${_token}&growId=${growId}&password=${password}`,
  ).toString('base64');

  res.send(
    `{"status":"success","message":"Account Validated.","token":"${token}","url":"","accountType":"growtopia"}`
  );
});

// Route: Cek token (pakai session jika ada)
app.all('/player/growid/checkToken', (req, res) => {
  try {
    const { refreshToken, clientData } = req.body;

    if (!refreshToken || !clientData) {
      return res.status(400).send({
        status: 'error',
        message: 'Missing refreshToken or clientData',
      });
    }

    let decodeRefreshToken = Buffer.from(refreshToken, 'base64').toString('utf-8');

    const token = Buffer.from(
      decodeRefreshToken.replace(
        /(_token=)[^&]*/,
        `$1${Buffer.from(clientData).toString('base64')}`,
      ),
    ).toString('base64');

    res.send({
      status: 'success',
      message: 'Token is valid.',
      token: token,
      url: '',
      accountType: 'growtopia',
    });
  } catch (error) {
    console.error('Token check error:', error);
    res.status(500).send({ status: 'error', message: 'Internal Server Error' });
  }
});

// Logout (opsional)
app.get('/player/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/player/login/dashboard');
  });
});

// Favicon
app.get('/favicon.:ext', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// Root
app.get('/', (req, res) => {
  res.send('Growtopia Login Backend with Session Support');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
