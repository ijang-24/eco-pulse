const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const prisma = require('./src/utils/prisma');
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
        const user = await prisma.users.findUnique({
            where: { id: req.session.user.id }
        });

        const logs = await prisma.waste_logs.findMany({
            where: { user_id: req.session.user.id },
            orderBy: { created_at: 'desc' },
            take: 5
        });

        const aggregatePoints = await prisma.waste_logs.aggregate({
            where: { 
                user_id: req.session.user.id,
                status: 'verified'
            },
            _sum: {
                points_earned: true
            }
        });

        const totalPoints = aggregatePoints._sum.points_earned || 0;

        if (user && Number(user.total_points || 0) !== Number(totalPoints)) {
            await prisma.users.update({
                where: { id: req.session.user.id },
                data: { total_points: totalPoints }
            });
            user.total_points = totalPoints;
        }

        // Calculate impact based on logs (mock logic if point_configs not joined)
        let totalCO2 = 0;
        let totalTrees = 0;
        // Ideally we join with point_configs, but for now we'll use 0 or fetch configs
        
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

app.get('/leaderboard', async (req, res) => {
    try {
        // Group by RT/RW and sum points from users, or aggregate waste_logs
        // Using Prisma aggregate/groupBy for waste_logs to get real participation
        const leaderboardData = await prisma.waste_logs.groupBy({
            by: ['user_id'],
            where: { status: 'verified' },
            _sum: {
                points_earned: true,
                weight: true
            }
        });

        // Map logs to users to get RT/RW info
        const users = await prisma.users.findMany({
            where: {
                id: { in: leaderboardData.map(d => d.user_id).filter(id => id !== null) }
            },
            select: {
                id: true,
                address_rt: true,
                address_rw: true
            }
        });

        // Aggregate by RT/RW
        const rtRwGroups = {};
        leaderboardData.forEach(data => {
            const user = users.find(u => u.id === data.user_id);
            if (user) {
                const key = `RT ${user.address_rt} / RW ${user.address_rw}`;
                if (!rtRwGroups[key]) {
                    rtRwGroups[key] = { rt_rw: key, total_points: 0, total_weight: 0 };
                }
                rtRwGroups[key].total_points += data._sum.points_earned || 0;
                rtRwGroups[key].total_weight += Number(data._sum.weight || 0);
            }
        });

        const sortedLeaderboard = Object.values(rtRwGroups)
            .sort((a, b) => b.total_points - a.total_points);

        res.render('leaderboard', { 
            title: 'Leaderboard | Eco-Pulse',
            leaderboard: sortedLeaderboard
        });
    } catch (err) {
        console.error('Leaderboard Error:', err);
        res.render('leaderboard', { 
            title: 'Leaderboard | Eco-Pulse',
            leaderboard: [] 
        });
    }
});

