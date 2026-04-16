# How CatMongo Works

This document explains the internals of the Cat API — what each piece of code does,
how the parts connect to each other, and why things are structured the way they are.
It is written for someone learning TypeScript, Express, MongoDB, and OpenAPI.

---

## The big picture

When you run `npm run dev`, one TypeScript file — `src/index.ts` — starts up and does
several things in sequence:

1. Creates an Express web server.
2. Loads the OpenAPI spec from `openapi.yaml`.
3. Registers routes that serve Swagger UI and the raw YAML file.
4. Registers a validation middleware that reads the spec and uses it to check every
   incoming request.
5. Connects to MongoDB.
6. Registers the CRUD routes (`/cats`, `/cats/:id`).
7. Starts listening on port 5000.

Everything happens inside a single async function called `start()`. The reason it is
async is that connecting to MongoDB takes time — you have to `await` it before
registering routes that depend on the database.

```
openapi.yaml  ──►  YAML.load()  ──►  in-memory JS object
                                         │
                             ┌───────────┴──────────────┐
                             ▼                          ▼
                      swagger-ui-express          express-openapi-validator
                      (serves /docs)              (validates every request)
                             │                          │
                             └───────────┬──────────────┘
                                         ▼
                                  Express app (port 5000)
                                         │
                                         ▼
                                    MongoDB driver
                                  (collection "cats")
```

---

## The entry point: `src/index.ts`

### Imports

```typescript
import express, { Request, Response, NextFunction } from "express";
import { MongoClient, ObjectId } from "mongodb";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";
import * as OpenApiValidator from "express-openapi-validator";
```

Each import brings in a library:

- **`express`** — the web framework. Handles HTTP: routing, middleware, request/response.
- **`mongodb`** — the official MongoDB driver for Node.js. `MongoClient` is the
  connection; `ObjectId` converts a plain string like `"6627c4e2..."` into the type
  MongoDB actually stores.
- **`swagger-ui-express`** — serves the Swagger UI HTML page as an Express route.
- **`yamljs`** — parses a `.yaml` file into a plain JavaScript object.
- **`path`** — Node.js built-in for building file paths that work on any OS.
- **`express-openapi-validator`** — middleware that reads your OpenAPI spec and
  automatically validates every request against it.

### Creating the Express app

```typescript
const app = express();
app.use(express.json());
```

`express()` creates the app object. Think of it as a list of handlers that runs
top-to-bottom when a request arrives.

`app.use(express.json())` registers the JSON body parser as the first handler. Without
it, `req.body` is always `undefined` — Express does not parse request bodies by default.
This middleware reads the raw bytes of the request body and, if the `Content-Type`
header is `application/json`, parses them into a JavaScript object and attaches it to
`req.body`.

### Loading the OpenAPI spec

```typescript
const SPEC_PATH = path.join(__dirname, "..", "openapi.yaml");
const apiSpec = YAML.load(SPEC_PATH);
```

`__dirname` is a Node.js variable that always contains the directory of the current
file — in this case, `src/`. Joining it with `".."` goes one level up to the project
root, where `openapi.yaml` lives.

`YAML.load()` reads the file and parses it. The result, `apiSpec`, is a plain
JavaScript object — the same structure as if you had written it as JSON. This object
is what gets passed to Swagger UI and to the validator.

---

## How Swagger UI works

```typescript
app.get("/openapi.yaml", (_req, res) => {
  res.setHeader("Content-Type", "text/yaml");
  res.sendFile(SPEC_PATH);
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(apiSpec));
```

### The raw YAML route

`app.get("/openapi.yaml", ...)` is a regular route, just like the cat routes. When
a browser or tool requests `GET /openapi.yaml`, Express runs the handler, which sets
the content type to `text/yaml` and sends the file from disk. Nothing special — it is
just a file served over HTTP.

### Swagger UI

`swaggerUi.serve` and `swaggerUi.setup(apiSpec)` are two separate pieces of middleware
chained together at the `/docs` path.

- `swaggerUi.serve` is an array of static file handlers. Swagger UI is a pre-built
  React application (HTML, CSS, JavaScript files) that ships inside the
  `swagger-ui-express` npm package. This middleware serves those static files.
