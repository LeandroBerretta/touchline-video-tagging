// An in-memory stand-in for the parts of supabase-js that Touchline uses: password auth, auth events,
// and table queries (select / insert / upsert / update / delete with eq, order, single, maybeSingle).
// It mimics the database rules that matter to the app: viewers only see published videos, players
// (never staff) and playlists of published videos; deleting a team removes its squad and unlinks videos.

let idCounter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createFakeSupabase({ accounts = {}, tables = {}, signedInAs = null } = {}) {
  const db = {
    app_users: [],
    videos: [],
    playlists: [],
    teams: [],
    team_members: [],
    ...clone(tables),
  };
  for (const [email, account] of Object.entries(accounts)) {
    if (account.role && !db.app_users.some((row) => row.user_id === account.id)) {
      db.app_users.push({ user_id: account.id, role: account.role });
    }
  }
  const listeners = [];
  const calls = [];
  const failures = [];
  let session = null;
  if (signedInAs) session = { user: { id: accounts[signedInAs].id, email: signedInAs } };

  const roleOf = () => db.app_users.find((row) => row.user_id === session?.user.id)?.role || null;

  // What the signed-in user may read, like the row-level security policies.
  function visible(table, rows) {
    const role = roleOf();
    if (!session || !role) return table === "app_users" ? rows.filter((row) => row.user_id === session?.user.id) : [];
    if (role === "admin") return table === "app_users" ? rows.filter((row) => row.user_id === session.user.id) : rows;
    switch (table) {
      case "app_users": return rows.filter((row) => row.user_id === session.user.id);
      case "videos": return rows.filter((row) => row.status === "published");
      case "team_members": return rows.filter((row) => row.kind === "player");
      case "playlists": return rows.filter((row) => db.videos.some((video) => video.id === row.video_id && video.status === "published"));
      default: return rows;
    }
  }

  function emit(event) {
    for (const listener of listeners) setTimeout(() => listener(event, session), 0);
  }

  const auth = {
    onAuthStateChange(callback) {
      listeners.push(callback);
      setTimeout(() => callback("INITIAL_SESSION", session), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async getSession() {
      return { data: { session }, error: null };
    },
    async signInWithPassword({ email, password }) {
      calls.push(["signInWithPassword", email]);
      const account = accounts[email];
      if (!account || account.password !== password) return { data: { session: null }, error: { message: "Invalid login credentials" } };
      session = { user: { id: account.id, email } };
      emit("SIGNED_IN");
      return { data: { session }, error: null };
    },
    async signOut(options) {
      calls.push(["signOut", options]);
      const failure = takeFailure("auth", "signOut");
      if (failure) return { error: failure };
      session = null;
      emit("SIGNED_OUT");
      return { error: null };
    },
    async resetPasswordForEmail(email, options) {
      calls.push(["resetPasswordForEmail", email, options]);
      return { data: {}, error: null };
    },
    async updateUser(changes) {
      calls.push(["updateUser", changes]);
      return { data: {}, error: null };
    },
  };

  function takeFailure(table, op) {
    const index = failures.findIndex((item) => item.table === table && (!item.op || item.op === op));
    if (index < 0) return null;
    return failures.splice(index, 1)[0].error;
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.op = null;
      this.filters = [];
      this.sort = null;
      this.returning = false;
      this.mode = "many";
    }
    select() {
      if (!this.op) this.op = "select";
      else this.returning = true;
      return this;
    }
    insert(rows) { this.op = "insert"; this.payload = rows; return this; }
    upsert(row) { this.op = "upsert"; this.payload = row; return this; }
    update(values) { this.op = "update"; this.payload = values; return this; }
    delete() { this.op = "delete"; return this; }
    eq(column, value) { this.filters.push([column, value]); return this; }
    order(column, { ascending = true } = {}) { this.sort = [column, ascending]; return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }

    matches(row) {
      return this.filters.every(([column, value]) => row[column] === value);
    }

    finish(rows) {
      const data = clone(rows);
      if (this.mode === "single") {
        return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      }
      if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
      return { data, error: null };
    }

    run() {
      calls.push([this.table, this.op, clone(this.payload ?? null), clone(this.filters)]);
      const failure = takeFailure(this.table, this.op);
      if (failure) return { data: null, error: failure };
      const rows = db[this.table];
      const role = roleOf();
      const writer = role === "admin";
      if (this.op === "select") {
        let result = visible(this.table, rows).filter((row) => this.matches(row));
        if (this.sort) {
          const [column, ascending] = this.sort;
          result = [...result].sort((a, b) => String(a[column] ?? "").localeCompare(String(b[column] ?? "")) * (ascending ? 1 : -1));
        }
        return this.finish(result);
      }
      if (!writer) return { data: null, error: { message: "new row violates row-level security policy" } };
      const now = new Date().toISOString();
      if (this.op === "insert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item) => ({
          id: newId(),
          created_at: now,
          ...(this.table === "videos" ? { updated_at: now, published_at: null, team_id: null } : {}),
          ...(this.table === "team_members" ? { kind: "player", shirt_number: null, staff_role: "", active: true } : {}),
          ...(this.table === "playlists" ? { note: "", clip_seconds: 20 } : {}),
          ...clone(item),
        }));
        if (this.table === "teams" && items.some((item) => rows.some((row) => row.name === item.name))) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint "teams_name_key"' } };
        }
        rows.push(...items);
        return this.returning ? this.finish(items) : { data: null, error: null };
      }
      if (this.op === "upsert") {
        const item = clone(this.payload);
        const existing = rows.find((row) => row.id === item.id);
        let saved;
        if (existing) {
          Object.assign(existing, item);
          saved = existing;
        } else {
          saved = { created_at: now, team_id: null, published_at: null, ...item };
          rows.push(saved);
        }
        return this.returning ? this.finish([saved]) : { data: null, error: null };
      }
      if (this.op === "update") {
        const targets = rows.filter((row) => this.matches(row));
        for (const row of targets) Object.assign(row, clone(this.payload));
        return this.returning ? this.finish(targets) : { data: null, error: null };
      }
      if (this.op === "delete") {
        const targets = rows.filter((row) => this.matches(row));
        db[this.table] = rows.filter((row) => !targets.includes(row));
        if (this.table === "teams") {
          const ids = new Set(targets.map((row) => row.id));
          db.team_members = db.team_members.filter((row) => !ids.has(row.team_id));
          for (const video of db.videos) if (ids.has(video.team_id)) video.team_id = null;
        }
        if (this.table === "videos") {
          const ids = new Set(targets.map((row) => row.id));
          db.playlists = db.playlists.filter((row) => !ids.has(row.video_id));
        }
        return this.returning ? this.finish(targets) : { data: null, error: null };
      }
      throw new Error(`Unsupported query on ${this.table}`);
    }
  }

  return {
    client: { auth, from: (table) => new Query(table) },
    db,
    calls,
    /** Make the next matching call fail, e.g. fail("videos", "upsert", "Failed to fetch"). */
    fail(table, op, message = "Failed to fetch") {
      failures.push({ table, op, error: { message } });
    },
    get session() {
      return session;
    },
  };
}

export const ids = { newId };
