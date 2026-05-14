// Polyfill for deprecated util.isArray - MUST be first before any other require
const util = require('util');
if (!util.isArray) {
  util.isArray = Array.isArray;
}
// Suppress the deprecation warning
process.noDeprecation = true;

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const multer = require('multer');
const prisma = require('./src/utils/prisma');
const { hashPassword, verifyHashedPassword, isPasswordHashed } = require('./src/models/password');

const fs = require('fs');

// Multer Config optimized for Vercel/Production
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.VERCEL ? '/tmp' : 'public/uploads';
        if (!fs.existsSync(uploadDir) && !process.env.VERCEL) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
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
    rt: user.address_rt,
    rw: user.address_rw
});

const normalizeText = (value) => typeof value === 'string' ? value.trim() : '';

const parseEntityId = (value) => {
    const id = Number.parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const getDbErrorMessage = (err, fallbackMessage) => {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.code === 'P2002')) {
        return 'Email sudah terdaftar. Gunakan email lain atau login.';
    }

    return fallbackMessage;
};

const normalizeRtRw = (value) => {
    if (!value) return '-';
    // Remove leading zeros and non-numeric chars, then ensure it's a string
    const normalized = value.toString().trim().replace(/^0+/, '');
    return normalized === '' ? '0' : normalized;
};

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    store: new pgSession({
        conString: process.env.DATABASE_URL
    }),
    secret: 'eco-pulse-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));
app.use(flash());

// Global user variable & notifications for templates
// Track if notifications table is missing so we only warn once
let notificationsTableMissing = false;

app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.isAdminArea = req.path.startsWith('/admin');
    res.locals.isLandingPage = req.path === '/';
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.notifications = [];
    res.locals.unreadCount = 0;

    // Fetch unread notifications if user is logged in and table exists
    if (req.session.user && !notificationsTableMissing) {
        try {
            res.locals.notifications = await prisma.notifications.findMany({
                where: { 
                    user_id: req.session.user.id,
                    is_read: false
                },
                orderBy: { created_at: 'desc' },
                take: 5
            });
            res.locals.unreadCount = await prisma.notifications.count({
                where: { 
                    user_id: req.session.user.id,
                    is_read: false
                }
            });
        } catch (err) {
            // P2021 = table not found — silently disable until DB is migrated
            if (err.code === 'P2021') {
                notificationsTableMissing = true;
                console.warn('[Eco-Pulse] Notifications table not found in DB. Run manual_migration.sql in Supabase to enable notifications.');
            } else {
                console.error('Notification Fetch Error:', err.message);
            }
        }
    }
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

