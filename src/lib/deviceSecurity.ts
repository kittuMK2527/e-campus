import { generateId } from "./id";
import { roleGrantsSuperAdmin } from "./superadmin";
import { dispatchSystemNotification } from "./notifications";

export interface DeviceData {
  deviceSignature?: string | null;
  deviceType?: "desktop" | "mobile";
  deviceName?: string | null;
}

export interface DeviceEnforcementResult {
  allowed: boolean;
  code?: "DEVICE_LIMIT_EXCEEDED";
  message?: string;
  conflictData?: {
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    deviceType: "desktop" | "mobile";
    conflictDevice: string;
    attemptedDevice: string;
    firstSeenAt?: string;
    lastUsedAt?: string;
  };
}

/**
 * Checks whether a user login conforms to the 1 Desktop + 1 Mobile policy.
 * Admins and Super Admins are exempt.
 */
export async function checkAndEnforceDeviceAuthorization(
  db: any,
  user: any,
  profile: { name: string; collegeId?: string | null },
  deviceData: DeviceData,
  ip: string
): Promise<DeviceEnforcementResult> {
  // 1. Role exemption: Admins and Super Admins can log in from any number of devices
  const isAdmin = user.role === "admin" || user.role === "super_admin" || roleGrantsSuperAdmin(user.role);
  if (isAdmin) {
    return { allowed: true };
  }

  const deviceType: "desktop" | "mobile" = deviceData.deviceType === "mobile" ? "mobile" : "desktop";
  const deviceSignature = (deviceData.deviceSignature || "").trim();
  const deviceName = (deviceData.deviceName || "").trim() || `${deviceType === "desktop" ? "Desktop" : "Mobile"} Device`;
  const nowStr = new Date().toISOString();

  // If no client signature provided (e.g. legacy or curl client), generate an IP/UA-anchored pseudo signature
  const effectiveSignature = deviceSignature || `fallback_${deviceType}_${ip}`;

  // 2. Query currently active authorized device for this user and device type
  const authorizedDevice = await db.get(
    `SELECT * FROM user_authorized_devices 
     WHERE user_id = ? AND device_type = ? AND is_active = TRUE 
     ORDER BY last_used_at DESC LIMIT 1`,
    [user.id, deviceType]
  );

  // Case A: No device registered yet for this slot -> Authorize and register
  if (!authorizedDevice) {
    const newDevId = generateId("dev");
    await db.run(
      `INSERT INTO user_authorized_devices (
        id, user_id, device_type, device_signature, device_name, ip_address, first_seen_at, last_used_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [newDevId, user.id, deviceType, effectiveSignature, deviceName, ip, nowStr, nowStr]
    );
    return { allowed: true };
  }

  // Case B: Same device signature -> Update activity timestamp & allow
  if (authorizedDevice.device_signature === effectiveSignature) {
    await db.run(
      `UPDATE user_authorized_devices 
       SET last_used_at = ?, ip_address = ?, device_name = ?
       WHERE id = ?`,
      [nowStr, ip, deviceName, authorizedDevice.id]
    );
    return { allowed: true };
  }

  // Case C: Conflict — Another device is already authorized for this device type!
  // Record security incident in device_security_logs
  const secLogId = generateId("sec");
  await db.run(
    `INSERT INTO device_security_logs (
      id, user_id, attempted_type, device_signature, device_name, ip_address, active_conflict_device, status, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'blocked', ?)`,
    [secLogId, user.id, deviceType, effectiveSignature, deviceName, ip, authorizedDevice.device_name, nowStr]
  ).catch((e: any) => console.warn("[deviceSecurity] failed to log security event:", e));

  // Dispatch immediate Admin notification via in-app bell & outbox
  try {
    await dispatchSystemNotification(db, {
      roles: ["admin"],
      title: `Security Alert: Device Limit Reached (${profile.name || user.email})`,
      message: `User ${profile.name || user.email} (${user.role}) was blocked attempting to log in from a new ${deviceType} (${deviceName}, IP: ${ip}). An active authorized ${deviceType} (${authorizedDevice.device_name}) is already registered.`,
      link: `/admin/users?deviceUserId=${user.id}`,
      type: "warning",
      domain: "security",
      dedupeKey: `sec_dev_${user.id}_${nowStr.slice(0, 13)}`, // dedupe within same hour
      payload: {
        userId: user.id,
        userName: profile.name,
        userEmail: user.email,
        userRole: user.role,
        deviceType,
        attemptedDevice: deviceName,
        authorizedDevice: authorizedDevice.device_name,
        ip
      }
    });
  } catch (errNotif) {
    console.warn("[deviceSecurity] failed to dispatch admin notification:", errNotif);
  }

  return {
    allowed: false,
    code: "DEVICE_LIMIT_EXCEEDED",
    message: `Account is already authorized on another ${deviceType === "desktop" ? "Desktop/Laptop" : "Mobile"} device (${authorizedDevice.device_name}). To switch devices, contact your administrator to reset your registered device.`,
    conflictData: {
      userId: user.id,
      userName: profile.name,
      userEmail: user.email,
      userRole: user.role,
      deviceType,
      conflictDevice: authorizedDevice.device_name,
      attemptedDevice: deviceName,
      firstSeenAt: authorizedDevice.first_seen_at,
      lastUsedAt: authorizedDevice.last_used_at
    }
  };
}

/**
 * Retrieves all registered authorized devices for a user.
 */
export async function getUserAuthorizedDevices(db: any, userId: string): Promise<any[]> {
  return await db.all(
    `SELECT * FROM user_authorized_devices 
     WHERE user_id = ? 
     ORDER BY is_active DESC, last_used_at DESC`,
    [userId]
  );
}

/**
 * Resets (revokes) authorized devices for a user.
 * Can reset a specific device type ('desktop' or 'mobile') or 'all'.
 */
export async function resetUserAuthorizedDevices(
  db: any,
  userId: string,
  deviceType: "desktop" | "mobile" | "all",
  revokedBy: string = "admin"
): Promise<{ success: boolean; revokedCount: number }> {
  const nowStr = new Date().toISOString();
  let res;

  if (deviceType === "all") {
    res = await db.run(
      `UPDATE user_authorized_devices 
       SET is_active = FALSE, revoked_at = ?, revoked_by = ? 
       WHERE user_id = ? AND is_active = TRUE`,
      [nowStr, revokedBy, userId]
    );
  } else {
    res = await db.run(
      `UPDATE user_authorized_devices 
       SET is_active = FALSE, revoked_at = ?, revoked_by = ? 
       WHERE user_id = ? AND device_type = ? AND is_active = TRUE`,
      [nowStr, revokedBy, userId, deviceType]
    );
  }

  // Also revoke active sessions for this user so old device is logged out immediately
  await db.run(
    `UPDATE user_sessions 
     SET is_revoked = TRUE, revoked_at = ?, revoked_reason = 'device_authorization_reset'
     WHERE user_id = ? AND is_revoked = FALSE`,
    [nowStr, userId]
  ).catch(() => {});

  return { success: true, revokedCount: res?.changes || 1 };
}
