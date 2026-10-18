// Shared test data: one team with a small made-up squad, and helpers for videos and moments.
import { videoRow, moment } from "./helpers/app.js";

export const TEAM = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Test FC", created_at: "2026-01-01T00:00:00Z" };
export const OTHER_TEAM = { id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Second FC", created_at: "2026-01-02T00:00:00Z" };

export const PLAYERS = [
  { id: "bbbbbbbb-0000-4000-8000-000000000009", team_id: TEAM.id, name: "Nine Example", kind: "player", shirt_number: 9, staff_role: "", active: true, created_at: "2026-01-01T00:00:01Z" },
  { id: "bbbbbbbb-0000-4000-8000-000000000017", team_id: TEAM.id, name: "Seventeen Example", kind: "player", shirt_number: 17, staff_role: "", active: true, created_at: "2026-01-01T00:00:02Z" },
  { id: "bbbbbbbb-0000-4000-8000-000000000004", team_id: TEAM.id, name: "Four Example", kind: "player", shirt_number: 4, staff_role: "", active: true, created_at: "2026-01-01T00:00:03Z" },
];
export const STAFF = [
  { id: "cccccccc-0000-4000-8000-000000000001", team_id: TEAM.id, name: "Coach Example", kind: "staff", shirt_number: null, staff_role: "Team Manager", active: true, created_at: "2026-01-01T00:00:04Z" },
];

export const IN_PROGRESS_ID = "dddddddd-0000-4000-8000-000000000001";
export const PUBLISHED_ID = "dddddddd-0000-4000-8000-000000000002";
export const QUEUED_ID = "dddddddd-0000-4000-8000-000000000003";

/** A team, its squad, and three videos: In progress, Published and Not started. */
export function standardTables({ inProgressTags, publishedTags } = {}) {
  return {
    teams: [TEAM],
    team_members: [...PLAYERS, ...STAFF],
    videos: [
      videoRow({
        id: IN_PROGRESS_ID,
        name: "Test FC vs Rivals",
        teamId: TEAM.id,
        updated: "2026-10-05T10:00:00Z",
        tags: inProgressTags ?? [moment("m-start", 10, "start_of_game"), moment("m-corner", 300, "corner", { playerIds: [PLAYERS[0].id], playerNames: "Nine Example" })],
      }),
      videoRow({
        id: PUBLISHED_ID,
        name: "Test FC vs Okanagan",
        status: "published",
        teamId: TEAM.id,
        updated: "2026-10-09T10:00:00Z",
        url: "https://vimeo.com/222222222",
        tags: publishedTags ?? [
          moment("p-start", 10, "start_of_game"),
          moment("p-goal1", 600, "goal", { playerIds: [PLAYERS[0].id], playerNames: "Nine Example" }),
          moment("p-shot", 900, "shot_on_target", { playerIds: [PLAYERS[1].id], playerNames: "Seventeen Example" }),
          moment("p-half", 2700, "half_time"),
          moment("p-corner", 3100, "corner"),
          moment("p-goal2", 3600, "goal", { playerIds: [PLAYERS[1].id], playerNames: "Seventeen Example" }),
          moment("p-untyped", 4000, "", { done: false, completed: false }),
        ],
      }),
      videoRow({ id: QUEUED_ID, name: "Test FC vs Queue", teamId: TEAM.id, updated: "2026-10-01T10:00:00Z", url: "https://vimeo.com/333333333", tags: [] }),
    ],
  };
}
