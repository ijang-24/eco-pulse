const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const db = require('./src/models/db');
const { hashPassword, verifyHashedPassword, isPasswordHashed } = require('./src/models/password');

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ROLES = new Set(['citizen', 'admin']);

const createSessionUser = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    rt: user.rt,
    rw: user.rw
});

const normalizeText = (value) => typeof value === 'string' ? value.trim() : '';

const parseEntityId = (value) => {
    const id = Number.parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const getDbErrorMessage = (err, fallbackMessage) => {
    if (err && err.code === 'ER_DUP_ENTRY') {
        return 'Email sudah terdaftar. Gunakan email lain atau login.';
    }

    return fallbackMessage;
};

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'eco-pulse-secret',
    resave: false,
    saveUninitialized: true
}));
app.use(flash());

// Global user variable for templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.isAdminArea = req.path.startsWith('/admin');
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
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
    req.flash('error_msg', 'Please login first');
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error_msg', 'Access Denied: Admin Only');
    res.redirect('/');
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
        const [pointsRows] = await db.query(
            'SELECT COALESCE(SUM(points_earned), 0) AS total_points FROM waste_logs WHERE user_id = ? AND status = "verified"',
            [req.session.user.id]
        );

        const totalPoints = pointsRows[0]?.total_points || 0;

        if (user[0] && Number(user[0].total_points || 0) !== Number(totalPoints)) {
            await db.query('UPDATE users SET total_points = ? WHERE id = ?', [totalPoints, req.session.user.id]);
        }

        if (user[0]) {
            user[0].total_points = totalPoints;
        }

        res.render('dashboard', { 
            title: 'Dashboard | Eco-Pulse',
            user: user,
            logs: logs || [],
            impact: {
                co2: totalCO2.toFixed(2),
                trees: totalTrees.toFixed(3)
            }
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        req.flash('error_msg', 'Server error while loading dashboard');
        res.redirect('/');
    }
});

app.get('/leaderboard', (req, res) => {
    res.render('leaderboard', { title: 'Leaderboard | Eco-Pulse' });
});

app.get('/rewards', isAuthenticated, async (req, res) => {
    try {
        const rewards = await prisma.rewards.findMany({
            where: { stock: { gt: 0 } }
        });
        res.render('rewards', { title: 'Rewards | Eco-Pulse', rewards });
    } catch (err) {
        console.error('Rewards Error:', err);
        res.redirect('/dashboard');
    }
});

app.post('/rewards/redeem/:id', isAuthenticated, async (req, res) => {
    try {
        const rewardId = parseInt(req.params.id);
        const userId = req.session.user.id;

        await prisma.$transaction(async (tx) => {
            const user = await tx.users.findUnique({ where: { id: userId } });
            const reward = await tx.rewards.findUnique({ where: { id: rewardId } });

            if (!reward || reward.stock <= 0) throw new Error('Reward out of stock');
            if (user.total_points < reward.points_cost) throw new Error('Insufficient points');

            await tx.redemptions.create({
                data: { user_id: userId, reward_id: rewardId, status: 'completed' }
            });

            await tx.users.update({
                where: { id: userId },
                data: { total_points: { decrement: reward.points_cost } }
            });

            await tx.rewards.update({
                where: { id: rewardId },
                data: { stock: { decrement: 1 } }
            });
        });

        req.flash('success_msg', 'Reward redeemed successfully!');
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Redeem Error:', err);
        req.flash('error_msg', err.message);
        res.redirect('/rewards');
    }
});

app.get('/login', (req, res) => {
    res.render('login', { title: 'Login | Eco-Pulse' });
});

app.post('/login', async (req, res) => {
    const email = normalizeText(req.body.email).toLowerCase();
    const password = req.body.password || '';

    if (!email || !password) {
        req.flash('error_msg', 'Email dan password wajib diisi.');
        return res.redirect('/login');
    }

    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
        const user = users[0];

        if (!user) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/login');
        }

        let passwordMatches = false;

        if (isPasswordHashed(user.password)) {
            passwordMatches = await verifyHashedPassword(password, user.password);
        } else if (user.password === password) {
            passwordMatches = true;

            const hashedPassword = await hashPassword(password);
            await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
            user.password = hashedPassword;
        }

        if (!passwordMatches) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/login');
        }

        req.session.user = createSessionUser(user);
        req.flash('success_msg', 'Successfully logged in!');
        res.redirect(user.role === 'admin' ? '/admin/dashboard' : '/dashboard');
    } catch (err) {
        console.error('Login Error:', err);
        req.flash('error_msg', getDbErrorMessage(err, 'Login system error'));
        res.redirect('/login');
    }
});

app.get('/register', (req, res) => {
    res.render('register', { title: 'Register | Eco-Pulse' });
});

