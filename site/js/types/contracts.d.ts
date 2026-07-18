/**
 * Shared browser/runtime contracts.  These deliberately model the data that
 * crosses module boundaries; storage-specific types remain distinct from the
 * flat view models consumed by UI code.
 */

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type EvSystem = 'classic' | 'champions';
export type BuildKind = 'library' | 'instance';
export type RouteSection = 'boxes' | 'inventory' | 'builds' | 'teams' | 'settings';
export type FormMetadataKey =
  | 'gender'
  | 'gigantamax'
  | 'alpha'
  | 'ability'
  | 'cream'
  | 'sweet';

export type StatSpread = Partial<Record<StatKey, number | '' | null>>;
export type IvSpread = StatSpread;
export type NumericStatSpread = Record<StatKey, number>;
export type AbilitySlots = Partial<Record<'0' | '1' | 'H' | 'S', string>>;
export interface StructuredEvs {
  classic?: StatSpread;
  champions?: StatSpread;
  classic_ivs?: IvSpread;
}

export interface DetailState {
  open: boolean;
  layout: 'panel' | 'overlay';
}

export interface AppState {
  query: {
    byRoute: Record<RouteSection, BrowserQuery>;
  };
  selection: {
    ids: string[];
  };
  detail: DetailState;
}

export interface EntryDecorations {
  status: BuildStatus;
  transferred: boolean;
  compatibleGames: string[];
  flags: Array<{ key: string; variant: string; label: string }>;
  badgeEntry: {
    slug: string;
    inChampions: boolean;
    compatibleGames: string[];
    transferredToChampions: boolean;
    eventOrigin: boolean;
    fromGo: boolean;
    language: string | null;
    shiny: boolean;
    genned: boolean;
    gigantamax: boolean;
    alpha: boolean;
  };
  dotOptions: EntryDecorations['badgeEntry'] & { games: string[] };
}

export interface BrowserEntry extends BuildState {
  _kind: 'instance' | 'build';
  _key: string;
  num: string | number;
  name: string;
  slug: string;
  types: string[];
  sprite: string;
  owned: boolean;
  compatibleGames: string[];
  transferredToChampions: boolean;
  builds: BuildState[];
  primary: BuildState | null;
  location: string;
  nature: string;
  ability: string;
  item: string;
  ball: string;
  searchText: string;
  source?: string | null;
  boxId?: number;
  slotIdx?: number;
  shiny?: boolean;
  genned?: boolean;
  gigantamax?: boolean;
  alpha?: boolean;
  eventOrigin?: boolean;
  fromGo?: boolean;
  evGuesstimate?: boolean;
  inChampions?: boolean;
  status?: BuildStatus;
  decorations?: EntryDecorations;
  [key: string]: unknown;
}

export interface BrowserToolbarModel {
  route: RouteSection;
  query: BrowserQuery;
  showModeToggle: boolean;
  showGames: boolean;
  showType: boolean;
  showGeneration: boolean;
  showTransferred: boolean;
  showOwnedOnly: boolean;
  showFlags?: boolean;
  showSource?: boolean;
  collapseSecondary?: boolean;
  summaryText: string;
  statItems: string[];
}

export interface BrowserEmptyState {
  title: string;
  message: string;
  action: {
    kind: string;
    label: string;
  };
}

export interface BrowserSelection {
  route: RouteSection;
  query: BrowserQuery;
  allEntries: BrowserEntry[];
  filteredEntries: BrowserEntry[];
  visibleEntries: BrowserEntry[];
  summaryText: string;
  quickStats: string[];
  emptyState: BrowserEmptyState | null;
  toolbarModel: BrowserToolbarModel;
}

