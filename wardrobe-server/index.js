/*** FILE: wardrobe-server/index.js ***/
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const HOST = '0.0.0.0';

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database Configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'wardrobe_db',
  password: 'Bohong19',
  port: 5432,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// Configure Multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
    }
  }
});

// --- HELPER FUNCTIONS ---
async function logActivity(user, action, entity, id, details) {
    try {
        const query = `INSERT INTO activity_logs (user_name, action_type, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)`;
        await pool.query(query, [user || 'System', action, entity, id, details]);
    } catch (err) {
        console.error("Log Error:", err.message);
    }
}

function cleanPrice(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/[^0-9.,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    
    // Handle Excel serial date
    if (typeof val === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const days = val - 1;
        return new Date(excelEpoch.getTime() + days * 86400000);
    }
    
    // Handle string date formats
    if (typeof val === 'string') {
        // Try multiple date formats
        const dateFormats = [
            'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY',
            'YYYY/MM/DD', 'YYYY-MM-DD',
            'MM/DD/YYYY', 'MM-DD-YYYY'
        ];
        
        for (const format of dateFormats) {
            const date = new Date(val.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
    }
    
    return new Date(val);
}

// --- API ROUTES ---

// 1. TEST ENDPOINT
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: "Server is running", 
        timestamp: new Date().toISOString(),
        endpoints: [
            '/api/upload-excel',
            '/api/history',
            '/api/stats',
            '/api/items',
            '/api/borrowers',
            '/api/users',
            '/api/login',
            '/api/loan',
            '/api/return',
            '/api/logs',
            '/api/loans/active',
            '/api/return/bulk'
        ]
    });
});

