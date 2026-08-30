export const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window || '__TAURI__' in window);
export const isTV = typeof navigator !== 'undefined' && /(Web0S|NetCast|SmartTV|Tizen)/i.test(navigator.userAgent);
export const isWeb = !isTauri;