app.get('/rewards', isAuthenticated, async (req, res) => {
    try {
        const user = await prisma.users.findUnique({
            where: { id: req.session.user.id }
        });
        const rewards = await prisma.rewards.findMany({
            where: { stock: { gt: 0 } }
        });
        res.render('rewards', { title: 'Rewards | Eco-Pulse', rewards, user });
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
        const user = await prisma.users.findUnique({
            where: { email: email }
        });

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
            await prisma.users.update({
                where: { id: user.id },
                data: { password: hashedPassword }
            });
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
        await prisma.users.create({
            data: {
                username,
                email,
                password: hashedPassword,
                address_rt: rt,
                address_rw: rw,
                role
            }
        });
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

app.post("/waste/track", isAuthenticated, upload.single("photo"), async (req, res) => {
    const { waste_type, weight } = req.body;
    const parsedWeight = parseFloat(weight);
    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
        req.flash("error_msg", "Berat sampah tidak valid.");
        return res.redirect("/waste/track");
    }

    try {
        const config = await prisma.point_configs.findUnique({
            where: { waste_type }
        });

        if (!config) throw new Error('Invalid waste type');

        const points = Math.floor(parsedWeight * config.points_per_kg);

        await prisma.$transaction(async (tx) => {
            await tx.waste_logs.create({
                data: {
                    user_id: req.session.user.id,
                    waste_type,
                    weight: parsedWeight,
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
app.get("/admin/dashboard", isAdmin, async (req, res) => {
    try {
        const [userCount, totalWaste, totalPoints, logs] = await Promise.all([
            prisma.users.count({ where: { role: "citizen" } }),
            prisma.waste_logs.aggregate({ _sum: { weight: true }, where: { status: "verified" } }),
            prisma.users.aggregate({ _sum: { total_points: true } }),
            prisma.waste_logs.findMany({
                include: { user: true },
                orderBy: { created_at: "desc" }
            })
        ]);

        const flattenedLogs = logs.map(log => ({
            ...log,
            username: log.user?.username || "Unknown",
            rt: log.user?.address_rt || "-",
            rw: log.user?.address_rw || "-"
        }));

        res.render("admin_dashboard", {
            title: "Admin Panel | Eco-Pulse",
            stats: {
                users: userCount,
                waste: totalWaste._sum.weight || 0,
                points: totalPoints._sum.total_points || 0
            },
            logs: flattenedLogs,
            isAdminArea: true
        });
    } catch (err) {
        console.error("Admin Dashboard Error:", err);
        req.flash("error_msg", "Gagal memuat dashboard admin.");
        res.redirect("/dashboard");
    }
});

app.post('/admin/verify/:id', isAdmin, async (req, res) => {
    const logId = parseEntityId(req.params.id);
    const status = normalizeText(req.body.status);

    try {
        await prisma.$transaction(async (tx) => {
            const log = await tx.waste_logs.findUnique({
                where: { id: logId }
            });

            if (!log) {
                throw new Error("Log tidak ditemukan.");
            }

            if (log.status === status) return;

            let pointsDelta = 0;
            if (log.status !== "verified" && status === "verified") {
                pointsDelta = log.points_earned;
            } else if (log.status === "verified" && status === "rejected") {
                pointsDelta = -log.points_earned;
            }
            await tx.waste_logs.update({
                where: { id: logId },
                data: { status }
            });
            if (pointsDelta !== 0) {
                await tx.users.update({
                    where: { id: log.user_id },
                    data: {
                        total_points: {
                            increment: pointsDelta
                        }
                    }
                });
            }
        }, {
            maxWait: 5000,
            timeout: 10000
        });

        req.flash("success_msg", `Waste log marked as ${status}.`);
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Verify Error:", err);
        req.flash("error_msg", "Failed to update status: " + err.message);
        res.redirect("/admin/dashboard");
    }
});

app.get("/admin/rewards", isAdmin, async (req, res) => {
    try {
        const rewards = await prisma.rewards.findMany();
        res.render("admin_rewards", { title: "Kelola Reward | Eco-Pulse", rewards, isAdminArea: true });
    } catch (err) {
        console.error("Admin Rewards Error:", err);
        res.redirect("/admin/dashboard");
    }
});

app.post("/admin/rewards/add", isAdmin, async (req, res) => {
    const { title, description, points_cost, stock, image_url } = req.body;
    try {
        await prisma.rewards.create({
            data: {
                title,
                description,
                points_cost: parseInt(points_cost),
                stock: parseInt(stock),
                image_url
            }
        });
        req.flash("success_msg", "Reward berhasil ditambahkan!");
        res.redirect("/admin/rewards");
    } catch (err) {
        console.error("Add Reward Error:", err);
        req.flash("error_msg", "Gagal menambah reward.");
        res.redirect("/admin/rewards");
    }
});

app.post("/admin/rewards/delete/:id", isAdmin, async (req, res) => {
    try {
        await prisma.rewards.delete({
            where: { id: parseInt(req.params.id) }
        });
        req.flash("success_msg", "Reward berhasil dihapus!");
        res.redirect("/admin/rewards");
    } catch (err) {
        console.error("Delete Reward Error:", err);
        req.flash("error_msg", "Gagal menghapus reward.");
        res.redirect("/admin/rewards");
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
// Optimized with RTK for Supabase Live Leaderboard
