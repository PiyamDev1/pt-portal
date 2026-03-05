# Plant Growth Gamification System - Detailed Plan

## 1. Feature Overview

A gamified attendance tracking system where employees' "attendance health" is represented by a growing virtual plant. Success earns points and grows the plant; tardiness damages it and triggers warnings. The plant visual provides immediate, engaging feedback on performance.

**Core Goal**: Incentivize on-time attendance through persistent, visual reward system.

---

## 2. Database Schema

### 2.1 New Tables

#### `attendance_plants`
- `id` (uuid, PK)
- `employee_id` (uuid, FK → employees)
- `current_points` (integer, default: 0) - Can be negative
- `total_points_earned` (integer, default: 0) - Career total
- `plant_stage` (enum: 'seed', 'sprout', 'plant', 'flower', 'bloomed')
- `stage_progress` (integer 0-100) - % towards next stage
- `warning_count` (integer, default: 0) - Disciplinary warnings
- `last_attendance_date` (date) - Last punch record checked
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `reset_date` (timestamp) - Last point reset (if monthly/quarterly)

#### `attendance_warnings`
- `id` (uuid, PK)
- `employee_id` (uuid, FK)
- `warning_number` (integer, 1/2/3)
- `triggered_date` (date) - Which punctuality triggered warning
- `issued_at` (timestamp)
- `notified_supervisor` (boolean) - For warning #2
- `escalated_to_hr` (boolean) - For warning #3
- `note` (text) - Optional context
- `created_at` (timestamp)

#### `attendance_point_logs` (optional, for audit trail)
- `id` (uuid, PK)
- `employee_id` (uuid, FK)
- `points_delta` (integer, can be negative)
- `reason` (text) - e.g., "Clocked in 3 mins late"
- `attendance_date` (date)
- `calculated_at` (timestamp)

---

## 3. Point System (Detailed)

### 3.1 Scoring Rules

```
Early arrival threshold: 5 minutes before shift start
On-time: Within 5 minutes before to shift start
Late: After shift start

 5+ mins early:     +3 points ✨
 0-5 mins early:    +1 point  ✓
 0-5 mins late:     -2 points ⚠️
 5-10 mins late:    -3 points ⚠️⚠️
10+ mins late:      -5 points ❌ + Warning trigger

 Absent (no punch): -5 points + Warning trigger
```

### 3.2 Warning Trigger Logic

- **Warning #1**: 10+ mins late (first offense)
  - Message: "You were 12 minutes late. This is your first warning. Please be on time."
  - Plant visual hint: wilting
  
- **Warning #2**: 10+ mins late (second offense within 30 days)
  - Message: "Second warning. Your supervisor has been notified."
  - Action: Add entry to `attendance_warnings`, set `notified_supervisor = true`
  - Plant visual: more wilted
  
- **Warning #3**: 10+ mins late (third offense within 30 days)
  - Message: "Third warning. HR has been escalated. Your supervisor will discuss corrective action."
  - Action: Set `escalated_to_hr = true`, send notification to both supervisor + HR
  - Plant visual: dead/brown

### 3.3 Warning Reset

- Warning count resets every **30 days** (sliding window or calendar month—decide later)
- Count tracked in `attendance_warnings` table by `issued_at` date

### 3.4 Point Reset Policy (to decide)

**Option A**: Points never reset (career total)
- Simpler, shows long-term commitment
- Risk: New employees start at 0, old employees at +500

**Option B**: Reset monthly/quarterly
- Keeps competition fresh
- Resets give second chances
- **Recommendation**: Quarterly reset (Jan/Apr/Jul/Oct) with "legacy" badge for high all-time totals

---

## 4. Plant Growth Stages

### 4.1 Growth Progression

Plants advance through stages based on `current_points`:

| Stage | Points Threshold | Visual | Emoji |
|-------|------------------|--------|-------|
| Seed | 0-20 | Small seed in soil | 🌱 |
| Sprout | 21-50 | Tiny sprout emerging | 🌿 |
| Plant | 51-100 | Full green plant with 3 leaves | 🌾 |
| Flower | 101-150 | Flowering plant (color options) | 🌻 |
| Bloomed | 151+ | Full bloom garden plant | 🌹 |