// Notification Routes
app.post('/notifications/read-all', isAuthenticated, async (req, res) => {
    try {
        await prisma.notifications.updateMany({
            where: { user_id: req.session.user.id, is_read: false },
            data: { is_read: true }
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Notification Error:', err);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// View all notifications page
app.get('/notifications', isAuthenticated, async (req, res) => {
    try {
        const notifications = await prisma.notifications.findMany({
            where: { user_id: req.session.user.id },
            orderBy: { created_at: 'desc' },
            take: 50
        });

        res.render('notifications', {
            title: 'Notifications | Eco-Pulse',
            notifications,
            isAdminArea: req.session.user.role === 'admin'
        });
    } catch (err) {
        console.error('Notifications Page Error:', err);
        res.redirect('/dashboard');
    }
});

// Routes
app.get('/', async (req, res) => {
    try {
        const userCount = await prisma.users.count({ where: { role: 'citizen' } });
        res.render('index', { 
            title: 'Eco-Pulse | Community Eco-Monitoring',
            userCount: userCount || 0
        });
    } catch (err) {
        console.error('Home Error:', err);
        res.render('index', { 
            title: 'Eco-Pulse | Community Eco-Monitoring',
            userCount: 0
        });
    }
});

// AI Config
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Note: The SDK handles versioning, but we can ensure the model name is correct.
const visionModel = genAI.getGenerativeModel({ 
    model: "gemini-flash-latest",
    generationConfig: {
        temperature: 0.1,
        topK: 32,
        topP: 1,
        maxOutputTokens: 1024,
    }
}, { apiVersion: 'v1beta' });

app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userRole = req.session.user.role;

        // Redirect admin to admin dashboard if they try to access citizen dashboard
        if (userRole === 'admin') {
            return res.redirect('/admin/dashboard');
        }

        // Parallelize initial queries
        const [user, logs, aggregateEarned, redemptions, configs, verifiedLogsWithItems] = await Promise.all([
            prisma.users.findUnique({ where: { id: userId } }),
            prisma.waste_logs.findMany({
                where: { user_id: userId },
                include: { items: true },
                orderBy: { created_at: 'desc' },
                take: 5
            }),
            prisma.waste_logs.aggregate({
                where: { user_id: userId, status: 'verified' },
                _sum: { total_points: true, total_weight: true }
            }),
            prisma.redemptions.findMany({
                where: { user_id: userId },
                include: { reward: true }
            }),
            prisma.point_configs.findMany(),
            prisma.waste_logs.findMany({
                where: { user_id: userId, status: 'verified' },
                include: { items: true }
            })
        ]);

        const totalEarned = aggregateEarned._sum.total_points || 0;
        const totalSpent = redemptions.reduce((sum, r) => sum + r.reward.points_cost, 0);
        
        // --- Level System ---
        const points = user.total_points || 0;
        let level = { name: 'Seed', icon: '🌱', nextLimit: 100 };
        
        if (points >= 5000) level = { name: 'Forest Guardian', icon: '🌳', nextLimit: null };
        else if (points >= 1500) level = { name: 'Tree', icon: '🌲', nextLimit: 5000 };
        else if (points >= 500) level = { name: 'Sapling', icon: '🌿', nextLimit: 1500 };
        else if (points >= 100) level = { name: 'Sprout', icon: '🎍', nextLimit: 500 };

        const prevLimit = points >= 5000 ? 5000 : (points >= 1500 ? 1500 : (points >= 500 ? 500 : (points >= 100 ? 100 : 0)));
        const progress = level.nextLimit ? ((points - prevLimit) / (level.nextLimit - prevLimit)) * 100 : 100;

        // --- Chart Data (Show all logs so it's not empty) ---
        const chartLogs = await prisma.waste_logs.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'asc' },
            take: 15
        });

        const chartData = {
            labels: chartLogs.map(log => new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })),
            values: chartLogs.map(log => Number(log.total_weight))
        };

        let totalCO2 = 0;
        let totalTrees = 0;

        verifiedLogsWithItems.forEach(log => {
            log.items.forEach(item => {
                const config = configs.find(c => c.waste_type === item.waste_type);
                if (config) {
                    totalCO2 += Number(item.weight) * Number(config.co2_factor);
                    totalTrees += Number(item.weight) * Number(config.tree_factor);
                }
            });
        });

        const totalWeightFromLogs = Number(aggregateEarned._sum.total_weight || 0);
        
        // --- Legacy Fallback for Cards ---
        // If logs have 0 weight but user has points (legacy data), estimate impact
        let displayWeight = totalWeightFromLogs;
        let displayCO2 = totalCO2;
        let displayTrees = totalTrees;

        if (totalWeightFromLogs === 0 && (user.total_points || 0) > 0) {
            displayWeight = user.total_points / 10;
            displayCO2 = displayWeight * 0.5; // Default factor
            displayTrees = displayWeight * 0.01; // Default factor
        }

        const impact = {
            co2: displayCO2.toFixed(2),
            trees: displayTrees.toFixed(3),
            energySaved: (Number(displayWeight) * 1.5).toFixed(1),
            waterSaved: (Number(displayWeight) * 10).toFixed(0)
        };

        // --- Waste Category Breakdown ---
        const breakdownDataRaw = await prisma.waste_items.groupBy({
            by: ['waste_type'],
            where: {
                log: {
                    user_id: userId
                }
            },
            _sum: {
                weight: true
            }
        });

        // --- Community Goal ---
        const communityStats = await prisma.waste_logs.aggregate({
            where: {
                user: {
                    address_rt: user.address_rt,
                    address_rw: user.address_rw
                },
                status: 'verified'
            },
            _sum: {
                total_weight: true
            }
        });

        const communityTotal = Number(communityStats._sum.total_weight || 0);
        const communityTarget = 500;
        const communityProgress = Math.min(100, (communityTotal / communityTarget) * 100);
        
        res.render('dashboard', { 
            title: 'Dashboard | Eco-Pulse',
            user: user,
            logs: logs || [],
            impact: impact,
            level: {
                ...level,
                progress: Math.min(100, Math.max(0, progress))
            },
            chartData,
            breakdownData: {
                labels: breakdownDataRaw.map(d => d.waste_type),
                values: breakdownDataRaw.map(d => Number(d._sum.weight || 0))
            },
            community: {
                rt: user.address_rt,
                rw: user.address_rw,
                total: communityTotal.toFixed(1),
                target: communityTarget,
                progress: communityProgress.toFixed(1)
            }
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        req.flash('error_msg', 'Server error while loading dashboard');
        res.redirect('/');
    }
});

