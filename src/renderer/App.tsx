import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Coffee,
  FilePenLine,
  Home,
  Image,
  LogIn,
  LogOut,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Settings2,
  SkipForward,
  Table2,
  TimerReset,
  TrendingUp,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { AppSettings, AppSnapshot, AppStatus, ReminderMode, StatsPeriod, StatsSummary } from '../shared/types';
import { sitlessApi } from './api';
import defaultReminderUrl from '../../assets/default-reminder.svg?url';
import { DEFAULT_REST_PROMPT_OPTIONS } from '../shared/defaults';

type ViewName = 'main' | 'countdown' | 'fullscreen';
type MainTab = 'home' | 'records' | 'settings';

const STATUS_LABELS: Record<AppStatus, string> = {
  'outside-schedule': '不在提醒时段',
  'lunch-break': '午休不提醒',
  'awaiting-work-start': '等待上班确认',
  counting: '计时中',
  'idle-reset': '等待键鼠活动',
  snoozed: '稍后提醒',
  paused: '已暂停',
  'muted-today': '今日不再提醒',
  'off-work': '已下班',
  countdown: '等待处理',
  fullscreen: '休息中'
};

const STATUS_DETAIL: Record<AppStatus, string> = {
  'outside-schedule': '进入工作时间后重新计时',
  'lunch-break': '午休结束后重新计时',
  'awaiting-work-start': '确认今天已上班后开始提醒',
  counting: '当前提醒规则正在运行',
  'idle-reset': '检测到离开电脑，等待新的键鼠活动',
  snoozed: '稍后会再次提醒',
  paused: '暂停结束后重新计时',
  'muted-today': '下一个工作日恢复提醒',
  'off-work': '今天已停止提醒，可继续加班提醒',
  countdown: '提醒已触发',
  fullscreen: '点击确认后重新计时'
};

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const view = getViewName();

  useEffect(() => {
    let mounted = true;
    sitlessApi.getSnapshot().then((next) => {
      if (mounted) {
        setSnapshot(next);
      }
    });
    const unsubscribe = sitlessApi.onSnapshot(setSnapshot);
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

  return <MainView snapshot={snapshot} />;
}

function MainView({ snapshot }: { snapshot: AppSnapshot }) {
  const [tab, setTab] = useState<MainTab>('home');
  const statusTone = getStatusTone(snapshot.status);

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
            <button type="button" className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>
              <Home size={16} />
              状态
            </button>
            <button type="button" className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}>
              <Table2 size={16} />
              详细记录
            </button>
            <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
              <Settings2 size={16} />
              设置
            </button>
          </div>
        </div>
      </header>

      <section className={`status-band ${statusTone}`}>
        <div>
          <span className="status-eyebrow">当前状态</span>
          <h2>{STATUS_LABELS[snapshot.status]}</h2>
        </div>
        <div className="status-time">
          <span>{getRemainingLabel(snapshot)}</span>
          <small>{snapshot.nextReminderAtIso ? `预计 ${formatClock(new Date(snapshot.nextReminderAtIso))}` : getScheduleLabel(snapshot)}</small>
        </div>
      </section>

      {tab === 'home' ? <HomeView snapshot={snapshot} /> : tab === 'records' ? <RecordsView snapshot={snapshot} /> : <SettingsView snapshot={snapshot} />}
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
            {poemFeedback ? <em>{poemFeedback}</em> : poemRefreshState.retryAfterSeconds > 0 ? <em>{poemRefreshState.retryAfterSeconds} 秒后可刷新</em> : null}
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
          <button type="button" onClick={() => snapshot.status === 'paused' ? sitlessApi.resumeReminders() : sitlessApi.pauseForHour()}>
            {snapshot.status === 'paused' ? <Play size={17} /> : <Pause size={17} />}
            {snapshot.status === 'paused' ? '继续提醒' : '暂停 1 小时'}
          </button>
          <button type="button" onClick={() => sitlessApi.muteToday()}>
            <Power size={17} />
            今日不再提醒
          </button>
        </div>
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
        </div>

        <StatsSummaryMeta summary={selectedStats} />
      </section>

    </div>
  );
}

