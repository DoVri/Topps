const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const rateLimiter = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));
app.use(compression({
  level: 5,
  threshold: 0,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public/html')); // penting!
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url} - ${res.statusCode}`);
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 5 * 60 * 1000, max: 800, headers: true }));

app.all('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.all('/player/register', (req, res) => {
  res.send("Coming soon...");
});

// ✅ PERBAIKAN: Route ini hanya menampilkan halaman login
app.all('/player/login/dashboard', (req, res) => {
  // Jangan coba parse req.body di sini!
  // Cukup render halaman login
  res.render('dashboard', { data: {} }); // 'dashboard' = dashboard.ejs
});

// ✅ Route validasi: terima form POST dari dashboard.ejs
app.post('/player/growid/login/validate', (req, res) => {
  const _token = req.body._token;
  const growId = req.body.growId;
  const password = req.body.password;
  const email = req.body.email; // opsional

  // Validasi dasar
  if (!growId || !password) {
    return res.status(400).json({
      status: "error",
      message: "GrowID and password are required."
    });
  }

  // Simulasi validasi sukses
  const tokenData = `_token=${_token || ''}&growId=${growId}&password=${password}&email_reg=${email || ''}&has_reg=${email ? '1' : '0'}`;
  const token = Buffer.from(tokenData).toString('base64');

  res.json({
    status: "success",
    message: "Account Validated.",
    token: token,
    url: "",
    accountType: "growtopia",
    accountAge: 2
  });
});

// Route check token (opsional)
app.post('/player/growid/checktoken', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.redirect('/player/login/dashboard');
  }

  try {
    const decoded = Buffer.from(refreshToken, 'base64').toString('utf-8');
    // Validasi minimal
    if (!decoded.includes('growId=') || !decoded.includes('password=')) {
      throw new Error('Invalid token format');
    }

    res.json({
      status: 'success',
      message: 'Account Validated.',
      token: refreshToken,
      url: '',
      accountType: 'growtopia',
      accountAge: 2
    });
  } catch (error) {
    console.log("Invalid token, redirecting to login:", error.message);
    res.redirect('/player/login/dashboard');
  }
});

app.get('/', (req, res) => {
  res.redirect('/player/login/dashboard'); // arahkan ke login
});

app.listen(5000, () => {
  console.log('Listening on port 5000');
});
