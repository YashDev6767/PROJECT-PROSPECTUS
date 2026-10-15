/** The four MSOT campuses. Stable ids double as Campus primary keys in the database. */
export const campuses = [
  { id: "hi-tech", name: "HI-Tech" },
  { id: "ratnam", name: "Ratnam" },
  { id: "rgib", name: "RGIB" },
  { id: "juj", name: "JUJ" },
] as const;

export type CampusId = (typeof campuses)[number]["id"];
export const campusIds = campuses.map((c) => c.id) as [CampusId, ...CampusId[]];
export const tracks = [
  { id: "MIRAI", name: "Mirai Track" },
  { id: "UNIVERSITY", name: "University Track" },
] as const;
