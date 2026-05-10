const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const db = require('./src/models/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'eco-pulse-secret',
    resave: false,
    saveUninitialized: true
}));

// Global user variable for templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Middleware to protect routes
const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Eco-Pulse | Community Eco-Monitoring',
        message: 'Welcome to Eco-Pulse' 
    });
});

app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const [user] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        const [logs] = await db.query('SELECT * FROM waste_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [req.session.user.id]);
        res.render('dashboard', { 
            title: 'Dashboard | Eco-Pulse',
            user: user[0],
            logs: logs
        });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.get('/leaderboard', (req, res) => {
    res.render('leaderboard', { title: 'Leaderboard | Eco-Pulse' });
});

app.get('/rewards', (req, res) => {
    res.render('rewards', { title: 'Rewards | Eco-Pulse' });
});

app.get('/login', (req, res) => {
    res.render('login', { title: 'Login | Eco-Pulse' });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
        if (users.length > 0) {
            req.session.user = users[0];
            res.redirect('/dashboard');
        } else {
            res.send('Invalid email or password');
        }
    } catch (err) {
        res.status(500).send('Login error');
    }
});

app.get('/register', (req, res) => {
    res.render('register', { title: 'Register | Eco-Pulse' });
});

app.post('/register', async (req, res) => {
    const { username, email, password, address_rt } = req.body;
    try {
        await db.query('INSERT INTO users (username, email, password, address_rt) VALUES (?, ?, ?, ?)', [username, email, password, address_rt]);
        res.redirect('/login');
    } catch (err) {
        res.status(500).send('Registration error');
    }
});

app.get('/waste/track', isAuthenticated, (req, res) => {
    res.render('waste_track', { title: 'Track Waste | Eco-Pulse' });
});

app.post('/waste/track', isAuthenticated, async (req, res) => {
    const { waste_type, weight, photo_url } = req.body;
    const points = Math.floor(weight * 20); // 20 points per kg
    try {
        await db.query('INSERT INTO waste_logs (user_id, waste_type, weight, photo_url, points_earned) VALUES (?, ?, ?, ?, ?)', 
            [req.session.user.id, waste_type, weight, photo_url, points]);
        await db.query('UPDATE users SET total_points = total_points + ? WHERE id = ?', [points, req.session.user.id]);
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send('Error logging waste');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Eco-Pulse server is running on http://localhost:${PORT}`);
});
