/** Chyba pro uživatele: česká hláška bez vnitřních detailů, volitelně s daty pro klienta. */
export class ApiError extends Error {
  constructor(status, message, data = undefined) {
    super(message);
    this.status = status;
    this.data = data;
  }
}
