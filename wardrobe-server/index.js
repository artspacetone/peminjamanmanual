const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 5000;

// --- DATABASE CONFIG ---
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'wardrobe_db',
    password: 'Bohong19', // PASSWORD ANDA
    port: 5432,
});

// Test Koneksi
pool.connect((err) => {
    if (err) console.error('❌ Database Error:', err.message);
    else console.log('✅ Database Connected');
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Upload Folder
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Logging Helper
const logActivity = async (user, action, desc) => {
    try {
        await pool.query(
            "INSERT INTO activity_logs (user_name, action_type, description) VALUES ($1, $2, $3)",
            [user || 'System', action, desc]
        );
    } catch (e) { console.error("Log Error:", e.message); }
};

// ================= ROUTES =================

// 1. LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password = $2", [username, password]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            await logActivity(user.username, 'LOGIN', 'User logged in');
            res.json({ success: true, user });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 2. STATS (Dashboard)
app.get('/api/stats', async (req, res) => {
    try {
        const total = await pool.query("SELECT COUNT(*) FROM items");
        const onLoan = await pool.query("SELECT COUNT(*) FROM items WHERE status = 'On Loan'");
        const available = await pool.query("SELECT COUNT(*) FROM items WHERE status = 'Available'");
        
        res.json({
            total: parseInt(total.rows[0].count),
            on_loan: parseInt(onLoan.rows[0].count),
            available: parseInt(available.rows[0].count),
        });
    } catch (err) { 
        console.error("Stats Error:", err);
        res.status(500).json({ message: "DB Error", detail: err.message }); 
    }
});

// 3. GET ITEMS (Search & List)
app.get('/api/items', async (req, res) => {
    const { search } = req.query;
    let query = "SELECT * FROM items WHERE 1=1";
    let params = [];
    
    if (search) {
        query += " AND (item_name ILIKE $1 OR barcode ILIKE $1 OR brand ILIKE $1 OR receive_no ILIKE $1)";
        params.push(`%${search}%`);
    }
    query += " ORDER BY created_at DESC LIMIT 200";
    
    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json(err); }
});

app.get('/api/items/:barcode', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM items WHERE barcode = $1", [req.params.barcode]);
        if (result.rows.length > 0) res.json({ found: true, data: result.rows[0] });
        else res.json({ found: false });
    } catch (err) { res.status(500).json(err); }
});