// 2. UPLOAD EXCEL - ENHANCED VERSION
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
    console.log("📤 Upload request received");
    
    if (!req.file) {
        console.log("❌ No file in request");
        return res.status(400).json({ 
            success: false, 
            message: "No file uploaded. Please select an Excel file." 
        });
    }

    const client = await pool.connect();
    
    try {
        console.log(`📖 Reading file: ${req.file.path} (${req.file.size} bytes)`);
        
        // Read Excel file
        const workbook = xlsx.readFile(req.file.path);
        console.log("Sheet names:", workbook.SheetNames);
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log(`📊 Found ${data.length} rows in Excel`);
        
        if (data.length <= 1) {
            throw new Error("Excel file is empty or has no data rows");
        }

        // Get headers (first row)
        const headers = data[0].map(h => String(h || '').trim().toLowerCase());
        console.log("Headers found:", headers);
        
        // Map header indices
        const headerMap = {
            barcode: headers.findIndex(h => 
                h.includes('barcode') || h.includes('kode') || h.includes('code')
            ),
            name: headers.findIndex(h => 
                h.includes('name') || h.includes('nama') || h.includes('item')
            ),
            brand: headers.findIndex(h => 
                h.includes('brand') || h.includes('merek')
            ),
            size: headers.findIndex(h => 
                h.includes('size') || h.includes('ukuran')
            ),
            color: headers.findIndex(h => 
                h.includes('color') || h.includes('warna')
            ),
            sex: headers.findIndex(h => 
                h.includes('sex') || h.includes('gender') || h.includes('jenis')
            ),
            price: headers.findIndex(h => 
                h.includes('price') || h.includes('harga')
            ),
            recNo: headers.findIndex(h => 
                h.includes('receive') || h.includes('terima') || h.includes('no')
            ),
            recDate: headers.findIndex(h => 
                h.includes('date') || h.includes('tanggal') || h.includes('tgl')
            )
        };

        console.log("Header mapping:", headerMap);

        await client.query('BEGIN');
        
        let added = 0;
        let updated = 0;
        let skipped = 0;
        let errors = [];

        // Process data rows (skip header row)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            try {
                // Extract data using header mapping
                const barcode = headerMap.barcode >= 0 && row[headerMap.barcode] 
                    ? String(row[headerMap.barcode]).trim() 
                    : '';
                
                if (!barcode || barcode === 'undefined' || barcode === 'null') {
                    skipped++;
                    continue;
                }

                const name = headerMap.name >= 0 && row[headerMap.name] 
                    ? String(row[headerMap.name]).trim() 
                    : `Item ${barcode}`;
                
                const brand = headerMap.brand >= 0 && row[headerMap.brand] 
                    ? String(row[headerMap.brand]).trim() 
                    : '';
                
                const size = headerMap.size >= 0 && row[headerMap.size] 
                    ? String(row[headerMap.size]).trim() 
                    : '';
                
                const color = headerMap.color >= 0 && row[headerMap.color] 
                    ? String(row[headerMap.color]).trim() 
                    : '';
                
                const sex = headerMap.sex >= 0 && row[headerMap.sex] 
                    ? String(row[headerMap.sex]).trim() 
                    : '';
                
                const price = headerMap.price >= 0 && row[headerMap.price] 
                    ? cleanPrice(row[headerMap.price]) 
                    : 0;
                
                const recNo = headerMap.recNo >= 0 && row[headerMap.recNo] 
                    ? String(row[headerMap.recNo]).trim() 
                    : '';
                
                const recDate = headerMap.recDate >= 0 && row[headerMap.recDate] 
                    ? parseDate(row[headerMap.recDate]) 
                    : null;

                // Check if item exists
                const check = await client.query(
                    "SELECT barcode FROM items WHERE barcode = $1", 
                    [barcode]
                );
                
                // UPSERT query
                const query = `
                    INSERT INTO items (barcode, item_name, brand, size, color, sex, price, receive_no, receive_date, status, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Available', NOW())
                    ON CONFLICT (barcode) DO UPDATE SET
                        item_name = EXCLUDED.item_name,
                        brand = EXCLUDED.brand,
                        size = EXCLUDED.size,
                        color = EXCLUDED.color,
                        sex = EXCLUDED.sex,
                        price = EXCLUDED.price,
                        receive_no = EXCLUDED.receive_no,
                        receive_date = EXCLUDED.receive_date,
                        updated_at = NOW()
                    RETURNING barcode;
                `;

                await client.query(query, [
                    barcode, 
                    name, 
                    brand, 
                    size, 
                    color, 
                    sex, 
                    price, 
                    recNo, 
                    recDate
                ]);

                if (check.rows.length > 0) {
                    updated++;
                } else {
                    added++;
                }

            } catch (rowError) {
                errors.push(`Row ${i + 1}: ${rowError.message}`);
                console.error(`Error processing row ${i + 1}:`, rowError);
            }
        }

        await client.query('COMMIT');
        
        const user = req.body.user || 'System';
        await logActivity(user, 'UPLOAD_STOCK', 'ITEMS', 'BATCH', 
            `Excel Upload: ${added} New, ${updated} Updated, ${skipped} Skipped`);
        
        const response = {
            success: true,
            message: `✅ Upload Successful! 
                      Added: ${added} new items
                      Updated: ${updated} existing items
                      Skipped: ${skipped} rows (no barcode)`,
            stats: { 
                total: added + updated + skipped,
                added, 
                updated, 
                skipped,
                errors: errors.length 
            },
            errors: errors.length > 0 ? errors.slice(0, 5) : []
        };
        
        console.log("✅ Upload completed:", response.message);
        res.json(response);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Upload Error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Upload Failed: " + err.message,
            error: err.stack 
        });
    } finally {
        client.release();
        // Cleanup uploaded file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log("🧹 Temporary file cleaned up");
        }
    }
});