- `swaggerUi.setup(apiSpec)` generates a tiny JavaScript snippet that points the
  Swagger UI app at your spec object. When your browser loads `/docs`, it receives the
  Swagger UI HTML page, which then reads that snippet, loads the `apiSpec` object, and
  renders the interactive documentation entirely inside the browser.

In other words: the server sends static files and the spec data. The browser does all
the rendering. There is no server-side HTML templating.

When you click "Try it out" in Swagger UI and hit "Execute", the browser makes a real
HTTP request directly to `http://localhost:5000/cats` (or whichever endpoint you chose).
The request goes through the full Express pipeline — including validation — exactly as
if you had used `curl`.

---

## How request validation works

```typescript
app.use(
  OpenApiValidator.middleware({
    apiSpec: SPEC_PATH,
    validateRequests: true,
    validateResponses: false,
  })
);
```

`app.use()` without a path prefix means this middleware runs for **every** request,
on every route.

`express-openapi-validator` reads the spec at startup and builds a set of validators
from the schema definitions in `openapi.yaml`. When a request arrives, it:

1. Matches the request path and method to an operation in the spec (e.g. `POST /cats`
   matches `operationId: createCat`).
2. Checks the request body against the `requestBody` schema for that operation.
3. Checks path parameters (like `{id}`) against their declared schemas.
4. If anything is wrong — a required field is missing, a field has the wrong type, a
   string is too short — it throws an error object with a `status` of `400`.
5. If everything is valid, it calls `next()` and the request continues to your route
   handler.

Because this middleware is registered **before** the route handlers, invalid requests
never even reach the database. This is why sending `{"name": "Nemo"}` to `POST /cats`
gets rejected automatically — the validator sees that `age` and `breed` are required
in the `CatInput` schema and stops the request immediately.

`validateResponses: false` means the validator does not check what the routes send
back. You can set it to `true` during development to catch bugs where your code returns
data that doesn't match the spec.

### The error handler

```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  res.status(status).json({
    message: err.message,
    errors: err.errors,
  });
});
```

In Express, a middleware function with **four parameters** is an error handler. When
any middleware or route calls `next(err)` — or throws an error, as the validator does —
Express skips all normal middleware and calls this handler instead.

The validator attaches `.status` (usually `400`) and `.errors` (an array of what was
wrong) to the error object. This handler formats those into a clean JSON response
instead of the default HTML error page.

This handler must be registered **last**, after all routes, so that it only catches
errors that fall through everything above it.

---

## How MongoDB is connected

```typescript
const MONGO_URL =
  process.env.MONGO_URL ?? "mongodb://admin:secret@localhost:27017/?authSource=admin";

const client = new MongoClient(MONGO_URL);
```

`MongoClient` is created at the top level of the file, outside of `start()`. This
just creates a client object — it does not connect yet.

```typescript
await client.connect();
const db = client.db("testdb");
const collection = db.collection<Cat>("cats");
```

Inside `start()`, `await client.connect()` opens the actual TCP connection to MongoDB.
Once connected, `client.db("testdb")` returns a reference to the `testdb` database
(MongoDB creates it automatically if it does not exist). `db.collection<Cat>("cats")`
returns a reference to the `cats` collection inside that database.

The `<Cat>` type parameter tells TypeScript what shape of document this collection
holds. This is how TypeScript knows that a document from this collection has fields
like `name`, `age`, and `breed` — it uses the `Cat` interface defined above.

The `collection` variable is declared inside `start()` and is available to all route
handlers below it through closure — JavaScript's mechanism for inner functions
accessing variables from their outer scope.

---

## The Cat interface and why it matters

```typescript
interface Cat {
  _id?: ObjectId;
  name: string;
  age: number;
  breed: string;
  color?: string;
  indoor?: boolean;
}
```

This is a TypeScript interface — a compile-time description of the shape of an object.
It does not exist at runtime; it is erased when TypeScript compiles to JavaScript.

The `?` on `_id`, `color`, and `indoor` means those fields are optional. `_id` is
optional because when creating a cat you don't provide it — MongoDB generates it. The
MongoDB driver fills it in on the returned document.

