const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== JSON DATABASE ==========
const DB_FILE = path.join(__dirname, 'db.json');
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        users: [],
        messages: [],
        groups: [],
        groupMessages: [],
        clearance: [],
        sosAlerts: [],
        announcements: [],
        lostfound: [],
        admissions: [],
        idCards: [],
        schools: [
            { id: 1, name: "Technology", whatsapp: "https://chat.whatsapp.com/tech123" },
            { id: 2, name: "Education", whatsapp: "https://chat.whatsapp.com/edu456" },
            { id: 3, name: "Agriculture", whatsapp: "https://chat.whatsapp.com/agri789" }
        ],
        departments: [
            { id: 1, schoolId: 1, name: "Computer Science", whatsapp: "https://chat.whatsapp.com/cs001" },
            { id: 2, schoolId: 1, name: "BIT", whatsapp: "https://chat.whatsapp.com/bit002" },
            { id: 3, schoolId: 1, name: "Information Systems", whatsapp: "https://chat.whatsapp.com/is003" },
            { id: 4, schoolId: 1, name: "Networking", whatsapp: "https://chat.whatsapp.com/net004" },
            { id: 5, schoolId: 2, name: "Mathematics Education", whatsapp: "https://chat.whatsapp.com/mathed005" },
            { id: 6, schoolId: 2, name: "English Education", whatsapp: "https://chat.whatsapp.com/enged006" },
            { id: 7, schoolId: 2, name: "Science Education", whatsapp: "https://chat.whatsapp.com/scied007" },
            { id: 8, schoolId: 3, name: "Crop Science", whatsapp: "https://chat.whatsapp.com/crop008" },
            { id: 9, schoolId: 3, name: "Animal Science", whatsapp: "https://chat.whatsapp.com/animal009" },
            { id: 10, schoolId: 3, name: "Agricultural Economics", whatsapp: "https://chat.whatsapp.com/ageco010" }
        ],
        programmes: [],
        settings: { defaultFee: 4200000, academicSession: "2024/2025", enableNjalaConnect: true },
        nextId: { users: 1, messages: 1, groups: 1, groupMessages: 1, clearance: 1, sosAlerts: 1, announcements: 1, lostfound: 1, admissions: 1, idCards: 1, schools: 4, departments: 11 }
    };
    const studentPassword = bcrypt.hashSync('123456', 10);
    initialData.users.push({
        id: 1,
        full_name: 'Demo Student',
        matric_number: 'NU/CS/001',
        student_id: 'S001',
        email: 'student@njala.edu',
        password: studentPassword,
        department: 'Computer Science',
        level: '200',
        role: 'student',
        is_verified: 1,
        school: 'Technology',
        programme: 'BSc Computer Science',
        campus: 'Bo',
        admissionStatus: 'approved',
        regNumber: 'NU/TECH/CS/2024/001',
        created_at: new Date().toISOString()
    });
    const adminPassword = bcrypt.hashSync('admin123', 10);
    initialData.users.push({
        id: 2,
        full_name: 'System Admin',
        matric_number: 'ADMIN001',
        student_id: 'ADMIN',
        email: 'admin@njala.edu',
        password: adminPassword,
        department: 'Administration',
        level: 'N/A',
        role: 'admin',
        is_verified: 1,
        created_at: new Date().toISOString()
    });
    initialData.nextId.users = 3;
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    console.log('Created fresh db.json with extended schema.');
}

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
        console.error('Error reading db.json:', err);
        return { users: [], messages: [], groups: [], groupMessages: [], clearance: [], sosAlerts: [], announcements: [], lostfound: [], admissions: [], idCards: [], schools: [], departments: [], settings: {}, nextId: {} };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error writing db.json:', err);
    }
}

// ========== FILE UPLOAD ==========
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ========== JWT AUTH ==========
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

