// types/index.ts

// Inventory Item Types
export interface InventoryItem {
  id: number;
  barcode: string;
  item_name: string;
  brand: string;
  size: string;
  color: string;
  price: number;
  status: 'Available' | 'On Loan' | 'Scanned' | 'Pending';
  receive_no: string;
  receive_date: string;
  created_at: string;
  updated_at: string;
  is_scanned?: boolean;
  scan_timestamp?: string;
  type?: string;
}

// Scan Feedback Types
export interface ScanFeedback {
  status: 'IDLE' | 'PROCESSING' | 'FOUND' | 'NOT_FOUND' | 'DUPLICATE' | 'ERROR' | 'SUCCESS';
  message: string;
  item: InventoryItem | null;
}

// Upload Response Types
export interface UploadResponse {
  success: boolean;
  message: string;
  stats?: {
    added: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  details?: string[];
}

// Stats Types
export interface InventoryStats {
  total: number;
  scanned: number;
  on_loan: number;
  available: number;
  total_items?: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Loan Transaction Types
export interface LoanTransaction {
  id: number;
  invoice_no: string;
  borrower_id: number;
  borrower_name: string;
  inputter_name: string;
  program_name: string;
  loan_reason: string;
  due_date: string;
  status: string;
  created_at: string;
  items: LoanItem[];
}

export interface LoanItem {
  id: number;
  transaction_id: number;
  barcode: string;
  status: string;
  returned_at: string | null;
  item_name: string;
  brand: string;
  color: string;
  size: string;
}

// User Types
export interface User {
  id: number;
  username: string;
  password?: string;
  fullname: string;
  nik: string;
  role: 'admin' | 'staff' | 'user';
  created_at: string;
}

// Borrower Types
export interface Borrower {
  id: number;
  nik: string;
  name: string;
  phone: string;
  position: string;
  created_at: string;
}

// Activity Log Types
export interface ActivityLog {
  id: number;
  user_name: string;
  action_type: string;
  entity: string;
  entity_id: string;
  details: string;
  created_at: string;
}

// Helper function untuk menghitung akurasi (jika diperlukan)
export const calculateAccuracy = (scanned: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((scanned / total) * 100);
};

// Helper function untuk format angka
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('id-ID').format(num);
};

// Helper function untuk format tanggal
export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

// Helper function untuk format mata uang
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};