# Race Results Review Page

## Overview
A detailed results page where users can review any past race weekend. Shows actual results, user predictions, scoring breakdown, and detailed line-by-line comparison.

## Page Structure

### Header Section
- Navigation breadcrumb: `Home > Results > R05 · Monaco Grand Prix`
- Race title with flag emoji
- Circuit name
- Date of race
- Quick stats: User's total points for the round, accuracy percentage (e.g., "8/10 correct")

### Main Content - Two-Column Comparison

#### Left Column: Race Results (Simplistic Table)
A clean, simple table showing **actual race results only**:

| Pos | Driver | Pts |
|-----|--------|-----|
| P1 | VER | 25 |
| P2 | NOR | 18 |
| P3 | SAI | 15 |
| P4 | HAM | 12 |
| P5 | RUS | 10 |
| P6 | ALB | 8 |
| P7 | STR | 6 |
| P8 | OCO | 4 |
| P9 | TSU | 2 |
| P10 | BOT | 1 |

**Also shows:**
- **Pole Position**: MAX (highlighted or badge)
- **DNF**: ALO (marked clearly)
- **Sprint Results** (if applicable): Same table format for sprint race

---

#### Right Column: Your Results
Mirror layout to left, but showing **user's predictions** with **visual distance indicator**:

| Pos | Your Pick | Status | +Pts |
|-----|-----------|--------|------|
| P1 | VER | ✓ | +3 |
| P2 | SAI | ⚠ −1 | +1 |
| P3 | NOR | ⚠ +1 | +1 |
| P4 | HAM | ✓ | +3 |
| P5 | ALB | ⚠ +1 | +1 |
| P6 | RUS | ⚠ −1 | +1 |
| P7 | STR | ✓ | +3 |
| P8 | TSU | ⚠ +1 | +1 |
| P9 | OCO | ⚠ −1 | +1 |
| P10 | BOT | ✓ | +3 |

**Status indicators:**
- ✓ = Exact match (green background)
- ⚠ +1 = One position off (yellow/orange background)
- ⚠ −1 = One position off the other way (yellow/orange background)
- ✗ = Wrong, far off (red background, show expected position)

**Visual Distance Indicator:**
- Row background color intensity shows accuracy:
  - Green: You nailed it
  - Light green: Very close
  - Yellow/Orange: One position off
  - Pink/Light red: Two+ positions off
  - Red: Completely wrong

**Alternative: Distance Meter**
- Add a small bar/indicator next to each row showing distance (0 to 10)
  - Full green bar = exact match
  - 1px offset = one position off
  - Increasing red = getting further away

---

## Data Requirements

### From Backend API
```
GET /api/results/:round

Response:
{
  race: {
    round: 5,
    name: "Monaco Grand Prix",
    countryCode: "MC",
    circuit: "Circuit de Monaco",
    date: "2026-05-26",
    isSprint: true
  },
  actual: {
    pole: "MAX",
    dnf: "ALO",
    finishOrder: ["VER", "NOR", "SAI", "HAM", "RUS", "ALB", "STR", "OCO", "TSU", "BOT"],
    sprintPole: "NOR",
    sprintDnf: null,
    sprintFinishOrder: ["NOR", "VER", "SAI", "HAM", "RUS", "ALB", "STR", "OCO", "TSU", "BOT"]
  },
  userPrediction: {
    pole: "VER",
    dnf: "ALO",
    positions: ["VER", "SAI", "NOR", "HAM", "ALB", "RUS", "STR", "TSU", "OCO", "BOT"],
    sprintWinner: "VER",
    sprintDnf: null
  },
  score: {
    totalPoints: 16,
    breakdown: {
      pole: 0,
      dnf: 1,
      positions: [3, 0, 0, 3, 1, 1, 3, 0, 0, 3],
      sprintWinner: 2,
      sprintDnf: 0
    }
  }
}
```

---

## UI Components Needed
- **Header** with breadcrumb, race title, quick stats pill
- **RoundSelector** (optional) — dropdown or buttons to jump between rounds
- **ResultsTable** — two instances, one for actual results (left), one for user predictions (right)
- **TableRow** — each row with color-coded background based on accuracy (green/yellow/red)
- **StatusBadge** — shows ✓ / ⚠ / ✗ with offset indicator (±1, ±2)
- **SpecialResults** — pole position and DNF sections (above main table)
- **DriverChip** — reuse existing component, 3-letter code
- **AccuracyIndicator** — visual color coding for each row's accuracy distance

---

## Interactions
- Click on a round in the sidebar → load that round's results
- Hover over a driver in the table → show full driver name tooltip
- Responsive: On mobile, sidebar becomes a dropdown or modal

---

## Styling Considerations
- Use existing design tokens (colors, spacing, typography)
- Accuracy/score values should be prominent (large text, bold)
- Color coding must be accessible (not color-blind dependent)
- Table should be easy to scan — alternating row backgrounds optional
- Green for correct (`var(--green)`), red for wrong (`var(--red)`), yellow/orange for one-off

---

## Related Pages
- `/home` — main dashboard, links to this page
- `/tips/:round` — where users make their predictions
- `/results` or `/standings` — future leaderboard/standings page

---

---

# AI Design Prompt for Figma

Use this prompt to generate a Figma design for the Race Results Review page.

