export type Time = number;

export interface CompositionSize {
  width: number;
  height: number;
}

export interface Composition {
  id: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  html: string;
  css?: string;
  variables?: Record<string, string | number | boolean>;
}

export interface FrameRequest {
  composition: Composition;
  frame: number;
}

export function frameToTime(frame: number, fps: number): Time {
  if (!Number.isFinite(frame) || frame < 0) throw new Error("frame must be a non-negative finite number");
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be greater than zero");
  return frame / fps;
}

export function timeToFrame(time: Time, fps: number): number {
  if (!Number.isFinite(time) || time < 0) throw new Error("time must be a non-negative finite number");
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be greater than zero");
  return Math.round(time * fps);
}

export function totalFrames(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration < 0) throw new Error("duration must be non-negative");
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be greater than zero");
  return Math.max(1, Math.ceil(duration * fps));
}

export function interpolate(from: number, to: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return from + (to - from) * p;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[c]!));
}

export function injectRuntime(html: string, frame: number, fps: number): string {
  const time = frameToTime(frame, fps);
  const runtime = `<script>window.__reCast={frame:${frame},fps:${fps},time:${time}};<\/script>`;
  return html.includes("</head>") ? html.replace("</head>", runtime + "</head>") : runtime + html;
}
