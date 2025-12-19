import * as XLSX from 'xlsx'
import { ExcelRow, ImportResult } from '../types'

// Parse Excel file
export const parseExcelFile = async (file: File): Promise<ExcelRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          reject(new Error('Failed to read file'))
          return
        }

        const workbook = XLSX.read(data, { type: 'binary' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet)
        
        // Validate and map data
        const mappedData = jsonData.map((row: any) => {
          // Handle different column names
          const item: ExcelRow = {
            barcode: String(row.barcode || row.Barcode || row['Kode Barcode'] || ''),
            item_name: String(row.item_name || row['Item Name'] || row.Nama || row.name || ''),
            status: String(row.status || row.Status || 'available'),
            color: String(row.color || row.Color || row.Warna || ''),
            brand: String(row.brand || row.Brand || row.Merek || ''),
            price: parseFloat(row.price || row.Price || row.Harga || 0),
            type: String(row.type || row.Type || row.Jenis || ''),
            ...row // Include all other columns
          }

          return item
        })

        // Filter out rows with empty barcode or item name
        const validData = mappedData.filter(item => 
          item.barcode.trim() && item.item_name.trim()
        )

        if (validData.length === 0) {
          reject(new Error('No valid data found in Excel file'))
          return
        }

        resolve(validData)
      } catch (error) {
        reject(new Error(`Error parsing Excel file: ${error}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('Error reading file'))
    }

    reader.readAsBinaryString(file)
  })
}

// Validate Excel structure
export const validateExcelStructure = (data: ExcelRow[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!data || data.length === 0) {
    errors.push('No data found in file')
    return { valid: false, errors }
  }

  data.forEach((row, index) => {
    const rowNumber = index + 2 // +2 because Excel rows start at 1 and header is row 1

    if (!row.barcode || row.barcode.trim() === '') {
      errors.push(`Row ${rowNumber}: Barcode is required`)
    }

    if (!row.item_name || row.item_name.trim() === '') {
      errors.push(`Row ${rowNumber}: Item name is required`)
    }

    if (row.price && (isNaN(Number(row.price)) || Number(row.price) < 0)) {
      errors.push(`Row ${rowNumber}: Price must be a valid number`)
    }
  })

  return {
    valid: errors.length === 0,
    errors
  }
}

// Export data to Excel
export const exportToExcel = (data: any[], filename: string = 'inventory_export'): void => {
  try {
    // Create workbook
    const workbook = XLSX.utils.book_new()
    
    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data)
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory')
    
    // Generate Excel file
    XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`)
  } catch (error) {
    console.error('Error exporting to Excel:', error)
    throw new Error('Failed to export to Excel')
  }
}

// Download template Excel file
export const downloadExcelTemplate = (): void => {
  const templateData = [
    {
      barcode: 'EXAMPLE001',
      item_name: 'Sample Product 1',
      status: 'available',
      color: 'Red',
      brand: 'Brand A',
      price: 100000,
      type: 'Electronics'
    },
    {
      barcode: 'EXAMPLE002',
      item_name: 'Sample Product 2',
      status: 'available',
      color: 'Blue',
      brand: 'Brand B',
      price: 150000,
      type: 'Clothing'
    }
  ]

  exportToExcel(templateData, 'inventory_template')
}

// Parse CSV file (alternative)
export const parseCSVFile = async (file: File): Promise<ExcelRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string
        const lines = csvText.split('\n')
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        
        const data: ExcelRow[] = []
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '') continue
          
          const values = lines[i].split(',')
          const row: any = {}
          
          headers.forEach((header, index) => {
            row[header] = values[index]?.trim() || ''
          })
          
          data.push({
            barcode: row.barcode || '',
            item_name: row.item_name || row['item name'] || '',
            status: row.status || 'available',
            color: row.color || '',
            brand: row.brand || '',
            price: parseFloat(row.price) || 0,
            type: row.type || ''
          })
        }
        
        resolve(data.filter(item => item.barcode && item.item_name))
      } catch (error) {
        reject(new Error(`Error parsing CSV file: ${error}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('Error reading CSV file'))
    }

    reader.readAsText(file)
  })
}

export default {
  parseExcelFile,
  validateExcelStructure,
  exportToExcel,
  downloadExcelTemplate,
  parseCSVFile
}