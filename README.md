# Pulse Pitlane Picks

An internal F1 prediction league for the Pulse team. Players tip driver finishing positions, pole sitters, DNFs, and sprint winners before each race locks. Points are awarded based on accuracy, with a live leaderboard and per-race breakdowns tracking the season.

---

## Features

**Players**
- Tip P1–P10, pole position, DNF, and sprint winner for every race
- Drag-and-drop driver ordering with a confirmation step before locking in
- Live countdown to each race's lock time — predictions are read-only once locked
- Season leaderboard with expandable per-race point breakdowns
- Personal stats page: points trend vs league average, pole/DNF accuracy, head-to-head comparison

**Admins**
- Enter official race results (triggers automatic scoring)
- Override race lock times and toggle sprint status
- Edit scoring rule point values (rescores all historical rounds)
- Manage users: promote to admin, deactivate, or delete a round's predictions
- Bulk import predictions via JSON

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (30-day tokens), bcrypt |
| F1 Data | OpenF1 API (calendar + driver list) |
| Client | React 18, React Router v6 |
| Build | Vite |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd F1Predictions

# Install dependencies for both server and client
npm run install:all

# Set up environment variables
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
```

### Running in Development

Open two terminals:

```bash
# Terminal 1 — backend (http://localhost:3877)
npm run dev:server

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:client
```

The client proxies API requests to the server automatically via Vite.

### Running in Production

```bash
# Build the React app
npm run build

# Start the server (serves the built app + API on port 3877)
npm start
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3877` |
| `JWT_SECRET` | Secret used to sign JWT tokens — use a long, random string | *(required)* |

---

## Project Structure

```
F1Predictions/
├── server/
│   ├── index.js            # Express app entry point + route wiring
│   ├── scorer.js           # Scoring engine
│   ├── middleware/
│   │   ├── auth.js         # JWT validation middleware
│   │   └── requireAdmin.js # Admin role guard
│   └── pitlane.db          # SQLite database (gitignored)
├── client/
│   ├── src/
│   │   ├── pages/          # Route-level components
│   │   │   ├── TipEntry.jsx
│   │   │   ├── Scoreboard.jsx
│   │   │   ├── Stats.jsx
│   │   │   └── admin/
│   │   ├── components/     # Shared UI components
│   │   └── context/        # Auth + app data context providers
│   └── index.html
├── .env.example
└── package.json            # Root scripts
```

---

## Scoring System

Points are awarded per race based on configurable rules (editable by admins):

| Rule | Default Points | Description |
|---|---|---|
| Exact position | 3 | Driver placed in the exact predicted position |
| One position off | 1 | Driver placed one spot above or below the prediction |
| Pole correct | 2 | Pole sitter correctly predicted |
| DNF correct | 1 | DNF driver correctly predicted |
| Sprint winner correct | 2 | Sprint race winner correctly predicted |

Changing rule values in the admin panel automatically rescores all past rounds.

---

## User Roles

| Role | Access |
|---|---|
| `user` | Tip entry, scoreboard, personal stats |
| `admin` | All user access + admin panel (results, races, scoring, users) |

The first admin account must be set manually in the database. Subsequent admins can be promoted through the admin panel.
