import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The conventions, asserted against the document rather than the generated
 * code. That is not a shortcut: the document *is* the contract, and the client,
 * the Zod validators and the MSW handlers are all generated from it, so the
 * generated code cannot drift from it by construction. Asserting there would
 * only re-read what the generator already did.
 *
 * What is asserted here is the set of things a later contributor breaks
 * silently, because nothing else fails when they do. A list that forgets the
 * envelope still generates a client. A path parameter that accepts only an id
 * still generates a client. A 202 that returns nothing still generates a client.
 * These are the four that the console's archetypes and screens are built on.
 */

interface Schema {
  $ref?: string;
  type?: string | string[];
  enum?: readonly string[];
  required?: readonly string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  oneOf?: readonly Schema[];
  description?: string;
}

interface Parameter {
  $ref?: string;
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: Schema;
}

interface Response {
  $ref?: string;
  description?: string;
  content?: Record<string, { schema?: Schema }>;
}

interface Operation {
  operationId?: string;
  tags?: readonly string[];
  parameters?: readonly Parameter[];
  responses?: Record<string, Response>;
}

interface Document {
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, Operation>>;
  components: {
    parameters: Record<string, Parameter>;
    responses: Record<string, Response>;
    schemas: Record<string, Schema>;
  };
}

const documentPath = fileURLToPath(new URL("../../../openapi/sovren.json", import.meta.url));
const adrPath = fileURLToPath(
  new URL("../../../docs/adr/0001-provisional-contract-document.md", import.meta.url),
);

const readDocument = (): Document => JSON.parse(readFileSync(documentPath, "utf8")) as Document;

const document = readDocument();