`_id` is typed as `ObjectId`, not `string`. Internally, MongoDB stores IDs as binary
BSON ObjectId values. The driver represents them as `ObjectId` instances. When
serialized to JSON (via `res.json()`), they are automatically converted to their
24-character hex string representation.

---

## How the CRUD routes work

### GET /cats — list all cats

```typescript
app.get("/cats", async (_req, res) => {
  const cats = await collection.find().toArray();
  res.json(cats);
});
```

`collection.find()` with no arguments means "find all documents". It returns a
cursor — a lazy stream that has not fetched anything yet. `.toArray()` drains the
cursor and returns all documents as a JavaScript array. `res.json()` serializes that
array to JSON and sends it with a `200` status and the `Content-Type: application/json`
header.

### GET /cats/:id — fetch one cat

```typescript
app.get("/cats/:id", async (req, res) => {
  const cat = await collection.findOne({ _id: new ObjectId(req.params.id) });
  if (!cat) return res.status(404).json({ message: "Cat not found" });
  res.json(cat);
});
```

`:id` in the route path is a named parameter. Express puts its value in
`req.params.id`.

`new ObjectId(req.params.id)` converts the plain string from the URL into an
`ObjectId` instance. This is necessary because MongoDB stores `_id` as a BSON
ObjectId, not as a string. Searching with a plain string would never match.

`findOne()` returns either the document or `null`. The `if (!cat)` check handles the
`null` case and returns a 404 response.

### POST /cats — create a cat

```typescript
app.post("/cats", async (req, res) => {
  const result = await collection.insertOne(req.body as Cat);
  res.status(201).json({ ...req.body, _id: result.insertedId });
});
```

By the time this handler runs, `req.body` has already been validated by
`express-openapi-validator` against the `CatInput` schema. If it was invalid, the
request never got here.

`insertOne()` inserts the document and returns a result object containing
`insertedId` — the `ObjectId` that MongoDB assigned. The response spreads the original
`req.body` and adds the generated `_id`, so the caller gets back the full document
including its new ID.

`res.status(201)` sets the HTTP status to 201 Created, which is the correct code for
a successful resource creation (not 200).

### PUT /cats/:id — update a cat

```typescript
const result = await collection.findOneAndUpdate(
  { _id: new ObjectId(req.params.id) },
  { $set: req.body as Partial<Cat> },
  { returnDocument: "after" }
);

if (!result) return res.status(404).json({ message: "Cat not found" });
res.json(result);
```

`findOneAndUpdate()` finds a document, modifies it, and returns either the old or new
version in a single atomic operation.

`{ $set: req.body }` is a MongoDB update operator. `$set` only changes the fields you
provide — it does not replace the whole document. This is what makes partial updates
work: if you only send `{"age": 4}`, only the `age` field changes; everything else
stays the same. Without `$set`, you would be replacing the entire document with just
`{"age": 4}` and losing all other fields.

`{ returnDocument: "after" }` tells MongoDB to return the document as it looks
**after** the update, not before. Without this option you would get back the old
values.

`Partial<Cat>` is a TypeScript utility type that makes all fields of `Cat` optional —
appropriate here because a partial update is valid.

### DELETE /cats/:id

```typescript
const result = await collection.deleteOne({
  _id: new ObjectId(req.params.id),
});
if (result.deletedCount === 0)
  return res.status(404).json({ message: "Cat not found" });
res.status(204).send();
```

`deleteOne()` deletes at most one document and returns an object with `deletedCount`.
If `deletedCount` is `0`, no document matched — meaning the ID did not exist — so a
404 is returned.

`res.status(204).send()` sends a "204 No Content" response. 204 is the standard
status for a successful delete — it explicitly means "it worked and there is nothing to
return".

---

## How the OpenAPI spec connects to everything

`openapi.yaml` is the source of truth that three different systems read:

| Consumer | What it uses the spec for |
|---|---|
| `swagger-ui-express` | Renders the interactive docs UI in the browser |
| `express-openapi-validator` | Validates incoming requests at runtime |
| You (and your team) | Understand what the API accepts and returns |

### The two schemas: Cat vs CatInput

The spec defines two schemas in `components/schemas`:

