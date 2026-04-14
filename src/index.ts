import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
app.use(express.json());

const MONGO_URL =
  "mongodb://admin:secret@localhost:27017/?authSource=admin";

const client = new MongoClient(MONGO_URL);

let collection: any;

async function start() {
  await client.connect();

  const db = client.db("testdb");
  collection = db.collection("cats");
        
  app.get("/", (_req, res) => {
    res.send("Cat API running");
  });

  app.get("/cats", async (_req, res) => {
    const cats = await collection.find().toArray();
    res.json(cats);
  });

  app.get("/cats/:id", async (req, res) => {
    const cat = await collection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!cat) return res.status(404).send();
    res.json(cat);
  });

  app.post("/cats", async (req, res) => {
    const result = await collection.insertOne(req.body);
    res.status(201).json({ ...req.body, _id: result.insertedId });
  });

  app.put("/cats/:id", async (req, res) => {
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body },
      { returnDocument: "after" }
    );

    if (!result.value) return res.status(404).send();
    res.json(result.value);
  });

  app.delete("/cats/:id", async (req, res) => {
    const result = await collection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (result.deletedCount === 0) return res.status(404).send();
    res.status(204).send();
  });

  app.listen(5000, () => {
    console.log("running on http://localhost:5000");
  });
}

start();
