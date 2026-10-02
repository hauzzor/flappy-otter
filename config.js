/* Flappy Otter - configuration
 *
 * Scores live on the player's own device (browser localStorage). There is no
 * server, no account, no API key and no network request anywhere in this app,
 * so there is nothing to sign up for and nothing that can be tampered with
 * from outside.
 */
window.OtterConfig = {
  /* Names longer than this are trimmed when saving. */
  maxNameLength: 14
};