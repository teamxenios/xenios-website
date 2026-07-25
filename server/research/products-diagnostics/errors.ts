export class Website3ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Website3ValidationError";
  }
}
