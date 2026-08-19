// =========================================================
// PARSER.JS
// Parser básico de equipos exportados desde Pokémon Showdown
// y validación práctica de las reglas de la Copa 151 UABCS.
// =========================================================

// Lista de Pokémon Kanto #001-#151 (nombres base tal como Showdown los exporta).
// Se usan en minúsculas para comparar sin distinguir mayúsculas.
const KANTO_151 = [
  "Bulbasaur","Ivysaur","Venusaur","Charmander","Charmeleon","Charizard",
  "Squirtle","Wartortle","Blastoise","Caterpie","Metapod","Butterfree",
  "Weedle","Kakuna","Beedrill","Pidgey","Pidgeotto","Pidgeot",
  "Rattata","Raticate","Spearow","Fearow","Ekans","Arbok",
  "Pikachu","Raichu","Sandshrew","Sandslash","Nidoran-F","Nidorina",
  "Nidoqueen","Nidoran-M","Nidorino","Nidoking","Clefairy","Clefable",
  "Vulpix","Ninetales","Jigglypuff","Wigglytuff","Zubat","Golbat",
  "Oddish","Gloom","Vileplume","Paras","Parasect","Venonat",
  "Venomoth","Diglett","Dugtrio","Meowth","Persian","Psyduck",
  "Golduck","Mankey","Primeape","Growlithe","Arcanine","Poliwag",
  "Poliwhirl","Poliwrath","Abra","Kadabra","Alakazam","Machop",
  "Machoke","Machamp","Bellsprout","Weepinbell","Victreebel","Tentacool",
  "Tentacruel","Geodude","Graveler","Golem","Ponyta","Rapidash",
  "Slowpoke","Slowbro","Magnemite","Magneton","Farfetchd","Doduo",
  "Dodrio","Seel","Dewgong","Grimer","Muk","Shellder",
  "Cloyster","Gastly","Haunter","Gengar","Onix","Drowzee",
  "Hypno","Krabby","Kingler","Voltorb","Electrode","Exeggcute",
  "Exeggutor","Cubone","Marowak","Hitmonlee","Hitmonchan","Lickitung",
  "Koffing","Weezing","Rhyhorn","Rhydon","Chansey","Tangela",
  "Kangaskhan","Horsea","Seadra","Goldeen","Seaking","Staryu",
  "Starmie","Mr-Mime","Scyther","Jynx","Electabuzz","Magmar",
  "Pinsir","Tauros","Magikarp","Gyarados","Lapras","Ditto",
  "Eevee","Vaporeon","Jolteon","Flareon","Porygon","Omanyte",
  "Omastar","Kabuto","Kabutops","Aerodactyl","Snorlax","Articuno",
  "Zapdos","Moltres","Dratini","Dragonair","Dragonite","Mewtwo","Mew"
];
const KANTO_151_LOWER = new Set(KANTO_151.map(n => n.toLowerCase()));

// Legendarios de Kanto (para la regla de "máximo 1 legendario", Mew aparte porque está prohibido)
const LEGENDARIES_KANTO = new Set(
  ["Articuno","Zapdos","Moltres","Mewtwo"].map(n => n.toLowerCase())
);

const BANNED_MEGA_HINTS = ["-mega", "mega "];
const BANNED_Z_MOVE_HINT = " z"; // ej: "Move Name Z" al final, o "Z-" al inicio
const BANNED_DYNAMAX_ITEMS = ["dynamax candy"];
const BANNED_TERA_HINTS = ["tera type"];

/**
 * Normaliza el nombre de una especie quitando sufijos de forma que no son de Kanto base
 * y quitando texto entre paréntesis (nickname).
 */
function cleanSpeciesName(raw) {
  let name = raw.trim();
  // Quitar apodo: "Apodo (Especie)" -> "Especie"
  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch && !name.startsWith("(")) {
    name = parenMatch[1].trim();
  }
  // Quitar género "(M)" / "(F)" residual ya capturado arriba; limpiar espacios
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

/**
 * Parsea el texto exportado por Pokémon Showdown y devuelve un arreglo de Pokémon.
 * Cada bloque de Pokémon está separado por una línea en blanco.
 */
