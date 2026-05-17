# AI CLI Orchestrator UI

## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

The frontend expects backend APIs at `/api/*` and health at `/health`.
During development, Vite proxies these routes to `VITE_BACKEND_TARGET`
(default: `http://127.0.0.1:8000`).
