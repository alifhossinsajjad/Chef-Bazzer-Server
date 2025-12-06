const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

const { MongoClient, ServerApiVersion } = require("mongodb");

const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_API_KEY);

const port = process.env.Port || 3000;

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);

const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const crypto = require("crypto");
const { log } = require("console");

// middelware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@chefdb.qtrpqbo.mongodb.net/?appName=chefDB`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Chef bazzer server run successfully");
});

async function run() {
  try {
    // await client.connect();

    const db = client.db("chefDB");
    const usersCollections = db.collection("users");
    const mealsCollections = db.collection("meals");

    //get the role base users
    app.get("/users/:email/role", async (req, res) => {
      try {
        const { email } = req.params;
        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Email parameter is required",
          });
        }

        const user = await usersCollections.findOne({ email });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
            role: "user",
          });
        }
        return res.status(200).json({
          success: true,
          role: user.role || "user",
          status: user.status || "active",
        });
      } catch (error) {
        console.error("Error fetching user role:", error);

        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    //login users
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.status = "active";
      user.createdAt = new Date();
      const query = { email: user?.email };

      const existingUser = await usersCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await usersCollections.insertOne(user);
      res.send(result);
    });

    //get the all meals
    app.get("/meals", async (req, res) => {
      const result = await mealsCollections.find().toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