// 3. GET ITEMS
app.get('/api/items', async (req, res) => {
    try {
        const { search, limit = 200 } = req.query;
        let query = "SELECT * FROM items WHERE 1=1";
        let params = [];
        let paramCount = 1;
        
        if (search) {
            query += ` AND (item_name ILIKE $${paramCount} OR barcode ILIKE $${paramCount} OR brand ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        
        query += " ORDER BY updated_at DESC";
        
        if (limit) {
            query += ` LIMIT $${paramCount}`;
            params.push(parseInt(limit));
        }
        
        const result = await pool.query(query, params);
        res.json({ 
            success: true, 
            count: result.rows.length,
            data: result.rows 
        });
    } catch (err) { 
        res.status(500).json({ 
            success: false, 
            error: err.message 
        }); 
    }
});

// 4. GET ITEM BY BARCODE
app.get('/api/items/:barcode', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM items WHERE barcode = $1", 
            [req.params.barcode]
        );
        
        if (result.rows.length > 0) {
            res.json({ 
                success: true, 
                found: true, 
                data: result.rows[0] 
            });
        } else {
            res.json({ 
                success: true, 
                found: false, 
                message: "Item not found" 
            });
        }
    } catch (err) { 
        res.status(500).json({ 
            success: false, 
            error: err.message 
        }); 
    }
});

// 5. SEARCH AVAILABLE ITEMS FOR LOAN
app.get('/api/items/available/search', async (req, res) => {
    try {
        const { search, limit = 100 } = req.query;
        let query = "SELECT * FROM items WHERE status = 'Available'";
        let params = [];
        let paramCount = 1;
        
        if (search) {
            query += ` AND (item_name ILIKE $${paramCount} OR barcode ILIKE $${paramCount} OR brand ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        
        query += " ORDER BY item_name ASC";
        
        if (limit) {
            query += ` LIMIT $${paramCount}`;
            params.push(parseInt(limit));
        }
        
        const result = await pool.query(query, params);
        res.json({ 
            success: true, 
            count: result.rows.length,
            data: result.rows 
        });
    } catch (err) { 
        res.status(500).json({ 
            success: false, 
            error: err.message 
        }); 
    }
});

// 6. GET AVAILABLE ITEMS COUNT
app.get('/api/items/count/available', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) as count FROM items WHERE status = 'Available'");
        res.json({ 
            success: true, 
            count: parseInt(result.rows[0].count)
        });
    } catch (err) { 
        res.status(500).json({ 
            success: false, 
            error: err.message 
        }); 
    }
});

// 7. UPDATE ITEM STATUS
app.put('/api/items/:barcode/status', async (req, res) => {
    try {
        const { barcode } = req.params;
        const { status, user } = req.body;
        
        const result = await pool.query(
            "UPDATE items SET status = $1, updated_at = NOW() WHERE barcode = $2 RETURNING *",
            [status, barcode]
        );
        
        if (result.rows.length > 0) {
            await logActivity(user, 'UPDATE_ITEM_STATUS', 'ITEM', barcode, `Status changed to ${status}`);
            res.json({ 
                success: true, 
                data: result.rows[0]
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: "Item not found" 
            });
        }
    } catch (err) { 
        res.status(500).json({ 
            success: false, 
            error: err.message 
        }); 
    }
});

