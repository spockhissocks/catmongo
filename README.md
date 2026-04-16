````md
# CatMongo API (Ubuntu Setup)

Node.js + TypeScript + Express + MongoDB REST API.

## System requirements (Ubuntu)

Update system:

```
sudo apt update && sudo apt upgrade -y
````

Install Node.js (recommended via NodeSource):

```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```
node -v
npm -v
```

Install MongoDB (option 1: official repo)

```
sudo apt install -y gnupg curl

curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org
```

Start MongoDB:

```
sudo systemctl enable mongod
sudo systemctl start mongod
sudo systemctl status mongod
```

## Project install

```
npm install
```

## Run in development

```
npm run dev
```

## Expected entry point

```
src/index.ts
```

## If MongoDB is remote or custom

Set connection string in code or environment:

```
export MONGO_URL="mongodb://localhost:27017"
```

## Common ports

* API: 3000 (or configured port)
* MongoDB: 27017

## Troubleshooting

Check MongoDB service:

```
sudo systemctl status mongod
```

Check logs:

```
journalctl -u mongod
```

Check Node process:

```
ps aux | grep node
```