export interface BuildStatus {
  hasNature: boolean;
  hasAbility: boolean;
  moveCount: number;
  hasAnyMoves: boolean;
  profileState: 'complete' | 'partial' | 'empty';
  borderState: 'complete' | 'partial' | null;
  isComplete: boolean;
  isPartial: boolean;
  evTotals: Record<EvSystem, number>;
  readySystems: EvSystem[];
  fullTrainedSystems: EvSystem[];
  targetReady: boolean;
  owned: boolean;
  transferredToChampions: boolean;
  battleReady: boolean;
  badgeKey: string;
  badgeLabel: string;
}

export interface GameCatalogEntry {
  key: string;
  shortLabel: string;
  badgeLabel: string;
  filterLabel: string;
  title: string;
}

export interface BuildState {
  id?: string;
  kind?: BuildKind;
  species?: string;
  slug?: string;
  form?: string;
  level?: number | null;
  nature?: string | null;
  ability?: string | null;
  item?: string | null;
  tera_type?: string | null;
  ev_system?: EvSystem | null;
  evs?: StructuredEvs | null;
  ivs?: IvSpread | null;
  moves?: string[];
  egg_moves?: string[];
  notes?: string;
  source_url?: string;
  source?: string | null;
  ball?: string | null;
  nickname?: string | null;
  ot?: string | null;
  shiny?: boolean;
  gender?: string | null;
  gigantamax?: boolean;
  alpha?: boolean;
  language?: string | null;
  origin_game?: string | null;
  event_origin?: boolean;
  genned?: boolean;
  transferred_to_champions?: boolean;
  from_go?: boolean;
  ev_guesstimate?: boolean;
  owned?: boolean;
  cream?: string | null;
  sweet?: string | null;
}

export interface BuildInput extends BuildState {}

export interface LibraryBuild extends BuildState {
  id: string;
  kind: 'library';
}

export interface ExportMember extends Omit<BuildState, 'evs' | 'ivs'> {
  evs: StatSpread;
  ivs: IvSpread | null;
}

export interface ParsedShowdownSet {
  species: string;
  item: string;
  ability: string;
  nature: string;
  evs: StatSpread;
  ivs: IvSpread;
  moves: string[];
  teraType: string;
  level: number;
  ball: string;
  nickname: string;
  gender: string;
  shiny: boolean;
  gigantamax: boolean;
  unparsedLines: string[];
}

export interface StoredBuild {
  id?: string;
  slug?: string;
  kind?: BuildKind;
  build?: BuildState;
  egg_moves?: string[];
  notes?: string;
  source_url?: string;
  source?: string | null;
}

export interface SlotStorage {
  build?: BuildState;
  identity?: BuildState;
  target_build_id?: string | null;
}

export interface SlotView {
  species_id?: string | number;
  target_build_id: string | null;
  state: BuildState;
}

export interface InstanceModel extends SlotView {
  species_id: string | number;
  box: number;
  slot: number;
  species_slug: string;
  location: {
    kind: 'slot';
    box_id: number;
    box_name: string;
    slot: number;
  };
}

export interface InventoryBox {
  id?: number;
  name?: string | null;
  slots: Array<SlotStorage | null>;
}

export interface InventoryBoxView extends Omit<InventoryBox, 'slots'> {
  slots: Array<SlotView | null>;
}

export interface Inventory {
  boxes: InventoryBox[];
  box_count?: number;
  slots_per_box?: number;
  columns?: number;
  rows?: number;
}

export interface PokedexEntry {
  id?: number;
  num: number;
  slug: string;
  name: string;
  baseSpecies?: string | null;
  forme?: string | null;
  gender?: string | null;
  types?: string[];
  abilities?: AbilitySlots;
  baseStats?: StatSpread;
  eggGroups?: string[];
  eggMoves?: string[];
  evos?: string[];
  prevo?: string | null;
  isNonstandard?: string;
  otherFormes?: string[] | null;
  formeOrder?: string[] | null;
  sprite?: string;
  artwork?: string;
  gen?: number;
  generation?: number;
  region?: string;
  [key: `is${string}`]: boolean | undefined;
}