// 4. UPLOAD STOCK (LOGIKA UPSERT SESUAI EXCEL)
app.post('/api/items/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    const client = await pool.connect();
    try {
        // Baca file excel
        const workbook = xlsx.readFile(req.file.path, { cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);
        
        let successCount = 0;
        await client.query('BEGIN');

        for (const row of data) {
            // Mapping Header Excel
            const receiveNo = row['Receive No.'] || row['Receive No'] || '';
            const receiveDate = row['Receive Date'] || null;
            const barcode = String(row['Barcode'] || '').trim();
            const name = row['Name'] || row['Item Name'] || '';
            const sex = row['Sex'] || '';
            const color = row['Color'] || '';
            const size = String(row['Size'] || '');
            const brand = row['Brand'] || '';
            const price = row['Price'] || 0;

            if (!barcode || !name) continue; // Skip jika data tidak lengkap

            // Query Upsert (Insert atau Update jika barcode sama)
            const query = `
                INSERT INTO items (barcode, item_name, receive_no, receive_date, sex, color, size, brand, price) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (barcode) DO UPDATE 
                SET item_name = EXCLUDED.item_name,
                    receive_no = EXCLUDED.receive_no,
                    receive_date = EXCLUDED.receive_date,
                    sex = EXCLUDED.sex,
                    color = EXCLUDED.color,
                    size = EXCLUDED.size,
                    brand = EXCLUDED.brand,
                    price = EXCLUDED.price,
                    updated_at = CURRENT_TIMESTAMP
            `;
            await client.query(query, [barcode, name, receiveNo, receiveDate, sex, color, size, brand, price]);
            successCount++;
        }

        await client.query('COMMIT');
        await logActivity('System', 'UPLOAD_STOCK', `Uploaded ${successCount} items`);
        res.json({ success: true, count: successCount });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Upload Failed:", err); // Cek terminal jika error lagi
        res.status(500).json({ message: "Database Error saat Upload", detail: err.message });
    } finally {
        if(req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        client.release();
    }
});

// 5. LOAN (PEMINJAMAN 21 HARI)
app.post('/api/loan', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { borrower_id, borrower_name, inputter_name, inputter_nik, program_name, loan_reason, signature_base64, items } = req.body;

        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const countRes = await client.query("SELECT COUNT(*) FROM loans WHERE DATE(loan_date) = CURRENT_DATE");
        const invoice_no = `INV-${dateStr}-${String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0')}`;

        // Deadline 21 Hari
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 21);

        const loanRes = await client.query(
            `INSERT INTO loans (invoice_no, borrower_id, borrower_name, inputter_name, inputter_nik, program_name, loan_reason, due_date, signature_base64)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [invoice_no, borrower_id, borrower_name, inputter_name, inputter_nik, program_name, loan_reason, dueDate, signature_base64]
        );
        const loanId = loanRes.rows[0].id;

        for (const barcode of items) {
            const itemRes = await client.query("SELECT id, item_name, status FROM items WHERE barcode = $1", [barcode]);
            if (itemRes.rows.length === 0) throw new Error(`Item ${barcode} tidak ditemukan`);
            if (itemRes.rows[0].status !== 'Available') throw new Error(`Item ${barcode} sedang tidak tersedia`);
            
            await client.query("INSERT INTO loan_items (loan_id, item_id, barcode, item_name) VALUES ($1, $2, $3, $4)", 
                [loanId, itemRes.rows[0].id, barcode, itemRes.rows[0].item_name]);
            await client.query("UPDATE items SET status = 'On Loan' WHERE id = $1", [itemRes.rows[0].id]);
        }

        await client.query('COMMIT');
        await logActivity(inputter_name, 'LOAN', `Created Loan ${invoice_no}`);
        res.json({ success: true, invoice_no, due_date: dueDate });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// 6. RETURN
app.post('/api/return', async (req, res) => {
    const { barcode, inputter_name } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const checkRes = await client.query(
            `SELECT li.id, li.loan_id, l.borrower_name, i.item_name 
             FROM loan_items li
             JOIN loans l ON li.loan_id = l.id
             JOIN items i ON li.item_id = i.id
             WHERE li.barcode = $1 AND li.status = 'On Loan' LIMIT 1`, [barcode]);

        if (checkRes.rows.length === 0) throw new Error('Item tidak sedang dipinjam.');
        const loanItem = checkRes.rows[0];

        await client.query("UPDATE loan_items SET status = 'Returned', returned_at = CURRENT_TIMESTAMP WHERE id = $1", [loanItem.id]);
        await client.query("UPDATE items SET status = 'Available' WHERE barcode = $1", [barcode]);

        await client.query('COMMIT');
        await logActivity(inputter_name, 'RETURN', `Returned item ${barcode}`);
        res.json({ success: true, data: loanItem });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: err.message });
    } finally {
        client.release();
    }
});

// 7. USER & BORROWER MANAGEMENT
app.get('/api/users', async (req, res) => {
    try { const r = await pool.query("SELECT id, username, fullname, nik, role FROM users"); res.json(r.rows); } catch(e){ res.status(500).send(e); }
});
app.post('/api/users', async (req, res) => {
    const { username, password, fullname, nik, role } = req.body;
    try { 
        await pool.query("INSERT INTO users (username, password, fullname, nik, role) VALUES ($1, $2, $3, $4, $5)", [username, password, fullname, nik, role]);
        res.json({ success: true });
    } catch(e) { res.status(500).send(e.message); }
});

app.get('/api/borrowers', async (req, res) => {
    try { const r = await pool.query("SELECT * FROM borrowers ORDER BY name ASC"); res.json(r.rows); } catch(e){ res.status(500).send(e); }
});
app.post('/api/borrowers', async (req, res) => {
    const { nik, name, phone, position } = req.body;
    try { 
        await pool.query("INSERT INTO borrowers (nik, name, phone, position) VALUES ($1, $2, $3, $4)", [nik, name, phone, position]);
        res.json({ success: true });
    } catch(e) { res.status(500).send(e.message); }
});

app.get('/api/logs', async (req, res) => {
    try { const r = await pool.query("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 200"); res.json(r.rows); } catch(e){ res.status(500).send(e); }
});

app.listen(port, () => console.log(`Server running on port ${port}`));