// 8. HISTORY
app.get('/api/history', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        // Get transactions
        const result = await pool.query(
            "SELECT * FROM loan_transactions ORDER BY created_at DESC LIMIT $1",
            [parseInt(limit)]
        );
        
        const loans = result.rows;
        
        // Get items for each transaction
        for (let loan of loans) {
            const items = await pool.query(`
                SELECT li.*, i.item_name, i.barcode, i.brand, i.color, i.size
                FROM loan_items li 
                LEFT JOIN items i ON li.barcode = i.barcode 
                WHERE transaction_id = $1
                ORDER BY li.created_at ASC
            `, [loan.id]);
            loan.items = items.rows;
        }
        
        res.json({ 
            success: true, 
            count: loans.length,
            data: loans 
        });
    } catch (error) { 
        console.error("History error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 9. STATS
app.get('/api/stats', async (req, res) => {
    try {
        const total = await pool.query("SELECT COUNT(*) as count FROM items");
        const loan = await pool.query("SELECT COUNT(*) as count FROM items WHERE status='On Loan'");
        const avail = await pool.query("SELECT COUNT(*) as count FROM items WHERE status='Available'");
        const scanned = await pool.query("SELECT COUNT(*) as count FROM items WHERE status='Scanned'");
        
        res.json({ 
            success: true,
            data: {
                total: parseInt(total.rows[0].count), 
                on_loan: parseInt(loan.rows[0].count), 
                available: parseInt(avail.rows[0].count),
                scanned: parseInt(scanned.rows[0].count) || 0,
                total_items: parseInt(total.rows[0].count)
            }
        });
    } catch (error) {
        console.error("Stats error:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 10. LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            "SELECT * FROM users WHERE username = $1 AND password = $2", 
            [username, password]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            await logActivity(user.username, 'LOGIN', 'AUTH', String(user.id), 'User logged in');
            res.json({ 
                success: true, 
                user: {
                    id: user.id,
                    username: user.username,
                    fullname: user.fullname,
                    role: user.role
                }
            });
        } else {
            res.status(401).json({ 
                success: false, 
                message: "Username atau Password Salah" 
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// 11. BORROWERS
app.get('/api/borrowers', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM borrowers ORDER BY name ASC");
        res.json({ 
            success: true,
            count: result.rows.length,
            data: result.rows 
        });
    } catch (err) { 
        res.status(500).json({ 
            success: false,
            error: err.message 
        }); 
    }
});

// 12. GET BORROWER BY ID
app.get('/api/borrowers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM borrowers WHERE id = $1", [id]);
        
        if (result.rows.length > 0) {
            res.json({ 
                success: true, 
                data: result.rows[0] 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: "Borrower not found" 
            });
        }
    } catch (err) { 
        res.status(500).json({ 
            success: false, 
            error: err.message 
        }); 
    }
});

// 13. CREATE/UPDATE BORROWER
app.post('/api/borrowers', async (req, res) => {
    try {
        const { nik, name, phone, position, current_user } = req.body;
        
        const query = `
            INSERT INTO borrowers (nik, name, phone, position) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (nik) DO UPDATE SET 
                name = EXCLUDED.name, 
                phone = EXCLUDED.phone, 
                position = EXCLUDED.position
            RETURNING *
        `;
        
        const result = await pool.query(query, [nik, name, phone, position]);
        await logActivity(current_user || 'System', 'UPSERT_BORROWER', 'BORROWER', nik, `Saved borrower: ${name}`);
        
        res.json({ 
            success: true, 
            data: result.rows[0] 
        });
    } catch (err) { 
        res.status(500).json({ 
            success: false,
            error: err.message 
        }); 
    }
});

// 14. DELETE BORROWER
app.delete('/api/borrowers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req.body;
        
        const result = await pool.query("DELETE FROM borrowers WHERE id = $1 RETURNING *", [id]);
        
        if (result.rows.length > 0) {
            await logActivity(user, 'DELETE_BORROWER', 'BORROWER', id, `Deleted borrower: ${result.rows[0].name}`);
            res.json({ 
                success: true,
                message: "Borrower deleted successfully"
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: "Borrower not found" 
            });
        }
    } catch (err) { 
        res.status(500).json({ 
            success: false,
            error: err.message 
        }); 
    }
});

// 15. USERS
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, username, fullname, nik, role, created_at FROM users ORDER BY created_at DESC"
        );
        res.json({ 
            success: true,
            count: result.rows.length,
            data: result.rows 
        });
    } catch (err) { 
        res.status(500).json({ 
            success: false,
            error: err.message 
        }); 
    }
});

// 16. CREATE USER
app.post('/api/users', async (req, res) => {
    try {
        const { username, password, fullname, nik, role, current_user } = req.body;
        
        await pool.query(
            "INSERT INTO users (username, password, fullname, nik, role) VALUES ($1, $2, $3, $4, $5)",
            [username, password, fullname, nik, role || 'staff']
        );
        
        await logActivity(current_user, 'CREATE_USER', 'USER', username, `Created user: ${fullname} (${role})`);
        res.json({ 
            success: true, 
            message: "User created successfully" 
        });
    } catch (err) { 
        res.status(500).json({ 
            success: false, 
            error: err.message 
        }); 
    }
});

