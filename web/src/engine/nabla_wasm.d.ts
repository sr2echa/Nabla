/* tslint:disable */
/* eslint-disable */
export class Lab {
  free(): void;
  /**
   * Temperature in pawn units. Zero plays the best move.
   */
  set_temperature(pawns: number): void;
  fen(): string;
  constructor();
  load(fen: string): void;
  push(uci: string): void;
  turn(): string;
  /**
   * The current position's fields and energy. This does not choose a move.
   */
  view(): string;
  /**
   * Legal moves as a JSON array of `{uci, san, from, to}`.
   */
  moves(): string;
  reset(): void;
  /**
   * Choose a move and explain the candidates.
   */
  analyze(): string;
  set_level(level: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_lab_free: (a: number, b: number) => void;
  readonly lab_analyze: (a: number) => [number, number];
  readonly lab_fen: (a: number) => [number, number];
  readonly lab_load: (a: number, b: number, c: number) => [number, number];
  readonly lab_moves: (a: number) => [number, number];
  readonly lab_new: () => number;
  readonly lab_push: (a: number, b: number, c: number) => [number, number];
  readonly lab_reset: (a: number) => void;
  readonly lab_set_level: (a: number, b: number) => void;
  readonly lab_set_temperature: (a: number, b: number) => void;
  readonly lab_turn: (a: number) => [number, number];
  readonly lab_view: (a: number) => [number, number];
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
