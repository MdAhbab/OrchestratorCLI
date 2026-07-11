/**
 * Custom CLI registry — frontend wire to the `custom_cli` table via the
 * `/cli/custom` REST endpoints. The installed CLI registry (in
 * `packaging/bootstrapper/cli_registry.json`) is read separately via
 * `/settings/cli-registry` and is merged into the agent picker by
 * `store.tsx::applyCliRegistry`.
 *
 * Validation rules mirror the backend's `custom_cli_service.py` (slug pattern,
 * command chars, etc.) — surfacing them here gives the form instant feedback
 * while the server stays authoritative.
 */

import { apiFetch, isAbortError } from "./api";

export type CustomCli = {
  slug: string;
  display_name: string;
  command: string;
  args_template: string;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomCliInput = {
  slug: string;
  display_name: string;
  command: string;
  args_template?: string;
  description?: string;
  enabled?: boolean;
};

/** Validators mirroring backend `custom_cli_service.py`. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const COMMAND_RE = /^[A-Za-z0-9_.+/\\-]+$/;
export const MAX_DISPLAY_NAME = 80;
export const MAX_DESCRIPTION = 500;
const SHELL_META_RE = /[;&|`$<>\n\r]/;

export function validateCustomCliInput(input: CustomCliInput): string | null {
  const slug = (input.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) {
    return "Slug must be 2–63 chars: lowercase letters, digits, '-' (start with letter or digit).";
  }
  const name = (input.display_name ?? "").trim();
  if (!name) return "Display name is required.";
  if (name.length > MAX_DISPLAY_NAME)
    return `Display name must be ${MAX_DISPLAY_NAME} characters or fewer.`;
  const command = (input.command ?? "").trim();
  if (!command) return "Command is required.";
  if (!COMMAND_RE.test(command))
    return "Command may only contain letters, digits, '.', '_', '+', '/', '\\', and '-'.";
  if (input.args_template && SHELL_META_RE.test(input.args_template))
    return "Args template must not contain shell metacharacters (';', '&', '|', '`', '$', '<', '>', newlines).";
  if (input.description && input.description.length > MAX_DESCRIPTION)
    return `Description must be ${MAX_DESCRIPTION} characters or fewer.`;
  return null;
}

export type CustomCliListResponse = {
  clis?: CustomCli[];
};

export async function listCustomClis(
  init?: RequestInit & { timeoutMs?: number },
): Promise<CustomCli[]> {
  const res = await apiFetch("/cli/custom", { ...init });
  if (!res.ok) {
    throw new Error(`Failed to load custom CLIs (${res.status}).`);
  }
  const data = (await res.json()) as CustomCliListResponse;
  return Array.isArray(data.clis) ? data.clis : [];
}

export async function registerCustomCli(
  payload: CustomCliInput,
  init?: RequestInit & { timeoutMs?: number },
): Promise<CustomCli> {
  const res = await apiFetch("/cli/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...init,
  });
  if (!res.ok) {
    const detail = await readErrorDetail(res);
    throw new Error(detail || `Failed to register custom CLI (${res.status}).`);
  }
  return (await res.json()) as CustomCli;
}

export async function deleteCustomCli(
  slug: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<void> {
  const res = await apiFetch(`/cli/custom/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    ...init,
  });
  if (!res.ok && res.status !== 404) {
    const detail = await readErrorDetail(res);
    throw new Error(detail || `Failed to delete custom CLI (${res.status}).`);
  }
}

async function readErrorDetail(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    return typeof data?.detail === "string" ? data.detail : null;
  } catch (e) {
    if (isAbortError(e)) return null;
    return null;
  }
}
