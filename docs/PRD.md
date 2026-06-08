# SitLess Windows 久坐提醒软件 PRD

## Problem Statement

个人用户在工作日长时间使用 Windows 电脑时，容易连续久坐而没有明确打断点。普通闹钟或系统通知容易被忽略，强制锁屏又过于激进。用户需要一个本地运行、轻量可控、只在工作时间生效的久坐提醒工具，在不打扰非工作时段的前提下，用逐级提醒的方式促使自己起身活动。

## Solution

SitLess 是一个个人 Windows 桌面端久坐提醒软件。软件托盘常驻，默认在周一到周五工作时间内运行，并排除可配置午休时间。默认提醒模式为“连续活跃使用达到阈值后提醒”，也支持切换为“固定间隔提醒”。

提醒触发后，软件先发出 Windows 系统通知和轻提示音，再显示置顶倒计时小窗。倒计时默认 10 秒。如果用户未处理，软件在主显示器全屏显示当前提醒图片，图片等比铺满屏幕，用户点击“我已起身”后退出全屏并重新计时。

所有配置和统计数据保存在本地 JSON 文件中。第一版只展示今日统计，但按日期保存历史数据，为后续趋势功能预留空间。

## User Stories

1. As a Windows user, I want the app to run as a desktop application, so that it can use tray, notification, startup, and fullscreen reminder capabilities.
2. As a personal user, I want the app to work without an account, so that my reminder settings stay local and simple.
3. As a user, I want the app to live in the system tray, so that it can remind me without occupying my taskbar.
4. As a user, I want the app to ask whether to enable startup on first launch, so that I can choose whether reminders start automatically with Windows.
5. As a user, I want to enable or disable startup later in settings, so that I can change my mind.
6. As a user, I want reminders to run only Monday to Friday, so that weekends do not trigger work reminders.
7. As a user, I want one shared work schedule for Monday to Friday, so that setup is simple.
8. As a user, I want default work hours of 09:00-18:00, so that the app works with a common office schedule immediately.
9. As a user, I want to edit start and end work times, so that reminders match my actual schedule.
10. As a user, I want lunch break time to be configurable, so that reminders do not fire during lunch.
11. As a user, I want the default lunch break to be excluded, so that the app does not interrupt typical midday rest.
12. As a user, I want the timer to reset when entering work time, so that non-work activity does not count toward the first reminder.
13. As a user, I want no reminders outside work time or lunch break, so that the app does not disturb me during personal time.
14. As a user, I want the default mode to detect continuous active computer usage, so that reminders reflect actual sitting-at-computer behavior.
15. As a user, I want keyboard or mouse input to count as active use, so that normal computer work is detected.
16. As a user, I want the active timer to reset after 5 minutes of no input, so that time away from the computer does not count as sitting.
17. As a user, I want the default active-use threshold to be 45 minutes, so that reminders happen before I sit too long.
18. As a user, I want a fixed interval reminder mode, so that I can use a simpler reminder rhythm if I prefer.
19. As a user, I want fixed interval mode to follow the same work time and lunch break limits, so that mode switching does not change schedule behavior.
20. As a user, I want fixed interval mode to default to 45 minutes, so that it behaves similarly to active-use mode.
21. As a user, I want a system notification before stronger interruption, so that I get a soft warning first.
22. As a user, I want a light notification sound by default, so that I notice the reminder.
23. As a user, I want to turn reminder sound off, so that the app is acceptable in quiet office environments.
24. As a user, I want a topmost countdown window after the notification, so that I have a clear chance to respond before fullscreen display.
25. As a user, I want countdown duration to default to 10 seconds, so that the reminder escalates quickly.
26. As a user, I want the countdown window to offer “开始休息”, so that I can immediately enter the rest screen.
27. As a user, I want the countdown window to offer “稍后提醒”, so that I can delay the reminder when I am in the middle of something.
28. As a user, I want the countdown window to offer “跳过本次”, so that I can intentionally skip a reminder.
29. As a user, I want “稍后提醒” to default to 10 minutes, so that delaying does not disable the reminder indefinitely.
30. As a user, I want “跳过本次” to count in today’s skipped reminders, so that my statistics remain honest.
31. As a user, I want “跳过本次” to restart the current reminder cycle, so that I am not immediately reminded again.
32. As a user, I want countdown timeout to show a fullscreen image on the main display, so that the reminder becomes hard to ignore.
33. As a user, I want fullscreen display to cover only the primary monitor, so that secondary screens are not covered in the first version.
34. As a user, I want the fullscreen image to use the built-in default image at first, so that the app works without setup.
35. As a user, I want to replace the current reminder image with a local image, so that the reminder feels personal.
36. As a user, I want only one current reminder image, so that image management stays simple.
37. As a user, I want the fullscreen image to fill the screen proportionally with cropping if needed, so that it looks polished.
38. As a user, I want fullscreen mode to show only “我已起身” as the normal exit action, so that the reminder focuses on standing up.
39. As a user, I want clicking “我已起身” to exit fullscreen, so that I can return to work after acknowledging the break.
40. As a user, I want clicking “我已起身” to count as a completed rest, so that the app tracks my successful breaks.
41. As a user, I want reminder counting to restart after completing a rest, so that the next cycle starts cleanly.
42. As a user, I want the tray menu to include opening the main window, so that I can access settings quickly.
43. As a user, I want the tray menu to include “暂停 1 小时”, so that I can avoid reminders during temporary focus periods.
44. As a user, I want the tray menu to include “今日不再提醒”, so that I can disable reminders for the rest of the workday.
45. As a user, I want the tray menu to include exit, so that I can close the application.
46. As a user, I want the home screen to show current reminder status, so that I know whether reminders are active, paused, or outside work time.
47. As a user, I want the home screen to show today’s reminder count, completed rest count, and skipped count, so that I can see my daily behavior.
48. As a user, I want the home screen to show estimated time until the next reminder, so that I understand what the app is doing.
49. As a user, I want pause state and resume time visible in the home screen and tray, so that I do not mistake a paused app for a broken app.
50. As a user, I want a settings page for mode, schedule, reminders, image, sound, and startup, so that all important controls are in one place.
51. As a user, I want a “测试提醒流程” button, so that I can verify notification, countdown, and fullscreen behavior without waiting 45 minutes.
52. As a user, I want settings stored locally, so that my preferences persist without cloud services.
53. As a user, I want statistics stored locally by date, so that future versions can show trends without data migration.
54. As a privacy-conscious user, I want no camera, cloud, or account dependency, so that the app does not collect sensitive personal data.
55. As a user, I want a Windows installer, so that installation feels like a normal desktop app.

## Implementation Decisions

- The first version targets Windows desktop only.
- The app is a personal local tool, not a team or enterprise product.
- The chosen technical stack is Electron + React + TypeScript.
- The app will be packaged as a Windows `.exe` installer, likely through Electron Builder.
- The Electron main process owns OS integration: tray, startup setting, Windows notifications, global activity/idle detection, reminder scheduling, persistence, and creation of countdown/fullscreen windows.
- The renderer owns app UI: home status, settings, countdown window, fullscreen reminder view, and image preview.
- The default reminder mode is continuous active-use detection.
- The app also supports fixed interval reminder mode as a user-selectable alternative.
- Only one reminder mode is active at a time.
- Both reminder modes are gated by the same schedule rules.
- Schedule rules for v1 are Monday-Friday only, with weekends disabled.
- Monday-Friday use one shared work-time range.
- Default work time is 09:00-18:00.
- Lunch break is configurable and excluded from reminders.
- The default lunch break is 12:00-13:30.
- Outside valid reminder time, the app does not remind and does not continue accumulating reminder time.
- When a valid reminder period starts, the timer begins from that moment.
- In continuous active mode, keyboard or mouse input counts as activity.
- If there is no keyboard or mouse input for more than 5 minutes, the active-use timer resets.
- The continuous active-use reminder threshold defaults to 45 minutes.
- The fixed interval reminder defaults to 45 minutes.
- Snooze defaults to 10 minutes.
- Reminder escalation flow is: system notification -> topmost countdown window -> primary-display fullscreen image.
- Notification and countdown use a light sound by default.
- Sound can be disabled in settings.
- Countdown duration defaults to 10 seconds.
- Countdown actions are “开始休息”, “稍后提醒”, and “跳过本次”.
- “开始休息” immediately opens fullscreen reminder mode.
- “稍后提醒” delays the reminder by the configured snooze duration.
- “跳过本次” increments today’s skip count and restarts the reminder cycle.
- Countdown timeout opens fullscreen reminder mode.
- Fullscreen reminder mode opens only on the primary display.
- Fullscreen reminder mode displays the current reminder image.
- The app ships with one built-in default reminder image.
- The user can replace the current reminder image with one local image.
- v1 does not manage multiple reminder images, random image selection, or image galleries.
- The image display mode is proportional cover: fill the screen while preserving aspect ratio, cropping if necessary.
- Fullscreen reminder mode exposes only the normal action “我已起身”.
- Clicking “我已起身” exits fullscreen, increments today’s completed rest count, and restarts the reminder cycle.
- The tray menu includes: open main window, pause 1 hour, do not remind again today, and exit.
- Pause state and resume time are visible in both the home screen and tray representation.
- The app has a home screen and a settings page.
- Home screen displays current state, today’s statistics, and estimated time until next reminder.
- Settings include reminder mode, work time, lunch time, reminder thresholds, snooze, current image, sound, startup, and test reminder flow.
- Settings are stored in local JSON.
- Statistics are stored in local JSON grouped by date.
- v1 UI displays only today’s statistics: reminder count, completed rest count, and skipped count.
- Historical statistics are still persisted by date to avoid future migration when trend views are added.

## Testing Decisions

- Tests should focus on externally visible behavior and state transitions, not private implementation details.
- The highest-value test seam is the reminder scheduler/state machine, using fake time and fake activity events.
- Schedule evaluation should be tested separately: weekday gating, weekend exclusion, work-time boundaries, lunch exclusion, and entering work time with timer reset.
- Continuous active-use behavior should be tested with fake keyboard/mouse activity and idle gaps longer than 5 minutes.
- Fixed interval behavior should be tested with fake time and the same schedule gates.
- Reminder escalation should be tested as a state flow: due -> notified -> countdown -> fullscreen -> completed.
- Countdown actions should be tested: start rest, snooze, skip, and timeout.
- Statistics aggregation should be tested through user-visible events: reminder fired, rest completed, skipped.
- Persistence should be tested for reading defaults, saving settings, loading saved settings, and grouped-by-date statistics.
- UI tests should cover the home screen status, today’s statistics, settings controls, image replacement preview, and test reminder button.
- Electron integration should be smoke-tested manually or with an E2E harness for tray behavior, Windows notification, primary-display fullscreen window, and startup setting.
- The “测试提醒流程” button should be used as an acceptance test path during manual QA because it exercises the full reminder escalation without waiting for the normal threshold.

## Out of Scope

- macOS, Linux, Web/PWA, and mobile app support.
- Team management, admin dashboard, reports for other users, or enterprise policy control.
- Accounts, cloud sync, remote storage, or online image fetching.
- Camera, posture detection, Bluetooth device detection, or physical standing verification.
- Automatic meeting, screen-sharing, or full-screen-app detection.
- Covering all monitors during fullscreen reminder.
- Multiple reminder images, random image selection, slideshow, image folders, or built-in gallery management.
- In-app image cropping tools or fit-mode customization.
- Full historical charts, weekly reports, streaks, or analytics dashboards.
- Auto-update in the first packaged version.
- Forced lock screen, input blocking, or OS-level prevention of closing the app.
- Separate per-day schedule configuration or multiple custom no-reminder time ranges.

## Further Notes

- Product behavior should stay understandable: at any moment the user should be able to tell whether reminders are active, paused, outside schedule, snoozed, or waiting for the next threshold.
- The app should avoid treating non-work time as debt. If the user uses the computer before work starts, that time should not cause an immediate reminder once work time begins.
- Because the app is intentionally local-first, the default implementation should not require network access after installation.
- The first version should prioritize reliable reminder timing and clear state handling over visual complexity.
