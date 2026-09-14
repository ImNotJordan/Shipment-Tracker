export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(input: {
  next: string;
  confirm: string;
  email?: string;
}) {
  if (input.next.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (input.confirm !== input.next) {
    return "Those passwords do not match.";
  }
  if (input.email && input.next.trim().toLowerCase() === input.email.trim().toLowerCase()) {
    return "Password cannot be your email address.";
  }
  return null;
}

export function boardDest(nextPath: string, fallback: string) {
  if (
    nextPath.startsWith("/admin") ||
    nextPath.startsWith("/tracker") ||
    nextPath.startsWith("/track/")
  ) {
    return nextPath;
  }
  return fallback || "/login";
}
