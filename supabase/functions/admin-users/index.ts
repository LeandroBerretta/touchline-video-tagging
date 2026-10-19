// Supabase Edge Function "admin-users": lets Touchline admins invite, list, re-role and remove users.
// Account changes need Supabase's service-role key, which must never reach the browser. Supabase gives
// every Edge Function SUPABASE_URL and its secret keys as environment settings (see serverKey), so nothing
// secret is stored in this file or the repository. Every request must come from a signed-in admin.
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > Via editor, name it
// "admin-users", paste this file, Deploy (see database/README.md).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const roles = new Set(["admin", "viewer"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type AuthUser = {
  id: string;
  email?: string;
  created_at: string;
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

function describe(user: AuthUser, role: string | null) {
  return {
    id: user.id,
    email: user.email ?? "",
    role,
    createdAt: user.created_at,
    invitedAt: user.invited_at ?? null,
    confirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

// Projects on Supabase's newer API keys get SUPABASE_SECRET_KEYS (a JSON list of secret keys by name);
// older ones get SUPABASE_SERVICE_ROLE_KEY. Either gives the function admin access.
function serverKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    const key = keys.default ?? Object.values(keys)[0];
    if (key) return key;
  } catch {
    // Not set or not JSON: fall back to the older key.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

// The project's public key (sent by the page as "apikey"; also given to Edge Functions), for reading
// data as the signed-in caller.
function publicKey(request: Request) {
  const sent = request.headers.get("apikey");
  if (sent) return sent;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    const key = keys.default ?? Object.values(keys)[0];
    if (key) return key;
  } catch {
    // Not set or not JSON: fall back to the older key.
  }
  return Deno.env.get("SUPABASE_ANON_KEY");
}

// A newer "sb_secret_…" key is not a sign-in token: the database API wants it only as the apikey header
// (Supabase then acts with full access), so it is not also sent as "Authorization: Bearer".
function databaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_secret_") && target.includes("/rest/v1/") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    return fetch(input, { ...init, headers });
  };
}

// Supabase errors are not always Error objects; get a readable message from any of them.
function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) {
    const details = "details" in error && typeof error.details === "string" && error.details ? ` (${error.details})` : "";
    return `${error.message}${details}`;
  }
  return String(error || "Something went wrong.");
}

function cleanRedirect(value: unknown) {
  return typeof value === "string" && /^https?:\/\//.test(value) ? value : undefined;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = serverKey();
  if (!url || !serviceKey) return reply({ error: "The admin-users function is missing its Supabase settings." }, 500);
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: databaseFetch(serviceKey) },
  });

  // Who is asking: their sign-in token must be valid and their role must be admin.
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return reply({ error: "Your session has expired. Sign out and sign in again." }, 401);
  // The role is read as the caller (every user may read their own role), so this check doesn't depend
  // on the server key; a database error is reported rather than mistaken for "not an admin".
  const callerKey = publicKey(request);
  if (!callerKey) return reply({ error: "The admin-users function is missing the project's public key." }, 500);
  const asCaller = createClient(url, callerKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerRole, error: roleError } = await asCaller.from("app_users").select("role").eq("user_id", caller.user.id).maybeSingle();
  if (roleError) return reply({ error: `Could not check your role: ${roleError.message}` }, 500);
  if (callerRole?.role !== "admin") return reply({ error: "Only admins can manage users." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "The request could not be read." }, 400);
  }

  try {
    switch (body.action) {
      case "list": {
        const users: AuthUser[] = [];
        for (let page = 1; page <= 50; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw new Error(`Listing accounts: ${messageOf(error)}`);
          users.push(...(data.users as AuthUser[]));
          if (data.users.length < 200) break;
        }
        const { data: roleRows, error } = await admin.from("app_users").select("user_id, role");
        if (error) throw new Error(`Reading roles: ${messageOf(error)}`);
        const roleOf = new Map((roleRows ?? []).map((row) => [row.user_id, row.role]));
        return reply({ users: users.map((user) => describe(user, roleOf.get(user.id) ?? null)) });
      }

      case "invite": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const role = String(body.role ?? "");
        if (!emailPattern.test(email)) return reply({ error: "Enter a valid email address." }, 400);
        if (!roles.has(role)) return reply({ error: "Choose Admin or Viewer." }, 400);
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: cleanRedirect(body.redirectTo) });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) {
            return reply({ error: `${email} already has an account. Find it in the list to change its role.` }, 409);
          }
          throw error;
        }
        const { error: roleError } = await admin.from("app_users").upsert({ user_id: data.user.id, role });
        if (roleError) throw roleError;
        return reply({ user: describe(data.user as AuthUser, role) });
      }

      case "resend": {
        const { data, error } = await admin.auth.admin.getUserById(String(body.userId ?? ""));
        if (error || !data?.user?.email) return reply({ error: "That user no longer exists." }, 404);
        const user = data.user as AuthUser;
        if (user.email_confirmed_at || user.last_sign_in_at) {
          return reply({ error: `${user.email} has already signed in. Send a password reset instead.` }, 409);
        }
        const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(user.email!, { redirectTo: cleanRedirect(body.redirectTo) });
        if (inviteError) throw inviteError;
        return reply({ ok: true });
      }

      case "setRole": {
        const userId = String(body.userId ?? "");
        const role = String(body.role ?? "");
        if (!roles.has(role)) return reply({ error: "Choose Admin or Viewer." }, 400);
        if (userId === caller.user.id && role !== "admin") {
          return reply({ error: "You can't take away your own admin role. Ask another admin to do it." }, 400);
        }
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error || !data?.user) return reply({ error: "That user no longer exists." }, 404);
        const { error: roleError } = await admin.from("app_users").upsert({ user_id: userId, role });
        if (roleError) throw roleError;
        return reply({ user: describe(data.user as AuthUser, role) });
      }

      case "remove": {
        const userId = String(body.userId ?? "");
        if (userId === caller.user.id) return reply({ error: "You can't remove your own account. Ask another admin to do it." }, 400);
        // Deleting the account also deletes its role (app_users cascades) and signs them out everywhere.
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return reply({ ok: true });
      }

      default:
        return reply({ error: "Unknown request." }, 400);
    }
  } catch (error) {
    console.error("admin-users failed:", error);
    return reply({ error: messageOf(error) }, 500);
  }
});
