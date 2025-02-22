import React from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

interface PieChartWidgetProps {
  passed: number
  failed: number
  skipped: number
}

const COLORS = {
  passed: '#4caf50',
  failed: '#f44336',
  skipped: '#ff9800'
}

const PieChartWidget: React.FC<PieChartWidgetProps> = ({ passed, failed, skipped }) => {
  const total = passed + failed + skipped

  const rawData = [
    { name: 'Passed', value: passed },
    { name: 'Failed', value: failed },
    { name: 'Skipped', value: skipped }
  ]

  const data = rawData.filter((item) => item.value > 0)

  const legendFormatter = (value: string, entry: any, index: number) => {
    const item = data.find((d) => d.name === value)
    const percentage = item && total > 0 ? ((item.value / total) * 100).toFixed(0) + '%' : ''
    return <span className="text-base font-medium">{`${value}: ${percentage}`}</span>
  }

  return (
    <div className="p-4 border rounded shadow">
      <h2 className="text-xl font-bold mb-2">Test Results Breakdown</h2>
      <PieChart width={300} height={300}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          fill="#8884d8"
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.name === 'Passed'
                  ? COLORS.passed
                  : entry.name === 'Failed'
                    ? COLORS.failed
                    : COLORS.skipped
              }
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend formatter={legendFormatter} />
      </PieChart>
    </div>
  )
}

export default PieChartWidget
