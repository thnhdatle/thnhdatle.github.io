type WorkerEnv = import("../src/worker/env").Env;

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("../src/worker/index");
  }
  interface Env extends WorkerEnv {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
