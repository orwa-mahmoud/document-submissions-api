export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  const error: ErrorBody["error"] = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return { error };
}
