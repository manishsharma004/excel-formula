/** Host errors (spec §10). These are thrown. Spreadsheet errors are values. */

export type HostKind =
  | "parse"
  | "limit"
  | "timeout"
  | "unsupported"
  | "config"
  | "function"
  | "row";

export class HostError extends Error {
  readonly kind: HostKind;

  constructor(kind: HostKind, message: string) {
    super(message);
    this.name = "HostError";
    this.kind = kind;
  }
}

export function host(kind: HostKind, message: string): never {
  throw new HostError(kind, message);
}
