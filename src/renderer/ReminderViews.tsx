import { Bell, BriefcaseBusiness, CheckCircle2, Clock3, Play, SkipForward } from 'lucide-react';
import type { AppSnapshot } from '../shared/types';
import { sitlessApi } from './api';
import { formatDuration, getFullscreenRestLabel, getReminderImageUrl } from './presentation';

export function CountdownView({ snapshot }: { snapshot: AppSnapshot }) {
  const seconds = snapshot.remainingSeconds ?? snapshot.settings.countdownSeconds;
  const countdownDurationSeconds = snapshot.countdownDurationSeconds ?? snapshot.settings.countdownSeconds;
  const percent = Math.max(0, Math.min(100, (seconds / countdownDurationSeconds) * 100));

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

export function FullscreenView({ snapshot }: { snapshot: AppSnapshot }) {
  const restState = snapshot.fullscreenRest;
  const isReady = restState?.phase === 'ready';
  const isResting = restState?.phase === 'resting';
  const primaryLabel = isReady
    ? snapshot.settings.restCompleteButtonText
    : isResting
      ? `还需 ${formatDuration(restState.remainingSeconds)}`
      : snapshot.settings.restStartButtonText;
  const primaryAction = isReady ? sitlessApi.completeRest : sitlessApi.startRest;
  const primaryIcon = isReady
    ? <CheckCircle2 size={22} />
    : isResting
      ? <Clock3 size={22} />
      : <Play size={22} />;

  return (
    <main className="fullscreen-reminder">
      <img src={getReminderImageUrl(snapshot)} alt="休息提醒" />
      <div className="fullscreen-caption">
        <span>{getFullscreenRestLabel(restState?.phase)}</span>
        <strong>{snapshot.settings.restPromptText}</strong>
        {snapshot.restExercise ? (
          <div className="rest-exercise">
            <b>{snapshot.restExercise.title}</b>
            <p>{snapshot.restExercise.instruction}</p>
          </div>
        ) : null}
      </div>
      <div className="fullscreen-actions">
        <button className="fullscreen-primary-action" type="button" disabled={isResting} onClick={primaryAction}>
          {primaryIcon}
          {primaryLabel}
        </button>
        <button className="fullscreen-secondary-action" type="button" onClick={() => sitlessApi.interruptRest()}>
          <BriefcaseBusiness size={18} />
          {snapshot.settings.restInterruptButtonText}
        </button>
      </div>
    </main>
  );
}
