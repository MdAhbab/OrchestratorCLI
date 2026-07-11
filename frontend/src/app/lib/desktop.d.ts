export interface OrchestratorDesktopApi {
  isDesktop: boolean;
  platform: NodeJS.Platform;
}

export interface ElectronApi {
  appVersion?: string;
  installUpdate?: () => void;
  checkForUpdates?: () => void;
  onUpdateAvailable?: (
    cb: (info: { version: string }) => void,
  ) => () => void;
  onUpdateDownloaded?: (
    cb: (info: { version: string }) => void,
  ) => () => void;
  onUpdateProgress?: (
    cb: (p: { percent: number }) => void,
  ) => () => void;
  onUpdateNotAvailable?: (cb: () => void) => () => void;
  selectWorkspaceFolder?: () => Promise<string | null>;
  setTitleBarTheme?: (dark: boolean) => void;
}

declare global {
  interface Window {
    orchestratorDesktop?: OrchestratorDesktopApi;
    electronAPI?: ElectronApi;
  }
}

export {};
