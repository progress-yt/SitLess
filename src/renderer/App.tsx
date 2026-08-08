import { useEffect, useState, type ReactNode } from 'react';
import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Clock3,
  Home,
  LogIn,
  LogOut,
  Pause,
  Play,
  Power,
  RefreshCw,
  Settings2,
  Table2,
  TimerReset,
  TrendingUp
} from 'lucide-react';
import type { AppSnapshot, HistorySnapshot, StatsPeriod, StatsSummary } from '../shared/types';
import { sitlessApi } from './api';
import { RecordsView } from './RecordsView';
import { CountdownView, FullscreenView } from './ReminderViews';
import { SettingsView } from './SettingsView';
import {
  STATUS_DETAIL,
  formatClock,
  formatDuration,
  formatPercent,
  formatPoemSource,
  getModeSummary,
  getModeTitle,
  getPoemRefreshFeedback,
  getPoemRefreshTitle,
  getProgress,
  getRemainingLabel,
  getScheduleLabel,
  getStatsPeriodLabel,
  getStatsPeriodShortLabel,
  getStatusTitle,
  getStatusTone,
  getViewName,
  getWorkdayLabel
} from './presentation';

type MainTab = 'home' | 'trend' | 'records' | 'settings';

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const view = getViewName();

  useEffect(() => {
    let mounted = true;
    void sitlessApi.getSnapshot().then((next) => {
      if (mounted) {
        setSnapshot(next);
      }
    });
    const unsubscribe = sitlessApi.onSnapshot((next) => {
      setSnapshot((current) => current ? { ...current, ...next } : current);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!snapshot) {
    return <div className="loading-screen">SitLess</div>;
  }
  if (view === 'countdown') {
    return <CountdownView snapshot={snapshot} />;
  }
  if (view === 'fullscreen') {
    return <FullscreenView snapshot={snapshot} />;
  }
  const applyHistory = (history: HistorySnapshot) => {
    setSnapshot((current) => current ? { ...current, ...history } : current);
  };
  return <MainView snapshot={snapshot} onHistory={applyHistory} />;
}

function MainView({ snapshot, onHistory }: { snapshot: AppSnapshot; onHistory: (history: HistorySnapshot) => void }) {
  const [tab, setTab] = useState<MainTab>('home');
  const statusTone = getStatusTone(snapshot.status);
  const selectTab = (next: MainTab) => {
    setTab(next);
    if (next === 'records' || next === 'trend') {
      void sitlessApi.getHistory().then(onHistory);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <TimerReset size={22} />
          </div>
          <div>
            <h1>SitLess</h1>
            <p>{STATUS_DETAIL[snapshot.status]}</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="segmented-control" role="tablist" aria-label="主界面">
            <button type="button" className={tab === 'home' ? 'active' : ''} onClick={() => selectTab('home')}>
              <Home size={16} />
              状态
            </button>
            <button type="button" className={tab === 'records' ? 'active' : ''} onClick={() => selectTab('records')}>
              <Table2 size={16} />
              详细记录
            </button>
            <button type="button" className={tab === 'trend' ? 'active' : ''} onClick={() => selectTab('trend')}>
              <ChartNoAxesCombined size={16} />
              趋势
            </button>
            <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => selectTab('settings')}>
              <Settings2 size={16} />
              设置
            </button>
          </div>
        </div>
      </header>

      <section className={`status-band ${statusTone}`}>
        <div>
          <span className="status-eyebrow">当前状态</span>
          <h2>{getStatusTitle(snapshot)}</h2>
        </div>
        <div className="status-time">
          <span>{getRemainingLabel(snapshot)}</span>
          <small>{snapshot.nextReminderAtIso ? `预计 ${formatClock(new Date(snapshot.nextReminderAtIso))}` : getScheduleLabel(snapshot)}</small>
        </div>
      </section>

      {tab === 'home'
        ? <HomeView snapshot={snapshot} />
        : tab === 'trend'
          ? <TrendView snapshot={snapshot} />
        : tab === 'records'
          ? <RecordsView snapshot={snapshot} onHistory={onHistory} />
          : <SettingsView snapshot={snapshot} />}
    </main>
  );
}

function HomeView({ snapshot }: { snapshot: AppSnapshot }) {
  const progress = getProgress(snapshot);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('day');
  const [poemFeedback, setPoemFeedback] = useState<string | null>(null);
  const [poemRefreshPending, setPoemRefreshPending] = useState(false);
  const selectedStats = snapshot.statsOverview[statsPeriod];
  const poemRefreshState = snapshot.dailyPoemRefresh;
  const isPoemRefreshing = poemRefreshPending || poemRefreshState.isRefreshing;
  const poemRefreshDisabled = isPoemRefreshing || !poemRefreshState.canRefresh;
  const poemRefreshTitle = getPoemRefreshTitle(poemRefreshState, isPoemRefreshing);

  useEffect(() => {
    if (!poemFeedback) {
      return;
    }
    const timer = window.setTimeout(() => setPoemFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [poemFeedback]);

  const refreshPoem = async () => {
    if (poemRefreshDisabled) {
      return;
    }
    setPoemRefreshPending(true);
    try {
      const result = await sitlessApi.refreshDailyPoem();
      setPoemFeedback(getPoemRefreshFeedback(result.status, result.retryAfterSeconds));
    } finally {
      setPoemRefreshPending(false);
    }
  };

  return (
    <div className="main-grid">
      <section className="workspace-panel attendance-panel">
        <div className="panel-heading">
          <div>
            <span>今日出勤</span>
            <h3>{getWorkdayLabel(snapshot)}</h3>
          </div>
          <BriefcaseBusiness size={20} />
        </div>

        <div className="attendance-actions">
          <button
            className="primary-button"
            type="button"
            disabled={snapshot.daySession.status === 'working'}
            onClick={() => sitlessApi.startWorkday()}
          >
            <LogIn size={17} />
            {snapshot.daySession.status === 'off-work' ? '继续提醒' : '我已上班'}
          </button>
          <button type="button" disabled={snapshot.daySession.status !== 'working'} onClick={() => sitlessApi.endWorkday()}>
            <LogOut size={17} />
            我已下班
          </button>
        </div>
      </section>

      {snapshot.dailyPoem ? (
        <section className="workspace-panel poem-panel">
          <div className="poem-heading">
            <span>今日诗词</span>
            <button
              className="icon-button poem-refresh-button"
              type="button"
              aria-label={poemRefreshTitle}
              title={poemRefreshTitle}
              disabled={poemRefreshDisabled}
              onClick={refreshPoem}
            >
              <RefreshCw className={isPoemRefreshing ? 'spin' : ''} size={16} />
            </button>
          </div>
          <blockquote>{snapshot.dailyPoem.content}</blockquote>
          <div className="poem-meta">
            <small>{formatPoemSource(snapshot.dailyPoem)}</small>
            {poemFeedback
              ? <em>{poemFeedback}</em>
              : poemRefreshState.retryAfterSeconds > 0
                ? <em>{poemRefreshState.retryAfterSeconds} 秒后可刷新</em>
                : null}
          </div>
        </section>
      ) : null}

      <section className="workspace-panel primary-workspace">
        <div className="panel-heading">
          <div>
            <span>提醒进度</span>
            <h3>{getModeTitle(snapshot.settings.mode)}模式</h3>
          </div>
          <Clock3 size={20} />
        </div>

        <div className="timer-display">
          <strong>{getRemainingLabel(snapshot)}</strong>
          <span>{getModeSummary(snapshot.settings)}</span>
        </div>

        <div className="progress-track" aria-label="提醒进度">
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="quick-actions">
          <button type="button" onClick={() => snapshot.status === 'paused' ? sitlessApi.resumeReminders() : sitlessApi.focusForMinutes(15)}>
            {snapshot.status === 'paused' ? <Play size={17} /> : <Pause size={17} />}
            {snapshot.status === 'paused' ? '继续提醒' : '免打扰 15 分钟'}
          </button>
          {[30, 60, 120].map((minutes) => (
            <button key={minutes} type="button" onClick={() => sitlessApi.focusForMinutes(minutes)}>
              <BriefcaseBusiness size={17} />
              {minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时`}
            </button>
          ))}
          <button type="button" onClick={() => sitlessApi.muteToday()}>
            <Power size={17} />
            今日不再提醒
          </button>
        </div>
        {snapshot.consecutiveSnoozes >= 3 ? (
          <p className="nudge-text">已连续稍后 {snapshot.consecutiveSnoozes} 次，可以临时暂停 1 小时。</p>
        ) : null}
        {snapshot.focusContext.active ? (
          <p className="context-note">已检测到 {snapshot.focusContext.appName ?? '前台应用'}，提醒计时暂缓。</p>
        ) : null}
      </section>

      <section className="workspace-panel side-context">
        <div className="panel-heading">
          <div>
            <span>统计</span>
            <h3>{getStatsPeriodLabel(statsPeriod)}</h3>
          </div>
          <TrendingUp size={20} />
        </div>

        <div className="segmented-control stats-tabs" role="group" aria-label="统计周期">
          <StatsPeriodButton period="day" current={statsPeriod} onSelect={setStatsPeriod} />
          <StatsPeriodButton period="week" current={statsPeriod} onSelect={setStatsPeriod} />
          <StatsPeriodButton period="month" current={statsPeriod} onSelect={setStatsPeriod} />
        </div>

        <div className="metric-list">
          <Metric label="提醒" value={selectedStats.reminders} />
          <Metric label="已起身" value={selectedStats.completed} />
          <Metric label="跳过" value={selectedStats.skipped} />
          <Metric label="稍后" value={selectedStats.snoozed} />
          <Metric label="中断" value={selectedStats.interrupted} />
          <Metric label="休息时长" value={formatDuration(selectedStats.restSeconds)} />
          <Metric label="最长久坐" value={formatDuration(selectedStats.longestFocusSeconds)} />
          <Metric label="连续完成" value={snapshot.currentCompletionStreak || selectedStats.currentCompletionStreak} />
        </div>

        <StatsSummaryMeta summary={selectedStats} />
      </section>
    </div>
  );
}

function TrendView({ snapshot }: { snapshot: AppSnapshot }) {
  const maxRest = Math.max(1, ...snapshot.trend.map((point) => point.restSeconds));
  const maxFocus = Math.max(1, ...snapshot.trend.map((point) => point.longestFocusSeconds));
  return (
    <section className="workspace-panel trend-panel">
      <div className="panel-heading">
        <div>
          <span>最近 14 天</span>
          <h3>休息与完成趋势</h3>
        </div>
        <TrendingUp size={20} />
      </div>
      <div className="trend-legend">
        <span><i className="completion-swatch" />完成率</span>
        <span><i className="rest-swatch" />休息时长</span>
      </div>
      <div className="trend-chart" aria-label="最近十四天趋势图">
        {snapshot.trend.map((point) => (
          <div className="trend-column" key={point.dateKey} title={`${point.dateKey} 完成 ${formatPercent(point.completionRate)}，休息 ${formatDuration(point.restSeconds)}，最长专注 ${formatDuration(point.longestFocusSeconds)}`}>
            <div className="trend-bars">
              <i className="trend-completion" style={{ height: `${Math.max(2, point.completionRate * 100)}%` }} />
              <i className="trend-rest" style={{ height: `${Math.max(2, point.restSeconds / maxRest * 100)}%` }} />
            </div>
            <span>{point.dateKey.slice(5).replace('-', '/')}</span>
          </div>
        ))}
      </div>
      <div className="trend-focus-list">
        {snapshot.trend.slice(-7).map((point) => (
          <div key={point.dateKey}>
            <span>{point.dateKey}</span>
            <i><b style={{ width: `${point.longestFocusSeconds / maxFocus * 100}%` }} /></i>
            <strong>{formatDuration(point.longestFocusSeconds)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatsPeriodButton({
  period,
  current,
  onSelect
}: {
  period: StatsPeriod;
  current: StatsPeriod;
  onSelect: (period: StatsPeriod) => void;
}) {
  return (
    <button type="button" className={period === current ? 'active' : ''} onClick={() => onSelect(period)}>
      {getStatsPeriodShortLabel(period)}
    </button>
  );
}

function StatsSummaryMeta({ summary }: { summary: StatsSummary }) {
  return (
    <div className="stats-meta">
      <div>
        <span>完成率</span>
        <strong>{formatPercent(summary.completionRate)}</strong>
      </div>
      <div>
        <span>活跃天数</span>
        <strong>{summary.activeDays}</strong>
      </div>
    </div>
  );
}
