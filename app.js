const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const prisma = require('./src/utils/prisma');

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
        const user = await prisma.users.findUnique({
            where: { id: req.session.user.id }
        });

        const logs = await prisma.waste_logs.findMany({
            where: { user_id: req.session.user.id },
            orderBy: { created_at: 'desc' },
            take: 5
        });

        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        // Map address fields for view
        user.rt = user.address_rt;
        user.rw = user.address_rw;

        res.render('dashboard', { 
            title: 'Dashboard | Eco-Pulse',
            user: user,
            logs: logs || []
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

app.get('/rewards', (req, res) => {
    res.render('rewards', { title: 'Rewards | Eco-Pulse' });
});

app.get('/login', (req, res) => {
    res.render('login', { title: 'Login | Eco-Pulse' });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.users.findFirst({
            where: { email, password }
        });

        if (user) {
            // Map address fields
            user.rt = user.address_rt;
            user.rw = user.address_rw;
            req.session.user = user;
            req.flash('success_msg', 'Successfully logged in!');
            res.redirect('/dashboard');
        } else {
            req.flash('error_msg', 'Invalid email or password');
            res.redirect('/login');
        }
    } catch (err) {
        console.error('Login Error:', err);
        req.flash('error_msg', 'Login system error');
        res.redirect('/login');
    }
});

app.get('/register', (req, res) => {
    res.render('register', { title: 'Register | Eco-Pulse' });
});

app.post('/register', async (req, res) => {
    const { username, email, password, rt, rw, role } = req.body;
    try {
        await prisma.users.create({
            data: {
                username,
                email,
                password,
                address_rt: rt,
                address_rw: rw,
                role: role || 'citizen'
            }
        });

        req.flash('success_msg', 'Registration successful! Please login.');
        res.redirect('/login');
    } catch (err) {
        console.error('Registration Error:', err);
        req.flash('error_msg', 'Registration failed: ' + err.message);
        res.redirect('/register');
    }
});

app.get('/waste/track', isAuthenticated, (req, res) => {
    res.render('waste_track', { title: 'Track Waste | Eco-Pulse' });
});

app.post('/waste/track', isAuthenticated, upload.single('photo'), async (req, res) => {
    const { waste_type, weight } = req.body;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;
    const points = Math.floor(parseFloat(weight) * 20); // 20 points per kg
    try {
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
    const { status } = req.body;
    try {
        await prisma.waste_logs.update({
            where: { id: parseInt(req.params.id) },
            data: { status: status }
        });

        req.flash('success_msg', `Waste log marked as ${status}.`);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Verify Error:', err);
        req.flash('error_msg', 'Failed to update status');
        res.redirect('/admin/dashboard');
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
