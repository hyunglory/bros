import assert from "node:assert/strict";
import test from "node:test";

import { apiCommonSchemas } from "../../apps/api/dist/index.js";
import { validateRequest } from "../../packages/contracts/dist/http.js";
import { EnvSecretProvider, requireSecret } from "../../packages/core/dist/security/index.js";

test("built API, contract, and secret packages compose through public boundaries", async () => {
  const request = validateRequest(
    apiCommonSchemas.publicIdParams,
    { publicId: "01890f47-0c4d-7abc-8def-1234567890ab" },
    "integration-request",
  );
  const provider = new EnvSecretProvider({
    BROS_SECRET_PROVIDER_SEARCH_API_KEY: "integration-only-value",
  });

  assert.equal(request.ok, true);
  const secret = await requireSecret(provider, "provider.search.apiKey");
  assert.equal(secret === "integration-only-value", true);
});