app.get('/dashboard/certificate', isAuthenticated, async (req, res) => {
    try {
        const user = await prisma.users.findUnique({
            where: { id: req.session.user.id }
        });

        if (user.total_points < 100) {
            req.flash('error_msg', 'Anda butuh minimal 100 poin untuk mendapatkan sertifikat.');
            return res.redirect('/dashboard');
        }

        const aggregate = await prisma.waste_logs.aggregate({
            where: { user_id: user.id, status: 'verified' },
            _sum: { total_weight: true }
        });

        const totalWeight = Number(aggregate._sum.total_weight || 0);
        
        res.render('certificate', { 
            title: 'Eco-Certificate | Eco-Pulse',
            user,
            totalWeight: totalWeight.toFixed(1),
            date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
            impact: {
                co2: (totalWeight * 0.5).toFixed(1),
                trees: (totalWeight * 0.01).toFixed(3)
            },
            layout: false 
        });
    } catch (err) {
        console.error('Certificate Error:', err);
        res.redirect('/dashboard');
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        const [leaderboardData, totalCommunityWeight] = await Promise.all([
            prisma.waste_logs.groupBy({
                by: ['user_id'],
                where: { status: 'verified' },
                _sum: {
                    total_points: true,
                    total_weight: true
                }
            }),
            prisma.waste_logs.aggregate({
                where: { status: 'verified' },
                _sum: { total_weight: true }
            })
        ]);

        const users = await prisma.users.findMany({
            where: {
                id: { in: leaderboardData.map(d => d.user_id).filter(id => id !== null) }
            }
        });

        const rtRwGroups = {};
        leaderboardData.forEach(data => {
            const user = users.find(u => u.id === data.user_id);
            if (user) {
                const rt = normalizeRtRw(user.address_rt);
                const rw = normalizeRtRw(user.address_rw);
                const key = `RT ${rt} / RW ${rw}`;
                if (!rtRwGroups[key]) {
                    rtRwGroups[key] = { rt_rw: key, total_points: 0, total_weight: 0 };
                }
                rtRwGroups[key].total_points += data._sum.total_points || 0;
                rtRwGroups[key].total_weight += Number(data._sum.total_weight || 0);
            }
        });

        const sortedLeaderboard = Object.values(rtRwGroups)
            .sort((a, b) => b.total_points - a.total_points);

        res.render('leaderboard', { 
            title: 'Leaderboard | Eco-Pulse',
            leaderboard: sortedLeaderboard,
            communityGoal: {
                current: Number(totalCommunityWeight._sum.total_weight || 0),
                target: 500
            }
        });
    } catch (err) {
        console.error('Leaderboard Error:', err);
        res.redirect('/');
    }
});

app.get('/rewards', isAuthenticated, async (req, res) => {
    try {
        const rewards = await prisma.rewards.findMany();
        const user = await prisma.users.findUnique({
            where: { id: req.session.user.id }
        });
        res.render('rewards', { title: 'Rewards | Eco-Pulse', rewards, user });
    } catch (err) {
        console.error('Rewards Error:', err);
        res.redirect('/dashboard');
    }
});