### 4.2 Visual Degradation (Negative Points)

- **Warning #1** (at 10+ mins late): Plant color desaturates 20%
- **Warning #2**: Plant color desaturates another 20% (now 60% desaturated)
- **Warning #3**: Plant turns brown/grey (90% desaturated)
- **Recovery**: When points improve and warnings clear, color restores

### 4.3 Stage Progress Bar

- `stage_progress` tracks % completion to next stage
- E.g., at 45 points (in Sprout stage, needs 50), progress = 90%
- Visual: Progress bar above plant or as fill % on pot

### 4.4 Animation Ideas

- **Growth**: Smooth CSS transition when advancing stage
- **Damage**: Quick shake/fade when losing points
- **Wilting**: Slight rotation/droop during warning state
- **Recovery**: Brightening effect when points rise again

---

## 5. Calculation Logic

### 5.1 When Points Are Calculated

**Time**: Daily, via scheduled job at end of shift (e.g., 6 PM server time)
- **Alternative**: Real-time on dashboard, cached server-side

**Logic**: For each employee with a timeclock punch that day:
1. Find latest punch of the day (could be multiple clock-ins)
2. Compare first clock-in time vs. scheduled shift start
3. Calculate points delta
4. Check for warning trigger
5. Update `attendance_plants` and create log entry
6. If warning #2 or #3, create notification

### 5.2 Edge Cases

- **Shift has no scheduled time**: Don't calculate points (skip)
- **Day off**: Don't calculate points (check against schedule)
- **Flex schedule**: Use employee's custom start time if available
- **No punch recorded**: Treat as absent → -5 points + warning
- **Multiple punches same day**: Use first clock-in only
- **Timezone issues**: Store all times in employee's location timezone

---

## 6. UI/UX Components

### 6.1 Dashboard Widget

**Location**: `/dashboard` (main page)

**Size**: ~300x300px card

**Contents**:
- Plant SVG/image (animated)
- Current points: `"Total Points: +47"`
- Current stage: `"Stage: Plant (47%)"`
- Warning status: If active, show `"⚠️ 1 Warning (30 days)"`
- Last sync: `"Last updated: Today at 5:30 PM"`
- CTA button: "View Details" → `/dashboard/attendance-plant`

**Colors**:
- Stage 0-1: Brown/dull
- Stage 2+: Green
- Warning #1: Orange tint
- Warning #2-3: Red tint

### 6.2 Detailed Page (`/dashboard/attendance-plant`)

**Header**: Plant visual (larger, ~500x500px)

**Three Tabs**:

#### Tab 1: "Overview"
- Large plant visual
- Current points / stage / progress
- Last 7 days points summary (mini bar chart)
- Warning history (if any)
- "Point Reset Date: Mar 31, 2026"

#### Tab 2: "Recent Activity"
- Table of last 30 days attendance:
  - Date | Clock-in time | Points change | Reason
  - Example: "Feb 26 | 09:03 AM | -2 | 3 mins late"

#### Tab 3: "Warnings & Discipline"
- Chronological list of warnings
  - Date issued | Warning #N | Reason | Action taken
- For Warning #2: "Supervisor notified on [date]"
- For Warning #3: "HR escalated on [date]"
- "Warning resets on: Mar 27, 2026" (30-day rolling)

### 6.3 Real-Time Displays

**On Timeclock Pages** (`/dashboard/timeclock/history`):
- Add column: "Points Earned" with color coding
  - Green: +points
  - Red: -points
  - Grey: 0 (day off, no punch)

**On Dashboard**: Show streak indicator
- "✅ On time 5 days in a row!"

### 6.4 Warnings Modal

Triggered when employee logs in after receiving a warning:
```
⚠️ ATTENDANCE ALERT

You were 12 minutes late on Feb 26.

This is your 2nd warning.
Your supervisor has been notified.

Warnings reset on: Mar 27, 2026

[Dismiss]
```

---

## 7. API Endpoints Needed

### 7.1 Plant Data

