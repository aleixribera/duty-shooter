/** Units used in the stats file. Distances are metres, times seconds. */
export type Unit =
  | 'm/s'
  | 'm/s²'
  | 'm'
  | 's'
  | '1/s'
  | 'rpm'
  | 'HP'
  | 'HP/s'
  | 'deg'
  | 'deg/count'
  | 'rounds'
  | 'multiplier';

/** Where a measured number came from. */
export interface Source {
  /** Publisher or page name, e.g. "TrueGameData via DBLTap". */
  readonly name: string;
  readonly url: string;
  /** The date the value was read from the source, YYYY-MM-DD. */
  readonly collected: string;
}

/** A value published by a cited source. */
export interface Sourced {
  readonly kind: 'sourced';
  readonly source: Source;
  /** Allowed absolute deviation, in the stat's unit, when a test checks the simulation against this value. */
  readonly tolerance: number;
  readonly note?: string;
}

/** A value with no public measurement, and how it was estimated instead. */
export interface Estimated {
  readonly kind: 'estimated';
  /** How the value was estimated, including any lineage sources it leans on. */
  readonly method: string;
  /** The date the estimate was made, YYYY-MM-DD. */
  readonly collected: string;
  /** Allowed absolute deviation in the stat's unit, when the research suggested one. */
  readonly tolerance?: number;
}

export type Provenance = Sourced | Estimated;

/** One number in the stats file, always with its provenance. */
export interface Stat<U extends Unit = Unit> {
  readonly value: number;
  readonly unit: U;
  readonly provenance: Provenance;
}
