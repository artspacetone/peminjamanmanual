// services/apiService.ts
import axios from 'axios';
import { InventoryItem, LoanTransaction, User, Borrower, ActivityLog, InventoryStats, ApiResponse } from '../types/index.ts';

const API_BASE_URL = 'http://10.5.28.10:5000/api';

// Configure axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ Response Error:', error.response?.status, error.config?.url);
    
    if (error.response?.status === 404) {
      console.error('Endpoint not found. Check server routes.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Server is not running or not accessible.');
    }
    
    return Promise.reject(error);
  }
);

// Inventory API
export const inventoryApi = {
  // Get all items
  getItems: async (search?: string, limit?: number) => {
    const response = await api.get('/items', {
      params: { search, limit }
    });
    return response.data;
  },

  // Get item by barcode
  getItemByBarcode: async (barcode: string) => {
    const response = await api.get(`/items/${barcode}`);
    return response.data;
  },

  // Get inventory stats
  getStats: async () => {
    const response = await api.get('/stats');
    return response.data;
  },

  // Upload Excel file
  uploadExcel: async (file: File, user: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user', user);

    const response = await api.post('/upload-excel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minutes for large files
    });
    return response.data;
  },

  // Update item status
  updateItemStatus: async (barcode: string, status: string) => {
    const response = await api.put(`/items/${barcode}/status`, { status });
    return response.data;
  },

  // Delete item
  deleteItem: async (barcode: string) => {
    const response = await api.delete(`/items/${barcode}`);
    return response.data;
  },

  // Clear all data
  clearAllData: async () => {
    const response = await api.delete('/items/all');
    return response.data;
  }
};

// Loan API
export const loanApi = {
  // Get loan history
  getHistory: async (limit?: number) => {
    const response = await api.get('/history', { params: { limit } });
    return response.data;
  },

  // Create loan
  createLoan: async (loanData: any) => {
    const response = await api.post('/loan', loanData);
    return response.data;
  },

  // Return item
  returnItem: async (barcode: string, user: string) => {
    const response = await api.post('/return', { barcode, user });
    return response.data;
  },

  // Get active loans
  getActiveLoans: async () => {
    const response = await api.get('/loans/active');
    return response.data;
  }
};

// User API
export const userApi = {
  // Login
  login: async (username: string, password: string) => {
    const response = await api.post('/login', { username, password });
    return response.data;
  },

  // Get all users
  getUsers: async () => {
    const response = await api.get('/users');
    return response.data;
  },

  // Create user
  createUser: async (userData: any) => {
    const response = await api.post('/users', userData);
    return response.data;
  },

  // Update user
  updateUser: async (id: number, userData: any) => {
    const response = await api.put(`/users/${id}`, userData);
    return response.data;
  },

  // Delete user
  deleteUser: async (id: number) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  }
};

// Borrower API
export const borrowerApi = {
  // Get all borrowers
  getBorrowers: async () => {
    const response = await api.get('/borrowers');
    return response.data;
  },

  // Create or update borrower
  upsertBorrower: async (borrowerData: any) => {
    const response = await api.post('/borrowers', borrowerData);
    return response.data;
  },

  // Delete borrower
  deleteBorrower: async (id: number) => {
    const response = await api.delete(`/borrowers/${id}`);
    return response.data;
  }
};

// Activity Log API
export const logApi = {
  // Get activity logs
  getLogs: async (limit?: number) => {
    const response = await api.get('/logs', { params: { limit } });
    return response.data;
  }
};

// System API
export const systemApi = {
  // Health check
  healthCheck: async () => {
    const response = await api.get('/health');
    return response.data;
  },

  // Test connection
  testConnection: async () => {
    const response = await api.get('/test');
    return response.data;
  },

  // Server info
  getServerInfo: async () => {
    const response = await api.get('/info');
    return response.data;
  }
};

// Helper function untuk export data
export const exportData = {
  // Export to CSV
  toCSV: (data: any[], filename: string) => {
    if (data.length === 0) {
      console.warn('No data to export');
      return;
    }

    // Get headers
    const headers = Object.keys(data[0]);
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Handle special characters
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    // Create download link
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Export to Excel (simplified)
  toExcel: (data: any[], filename: string) => {
    // This would require a library like xlsx
    console.warn('Excel export requires xlsx library');
    exportData.toCSV(data, filename.replace('.xlsx', '.csv'));
  }
};

export default api;