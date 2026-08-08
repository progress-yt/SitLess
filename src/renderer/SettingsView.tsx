import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  Database,
  Download,
  Image,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TimerReset,
  Upload,
  Volume2,
  VolumeX
} from 'lucide-react';
import { BUILT_IN_REMINDER_IMAGES, DEFAULT_REST_PROMPT_OPTIONS } from '../shared/defaults';
import { applyEditableSettingsPatch, cloneSettings } from '../shared/persistence';
import type {
  AppSettings,
  AppSettingsPatch,
  AppSnapshot,
  ReminderMode,
  ReminderStrength,
  ScheduleOverride,
  UpdateState,
  WeekdayKey
} from '../shared/types';
import { sitlessApi } from './api';
import { createScheduleOverrideDraft } from './scheduleOverrideDraft';
import {
  getBuiltInReminderImageUrl,
  getModeDetail,
  getModeOptionDescription,
  getModeSummary,
  getModeTitle,
  getReminderImageUrl
} from './presentation';

const WEEKDAYS: Array<{ key: WeekdayKey; label: string }> = [
  { key: 'monday', label: '周一' },
  { key: 'tuesday', label: '周二' },
  { key: 'wednesday', label: '周三' },
  { key: 'thursday', label: '周四' },
  { key: 'friday', label: '周五' },
  { key: 'saturday', label: '周六' },
  { key: 'sunday', label: '周日' }
];

