export type Domain = "book" | "brand" | "artist" | "podcast" | "movie" | "tv_show" | "videogame" | "place";

export const DOMAIN_URN: Record<Domain, string> = {
  book: "urn:entity:book",
  brand: "urn:entity:brand",
  artist: "urn:entity:artist",
  podcast: "urn:entity:podcast",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  videogame: "urn:entity:videogame",
  place: "urn:entity:place",
};

export interface Profile {
  label: string; // e.g. "my sister"
  occasion: string;
  budget: string;
  location: string;
  // "person" (a chef, author, presenter) is searched untyped: the kit docs list no person urn.
  interests: { name: string; type: Domain | "person" }[];
  vibes: string[];
}

export interface Resolved {
  input: string;
  id: string;
  name: string;
  type: Domain;
  description?: string;
}

export interface Candidate {
  id: string;
  name: string;
  domain: Domain;
  affinity?: number;
  description?: string;
  image?: string;
  cites: string[]; // names of the person's signal entities that led here
}

export interface Gift {
  candidateId: string;
  name: string;
  domain: Domain;
  idea: string;
  why: string;
  cites: string[];
  affinity?: number;
  link: string;
  image?: string;
}

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "skipped"; detail?: string; endpoint?: string }
  | { type: "profile"; profile: Profile }
  | { type: "resolved"; entities: Resolved[]; unresolved: string[] }
  | { type: "taste"; tags: { id: string; name: string }[] }
  | { type: "gifts"; gifts: Gift[]; usedFallback: boolean }
  | { type: "error"; code: string; message: string };