app.get('/my-vouchers', isAuthenticated, async (req, res) => {
    try {
        const redemptions = await prisma.redemptions.findMany({
            where: { user_id: req.session.user.id },
            include: { reward: true },
            orderBy: { redeemed_at: 'desc' }
        });
        res.render('my_vouchers', { title: 'My Vouchers | Eco-Pulse', redemptions });
    } catch (err) {
        console.error('Vouchers Error:', err);
        res.redirect('/dashboard');
    }
});

app.post('/rewards/redeem/:id', isAuthenticated, async (req, res) => {
    const rewardId = parseEntityId(req.params.id);
    
    try {
        await prisma.$transaction(async (tx) => {
            const reward = await tx.rewards.findUnique({ where: { id: rewardId } });
            const user = await tx.users.findUnique({ where: { id: req.session.user.id } });

            if (!reward || reward.stock <= 0) throw new Error('Reward out of stock');
            if (user.total_points < reward.points_cost) throw new Error('Insufficient points');

            const voucherCode = 'ECO-' + Math.random().toString(36).substring(2, 8).toUpperCase();

            await tx.redemptions.create({
                data: {
                    user_id: user.id,
                    reward_id: reward.id,
                    voucher_code: voucherCode,
                    status: 'active'
                }
            });

            await tx.rewards.update({
                where: { id: rewardId },
                data: { stock: { decrement: 1 } }
            });

            await tx.users.update({
                where: { id: user.id },
                data: { total_points: { decrement: reward.points_cost } }
            });

            // Notify admin about reward redemption
            const admins = await tx.users.findMany({ where: { role: 'admin' } });
            for (const admin of admins) {
                await tx.notifications.create({
                    data: {
                        user_id: admin.id,
                        title: 'Reward Redeemed! 🎁',
                        message: `${user.username} baru saja menukar ${reward.points_cost} poin dengan ${reward.title}.`,
                        type: 'reward_redemption'
                    }
                });
            }
        });

        req.flash('success_msg', 'Reward redeemed successfully!');
        res.redirect('/my-vouchers');
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
    const password = req.body.password;

    try {
        const user = await prisma.users.findUnique({ where: { email } });
        if (!user) throw new Error('Invalid email or password');

        const valid = await verifyHashedPassword(password, user.password);
        if (!valid) throw new Error('Invalid email or password');

        req.session.user = createSessionUser(user);
        res.redirect('/dashboard');
    } catch (err) {
        req.flash('error_msg', err.message);
        res.redirect('/login');
    }
});

app.get('/register', (req, res) => {
    res.render('register', { title: 'Register | Eco-Pulse' });
});

app.post('/register', upload.single('kk_photo'), async (req, res) => {
    const username = normalizeText(req.body.username);
    const email = normalizeText(req.body.email).toLowerCase();
    const password = req.body.password || '';
    const nik = normalizeText(req.body.nik);
    const kk_number = normalizeText(req.body.kk_number);
    const rt = normalizeText(req.body.rt);
    const rw = normalizeText(req.body.rw);
    const role = ALLOWED_ROLES.has(req.body.role) ? req.body.role : 'citizen';
    const kk_photo_url = req.file ? (process.env.VERCEL ? null : `/uploads/${req.file.filename}`) : null;

    if (!username || !email || !password || !nik || !kk_number || !rt || !rw || !req.file) {
        req.flash('error_msg', 'Semua field wajib diisi, termasuk foto KK.');
        return res.redirect('/register');
    }

    try {
        const hashedPassword = await hashPassword(password);
        await prisma.users.create({
            data: {
                username,
                email,
                password: hashedPassword,
                nik,
                kk_number,
                kk_photo_url,
                address_rt: normalizeRtRw(rt),
                address_rw: normalizeRtRw(rw),
                role
            }
        });
        req.flash('success_msg', 'Registration successful! Please login.');
        res.redirect('/login');
    } catch (err) {
        if (err.code === 'P2002') {
            const target = err.meta?.target || [];
            if (target.includes('email')) {
                req.flash('error_msg', 'Email sudah terdaftar.');
            } else if (target.includes('nik')) {
                req.flash('error_msg', 'NIK sudah terdaftar.');
            } else {
                req.flash('error_msg', 'Data sudah terdaftar.');
            }
        } else {
            console.error('Registration Error:', err);
            req.flash('error_msg', 'Pendaftaran gagal. Silakan coba lagi.');
        }
        res.redirect('/register');
    }
});

app.get('/waste/logs', isAuthenticated, async (req, res) => {
    try {
        const logs = await prisma.waste_logs.findMany({
            where: { user_id: req.session.user.id },
            include: { items: true },
            orderBy: { created_at: 'desc' }
        });
        res.render('waste_logs', { title: 'Riwayat Sampah | Eco-Pulse', logs });
    } catch (err) {
        console.error('Waste Logs Error:', err);
        req.flash('error_msg', 'Gagal memuat riwayat sampah.');
        res.redirect('/dashboard');
    }
});

app.get('/waste/track', isAuthenticated, (req, res) => {
    res.render('waste_track', { title: 'Track Waste | Eco-Pulse' });
});

// Helper for AI Image processing
function fileToGenerativePart(path, mimeType) {
    const fs = require('fs');
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(path)).toString("base64"),
            mimeType,
        },
    };
}