export interface ReferenceItem {
  slug: string;
  name: string;
  type?: string;
  category?: string;
  basePower?: number;
  plus?: string | null;
  minus?: string | null;
  nameLower?: string;
  sources?: string[];
  isEggMove?: boolean;
}

export interface RawReferenceItem {
  num?: number;
  name: string;
  type?: string;
  category?: string;
  basePower?: number;
  plus?: string;
  minus?: string;
  isNonstandard?: string | boolean;
}

export type ReferenceDataMap = Record<string, RawReferenceItem>;

export interface LearnsetEntry {
  learnset?: Record<string, string[]>;
}

export type LearnsetsData = Record<string, LearnsetEntry>;

export interface LearnsetMove extends ReferenceItem {
  sources: string[];
  isEggMove: boolean;
}

export interface FactorySet {
  name?: string;
  label?: string;
  weight?: number;
  species?: string | string[];
  level?: number;
  nature?: string | string[];
  ability?: string | string[];
  item?: string | string[];
  teraType?: string | string[];
  moves?: Array<string | string[]>;
  evs?: StatSpread;
  ivs?: IvSpread;
}

export interface FactorySetEntry {
  sets?: FactorySet[];
}

export type FactorySetsData = Record<string, FactorySetEntry>;

export interface TeamMember extends BuildState {
  slot?: number | null;
  build_id?: string | null;
  linked_build?: LibraryBuild | null;
}

export interface TeamMemberInput extends Omit<TeamMember, 'evs'> {
  evs?: StructuredEvs | StatSpread | null;
}

export interface EntityChange {
  kind: string;
  ids?: string[];
  boxes?: number[];
  slots?: Array<{ boxId: number; slotIdx: number }>;
}

export interface Team {
  id?: string;
  source?: string;
  name?: string;
  creator?: string;
  archetype?: string;
  ev_system?: EvSystem;
  team_id?: string;
  notes?: string;
  cloned_from?: string | null;
  mega?: string;
  members?: TeamMember[];
}

