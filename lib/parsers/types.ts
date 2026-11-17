/**
 * Shared types for HPC application output parsers.
 *
 * Parsers incrementally parse solver output files and return structured data
 * for real-time monitoring (convergence charts, progress tables, custom metrics).
 */

/** A single data series for convergence/residual plots */
export interface GraphSeries {
  label: string;
  /** Array of [x, y] data points; y values are typically log(residual) */
  data: [number, number][];
}

/** A vertical or horizontal marker line on the graph */
export interface Marking {
  label: string;
  /** [from, to, text] for each marker */
  data: [number, number, string][];
  type?: 'xaxis' | 'yaxis';
}

/** A labelled scalar output value (time estimate, host, etc.) */
export interface CustomOutput {
  label: string;
  value: number | string;
  type: 'Text' | 'Time' | 'Number';
}

/** Custom structured output beyond the graph */
export interface CustomSection {
  message?: {
    text: string;
    type: 'success' | 'info' | 'warning' | 'error';
  };
  /** Key-value scalar outputs displayed in a summary card */
  outputs?: Record<string, CustomOutput>;
  /** Table data for step progress */
  array?: any[];
  /** Column definitions for the array table */
  arrayHeader?: { key: string; name: string; type: string }[];
  /** Generated files for download */
  files?: { name: string; content: string }[];
}

/** Incremental parse state returned with each parser call */
export interface StepState {
  /** Last line index processed; caller passes this back on next call */
  lastLine: number;
  lastIter?: number;
  /** True when the file has reached a terminal state */
  ended?: boolean;
  /** True when parser always re-reads the full file */
  whole?: boolean;
  /** True when the solver reported successful completion */
  terminated?: boolean;
}

/** Full result returned by a post-processor parser */
export interface ParserResult {
  /** Graph series — either an ordered array or a named map */
  graph: GraphSeries[] | Record<string, GraphSeries>;
  markings: Marking[];
  step: StepState;
  custom?: CustomSection;
}

export type ParserCallback = (err: Error | null, result: ParserResult) => void;

/**
 * Post-processor parser signature.
 *
 * @param outputFile  Full text content of the solver output file
 * @param startLine   Line index to resume from (0 for first call)
 * @param startIter   Iteration index to resume from
 * @param filesOrPreData  Extra files map or pre-processor result
 * @param next        Callback(err, result)
 */
export type ParserFn = (
  outputFile: string,
  startLine: number | string,
  startIter: number | string,
  filesOrPreData: any,
  next: ParserCallback,
) => void;

export type PreProcessorCallback = (err: Error | null, result: any) => void;

/**
 * Pre-processor parser signature — runs before job submission.
 *
 * @param files   Map of file name → content (e.g. { inputFile: '...' })
 * @param preProc Accumulated pre-processor state from previous calls
 * @param next    Callback(err, result)
 */
export type PreProcessorFn = (
  files: Record<string, string>,
  preProc: any,
  next: PreProcessorCallback,
) => void;

/** Entry in the parser registry */
export interface ParserEntry {
  /** Which file content to pass as outputFile ('outputFile' | 'historyFile') */
  require?: string;
  post?: ParserFn;
  pre?: PreProcessorFn;
}
