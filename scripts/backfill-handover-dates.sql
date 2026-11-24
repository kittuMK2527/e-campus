-- One-time repair for stale handover dates
UPDATE handover_requests SET datestr = lr.datestr, dateformatted = lr.dateformatted
FROM leave_requests lr
WHERE handover_requests.requestid = lr.id;

UPDATE approved_handovers SET datestr = lr.datestr
FROM leave_requests lr
WHERE approved_handovers.requestid = lr.id;

-- Ensure conflict resolution
-- ON CONFLICT (mentor_id, date_str) DO NOTHING