export interface BrowserQuery {
  search: string;
  games: string[];
  flags: string[];
  type: string;
  generation: string;
  transferred: string;
  source: string;
  ownedOnly: boolean;
  mode: 'grid' | 'table' | 'card';
  sortKey: string;
  sortAsc: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface FormControl {
  key: FormMetadataKey;
  type: 'select' | 'toggle';
  options: string[];
  labels?: string[];
}

export interface FormMetadataDefinition {
  normalize(value: InputValue): string | boolean;
  tooltip(value: InputValue, slug?: string): string | null;
  sprite?(value: InputValue, slug: string): string[] | null;
  placement?(slug: string): Omit<FormControl, 'key'> | null;
  lock?(
    slug: string,
    context?: { speciesGender?: string | null }
  ): { value: string; display: string; reason: string } | null;
}

export interface PresetTarget {
  pid?: string | null;
  species?: string | null;
  speciesKey?: string | null;
  requires?: Partial<Record<FormMetadataKey, InputValue>>;
  defaults?: Partial<Record<FormMetadataKey, InputValue>>;
  gmax?: boolean;
  gender?: string;
}

export interface PresetLayout {
  name: string;
  boxes: Array<{
    title: string;
    pokemon: Array<string | PresetTarget | null>;
  }>;
}

export type PresetData = Record<string, PresetLayout>;

export interface ActivePreset {
  gameSet: string;
  layoutId: string;
  name: string;
  boxes: Array<{
    title: string;
    pokemon: PresetTarget[];
  }>;
}

export interface SpeciesQueriesContext {
  pokedexEntries: PokedexEntry[];
  pokedexByNum: Map<number, PokedexEntry>;
  pokedexBySlug: Map<string, PokedexEntry>;
  pokedexByAlias: Map<string, string>;
  championsFilter: { ids: Set<number>; slugs: Set<string> };
  svFilter: Set<string>;
  legendsArceusFilter: Set<string>;
  legendsZAFilter: Set<string>;
  slotsBySpecies: Map<string | number, Array<{ box: number; slot: number }>>;
  spriteBase: string;
  SpeciesResolver: {
    buildSearchIndex(entries: PokedexEntry[]): SpeciesSearchEntry[];
    normalizeHyphenSlug(value: InputValue): string;
    getSpriteCandidates(input: SpeciesInput | null | undefined, ctx: SpeciesResolverContext): string[];
    resolve(input: SpeciesInput | null | undefined, ctx: SpeciesResolverContext): SpeciesResolution;
    search(query: string, ctx: SpeciesResolverContext): PokedexEntry[];
    normalizeCollapsedSlug(value: InputValue): string;
  };
  searchIndex?: SpeciesSearchEntry[];
}

export type SpeciesInput = string | number | {
  slug?: string;
  species?: string;
  name?: string;
  id?: string | number;
  num?: number;
};

export interface SpeciesSearchEntry {
  entry: PokedexEntry;
  aliases: string[];
}

export interface SpeciesResolverContext {
  entries?: PokedexEntry[];
  entryByNum?: Map<number, PokedexEntry>;
  entryBySlug?: Map<string, PokedexEntry>;
  aliasToSlug?: Map<string, string>;
  searchIndex?: SpeciesSearchEntry[];
}

export interface SpeciesResolution {
  entry: PokedexEntry | null;
  baseEntry: PokedexEntry | null;
  matchedDirect: boolean;
  slug: string;
  normalizedSlug: string;
  collapsedSlug: string;
  displayName: string;
  spriteCandidates: string[];
}

/**
 * A normalized record used at module boundaries before a mapper specializes it
 * into a build, slot, team member, or reference entry.  The optional fields are
 * the union of fields that the application persists, not an open-ended bag.
 */
export interface RuntimeRecord extends BuildState {
  num?: number;
  name?: string;
  baseSpecies?: string;
  forme?: string;
  baseStats?: StatSpread;
  types?: string[];
  abilities?: AbilitySlots;
  eggGroups?: string[];
  eggMoves?: string[];
  build?: BuildState;
  identity?: BuildState;
  target_build_id?: string | null;
  box?: number;
  slot?: number | null;
  box_id?: number;
  box_name?: string;
  species_id?: string | number;
  species_slug?: string;
  location?: { kind: 'slot'; box_id: number; box_name: string; slot: number };
  build_id?: string | null;
  linked_build?: LibraryBuild | null;
  members?: TeamMember[];
  boxes?: InventoryBox[];
  slots?: Array<SlotStorage | null>;
  operations?: RuntimeRecord[];
  games?: string[];
  flags?: string[];
  search?: string;
  type?: string;
  generation?: string;
  transferred?: string;
  ownedOnly?: boolean;
  mode?: 'grid' | 'table' | 'card';
  sortKey?: string;
  sortAsc?: boolean;
  title?: string;
  label?: string;
  value?: string | number | boolean | null;
  code?: string;
  category?: string;
  basePower?: number;
  plus?: string;
  minus?: string;
  visibleIf?: string;
  options?: string[];
  labels?: string[];
  reason?: string;
  display?: string;
  status?: BuildStatus;
  statusOptions?: { owned?: boolean; transferredToChampions?: boolean; battleReady?: boolean };
  inChampions?: boolean;
  compatibleGames?: string[];
  transferredToChampions?: boolean;
  eventOrigin?: boolean;
  fromGo?: boolean;
  decorations?: { status?: { isComplete?: boolean; isPartial?: boolean }; transferred?: boolean };
  transferredToChampions?: boolean;
}

export type InputValue = string | number | boolean | object | null | undefined;

export interface ApiClient {
  getJson<T>(url: string): Promise<T>;
  post<T>(url: string, body: object): Promise<T>;
  put<T>(url: string, body: object): Promise<T>;
  delete<T>(url: string): Promise<T>;
  getAuthInfo(): Promise<{ userId?: string; userDetails?: string; identityProvider?: string } | null>;
  isHosted(): boolean;
}
