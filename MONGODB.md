
# MONGOSH (MongoDB Shell) — QUICK USAGE GUIDE

this is primarily for me and those who want to be up to speed with basic commands in mongodb

## 1. Install

```bash
sudo apt update
sudo apt install -y mongodb-mongosh
```

Verify:

```bash
mongosh --version
```

---

## 2. Connect to MongoDB

### Local default (no auth)

```bash
mongosh
```

### With host + port

```bash
mongosh "mongodb://localhost:27017"
```

### Docker MongoDB (common case)

If MongoDB runs in Docker with:

* port: 27017
* user: admin
* password: secret

```bash
mongosh "mongodb://admin:secret@localhost:27017"
```

If authentication database is required:

```bash
mongosh "mongodb://admin:secret@localhost:27017/?authSource=admin"
```

---

## 3. Core Mental Model

MongoDB structure:

```
Database
  └── Collection (like a table)
        └── Document (like a row, JSON object)
```

No strict schema by default.

---

## 4. Basic Navigation

### Show all databases

```javascript
show dbs
```

### Select database

```javascript
use myDatabase
```

### Show current database

```javascript
db
```

---

## 5. Collections (tables equivalent)

### Show collections in current DB

```javascript
show collections
```

---

## 6. Reading Data (QUERYING)

### Find all documents

```javascript
db.users.find()
```

### Pretty print results

```javascript
db.users.find().pretty()
```

### Find with filter

```javascript
db.users.find({ name: "John" })
```

### Find one document

```javascript
db.users.findOne({ name: "John" })
```

### Filter with operators

```javascript
db.users.find({ age: { $gt: 18 } })   // greater than
db.users.find({ age: { $lt: 18 } })   // less than
```

### Multiple conditions

```javascript
db.users.find({
  age: { $gte: 18 },
  status: "active"
})
```

---

## 7. Creating Data (INSERT)

### Insert one document

```javascript
db.users.insertOne({
  name: "John",
  age: 30,
  status: "active"
})
```

### Insert multiple documents

```javascript
db.users.insertMany([
  { name: "A", age: 20 },
  { name: "B", age: 25 }
])
```

---

## 8. Updating Data

### Update one document

```javascript
db.users.updateOne(
  { name: "John" },
  { $set: { age: 31 } }
)
```

### Update multiple documents

```javascript
db.users.updateMany(
  { status: "inactive" },
  { $set: { status: "active" } }
)
```

### Increment field

```javascript
db.users.updateOne(
  { name: "John" },
  { $inc: { age: 1 } }
)
```

---

## 9. Deleting Data

### Delete one document

```javascript
db.users.deleteOne({ name: "John" })
```

### Delete multiple

```javascript
db.users.deleteMany({ status: "inactive" })
```

---

## 10. Database Administration

### Show current user

```javascript
db.runCommand({ connectionStatus: 1 })
```

### Create database

(implicit when inserting data)

```javascript
use myDatabase
db.users.insertOne({ name: "init" })
```

### Drop database

```javascript
db.dropDatabase()
```

---

## 11. Collection Administration

### Create collection explicitly

```javascript
db.createCollection("users")
```

### Drop collection

```javascript
db.users.drop()
```

---

## 12. Indexing (performance)

### Create index

```javascript
db.users.createIndex({ name: 1 })
```

### Unique index

```javascript
db.users.createIndex({ email: 1 }, { unique: true })
```

### View indexes

```javascript
db.users.getIndexes()
```

---

## 13. Inspect structure

### Show sample documents

```javascript
db.users.find().limit(5)
```

### Count documents

```javascript
db.users.countDocuments()
```

### Check schema shape (quick peek)

```javascript
db.users.findOne()
```

---

## 14. Filtering operators cheat sheet

```
$eq     equals
$ne     not equals
$gt     greater than
$gte    greater or equal
$lt     less than
$lte    less or equal
$in     in array
$nin    not in array
$and    logical AND
$or     logical OR
```

Example:

```javascript
db.users.find({
  $or: [
    { age: { $lt: 18 } },
    { age: { $gt: 65 } }
  ]
})
```

---

## 15. Useful debug commands

### Current DB stats

```javascript
db.stats()
```

### Server status

```javascript
db.serverStatus()
```

---

## 16. Exit shell

```bash
exit
```

---

## 17. Common mistake patterns

* Forgetting `use dbName` → queries go to wrong DB
* Typo in collection name → silently returns empty results
* Missing `$set` in update → replaces entire document
* Confusing `find()` vs `findOne()`

---