export function SettingsView({ snapshot }: { snapshot: AppSnapshot }) {
  const [settings, setSettings] = useState(() => cloneSettings(snapshot.settings));
  const [modeFeedback, setModeFeedback] = useState<string | null>(null);
  const latestSnapshotSettings = useRef(snapshot.settings);
  const latestSaveVersion = useRef(0);
  const pendingSaves = useRef(0);
  const latestFailedSaveVersion = useRef<number | null>(null);
  const deferredSaves = useRef(new Map<string, { timer: number; patch: AppSettingsPatch }>());
  const isMounted = useRef(true);
  const [dataFeedback, setDataFeedback] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [newOverride, setNewOverride] = useState<ScheduleOverride>(() => createScheduleOverrideDraft());
  latestSnapshotSettings.current = snapshot.settings;

  useEffect(() => {
    if (pendingSaves.current === 0) {
      setSettings(cloneSettings(snapshot.settings));
    }
  }, [snapshot.settings.updatedAtIso]);

  useEffect(() => {
    if (!modeFeedback) {
      return;
    }
    const timer = window.setTimeout(() => setModeFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [modeFeedback]);

  useEffect(() => {
    void sitlessApi.getUpdateState().then(setUpdateState);
    return sitlessApi.onUpdateState(setUpdateState);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      deferredSaves.current.forEach(({ timer, patch }) => {
        window.clearTimeout(timer);
        void sitlessApi.updateSettings(patch);
      });
      deferredSaves.current.clear();
    };
  }, []);

  const persist = (patch: AppSettingsPatch, pendingAlreadyTracked = false) => {
    const saveVersion = latestSaveVersion.current + 1;
    latestSaveVersion.current = saveVersion;
    if (!pendingAlreadyTracked) {
      pendingSaves.current += 1;
    }

    void sitlessApi.updateSettings(patch)
      .then((next) => {
        if (isMounted.current && saveVersion === latestSaveVersion.current && pendingSaves.current === 1) {
          setSettings(cloneSettings(next));
        }
      })
      .catch(() => {
        if (saveVersion === latestSaveVersion.current) {
          latestFailedSaveVersion.current = saveVersion;
        }
      })
      .finally(() => {
        pendingSaves.current = Math.max(0, pendingSaves.current - 1);
        if (
          isMounted.current
          && pendingSaves.current === 0
          && latestFailedSaveVersion.current === latestSaveVersion.current
        ) {
          latestFailedSaveVersion.current = null;
          setSettings(cloneSettings(latestSnapshotSettings.current));
        }
      });
  };

  const save = (patch: AppSettingsPatch) => {
    setSettings((current) => applyEditableSettingsPatch(current, patch));
    persist(patch);
  };

  const saveDeferred = (key: string, patch: AppSettingsPatch) => {
    setSettings((current) => applyEditableSettingsPatch(current, patch));
    const existing = deferredSaves.current.get(key);
    if (existing) {
      window.clearTimeout(existing.timer);
    } else {
      pendingSaves.current += 1;
    }
    const timer = window.setTimeout(() => {
      deferredSaves.current.delete(key);
      persist(patch, true);
    }, 400);
    deferredSaves.current.set(key, { timer, patch });
  };

  const update = (patch: AppSettingsPatch) => {
    save(patch);
  };

  const updateLunch = (patch: Partial<AppSettings['workSchedule']['lunch']>) => {
    save({ workSchedule: { lunch: patch } });
  };

  const updateWeekday = (key: WeekdayKey, patch: Partial<AppSettings['weeklySchedule'][WeekdayKey]>) => {
    save({ weeklySchedule: { [key]: patch } });
  };

  const saveOverride = () => {
    const rest = settings.scheduleOverrides.filter((item) => item.dateKey !== newOverride.dateKey);
    save({ scheduleOverrides: [...rest, newOverride] });
  };

  const runDataOperation = async (operation: () => Promise<{ cancelled: boolean; path: string | null; restartRequired?: boolean }>) => {
    try {
      const result = await operation();
      if (!result.cancelled) {
        setDataFeedback(result.restartRequired ? '导入完成，请重启 SitLess 以加载数据。' : `已保存到 ${result.path}`);
      }
    } catch (error) {
      setDataFeedback(error instanceof Error ? error.message : '操作失败');
    }
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
          <ModeButton mode="active" current={settings.mode} onSelect={selectMode} />
          <ModeButton mode="fixed" current={settings.mode} onSelect={selectMode} />
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
                  onChange={(value) => saveDeferred('activeThresholdMinutes', { activeThresholdMinutes: value })}
                />
                <NumberField
                  label="无输入重置"
                  suffix="分钟"
                  min={1}
                  max={60}
                  value={settings.idleResetMinutes}
                  onChange={(value) => saveDeferred('idleResetMinutes', { idleResetMinutes: value })}
                />
              </>
            ) : (
              <NumberField
                label="固定间隔"
                suffix="分钟"
                min={1}
                max={240}
                value={settings.fixedIntervalMinutes}
                onChange={(value) => saveDeferred('fixedIntervalMinutes', { fixedIntervalMinutes: value })}
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
              onChange={(value) => saveDeferred('snoozeMinutes', { snoozeMinutes: value })}
            />
            <NumberField
              label="倒计时"
              suffix="秒"
              min={3}
              max={120}
              value={settings.countdownSeconds}
              onChange={(value) => saveDeferred('countdownSeconds', { countdownSeconds: value })}
            />
            <label className="field">
              <span>提醒强度</span>
              <select value={settings.reminderStrength} onChange={(event) => update({ reminderStrength: event.target.value as ReminderStrength })}>
                <option value="gentle">轻柔：超时稍后提醒</option>
                <option value="standard">标准：超时进入全屏</option>
                <option value="strong">强提醒：直接进入全屏</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <span>工作时段</span>
            <h3>每周日程</h3>
          </div>
          <Coffee size={20} />
        </div>

        <div className="weekly-schedule">
          {WEEKDAYS.map(({ key, label }) => {
            const day = settings.weeklySchedule[key];
            return (
              <div className="weekday-row" key={key}>
                <label className="weekday-toggle">
                  <input type="checkbox" checked={day.enabled} onChange={(event) => updateWeekday(key, { enabled: event.target.checked })} />
                  <span>{label}</span>
                </label>
                <input aria-label={`${label}开始时间`} type="time" disabled={!day.enabled} value={day.start} onChange={(event) => updateWeekday(key, { start: event.target.value })} />
                <input aria-label={`${label}结束时间`} type="time" disabled={!day.enabled} value={day.end} onChange={(event) => updateWeekday(key, { end: event.target.value })} />
              </div>
            );
          })}
        </div>

        <label className="toggle-row schedule-lunch-toggle">
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
          <NumberField
            label="上班稍后再问"
            suffix="分钟"
            min={1}
            max={240}
            value={settings.workdayPromptSnoozeMinutes}
            onChange={(value) => saveDeferred('workdayPromptSnoozeMinutes', { workdayPromptSnoozeMinutes: value })}
          />
          <NumberField
            label="加班无输入自动下班"
            suffix="分钟"
            min={15}
            max={240}
            value={settings.overtimeAutoEndMinutes}
            onChange={(value) => saveDeferred('overtimeAutoEndMinutes', { overtimeAutoEndMinutes: value })}
          />
        </div>
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <span>临时调整</span>
            <h3>日期例外</h3>
          </div>
          <CalendarDays size={20} />
        </div>
        <div className="override-editor">
          <label className="field">
            <span>日期</span>
            <input type="date" value={newOverride.dateKey} onChange={(event) => setNewOverride({ ...newOverride, dateKey: event.target.value })} />
          </label>
          <label className="field">
            <span>说明</span>
            <input maxLength={30} value={newOverride.label} placeholder="调休或临时值班" onChange={(event) => setNewOverride({ ...newOverride, label: event.target.value })} />
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={newOverride.enabled} onChange={(event) => setNewOverride({ ...newOverride, enabled: event.target.checked })} />
            <span>当天启用提醒</span>
          </label>
          <div className="settings-grid two">
            <TimeField label="开始" value={newOverride.start} onChange={(start) => setNewOverride({ ...newOverride, start })} />
            <TimeField label="结束" value={newOverride.end} onChange={(end) => setNewOverride({ ...newOverride, end })} />
          </div>
          <button type="button" className="primary-button" disabled={!newOverride.dateKey} onClick={saveOverride}>保存日期例外</button>
        </div>
        <div className="override-list">
          {settings.scheduleOverrides.map((override) => (
            <div key={override.dateKey}>
              <span><strong>{override.dateKey}</strong><small>{override.label || (override.enabled ? '临时工作日' : '休息日')}</small></span>
              <em>{override.enabled ? `${override.start}-${override.end}` : '不提醒'}</em>
              <button type="button" onClick={() => save({ scheduleOverrides: settings.scheduleOverrides.filter((item) => item.dateKey !== override.dateKey) })}>删除</button>
            </div>
          ))}
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
        {snapshot.imageFallbackActive ? <p className="warning-text">自定义图片不可用，已回退到内置图片。</p> : null}
        <div className="built-in-image-options" aria-label="内置提醒图片">
          {BUILT_IN_REMINDER_IMAGES.map((image) => (
            <button
              key={image.id}
              type="button"
              className={!settings.customReminderImagePath && settings.builtInReminderImageId === image.id ? 'active' : ''}
              onClick={() => sitlessApi.setBuiltInReminderImage(image.id)}
            >
              <img src={getBuiltInReminderImageUrl(image.id)} alt="" aria-hidden="true" />
              <span>
                <strong>{image.label}</strong>
                <small>{image.description}</small>
              </span>
            </button>
          ))}
        </div>
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

        <label className="toggle-row">
          <input type="checkbox" checked={settings.guidedRestEnabled} onChange={(event) => update({ guidedRestEnabled: event.target.checked })} />
          <span>全屏休息时显示引导动作</span>
        </label>

        <label className="field">
          <span>自定义标语</span>
          <input
            type="text"
            maxLength={50}
            value={settings.restPromptText}
            onChange={(event) => saveDeferred('restPromptText', { restPromptText: event.target.value })}
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

        <div className="settings-grid two">
          <NumberField
            label="最短休息"
            suffix="秒"
            min={10}
            max={1800}
            value={settings.minimumRestSeconds}
            onChange={(value) => saveDeferred('minimumRestSeconds', { minimumRestSeconds: value })}
          />
          <label className="field">
            <span>开始按钮</span>
            <input
              type="text"
              maxLength={16}
              value={settings.restStartButtonText}
              onChange={(event) => saveDeferred('restStartButtonText', { restStartButtonText: event.target.value })}
            />
          </label>
          <label className="field">
            <span>完成按钮</span>
            <input
              type="text"
              maxLength={16}
              value={settings.restCompleteButtonText}
              onChange={(event) => saveDeferred('restCompleteButtonText', { restCompleteButtonText: event.target.value })}
            />
          </label>
          <label className="field">
            <span>中断按钮</span>
            <input
              type="text"
              maxLength={16}
              value={settings.restInterruptButtonText}
              onChange={(event) => saveDeferred('restInterruptButtonText', { restInterruptButtonText: event.target.value })}
            />
          </label>
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
          <label className="toggle-row">
            <input type="checkbox" checked={settings.respectFocusContext} onChange={(event) => update({ respectFocusContext: event.target.checked })} />
            <span>全屏、演示或会议时暂缓提醒</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={settings.automaticUpdatesEnabled} onChange={(event) => update({ automaticUpdatesEnabled: event.target.checked })} />
            <span>自动检查更新</span>
          </label>
        </div>

        <div className="quick-actions">
          <button className="primary-button" type="button" onClick={() => sitlessApi.testReminderFlow()}>
            <Play size={17} />
            测试提醒流程
          </button>
          <button type="button" onClick={() => sitlessApi.checkForUpdates().then(setUpdateState)}>
            <RefreshCw size={17} />
            检查更新
          </button>
          {updateState?.status === 'downloaded' ? (
            <button type="button" onClick={() => sitlessApi.installUpdate()}>
              <Download size={17} />
              重启安装
            </button>
          ) : null}
        </div>
        {updateState ? <p className="settings-feedback">版本 {updateState.currentVersion} · {getUpdateLabel(updateState)}</p> : null}
      </section>

      <section className="workspace-panel data-tools-panel">
        <div className="panel-heading">
          <div>
            <span>本地数据</span>
            <h3>备份与诊断</h3>
          </div>
          <Database size={20} />
        </div>
        <div className="data-tool-actions">
          <button type="button" onClick={() => runDataOperation(sitlessApi.exportDataJson)}><Download size={17} />备份 JSON</button>
          <button type="button" onClick={() => runDataOperation(sitlessApi.importDataJson)}><Upload size={17} />导入备份</button>
          <button type="button" onClick={() => runDataOperation(sitlessApi.exportStatsCsv)}><Download size={17} />导出 CSV</button>
          <button type="button" onClick={() => runDataOperation(sitlessApi.exportDiagnostics)}><ShieldCheck size={17} />导出诊断</button>
        </div>
        {dataFeedback ? <p className="settings-feedback">{dataFeedback}</p> : null}
      </section>
    </div>
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
  const isActive = mode === current;
  return (
    <button type="button" className={isActive ? 'active' : ''} aria-pressed={isActive} onClick={() => onSelect(mode)}>
      {mode === 'active' ? <TimerReset size={16} /> : <Clock3 size={16} />}
      <span>
        <strong>{getModeTitle(mode)}</strong>
        <small>{getModeOptionDescription(mode)}</small>
      </span>
    </button>
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

function getUpdateLabel(state: UpdateState): string {
  const labels: Record<UpdateState['status'], string> = {
    disabled: '自动更新已关闭',
    unavailable: state.message ?? '当前不可检查更新',
    idle: '等待检查',
    checking: '正在检查更新',
    available: `发现版本 ${state.availableVersion ?? ''}`,
    downloaded: `版本 ${state.availableVersion ?? ''} 已下载`,
    'up-to-date': '已是最新版本',
    error: state.message ?? '检查更新失败'
  };
  return labels[state.status];
}
