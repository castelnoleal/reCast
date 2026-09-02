export type Time = number;

export interface CompositionSize { width: number; height: number; }
export interface Composition {
  id: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  playbackRate?: number;
  html: string;
  css?: string;
  variables?: Record<string, string | number | boolean>;
}
export interface FrameRequest { composition: Composition; frame: number; }

/** Safe, bounded render evidence suitable for crossing service/UI boundaries. */
export interface RenderFailureEvidence {
  stage?: string;
  code?: string;
  message?: string;
  retryable?: boolean;
  details?: string;
}

const SIGNED_URL = /https?:\/\/[^\s"']+(?:[?&](?:X-Amz-|Signature=|token=|sig=)|[?&](?:Expires=|Policy=))/gi;

/**
 * Mirrors the producer compatibility contract: keep useful extraction evidence,
 * but never leak signed URLs or unbounded diagnostics across a service boundary.
 */
export function sanitizeRenderFailureEvidence(input: unknown, maxLength = 1024): RenderFailureEvidence {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : { message: String(input ?? "") };
  const clean = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    return value.replace(SIGNED_URL, "[redacted-url]").replace(/\s+/g, " ").trim().slice(0, Math.max(0, maxLength));
  };
  const evidence: RenderFailureEvidence = {
    stage: clean(source.stage),
    code: clean(source.code),
    message: clean(source.message),
    details: clean(source.details ?? source.stderr ?? source.evidence),
    retryable: typeof source.retryable === "boolean" ? source.retryable : undefined
  };
  return Object.fromEntries(Object.entries(evidence).filter(([, value]) => value !== undefined)) as RenderFailureEvidence;
}

export function validatePlaybackRate(playbackRate = 1): number {
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) throw new Error("playbackRate must be greater than zero");
  return playbackRate;
}

export function frameToTime(frame: number, fps: number, playbackRate = 1): Time {
  if (!Number.isFinite(frame) || frame < 0) throw new Error("frame must be a non-negative finite number");
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be greater than zero");
  return (Math.floor(frame) / fps) * validatePlaybackRate(playbackRate);
}
export function timeToFrame(time: Time, fps: number, playbackRate = 1): number {
  if (!Number.isFinite(time) || time < 0) throw new Error("time must be a non-negative finite number");
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be greater than zero");
  return Math.round((time * fps) / validatePlaybackRate(playbackRate));
}
export function totalFrames(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration < 0) throw new Error("duration must be non-negative");
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be greater than zero");
  return Math.max(1, Math.ceil(duration * fps));
}
export function progressAtFrame(frame: number, duration: number, fps: number): number {
  const total = totalFrames(duration, fps);
  return Math.min(1, Math.max(0, frame / Math.max(1, total - 1)));
}
export function interpolate(from: number, to: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return from + (to - from) * p;
}
export function easeInOut(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[c]!));
}
export function injectRuntime(html: string, frame: number, fps: number, playbackRate = 1): string {
  const time = frameToTime(frame, fps, playbackRate);
  const runtime = `<script>window.__reCast={frame:${Math.floor(frame)},fps:${fps},time:${time},playbackRate:${validatePlaybackRate(playbackRate)}};<\/script>`;
  return html.includes("</head>") ? html.replace("</head>", runtime + "</head>") : runtime + html;
}
