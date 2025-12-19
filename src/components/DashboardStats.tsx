// components/DashboardStats.tsx
import React from 'react';
import { calculateAccuracy, formatNumber } from '../types/index.ts';

interface DashboardStatsProps {
  total: number;
  scanned: number;
  onLoan?: number;
  available?: number;
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ 
  total, 
  scanned, 
  onLoan = 0, 
  available = 0 
}) => {
  const accuracy = calculateAccuracy(scanned, total);
  const pending = total - scanned;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <i className="fa-solid fa-chart-line text-blue-500"></i>
        Dashboard Statistics
      </h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Items Card */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-blue-600 text-sm font-medium">Total Items</p>
              <p className="text-2xl font-bold text-blue-800 mt-1">
                {formatNumber(total)}
              </p>
            </div>
            <div className="bg-blue-100 p-2 rounded-lg">
              <i className="fa-solid fa-boxes text-blue-600"></i>
            </div>
          </div>
          <div className="mt-3 text-xs text-blue-500">
            <i className="fa-solid fa-database mr-1"></i>
            Total inventory items
          </div>
        </div>

        {/* Scanned Items Card */}
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-green-600 text-sm font-medium">Scanned</p>
              <p className="text-2xl font-bold text-green-800 mt-1">
                {formatNumber(scanned)}
              </p>
            </div>
            <div className="bg-green-100 p-2 rounded-lg">
              <i className="fa-solid fa-check-circle text-green-600"></i>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-green-100 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (scanned / total) * 100 : 0}%` }}
              ></div>
            </div>
            <p className="text-xs text-green-600 mt-1">
              {accuracy}% complete
            </p>
          </div>
        </div>

        {/* Pending Items Card */}
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-yellow-600 text-sm font-medium">Pending</p>
              <p className="text-2xl font-bold text-yellow-800 mt-1">
                {formatNumber(pending)}
              </p>
            </div>
            <div className="bg-yellow-100 p-2 rounded-lg">
              <i className="fa-solid fa-clock text-yellow-600"></i>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-yellow-100 rounded-full h-2">
              <div 
                className="bg-yellow-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${total > 0 ? (pending / total) * 100 : 0}%` }}
              ></div>
            </div>
            <p className="text-xs text-yellow-600 mt-1">
              {total > 0 ? Math.round((pending / total) * 100) : 0}% remaining
            </p>
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-purple-600 text-sm font-medium">Status</p>
              <div className="flex flex-col mt-1">
                {available > 0 && (
                  <span className="text-purple-800 font-semibold">
                    Available: {formatNumber(available)}
                  </span>
                )}
                {onLoan > 0 && (
                  <span className="text-orange-600 font-semibold">
                    On Loan: {formatNumber(onLoan)}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-purple-100 p-2 rounded-lg">
              <i className="fa-solid fa-chart-pie text-purple-600"></i>
            </div>
          </div>
          <div className="mt-3 text-xs text-purple-500">
            <i className="fa-solid fa-info-circle mr-1"></i>
            Inventory status breakdown
          </div>
        </div>
      </div>

      {/* Progress Summary */}
      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Scan Progress</span>
          <span className="text-sm font-bold text-blue-600">{accuracy}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-700"
            style={{ width: `${accuracy}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>{formatNumber(scanned)} scanned</span>
          <span>{formatNumber(pending)} remaining</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <div className="text-lg font-bold text-gray-800">{total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="text-center p-2 bg-green-50 rounded-lg">
          <div className="text-lg font-bold text-green-700">{scanned}</div>
          <div className="text-xs text-green-600">Scanned</div>
        </div>
        <div className="text-center p-2 bg-yellow-50 rounded-lg">
          <div className="text-lg font-bold text-yellow-700">{pending}</div>
          <div className="text-xs text-yellow-600">Pending</div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;