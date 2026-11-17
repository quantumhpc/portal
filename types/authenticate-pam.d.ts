declare module "authenticate-pam" {
  interface PamOptions {
    serviceName?: string;
    remoteHost?: string;
  }
  function authenticate(
    username: string,
    password: string,
    callback: (err?: Error) => void,
    options?: PamOptions
  ): void;
}
