import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

interface PieChartWidget {
  passed: number
  failed: number
  skipped: number
}

const COLORS = {
  passed: '#4caf50', // green for passed
  failed: '#f44336', // red for failed
  skipped: '#ff9800' // orange for skipped
};

const PieChartWidget: React.FC<PieChartWidget> = ({ passed, failed, skipped }) => {
  const data = [
    { name: "Passed", value: passed },
    { name: "Failed", value: failed },
    { name: "Skipped", value: skipped }
  ];

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
          label
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.name === "Passed"
                  ? COLORS.passed
                  : entry.name === "Failed"
                    ? COLORS.failed
                    : COLORS.skipped
              }
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </div>
  );
};

export default PieChartWidget
