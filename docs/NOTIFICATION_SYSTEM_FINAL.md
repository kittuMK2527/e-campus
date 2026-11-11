# Notification System - Final Configuration

## 🎯 Current Behavior

### ✅ APP NOTIFICATIONS (Bell Icon) - ENABLED
When a notification arrives:
1. **Bell icon badge** updates with unread count
2. **Bell icon shakes** for 1.2 seconds
3. **Chime sound** plays (subtle D5 → A5 tone)
4. **NO toast popup** appears
5. User must **click bell icon** to see notifications

### ❌ TOAST NOTIFICATIONS - DISABLED
- Floating toast popups **do NOT appear** for incoming notifications
- Toasts **only used** for user action confirmations (e.g., "Form submitted successfully")
- SSE notification handler **does NOT trigger toasts**

### 🔔 DEVICE NOTIFICATIONS - OPTIONAL
- User can enable via permission banner in NotificationsView
- Shows native OS notifications (Windows Action Center, macOS Notification Center, Android/iOS)
- Works when app is closed/minimized
- Requires browser permission grant

---

## 📋 Notification Audit by Role

See `NOTIFICATION_AUDIT_BY_ROLE.md` for complete details.

### Quick Summary:

**STUDENT** (5 types):
- Leave request decisions
- Interview results published
- Exam marks published
- Announcements
- Course materials uploaded

**MENTOR** (7 types):
- Handover/swap requests
- Handover decisions
- Weekly plan approved
- Faculty leave decisions
- L&D demo reschedule
- L&D reallocation
- Approval decisions

**CM** (6 types):
- Day order config reminders
- Student leave requests
- Faculty handover requests
- Emergency cover requests
- L&D reschedule requests
- Announcements

**KAM** (2 types):
- CM leave requests
- College escalations

**ADMIN** (4+ types):
- All requests (global visibility)
- Feedback reports
- System alerts
- L&D demo activity

**SME** (3 types):
- L&D demo on hold
- L&D reallocation proposed
- L&D reallocation approved

---

## 🔄 Notification Flow

```
1. API Event (e.g., mentor submits handover request)
   ↓
2. dispatchSystemNotification(db, { roles: ["cm"], ... })
   ↓
3. Writes to notifications table
   ↓
4. Writes to event_outbox table
   ↓
5. Fires PostgreSQL pg_notify
   ↓
6. SSE pushes event to connected clients
   ↓
7. DashboardLayout receives event
   ↓
8. Updates bell badge count
   ↓
9. Shakes bell icon
   ↓
10. Plays chime sound
   ↓
11. User clicks bell → sees notification
```

**No Toast Popup at any step!**

---

## 🛠️ Technical Implementation

### SSE Notification Handler (DashboardLayout.tsx)

```typescript
} else if (event.domain === "notifications") {
  // Invalidate notifications query so bell badge updates immediately
  queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
  if (notificationsUserId) {
    queryClient.invalidateQueries({ queryKey: qk.notificationsFull(notificationsUserId) });
  }
  setBellShake(true);
  playNotificationChime();
  // NO TOAST HERE - removed in fix
  // Device notification still fires (optional, requires permission)
  sendDeviceSystemNotification({
    title: event.payload.title,
    message: event.payload.message,
    link: event.payload.link,
    tag: event.payload.id,
  });
  setTimeout(() => setBellShake(false), 1200);
}
```

### Bell Icon Badge (DashboardLayout.tsx)

```typescript
{hasUnread && (
  <span className="absolute -top-1 -right-1 h-4 w-4 bg-rose-500 border-2 border-white rounded-full text-[9px] font-black text-white flex items-center justify-center">
    {unreadCount > 9 ? "9+" : unreadCount}
  </span>
)}
```

### Notification List (NotificationsView.tsx)

- Full-page notification center
- Mark as read (individual)
- Mark all as read (bulk)
- Navigate to relevant page on click
- Shows last 50 notifications
- Real-time updates via SSE + BroadcastChannel

---

## 🎨 User Experience

### When Notification Arrives:

**What User Sees:**
- Bell icon badge number increases
- Bell icon shakes briefly
- Hear subtle chime sound
- **NO floating toast popup**

**What User Does:**
- Click bell icon to open dropdown
- See notification title & message
- Click notification to navigate
- Or click "Mark All as Read"

### When User Enables Device Notifications:

**What User Sees:**
- Permission prompt from browser
- If granted: test notification appears
- Future notifications show as OS notifications
- Works even when browser is closed

---

## 🔒 Security

- **User-scoped**: Users can only read their own notifications (except admins)
- **Role-based**: Notifications target specific roles
- **College-scoped**: Multi-tenancy prevents cross-college leaks
- **Identity resolution**: Matches by user ID, reference_id, or email

---

## 📊 Notification Statistics

Total notification types across all roles: **27+**

Most notification-heavy roles:
1. **Mentor**: 7 types (schedule-heavy)
2. **CM**: 6 types (approval-heavy)
3. **Student**: 5 types (academic updates)

Least notification-heavy roles:
1. **KAM**: 2 types (oversight only)
2. **SME**: 3 types (L&D focused)

---

## ✅ Files Modified

### Changed:
- `src/components/DashboardLayout.tsx` - Removed toast from SSE handler
- `src/app/layout.tsx` - Removed sonner Toaster
- `src/components/NotificationsView.tsx` - Added dismissible banner

### Deleted:
- `src/components/ui/sonner.tsx` - Dead shim removed

### Created:
- `docs/NOTIFICATION_AUDIT_BY_ROLE.md` - Complete role audit
- `docs/NOTIFICATION_SYSTEM_FIXES.md` - Technical fixes
- `docs/NOTIFICATION_SYSTEM_FINAL.md` - This file

---

## 🧪 Testing

### Test App Notifications:
1. Login as mentor
2. Have another mentor submit handover request (or use API)
3. Observe:
   - ✅ Bell badge updates
   - ✅ Bell shakes
   - ✅ Chime plays
   - ✅ Click bell → see notification
   - ❌ NO toast appears

### Test Device Notifications:
1. Login as any role
2. Click bell icon → "View All Notifications"
3. Click "Enable Device Alerts"
4. Allow browser permission
5. Test notification appears as OS notification

### Test Mark as Read:
1. Click bell icon
2. Click individual notification → marks as read automatically
3. Or click "Mark All as Read" button
4. Observe badge count goes to 0

---

## 🎯 Summary

**Before Fix:**
- ❌ Dual toast systems (sonner + ToastContext)
- ❌ Toast popups on every notification
- ❌ Inconsistent notification display
- ❌ Permission banner always showing

**After Fix:**
- ✅ Single toast system (ToastContext for actions only)
- ✅ NO toast popups for incoming notifications
- ✅ Clean bell-only notification system
- ✅ Dismissible permission banner
- ✅ Complete role-based audit documented

**User Experience:**
- Quieter, less intrusive
- Notifications visible in bell dropdown
- Optional device notifications for important alerts
- Clean, professional notification flow
