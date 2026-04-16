# Running CatMongo on Ubuntu

A step-by-step guide to getting the Cat API running locally on Ubuntu.
Covers Node.js, MongoDB, the project itself, and how to interact with the API.

---

## Prerequisites

### 1. Node.js 20

Ubuntu's default `nodejs` package is often outdated. Install from the NodeSource repository instead.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node -v   # should print v20.x.x
npm -v    # should print 10.x.x or higher
```

### 2. MongoDB 7

Add the official MongoDB repository and install:

```bash
sudo apt install -y gnupg curl

curl -fsSL https://pgp.mongodb.com/server-7.0.asc \
  | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org
```

Start MongoDB and enable it on boot:

```bash
sudo systemctl enable --now mongod
```

Verify it is running:

```bash
sudo systemctl status mongod
```

You should see `Active: active (running)`. If not, check the logs:

```bash
journalctl -u mongod --no-pager | tail -30
```

### 3. Create the MongoDB user

The project connects as `admin` / `secret`. Set that up once inside the MongoDB shell:

```bash
mongosh
```

```js
use admin
db.createUser({
  user: "admin",
  pwd: "secret",
  roles: [{ role: "readWrite", db: "testdb" }]
})
exit
```

> If you want a different username or password, update the `MONGO_URL` environment
> variable before starting the API (see [Configuration](#configuration) below).

---

## Project Setup

### Unzip and install dependencies

```bash
unzip catmongo-fixed.zip
cd catmongo-fixed
npm install
```

`npm install` downloads all runtime and development dependencies declared in
`package.json`, including Express, the MongoDB driver, Swagger UI, and the
TypeScript compiler.

---

## Running the API

### Development mode (recommended while learning)

```bash
npm run dev
```

This uses `ts-node-dev`, which runs TypeScript directly — no compilation step
needed. It also watches for file changes and restarts automatically.

You should see:

```
Connected to MongoDB
Cat API running on http://localhost:5000
Swagger UI:  http://localhost:5000/docs
Raw spec:    http://localhost:5000/openapi.yaml
```

### Production build (optional)

Compile TypeScript to JavaScript, then run the output:

```bash
npm run build
npm start
```

---

## Configuration

The only setting you are likely to need is the MongoDB connection string.
The default is:

```
mongodb://admin:secret@localhost:27017/?authSource=admin
```

Override it with an environment variable before starting:

```bash
export MONGO_URL="mongodb://myuser:mypassword@localhost:27017/?authSource=admin"
npm run dev
```

---

## Exploring the API

### Swagger UI

Open your browser and go to:

```
http://localhost:5000/docs
```

This is an interactive interface generated from the OpenAPI spec. You can:

- Read the description of every endpoint and every field.
- Click **Try it out** on any endpoint, fill in the form, and execute a real request.
- See the exact request body schema and example values.

### Raw OpenAPI spec

```
http://localhost:5000/openapi.yaml
```

Download or reference this URL in tools like Postman, Insomnia, or any OpenAPI
code generator.

---

## Using the API with curl

The examples below use `curl` and `jq` for pretty-printing. Install `jq` if you
don't have it:

```bash
sudo apt install -y jq
```

### Create a cat

```bash
curl -s -X POST http://localhost:5000/cats \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Luna",
    "age": 2,
    "breed": "Maine Coon",
    "color": "black",
    "indoor": true
  }' | jq
```

Example response — note `_id` is a MongoDB ObjectId string, not an integer:

```json
{
  "_id": "6627c4e2a1b2c3d4e5f60001",
  "name": "Luna",
  "age": 2,
  "breed": "Maine Coon",
  "color": "black",
  "indoor": true
}
```

Copy the `_id` value from your response for the commands below.

### List all cats

```bash
curl -s http://localhost:5000/cats | jq
```

### Get one cat by ID

```bash
curl -s http://localhost:5000/cats/6627c4e2a1b2c3d4e5f60001 | jq
```

### Update a cat (partial update)

Only the fields you include are changed. The rest stay as-is.

```bash
curl -s -X PUT http://localhost:5000/cats/6627c4e2a1b2c3d4e5f60001 \
  -H "Content-Type: application/json" \
  -d '{"age": 3}' | jq
```

### Delete a cat

A successful delete returns HTTP 204 with no body.

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X DELETE http://localhost:5000/cats/6627c4e2a1b2c3d4e5f60001
```

### Request validation in action

The API rejects invalid input automatically. Try sending a missing required
field:

```bash
curl -s -X POST http://localhost:5000/cats \
  -H "Content-Type: application/json" \
  -d '{"name": "Nemo"}' | jq
```

Response:

```json
{
  "message": "request/body must have required property 'age'",
  "errors": [...]
}
```

---

## Ports at a glance

| Service     | Port  |
|-------------|-------|
| Cat API     | 5000  |
| Swagger UI  | 5000  |
| MongoDB     | 27017 |

---

## Troubleshooting

### MongoDB won't start

```bash
sudo systemctl status mongod
journalctl -u mongod --no-pager | tail -50
```

Common cause: `/var/lib/mongodb` or `/var/log/mongodb` has wrong ownership.
Fix with:

```bash
sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb
sudo systemctl restart mongod
```

### "Authentication failed" from the API

The API cannot connect to MongoDB. Double-check the user was created correctly:

```bash
mongosh -u admin -p secret --authenticationDatabase admin
```

If that fails, re-run the `db.createUser(...)` step from the Prerequisites section.

### Port 5000 already in use

Find what is using it and kill it, or just change the port in `src/index.ts`
(look for `app.listen(5000, ...)`).

```bash
sudo lsof -i :5000
```

### TypeScript errors after editing

Run the compiler to see them all at once:

```bash
npx tsc --noEmit
```