// 17. LOGS
app.get('/api/logs', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100"
        );
        res.json({ 
            success: true,
            count: result.rows.length,
            data: result.rows 
        });
    } catch (error) { 
        res.status(500).json({ 
            success: false,
            error: error.message 
        }); 
    }
});

// 18. LOAN - CREATE TRANSACTION
app.post('/api/loan', async (req, res) => {
    const client = await pool.connect();
    try {
        const { borrower_id, borrower_name, inputter_name, program_name, loan_reason, due_date, signature_base64, items } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "No items selected for loan" 
            });
        }
        
        await client.query('BEGIN');
        
        // Generate Invoice Number
        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const countRes = await client.query("SELECT COUNT(*) FROM loan_transactions");
        const count = parseInt(countRes.rows[0].count) + 1;
        const invoice = `INV-${dateStr}-${String(count).padStart(3,'0')}`;

        // Insert Header
        const insertTx = `
            INSERT INTO loan_transactions (invoice_no, borrower_id, borrower_name, inputter_name, program_name, loan_reason, due_date, signature_base64, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Open') RETURNING id
        `;
        const txRes = await client.query(insertTx, [
            invoice, borrower_id, borrower_name, inputter_name, 
            program_name, loan_reason, due_date, signature_base64
        ]);
        const txId = txRes.rows[0].id;

        // Insert Details & Update Item Status
        for (const barcode of items) {
            // Check if item exists and is available
            const itemCheck = await client.query(
                "SELECT * FROM items WHERE barcode = $1 AND status = 'Available'",
                [barcode]
            );
            
            if (itemCheck.rows.length === 0) {
                throw new Error(`Item ${barcode} is not available or not found`);
            }
            
            await client.query(
                "INSERT INTO loan_items (transaction_id, barcode, status) VALUES ($1, $2, 'On Loan')", 
                [txId, barcode]
            );
            await client.query(
                "UPDATE items SET status = 'On Loan', updated_at = NOW() WHERE barcode = $1", 
                [barcode]
            );
        }

        await logActivity(inputter_name, 'LOAN', 'TRANSACTION', invoice, `Loan created with ${items.length} items.`);
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            invoice_no: invoice,
            transaction_id: txId,
            message: `Loan transaction created successfully for ${items.length} items`
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Loan Error:", err);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    } finally { 
        client.release(); 
    }
});