/** Follow `$ref` to the thing it names, through as many hops as it takes. */
const deref = <T>(node: { $ref?: string } | undefined, doc: Document = document, depth = 0): T => {
  if (!node) throw new Error("expected a schema, found nothing");
  if (!node.$ref) return node as T;
  if (depth > 10) throw new Error(`ref cycle through ${node.$ref}`);
  let current: unknown = doc;
  for (const segment of node.$ref.replace(/^#\//, "").split("/")) {
    current = (current as Record<string, unknown>)[segment];
  }
  return deref<T>(current as { $ref?: string }, doc, depth + 1);
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

interface Declared {
  path: string;
  method: string;
  operation: Operation;
  operationId: string;
  parameters: Parameter[];
}

const operations = (doc: Document = document): Declared[] =>
  Object.entries(doc.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => (METHODS as readonly string[]).includes(method))
      .map(([method, operation]) => {
        const op = operation as Operation;
        if (!op.operationId) throw new Error(`${method.toUpperCase()} ${path} has no operationId`);
        return {
          path,
          method,
          operation: op,
          operationId: op.operationId,
          parameters: (op.parameters ?? []).map((parameter) => deref<Parameter>(parameter, doc)),
        };
      }),
  );

/**
 * The verbs sovren recognises on the end of an operationId. The read trio is
 * List, View and the object itself; everything below starts or stops something.
 */
const VERBS = [
  "List",
  "View",
  "LogStream",
  "Create",
  "Update",
  "Delete",
  "Start",
  "Stop",
  "Reboot",
  "Snapshot",
  "Restore",
  "Resize",
  "Cancel",
  "Test",
] as const;

/**
 * The subset that cannot finish inside a request, and therefore answers 202
 * with a Task. `Test` is deliberately absent: a connection test is a round trip
 * and nothing more.
 */
const LONG_WORK_VERBS = [
  "Create",
  "Update",
  "Delete",
  "Start",
  "Stop",
  "Reboot",
  "Snapshot",
  "Restore",
  "Resize",
  "Cancel",
] as const;

const successResponse = (operation: Operation, doc: Document): Response => {
  const entry = Object.entries(operation.responses ?? {}).find(([status]) =>
    status.startsWith("2"),
  );
  if (!entry) throw new Error("operation declares no successful response");
  return deref<Response>(entry[1], doc);
};

const jsonSchema = (response: Response, doc: Document): Schema => {
  const media = response.content?.["application/json"];
  if (!media) throw new Error(`response "${response.description ?? ""}" is not JSON`);
  return deref<Schema>(media.schema, doc);
};

const isFailureStatus = (status: string): boolean => status === "default" || Number(status) >= 400;

// -- the conventions, as reusable checks ------------------------------------
// Each returns the violations it finds, so a negative control can prove the
// check bites instead of merely passing.

const listEnvelopeViolations = (doc: Document): string[] => {
  const violations: string[] = [];

  for (const { path, operation, operationId } of operations(doc).filter((o) =>
    o.operationId.endsWith("List"),
  )) {
    const schema = jsonSchema(successResponse(operation, doc), doc);
    const label = `${operationId} at ${path}`;

    for (const key of ["items", "nextPage"]) {
      if (!schema.required?.includes(key)) violations.push(`${label}: ${key} is not required`);
    }
    if (schema.properties?.items?.type !== "array") {
      violations.push(`${label}: items is not an array`);
    }
    // The token is opaque, so it is a string. An offset would be a number, and
    // that is the one thing this convention exists to prevent.
    if (JSON.stringify(schema.properties?.nextPage?.type) !== JSON.stringify(["string", "null"])) {
      violations.push(`${label}: nextPage is not a nullable string, so it is not an opaque token`);
    }
  }

  const pageToken = deref<Parameter>(doc.components.parameters.PageToken, doc);
  if (pageToken.schema?.type !== "string") {
    violations.push("PageToken is not a string, so the token is not opaque");
  }
  if (!pageToken.description?.includes("opaque")) {
    violations.push("PageToken does not say it is opaque");
  }
  if (!pageToken.description?.includes("Never an offset")) {
    violations.push("PageToken does not say it is never an offset");
  }
  for (const { operationId, parameters } of operations(doc)) {
    if (parameters.some((p) => p.name === "offset")) {
      violations.push(`${operationId} takes an offset; offsets are not tokens`);
    }
  }

  return violations;
};

const pathParameterViolations = (doc: Document): string[] => {
  const violations: string[] = [];

  for (const { path, method, operationId, parameters } of operations(doc)) {
    const declared = new Set<string>();
    for (const parameter of parameters) {
      if (parameter.in !== "path") continue;
      declared.add(parameter.name ?? "");
      const label = `${operationId} (${method.toUpperCase()} ${path}) ${parameter.name}`;

      if (parameter.required !== true)
        violations.push(`${label}: a path parameter must be required`);
      if (parameter.schema?.type !== "string") {
        violations.push(`${label}: not a plain string, so it is narrower than a name or an id`);
      }
      if (!parameter.description?.includes("name") || !/\bid\b/.test(parameter.description)) {
        violations.push(`${label}: does not say it takes a name or an id`);
      }
    }

    for (const template of path.matchAll(/\{([^}]+)\}/g)) {
      const name = template[1] ?? "";
      if (!declared.has(name)) {
        violations.push(`${operationId} uses {${name}} in the path but never declares it`);
      }
    }
  }

  return violations;
};

const errorViolations = (doc: Document): string[] => {
  const violations: string[] = [];

  for (const { path, method, operation, operationId } of operations(doc)) {
    const label = `${operationId} (${method.toUpperCase()} ${path})`;
    const failures = Object.entries(operation.responses ?? {}).filter(([status]) =>
      isFailureStatus(status),
    );

    if (failures.length === 0) violations.push(`${label}: declares no error response at all`);

    for (const [status, response] of failures) {
      const schema = jsonSchema(deref<Response>(response, doc), doc);
      for (const key of ["code", "requestId"]) {
        if (!schema.required?.includes(key)) {
          violations.push(`${label} ${status}: the error does not require ${key}`);
        }
      }
      const code = deref<Schema>(schema.properties?.code, doc);
      if (!code.enum?.length) {
        violations.push(`${label} ${status}: code is not a closed sovren vocabulary`);
      }
      for (const member of code.enum ?? []) {
        if (!/^[a-z][a-z_]*$/.test(member)) {
          violations.push(`${label} ${status}: "${member}" is not a machine-readable sovren code`);
        }
      }
    }
  }

  return violations;
};

