import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Coffee,
  Home,
  Image,
  LogIn,
  LogOut,
  Pause,
  Play,
  Power,
  RotateCcw,
  Settings2,
  SkipForward,
  TimerReset,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { AppSettings, AppSnapshot, AppStatus, ReminderMode } from '../shared/types';
import { sitlessApi } from './api';
import defaultReminderUrl from '../../assets/default-reminder.svg?url';

type ViewName = 'main' | 'countdown' | 'fullscreen';
type MainTab = 'home' | 'settings';

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
          <button className="icon-text-button" type="button" onClick={() => sitlessApi.testReminderFlow()}>
            <Play size={17} />
            测试提醒
          </button>
          <div className="segmented-control" role="tablist" aria-label="主界面">
            <button type="button" className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>
              <Home size={16} />
              状态
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

      {tab === 'home' ? <HomeView snapshot={snapshot} /> : <SettingsView snapshot={snapshot} />}
    </main>
  );
}

function HomeView({ snapshot }: { snapshot: AppSnapshot }) {
  const progress = getProgress(snapshot);

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
            disabled={snapshot.workdayStatus === 'working'}
            onClick={() => sitlessApi.startWorkday()}
          >
            <LogIn size={17} />
            {snapshot.workdayStatus === 'off-work' ? '继续提醒' : '我已上班'}
          </button>
          <button type="button" disabled={snapshot.workdayStatus !== 'working'} onClick={() => sitlessApi.endWorkday()}>
            <LogOut size={17} />
            我已下班
          </button>
        </div>
      </section>

      <section className="workspace-panel primary-workspace">
        <div className="panel-heading">
          <div>
            <span>提醒进度</span>
            <h3>{snapshot.settings.mode === 'active' ? '连续活跃模式' : '固定间隔模式'}</h3>
          </div>
          <Clock3 size={20} />
        </div>

        <div className="timer-display">
          <strong>{getRemainingLabel(snapshot)}</strong>
          <span>{snapshot.settings.mode === 'active' ? '键鼠无输入超过 5 分钟会重新计时' : '按固定间隔触发提醒'}</span>
        </div>

        <div className="progress-track" aria-label="提醒进度">
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="quick-actions">
          <button type="button" onClick={() => sitlessApi.pauseForHour()}>
            <Pause size={17} />
            暂停 1 小时
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
            <span>今日统计</span>
            <h3>{formatDate(new Date(snapshot.nowIso))}</h3>
          </div>
          <CheckCircle2 size={20} />
        </div>

        <div className="metric-list">
          <Metric label="提醒" value={snapshot.todayStats.reminders} />
          <Metric label="已起身" value={snapshot.todayStats.completed} />
          <Metric label="跳过" value={snapshot.todayStats.skipped} />
        </div>
      </section>
    </div>
  );
}

function SettingsView({ snapshot }: { snapshot: AppSnapshot }) {
  const settings = snapshot.settings;

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

        <div className="segmented-control wide" role="group" aria-label="提醒模式">
          <ModeButton mode="active" current={settings.mode} onSelect={(mode) => update({ mode })} />
          <ModeButton mode="fixed" current={settings.mode} onSelect={(mode) => update({ mode })} />
        </div>

        <div className="settings-grid two">
          <NumberField
            label="连续活跃阈值"
            suffix="分钟"
            min={1}
            max={240}
            value={settings.activeThresholdMinutes}
            onChange={(value) => update({ activeThresholdMinutes: value })}
          />
          <NumberField
            label="固定间隔"
            suffix="分钟"
            min={1}
            max={240}
            value={settings.fixedIntervalMinutes}
            onChange={(value) => update({ fixedIntervalMinutes: value })}
          />
          <NumberField
            label="无输入重置"
            suffix="分钟"
            min={1}
            max={60}
            value={settings.idleResetMinutes}
            onChange={(value) => update({ idleResetMinutes: value })}
          />
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
        该起身了
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
  onSelect
}: {
  mode: ReminderMode;
  current: ReminderMode;
  onSelect: (mode: ReminderMode) => void;
}) {
  return (
    <button type="button" className={mode === current ? 'active' : ''} onClick={() => onSelect(mode)}>
      {mode === 'active' ? <TimerReset size={16} /> : <Clock3 size={16} />}
      {mode === 'active' ? '连续活跃' : '固定间隔'}
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
  if (snapshot.workdayStatus === 'working') {
    return '提醒运行中';
  }

  if (snapshot.workdayStatus === 'off-work') {
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

function formatDate(date: Date): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
