# Showdown Format Reference for Discord Bots

## Template

```
Species-Form (Gender) @ Item
Ball: [Ball] Ball
Ability: [Ability]
Level: 50
Tera Type: [Type]
[Nature] Nature
EVs: [non-zero stats separated by " / "]
IVs: [non-31 stats separated by " / "]
- Move 1
- Move 2
- Move 3
- Move 4
```

## Field Rules

| Field | Required | Notes |
|-------|----------|-------|
| Species | Yes | Use `-Form` suffix for forms (e.g., `Rotom-Heat`, `Basculegion-Male`) |
| Item | Yes | `@ Item Name` on the species line |
| Ball | No | Omit for Poké Ball. Format: `Ball: Fast Ball` (not `Pokeball:`) |
| Ability | Yes | Exact name |
| Level | No | Omit for level 100 |
| Tera Type | Yes | `Tera Type: Fire` — always include for competitive |
| Nature | Yes | `Adamant Nature` (word "Nature" required) |
| EVs | No | Only list non-zero. Format: `EVs: 252 HP / 4 SpA / 252 Spe` |
| IVs | No | Only list non-31. Format: `IVs: 0 Atk` |
| Moves | Yes | Prefix each with `- ` |

## Lines to NEVER Include

These cause bot parse failures:

```
OT: Eric          ← BREAKS
TID: 12345        ← BREAKS
SID: 54321        ← BREAKS
Language: English  ← BREAKS
Shiny: No         ← Just omit entirely
```

## Batch Format ($bt)

- `$bt` on the FIRST line only (not repeated)
- `---` separator between each Pokémon (own line)
- Max 4 Pokémon per batch (Miraidon bot limit)

```
$bt
Garchomp @ Master Ball
Ball: Level Ball
Ability: Rough Skin
Level: 50
Tera Type: Steel
Jolly Nature
EVs: 252 Atk / 4 SpD / 252 Spe
- Earthquake
- Rock Slide
- Swords Dance
- Protect
---
Toxapex @ Master Ball
Ball: Lure Ball
...
```

## Single Format ($trade)

```
$trade
Garchomp @ Master Ball
Ball: Level Ball
...
```

## Stat Abbreviations

| Full Name | Abbreviation |
|-----------|-------------|
| HP | HP |
| Attack | Atk |
| Defense | Def |
| Special Attack | SpA |
| Special Defense | SpD |
| Speed | Spe |
