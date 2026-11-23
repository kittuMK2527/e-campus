import { getDb, type QueryFailure } from "@/lib/db";

export interface ProposedAllocation {
  id?: string;
  interview_id: string;
  origin_college_id: string;
  target_college_id: string;
  target_college_name: string;
  mentor_id: string;
  mentor_name: string;
  allocated_student_count: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "proposed" | "confirmed" | "rejected";
  gmeet_link?: string;
  slots?: StudentSlotProposal[];
}

export interface StudentSlotProposal {
  slot_start_time: string;
  slot_end_time: string;
  mentor_id: string;
  mentor_name: string;
  college_id: string;
  student_name?: string;
  student_id?: string;
}

/**
 * Calculates interview duration based on fixed 15-minute per student rule.
 */
export function calculateInterviewDuration(studentCount: number): {
  totalMinutes: number;
  formattedDuration: string;
} {
  const count = Math.max(1, Number(studentCount) || 1);
  const totalMinutes = count * 15;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  let formatted = `${totalMinutes} mins`;
  if (hours > 0) {
    formatted = `${totalMinutes} mins (${hours}h${mins > 0 ? ` ${mins}m` : ""})`;
  }

  return { totalMinutes, formattedDuration: formatted };
}

/**
 * Converts "HH:MM AM/PM" to minutes from midnight (0..1439).
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 540; // Default 09:00 AM
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return 540;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];

  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Converts minutes from midnight back to "HH:MM AM/PM".
 */
export function formatMinutesToTime(totalMins: number): string {
  let mins = Math.max(0, Math.min(1439, Math.round(totalMins)));
  let hours = Math.floor(mins / 60);
  const m = mins % 60;

  const period = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;

  const mStr = String(m).padStart(2, "0");
  const hStr = String(hours).padStart(2, "0");

  return `${hStr}:${mStr} ${period}`;
}

/**
 * Generates exact non-overlapping 15-minute student slots for an allocation segment.
 */
export function generate15MinSlotsForSegment(
  mentorId: string,
  mentorName: string,
  collegeId: string,
  studentCount: number,
  startMins: number
): StudentSlotProposal[] {
  const slots: StudentSlotProposal[] = [];
  let currentMins = startMins;

  for (let i = 0; i < studentCount; i++) {
    const slotStart = formatMinutesToTime(currentMins);
    const slotEnd = formatMinutesToTime(currentMins + 15);
    slots.push({
      slot_start_time: slotStart,
      slot_end_time: slotEnd,
      mentor_id: mentorId,
      mentor_name: mentorName,
      college_id: collegeId,
      student_name: `Student #${i + 1}`,
      student_id: `std_${i + 1}`
    });
    currentMins += 15;
  }

  return slots;
}

/**
 * Priority-Based Splitting & Overflow Engine (Capacity-First)
 * Runs strictly against accepted CAM capacity responses.
 */
