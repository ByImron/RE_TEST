import type { PropertyObject } from "@/lib/objects/types";

// Flats and houses are drawn together as the residential shakhmatka; every
// other type (shops, offices, parking...) is listed in its own section below.
export const RESIDENTIAL_TYPES = new Set(["apartment", "house"]);

// The `block` field is free text typed on the building form ("Подъезд 2",
// "Даромадгоҳи 1"), optionally written as "Block / entrance" -- e.g.
// "Блоки А / даромадгоҳи 1" -- to say which block an entrance belongs to.
//
// A label WITHOUT a "/" names an entrance and nothing else, so it has no parent:
// every such entrance of the building belongs to the same numbering, which
// simply carries on from one entrance to the next. (Treating the whole label
// as its own parent block, as this used to, restarted the count at 1 in every
// entrance -- the opposite of what a building with two entrances wants.)
// A label WITH a "/" is grouped by the part before it.
function parentBlock(block: string): string {
  const slash = block.indexOf("/");
  return slash === -1 ? "" : block.slice(0, slash).trim();
}

// Entrances/blocks in the order the shakhmatka draws them left to right:
// first-created first, so the entrance you built first sits leftmost and each
// new one appears to its right -- the way a real shakhmatka grows -- instead of
// an alphabetical order that reshuffles them.
//
// Units made in one batch share a creation timestamp, and then "first created"
// says nothing about which entrance comes first. Ties are broken by the label
// itself, compared as numbers where it has any ("Подъезд 2" before "Подъезд 10"),
// so the order is the same on every screen no matter what order the database
// happened to return the rows in. The grid and the numbers below both use THIS
// function: a flat's number must follow the layout on screen.
export function orderBlocks(units: PropertyObject[]): string[] {
  const firstCreated = new Map<string, string>();
  for (const u of units) {
    const b = u.block ?? "";
    const ts = u.created_at ?? "";
    const seen = firstCreated.get(b);
    if (seen === undefined || ts < seen) firstCreated.set(b, ts);
  }
  return [...firstCreated.keys()].sort((a, b) => {
    const byTime = (firstCreated.get(a) ?? "").localeCompare(firstCreated.get(b) ?? "");
    if (byTime !== 0) return byTime;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

// Numbering rules:
//  - Separate sequence PER TYPE: apartments 1,2,3…, shops 1,2,3…, parking
//    1,2,3… -- a ground-floor shop is "shop 1", never bumping the real flat
//    №1.
//  - CONTINUOUS ACROSS ENTRANCES: each type's sequence carries on into the next
//    entrance instead of restarting -- entrance 1 flats 1..119, entrance 2
//    flats 120…, not entrance 2 starting again at 1. Only an entrance written
//    as "Block / entrance" with a DIFFERENT block name before the "/" starts
//    its own sequence from 1 again.
//  - Within an entrance, units are ordered floor by floor from the ground up,
//    left to right by position.
//  - Entrances are taken in the order the shakhmatka draws them (orderBlocks),
//    so the numbers match the layout. Residential types are ordered together
//    (that is how they are drawn); each other type is ordered on its own, like
//    its own section of the screen.
export function computeApartmentNumbers(units: PropertyObject[]): Map<string, number> {
  const numbers = new Map<string, number>();

  // Ordering scopes: all residential units together, every other type alone.
  const scopes = new Map<string, PropertyObject[]>();
  for (const u of units) {
    const type = u.type ?? "apartment";
    const scope = RESIDENTIAL_TYPES.has(type) ? "residential" : type;
    const arr = scopes.get(scope);
    if (arr) arr.push(u);
    else scopes.set(scope, [u]);
  }

  // Running counter per (parent block, type). Entrances that share a parent
  // (or have none) share the counter, so numbering flows across them; a
  // different parent block gets a fresh counter and restarts from 1.
  const typeCounter = new Map<string, number>();

  for (const scopeUnits of scopes.values()) {
    for (const block of orderBlocks(scopeUnits)) {
      const parent = parentBlock(block);

      // This entrance's units grouped by type.
      const byType = new Map<string, PropertyObject[]>();
      for (const u of scopeUnits) {
        if ((u.block ?? "") !== block) continue;
        const type = u.type ?? "apartment";
        const arr = byType.get(type);
        if (arr) arr.push(u);
        else byType.set(type, [u]);
      }

      for (const [type, groupUnits] of byType) {
        // Ground floor up, then left to right.
        const sorted = [...groupUnits].sort((a, b) => {
          const fa = a.floor ?? 0;
          const fb = b.floor ?? 0;
          if (fa !== fb) return fa - fb;
          return (a.position_in_floor ?? 0) - (b.position_in_floor ?? 0);
        });
        const key = `${parent} ${type}`;
        let n = typeCounter.get(key) ?? 0;
        for (const u of sorted) {
          n += 1;
          numbers.set(u.id, n);
        }
        typeCounter.set(key, n);
      }
    }
  }

  return numbers;
}
