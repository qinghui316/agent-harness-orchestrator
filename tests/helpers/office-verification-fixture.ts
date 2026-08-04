import { join } from "node:path";

const OFFICE_VERIFICATION_FIXTURE_ROOT = join("tests", "fixtures", "office-verification");

export function officeVerificationFixturePath(...segments: string[]): string {
  return join(OFFICE_VERIFICATION_FIXTURE_ROOT, ...segments);
}
