-- Wardrobe Management System Database Schema
-- PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== CORE TABLES ====================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    fullname VARCHAR(255),
    nik VARCHAR(50) UNIQUE,
    role VARCHAR(50) DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Borrowers table
CREATE TABLE IF NOT EXISTS borrowers (
    id SERIAL PRIMARY KEY,
    nik VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    position VARCHAR(100),
    department VARCHAR(100),
    email VARCHAR(100),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    total_loans INTEGER DEFAULT 0,
    last_loan_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Items/Inventory table
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    size VARCHAR(50),
    color VARCHAR(50),
    sex VARCHAR(20),
    type VARCHAR(100),
    category VARCHAR(100),
    price DECIMAL(12,2) DEFAULT 0,
    receive_no VARCHAR(100),
    receive_date DATE,
    supplier VARCHAR(255),
    condition VARCHAR(50) DEFAULT 'Good',
    status VARCHAR(50) DEFAULT 'Available',
    notes TEXT,
    image_url TEXT,
    last_scanned TIMESTAMP,
    scan_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Loan Transactions table
CREATE TABLE IF NOT EXISTS loan_transactions (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(100) UNIQUE,
    borrower_id INTEGER REFERENCES borrowers(id),
    borrower_name VARCHAR(255),
    inputter_name VARCHAR(255),
    program_name VARCHAR(255),
    loan_reason TEXT,
    due_date DATE,
    signature_base64 TEXT,
    status VARCHAR(50) DEFAULT 'Open',
    total_items INTEGER DEFAULT 0,
    total_value DECIMAL(12,2) DEFAULT 0,
    returned_items INTEGER DEFAULT 0,
    overdue_days INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Loan Items table
CREATE TABLE IF NOT EXISTS loan_items (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES loan_transactions(id) ON DELETE CASCADE,
    barcode VARCHAR(100) REFERENCES items(barcode),
    item_name VARCHAR(255),
    brand VARCHAR(100),
    price DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'On Loan',
    returned_at TIMESTAMP,
    return_condition VARCHAR(50),
    return_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity Logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(100),
    action_type VARCHAR(100),
    entity VARCHAR(100),
    entity_id VARCHAR(100),
    details TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INDEXES ====================

-- Items indexes
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_brand ON items(brand);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at DESC);

-- Borrowers indexes
CREATE INDEX IF NOT EXISTS idx_borrowers_nik ON borrowers(nik);
CREATE INDEX IF NOT EXISTS idx_borrowers_name ON borrowers(name);
CREATE INDEX IF NOT EXISTS idx_borrowers_active ON borrowers(is_active);

-- Loan Transactions indexes
CREATE INDEX IF NOT EXISTS idx_loan_transactions_invoice ON loan_transactions(invoice_no);
CREATE INDEX IF NOT EXISTS idx_loan_transactions_borrower ON loan_transactions(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loan_transactions_status ON loan_transactions(status);
CREATE INDEX IF NOT EXISTS idx_loan_transactions_due_date ON loan_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_loan_transactions_created ON loan_transactions(created_at DESC);

-- Loan Items indexes
CREATE INDEX IF NOT EXISTS idx_loan_items_transaction ON loan_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_loan_items_barcode ON loan_items(barcode);
CREATE INDEX IF NOT EXISTS idx_loan_items_status ON loan_items(status);

-- Activity Logs indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- ==================== FUNCTIONS & TRIGGERS ====================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_borrowers_updated_at BEFORE UPDATE ON borrowers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loan_transactions_updated_at BEFORE UPDATE ON loan_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update item status when loaned
CREATE OR REPLACE FUNCTION update_item_status_on_loan()
RETURNS TRIGGER AS $$
BEGIN
    -- Update item status to 'On Loan'
    UPDATE items 
    SET status = 'On Loan', 
        updated_at = CURRENT_TIMESTAMP 
    WHERE barcode = NEW.barcode;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_item_status_on_loan AFTER INSERT ON loan_items
    FOR EACH ROW EXECUTE FUNCTION update_item_status_on_loan();

-- Function to update item status when returned
CREATE OR REPLACE FUNCTION update_item_status_on_return()
RETURNS TRIGGER AS $$
BEGIN
    -- Update item status to 'Available'
    UPDATE items 
    SET status = 'Available', 
        updated_at = CURRENT_TIMESTAMP 
    WHERE barcode = NEW.barcode AND NEW.status = 'Returned';
    
    -- Update loan transaction stats
    UPDATE loan_transactions lt
    SET returned_items = (
        SELECT COUNT(*) 
        FROM loan_items 
        WHERE transaction_id = NEW.transaction_id AND status = 'Returned'
    )
    WHERE id = NEW.transaction_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_item_status_on_return AFTER UPDATE ON loan_items
    FOR EACH ROW 
    WHEN (OLD.status != 'Returned' AND NEW.status = 'Returned')
    EXECUTE FUNCTION update_item_status_on_return();

-- Function to update borrower loan stats
CREATE OR REPLACE FUNCTION update_borrower_loan_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment total loans for borrower
        UPDATE borrowers 
        SET total_loans = total_loans + 1,
            last_loan_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.borrower_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_borrower_loan_stats AFTER INSERT ON loan_transactions
    FOR EACH ROW EXECUTE FUNCTION update_borrower_loan_stats();

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    date_str VARCHAR;
    seq_num INTEGER;
BEGIN
    -- Get date part (YYYYMMDD)
    date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    
    -- Get sequence number for today
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM 10) AS INTEGER)), 0) + 1
    INTO seq_num
    FROM loan_transactions
    WHERE invoice_no LIKE 'INV-' || date_str || '-%';
    
    -- Set invoice number
    NEW.invoice_no := 'INV-' || date_str || '-' || LPAD(seq_num::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_generate_invoice_number BEFORE INSERT ON loan_transactions
    FOR EACH ROW 
    WHEN (NEW.invoice_no IS NULL)
    EXECUTE FUNCTION generate_invoice_number();

-- ==================== VIEWS ====================

-- View for available items
CREATE OR REPLACE VIEW vw_available_items AS
SELECT 
    i.id,
    i.barcode,
    i.item_name,
    i.brand,
    i.size,
    i.color,
    i.price,
    i.receive_no,
    i.receive_date,
    i.condition,
    i.updated_at
FROM items i
WHERE i.status = 'Available'
ORDER BY i.item_name;

-- View for active loans
CREATE OR REPLACE VIEW vw_active_loans AS
SELECT 
    lt.id,
    lt.invoice_no,
    lt.borrower_name,
    lt.program_name,
    lt.due_date,
    lt.status,
    lt.created_at,
    COUNT(li.id) as item_count,
    SUM(i.price) as total_value
FROM loan_transactions lt
LEFT JOIN loan_items li ON lt.id = li.transaction_id
LEFT JOIN items i ON li.barcode = i.barcode
WHERE lt.status = 'Open' AND li.status = 'On Loan'
GROUP BY lt.id
ORDER BY lt.due_date;

-- View for overdue loans
CREATE OR REPLACE VIEW vw_overdue_loans AS
SELECT 
    lt.id,
    lt.invoice_no,
    lt.borrower_name,
    lt.due_date,
    lt.created_at,
    COUNT(li.id) as overdue_items,
    CURRENT_DATE - lt.due_date as days_overdue
FROM loan_transactions lt
JOIN loan_items li ON lt.id = li.transaction_id
WHERE lt.status = 'Open' 
    AND li.status = 'On Loan'
    AND lt.due_date < CURRENT_DATE
GROUP BY lt.id
ORDER BY days_overdue DESC;

-- View for inventory summary
CREATE OR REPLACE VIEW vw_inventory_summary AS
SELECT 
    status,
    COUNT(*) as item_count,
    SUM(price) as total_value,
    ROUND(AVG(price), 2) as avg_price
FROM items
GROUP BY status
ORDER BY item_count DESC;

-- ==================== DEFAULT DATA ====================

-- Insert default admin user
INSERT INTO users (username, password, fullname, role) 
VALUES ('admin', 'admin123', 'Administrator', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default staff user
INSERT INTO users (username, password, fullname, role) 
VALUES ('staff', 'staff123', 'Staff User', 'staff')
ON CONFLICT (username) DO NOTHING;

-- Insert sample borrower
INSERT INTO borrowers (nik, name, phone, position, department) 
VALUES ('1234567890', 'John Doe', '081234567890', 'Manager', 'Marketing')
ON CONFLICT (nik) DO NOTHING;

-- Insert sample item
INSERT INTO items (barcode, item_name, brand, size, color, price, status) 
VALUES ('SAMPLE001', 'Sample Jacket', 'Nike', 'L', 'Black', 250000, 'Available')
ON CONFLICT (barcode) DO NOTHING;

-- ==================== COMMENTS ====================

COMMENT ON TABLE users IS 'System users for authentication and authorization';
COMMENT ON TABLE borrowers IS 'People who can borrow items from inventory';
COMMENT ON TABLE items IS 'Inventory items with all details';
COMMENT ON TABLE loan_transactions IS 'Header table for loan transactions';
COMMENT ON TABLE loan_items IS 'Detail table for loaned items';
COMMENT ON TABLE activity_logs IS 'Audit trail for all system activities';

-- ==================== GRANT PERMISSIONS ====================

-- Grant all privileges to postgres user (adjust as needed)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- Grant read-only access to reporting user (if needed)
-- CREATE USER reporter WITH PASSWORD 'report123';
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO reporter;