function RecordsView({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <section className="workspace-panel detail-records-panel">
      <div className="panel-heading">
        <div>
          <span>详细记录</span>
          <h3>最近 30 天</h3>
        </div>
        <Table2 size={20} />
      </div>

      <DailyRecordsTable records={snapshot.dailyRecords} />
    </section>
  );
}

function SettingsView({ snapshot }: { snapshot: AppSnapshot }) {
  const settings = snapshot.settings;
  const [modeFeedback, setModeFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!modeFeedback) {
      return;
    }

    const timer = window.setTimeout(() => setModeFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [modeFeedback]);

  const save = (next: AppSettings) => {
    sitlessApi.updateSettings(next);
  };

  const update = (patch: Partial<AppSettings>) => {
    save({ ...settings, ...patch });
  };

  const updateSchedule = (patch: Partial<AppSettings['workSchedule']>) => {
    save({
      ...settings,
      workSchedule: {
        ...settings.workSchedule,
        ...patch
      }
    });
  };

  const updateLunch = (patch: Partial<AppSettings['workSchedule']['lunch']>) => {
    save({
      ...settings,
      workSchedule: {
        ...settings.workSchedule,
        lunch: {
          ...settings.workSchedule.lunch,
          ...patch
        }
      }
    });
  };

  const selectMode = (mode: ReminderMode) => {
    if (mode === settings.mode) {
      return;
    }

    update({ mode });
    setModeFeedback(`已切换为${getModeTitle(mode)}模式，本轮计时已重新开始`);
  };

  return (
    <div className="settings-layout">
      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <span>提醒模式</span>
            <h3>运行规则</h3>
          </div>
          <Bell size={20} />
        </div>

        <div className="mode-selector" role="group" aria-label="提醒模式">
          <ModeButton mode="active" current={settings.mode} settings={settings} onSelect={selectMode} />
          <ModeButton mode="fixed" current={settings.mode} settings={settings} onSelect={selectMode} />
        </div>

        <div className="mode-summary">
          <strong>当前：{getModeTitle(settings.mode)}模式</strong>
          <span>{getModeSummary(settings)}</span>
          <span>{getModeDetail(settings)}</span>
          {modeFeedback ? <em>{modeFeedback}</em> : null}
        </div>

        <div className="mode-config-block">
          <div className="mode-config-heading">
            <strong>{getModeTitle(settings.mode)}配置</strong>
            <span>{settings.mode === 'active' ? '只调整连续活跃模式会用到的计时条件。' : '只调整固定间隔模式会用到的提醒节奏。'}</span>
          </div>

          <div className="settings-grid two">
            {settings.mode === 'active' ? (
              <>
                <NumberField
                  label="连续活跃阈值"
                  suffix="分钟"
                  min={1}
                  max={240}
                  value={settings.activeThresholdMinutes}
                  onChange={(value) => update({ activeThresholdMinutes: value })}
                />
                <NumberField
                  label="无输入重置"
                  suffix="分钟"
                  min={1}
                  max={60}
                  value={settings.idleResetMinutes}
                  onChange={(value) => update({ idleResetMinutes: value })}
                />
              </>
            ) : (
              <NumberField
                label="固定间隔"
                suffix="分钟"
                min={1}
                max={240}
                value={settings.fixedIntervalMinutes}
                onChange={(value) => update({ fixedIntervalMinutes: value })}
              />
            )}
          </div>
        </div>

        <div className="mode-config-block">
          <div className="mode-config-heading">
            <strong>通用提醒配置</strong>
            <span>两种模式都会使用这些提醒处理规则。</span>
          </div>

          <div className="settings-grid two">
          <NumberField
            label="稍后提醒"
            suffix="分钟"
            min={1}
            max={240}
            value={settings.snoozeMinutes}
            onChange={(value) => update({ snoozeMinutes: value })}
          />
          <NumberField
            label="倒计时"
            suffix="秒"
            min={3}
            max={120}
            value={settings.countdownSeconds}
            onChange={(value) => update({ countdownSeconds: value })}
          />
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <span>工作时段</span>
            <h3>周一到周五</h3>
          </div>
          <Coffee size={20} />
        </div>

        <div className="settings-grid two">
          <TimeField label="上班" value={settings.workSchedule.start} onChange={(start) => updateSchedule({ start })} />
          <TimeField label="下班" value={settings.workSchedule.end} onChange={(end) => updateSchedule({ end })} />
        </div>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.workSchedule.lunch.enabled}
            onChange={(event) => updateLunch({ enabled: event.target.checked })}
          />
          <span>排除午休</span>
        </label>

        <div className="settings-grid two">
          <TimeField label="午休开始" value={settings.workSchedule.lunch.start} onChange={(start) => updateLunch({ start })} />
          <TimeField label="午休结束" value={settings.workSchedule.lunch.end} onChange={(end) => updateLunch({ end })} />
        </div>
      </section>

      <section className="workspace-panel image-panel">
        <div className="panel-heading">
          <div>
            <span>提醒图片</span>
            <h3>当前全屏图片</h3>
          </div>
          <Image size={20} />
        </div>

        <img className="image-preview" src={getReminderImageUrl(snapshot)} alt="当前提醒图片" />
        <div className="quick-actions">
          <button type="button" onClick={() => sitlessApi.selectReminderImage()}>
            <Image size={17} />
            更换图片
          </button>
          <button type="button" onClick={() => sitlessApi.resetReminderImage()}>
            <RotateCcw size={17} />
            恢复默认
          </button>
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <span>休息提醒</span>
            <h3>提醒标语</h3>
          </div>
          <CheckCircle2 size={20} />
        </div>

        <label className="field">
          <span>自定义标语</span>
          <input
            type="text"
            maxLength={36}
            value={settings.restPromptText}
            onChange={(event) => update({ restPromptText: event.target.value })}
          />
        </label>

        <div className="prompt-options" aria-label="默认标语">
          {DEFAULT_REST_PROMPT_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={settings.restPromptText === option ? 'active' : ''}
              onClick={() => update({ restPromptText: option })}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <span>系统</span>
            <h3>常驻设置</h3>
          </div>
          {settings.soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </div>

        <div className="settings-list">
          <label className="toggle-row">
            <input type="checkbox" checked={settings.soundEnabled} onChange={(event) => update({ soundEnabled: event.target.checked })} />
            <span>提示音</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.launchAtStartup}
              onChange={(event) => update({ launchAtStartup: event.target.checked, hasSeenStartupPrompt: true })}
            />
            <span>开机自启</span>
          </label>
        </div>

        <button className="primary-button" type="button" onClick={() => sitlessApi.testReminderFlow()}>
          <Play size={17} />
          测试提醒流程
        </button>
      </section>
    </div>
  );
}

