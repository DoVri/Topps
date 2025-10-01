const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const rateLimiter = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

const app = express();

// === Middleware ===
app.use(compression());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, headers: true }));

// session login
app.use(session({
    secret: 'mazdaps-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 1 hari
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public/html'));

// === Middleware logging ===
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
    next();
});

// === Login Dashboard ===
app.all('/player/login/dashboard', (req, res) => {
    if (req.session.user) {
        // sudah login, langsung render dashboard
        return res.render('dashboard.ejs', { data: req.session.user });
    }
    res.render('dashboard.ejs', { data: {} });
});

// === Validate Login ===
app.post('/player/growid/login/validate', (req, res) => {
    const { _token, growId, password } = req.body;

    if (!growId || !password) {
        return res.status(400).json({ status: 'error', message: 'Missing credentials' });
    }

    // Simulasi validasi user (kamu bisa ganti dengan DB)
    if (growId.length >= 4 && password.length >= 4) {
        req.session.user = { growId, _token };
        const token = Buffer.from(`_token=${_token}&growId=${growId}&password=${password}`).toString('base64');
        return res.json({
            status: 'success',
            message: 'Account Validated.',
            token,
            url: '/player/login/dashboard',
            accountType: 'growtopia'
        });
    }

    return res.status(401).json({ status: 'error', message: 'Invalid login' });
});

// === Logout ===
app.get('/player/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/player/login/dashboard');
    });
});

// === Proxy Redirect untuk selain login ===
app.all('/player/*', (req, res) => {
    res.redirect('https://api.yoruakio.tech/player/' + req.path.slice(8));
});

// === Root ===
app.get('/', (req, res) => {
    res.send('Hello World! MazdaPS Backend is running');
});

// === Export agar bisa jalan di Vercel ===
module.exports = app;