// --- AI Analysis API (Pre-submission) ---
app.post("/api/ai/analyze", isAuthenticated, upload.single("photo"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No photo uploaded" });

    try {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("GEMINI_API_KEY not found in environment variables.");
            return res.json({ results: [{ type: 'organic', percentage: 100 }] });
        }

        const prompt = `Expert Waste Management System: Analyze this image with high precision.
        Your task is to identify and categorize all visible waste items.
        Categories available: 
        - 'plastic' (bottles, containers, wraps)
        - 'paper' (cardboard, newspaper, office paper)
        - 'metal' (cans, wires, foil)
        - 'glass' (bottles, jars, broken glass)
        - 'organic' (food waste, leaves, wood)
        - 'electronic' (cables, circuit boards, gadgets)
        - 'medical' (masks, gloves, syringes)
        - 'b3' (batteries, chemicals, light bulbs)

        If multiple types are present, distribute the percentage (e.g., 70% plastic, 30% paper).
        Return ONLY a JSON array of objects. 
        Example: [{"type": "plastic", "percentage": 70}, {"type": "paper", "percentage": 30}]
        Ensure the percentage total is 100. Be extremely accurate.`;
        const imagePart = fileToGenerativePart(req.file.path, req.file.mimetype);
        
        console.log(`Starting AI analysis for file: ${req.file.filename}`);
        const result = await visionModel.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text().trim();
        
        console.log("Raw AI Response:", text);

        // Robust Parsing
        let aiResults = [];
        const jsonMatch = text.match(/\[.*\]/s);
        
        if (jsonMatch) {
            try {
                aiResults = JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.error("JSON Parse Error:", e.message);
            }
        }

        // Keyword Fallback (if JSON fails)
        if (aiResults.length === 0) {
            const lowerText = text.toLowerCase();
            if (lowerText.includes('laptop') || lowerText.includes('computer') || lowerText.includes('electronic') || lowerText.includes('phone')) {
                aiResults = [{ type: 'electronic', percentage: 100 }];
            } else if (lowerText.includes('plastic') || lowerText.includes('bottle')) {
                aiResults = [{ type: 'plastic', percentage: 100 }];
            } else if (lowerText.includes('paper') || lowerText.includes('cardboard')) {
                aiResults = [{ type: 'paper', percentage: 100 }];
            } else if (lowerText.includes('metal') || lowerText.includes('can')) {
                aiResults = [{ type: 'metal', percentage: 100 }];
            } else {
                aiResults = [{ type: 'organic', percentage: 100 }];
            }
        }

        console.log("Final AI Results:", JSON.stringify(aiResults));
        res.json({ results: aiResults });
    } catch (err) {
        console.error("AI API Error:", err);
        res.status(500).json({ error: "AI analysis failed: " + err.message });
    }
});