// 19. RETURN ITEM
app.post('/api/return', async (req, res) => {
    const client = await pool.connect();
    try {
        const { barcode, user } = req.body;
        
        if (!barcode) {
            return res.status(400).json({ 
                success: false, 
                message: "Barcode is required" 
            });
        }
        
        await client.query('BEGIN');

        // Find the active loan for this item
        const findItem = await client.query(`
            SELECT li.id, li.transaction_id, lt.invoice_no, i.item_name 
            FROM loan_items li 
            JOIN loan_transactions lt ON li.transaction_id = lt.id
            JOIN items i ON li.barcode = i.barcode
            WHERE li.barcode = $1 AND li.status = 'On Loan'
            LIMIT 1
        `, [barcode]);

        if (findItem.rows.length === 0) {
            throw new Error("Item not found on active loan or barcode incorrect.");
        }
        
        const itemData = findItem.rows[0];

        // Update Loan Item Status
        await client.query(
            "UPDATE loan_items SET status = 'Returned', returned_at = NOW() WHERE id = $1", 
            [itemData.id]
        );
        
        // Update Inventory Item Status
        await client.query(
            "UPDATE items SET status = 'Available', updated_at = NOW() WHERE barcode = $1", 
            [barcode]
        );

        // Check if transaction is fully completed
        const check = await client.query(
            "SELECT COUNT(*) FROM loan_items WHERE transaction_id = $1 AND status = 'On Loan'", 
            [itemData.transaction_id]
        );
        
        if (parseInt(check.rows[0].count) === 0) {
            await client.query(
                "UPDATE loan_transactions SET status = 'Completed' WHERE id = $1", 
                [itemData.transaction_id]
            );
        }

        await logActivity(user, 'RETURN', 'ITEM', barcode, `Returned: ${itemData.item_name} (Inv: ${itemData.invoice_no})`);
        await client.query('COMMIT');

        res.json({ 
            success: true, 
            data: itemData,
            message: `Item ${barcode} returned successfully`
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Return Error:", err);
        res.status(500).json({ 
            success: false, 
            message: err.message 
        });
    } finally { 
        client.release(); 
    }
});

// 20. BULK RETURN ITEMS
app.post('/api/return/bulk', async (req, res) => {
    const client = await pool.connect();
    try {
        const { barcodes, user } = req.body;
        
        if (!Array.isArray(barcodes) || barcodes.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "No barcodes provided" 
            });
        }
        
        await client.query('BEGIN');
        
        let returned = 0;
        let not_found = [];
        let errors = [];
        
        for (const barcode of barcodes) {
            try {
                // Find active loan for this item
                const findItem = await client.query(`
                    SELECT li.id, li.transaction_id, lt.invoice_no, i.item_name 
                    FROM loan_items li 
                    JOIN loan_transactions lt ON li.transaction_id = lt.id
                    JOIN items i ON li.barcode = i.barcode
                    WHERE li.barcode = $1 AND li.status = 'On Loan'
                    LIMIT 1
                `, [barcode]);
                
                if (findItem.rows.length === 0) {
                    not_found.push(barcode);
                    continue;
                }
                
                const itemData = findItem.rows[0];
                
                // Update Loan Item Status
                await client.query(
                    "UPDATE loan_items SET status = 'Returned', returned_at = NOW() WHERE id = $1", 
                    [itemData.id]
                );
                
                // Update Inventory Item Status
                await client.query(
                    "UPDATE items SET status = 'Available', updated_at = NOW() WHERE barcode = $1", 
                    [barcode]
                );
                
                returned++;
                
                // Check if transaction is fully completed
                const check = await client.query(
                    "SELECT COUNT(*) FROM loan_items WHERE transaction_id = $1 AND status = 'On Loan'", 
                    [itemData.transaction_id]
                );
                
                if (parseInt(check.rows[0].count) === 0) {
                    await client.query(
                        "UPDATE loan_transactions SET status = 'Completed' WHERE id = $1", 
                        [itemData.transaction_id]
                    );
                }
                
            } catch (itemError) {
                errors.push(`Item ${barcode}: ${itemError.message}`);
            }
        }
        
        await logActivity(user, 'BULK_RETURN', 'ITEMS', 'BATCH', `Bulk return: ${returned} returned, ${not_found.length} not found`);
        await client.query('COMMIT');
        
        res.json({ 
            success: true,
            stats: {
                returned,
                not_found: not_found.length,
                errors: errors.length
            },
            details: {
                not_found_barcodes: not_found,
                errors: errors
            },
            message: `Bulk return completed: ${returned} items returned successfully`
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Bulk return error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    } finally {
        client.release();
    }
});

// 21. GET ACTIVE LOANS
app.get('/api/loans/active', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT lt.*, 
                   COUNT(li.id) as item_count,
                   ARRAY_AGG(i.item_name) as item_names
            FROM loan_transactions lt
            LEFT JOIN loan_items li ON lt.id = li.transaction_id
            LEFT JOIN items i ON li.barcode = i.barcode
            WHERE lt.status = 'Open' AND li.status = 'On Loan'
            GROUP BY lt.id
            ORDER BY lt.created_at DESC
        `);
        
        // Get items for each loan
        const loans = result.rows;
        for (let loan of loans) {
            const items = await pool.query(`
                SELECT li.*, i.item_name, i.barcode, i.brand, i.color, i.size, i.price
                FROM loan_items li
                LEFT JOIN items i ON li.barcode = i.barcode
                WHERE li.transaction_id = $1 AND li.status = 'On Loan'
            `, [loan.id]);
            loan.items = items.rows;
        }
        
        res.json({ 
            success: true, 
            count: loans.length,
            data: loans 
        });
    } catch (error) { 
        console.error("Active loans error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 22. GET LOAN DETAILS
app.get('/api/loans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get loan header
        const loanResult = await pool.query(
            "SELECT * FROM loan_transactions WHERE id = $1", 
            [id]
        );
        
        if (loanResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Loan not found" 
            });
        }
        
        const loan = loanResult.rows[0];
        
        // Get loan items
        const itemsResult = await pool.query(`
            SELECT li.*, i.item_name, i.barcode, i.brand, i.color, i.size, i.price
            FROM loan_items li
            LEFT JOIN items i ON li.barcode = i.barcode
            WHERE li.transaction_id = $1
            ORDER BY li.created_at ASC
        `, [id]);
        
        loan.items = itemsResult.rows;
        
        res.json({ 
            success: true, 
            data: loan 
        });
    } catch (error) { 
        console.error("Get loan error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 23. UPDATE LOAN STATUS
app.put('/api/loans/:id/status', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status, user } = req.body;
        
        if (!['Open', 'Completed', 'Cancelled'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid status" 
            });
        }
        
        await client.query('BEGIN');
        
        const result = await client.query(
            "UPDATE loan_transactions SET status = $1 WHERE id = $2 RETURNING *",
            [status, id]
        );
        
        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                message: "Loan not found" 
            });
        }
        
        await logActivity(user || 'System', 'UPDATE_LOAN_STATUS', 'LOAN', id, `Status changed to ${status}`);
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            data: result.rows[0],
            message: `Loan status updated to ${status}`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Update loan status error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    } finally {
        client.release();
    }
});

// 24. HEALTH CHECK
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ 
            success: true, 
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            status: 'unhealthy',
            error: error.message
        });
    }
});

// 25. DASHBOARD STATS
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        // Get daily stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayLoans = await pool.query(
            "SELECT COUNT(*) as count FROM loan_transactions WHERE created_at >= $1",
            [today]
        );
        
        const todayReturns = await pool.query(
            "SELECT COUNT(*) as count FROM loan_items WHERE returned_at >= $1",
            [today]
        );
        
        const todayUploads = await pool.query(
            "SELECT COUNT(*) as count FROM activity_logs WHERE created_at >= $1 AND action_type = 'UPLOAD_STOCK'",
            [today]
        );
        
        // Get total values
        const totalValue = await pool.query("SELECT SUM(price) as total FROM items WHERE status = 'Available'");
        const loanValue = await pool.query("SELECT SUM(price) as total FROM items WHERE status = 'On Loan'");
        
        res.json({ 
            success: true,
            data: {
                daily: {
                    loans: parseInt(todayLoans.rows[0].count || 0),
                    returns: parseInt(todayReturns.rows[0].count || 0),
                    uploads: parseInt(todayUploads.rows[0].count || 0)
                },
                values: {
                    total: parseFloat(totalValue.rows[0].total || 0),
                    on_loan: parseFloat(loanValue.rows[0].total || 0),
                    available: parseFloat(totalValue.rows[0].total || 0) - parseFloat(loanValue.rows[0].total || 0)
                }
            }
        });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 26. SEARCH FUNCTION
app.get('/api/search', async (req, res) => {
    try {
        const { q, type = 'all', limit = 50 } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({ 
                success: false, 
                message: "Search query too short" 
            });
        }
        
        let results = {};
        const searchTerm = `%${q}%`;
        
        // Search items
        if (type === 'all' || type === 'items') {
            const items = await pool.query(`
                SELECT barcode, item_name, brand, status, price 
                FROM items 
                WHERE item_name ILIKE $1 OR barcode ILIKE $1 OR brand ILIKE $1
                LIMIT $2
            `, [searchTerm, parseInt(limit)]);
            results.items = items.rows;
        }
        
        // Search borrowers
        if (type === 'all' || type === 'borrowers') {
            const borrowers = await pool.query(`
                SELECT id, name, nik, phone, position 
                FROM borrowers 
                WHERE name ILIKE $1 OR nik ILIKE $1
                LIMIT $2
            `, [searchTerm, parseInt(limit)]);
            results.borrowers = borrowers.rows;
        }
        
        // Search loans
        if (type === 'all' || type === 'loans') {
            const loans = await pool.query(`
                SELECT id, invoice_no, borrower_name, program_name, status
                FROM loan_transactions 
                WHERE invoice_no ILIKE $1 OR borrower_name ILIKE $1 OR program_name ILIKE $1
                LIMIT $2
            `, [searchTerm, parseInt(limit)]);
            results.loans = loans.rows;
        }
        
        res.json({ 
            success: true,
            query: q,
            type: type,
            results: results
        });
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// 27. DELETE ITEM
app.delete('/api/items/:barcode', async (req, res) => {
    try {
        const { barcode } = req.params;
        const { user } = req.body;
        
        // Check if item is on loan
        const loanCheck = await pool.query(
            "SELECT * FROM loan_items WHERE barcode = $1 AND status = 'On Loan'",
            [barcode]
        );
        
        if (loanCheck.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot delete item that is currently on loan" 
            });
        }
        
        const result = await pool.query("DELETE FROM items WHERE barcode = $1 RETURNING *", [barcode]);
        
        if (result.rows.length > 0) {
            await logActivity(user, 'DELETE_ITEM', 'ITEM', barcode, `Deleted item: ${result.rows[0].item_name}`);
            res.json({ 
                success: true,
                message: "Item deleted successfully"
            });
        } else {
            res.status(404).json({ 
                success: false, 
                message: "Item not found" 
            });
        }
    } catch (err) { 
        res.status(500).json({ 
            success: false,
            error: err.message 
        }); 
    }
});

// 28. CLEAR ALL DATA (DANGEROUS - USE WITH CAUTION)
app.delete('/api/clear/all', async (req, res) => {
    try {
        const { password, user } = req.body;
        
        // Simple password protection
        if (password !== 'DELETE_CONFIRM') {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid confirmation password" 
            });
        }
        
        await pool.query('BEGIN');
        
        // Clear data in correct order (respect foreign keys)
        await pool.query("DELETE FROM loan_items");
        await pool.query("DELETE FROM loan_transactions");
        await pool.query("DELETE FROM items");
        await pool.query("DELETE FROM borrowers WHERE id > 1"); // Keep admin borrower if exists
        await pool.query("DELETE FROM activity_logs");
        
        await logActivity(user, 'CLEAR_ALL_DATA', 'SYSTEM', 'ALL', 'All data cleared from system');
        await pool.query('COMMIT');
        
        res.json({ 
            success: true,
            message: "All data cleared successfully"
        });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Clear all error:", error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.originalUrl} not found`
    });
});

// Start Server
const server = app.listen(PORT, HOST, () => {
    console.log(`
=========================================
🚀 Wardrobe Server v2.0
✅ Running on: http://${HOST}:${PORT}
✅ Health check: http://${HOST}:${PORT}/api/health
✅ Test endpoint: http://${HOST}:${PORT}/api/test
📊 API Endpoints: 
   • POST /api/upload-excel
   • GET  /api/items
   • GET  /api/history
   • GET  /api/stats
   • POST /api/login
   • POST /api/loan
   • POST /api/return
   • GET  /api/loans/active
=========================================
    `);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        pool.end(() => {
            console.log('Database connections closed');
            process.exit(0);
        });
    });
});