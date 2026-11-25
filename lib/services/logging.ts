import "server-only";

type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

/**
 * Safe fields from an unknown error. Plaid SDK errors are Axios errors whose
 * `config` holds the Plaid secret and the request body (the access token),
 * so a raw error object must never be logged.
 */
export function errorFields(err: unknown): LogFields {
  if (typeof err !== "object" || err === null) return { errorMessage: String(err) };

  const e = err as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    response?: { status?: unknown; data?: { error_code?: unknown; error_type?: unknown; request_id?: unknown } };
  };
  const str = (value: unknown) => (typeof value === "string" ? value : undefined);
  const status = e.response?.status;
  const data = e.response?.data;

  return {
    errorName: str(e.name),
    errorMessage: str(e.message),
    errorCode: typeof e.code === "number" ? e.code : str(e.code),
    httpStatus: typeof status === "number" ? status : undefined,
    plaidErrorCode: str(data?.error_code),
    plaidErrorType: str(data?.error_type),
    plaidRequestId: str(data?.request_id),
  };
}

function write(level: "info" | "warn" | "error", entry: LogFields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...entry });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(scope: string, message: string, fields: LogFields = {}): void {
  write("info", { scope, message, ...fields });
}

export function logWarn(scope: string, message: string, fields: LogFields = {}): void {
  write("warn", { scope, message, ...fields });
}

export function logError(scope: string, err: unknown, fields: LogFields = {}): void {
  write("error", { scope, ...fields, ...errorFields(err) });
}