app.post("/waste/track", isAuthenticated, upload.single("photo"), async (req, res) => {
    const { weight, input_mode, manual_waste_type, ai_results_json } = req.body;
    const parsedWeight = parseFloat(weight);
    const photo_url = req.file ? (process.env.VERCEL ? `/tmp/${req.file.filename}` : `/uploads/${req.file.filename}`) : (req.body.existing_photo_url || null);

    if (isNaN(parsedWeight) || parsedWeight <= 0 || (!req.file && !req.body.existing_photo_url)) {
        req.flash("error_msg", "Data tidak valid.");
        return res.redirect("/waste/track");
    }

    try {
        let finalResults = [];

        if (input_mode === 'manual' && manual_waste_type) {
            finalResults = [{ type: manual_waste_type, percentage: 100 }];
        } else if (ai_results_json) {
            // Use the results confirmed/edited by the user
            finalResults = JSON.parse(ai_results_json);
        } else {
            // Fallback for direct submit without pre-analysis
            finalResults = [{ type: 'organic', percentage: 100 }];
        }

        const configs = await prisma.point_configs.findMany();
        let totalPoints = 0;

        const itemsData = finalResults.map(resItem => {
            const config = configs.find(c => c.waste_type === resItem.type) || configs.find(c => c.waste_type === 'organic');
            const itemWeight = (parsedWeight * (resItem.percentage / 100));
            const itemPoints = Math.floor(itemWeight * config.points_per_kg);
            totalPoints += itemPoints;
            return {
                waste_type: config.waste_type,
                weight: itemWeight,
                points_earned: itemPoints
            };
        });

        await prisma.$transaction(async (tx) => {
            const user = await tx.users.findUnique({ where: { id: req.session.user.id } });
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let newStreak = user.current_streak || 0;
            if (user.last_log_date) {
                const lastDate = new Date(user.last_log_date);
                lastDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil(Math.abs(today - lastDate) / (1000 * 60 * 60 * 24));

                if (diffDays === 1) newStreak += 1;
                else if (diffDays > 1) newStreak = 1;
            } else {
                newStreak = 1;
            }

            await tx.waste_logs.create({
                data: {
                    user_id: req.session.user.id,
                    photo_url,
                    total_points: totalPoints,
                    total_weight: parsedWeight,
                    status: 'pending',
                    ai_analysis: finalResults,
                    items: {
                        create: itemsData
                    }
                }
            });

            await tx.users.update({
                where: { id: req.session.user.id },
                data: {
                    total_points: { increment: totalPoints },
                    current_streak: newStreak,
                    last_log_date: new Date()
                }
            });

            // Notify all admins about new waste log
            const admins = await tx.users.findMany({ where: { role: 'admin' } });
            for (const admin of admins) {
                await tx.notifications.create({
                    data: {
                        user_id: admin.id,
                        title: 'Laporan Sampah Baru! 📥',
                        message: `${user.username} baru saja menyetorkan ${parsedWeight}kg sampah. Segera verifikasi!`,
                        type: 'verification_request'
                    }
                });
            }
        });

        req.flash('success_msg', `Berhasil! AI mendeteksi ${finalResults.length} jenis sampah. Total poin: ${totalPoints}`);
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Waste Tracking Error:', err);
        req.flash('error_msg', 'Gagal memproses AI: ' + err.message);
        res.redirect('/waste/track');
    }
});