const longWorkViolations = (doc: Document): string[] => {
  const violations: string[] = [];

  for (const { path, method, operation, operationId } of operations(doc)) {
    const label = `${operationId} (${method.toUpperCase()} ${path})`;
    const statuses = Object.keys(operation.responses ?? {});
    const startsLongWork = LONG_WORK_VERBS.some((verb) => operationId.endsWith(verb));

    if (startsLongWork) {
      const accepted = operation.responses?.["202"];
      if (!accepted) {
        violations.push(`${label}: starts long work but never answers 202`);
        continue;
      }
      const schema = deref<Response>(accepted, doc).content?.["application/json"]?.schema;
      if (schema?.$ref !== "#/components/schemas/Task") {
        violations.push(`${label}: answers 202 with something other than a Task`);
      }
    } else if (statuses.includes("202")) {
      violations.push(`${label}: answers 202 but does not start long work`);
    }
  }

  return violations;
};

const namingViolations = (doc: Document): string[] => {
  const violations: string[] = [];

  for (const { operationId, operation } of operations(doc)) {
    if (!VERBS.some((verb) => operationId.endsWith(verb))) {
      violations.push(`${operationId} does not end in a recognised verb`);
    }
    const tag = operation.tags?.[0];
    if (!tag) {
      violations.push(`${operationId} has no tag`);
    } else if (!operationId.startsWith(tag)) {
      violations.push(`${operationId} is not named after its resource ${tag}`);
    }
  }

  return violations;
};

// -- the document declares the surface ---------------------------------------

describe("the contract document", () => {
  it("declares every operation the prototype screens are built against", () => {
    expect(operations().map((o) => o.operationId)).toEqual([
      "NodeList",
      "NodeView",
      "DriveList",
      "DriveView",
      "PeerList",
      "PeerView",
      "VMList",
      "VMCreate",
      "VMView",
      "VMDelete",
      "VMUpdate",
      "DiskList",
      "SnapshotList",
      "TaskList",
      "TaskView",
      "TaskLogStream",
      "TaskCancel",
      "ConnectionList",
      "ConnectionView",
      "ConnectionTest",
    ]);
  });

  it("records where its own handover is described, and that file exists", () => {
    // The description points at the ADR that records the document as
    // provisional. A reference to a file that is not there is worse than none:
    // it reads as though the question has been settled.
    expect(document.info.description).toContain("docs/adr/0001-provisional-contract-document.md");
    expect(existsSync(adrPath)).toBe(true);
  });

  it("gives every resource a detail page can open with the same ID block", () => {
    // R40: every detail page opens with ID, created and updated, so anything on
    // the page can be referenced and audited. Listed literally, so a new
    // resource has to be added here on purpose rather than by omission.
    const resources = [
      "Node",
      "Drive",
      "Peer",
      "VM",
      "Disk",
      "Snapshot",
      "Task",
      "Connection",
    ] as const;

    for (const resource of resources) {
      const schema = document.components.schemas[resource];
      expect(schema, `${resource} is not declared`).toBeDefined();
      for (const field of ["id", "created", "updated"]) {
        expect(schema?.required, `${resource} does not require ${field}`).toContain(field);
        expect(schema?.properties, `${resource} has no ${field}`).toHaveProperty(field);
      }
    }
  });
});

// -- the four conventions ----------------------------------------------------

