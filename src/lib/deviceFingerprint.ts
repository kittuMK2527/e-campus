/**
 * Enterprise Client-Side Device Signature & Fingerprint Engine
 * 
 * Inspired by modern IDE machine signature systems (e.g. Cursor).
 * Captures high-entropy hardware, GPU, canvas, display, and persistent anchor tokens
 * without intrusive permissions or third-party trackers.
 */

export type DeviceType = "desktop" | "mobile";

export interface DeviceFingerprintResult {
  deviceSignature: string;
  deviceType: DeviceType;
  deviceName: string;
  components: {
    deviceUuid: string;
    os: string;
    browser: string;
    screen: string;
    gpu: string;
    language: string;
    timezone: string;
    hardwareConcurrency: number;
  };
}

const DEVICE_STORAGE_KEY = "ecampus_device_uuid";
const DEVICE_COOKIE_NAME = "ecampus_did";

/**
 * Fallback SHA-256 for environments where SubtleCrypto might be constrained
 */
async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
    try {
      const msgUint8 = new TextEncoder().encode(text);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fallback below
    }
  }

  // FNV-1a 64-bit-like fallback hash if crypto.subtle unavailable
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(32, "0");
}

/**
 * Retrieves or initializes a persistent cryptographic anchor UUID.
 * Persists in both localStorage and fallback cookie so clearing either keeps anchor intact.
 */
function getOrSetPersistentDeviceUuid(): string {
  if (typeof window === "undefined") return "server-node-env";

  let uuid: string | null = null;
  try {
    uuid = localStorage.getItem(DEVICE_STORAGE_KEY);
  } catch {
    // LocalStorage might be disabled in private browsing
  }

  if (!uuid && typeof document !== "undefined") {
    const match = document.cookie.match(new RegExp(`(?:^|; )${DEVICE_COOKIE_NAME}=([^;]*)`));
    if (match) uuid = decodeURIComponent(match[1]);
  }

  if (!uuid) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      uuid = crypto.randomUUID();
    } else {
      uuid = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 10);
    }

    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, uuid);
    } catch {}

    if (typeof document !== "undefined") {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${DEVICE_COOKIE_NAME}=${encodeURIComponent(uuid)}; path=/; expires=${expires}; SameSite=Lax`;
    }
  }

  return uuid;
}

/**
 * Parses OS and Browser for human-readable device names and classifications
 */
export function parseDeviceEnvironment(): { os: string; browser: string; deviceType: DeviceType } {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { os: "Unknown OS", browser: "Unknown Browser", deviceType: "desktop" };
  }

  const ua = navigator.userAgent || "";
  let os = "Unknown OS";
  let browser = "Unknown Browser";
  let deviceType: DeviceType = "desktop";

  // Operating System detection
  if (/Windows NT 10.0/i.test(ua)) os = "Windows 10/11";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = /iPad/i.test(ua) ? "iPadOS" : "iOS";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";

  // Browser detection
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/OPR\//i.test(ua) || /Opera\//i.test(ua)) browser = "Opera";

  // Classification: Desktop vs Mobile
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const hasTouch = typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0;
  const isSmallScreen = typeof window !== "undefined" && window.innerWidth <= 768;

  if (isMobileUa || (hasTouch && isSmallScreen)) {
    deviceType = "mobile";
  } else {
    deviceType = "desktop";
  }

  return { os, browser, deviceType };
}

/**
 * Extracts 2D Canvas rendering fingerprint
 */
function getCanvasFingerprint(): string {
  if (typeof document === "undefined") return "no-canvas";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-ctx";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial', sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("eCampus.DeviceAuth@FACEPrep 🚀 2026", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("eCampus.DeviceAuth@FACEPrep 🚀 2026", 4, 17);

    return canvas.toDataURL();
  } catch {
    return "canvas-blocked";
  }
}

/**
 * Extracts WebGL GPU Vendor and Renderer string
 */
function getWebGLFingerprint(): string {
  if (typeof document === "undefined") return "no-webgl";
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "webgl-unsupported";

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
      return `${vendor} ~ ${renderer}`.trim();
    }
    return gl.getParameter(gl.RENDERER) || "standard-webgl";
  } catch {
    return "webgl-blocked";
  }
}

/**
 * Computes the complete Device Signature and metadata payload
 */
export async function getDeviceFingerprint(): Promise<DeviceFingerprintResult> {
  const { os, browser, deviceType } = parseDeviceEnvironment();
  const deviceUuid = getOrSetPersistentDeviceUuid();
  const canvasHash = getCanvasFingerprint();
  const gpu = getWebGLFingerprint();

  let screenDim = "0x0x24";
  if (typeof window !== "undefined" && window.screen) {
    screenDim = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || 24}@${window.devicePixelRatio || 1}`;
  }

  const language = typeof navigator !== "undefined" ? navigator.language || "en" : "en";
  const timezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC";
  const hardwareConcurrency = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;

  const rawFingerprint = [
    deviceUuid,
    deviceType,
    os,
    gpu,
    screenDim,
    canvasHash.slice(0, 80),
    language,
    timezone,
    hardwareConcurrency
  ].join("###");

  const deviceSignature = await sha256Hex(rawFingerprint);
  const deviceName = `${os} · ${browser} (${deviceType === "desktop" ? "Desktop" : "Mobile"})`;

  return {
    deviceSignature,
    deviceType,
    deviceName,
    components: {
      deviceUuid,
      os,
      browser,
      screen: screenDim,
      gpu,
      language,
      timezone,
      hardwareConcurrency
    }
  };
}
