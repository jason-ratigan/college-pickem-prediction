# College Pick'em

College Pick'em is a sophisticated statistical analysis platform for college football prediction, designed for data-driven analysts who want to make informed weekly picks. 

The platform's core innovation is its **Relative Performance Analysis Engine**, which evaluates how teams perform against opponents relative to those opponents' typical performance. These relative strengths are tracked across all game phases (passing, rushing, scoring, etc.) to power predictive models for future matchups.

## Features

- **Weekly Analysis Workflow:** Process 10 weekly games using advanced opponent-adjusted performance metrics.
- **Deep Dive Analytics:** Drill down into detailed statistical breakdowns for matchups across all game phases.
- **Historical Tracking:** Analyze team performance trends across seasons and review past game predictions.
- **Batch Processing Engine:** Automated data ingestion and opponent-adjusted strength model calculations.
- **Admin Dashboard:** Tools for running data quality checks, triggering ingestion jobs, and validating statistical models.

## Tech Stack

This project is a monorepo structured with NPM Workspaces.

- **Frontend (`/client`)**: React.js, Vite, Tailwind CSS, shadcn/ui, React Query (TanStack Query)
- **Backend (`/server`)**: Node.js, Express.js (REST API), TypeScript
- **Shared (`/shared`)**: Shared TypeScript schemas and types using Drizzle ORM
- **Database**: PostgreSQL (via Drizzle ORM)
- **Caching & Job Queuing**: Redis (for API caching, session management, and background jobs)

## Architecture

The backend strictly follows a **Controller-Service-Repository (C-S-R)** architectural pattern to ensure separation of concerns:
- **Controllers**: Handle HTTP requests and responses.
- **Services**: Execute core business logic and coordinate calculations.
- **Repositories**: Handle all data access and database interactions.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL database
- Redis server (optional but recommended for full functionality)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd college-pickem
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory based on required environment variables:
   ```env
   # Database
   DATABASE_URL=postgres://user:password@localhost:5432/college_pickem
   
   # Server
   PORT=3001
   SESSION_SECRET=your_secure_session_secret
   NODE_ENV=development
   
   # Add your external sports data API keys here if applicable
   ```

4. **Database Setup:**
   Generate and push database migrations using Drizzle:
   ```bash
   npm run drizzle:generate
   npm run drizzle:migrate
   ```

### Running the Application

**Development Mode:**
Runs both the React frontend (Vite) and the Node/Express backend concurrently with hot-reloading.
```bash
npm run dev
```
- Frontend will be available at: `http://localhost:5173`
- Backend API will be available at: `http://localhost:3001/api/v1`

**Production Build:**
Builds the shared types, frontend client, and backend server.
```bash
npm run build
```

**Start Production Server:**
Starts the compiled Node.js backend. The backend is configured to serve the built static frontend files in production mode.
```bash
npm run start
```

## Contributing
All new code must be written in TypeScript. Adhere to the established C-S-R architecture for backend changes. Formatting is handled via Prettier and ESLint.

## License
[License Type] - See LICENSE file for details.
