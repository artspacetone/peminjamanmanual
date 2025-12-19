export interface InventoryItem {
  id: string; // UUID from Supabase (auto-generated)
  barcode: string;
  item_name: string; 
  status: string;
  color: string;
  brand: string;
  price: number;
  type: string;
  
  // Database columns (Supabase naming)
  is_scanned: boolean;
  scan_timestamp?: string | null; // Changed to string for Supabase timestamp
  created_at?: string; // Added for database timestamp
  updated_at?: string; // Added for last update timestamp
  
  // Frontend calculated fields (optional)
  scan_date?: string; // Formatted date for display
  is_selected?: boolean; // For UI selection state
}

export type ScanResult = 
  | 'IDLE'           // Initial state
  | 'FOUND'          // Item found and marked as scanned
  | 'NOT_FOUND'      // Item not found in database
  | 'DUPLICATE'      // Item already scanned before
  | 'ERROR'          // Server/network error
  | 'PROCESSING'     // Currently processing scan
  | 'SUCCESS'        // General success state
  | 'SCANNING';      // Camera scanning in progress

export interface ScanFeedback {
  status: ScanResult;
  message: string;
  item?: InventoryItem | null;
  timestamp?: number; // When the feedback occurred
  scan_duration?: number; // How long the scan took in ms
}

export interface DashboardStats {
  total: number;
  scanned: number;
  pending: number;
  accuracy?: number; // Percentage of scanned items
  last_updated?: string;
}

export interface UploadProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
  message?: string;
}

export interface CameraConfig {
  facingMode: 'environment' | 'user';
  flash: boolean;
  zoom: number;
  autoFocus: boolean;
}

export interface ExportOptions {
  format: 'CSV' | 'EXCEL' | 'PDF';
  filter: 'ALL' | 'SCANNED' | 'PENDING';
  include_timestamp: boolean;
  filename?: string;
}

// Types for Excel/CSV parsing
export interface ExcelRow {
  barcode: string;
  item_name: string;
  status: string;
  color: string;
  brand: string;
  price: string | number;
  type: string;
  [key: string]: any; // Allow additional columns
}

export interface ImportResult {
  success: number;
  failed: number;
  duplicates: number;
  total: number;
  errors?: string[];
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
  timestamp: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort_by: string;
  order: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// UI Component Props
export interface ScannerInputProps {
  onScan: (barcode: string) => void;
  lastResult?: ScanResult;
  isProcessing?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export interface DashboardStatsProps {
  total: number;
  scanned: number;
  pending?: number;
  className?: string;
}

export interface FeedbackDisplayProps {
  feedback: ScanFeedback;
  autoClear?: boolean;
  clearTimeout?: number;
}

export interface InventoryTableProps {
  items: InventoryItem[];
  onItemClick?: (item: InventoryItem) => void;
  isLoading?: boolean;
  showActions?: boolean;
}

export interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
  autoStart?: boolean;
}

// Realtime Event Types
export interface RealtimeEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: InventoryItem;
  old_record?: InventoryItem;
  timestamp: string;
}

// User Session Types
export interface UserSession {
  id: string;
  email?: string;
  name?: string;
  last_login: string;
  permissions: string[];
}

// App Configuration
export interface AppConfig {
  auto_refresh: boolean;
  refresh_interval: number; // in seconds
  sound_enabled: boolean;
  vibration_enabled: boolean;
  camera_preferred: 'BACK' | 'FRONT';
  default_export_format: 'CSV' | 'EXCEL';
}

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

// Service Worker Types
export interface ServiceWorkerMessage {
  type: 'SYNC_DATA' | 'CACHE_UPDATED' | 'NETWORK_STATUS';
  payload: any;
}

// Performance Metrics
export interface PerformanceMetrics {
  scan_latency: number[];
  upload_speed: number[];
  api_response_time: number[];
  last_measurement: string;
}

// Type Guards
export function isInventoryItem(obj: any): obj is InventoryItem {
  return (
    obj &&
    typeof obj.id === 'string' &&
    typeof obj.barcode === 'string' &&
    typeof obj.item_name === 'string' &&
    typeof obj.is_scanned === 'boolean'
  );
}

export function isValidBarcode(barcode: string): boolean {
  return barcode.trim().length > 0 && /^[A-Za-z0-9\-_]+$/.test(barcode);
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Helper function to calculate pending items
export function calculatePending(total: number, scanned: number): number {
  return Math.max(0, total - scanned);
}

// Helper function to calculate accuracy percentage
export function calculateAccuracy(total: number, scanned: number): number {
  if (total === 0) return 0;
  return Math.round((scanned / total) * 100);
}