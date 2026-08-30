import type { ParsedCue } from "../types/app";

export const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const generateLocalShortCode = (ip: string) => {
  if (!ip) return "";
  const parts = ip.split('.');
  if (parts.length === 4) {
    const val = parseInt(parts[2]) * 256 + parseInt(parts[3]);
    const valStr = val.toString().padStart(5, '0');
    if (ip.startsWith("192.168.")) return `9${valStr}`;
    if (ip.startsWith("10.0.")) return `8${valStr}`;
  }
  return "";
};

export const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

export const parseSrtToCues = (content: string, offsetSeconds: number = 0) => {
  const cues: ParsedCue[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

  let currentCue: Partial<ParsedCue> = {};
  let textLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("WEBVTT")) continue;

    if (!line) {
      if (currentCue.start !== undefined && currentCue.end !== undefined && textLines.length > 0) {
         currentCue.text = textLines.join('\n');
         cues.push(currentCue as ParsedCue);
      }
      currentCue = {};
      textLines = [];
      continue;
    }

    const match = timeRegex.exec(line);
    if (match) {
      const parseTime = (h:string, m:string, s:string, ms:string) =>
        parseInt(h)*3600 + parseInt(m)*60 + parseInt(s) + parseInt(ms)/1000 + offsetSeconds;

      currentCue.start = parseTime(match[1], match[2], match[3], match[4]);
      currentCue.end = parseTime(match[5], match[6], match[7], match[8]);
    } else if (currentCue.start !== undefined) {
       textLines.push(line.replace(/<[^>]+>/g, ''));
    }
  }
  if (currentCue.start !== undefined && currentCue.end !== undefined && textLines.length > 0) {
    currentCue.text = textLines.join('\n');
    cues.push(currentCue as ParsedCue);
  }
  return cues;
};
