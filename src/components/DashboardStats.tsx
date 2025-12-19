import React, { useEffect, useState } from 'react'
import { DashboardStatsProps, calculatePending, calculateAccuracy } from '../types'

const DashboardStats: React.FC<DashboardStatsProps> = ({
  total,
  scanned,
  pending: pendingProp,
  className = ''
}) => {
  const [animatedScanned, setAnimatedScanned] = useState(0)
  const [animatedTotal, setAnimatedTotal] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<string>('')

  const pending = pendingProp || calculatePending(total, scanned)
  const accuracy = calculateAccuracy(total, scanned)

  useEffect(() => {
    const duration = 1000
    const steps = 60
    const stepDuration = duration / steps
    let step = 0
    const timer = setInterval(() => {
      step++
      const progress = step / steps
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      setAnimatedScanned(Math.floor(scanned * easeOutQuart))
      setAnimatedTotal(Math.floor(total * easeOutQuart))
      if (step >= steps) {
        clearInterval(timer)
        setAnimatedScanned(scanned)
        setAnimatedTotal(total)
      }
    }, stepDuration)
    setLastUpdate(new Date().toLocaleTimeString('id-ID'))
    return () => clearInterval(timer)
  }, [total, scanned])

  const getAccuracyColor = () => accuracy >= 80 ? 'text-green-600' : accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'
  const getAccuracyIcon = () => accuracy >= 80 ? 'fa-trophy' : accuracy >= 50 ? 'fa-chart-line' : 'fa-chart-bar'
  const getProgressPercentage = () => total === 0 ? 0 : (scanned / total) * 100

  return (
    <div className={`bg-white rounded-2xl shadow-lg border border-gray-200 p-6 ${className}`}>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Inventory Overview</h2>
          <p className="text-sm text-gray-500">Real-time statistics</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Last updated</p>
          <p className="text-sm font-mono font-bold text-blue-600">{lastUpdate}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <p className="text-2xl font-bold text-blue-700">{animatedTotal}</p>
          <p className="text-xs text-blue-600">Total Items</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-2xl font-bold text-green-700">{animatedScanned}</p>
          <p className="text-xs text-green-600">Scanned</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
          <p className="text-2xl font-bold text-orange-700">{pending}</p>
          <p className="text-xs text-orange-600">Pending</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
          <p className={`text-2xl font-bold ${getAccuracyColor()}`}>{accuracy}%</p>
          <p className="text-xs text-purple-600">Accuracy</p>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div className="bg-blue-600 h-full transition-all duration-1000" style={{ width: `${getProgressPercentage()}%` }}></div>
      </div>
    </div>
  )
}

// --- BAGIAN INI SANGAT PENTING: ---
export default DashboardStats;