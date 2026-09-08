'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { FileCategoryBreakdown } from '@/lib/actions/analytics';

function formatBytes(bytes: number) {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

interface StorageBreakdownChartProps {
  data?: FileCategoryBreakdown[];
}

export function StorageBreakdownChart({ data = [] }: StorageBreakdownChartProps) {
  if (data.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">No files scanned yet.</p>
        <p className="text-xs">Upload files to see the storage breakdown.</p>
      </div>
    );
  }

  const chartData = data.map((c) => ({ name: c.name, value: c.bytes, color: c.color }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
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
