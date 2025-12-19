// services/uploadService.ts
import axios from 'axios';

const API_BASE_URL = 'http://10.5.28.10:5000/api';

export interface UploadResponse {
  success: boolean;
  message: string;
  stats?: {
    added: number;
    updated: number;
    errors: number;
  };
  details?: string[];
}

export const uploadExcelFile = async (file: File, user: string): Promise<UploadResponse> => {
  try {
    console.log('Uploading file:', file.name, 'size:', file.size);
    
    const formData = new FormData();
    formData.append('excelFile', file);
    formData.append('user', user);
    
    const response = await axios.post(`${API_BASE_URL}/upload-excel`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minutes timeout for large files
    });
    
    console.log('Upload response:', response.data);
    return response.data;
    
  } catch (error: any) {
    console.error('Upload error:', error);
    throw new Error(
      error.response?.data?.message || 
      error.message || 
      'Upload failed. Please check server connection.'
    );
  }
};

export const fetchHistory = async (limit: number = 50, page: number = 1) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/history`, {
      params: { limit, page }
    });
    return response.data;
  } catch (error: any) {
    console.error('Fetch history error:', error);
    throw new Error('Failed to fetch history');
  }
};

export const fetchStats = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/stats`);
    return response.data;
  } catch (error: any) {
    console.error('Fetch stats error:', error);
    throw new Error('Failed to fetch stats');
  }
};

// Test server connection
export const testServerConnection = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/test`, {
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('Server connection test failed:', error);
    throw new Error('Cannot connect to server. Please check if server is running.');
  }
};