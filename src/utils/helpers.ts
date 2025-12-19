/**
 * Utility functions for Stock Opname Pro
 */

// Format timestamp to readable date
export const formatTimestamp = (timestamp?: string | null): string => {
  if (!timestamp) return '-'
  
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

// Format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Debounce function
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Throttle function
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

// Generate unique ID
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Validate email
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate URL
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// Copy text to clipboard
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('Failed to copy text:', err)
    
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      return true
    } catch (fallbackErr) {
      console.error('Fallback copy failed:', fallbackErr)
      return false
    }
  }
}

// Download file
export const downloadFile = (content: string, filename: string, type: string = 'text/plain'): void => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Parse CSV string
export const parseCSV = (csvText: string): any[] => {
  const lines = csvText.split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  
  return lines.slice(1).map(line => {
    const values = line.split(',')
    const obj: any = {}
    
    headers.forEach((header, index) => {
      obj[header] = values[index]?.trim() || ''
    })
    
    return obj
  })
}

// Convert object to CSV
export const objectToCSV = (data: any[]): string => {
  if (data.length === 0) return ''
  
  const headers = Object.keys(data[0])
  const csvRows = [headers.join(',')]
  
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header]
      return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
    })
    csvRows.push(values.join(','))
  })
  
  return csvRows.join('\n')
}

// Calculate percentage
export const calculatePercentage = (part: number, total: number): number => {
  if (total === 0) return 0
  return Math.round((part / total) * 100)
}

// Sleep/delay function
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Retry function with exponential backoff
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i)
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`)
        await sleep(delay)
      }
    }
  }
  
  throw lastError
}

// Generate color from string (for avatars, etc.)
export const stringToColor = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  let color = '#'
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF
    color += ('00' + value.toString(16)).substr(-2)
  }
  
  return color
}

// Get contrast color (black or white) for background
export const getContrastColor = (hexColor: string): 'black' | 'white' => {
  // Convert hex to RGB
  const r = parseInt(hexColor.substr(1, 2), 16)
  const g = parseInt(hexColor.substr(3, 2), 16)
  const b = parseInt(hexColor.substr(5, 2), 16)
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  
  return luminance > 0.5 ? 'black' : 'white'
}

// Truncate text with ellipsis
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return text.substr(0, maxLength) + '...'
}

// Format number with commas
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('id-ID').format(num)
}

// Get browser information
export const getBrowserInfo = (): {
  name: string
  version: string
  platform: string
  isMobile: boolean
} => {
  const ua = navigator.userAgent
  let name = 'Unknown'
  let version = 'Unknown'
  
  // Detect browser
  if (ua.includes('Firefox')) {
    name = 'Firefox'
    version = ua.match(/Firefox\/([0-9.]+)/)?.[1] || 'Unknown'
  } else if (ua.includes('Chrome') && !ua.includes('Edg')) {
    name = 'Chrome'
    version = ua.match(/Chrome\/([0-9.]+)/)?.[1] || 'Unknown'
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    name = 'Safari'
    version = ua.match(/Version\/([0-9.]+)/)?.[1] || 'Unknown'
  } else if (ua.includes('Edg')) {
    name = 'Edge'
    version = ua.match(/Edg\/([0-9.]+)/)?.[1] || 'Unknown'
  }
  
  // Detect platform
  const platform = navigator.platform
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  
  return { name, version, platform, isMobile }
}

// Check if running on localhost
export const isLocalhost = (): boolean => {
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname.startsWith('192.168.')
}

// Create a data URL from a string
export const createDataURL = (content: string, type: string = 'text/plain'): string => {
  return `data:${type};charset=utf-8,${encodeURIComponent(content)}`
}

// Remove duplicate objects from array by key
export const removeDuplicates = <T>(array: T[], key: keyof T): T[] => {
  const seen = new Set()
  return array.filter(item => {
    const value = item[key]
    if (seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}

// Group array of objects by key
export const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
  return array.reduce((groups, item) => {
    const value = String(item[key])
    if (!groups[value]) {
      groups[value] = []
    }
    groups[value].push(item)
    return groups
  }, {} as Record<string, T[]>)
}

// Deep clone object
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj))
}

// Merge objects deeply
export const deepMerge = <T extends Record<string, any>>(target: T, source: Partial<T>): T => {
  const output = { ...target }
  
  Object.keys(source).forEach(key => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key as keyof T] = deepMerge(target[key] || {}, source[key] as any)
    } else {
      output[key as keyof T] = source[key] as any
    }
  })
  
  return output
}

export default {
  formatTimestamp,
  formatFileSize,
  debounce,
  throttle,
  generateId,
  isValidEmail,
  isValidUrl,
  copyToClipboard,
  downloadFile,
  parseCSV,
  objectToCSV,
  calculatePercentage,
  sleep,
  retryWithBackoff,
  stringToColor,
  getContrastColor,
  truncateText,
  formatNumber,
  getBrowserInfo,
  isLocalhost,
  createDataURL,
  removeDuplicates,
  groupBy,
  deepClone,
  deepMerge
}