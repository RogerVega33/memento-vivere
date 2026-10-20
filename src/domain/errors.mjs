/** A user-correctable validation failure, safe to show in the interface. */
export class ValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** A repository failure with an HTTP status safe to expose to the client. */
export class RepositoryError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) { super(message); this.status = status; }
}
