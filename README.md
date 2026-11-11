# ARFRAME Backend API (`my-api`)

Cloudflare Workers backend API built with [Hono](https://hono.dev/), [Cloudflare D1](https://developers.cloudflare.com/d1/) (Serverless SQL Database), and [Cloudflare R2](https://developers.cloudflare.com/r2/) (Object Storage).

---

## 🛠️ Step-by-Step Setup & Run Instructions

Follow these steps to set up, initialize, and deploy the backend on any new or existing Cloudflare account.

### Step 1: Create a Cloudflare Account
1. If you don't already have one, register for a free account at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Verify your email address.

### Step 2: Install Dependencies & Login via Wrangler
Navigate to the `my-api` directory in your terminal:
```bash
cd "my-api (1)/my-api"
npm install
```
Authorize Wrangler CLI with your Cloudflare account:
```bash
npx wrangler login
```
*A browser window will open. Click **Allow** to authenticate Wrangler.*

### Step 3: Create the D1 Database
Create the serverless SQLite database on Cloudflare:
```bash
npx wrangler d1 create aframebuilders
```
After creation, Wrangler outputs the database details:
```json
{
  "binding": "DB",
  "database_name": "aframebuilders",
  "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```
👉 Open [wrangler.jsonc](./wrangler.jsonc) and paste your new `database_id` into the `d1_databases` block:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "aframebuilders",
    "database_id": "YOUR_NEW_DATABASE_ID_HERE",
    "remote": true
  }
]
```

### Step 4: Create the R2 Storage Bucket
Create the object storage bucket for media assets:
```bash
npx wrangler r2 bucket create aframebuilders
```
Verify that `bucket_name` in [wrangler.jsonc](./wrangler.jsonc) matches:
```jsonc
"r2_buckets": [
  {
    "binding": "BUCKET",
    "bucket_name": "aframebuilders",
    "remote": true
  }
]
```

#### ⚠️ Enable R2 Public Access (Required for Website Images)
1. Go to **Cloudflare Dashboard** > **R2 Object Storage**.
2. Click on the bucket **`aframebuilders`**.
3. Go to the **Settings** tab.
4. Under **Public access**, click **Enable `r2.dev` subdomain** (or connect a custom domain).
5. Copy your public bucket URL (e.g., `https://pub-xxxxxxxxxxxxxxxx.r2.dev/`).

### Step 5: Seed the D1 Database
Initialize all 7 tables and insert default starter records:
```bash
npm run d1:seed:remote
```
*(This executes [seed.sql](./seed.sql) on your remote Cloudflare D1 database).*

### Step 6: Deploy the Backend API
Deploy the Cloudflare Worker to production:
```bash
npm run deploy
```
Once deployed, Wrangler displays your live Worker URL:
```txt
Deployed my-api triggers:
  https://my-api.<your-subdomain>.workers.dev
```

### Step 7: Connect Frontend to the New Backend
In the `arframe` frontend directory, update `.env.development` and `.env.production` with your new URLs:
```env
VITE_API_BASE_URL=https://my-api.<your-subdomain>.workers.dev
VITE_IMAGE_BASE_URL=https://pub-xxxxxxxxxxxxxxxx.r2.dev/
```

---

## ⚡ Quick Command Reference

| Command | Description |
|---|---|
| `npm install` | Installs all required backend dependencies. |
| `npm run dev` | Runs the local Cloudflare Worker development server (`http://localhost:8787`). |
| `npm run deploy` | Deploys the Worker to Cloudflare production. |
| `npm run d1:seed:remote` | Executes [seed.sql](./seed.sql) on the **remote Cloudflare D1 database**. |
| `npm run d1:seed` | Executes [seed.sql](./seed.sql) on the **local development D1 database**. |
| `npm run cf-typegen` | Synchronizes TypeScript bindings from `wrangler.jsonc`. |

---

## 🗄️ Database Architecture (Cloudflare D1)

Managed in [seed.sql](./seed.sql):

1. **`categories`**: Project categories (`Commercial`, `Luxury Villas`, `Interiors`).
2. **`projects`**: Portfolio projects with descriptions, client info, built-up areas, and image galleries.
3. **`design_excellence`**: Architectural disciplines and service offerings.
4. **`users`**: Administrator credentials for accessing `/admin`.
5. **`hero_images`**: Configurable banner hero photos across site pages (`home`, `projects`, `about`, `contact`).
6. **`before_after`**: Renovation transformations with before/after comparison photos.
7. **`proposed_projects`**: Concept sketches, 3D visualizations, and proposed project showcases displayed on the homepage slider.

---

## 📦 Object Storage Folders (Cloudflare R2)

All media in the `aframebuilders` R2 bucket is organized into folder prefixes:

- **`proposed/`**: Proposed & ongoing project photos and sketches.
- **`Heroimages/`**: Page banner images and hero slides.
- **`projects/`**: Project gallery images and covers.
- **`beforeandafter/`**: Before & after transformation photography.

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/login` | Admin login and JWT token generation |
| `GET` | `/api/projects` | List projects (supports pagination `?page=1&limit=6`) |
| `GET` | `/api/projects/:id` | Get details of a single project |
| `POST` | `/api/projects` | Create a new project with image upload (Admin) |
| `PUT` | `/api/projects/:id` | Update an existing project (Admin) |
| `DELETE` | `/api/projects/:id` | Delete a project and remove its R2 images (Admin) |
| `GET` | `/api/proposed-projects` | List all proposed and ongoing projects |
| `POST` | `/api/proposed-projects` | Upload proposed project photo to R2 (`proposed/`) (Admin) |
| `DELETE` | `/api/proposed-projects/:id` | Delete proposed project and remove from R2 (Admin) |
| `GET` | `/api/before-after` | List before/after transformation projects |
| `POST` | `/api/before-after` | Upload before/after images and details (Admin) |
| `DELETE` | `/api/before-after/:id` | Delete transformation and remove from R2 (Admin) |
| `GET` | `/api/hero-images` | Get configured hero banner images |
| `POST` | `/api/hero-images` | Upload hero image for a page (Admin) |
| `DELETE` | `/api/hero-images/:id` | Remove hero image (Admin) |