function parseShowdownText(rawText) {
  const blocks = rawText
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  const pokemons = [];

  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;

    const poke = {
      raw: block,
      species: "",
      item: null,
      ability: null,
      nature: null,
      evs: null,
      ivs: null,
      moves: [],
      isMega: false,
      hasZMove: false,
      hasTera: false,
      hasDynamax: false
    };

    // Primera línea: "Especie @ Objeto" o "Apodo (Especie) @ Objeto" o solo "Especie"
    const firstLine = lines[0];
    let firstLineNoGender = firstLine.replace(/\s*\((M|F)\)\s*/gi, " ").trim();
    const atSplit = firstLineNoGender.split("@");
    let speciesPart = atSplit[0].trim();
    if (atSplit.length > 1) {
      poke.item = atSplit[1].trim();
    }
    poke.species = cleanSpeciesName(speciesPart);

    if (/mega/i.test(firstLine) || (poke.item && /mega/i.test(poke.item))) {
      poke.isMega = true;
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (/^ability:/i.test(line)) {
        poke.ability = line.replace(/^ability:/i, "").trim();
      } else if (/^level:/i.test(line)) {
        poke.level = line.replace(/^level:/i, "").trim();
      } else if (/^evs:/i.test(line)) {
        poke.evs = line.replace(/^evs:/i, "").trim();
      } else if (/^ivs:/i.test(line)) {
        poke.ivs = line.replace(/^ivs:/i, "").trim();
      } else if (/^tera type:/i.test(line)) {
        poke.teraType = line.replace(/^tera type:/i, "").trim();
        poke.hasTera = true;
      } else if (/nature$/i.test(line)) {
        poke.nature = line.replace(/nature$/i, "").trim();
      } else if (/^shiny:/i.test(line)) {
        poke.shiny = line.replace(/^shiny:/i, "").trim();
      } else if (line.startsWith("-")) {
        const move = line.replace(/^-/, "").trim();
        poke.moves.push(move);
        if (/-z$/i.test(move.replace(/\s+/g, "")) || /^z-/i.test(move)) {
          poke.hasZMove = true;
        }
      }
    }

    if (poke.item && BANNED_DYNAMAX_ITEMS.some(h => poke.item.toLowerCase().includes(h))) {
      poke.hasDynamax = true;
    }

    pokemons.push(poke);
  }

  return pokemons;
}

/**
 * Valida un arreglo de Pokémon ya parseado contra las reglas de la Copa 151 UABCS.
 * Devuelve { valid: boolean, errors: string[] }
 */
function validateTeam(pokemons) {
  const errors = [];

  if (!pokemons || pokemons.length === 0) {
    return { valid: false, errors: ["No se detectó ningún Pokémon en el texto pegado."] };
  }

  if (pokemons.length !== 4) {
    errors.push(`Tu equipo debe contener exactamente 4 Pokémon (se detectaron ${pokemons.length}).`);
  }

  const seenSpecies = new Set();
  const seenItems = new Set();
  let legendaryCount = 0;
  let hasMew = false;

  for (const poke of pokemons) {
    const speciesLower = poke.species.toLowerCase();

    if (!KANTO_151_LOWER.has(speciesLower)) {
      errors.push(`"${poke.species}" no pertenece a los Pokémon #001-#151 de Kanto.`);
    }

    if (speciesLower === "mew") {
      hasMew = true;
    }

    if (LEGENDARIES_KANTO.has(speciesLower)) {
      legendaryCount++;
    }

    if (seenSpecies.has(speciesLower)) {
      errors.push(`El Pokémon "${poke.species}" está repetido en el equipo.`);
    }
    seenSpecies.add(speciesLower);

    if (poke.item) {
      const itemLower = poke.item.toLowerCase();
      if (seenItems.has(itemLower)) {
        errors.push(`El objeto "${poke.item}" está repetido en el equipo.`);
      }
      seenItems.add(itemLower);
    }

    if (poke.isMega) {
      errors.push(`"${poke.species}" usa Megaevolución, la cual está prohibida en este torneo.`);
    }
    if (poke.hasZMove) {
      errors.push(`"${poke.species}" incluye un Movimiento Z, los cuales están prohibidos en este torneo.`);
    }
    if (poke.hasDynamax) {
      errors.push(`"${poke.species}" incluye elementos de Dynamax/Gigamax, prohibidos en este torneo.`);
    }
    if (poke.hasTera) {
      errors.push(`"${poke.species}" incluye Teracristalización, prohibida en este torneo.`);
    }
  }

  if (hasMew) {
    errors.push("Mew está prohibido en este torneo.");
  }

  if (legendaryCount > 1) {
    errors.push(`Tu equipo contiene ${legendaryCount} Pokémon legendarios. El reglamento permite máximo 1.`);
  }

  return { valid: errors.length === 0, errors };
}