**`CatInput`** — what a client sends when creating or updating a cat. It does not
include `_id`, because the client never provides one; MongoDB generates it.

**`Cat`** — what the server returns. It includes `_id` as a required field, because
every stored cat has one.

This split reflects a real-world pattern: the shape of data going *in* to an API is
different from the shape coming *out*. If you only had one schema that required `_id`,
you would be forced to send a fake ID when creating a cat, which makes no sense.

### `$ref` — reusing schemas

Instead of copy-pasting the schema in every endpoint, the spec uses references:

```yaml
schema:
  $ref: "#/components/schemas/Cat"
```

`$ref` is a JSON Pointer that says "go to `components → schemas → Cat` in this same
document and use that definition here". Both the validator and Swagger UI resolve these
references automatically. This means you only define `Cat` once, and all endpoints
that return a cat automatically pick up any changes you make to it.

### Path parameter validation

```yaml
/cats/{id}:
  parameters:
    - name: id
      in: path
      required: true
      schema:
        type: string
        pattern: "^[a-f0-9]{24}$"
```

The `pattern` field is a regular expression. The validator checks every `{id}` in the
URL against this pattern before the request reaches the route handler. If you send a
request to `/cats/not-a-valid-id`, you get a 400 response immediately — before
`new ObjectId(...)` even runs. Without this, a malformed ID would cause the MongoDB
driver to throw an unhandled exception.

---

## The startup sequence, step by step

When you run `npm run dev`, here is what happens in order:

1. `ts-node-dev` reads `src/index.ts` and compiles it on the fly to JavaScript in
   memory. No `.js` files are written to disk.

2. The top-level code runs: `express()` creates the app, `YAML.load()` reads and
   parses `openapi.yaml`, the `/openapi.yaml` and `/docs` routes are registered, and
   the validator middleware is registered.

3. `start()` is called. Because it is `async`, it returns a Promise. The `.catch()`
   at the bottom handles any error (like MongoDB being unreachable) by printing it and
   exiting with a non-zero code.

4. Inside `start()`, `await client.connect()` pauses execution until the TCP
   connection to MongoDB is established and authentication is confirmed.

5. `client.db("testdb")` and `db.collection<Cat>("cats")` return lightweight
   reference objects — no network calls happen here.

6. The route handlers for `/`, `/cats`, and `/cats/:id` are registered against the app.

7. `app.listen(5000, ...)` starts the HTTP server. The callback fires once the port is
   bound, and the three startup log lines are printed.

From this point on, the process sits and waits. Every time an HTTP request arrives on
port 5000, Express wakes up, runs it through the middleware chain, and the route
handler does its work.

---

## What happens when a request arrives

Taking `POST /cats` with body `{"name":"Luna","age":2,"breed":"Maine Coon"}` as an
example, here is the full journey:

```
Browser / curl
     │  POST /cats  {"name":"Luna","age":2,"breed":"Maine Coon"}
     ▼
Express receives the TCP data on port 5000
     │
     ▼
express.json() middleware
  Reads the raw body bytes.
  Sees Content-Type: application/json.
  Parses the JSON string into a JS object.
  Attaches it to req.body.
     │
     ▼
express-openapi-validator middleware
  Matches POST /cats to operationId: createCat.
  Checks req.body against the CatInput schema.
  name: "Luna"      ✓ string, minLength 1
  age: 2            ✓ integer, minimum 0
  breed: "Maine Coon" ✓ string, minLength 1
  All required fields present. Validation passes. Calls next().
     │
     ▼
app.post("/cats") route handler
  collection.insertOne(req.body)
  MongoDB assigns _id: ObjectId("6627c4e2...")
  res.status(201).json({...req.body, _id: result.insertedId})
     │
     ▼
Express sends HTTP 201 response
  Content-Type: application/json
  {"name":"Luna","age":2,"breed":"Maine Coon","_id":"6627c4e2..."}
     │
     ▼
Browser / curl receives the response
```

If the body had been `{"name":"Nemo"}` (missing `age` and `breed`), the validator
would have thrown at step 3. Express would have called the error handler, which would
have sent a `400` response. The route handler and the database would never have been
touched.

