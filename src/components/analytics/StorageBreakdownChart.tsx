'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const CATEGORIES = [
  { name: 'Videos', bytes: 3_758_096_384, color: '#6366f1' },
  { name: 'Photos', bytes: 1_879_048_192, color: '#0ea5e9' },
  { name: 'Audio', bytes: 536_870_912, color: '#10b981' },
  { name: 'Documents', bytes: 268_435_456, color: '#f59e0b' },
  { name: 'Other', bytes: 322_122_547, color: '#6b7280' },
];

function formatBytes(bytes: number) {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function StorageBreakdownChart() {
  const data = CATEGORIES.map((c) => ({ name: c.name, value: c.bytes, color: c.color }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any) => [formatBytes(Number(value) || 0), 'Used']}
            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
