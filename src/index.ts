import express, { Request, Response, NextFunction } from "express";
import { MongoClient, ObjectId } from "mongodb";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";
import * as OpenApiValidator from "express-openapi-validator";

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// OpenAPI spec — load once, serve twice:
//   1. GET /openapi.yaml  → raw YAML for tooling / curl
//   2. GET /docs          → Swagger UI in the browser
// ---------------------------------------------------------------------------
const SPEC_PATH = path.join(__dirname, "..", "openapi.yaml");
const apiSpec = YAML.load(SPEC_PATH);

// Serve the raw YAML file
app.get("/openapi.yaml", (_req, res) => {
  res.setHeader("Content-Type", "text/yaml");
  res.sendFile(SPEC_PATH);
});

// Serve Swagger UI at /docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(apiSpec));

// ---------------------------------------------------------------------------
// Request / response validation against the OpenAPI spec.
// Invalid request bodies or path params return a 400 automatically.
// ---------------------------------------------------------------------------
app.use(
  OpenApiValidator.middleware({
    apiSpec: SPEC_PATH,
    validateRequests: true,
    validateResponses: false, // flip to true to catch bugs during development
  })
);

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------
const MONGO_URL =
  process.env.MONGO_URL ?? "mongodb://admin:secret@localhost:27017/?authSource=admin";

const client = new MongoClient(MONGO_URL);

// Using a proper type instead of `any` — good TypeScript practice
interface Cat {
  _id?: ObjectId;
  name: string;
  age: number;
  breed: string;
  color?: string;
  indoor?: boolean;
}

async function start() {
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db("testdb");
  const collection = db.collection<Cat>("cats");

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  app.get("/", (_req, res) => {
    res.json({
      message: "Cat API is running",
      docs: "http://localhost:5000/docs",
      spec: "http://localhost:5000/openapi.yaml",
    });
  });

  // GET /cats — list all cats
  app.get("/cats", async (_req, res) => {
    const cats = await collection.find().toArray();
    res.json(cats);
  });

  // GET /cats/:id — fetch one cat
  app.get("/cats/:id", async (req, res) => {
    const cat = await collection.findOne({ _id: new ObjectId(req.params.id) });
    if (!cat) return res.status(404).json({ message: "Cat not found" });
    res.json(cat);
  });

  // POST /cats — create a cat; MongoDB generates _id
  app.post("/cats", async (req, res) => {
    const result = await collection.insertOne(req.body as Cat);
    res.status(201).json({ ...req.body, _id: result.insertedId });
  });

  // PUT /cats/:id — update (partial update with $set)
  app.put("/cats/:id", async (req, res) => {
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body as Partial<Cat> },
      { returnDocument: "after" }
    );

    if (!result) return res.status(404).json({ message: "Cat not found" });
    res.json(result);
  });

  // DELETE /cats/:id
  app.delete("/cats/:id", async (req, res) => {
    const result = await collection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Cat not found" });
    res.status(204).send();
  });

  // -------------------------------------------------------------------------
  // Error handler — express-openapi-validator throws structured errors;
  // this formats them as JSON instead of HTML.
  // -------------------------------------------------------------------------
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? 500;
    res.status(status).json({
      message: err.message,
      errors: err.errors,
    });
  });

  app.listen(5000, () => {
    console.log("Cat API running on http://localhost:5000");
    console.log("Swagger UI:  http://localhost:5000/docs");
    console.log("Raw spec:    http://localhost:5000/openapi.yaml");
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});