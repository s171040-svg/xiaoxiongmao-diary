export function isQuietHours(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 22 || hour < 6;
}
