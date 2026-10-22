import type { Domain } from "./types";
const q = encodeURIComponent;
/** Where to learn about or buy a pick. Plain search links, no affiliate tags. */
export function giftLink(domain: Domain, name: string): string {
  switch (domain) {
    case "book": return `https://bookshop.org/search?keywords=${q(name)}`;
    case "artist": return `https://bandcamp.com/search?q=${q(name)}`;
    case "podcast": return `https://podcasts.apple.com/us/search?term=${q(name)}`;
    case "movie":
    case "tv_show": return `https://www.justwatch.com/us/search?q=${q(name)}`;
    case "videogame": return `https://store.steampowered.com/search/?term=${q(name)}`;
    case "place": return `https://www.google.com/maps/search/?api=1&query=${q(name)}`;
    default: return `https://www.google.com/search?q=${q(name + " official site")}`;
  }
}
