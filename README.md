# Ezlisten Admin

Next.js admin app for managing Ezlisten audio files, transcript timestamps, and filter tags.

## Setup

Use Node 20, then install dependencies:

```bash
nvm use
npm install
```

Create `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

Run the backend from `ezlisten-backend`, then start the admin app:

```bash
npm run dev
```

The admin app runs at `http://localhost:3001` and calls the backend at `http://localhost:3000` by default.

The admin app uses the existing Ezlisten auth endpoints. Register or sign in, upload audio, then manage metadata, transcript segments, and filter tags for that user's library.