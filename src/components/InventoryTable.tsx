// components/InventoryTable.tsx
import React from 'react';
import { InventoryItem, formatDate, formatCurrency } from '../types/index.ts';

interface InventoryTableProps {
  items: InventoryItem[];
  onItemClick?: (item: InventoryItem) => void;
}

const InventoryTable: React.FC<InventoryTableProps> = ({ items, onItemClick }) => {
  // Handle row click
  const handleRowClick = (item: InventoryItem) => {
    if (onItemClick) {
      onItemClick(item);
    }
  };

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Available':
        return 'bg-green-100 text-green-800';
      case 'On Loan':
        return 'bg-orange-100 text-orange-800';
      case 'Scanned':
        return 'bg-blue-100 text-blue-800';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Sort items by updated_at (newest first)
  const sortedItems = [...items].sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-barcode"></i>
                Barcode
              </div>
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-tag"></i>
                Item Name
              </div>
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-briefcase"></i>
                Brand
              </div>
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-palette"></i>
                Color
              </div>
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-ruler"></i>
                Size
              </div>
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-money-bill-wave"></i>
                Price
              </div>
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-info-circle"></i>
                Status
              </div>
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-calendar"></i>
                Last Updated
              </div>
            </th>
          </tr>
        </thead>
        
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedItems.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center">
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <i className="fa-solid fa-inbox text-4xl mb-2"></i>
                  <p className="text-lg font-medium">No inventory items found</p>
                  <p className="text-sm">Upload Excel file or scan items to get started</p>
                </div>
              </td>
            </tr>
          ) : (
            sortedItems.map((item) => (
              <tr 
                key={item.id} 
                onClick={() => handleRowClick(item)}
                className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                  item.status === 'Scanned' ? 'bg-green-50/30' : ''
                }`}
              >
                {/* Barcode */}
                <td className="py-3 px-4">
                  <div className="font-mono font-bold text-gray-900">
                    {item.barcode}
                  </div>
                  {item.receive_no && (
                    <div className="text-xs text-gray-500">
                      No: {item.receive_no}
                    </div>
                  )}
                </td>
                
                {/* Item Name */}
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-900">
                    {item.item_name}
                  </div>
                  {item.receive_date && (
                    <div className="text-xs text-gray-500">
                      Received: {formatDate(item.receive_date)}
                    </div>
                  )}
                </td>
                
                {/* Brand */}
                <td className="py-3 px-4">
                  <div className="text-gray-900">
                    {item.brand || '-'}
                  </div>
                </td>
                
                {/* Color */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {item.color ? (
                      <>
                        <div 
                          className="w-4 h-4 rounded-full border border-gray-300"
                          style={{ 
                            backgroundColor: item.color.toLowerCase().includes('red') ? '#ef4444' :
                                           item.color.toLowerCase().includes('blue') ? '#3b82f6' :
                                           item.color.toLowerCase().includes('green') ? '#10b981' :
                                           item.color.toLowerCase().includes('black') ? '#000000' :
                                           item.color.toLowerCase().includes('white') ? '#ffffff' :
                                           item.color.toLowerCase().includes('yellow') ? '#fbbf24' :
                                           '#9ca3af'
                          }}
                        ></div>
                        <span>{item.color}</span>
                      </>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>
                </td>
                
                {/* Size */}
                <td className="py-3 px-4">
                  <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {item.size || '-'}
                  </div>
                </td>
                
                {/* Price */}
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-900">
                    {formatCurrency(item.price)}
                  </div>
                </td>
                
                {/* Status */}
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(item.status)}`}>
                    {item.status === 'Scanned' && (
                      <i className="fa-solid fa-check mr-1"></i>
                    )}
                    {item.status === 'On Loan' && (
                      <i className="fa-solid fa-handshake mr-1"></i>
                    )}
                    {item.status}
                  </span>
                </td>
                
                {/* Last Updated */}
                <td className="py-3 px-4">
                  <div className="text-sm text-gray-500">
                    {formatDate(item.updated_at)}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      
      {/* Summary */}
      {sortedItems.length > 0 && (
        <div className="bg-gray-50 px-4 py-3 text-xs text-gray-500 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              Showing <span className="font-bold">{sortedItems.length}</span> items
              {sortedItems.length !== items.length && ` of ${items.length}`}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Available: {items.filter(i => i.status === 'Available').length}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span>Scanned: {items.filter(i => i.status === 'Scanned').length}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span>On Loan: {items.filter(i => i.status === 'On Loan').length}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryTable;