import { app, net, protocol } from 'electron';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUILT_IN_REMINDER_IMAGES, DEFAULT_BUILT_IN_REMINDER_IMAGE_ID } from '../shared/defaults';
import type { AppSettings, BuiltInReminderImageId, ImageSelectionResult } from '../shared/types';
import type { ReminderWindows } from './reminderWindows';

const REMINDER_IMAGE_SCHEME = 'sitless';

interface ImageSettingsStore {
  get: () => AppSettings;
  patch: (patch: Partial<AppSettings>) => AppSettings;
}

export function registerReminderImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: REMINDER_IMAGE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true
      }
    }
  ]);
}

export class ReminderImages {
  constructor(
    private readonly settingsStore: ImageSettingsStore,
    private readonly windows: ReminderWindows
  ) {}

  registerProtocolHandler(): void {
    protocol.handle(REMINDER_IMAGE_SCHEME, (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'reminder-image' || url.pathname !== '/current') {
        return new Response(null, { status: 404 });
      }
      return net.fetch(pathToFileURL(this.getCurrentPath()).toString());
    });
  }

  getCurrentPath(): string {
    const settings = this.settingsStore.get();
    if (
      settings.customReminderImagePath &&
      this.isManagedImagePath(settings.customReminderImagePath) &&
      existsSync(settings.customReminderImagePath)
    ) {
      return settings.customReminderImagePath;
    }

    return join(app.getAppPath(), 'assets', this.getBuiltIn(settings.builtInReminderImageId).assetFilename);
  }

  isFallbackActive = (): boolean => {
    const settings = this.settingsStore.get();
    return Boolean(
      settings.customReminderImagePath &&
      (!this.isManagedImagePath(settings.customReminderImagePath) || !existsSync(settings.customReminderImagePath))
    );
  };

  async select(): Promise<ImageSelectionResult> {
    const result = await this.windows.showOpenDialog({
      title: '选择提醒图片',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true, settings: this.settingsStore.get() };
    }

    const source = result.filePaths[0];
    const extension = extname(source) || '.png';
    const targetDirectory = join(app.getPath('userData'), 'images');
    mkdirSync(targetDirectory, { recursive: true });
    const target = join(targetDirectory, `reminder${extension}`);
    copyFileSync(source, target);

    return {
      cancelled: false,
      settings: this.settingsStore.patch({ customReminderImagePath: target })
    };
  }

  reset(): AppSettings {
    this.removeCurrentCustomImage();
    return this.settingsStore.patch({
      customReminderImagePath: null,
      builtInReminderImageId: DEFAULT_BUILT_IN_REMINDER_IMAGE_ID
    });
  }

  setBuiltIn(imageId: BuiltInReminderImageId): AppSettings {
    this.removeCurrentCustomImage();
    return this.settingsStore.patch({
      customReminderImagePath: null,
      builtInReminderImageId: this.getBuiltIn(imageId).id
    });
  }

  private removeCurrentCustomImage(): void {
    const path = this.settingsStore.get().customReminderImagePath;
    if (path && this.isManagedImagePath(path) && existsSync(path)) {
      rmSync(path, { force: true });
    }
  }

  private isManagedImagePath(path: string): boolean {
    const managedDirectory = resolve(app.getPath('userData'), 'images');
    const relativePath = relative(managedDirectory, resolve(path));
    return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
  }

  private getBuiltIn(imageId: BuiltInReminderImageId) {
    return BUILT_IN_REMINDER_IMAGES.find((image) => image.id === imageId) ?? BUILT_IN_REMINDER_IMAGES[0];
  }
}