app.post('/register', async (req, res) => {
    const username = normalizeText(req.body.username);
    const email = normalizeText(req.body.email).toLowerCase();
    const password = req.body.password || '';
    const rt = normalizeText(req.body.rt);
    const rw = normalizeText(req.body.rw);
    const role = ALLOWED_ROLES.has(req.body.role) ? req.body.role : 'citizen';

    if (!username || !email || !password || !rt || !rw) {
        req.flash('error_msg', 'Semua field wajib diisi.');
        return res.redirect('/register');
    }

    try {
        const hashedPassword = await hashPassword(password);
        await db.query(
            'INSERT INTO users (username, email, password, rt, rw, role) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, rt, rw, role]
        );
        req.flash('success_msg', 'Registration successful! Please login.');
        res.redirect('/login');
    } catch (err) {
        console.error('Registration Error:', err);
        req.flash('error_msg', getDbErrorMessage(err, 'Registration failed. Please try again.'));
        res.redirect('/register');
    }
});

app.get('/waste/track', isAuthenticated, (req, res) => {
    res.render('waste_track', { title: 'Track Waste | Eco-Pulse' });
});

app.post('/waste/track', isAuthenticated, upload.single('photo'), async (req, res) => {
    const { waste_type, weight } = req.body;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    try {
        const config = await prisma.point_configs.findUnique({
            where: { waste_type }
        });

        if (!config) throw new Error('Invalid waste type');

        const points = Math.floor(parseFloat(weight) * config.points_per_kg);

        await prisma.$transaction(async (tx) => {
            await tx.waste_logs.create({
                data: {
                    user_id: req.session.user.id,
                    waste_type,
                    weight: parseFloat(weight),
                    photo_url,
                    points_earned: points
                }
            });

            await tx.users.update({
                where: { id: req.session.user.id },
                data: {
                    total_points: {
                        increment: points
                    }
                }
            });
        });

        req.flash('success_msg', `Waste logged successfully! You earned ${points} points.`);
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Waste Tracking Error:', err);
        req.flash('error_msg', 'Failed to log waste: ' + err.message);
        res.redirect('/waste/track');
    }
});

// Admin Routes
app.get('/admin/dashboard', isAdmin, async (req, res) => {
    try {
        const logs = await prisma.waste_logs.findMany({
            include: {
                user: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        // Flatten logs for EJS compatibility
        const flattenedLogs = logs.map(log => ({
            ...log,
            username: log.user.username,
            rt: log.user.address_rt,
            rw: log.user.address_rw
        }));

        res.render('admin_dashboard', { title: 'Admin Panel | Eco-Pulse', logs: flattenedLogs });
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        req.flash('error_msg', 'Failed to load admin panel');
        res.redirect('/dashboard');
    }
});

app.post('/admin/verify/:id', isAdmin, async (req, res) => {
    const logId = parseEntityId(req.params.id);
    const status = normalizeText(req.body.status);

    if (!logId) {
        req.flash('error_msg', 'ID log tidak valid.');
        return res.redirect('/admin/dashboard');
    }

    if (!['verified', 'rejected'].includes(status)) {
        req.flash('error_msg', 'Status verifikasi tidak valid.');
        return res.redirect('/admin/dashboard');
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT id, user_id, status, points_earned FROM waste_logs WHERE id = ? FOR UPDATE',
            [logId]
        );

        const log = rows[0];

        if (!log) {
            await connection.rollback();
            req.flash('error_msg', 'Log tidak ditemukan.');
            return res.redirect('/admin/dashboard');
        }

        let pointsDelta = 0;
        if (log.status !== 'verified' && status === 'verified') {
            pointsDelta = log.points_earned;
        } else if (log.status === 'verified' && status === 'rejected') {
            pointsDelta = -log.points_earned;
        } else if (log.status === 'rejected' && status === 'verified') {
            pointsDelta = log.points_earned;
        }

        await connection.query('UPDATE waste_logs SET status = ? WHERE id = ?', [status, logId]);

        if (pointsDelta !== 0) {
            await connection.query(
                'UPDATE users SET total_points = GREATEST(total_points + ?, 0) WHERE id = ?',
                [pointsDelta, log.user_id]
            );
        }

        await connection.commit();
        req.flash('success_msg', `Waste log marked as ${status}.`);
        res.redirect('/admin/dashboard');
    } catch (err) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Verify Error:', err);
        req.flash('error_msg', 'Failed to update status');
        res.redirect('/admin/dashboard');
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.post('/admin/delete/:id', isAdmin, async (req, res) => {
    try {
        await prisma.waste_logs.delete({
            where: { id: parseInt(req.params.id) }
        });

        req.flash('success_msg', 'Waste log deleted successfully.');
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Delete Error:', err);
        req.flash('error_msg', 'Failed to delete log');
        res.redirect('/admin/dashboard');
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