```
GET /api/attendance/plant
  Response: { currentPoints, stage, stageProgress, warningCount, lastUpdated }

GET /api/attendance/plant/history?days=30
  Response: Array of { date, pointsDelta, reason }

GET /api/attendance/plant/warnings
  Response: Array of { date, warningNumber, reason, resolved }
```

### 7.2 Calculations (Admin/Scheduled)

```
POST /api/admin/attendance/calculate-daily
  Body: { date } or auto-runs via cron
  Action: Querys all employees' punches, updates points & plants
  Response: { processed: 150, updated: 47, warnings: 3 }

POST /api/admin/attendance/reset-warnings
  Action: Runs monthly/quarterly to reset warning counts
  Response: { resetCount: 150 }
```

### 7.3 Admin Overrides

```
POST /api/admin/employee/{id}/plant/award-points
  Body: { points, reason }

POST /api/admin/employee/{id}/warnings/clear
  Body: { reason }

POST /api/admin/employee/{id}/warnings/issue
  Body: { warningNumber, reason }
```

---

## 8. Integration Points

### 8.1 With Existing Timeclock System

- **Data source**: `timeclock_codes` table (existing)
- **Matches against**: Employee's scheduled shift time
- **Stores in**: `attendance_point_logs` and `attendance_plants`

### 8.2 With Notification System

- **Warning #1**: Silent (UI modal only)
- **Warning #2**: Notify supervisor (email + in-app)
- **Warning #3**: Notify supervisor + HR + employee (email + in-app)

### 8.3 With Reporting/Analytics

- **Engagement metric**: Track monthly employees using plant feature
- **Attendance leader boards**: Top 10 employees by points
- **Trend reports**: Company-wide on-time % vs. quarter

---

## 9. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create database tables
- [ ] Build API endpoints (GET plant, GET history)
- [ ] Create daily calculation job (cron)
- [ ] Dashboard widget (static HTML, no interactivity)

### Phase 2: UI & Visuals (Week 2)
- [ ] Plant SVG assets (4 stages × 3 color variants)
- [ ] Detailed plant page (3 tabs)
- [ ] Real-time point updates on dashboard
- [ ] Animations (growth, damage, recovery)

### Phase 3: Warnings & Discipline (Week 3)
- [ ] Warning trigger logic
- [ ] Warning modal on login
- [ ] Warnings tab UI
- [ ] Supervisor/HR notifications
- [ ] Warning reset job

### Phase 4: Polish & Testing (Week 4)
- [ ] Edge case handling (day off, no punch, etc.)
- [ ] Performance testing (daily calc for 500+ employees)
- [ ] User feedback loop
- [ ] Admin override tools

---

## 10. Decisions Needed Later

1. **Point reset frequency**: Monthly, quarterly, or never?
2. **Plant visual assets**: Commission custom SVG or use emoji set?
3. **Color customization**: Let employees pick plant color based on points tier?
4. **Team mode**: Plant a shared garden if team hits 100% on-time?
5. **Leaderboards**: Show public rankings or keep private?
6. **Mobile optimization**: Responsive design or mobile-first plant widget?
7. **Notification channels**: Email, SMS, in-app notifications or all three?
8. **Redemption**: Can employees convert high points into rewards/time-off?

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Employees feel pressure/stress | Start with opt-in, gather feedback, adjust scoring |
| False positives (technical issues) | Manual review + admin override tools |
| Calculation bugs causing unfair warnings | Thorough testing, audit trail in logs, easy dispute process |
| Requires timezone handling | Standardize to employee branch timezone, document clearly |
| Late arrivals spike before reset date | This is expected behavior; consider motivational messaging |

---

## 12. Success Metrics (Post-Launch)

- **Adoption**: % of employees viewing plant page weekly
- **Behavior**: Company-wide average tardiness decreases 10%+ month-over-month
- **Engagement**: Average plant page visit time > 2 mins
- **Retention**: Feature remains in top 5 dashboard widgets used
- **Feedback**: NPS score for gamification feature > 7/10

---

## Next Steps

1. Review all decisions (Section 10) with stakeholders
2. Finalize point thresholds and stage progression
3. Design/source plant visual assets
4. Begin Phase 1 implementation
5. Set up daily cron job for calculations
6. Pilot with small user group before full rollout