function CountdownView({ snapshot }: { snapshot: AppSnapshot }) {
  const [seconds, setSeconds] = useState(snapshot.settings.countdownSeconds);

  useEffect(() => {
    setSeconds(snapshot.settings.countdownSeconds);
  }, [snapshot.settings.countdownSeconds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const percent = Math.max(0, Math.min(100, (seconds / snapshot.settings.countdownSeconds) * 100));

  return (
    <main className="countdown-window">
      <div className="countdown-topline">
        <Bell size={18} />
        {snapshot.settings.restPromptText}
      </div>
      <div className="countdown-number">{seconds}</div>
      <div className="countdown-track">
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className="countdown-actions">
        <button className="primary-button" type="button" onClick={() => sitlessApi.countdownAction('start-rest')}>
          <Play size={17} />
          开始休息
        </button>
        <button type="button" onClick={() => sitlessApi.countdownAction('snooze')}>
          <Clock3 size={17} />
          稍后提醒
        </button>
        <button type="button" onClick={() => sitlessApi.countdownAction('skip')}>
          <SkipForward size={17} />
          跳过本次
        </button>
      </div>
    </main>
  );
}

function FullscreenView({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <main className="fullscreen-reminder">
      <img src={getReminderImageUrl(snapshot)} alt="休息提醒" />
      <div className="fullscreen-caption">
        <span>休息提醒</span>
        <strong>{snapshot.settings.restPromptText}</strong>
      </div>
      <button type="button" onClick={() => sitlessApi.completeRest()}>
        <CheckCircle2 size={22} />
        我已起身
      </button>
    </main>
  );
}

function ModeButton({
  mode,
  current,
  settings,
  onSelect
}: {
  mode: ReminderMode;
  current: ReminderMode;
  settings: AppSettings;
  onSelect: (mode: ReminderMode) => void;
}) {
  const isActive = mode === current;

  return (
    <button type="button" className={isActive ? 'active' : ''} aria-pressed={isActive} onClick={() => onSelect(mode)}>
      {mode === 'active' ? <TimerReset size={16} /> : <Clock3 size={16} />}
      <span>
        <strong>{getModeTitle(mode)}</strong>
        <small>{getModeOptionDescription(mode, settings)}</small>
      </span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
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

function DailyRecordsTable({ records }: { records: AppSnapshot['dailyRecords'] }) {
  return (
    <div className="records-table-wrap">
      <table className="records-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>状态</th>
            <th>上班</th>
            <th>下班</th>
            <th>提醒</th>
            <th>已起身</th>
            <th>跳过</th>
            <th>完成率</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <DailyRecordRow key={record.dateKey} record={record} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyRecordRow({ record }: { record: AppSnapshot['dailyRecords'][number] }) {
  const [draft, setDraft] = useState(() => createRecordDraft(record));
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(createRecordDraft(record));
    }
  }, [isEditing, record]);

  const save = async () => {
    setIsSaving(true);
    await sitlessApi.updateDailyRecord({
      dateKey: record.dateKey,
      workStatus: draft.workStatus,
      workStartedAtIso: combineDateAndTime(record.dateKey, draft.startTime),
      workEndedAtIso: combineDateAndTime(record.dateKey, draft.endTime),
      reminders: draft.reminders,
      completed: draft.completed,
      skipped: draft.skipped
    });
    setIsSaving(false);
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(createRecordDraft(record));
    setIsEditing(false);
  };

  const completionRate = draft.reminders > 0 ? draft.completed / draft.reminders : 0;

  return (
    <>
      <tr className={isEditing ? 'record-row editing' : 'record-row'}>
        <td>
          <strong>{formatRecordDate(record.dateKey)}</strong>
          <span>{record.dateKey}</span>
        </td>
        <td>{getWorkStatusLabel(record.workStatus)}</td>
        <td>{formatIsoClock(record.workStartedAtIso)}</td>
        <td>{formatIsoClock(record.workEndedAtIso)}</td>
        <td>{record.reminders}</td>
        <td>{record.completed}</td>
        <td>{record.skipped}</td>
        <td>{formatPercent(record.completionRate)}</td>
        <td>
          <button className="record-save-button" type="button" onClick={() => setIsEditing(true)}>
            <FilePenLine size={15} />
            编辑
          </button>
        </td>
      </tr>
      {isEditing ? (
        <tr className="record-edit-row">
          <td colSpan={9}>
            <div className="record-edit-panel">
              <label>
                <span>工作状态</span>
                <select
                  className="record-status-select"
                  value={draft.workStatus}
                  onChange={(event) => setDraft({ ...draft, workStatus: event.target.value as AppSnapshot['daySession']['status'] })}
                >
                  <option value="not-started">未开始</option>
                  <option value="working">工作中</option>
                  <option value="off-work">已下班</option>
                </select>
              </label>
              <label>
                <span>上班</span>
                <input className="record-time-input" type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} />
              </label>
              <label>
                <span>下班</span>
                <input className="record-time-input" type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} />
              </label>
              <label>
                <span>提醒</span>
                <input className="record-number-input" type="number" min={0} value={draft.reminders} onChange={(event) => setDraft({ ...draft, reminders: normalizeDraftCount(event.target.value) })} />
              </label>
              <label>
                <span>已起身</span>
                <input className="record-number-input" type="number" min={0} value={draft.completed} onChange={(event) => setDraft({ ...draft, completed: normalizeDraftCount(event.target.value) })} />
              </label>
              <label>
                <span>跳过</span>
                <input className="record-number-input" type="number" min={0} value={draft.skipped} onChange={(event) => setDraft({ ...draft, skipped: normalizeDraftCount(event.target.value) })} />
              </label>
              <div className="record-edit-rate">
                <span>完成率</span>
                <strong>{formatPercent(completionRate)}</strong>
              </div>
              <div className="record-edit-actions">
                <button className="primary-button" type="button" onClick={save} disabled={isSaving}>
                  保存
                </button>
                <button type="button" onClick={cancel} disabled={isSaving}>
                  取消
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function NumberField({
  label,
  suffix,
  min,
  max,
  value,
  onChange
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="number-input">
        <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <em>{suffix}</em>
      </div>
    </label>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="time" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function getViewName(): ViewName {
  const value = new URLSearchParams(window.location.search).get('view');
  if (value === 'countdown' || value === 'fullscreen') {
    return value;
  }
  return 'main';
}

function getReminderImageUrl(snapshot: AppSnapshot): string {
  if (window.sitless) {
    return `sitless://reminder-image/current?revision=${snapshot.imageRevision}`;
  }

  return defaultReminderUrl;
}

function getStatusTone(status: AppStatus): string {
  if (status === 'counting') {
    return 'tone-active';
  }
  if (status === 'countdown' || status === 'fullscreen') {
    return 'tone-alert';
  }
  if (status === 'paused' || status === 'snoozed' || status === 'muted-today' || status === 'off-work') {
    return 'tone-paused';
  }
  return 'tone-quiet';
}

function getRemainingLabel(snapshot: AppSnapshot): string {
  if (snapshot.remainingSeconds === null) {
    if (snapshot.status === 'muted-today') {
      return '今天已关闭';
    }
    if (snapshot.status === 'awaiting-work-start') {
      return '待确认';
    }
    if (snapshot.status === 'off-work') {
      return '已结束';
    }
    if (snapshot.status === 'lunch-break') {
      return '午休中';
    }
    if (snapshot.status === 'outside-schedule') {
      return '未计时';
    }
    return STATUS_LABELS[snapshot.status];
  }

  return formatDuration(snapshot.remainingSeconds);
}

function getScheduleLabel(snapshot: AppSnapshot): string {
  if (snapshot.status === 'paused' && snapshot.pauseUntilIso) {
    return `恢复 ${formatClock(new Date(snapshot.pauseUntilIso))}`;
  }

  if (snapshot.scheduleReason === 'weekend') {
    return '周末';
  }

  if (snapshot.scheduleReason === 'lunch') {
    return `${snapshot.settings.workSchedule.lunch.start}-${snapshot.settings.workSchedule.lunch.end}`;
  }

  return `${snapshot.settings.workSchedule.start}-${snapshot.settings.workSchedule.end}`;
}

function getWorkdayLabel(snapshot: AppSnapshot): string {
  if (snapshot.daySession.status === 'working') {
    return '提醒运行中';
  }

  if (snapshot.daySession.status === 'off-work') {
    return '当天已结束';
  }

  return snapshot.scheduleReason === 'before-work' ? '上班前' : '待确认';
}

function getProgress(snapshot: AppSnapshot): number {
  const threshold = snapshot.settings.mode === 'active'
    ? snapshot.settings.activeThresholdMinutes * 60
    : snapshot.settings.fixedIntervalMinutes * 60;

  if (snapshot.status !== 'counting' || snapshot.remainingSeconds === null) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((threshold - snapshot.remainingSeconds) / threshold) * 100));
}

function getModeTitle(mode: ReminderMode): string {
  return mode === 'active' ? '连续活跃' : '固定间隔';
}

function getModeSummary(settings: AppSettings): string {
  if (settings.mode === 'active') {
    return `持续检测键盘和鼠标输入，连续活跃 ${settings.activeThresholdMinutes} 分钟后触发提醒。`;
  }

  return `从开始工作或上次处理提醒后计时，每隔 ${settings.fixedIntervalMinutes} 分钟触发一次提醒。`;
}

function getModeDetail(settings: AppSettings): string {
  if (settings.mode === 'active') {
    return `如果中途无输入超过 ${settings.idleResetMinutes} 分钟，系统会认为你离开了电脑，本轮久坐计时重新开始。适合想按真实电脑使用状态提醒的场景。`;
  }

  return '固定间隔不根据短暂空闲重置计时，提醒节奏更稳定。适合希望按固定节奏起身，或不想让键鼠检测影响提醒时间的场景。';
}

function getModeOptionDescription(mode: ReminderMode, settings: AppSettings): string {
  if (mode === 'active') {
    return `按键鼠活跃判断，离开电脑会重置`;
  }

  return `按固定分钟数提醒，不受短暂空闲影响`;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatIsoClock(value: string | null): string {
  if (!value) {
    return '--';
  }

  return formatClock(new Date(value));
}

function isoToTimeInput(value: string | null): string {
  if (!value) {
    return '';
  }

  return formatClock(new Date(value));
}

function combineDateAndTime(dateKey: string, time: string): string | null {
  if (!time) {
    return null;
  }

  return new Date(`${dateKey}T${time}:00`).toISOString();
}

function createRecordDraft(record: AppSnapshot['dailyRecords'][number]) {
  return {
    workStatus: record.workStatus,
    startTime: isoToTimeInput(record.workStartedAtIso),
    endTime: isoToTimeInput(record.workEndedAtIso),
    reminders: record.reminders,
    completed: record.completed,
    skipped: record.skipped
  };
}

function normalizeDraftCount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function formatRecordDate(dateKey: string): string {
  const [_year, month, day] = dateKey.split('-');
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function getWorkStatusLabel(status: AppSnapshot['daySession']['status']): string {
  if (status === 'working') {
    return '工作中';
  }

  if (status === 'off-work') {
    return '已下班';
  }

  return '未开始';
}

function formatPoemSource(poem: NonNullable<AppSnapshot['dailyPoem']>): string {
  const source = [poem.author, poem.title ? `《${poem.title}》` : null].filter(Boolean).join(' ');
  return source || '今日诗词';
}

function getPoemRefreshTitle(state: AppSnapshot['dailyPoemRefresh'], isRefreshing: boolean): string {
  if (isRefreshing) {
    return '正在刷新今日诗词';
  }

  if (state.retryAfterSeconds > 0) {
    return `${state.retryAfterSeconds} 秒后可再次刷新`;
  }

  return '刷新今日诗词';
}

function getPoemRefreshFeedback(status: 'refreshed' | 'fallback' | 'rate-limited' | 'busy', retryAfterSeconds: number): string {
  if (status === 'refreshed') {
    return '已刷新';
  }

  if (status === 'fallback') {
    return '远程不可用，已使用本地诗词';
  }

  if (status === 'busy') {
    return '正在刷新';
  }

  return `${retryAfterSeconds} 秒后可再次刷新`;
}

function getStatsPeriodLabel(period: StatsPeriod): string {
  if (period === 'week') {
    return '本周统计';
  }
  if (period === 'month') {
    return '本月统计';
  }
  return '今日统计';
}

function getStatsPeriodShortLabel(period: StatsPeriod): string {
  if (period === 'week') {
    return '周';
  }
  if (period === 'month') {
    return '月';
  }
  return '日';
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
