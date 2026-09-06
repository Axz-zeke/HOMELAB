'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

type UserStat = {
  name: string;
  usedGB: number;
  quotaGB: number | null;
  percentUsed: number;
};

function QuotaBar({ percent }: { percent: number }) {
  const color = percent >= 90 ? '#ef4444' : percent >= 70 ? '#f59e0b' : '#6366f1';
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div
        className="h-2 rounded-full transition-all"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function UserQuotaChart({ stats }: { stats: UserStat[] }) {
  const data = stats.map((s) => ({
    name: s.name,
    Used: parseFloat(s.usedGB.toFixed(1)),
    Quota: s.quotaGB ? parseFloat(s.quotaGB.toFixed(1)) : 0,
    percent: s.percentUsed,
  }));

  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis unit=" GB" tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(v: any, n: any) => [`${v} GB`, String(n)]}
            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
          />
          <Bar dataKey="Quota" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Used" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.percent >= 90 ? '#ef4444' : entry.percent >= 70 ? '#f59e0b' : '#6366f1'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
