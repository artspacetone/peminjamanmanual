-- =============================================
-- 1. BERSIHKAN TABEL LAMA (RESET)
-- =============================================
-- Menggunakan CASCADE untuk menghapus relasi foreign key secara otomatis
DROP TABLE IF EXISTS loan_items CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS borrowers CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =============================================
-- 2. BUAT TABEL USERS (Login)
-- =============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    fullname VARCHAR(100),
    role VARCHAR(20) DEFAULT 'staff', -- 'admin' atau 'staff'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Admin (Username: admin, Pass: admin123)
INSERT INTO users (username, password, fullname, role) 
VALUES ('admin', 'admin123', 'Administrator', 'admin');

-- =============================================
-- 3. BUAT TABEL ITEMS (Data Stok / Inventory)
-- =============================================
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    brand VARCHAR(100),
    color VARCHAR(50),
    size VARCHAR(20),
    price DECIMAL(15, 2) DEFAULT 0,
    type VARCHAR(50), -- Kemeja, Celana, Aksesoris, dll
    status VARCHAR(20) DEFAULT 'Available', -- Available, On Loan, Lost, Repair
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexing agar pencarian barcode & nama barang cepat
CREATE INDEX idx_items_barcode ON items(barcode);
CREATE INDEX idx_items_name ON items(item_name);

-- =============================================
-- 4. BUAT TABEL BORROWERS (Data Peminjam)
-- =============================================
CREATE TABLE borrowers (
    id SERIAL PRIMARY KEY,
    nik VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    position VARCHAR(100), -- Jabatan atau Divisi
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 5. BUAT TABEL LOANS (Transaksi Peminjaman Header)
-- =============================================
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    borrower_id INTEGER REFERENCES borrowers(id) ON DELETE SET NULL,
    borrower_name VARCHAR(100), -- Snapshot nama saat meminjam
    inputter_name VARCHAR(100), -- User yang menginput
    program_name VARCHAR(100),
    loan_reason TEXT,
    loan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP,
    return_date TIMESTAMP,
    signature_base64 TEXT, -- Menyimpan gambar tanda tangan (Base64 string)
    status VARCHAR(20) DEFAULT 'Active' -- Active, Completed
);

CREATE INDEX idx_loans_invoice ON loans(invoice_no);

-- =============================================
-- 6. BUAT TABEL LOAN ITEMS (Detail Barang per Peminjaman)
-- =============================================
CREATE TABLE loan_items (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER REFERENCES loans(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    barcode VARCHAR(50),
    item_name VARCHAR(200),
    status VARCHAR(20) DEFAULT 'On Loan', -- On Loan, Returned
    returned_at TIMESTAMP
);

-- =============================================
-- 7. BUAT TABEL ACTIVITY LOGS (Riwayat Aktivitas)
-- =============================================
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(100),
    action_type VARCHAR(50), -- LOGIN, CREATE_ITEM, LOAN, RETURN, SO, UPLOAD
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SELESAI
-- =============================================