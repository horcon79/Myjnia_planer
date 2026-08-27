# Dealer Car Wash Planner

A source-available system for managing and scheduling vehicle wash operations in automotive businesses such as car dealerships, transport companies, service centers, rental companies, and fleets. The application is designed for use on a tablet at the wash station and on desktop computers used by departments requesting vehicle washes.

The system allows departments to submit wash requests, wash employees to plan and execute them in a schedule, and managers to monitor capacity, workload, and completed work.

> **License:** the source code is available under the **PolyForm Noncommercial License 1.0.0**. Noncommercial use, testing, evaluation, research, and learning are permitted within the scope of that license. **Production use in a commercial organization requires a separate commercial license.** See [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) for details.

---

## Features

- **Wash requests** — departments such as Sales, Service, Showroom, Used Cars, Fleet, or Logistics can submit a vehicle for washing with a required completion time and additional comments.
- **Car wash planner (tablet)** — an hourly, employee-based schedule optimized for touch operation:
  - start and finish wash jobs,
  - move vehicles between time slots and employees using drag-and-drop,
  - assign unscheduled vehicles.
- **Live status screen** — real-time view of vehicles that are ready, in progress, scheduled, or completed.
- **Dictionaries and configuration** — wash services, departments with PIN codes, employees, and capacity rules such as maximum simultaneous vehicles and working hours.
- **Reports (admin only)** — number of washes by employee and by department for a selected period, with Excel (`.xls`) export.

## External system integrations

Myjnia Planer can be integrated with external dealer and automotive management systems in order to reduce manual data entry and make daily work easier for employees.

Possible integration scenarios include:

- importing vehicle data from a **Dealer Management System (DMS)**,
- retrieving vehicle and repair-order information from a **workshop management system**,
- retrieving vehicle and customer/order data from a **vehicle sales management system**, CRM, stock management system, or other dealership platform,
- automatically populating fields such as VIN, registration number, make, model, department, repair order, sales order, vehicle status, or responsible employee,
- synchronizing selected wash statuses back to external systems,
- triggering wash requests automatically based on events in external systems, for example when a workshop order is completed or a vehicle is prepared for customer delivery.

Integrations can be implemented through available APIs, webhooks, database views, file exchange, or dedicated connectors, depending on the capabilities of the external system.

The purpose of such integrations is to **minimize duplicate data entry, reduce errors, and shorten the time employees need to create and manage wash requests**.

Commercial integrations and custom connectors can be delivered as part of a separate implementation or commercial agreement.

## Roles and permissions

| Role | Description | Access |
| --- | --- | --- |
| `DEPARTMENT` | Requesting department, e.g. Sales or Service | Create wash requests, view status, view dictionaries |
| `WASHER` | Car wash workstation / tablet | Planner and status |
| `ADMIN` | Manager / management | Full access, including dictionary editing, configuration, and reports |

## Technology stack

- **Next.js 16** (App Router, Server Actions)
- **React 19** + TypeScript
- **Prisma ORM** + **SQLite** (`prisma/dev.db`)
- **Tailwind CSS 4**
- **date-fns**

## Requirements

- Node.js 20+ for local development
- npm for local development
- Docker 24+ with Docker Compose v2 for deployment

## Installation and local development

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client and create the SQLite database
npx prisma generate
npx prisma db push

# 3. Seed initial data (departments, services, employees, sample wash jobs)
npm run db:seed

# 4. Start the development server
npm run dev
```

Open <http://localhost:3000>. On the home page, select a profile and sign in using its PIN code.

> Running the application for testing or evaluation does not automatically grant the right to use it commercially. Before deploying it in production within a business, review the **License** section below.

## Docker deployment

The project includes a ready-to-use `Dockerfile` and `docker-compose.yml`. The SQLite database is stored on a named Docker volume so that data persists between image rebuilds and container restarts.

### First start

```bash
# Build the image and start the container in the background
docker compose up -d --build

# View logs
docker compose logs -f
```

The application will be available at <http://localhost:3000>.

On first startup, the container automatically:

1. runs `prisma db push` to create or update the database schema,
2. runs the seed process on a new database to create initial data and sample credentials.

### Updating to a new version

```bash
# Stop/rebuild/start with the latest code
docker compose up -d --build

# Or restart without rebuilding if the image is already up to date
docker compose restart
```

The `myjnia.db` database remains on the `myjnia_data` volume and is preserved during normal updates.

### Useful commands

```bash
docker compose ps          # container status
docker compose logs -f     # follow logs
docker compose down        # stop containers; keep data volume
docker compose down -v     # stop containers and DELETE the data volume — use with care
docker compose exec myjnia-planer npx prisma studio   # open Prisma Studio
```

### Container configuration

Environment variables in `docker-compose.yml`:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Internal application port |
| `DATABASE_URL` | `file:/data/myjnia.db` | SQLite database location on the `/data` volume |
| `TZ` | `Europe/Warsaw` | Time zone |

The host port can be changed by editing the mapping `"3000:3000"`, for example to `"8080:3000"`. The data volume can be changed by modifying the `myjnia_data` volume configuration.

## Initial seed credentials

| Profile | PIN | Role |
| --- | --- | --- |
| `admin` (Manager / Management) | `admin2026` | ADMIN |
| `myjnia` (Car Wash Workstation) | `myjnia2026` | WASHER |
| `handlowy`, `serwis`, `uzywane`, `omoda` | `1234` | DEPARTMENT |

> **Security warning:** change all default PIN codes immediately after the first deployment in **Dictionaries and Settings → Dealership Departments**. Do not expose an installation using default credentials to an untrusted network.

## Basic commands

```bash
npm run dev         # development server
npm run build       # production build
npm start           # start the production build
npm run lint        # ESLint
npx prisma studio   # database browser
npx prisma db push  # synchronize Prisma schema with the database
```

## Project structure

```text
prisma/
  schema.prisma     # data model: departments, services, employees, jobs, settings
  seed.ts           # initial data
src/
  actions/          # Server Actions: auth, jobs, dictionaries, reports, settings
  app/              # pages: /, /order, /planner, /summary, /settings, /reports
  components/       # UI components: planner, orders, settings, reports, summary, auth
  lib/prisma.ts     # shared Prisma connection
```

## Configuration

System settings are stored in the database using the `AppSetting` model and can be edited in **Dictionaries and Settings → Car Wash Capacity Rules**:

- `MAX_SIMULTANEOUS_CARS` — maximum number of vehicles washed simultaneously; default: 3
- `DELIVERY_CAR_WEIGHT` — capacity weight equivalent for a delivery vehicle
- `WORK_START_HOUR` / `WORK_END_HOUR` — car wash working hours; default: 07:00–19:00
- `ALLOW_OVER_CAPACITY` — whether exceeding the configured capacity is allowed

## License

Myjnia Planer is a **source-available** project and is not distributed as conventional open-source software.

The source code is provided under the **PolyForm Noncommercial License 1.0.0**. See [LICENSE](LICENSE).

In practical terms:

- **free of charge:** noncommercial uses permitted by PolyForm, including evaluation, testing, learning, research, and experimentation,
- **commercial license required:** production use in a commercial organization, including car dealerships, service centers, fleets, transport companies, rental companies, commercial car washes, system integrators, and SaaS providers,
- **commercial terms:** see [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md).

Public availability of the repository does **not** grant permission for free commercial production use.

For commercial licensing, deployments, integrations, custom connectors, or cooperation, contact: **horcon.koszalin@gmail.com**
