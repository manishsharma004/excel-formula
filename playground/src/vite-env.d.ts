/// <reference types="vite/client" />

interface Window {
  MonacoEnvironment?: { getWorker: (id: string, label: string) => Worker };
}
declare const self: Window;
