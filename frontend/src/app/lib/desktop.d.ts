export interface IbbobDesktopApi {
  isDesktop: boolean;
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    ibbobDesktop?: IbbobDesktopApi;
  }
}

export {};
