import Section from "./Section";
import { content } from "@/lib/content";
import { TrendingUp, TrendingDown, Activity, Moon, Heart, Zap, FileText, Dumbbell, CheckCircle, ClipboardList } from "lucide-react";

const statusColors = {
  high: "bg-green-500",
  moderate: "bg-yellow-500",
  low: "bg-red-500",
};

const sidebarIcons = [FileText, Dumbbell, CheckCircle, ClipboardList];

export default function DashboardSection() {
  return (
    <Section id="foryou" className="bg-foreground text-background py-32" fullWidth>
      <div className="container mx-auto px-6 text-center mb-16">
        <h2 className="text-4xl md:text-6xl font-display font-medium tracking-tight mb-6">
          {content.dashboard.headline}
        </h2>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
          {content.dashboard.description}
        </p>
      </div>
      
      <div className="container mx-auto px-6">
        <div className="relative bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800 p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {content.dashboard.cards.map((card, i) => (
                  <div key={i} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 hover:border-zinc-600 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">{card.title}</span>
                      <span className={`w-2 h-2 rounded-full ${statusColors[card.status as keyof typeof statusColors]}`}></span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-display font-medium text-white">{card.value}</span>
                      <span className="text-sm text-zinc-500">{card.unit}</span>
                    </div>
                    {card.trend && (
                      <div className={`flex items-center gap-1 mt-2 text-xs ${card.trend.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                        {card.trend.startsWith('+') ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        <span>{card.trend} vs last week</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-mono text-zinc-400 uppercase tracking-wider">Weekly Load Distribution</h3>
                  <div className="flex gap-4 text-xs text-zinc-500">
                    {content.dashboard.chartLabels.levels.map((level, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-blue-400' : i === 1 ? 'bg-yellow-400' : 'bg-green-400'}`}></span>
                        {level}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-end justify-between h-32 gap-2">
                  {content.dashboard.chartLabels.weeks.map((week, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div 
                        className="w-full bg-gradient-to-t from-blue-500/80 to-green-400/60 rounded-t-lg transition-all hover:opacity-80"
                        style={{ height: `${50 + (i * 15) + (i === 2 ? 20 : 0)}%` }}
                      ></div>
                      <span className="text-xs text-zinc-500">{week}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6">
                <h3 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-4">Athlete Roster</h3>
                <div className="space-y-3">
                  {content.dashboard.athletes.map((athlete, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-700/50 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                          {athlete.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm text-zinc-200">{athlete.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${athlete.readiness >= 80 ? 'bg-green-500' : athlete.readiness >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${athlete.readiness}%` }}
                          ></div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          athlete.status === 'Ready' ? 'bg-green-500/20 text-green-400' : 
                          athlete.status === 'Monitor' ? 'bg-yellow-500/20 text-yellow-400' : 
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {athlete.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {content.dashboard.sidebar.map((item, i) => {
                const Icon = sidebarIcons[i];
                return (
                  <div key={i} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 hover:border-zinc-600 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-zinc-700 rounded-lg">
                        <Icon size={16} className="text-zinc-300" />
                      </div>
                      <span className="text-sm font-medium text-zinc-200">{item.title}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-display font-medium text-white">{item.count}</span>
                      <span className="text-xs text-zinc-500">{item.label}</span>
                    </div>
                  </div>
                );
              })}

              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                <h4 className="text-sm font-medium text-zinc-200 mb-3">Progress Comparison</h4>
                <div className="space-y-2">
                  {content.dashboard.chartLabels.comparison.map((label, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{label}</span>
                      <div className="flex-1 mx-3 h-2 bg-zinc-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${i === 0 ? 'bg-zinc-500' : 'bg-green-500'}`}
                          style={{ width: i === 0 ? '65%' : '82%' }}
                        ></div>
                      </div>
                      <span className="text-xs text-zinc-400">{i === 0 ? '65%' : '82%'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