const ADMIN_SECRET = 'njala_admin_2024';

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ========== AUTH ROUTES (extended with school/dept) ==========
app.post('/api/auth/register', (req, res) => {
    try {
        const { full_name, email, password, phone, school, department, programme, level, campus, admin_secret } = req.body;
        const db = readDB();
        if (db.users.find(u => u.email === email))
            return res.status(400).json({ error: 'User already exists' });
        const hashedPassword = bcrypt.hashSync(password, 10);
        let role = 'student';
        let is_verified = 0;
        if (admin_secret && admin_secret === ADMIN_SECRET) {
            role = 'admin';
            is_verified = 1;
        }
        const newUser = {
            id: db.nextId.users++,
            full_name, email, password: hashedPassword, phone, school, department, programme, level, campus,
            role, is_verified,
            admissionStatus: 'pending',
            regNumber: null,
            created_at: new Date().toISOString()
        };
        db.users.push(newUser);
        writeDB(db);
        res.json({ message: role === 'admin' ? 'Admin account created' : 'Registration submitted. Awaiting admission approval.' });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt:', email);
        const db = readDB();
        const user = db.users.find(u => u.email === email);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                school: user.school,
                department: user.department,
                level: user.level,
                admissionStatus: user.admissionStatus,
                regNumber: user.regNumber
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// ========== ADMISSION APPLICATION ==========
app.post('/api/admission/apply', authenticateToken, upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'waec', maxCount: 1 },
    { name: 'birthCert', maxCount: 1 },
    { name: 'admissionLetter', maxCount: 1 }
]), (req, res) => {
    try {
        const db = readDB();
        const existing = db.admissions.find(a => a.user_id === req.user.id);
        if (existing) return res.status(400).json({ error: 'Application already submitted' });
        const newApp = {
            id: db.nextId.admissions++,
            user_id: req.user.id,
            photo: req.files['photo'] ? `/uploads/${req.files['photo'][0].filename}` : null,
            waec: req.files['waec'] ? `/uploads/${req.files['waec'][0].filename}` : null,
            birthCert: req.files['birthCert'] ? `/uploads/${req.files['birthCert'][0].filename}` : null,
            admissionLetter: req.files['admissionLetter'] ? `/uploads/${req.files['admissionLetter'][0].filename}` : null,
            status: 'pending',
            submitted_at: new Date().toISOString()
        };
        db.admissions.push(newApp);
        const user = db.users.find(u => u.id === req.user.id);
        user.admissionStatus = 'pending';
        writeDB(db);
        res.json({ message: 'Application submitted. Awaiting verification.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admission/status', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        const user = db.users.find(u => u.id === req.user.id);
        res.json({ status: user.admissionStatus || 'not_submitted', regNumber: user.regNumber });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ========== ID CARD APPLICATION ==========
app.post('/api/id-card/apply', authenticateToken, upload.single('photo'), (req, res) => {
    try {
        const { full_name, reg_number, dob, gender, phone, address, emergency_contact } = req.body;
        const db = readDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const idCard = {
            id: db.nextId.idCards++,
            user_id: req.user.id,
            full_name: user.full_name,
            reg_number: user.regNumber,
            photo: req.file ? `/uploads/${req.file.filename}` : null,
            school: user.school,
            department: user.department,
            programme: user.programme,
            level: user.level,
            dob, gender, phone, address, emergency_contact,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        db.idCards.push(idCard);
        writeDB(db);
        res.json({ message: 'ID card application submitted. Awaiting approval.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/id-card/status', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        const card = db.idCards.find(c => c.user_id === req.user.id);
        res.json(card || { status: 'not_applied' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ========== WHATSAPP LINKS ==========
app.get('/api/whatsapp-links', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        const user = db.users.find(u => u.id === req.user.id);
        const school = db.schools.find(s => s.name === user.school);
        const department = db.departments.find(d => d.name === user.department && d.schoolId === school?.id);
        // Level groups – you can store mapping; here mock
        res.json({
            school: school?.whatsapp || '#',
            department: department?.whatsapp || '#',
            level: `https://chat.whatsapp.com/level_${user.level}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ========== SCHOOL/DEPARTMENT MANAGEMENT (admin) ==========
function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
}
app.get('/api/schools', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        res.json(db.schools);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/schools', authenticateToken, isAdmin, (req, res) => {
    try {
        const { name, whatsapp } = req.body;
        const db = readDB();
        const newSchool = { id: db.nextId.schools++, name, whatsapp };
        db.schools.push(newSchool);
        writeDB(db);
        res.json(newSchool);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/departments', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        res.json(db.departments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/departments', authenticateToken, isAdmin, (req, res) => {
    try {
        const { schoolId, name, whatsapp } = req.body;
        const db = readDB();
        const newDept = { id: db.nextId.departments++, schoolId, name, whatsapp };
        db.departments.push(newDept);
        writeDB(db);
        res.json(newDept);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ========== ADMIN ADMISSION VERIFICATION ==========
app.get('/api/admin/admissions', authenticateToken, isAdmin, (req, res) => {
    try {
        const db = readDB();
        const admissions = db.admissions.map(a => {
            const user = db.users.find(u => u.id === a.user_id);
            return { ...a, user };
        });
        res.json(admissions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.patch('/api/admin/admissions/:id/verify', authenticateToken, isAdmin, (req, res) => {
    try {
        const { status, regNumber } = req.body;
        const db = readDB();
        const admission = db.admissions.find(a => a.id === parseInt(req.params.id));
        if (!admission) return res.status(404).json({ error: 'Not found' });
        admission.status = status;
        const user = db.users.find(u => u.id === admission.user_id);
        user.admissionStatus = status;
        if (status === 'approved') {
            // Generate registration number if not provided
            const schoolCode = (user.school || 'GEN').substring(0,3).toUpperCase();
            const deptCode = (user.department || 'GEN').substring(0,2).toUpperCase();
            const year = new Date().getFullYear();
            const random = Math.floor(Math.random() * 1000);
            user.regNumber = regNumber || `NU/${schoolCode}/${deptCode}/${year}/${random}`;
        }
        writeDB(db);
        res.json({ message: `Application ${status}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ========== LECTURER ENDPOINTS (placeholder) ==========
app.get('/api/lecturer/courses', authenticateToken, (req, res) => {
    // Mock – lecturer can view assigned courses
    res.json([{ id: 1, code: 'CS101', name: 'Computer Science 101', studentsEnrolled: 30 }]);
});
app.post('/api/lecturer/materials', authenticateToken, upload.single('file'), (req, res) => {
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ message: 'Material uploaded', url: fileUrl });
});

// ========== EXISTING CHAT, CLEARANCE, AI, SOS, ETC. (KEEP THEM AS IS) ==========
// I'll include them briefly – you already have working versions; just copy them here.
// For brevity, I'll assume the existing routes (messages, groups, clearance, AI, SOS, admin panel) are already present.
// If you need me to re‑insert them, I can – but to avoid duplication, I'm referencing that they remain unchanged.

// === (your existing chat, clearance, AI, SOS, admin panel endpoints remain unchanged) ===
// The only changes above are the new ones (admission, ID card, WhatsApp, schools, departments, lecturer).
// Make sure to keep all your previous routes (messages, groups, clearance, AI, SOS, etc.) in the final file.

// ========== SERVE FRONTEND ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/clearance', (req, res) => res.sendFile(path.join(__dirname, 'public', 'clearance.html')));
app.get('/ai-chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai-chat.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/lecturer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'lecturer.html')));

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));