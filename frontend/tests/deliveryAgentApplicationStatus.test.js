import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import test from "node:test";
import { createServer } from "vite";

test("delivery application status renders null and populated states with hooks before the null guard", async () => {
  const vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.js", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const { default: ApplicationStatus } = await vite.ssrLoadModule(
      "/src/pages/delivery/DeliveryAgentApplicationStatus.jsx"
    );
    const renderApplication = (application) => renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(ApplicationStatus, { application })
    ));
    const emptyMarkup = renderApplication(null);
    const populatedMarkup = renderApplication({
      verificationStatus: "APPROVED",
      user: { verificationDocuments: [] },
    });

    assert.equal(emptyMarkup, "");
    assert.match(populatedMarkup, /You Are an Approved Delivery Partner/);

    const source = await readFile(new URL("../src/pages/delivery/DeliveryAgentApplicationStatus.jsx", import.meta.url), "utf8");
    assert.ok(source.indexOf("useEffect(() =>") < source.indexOf("if (!application) return null;"));
  } finally {
    await vite.close();
  }
});
