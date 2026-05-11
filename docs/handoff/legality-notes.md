# Legality Notes & Pitfalls

Hard-won knowledge from debugging Discord bot rejections.

## Move Legality

### Scald (TM188)
- **Status:** Legal in SV via DLC TM, but **bot ALM rejects it**
- **Affected:** Pelipper, Toxapex, Milotic (any Water-type that learns it)
- **Cause:** Bot's ALM encounter data doesn't include DLC TMs
- **Fix:** Use **Surf** instead (functionally similar, no burn chance)

### Close Combat on Kingambit
- **Status:** Illegal in SV entirely
- **Fix:** Use **Low Kick** (weight-based Fighting move, still effective)

### Mystical Fire on Sylveon
- **Status:** Was legal in prior gens, removed from Gen 9 movepool
- **Fix:** Use **Shadow Ball** (coverage vs Poison/Steel)

## Species Legality

### Tsareena
- **Problem:** Evolution-only in SV (no wild encounter). ALM's encounter matching fails because there's no wild/raid/static encounter for Tsareena itself — it must evolve from Steenee/Bounsweet
- **Tried:** Multiple ability (Queenly Majesty, Leaf Guard) and ball combinations — all fail
- **Workaround:** .pk9 file route may bypass (needs ALM library). Alternative: gen Bounsweet and evolve manually
- **Priority:** Deprioritized (99) — gen last

### Basculegion
- **Problem:** Hisui-origin Pokémon, only natively available in Legends: Arceus
- **Status:** May or may not work on SV bots (they gen SV-origin Pokémon)
- **If rejected:** Would need PLA bot or manual transfer from PLA save

## Ball Legality
- Most balls work on most Pokémon in SV (wide wild encounter tables)
- **Exception:** Starters and gift Pokémon may be restricted to Poké Ball
- When in doubt, use **Poké Ball** — always legal

## IV/EV Rules

### 0 Atk IV on Special Attackers
- **Why:** Minimizes self-damage from confusion and opponent's Foul Play
- **When:** Any Pokémon with 0 Atk EVs AND no physical moves
- **Showdown format:** `IVs: 0 Atk`

### EV Total
- Must not exceed 510 total, 252 per stat
- Bots will reject if over-allocated

## .pk9 File Legality

### Why .pk9 Files Get Rejected
Unlike Showdown text (which bots auto-legalize via ALM), .pk9 files must be **already legal**. Common issues:

1. **RNG Correlation:** In Gen 9, PID, EC, IVs, Nature, Height, Weight, and Scale are ALL determined by a single Xoroshiro128+ seed. Setting these independently = impossible encounter
2. **Encounter Matching:** MetLocation + MetLevel + Version must correspond to a real encounter table entry in SV's data
3. **Relearn Moves:** Wild encounters expect relearn moves = None (all zeros). Setting relearn moves = current moves is wrong
4. **Ability Number:** Must match the encounter's allowed abilities (1, 2, or H/4)

### Solution: Auto-Legality-Mod (ALM)
- Not available as NuGet package — must build DLL from source
- Repo: https://github.com/Daiivr/AutoLegalityMod
- Handles all RNG/encounter/relearn logic automatically
- PKHeX.Core alone is insufficient for creating legal .pk9 files

### PKHeX.Core ConvertToPKM
`EncounterSlot9.ConvertToPKM(trainer, criteria)` creates valid base PK9s with correct RNG, but:
- Nature/IVs may not match what you want (limited by available seeds)
- Post-modification breaks RNG correlation
- Only useful for creating a legal "template" — need ALM for full customization

## HOME Transfer Rules
- **Carries:** Species, form, moves, ability, EVs, IVs, nature, ball, shiny, OT, gender, level
- **Does NOT carry:** Held items
- **Direction:** One-way into Champions (can't send back)
- **Strategy:** Give Pokémon a Master Ball as held item for max in-game trade value before transfer
