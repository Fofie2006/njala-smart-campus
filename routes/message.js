const express = require('express');
const router = express.Router();
const sql = require('mssql');
const multer = require('multer');
const path = require('path');

// File upload configuration
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

/**
 * @swagger
 * /api/messages/send:
 *   post:
 *     summary: Send a direct message
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sender_id
 *               - receiver_id
 *               - message_text
 *             properties:
 *               sender_id:
 *                 type: integer
 *               receiver_id:
 *                 type: integer
 *               message_text:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 */
router.post('/send', async (req, res) => {
    try {
        const { sender_id, receiver_id, message_text } = req.body;
        
        const result = await sql.query`
            INSERT INTO Messages (sender_id, receiver_id, message_text, is_read, is_delivered, created_at)
            OUTPUT INSERTED.*
            VALUES (${sender_id}, ${receiver_id}, ${message_text}, 0, 0, GETDATE())
        `;
        
        // Create notification
        await sql.query`
            INSERT INTO Notifications (user_id, title, message, type, created_at)
            VALUES (${receiver_id}, 'New Message', 'You have a new message', 'message', GETDATE())
        `;
        
        res.status(201).json(result.recordset[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/messages/send-media:
 *   post:
 *     summary: Send media message
 *     tags: [Messages]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               sender_id:
 *                 type: integer
 *               receiver_id:
 *                 type: integer
 *               file:
 *                 type: string
 *                 format: binary
 *               media_type:
 *                 type: string
 */
router.post('/send-media', upload.single('file'), async (req, res) => {
    try {
        const { sender_id, receiver_id, media_type } = req.body;
        const media_url = `/uploads/${req.file.filename}`;
        
        const result = await sql.query`
            INSERT INTO Messages (sender_id, receiver_id, media_url, media_type, created_at)
            OUTPUT INSERTED.*
            VALUES (${sender_id}, ${receiver_id}, ${media_url}, ${media_type}, GETDATE())
        `;
        
        res.status(201).json(result.recordset[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/messages/conversation:
 *   get:
 *     summary: Get conversation between two users
 *     tags: [Messages]
 *     parameters:
 *       - in: query
 *         name: user1_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: user2_id
 *         required: true
 *         schema:
 *           type: integer
 */
router.get('/conversation', async (req, res) => {
    try {
        const { user1_id, user2_id } = req.query;
        
        const result = await sql.query`
            SELECT * FROM Messages 
            WHERE (sender_id = ${user1_id} AND receiver_id = ${user2_id})
            OR (sender_id = ${user2_id} AND receiver_id = ${user1_id})
            ORDER BY created_at ASC
        `;
        
        // Mark messages as read
        await sql.query`
            UPDATE Messages 
            SET is_read = 1, is_delivered = 1
            WHERE receiver_id = ${user2_id} AND sender_id = ${user1_id}
        `;
        
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/messages/groups/create:
 *   post:
 *     summary: Create a group
 *     tags: [Groups]
 */
router.post('/groups/create', async (req, res) => {
    try {
        const { group_name, group_type, created_by, members } = req.body;
        
        // Create group
        const groupResult = await sql.query`
            INSERT INTO Groups (group_name, group_type, created_by, created_at)
            OUTPUT INSERTED.group_id
            VALUES (${group_name}, ${group_type}, ${created_by}, GETDATE())
        `;
        
        const group_id = groupResult.recordset[0].group_id;
        
        // Add creator as admin
        await sql.query`
            INSERT INTO GroupMembers (group_id, user_id, is_admin, joined_at)
            VALUES (${group_id}, ${created_by}, 1, GETDATE())
        `;
        
        // Add other members
        for (const member of members) {
            await sql.query`
                INSERT INTO GroupMembers (group_id, user_id, joined_at)
                VALUES (${group_id}, ${member}, GETDATE())
            `;
        }
        
        res.status(201).json({ group_id, message: 'Group created successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/messages/groups/{group_id}/messages:
 *   post:
 *     summary: Send message to group
 *     tags: [Groups]
 */
router.post('/groups/:group_id/messages', async (req, res) => {
    try {
        const { group_id } = req.params;
        const { sender_id, message_text } = req.body;
        
        const result = await sql.query`
            INSERT INTO Messages (sender_id, group_id, message_text, created_at)
            OUTPUT INSERTED.*
            VALUES (${sender_id}, ${group_id}, ${message_text}, GETDATE())
        `;
        
        // Get all group members for notifications
        const members = await sql.query`
            SELECT user_id FROM GroupMembers WHERE group_id = ${group_id} AND user_id != ${sender_id}
        `;
        
        for (const member of members.recordset) {
            await sql.query`
                INSERT INTO Notifications (user_id, title, message, type, created_at)
                VALUES (${member.user_id}, 'Group Message', 'New message in group', 'group', GETDATE())
            `;
        }
        
        res.status(201).json(result.recordset[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;