export async function generateCapacityFirstPrioritySplit(options: {
  interviewId: string;
  originCollegeId: string;
  targetDate: string;
  preferredStartTime: string;
  requestedStudentCount: number;
  subject?: string;
}): Promise<{
  allocations: ProposedAllocation[];
  totalRequested: number;
  acceptedCapacity: number;
  allocatedStudents: number;
  remainingStudents: number;
  unallocatedStudents: number;
  formattedTotalDuration: string;
  overflowOccurred: boolean;
  camResponses: any[];
}> {
  const db = await getDb();
  const {
    interviewId,
    originCollegeId,
    targetDate,
    preferredStartTime,
    requestedStudentCount,
    subject = ""
  } = options;

  const { totalMinutes, formattedDuration } = calculateInterviewDuration(requestedStudentCount);

  // 1. Fetch accepted CAM capacity responses strictly from partner colleges in the same KAM zone
  const acceptedCamResponses = await db.all(
    `SELECT r.* FROM cam_capacity_responses r
     JOIN colleges c ON r.college_id = c.id
     WHERE r.interview_id = ? 
       AND r.status = 'accepted' 
       AND r.accepted_student_capacity > 0
       AND c.kam_id = (SELECT kam_id FROM colleges WHERE id = ?)
       AND c.kam_id IS NOT NULL 
       AND c.kam_id != ''`,
    [interviewId, originCollegeId]
  );

  let totalAcceptedCapacity = 0;
  acceptedCamResponses.forEach((r: any) => {
    totalAcceptedCapacity += Number(r.accepted_student_capacity) || 0;
  });

  const remainingStudents = Math.max(0, requestedStudentCount - totalAcceptedCapacity);

  if (acceptedCamResponses.length === 0) {
    return {
      allocations: [],
      totalRequested: requestedStudentCount,
      acceptedCapacity: 0,
      allocatedStudents: 0,
      remainingStudents: requestedStudentCount,
      unallocatedStudents: requestedStudentCount,
      formattedTotalDuration: formattedDuration,
      overflowOccurred: false,
      camResponses: []
    };
  }

  let studentsToAllocate = Math.min(requestedStudentCount, totalAcceptedCapacity);
  let currentStartMins = parseTimeToMinutes(preferredStartTime);
  const allocations: ProposedAllocation[] = [];
  let overflowOccurred = false;

  // One read for every accepted pool's mentors instead of one read per pool.
  const mentorCollegeIds = Array.from(
    new Set(acceptedCamResponses.map((r: any) => r.college_id).filter(Boolean))
  );
  const mentorsByCollege = new Map<string, any[]>();
  if (mentorCollegeIds.length > 0) {
    const mentorReadFailures: QueryFailure[] = [];
    const mentorPlaceholders = mentorCollegeIds.map(() => "?").join(",");
    const [mentorRows] = await db.multiQuery([
      {
        sql: `SELECT * FROM mentors WHERE college_id IN (${mentorPlaceholders}) ORDER BY name ASC`,
        params: mentorCollegeIds,
      },
    ], mentorReadFailures);
    if (mentorReadFailures.length > 0) {
      throw new Error(`priority engine mentor roster unreadable: ${mentorReadFailures[0].error}`);
    }
    for (const m of mentorRows) {
      const key = String(m.college_id);
      if (!mentorsByCollege.has(key)) mentorsByCollege.set(key, []);
      mentorsByCollege.get(key)!.push(m);
    }
  }

  // Process accepted CAM capacity pools
  for (const camResp of acceptedCamResponses) {
    if (studentsToAllocate <= 0) break;

    const camCapacity = Number(camResp.accepted_student_capacity) || 0;

    // Mentors at this accepted CAM's college, already ordered by name
    const collegeMentors = mentorsByCollege.get(String(camResp.college_id)) || [];

    const availableMentor = collegeMentors[0] || {
      id: `mentor_cam_${camResp.college_id}`,
      name: `${camResp.college_name} Mentor`
    };

    const countForThisSegment = Math.min(studentsToAllocate, camCapacity);
    const segmentDurationMins = countForThisSegment * 15;

    const segmentStartTime = formatMinutesToTime(currentStartMins);
    const segmentEndMins = currentStartMins + segmentDurationMins;
    const segmentEndTime = formatMinutesToTime(segmentEndMins);

    // Generate exact 15-min non-overlapping student slots
    const slots = generate15MinSlotsForSegment(
      availableMentor.id,
      availableMentor.name,
      camResp.college_id,
      countForThisSegment,
      currentStartMins
    );

    allocations.push({
      interview_id: interviewId,
      origin_college_id: originCollegeId,
      target_college_id: camResp.college_id,
      target_college_name: camResp.college_name,
      mentor_id: availableMentor.id,
      mentor_name: availableMentor.name,
      allocated_student_count: countForThisSegment,
      start_time: segmentStartTime,
      end_time: segmentEndTime,
      duration_minutes: segmentDurationMins,
      status: "proposed",
      slots
    });

    studentsToAllocate -= countForThisSegment;

    if (studentsToAllocate > 0) {
      currentStartMins = segmentEndMins + 15; // 15 min buffer between segment slots
      overflowOccurred = true;
    }
  }

  const allocatedStudents = requestedStudentCount - remainingStudents - studentsToAllocate;
  const unallocatedStudents = Math.max(0, requestedStudentCount - allocatedStudents);

  return {
    allocations,
    totalRequested: requestedStudentCount,
    acceptedCapacity: totalAcceptedCapacity,
    allocatedStudents,
    remainingStudents,
    unallocatedStudents,
    formattedTotalDuration: formattedDuration,
    overflowOccurred,
    camResponses: acceptedCamResponses
  };
}

export const generatePrioritySplitAllocations = generateCapacityFirstPrioritySplit;
