import { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock3,
  Coffee,
  Image,
  Play,
  RotateCcw,
  TimerReset,
  Volume2,
  VolumeX
} from 'lucide-react';
import { BUILT_IN_REMINDER_IMAGES, DEFAULT_REST_PROMPT_OPTIONS } from '../shared/defaults';
import type { AppSettings, AppSnapshot, ReminderMode, ReminderStrength } from '../shared/types';
import { sitlessApi } from './api';
import {
  getBuiltInReminderImageUrl,
  getModeDetail,
  getModeOptionDescription,
  getModeSummary,
  getModeTitle,
  getReminderImageUrl
} from './presentation';

export function SettingsView({ snapshot }: { snapshot: AppSnapshot }) {
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
    void sitlessApi.updateSettings(next);
  };

  const update = (patch: Partial<AppSettings>) => {
    save({ ...settings, ...patch });
  };

  const updateSchedule = (patch: Partial<AppSettings['workSchedule']>) => {
    save({
      ...settings,
      workSchedule: { ...settings.workSchedule, ...patch }
    });
  };

  const updateLunch = (patch: Partial<AppSettings['workSchedule']['lunch']>) => {
    save({
      ...settings,
      workSchedule: {
        ...settings.workSchedule,
        lunch: { ...settings.workSchedule.lunch, ...patch }
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
          <NumberField
            label="上班稍后再问"
            suffix="分钟"
            min={1}
            max={240}
            value={settings.workdayPromptSnoozeMinutes}
            onChange={(value) => update({ workdayPromptSnoozeMinutes: value })}
          />
          <NumberField
            label="加班无输入自动下班"
            suffix="分钟"
            min={15}
            max={240}
            value={settings.overtimeAutoEndMinutes}
            onChange={(value) => update({ overtimeAutoEndMinutes: value })}
          />
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

        <label className="field">
          <span>自定义标语</span>
          <input
            type="text"
            maxLength={50}
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

        <div className="settings-grid two">
          <NumberField
            label="最短休息"
            suffix="秒"
            min={10}
            max={1800}
            value={settings.minimumRestSeconds}
            onChange={(value) => update({ minimumRestSeconds: value })}
          />
          <label className="field">
            <span>开始按钮</span>
            <input
              type="text"
              maxLength={16}
              value={settings.restStartButtonText}
              onChange={(event) => update({ restStartButtonText: event.target.value })}
            />
          </label>
          <label className="field">
            <span>完成按钮</span>
            <input
              type="text"
              maxLength={16}
              value={settings.restCompleteButtonText}
              onChange={(event) => update({ restCompleteButtonText: event.target.value })}
            />
          </label>
          <label className="field">
            <span>中断按钮</span>
            <input
              type="text"
              maxLength={16}
              value={settings.restInterruptButtonText}
              onChange={(event) => update({ restInterruptButtonText: event.target.value })}
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
        </div>

        <button className="primary-button" type="button" onClick={() => sitlessApi.testReminderFlow()}>
          <Play size={17} />
          测试提醒流程
        </button>
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
