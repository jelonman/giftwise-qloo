// Fixtures shaped like the Qloo responses the harness client/normalisers consume
// (results.entities[] with entity_id, name, properties, query.affinity, query.explainability;
//  results.tags[] with id, name, query.affinity). Not real Qloo data: invented names, real shape.
export const searchFleabag = { results: [
  { entity_id: "ENT-FLEABAG", name: "Fleabag", subtype: "urn:entity:tv_show", properties: { short_description: "A dry-witted woman navigates grief in London." } },
  { entity_id: "ENT-FLEABAG-2", name: "Fleabag: The Scriptures", properties: {} },
] };
export const searchByName: Record<string, any> = {
  Fleabag: searchFleabag,
  "Phoebe Bridgers": { results: [{ entity_id: "ENT-PHOEBE", name: "Phoebe Bridgers", properties: { short_description: "Indie singer-songwriter." } }] },
  "Normal People": { results: [{ entity_id: "ENT-NP", name: "Normal People", properties: {} }] },
};
export const tagsCozy = { results: { tags: [{ id: "urn:tag:keyword:qloo:cozy", name: "Cozy", type: "urn:tag:keyword:qloo", query: { affinity: 0.8 } }] } };
export const dnaTags = { results: { tags: [
  { id: "urn:tag:genre:media:comedy_drama", name: "Comedy-drama", query: { affinity: 0.9 } },
  { id: "urn:tag:genre:media:indie", name: "Indie", query: { affinity: 0.8 } },
] } };
const ent = (id: string, name: string, aff: number, extra: any = {}) => ({
  entity_id: id, name, query: { affinity: aff, explainability: { signals: [{ entity_id: "ENT-FLEABAG", name: "Fleabag" }] } }, properties: { short_description: `About ${name}`, ...extra },
});
export const insightsByType: Record<string, any> = {
  "urn:entity:book": { results: { entities: [ent("B1", "Conversations with Friends", 0.92), ent("ENT-NP", "Normal People", 0.99)] } },
  "urn:entity:brand": { results: { entities: [ent("BR1", "Aesop", 0.81)] } },
  "urn:entity:artist": { results: { entities: [ent("A1", "Big Thief", 0.88), ent("A2", "Boygenius", 0.86)] } },
  "urn:entity:podcast": { results: { entities: [ent("P1", "Poog", 0.7)] } },
  "urn:entity:movie": { results: { entities: [ent("M1", "Lady Bird", 0.77)] } },
  "urn:entity:tv_show": { results: { entities: [] } },
  "urn:entity:videogame": { results: { entities: [] } },
};
export const composeReply = { gifts: [
  { candidate_id: "B1", idea: "A hardback of Conversations with Friends", why: "Same sharp, awkward intimacy as Fleabag, from the author of Normal People.", cites: ["Fleabag"] },
  { candidate_id: "A1", idea: "Big Thief on vinyl", why: "Indie heartbreak in the Phoebe Bridgers register.", cites: ["Fleabag", "Not In List"] },
  { candidate_id: "A2", idea: "Boygenius record", why: "Phoebe Bridgers is in the band.", cites: ["Fleabag"] },
  { candidate_id: "BR1", idea: "Aesop hand balm", why: "Quiet, tactile luxury that matches the cozy tag.", cites: ["Fleabag"] },
  { candidate_id: "M1", idea: "Lady Bird on a movie night", why: "Warm and a little melancholy, like Fleabag.", cites: ["Fleabag"] },
  { candidate_id: "NOT-REAL", idea: "Invented gift", why: "This id was never returned by Qloo.", cites: [] },
] };
export const profileReply = { label: "your sister", occasion: "30th birthday", budget: "60 euros", location: "", interests: [
  { name: "Fleabag", type: "tv_show" }, { name: "Phoebe Bridgers", type: "artist" }, { name: "Normal People", type: "book" }, { name: "Bad Type", type: "spaceship" } ], vibes: ["cozy"] };