describe("conventions", () => {
  it("returns the { items, nextPage } envelope from every list, with an opaque token", () => {
    const violations = listEnvelopeViolations(document);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("accepts a name or an id at every path parameter", () => {
    const violations = pathParameterViolations(document);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("carries a sovren code and a requestId on every error response", () => {
    const violations = errorViolations(document);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("answers 202 with a Task wherever long work starts, and nowhere else", () => {
    const violations = longWorkViolations(document);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("names every operation {resource}{Verb}", () => {
    const violations = namingViolations(document);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// -- negative controls -------------------------------------------------------
// A convention test that cannot fail is worse than no test, because it reads as
// evidence. Each of these removes one thing from a copy of the document and
// asserts the check above notices.

describe("the convention checks fail when the convention is broken", () => {
  const without = (mutate: (draft: Document) => void): Document => {
    const draft = structuredClone(document);
    mutate(draft);
    return draft;
  };

  it("catches a list that forgets the envelope", () => {
    const draft = without((d) => {
      const schema = d.components.schemas.PeerPage as Schema;
      schema.required = ["items"];
      delete schema.properties?.nextPage;
    });
    expect(listEnvelopeViolations(draft).length).toBeGreaterThan(0);
  });

  it("catches a page token turned into an offset", () => {
    const draft = without((d) => {
      const schema = d.components.schemas.NodePage as Schema;
      if (schema.properties?.nextPage) schema.properties.nextPage.type = "integer";
    });
    expect(listEnvelopeViolations(draft)).toContain(
      "NodeList at /nodes: nextPage is not a nullable string, so it is not an opaque token",
    );
  });

  it("catches a path parameter that takes only an id", () => {
    const draft = without((d) => {
      const parameter = d.components.parameters.NodeRef as Parameter;
      parameter.schema = { type: "integer" };
    });
    expect(pathParameterViolations(draft).length).toBeGreaterThan(0);
  });

  it("catches an error that drops its requestId", () => {
    const draft = without((d) => {
      const error = d.components.schemas.Error as Schema;
      error.required = ["code", "message"];
    });
    expect(errorViolations(draft).length).toBeGreaterThan(0);
  });

  it("catches a 202 that returns nothing to watch", () => {
    const draft = without((d) => {
      const post = d.paths["/vms"]?.post as Operation;
      const schema = post.responses?.["202"]?.content?.["application/json"]?.schema as Schema;
      schema.$ref = "#/components/schemas/VM";
    });
    expect(longWorkViolations(draft)).toContain(
      "VMCreate (POST /vms): answers 202 with something other than a Task",
    );
  });

  it("catches a read that has quietly started claiming to be long work", () => {
    const draft = without((d) => {
      const get = d.paths["/nodes"]?.get as Operation;
      (get.responses ?? {})["202"] = { description: "invented" };
    });
    expect(longWorkViolations(draft)).toContain(
      "NodeList (GET /nodes): answers 202 but does not start long work",
    );
  });
});

// -- the vocabulary, which the document is the only place it is fixed ---------

describe("the nouns stay distinct", () => {
  it("keeps a physical Drive and a VM's Disk from being confused", () => {
    // R24. Drive is on a Node and has no VM; Disk is on a VM and has no Node.
    // A Drive that grew a vmId, or a Disk that grew a nodeId, is the exact
    // confusion the rename exists to prevent.
    const drive = document.components.schemas.Drive as Schema;
    const disk = document.components.schemas.Disk as Schema;

    expect(drive.properties).toHaveProperty("nodeId");
    expect(drive.properties).not.toHaveProperty("vmId");
    expect(disk.properties).toHaveProperty("vmId");
    expect(disk.properties).not.toHaveProperty("nodeId");

    for (const [name, schema] of Object.entries(document.components.schemas)) {
      const hasNode = schema.properties !== undefined && "nodeId" in schema.properties;
      const hasVm = schema.properties !== undefined && "vmId" in schema.properties;
      expect(hasNode && hasVm, `${name} has both a node and a VM, which is never true`).toBe(false);
    }
  });

  it("keeps Disk and Drive from sharing a page schema", () => {
    const pages = Object.keys(document.components.schemas).filter((name) => name.endsWith("Page"));
    expect(pages).toContain("DiskPage");
    expect(pages).toContain("DrivePage");
    expect(pages).not.toContain("DiskDrivePage");
  });

  it("reuses NetBird's word service for nothing but an Endpoint or a NetworkResource", () => {
    // R26: NetBird calls an endpoint a "service", which collides with the
    // Dokploy Service, so it is renamed. Nothing else may quietly take the word
    // back.
    const permitted = new Set(["Endpoint", "NetworkResource"]);
    for (const name of Object.keys(document.components.schemas)) {
      if (!/service/i.test(name)) continue;
      expect(permitted.has(name), `${name} reuses the collided word`).toBe(true);
    }
  });
});