## Figma Design Prompt

```
Create a detailed Figma design for a "Race Results Review" page in a Formula 1 prediction app with a side-by-side comparison layout.

CONTEXT:
- User is reviewing how accurate their predictions were for a past race weekend
- The design should emphasize clarity and comparison — showing actual results vs predictions side-by-side
- Visual hierarchy should make it immediately obvious how close/far the user was from actual results
- Design system uses a dark theme with accent colors: green (correct), red (wrong), orange/yellow (close)
- Font family: Inter for body, display font for headings
- Spacing uses 8px grid

LAYOUT:
Single-page design with header + two-column comparison:

1. HEADER (full width):
   - Breadcrumb: "Home > Results > R05 · Monaco"
   - Large race title: "Monaco Grand Prix" with flag emoji
   - Subtext: "Circuit de Monaco · May 26, 2026"
   - Quick stats pill/card: "16 pts · 8/10 correct · 80% accuracy"
   - Optional: round selector dropdown ("← Previous Round | Next Round →") or quick jump to other rounds

2. MAIN CONTENT (two-column):

   LEFT COLUMN (heading "Race Results"):
   - Simple, clean table with actual results
   - Columns: Position | Driver (3-letter code) | F1 Points
   - Rows: P1-P10 in order
   - Subtle alternating row backgrounds (barely visible)
   - Above/below table: Special results
     * "POLE POSITION: MAX" (highlighted badge or section)
     * "DID NOT FINISH: ALO" (warning/red badge)
     * If sprint: "SPRINT POLE: NOR" + "SPRINT P1-P10" (same table format below main race)

   RIGHT COLUMN (heading "Your Results"):
   - Mirror layout to left column for easy comparison
   - Columns: Position | Your Pick (3-letter code) | Status | Points
   - STATUS COLUMN shows:
     * ✓ icon for exact match
     * ⚠ icon with offset (±1, ±2, etc.) for close misses
     * ✗ icon for wrong predictions
   - ROW BACKGROUND COLOR indicates accuracy:
     * Solid green: Exact match (✓)
     * Light green: Very close (±1 position)
     * Yellow/Orange: Somewhat off (±2 positions)
     * Light red/Pink: Far off (±3-5 positions)
     * Red: Completely wrong (±6+ positions or missing driver)
   - POINTS COLUMN shows earned points: "+3", "+1", "+0"
   - Font: Driver codes bold/prominent for easy reading

VISUAL CLARITY:
- Row colors should be VERY CLEAR about accuracy — the user should glance at right column and immediately see green/red pattern
- Green rows = good predictions
- Red rows = bad predictions
- Optional: Add a thin colored left border (2px) on each row matching the background color for extra visual weight
- Optional: Small sparkle/star icon next to perfect predictions (P1, P4, P7, P10)

SPACING & SIZING:
- Left + Right columns: roughly equal width (45% each, 10% gap between)
- Table rows: 36-40px height for comfortable reading
- Column headers: Slightly bolder, subtle background color
- Padding: 24px around content, 12px row padding

POLE POSITION & DNF SECTIONS:
- Display above the main P1-P10 table in each column
- Show as: "POLE: VER" (with badge/highlight) and "DNF: ALO" (with warning color)
- Same color-coding logic: green if correct, red if wrong, yellow if one-off

SPRINT RACE (if applicable):
- Below main race results
- Add a subtle divider (line or extra spacing)
- Label: "SPRINT RACE" in small caps
- Same table format: Sprint Pole, Sprint P1-P10, Sprint DNF
- Same color-coding system

RESPONSIVE:
- On tablet: Keep two-column layout, may adjust widths
- On mobile: Stack vertically (actual results above, your results below) with clear section headers
- Ensure tables remain scannable and readable at all sizes

ADDITIONAL ELEMENTS:
- "Round selector" (optional): Small dropdown or pill showing current round, with arrow buttons to jump to other rounds
- "← Back" button in header linking to home
- Loading skeleton when fetching round data
- Empty state message if user has no predictions for selected round
```

---

## Next Steps

1. **Design in Figma**
   - Use the prompt above to generate a side-by-side comparison design
   - Share the Figma link or create design file

2. **Create React Component**
   - `/client/src/pages/Results.jsx` (main page component)
   - Sub-components: 
     * `ResultsTable` — reusable table component for both columns
     * `TableRow` — individual row with color-coded background
     * `StatusBadge` — show match status with offset (✓, ⚠±1, ✗)
     * `RoundSelector` — dropdown/buttons for jumping between rounds
     * `SpecialResults` — pole & DNF display

3. **Backend Endpoint**
   - `GET /api/results/:round` — fetch actual results, user prediction, and scoring breakdown
   - Response should include position-by-position comparison data for easy frontend rendering

4. **Scoring Calculation Logic**
   - Exact match: green background, ✓ icon, +3 points
   - One-off (±1 position): yellow/orange background, ⚠ icon, +1 point
   - Two-off (±2): light orange background, ⚠ icon, 0 points
   - Three+ off (±3+): red background, ✗ icon, 0 points
   - Missing/DNF: red background, ✗ icon, 0 points

5. **Color Mapping**
   - Create a utility function that maps distance (0-10+) to background color
   - Distance 0 = green, 1 = light green, 2 = yellow, 3+ = orange/red

