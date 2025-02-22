import React from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  const total = passed + failed + skipped

  const rawData = [
    { name: t('testResults.passed'), value: passed },
    { name: t('testResults.failed'), value: failed },
    { name: t('testResults.skipped'), value: skipped }
  ]

  const data = rawData.filter((item) => item.value > 0)

  const legendFormatter = (value: string) => {
    const item = data.find((d) => d.name === value)
    const percentage = item && total > 0 ? ((item.value / total) * 100).toFixed(0) + '%' : ''
    return <span className="text-base font-medium">{`${value}: ${percentage}`}</span>
  }

  return (
    <div className="p-4 border rounded shadow">
      <h2 className="text-xl font-bold mb-2">{t('testResults.breakdown')}</h2>
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
                entry.name === t('testResults.passed')
                  ? COLORS.passed
                  : entry.name === t('testResults.failed')
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