// Admin Routes
app.get("/admin/dashboard", isAdmin, async (req, res) => {
    try {
        const [userCount, totalWaste, totalPoints, logs] = await Promise.all([
            prisma.users.count({ where: { role: "citizen" } }),
            prisma.waste_logs.aggregate({ _sum: { total_weight: true }, where: { status: "verified" } }),
            prisma.users.aggregate({ _sum: { total_points: true } }),
            prisma.waste_logs.findMany({
                include: { 
                    user: true,
                    items: true,
                    verifier: true
                },
                orderBy: { created_at: "desc" }
            })
        ]);

        const flattenedLogs = logs.map(log => ({
            ...log,
            username: log.user?.username || "Unknown",
            rt: log.user?.address_rt || "-",
            rw: log.user?.address_rw || "-",
            points_earned: log.total_points, 
            weight: log.total_weight,
            verified_by_name: log.verifier?.username || null
        }));

        // Calculate RT/RW Performance
        // Calculate RT/RW Performance (Verified Only for consistency)
        const rtMap = {};
        for (const log of logs) {
            if (log.status !== 'verified') continue;
            const normRt = normalizeRtRw(log.user?.address_rt);
            const normRw = normalizeRtRw(log.user?.address_rw);
            const key = `RT ${normRt} / RW ${normRw}`;
            rtMap[key] = (rtMap[key] || 0) + Number(log.total_weight);
        }
        const rtPerformance = Object.entries(rtMap)
            .map(([label, weight]) => ({ label, weight }))
            .sort((a, b) => b.weight - a.weight);

        // Community Waste Breakdown (Show ALL for complete detection)
        const allItems = await prisma.waste_items.findMany({
            include: { log: true }
        });

        const breakdownMap = {};
        allItems.forEach(item => {
            const type = item.waste_type.trim().toLowerCase();
            // Count occurrences instead of weight for better visibility in UI
            breakdownMap[type] = (breakdownMap[type] || 0) + 1;
        });

        const breakdownData = {
            labels: Object.keys(breakdownMap).map(label => label.charAt(0).toUpperCase() + label.slice(1)),
            values: Object.values(breakdownMap)
        };

        res.render("admin_dashboard", {
            title: "Admin Panel | Eco-Pulse",
            stats: {
                users: userCount,
                waste: totalWaste._sum.total_weight || 0,
                points: totalPoints._sum.total_points || 0
            },
            logs: flattenedLogs,
            rtPerformance,
            breakdownData,
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
    const adminId = req.session.user.id;

    try {
        await prisma.$transaction(async (tx) => {
            const log = await tx.waste_logs.findUnique({
                where: { id: logId }
            });

            if (!log) throw new Error("Log tidak ditemukan.");
            if (log.status !== "pending" && status !== "pending") throw new Error("Log ini sudah diproses.");
            if (log.status === status) return;

            let pointsDelta = 0;
            if (log.status !== "verified" && status === "verified") {
                pointsDelta = log.total_points;
            } else if (log.status === "verified" && status === "rejected") {
                pointsDelta = -log.total_points;
            }

            await tx.waste_logs.update({
                where: { id: logId },
                data: { status, verified_by: adminId }
            });

            if (pointsDelta !== 0) {
                await tx.users.update({
                    where: { id: log.user_id },
                    data: { total_points: { increment: pointsDelta } }
                });
            }

            await tx.notifications.create({
                data: {
                    user_id: log.user_id,
                    title: status === 'verified' ? 'Setoran Diverifikasi! ✅' : 'Setoran Ditolak ❌',
                    message: status === 'verified' 
                        ? `Setoran Anda senilai ${log.total_weight}kg telah diverifikasi. +${log.total_points} poin!`
                        : `Setoran Anda senilai ${log.total_weight}kg ditolak oleh admin.`,
                    type: 'verification'
                }
            });
        });

        req.flash("success_msg", `Waste log marked as ${status}.`);
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Verify Error:", err);
        req.flash("error_msg", "Failed to update status: " + err.message);
        res.redirect("/admin/dashboard");
    }
});

app.post('/admin/verify-bulk-ai', isAdmin, async (req, res) => {
    // Basic bulk verify logic (simplified for now as AI scores are not per-item in this schema yet)
    req.flash('error_msg', 'Bulk AI Verification requires further schema updates.');
    res.redirect('/admin/dashboard');
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

app.post("/admin/rewards/add", isAdmin, upload.single("image"), async (req, res) => {
    const { title, description, points_cost, stock } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;
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

app.post("/admin/rewards/edit/:id", isAdmin, upload.single("image"), async (req, res) => {
    const { title, description, points_cost, stock } = req.body;
    const id = parseInt(req.params.id);
    try {
        const data = {
            title,
            description,
            points_cost: parseInt(points_cost),
            stock: parseInt(stock)
        };
        if (req.file) data.image_url = `/uploads/${req.file.filename}`;

        await prisma.rewards.update({
            where: { id },
            data
        });
        req.flash("success_msg", "Reward berhasil diperbarui!");
        res.redirect("/admin/rewards");
    } catch (err) {
        console.error("Edit Reward Error:", err);
        req.flash("error_msg", "Gagal memperbarui reward.");
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

app.post("/admin/delete/:id", isAdmin, async (req, res) => {
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

app.listen(PORT, () => {
    console.log(`Eco-Pulse server is running on http://localhost:${PORT}`);
});
