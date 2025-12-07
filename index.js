const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
const { log, error } = require("console");

// middelware
app.use(express.json());
app.use(cors());

//verify FB Token
const verifyFBToken = async (req, res, next) => {
  const token = req.headers?.authorization;

  if (!token) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized Access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decodedToken.email;
  } catch (error) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  next();
};

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
    const reviewsCollection = db.collection("reviews");
    const favoritesCollection = db.collection("favorites");

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

    //get the all meals with search and pagination
    app.get("/meals", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 9;
        const search = req.query.search || "";

        const query = {
          $or: [{ ChefName: { $regex: search, $options: "i" } }],
        };

        const total = await mealsCollections.countDocuments(query);
        const result = await mealsCollections
          .find(query)
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();

        res.send({
          meals: result,
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
        });
      } catch (error) {
        console.error("Error fetching meals:", error);
        res.status(500).send({ message: "Error fetching meals" });
      }
    });

    //get meals details

    app.get("/meals-details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollections.findOne(query);
      res.send(result);
    });

    // Reviews APIs
    app.get("/reviews/:foodId", async (req, res) => {
      const foodId = req.params.foodId;
      const query = { foodId: foodId };
      const result = await reviewsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    // Favorites APIs
    app.post("/favorites", async (req, res) => {
      const favorite = req.body;
      const query = {
        userEmail: favorite.userEmail,
        mealId: favorite.mealId,
      };
      const existingFavorite = await favoritesCollection.findOne(query);
      if (existingFavorite) {
        return res.send({ message: "Already in favorites", insertedId: null });
      }
      const result = await favoritesCollection.insertOne(favorite);
      res.send(result);
    });

    app.get("/favorites/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await favoritesCollection.find(query).toArray();
      res.send(result);
    });

    // Check if partial favorite
    app.get("/favorites/:email/:mealId", async (req, res) => {
      const { email, mealId } = req.params;
      const query = { userEmail: email, mealId: mealId };
      const result = await favoritesCollection.findOne(query);
      res.send({ isFavorite: !!result, _id: result?._id });
    });

    // Delete favorite
    app.delete("/favorites/:email/:mealId", async (req, res) => {
      const { email, mealId } = req.params;
      const query = { userEmail: email, mealId: mealId };
      const result = await favoritesCollection.deleteOne(query);
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
