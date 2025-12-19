import React, { useState, useMemo } from 'react'
import { InventoryItem, formatPrice, formatDate } from '../types'

interface InventoryTableProps {
  items: InventoryItem[]
  onItemClick?: (item: InventoryItem) => void
  isLoading?: boolean
  showActions?: boolean
}

const InventoryTable: React.FC<InventoryTableProps> = ({
  items,
  onItemClick,
  isLoading = false,
  showActions = true
}) => {
  const [sortField, setSortField] = useState<keyof InventoryItem>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let filtered = [...items]

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(item =>
        item.barcode.toLowerCase().includes(term) ||
        item.item_name.toLowerCase().includes(term) ||
        item.brand.toLowerCase().includes(term) ||
        item.type.toLowerCase().includes(term)
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

      if (aValue === undefined || bValue === undefined) return 0

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }

      return 0
    })

    return filtered
  }, [items, searchTerm, sortField, sortDirection])

  // Handle sort
  const handleSort = (field: keyof InventoryItem) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Handle select all
  const handleSelectAll = () => {
    if (selectedItems.size === filteredAndSortedItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredAndSortedItems.map(item => item.id)))
    }
  }

  // Handle select item
  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedItems(newSelected)
  }

  // Handle item click
  const handleItemClick = (item: InventoryItem) => {
    if (onItemClick) {
      onItemClick(item)
    }
  }

  // Get sort icon
  const getSortIcon = (field: keyof InventoryItem) => {
    if (sortField !== field) return 'fa-sort'
    return sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Table Header with Controls */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Inventory Items</h3>
            <p className="text-sm text-gray-500">
              Showing {filteredAndSortedItems.length} of {items.length} items
              {searchTerm && ` (filtered by "${searchTerm}")`}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search items..."
                className="w-full md:w-64 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <i className="fa-solid fa-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            </div>

            {/* Selected Items Actions */}
            {selectedItems.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-600 font-medium">
                  {selectedItems.size} selected
                </span>
                <button className="text-red-500 hover:text-red-700">
                  <i className="fa-solid fa-trash"></i>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading inventory...</p>
          </div>
        </div>
      ) : filteredAndSortedItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <i className="fa-solid fa-inbox text-3xl text-gray-400"></i>
          </div>
          <h4 className="text-lg font-bold text-gray-700 mb-2">No items found</h4>
          <p className="text-gray-500 text-center max-w-md">
            {searchTerm
              ? `No items match your search "${searchTerm}". Try a different search term.`
              : 'No inventory items available. Upload an Excel file to get started.'}
          </p>
        </div>
      ) : (
        /* Table Content */
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {showActions && (
                  <th className="p-4 w-12">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredAndSortedItems.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
                <th 
                  className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('barcode')}
                >
                  <div className="flex items-center gap-1">
                    Barcode
                    <i className={`fa-solid ${getSortIcon('barcode')} text-gray-400`}></i>
                  </div>
                </th>
                <th 
                  className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('item_name')}
                >
                  <div className="flex items-center gap-1">
                    Item Name
                    <i className={`fa-solid ${getSortIcon('item_name')} text-gray-400`}></i>
                  </div>
                </th>
                <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Brand/Type
                </th>
                <th 
                  className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center gap-1">
                    Price
                    <i className={`fa-solid ${getSortIcon('price')} text-gray-400`}></i>
                  </div>
                </th>
                <th 
                  className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('is_scanned')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    <i className={`fa-solid ${getSortIcon('is_scanned')} text-gray-400`}></i>
                  </div>
                </th>
                <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAndSortedItems.map((item) => (
                <tr 
                  key={item.id}
                  className={`hover:bg-blue-50 transition-colors ${selectedItems.has(item.id) ? 'bg-blue-50' : ''}`}
                >
                  {showActions && (
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                  )}
                  <td className="p-4">
                    <div 
                      className="font-mono font-bold text-blue-600 cursor-pointer hover:text-blue-800"
                      onClick={() => handleItemClick(item)}
                    >
                      {item.barcode}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{item.item_name}</div>
                    <div className="text-sm text-gray-500">{item.color}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{item.brand}</div>
                    <div className="text-sm text-gray-500">{item.type}</div>
                  </td>
                  <td className="p-4 font-bold">
                    {formatPrice(item.price)}
                  </td>
                  <td className="p-4">
                    <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                      item.is_scanned
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      <i className={`fa-solid ${item.is_scanned ? 'fa-check' : 'fa-clock'}`}></i>
                      {item.is_scanned ? 'Scanned' : 'Pending'}
                    </div>
                    {item.scan_timestamp && (
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDate(item.scan_timestamp)}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleItemClick(item)}
                        className="w-8 h-8 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 flex items-center justify-center transition-colors"
                        title="View Details"
                      >
                        <i className="fa-solid fa-eye"></i>
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(item.barcode)}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
                        title="Copy Barcode"
                      >
                        <i className="fa-solid fa-copy"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            Showing <span className="font-bold">{filteredAndSortedItems.length}</span> items
            {searchTerm && ` (filtered)`}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-xs text-gray-600">Scanned</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-xs text-gray-600">Pending</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InventoryTable