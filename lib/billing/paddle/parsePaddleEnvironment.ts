import type { PaddleEnvironment } from "./types";

export function parsePaddleEnvironment(
  value: string | null | undefined
): PaddleEnvironment | null {
  if (value === "sandbox" || value === "production") {
    return value;
  }
  return null;
}
