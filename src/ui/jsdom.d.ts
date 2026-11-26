declare module 'jsdom' {
  export class JSDOM {
    readonly window: Window &
      typeof globalThis & {
        close: () => void;
      };
    constructor(html?: string, options?: { url?: string; pretendToBeVisual?: boolean });
  }
}
