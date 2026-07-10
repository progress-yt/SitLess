import { useEffect, useState } from 'react';
import { FilePenLine, Table2 } from 'lucide-react';
import type { AppSnapshot } from '../shared/types';
import { sitlessApi } from './api';
import { formatClock, formatDuration, formatPercent } from './presentation';

interface RecordDraft {
  workStatus: AppSnapshot['daySession']['status'];
  startTime: string;
  endTime: string;
  reminders: number;
  completed: number;
  skipped: number;
  snoozed: number;
  interrupted: number;
  restSeconds: number;
  longestFocusSeconds: number;
}

export function RecordsView({ snapshot }: { snapshot: AppSnapshot }) {
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
            <th>稍后</th>
            <th>中断</th>
            <th>休息时长</th>
            <th>最长久坐</th>
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
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateDraft = (patch: Partial<RecordDraft>) => {
    setDraft((current) => normalizeRecordDraft({ ...current, ...patch }));
  };

  useEffect(() => {
    if (!isEditing) {
      setDraft(createRecordDraft(record));
    }
  }, [isEditing, record]);

  const save = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await sitlessApi.updateDailyRecord({
        dateKey: record.dateKey,
        workStatus: draft.workStatus,
        workStartedAtIso: combineDateAndTime(record.dateKey, draft.startTime),
        workEndedAtIso: combineDateAndTime(record.dateKey, draft.endTime),
        reminders: draft.reminders,
        completed: draft.completed,
        skipped: draft.skipped,
        snoozed: draft.snoozed,
        interrupted: draft.interrupted,
        restSeconds: draft.restSeconds,
        longestFocusSeconds: draft.longestFocusSeconds
      });
      setIsEditing(false);
    } catch {
      setSaveError('保存失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const cancel = () => {
    setDraft(createRecordDraft(record));
    setSaveError(null);
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
        <td>{record.snoozed}</td>
        <td>{record.interrupted}</td>
        <td>{formatDuration(record.restSeconds)}</td>
        <td>{formatDuration(record.longestFocusSeconds)}</td>
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
          <td colSpan={13}>
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
              <RecordNumberField label="提醒" value={draft.reminders} onChange={(reminders) => updateDraft({ reminders })} />
              <RecordNumberField label="已起身" value={draft.completed} max={draft.reminders} onChange={(completed) => updateDraft({ completed })} />
              <RecordNumberField label="跳过" value={draft.skipped} max={draft.reminders - draft.completed} onChange={(skipped) => updateDraft({ skipped })} />
              <RecordNumberField label="稍后" value={draft.snoozed} onChange={(snoozed) => updateDraft({ snoozed })} />
              <RecordNumberField label="中断" value={draft.interrupted} onChange={(interrupted) => updateDraft({ interrupted })} />
              <RecordNumberField label="休息秒数" value={draft.restSeconds} onChange={(restSeconds) => updateDraft({ restSeconds })} />
              <RecordNumberField label="最长久坐秒数" value={draft.longestFocusSeconds} onChange={(longestFocusSeconds) => updateDraft({ longestFocusSeconds })} />
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
              {saveError ? <span className="warning-text">{saveError}</span> : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RecordNumberField({
  label,
  value,
  max,
  onChange
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        className="record-number-input"
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(normalizeDraftCount(event.target.value))}
      />
    </label>
  );
}

function formatIsoClock(value: string | null): string {
  return value ? formatClock(new Date(value)) : '--';
}

function combineDateAndTime(dateKey: string, time: string): string | null {
  return time ? new Date(`${dateKey}T${time}:00`).toISOString() : null;
}

function createRecordDraft(record: AppSnapshot['dailyRecords'][number]) {
  return normalizeRecordDraft({
    workStatus: record.workStatus,
    startTime: record.workStartedAtIso ? formatClock(new Date(record.workStartedAtIso)) : '',
    endTime: record.workEndedAtIso ? formatClock(new Date(record.workEndedAtIso)) : '',
    reminders: record.reminders,
    completed: record.completed,
    skipped: record.skipped,
    snoozed: record.snoozed,
    interrupted: record.interrupted,
    restSeconds: record.restSeconds,
    longestFocusSeconds: record.longestFocusSeconds
  });
}

function normalizeRecordDraft(draft: RecordDraft): RecordDraft {
  const reminders = normalizeDraftCount(String(draft.reminders));
  const completed = Math.min(normalizeDraftCount(String(draft.completed)), reminders);
  const skipped = Math.min(normalizeDraftCount(String(draft.skipped)), reminders - completed);

  return {
    ...draft,
    reminders,
    completed,
    skipped,
    snoozed: normalizeDraftCount(String(draft.snoozed)),
    interrupted: normalizeDraftCount(String(draft.interrupted)),
    restSeconds: normalizeDraftCount(String(draft.restSeconds)),
    longestFocusSeconds: normalizeDraftCount(String(draft.longestFocusSeconds))
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
  return status === 'working' ? '工作中' : status === 'off-work' ? '已下班' : '未开始';
}
