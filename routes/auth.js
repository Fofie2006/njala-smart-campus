const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sql = require('mssql');

const JWT_SECRET = process.env.JWT_SECRET || 'njala_smart_campus_secret_key_2024';

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - matric_number
 *               - student_id
 *               - email
 *               - password
 *               - department
 *             properties:
 *               full_name:
 *                 type: string
 *               matric_number:
 *                 type: string
 *               student_id:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               department:
 *                 type: string
 *               level:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists
 */
router.post('/register', async (req, res) => {
    try {
        const { full_name, matric_number, student_id, email, password, department, level, phone } = req.body;
        
        // Check if user exists
        const checkUser = await sql.query`
            SELECT * FROM Users WHERE matric_number = ${matric_number} OR email = ${email}
        `;
        
        if (checkUser.recordset.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert user
        const result = await sql.query`
            INSERT INTO Users (full_name, matric_number, student_id, email, password_hash, department, level, phone, is_verified)
            VALUES (${full_name}, ${matric_number}, ${student_id}, ${email}, ${hashedPassword}, ${department}, ${level}, ${phone}, 0)
            SELECT SCOPE_IDENTITY() as user_id
        `;
        
        // Create online status record
        await sql.query`
            INSERT INTO OnlineStatus (user_id, is_online, last_seen)
            VALUES (${result.recordset[0].user_id}, 0, GETDATE())
        `;
        
        res.status(201).json({ message: 'Registration successful. Awaiting verification.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Get user
        const result = await sql.query`
            SELECT * FROM Users WHERE email = ${email}
        `;
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.recordset[0];
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        await sql.query`
            UPDATE Users SET last_login = GETDATE() WHERE user_id = ${user.user_id}
        `;
        
        // Update online status
        await sql.query`
            UPDATE OnlineStatus SET is_online = 1, last_seen = GETDATE() WHERE user_id = ${user.user_id}
        `;
        
        // Generate token
        const token = jwt.sign(
            { user_id: user.user_id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                user_id: user.user_id,
                full_name: user.full_name,
                email: user.email,
                matric_number: user.matric_number,
                department: user.department,
                role: user.role,
                is_verified: user.is_verified
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/auth/verify:
 *   post:
 *     summary: Verify user account (Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User verified successfully
 */
router.post('/verify', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        await sql.query`
            UPDATE Users SET is_verified = 1 WHERE user_id = ${user_id}
        `;
        
        res.json({ message: 'User verified successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;