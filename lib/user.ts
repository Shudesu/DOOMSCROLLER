/**
 * Get the current user ID from environment variable
 * In the future, this can be replaced with authentication system
 */
export function getUserId(): string {
  return process.env.USER_ID || 'default';
}
