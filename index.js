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

function generateTrackingId() {
  const prefix = "PKG";
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `${prefix}-${date}-${randomHex}`;
}

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
    const orderCollection = db.collection("orders");
    const paymentCollections = db.collection("payments");
    const trackingsCollections = db.collection("trackings");

    //middleware admin before allowing admin activity
    //must be used after verifyFBToken middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollections.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //verify for chef
    const verifyChef = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollections.findOne(query);
      if (!user || user.role !== " rider") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //tracking middle ware
    const logTracking = async (trackingId, status) => {
      const log = {
        trackingId,
        status,
        details: status.split("_").join(" "),
        createdAt: new Date(),
      };
      const result = await trackingsCollections.insertOne(log);
      return result;
    };

    //this api for admin when hw search a user

    app.get("/users", verifyFBToken, async (req, res) => {
      const search = req.body.search;
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }
      const cursor = usersCollections
        .find(query)
        .sort({ createdAt: -1 })
        .limit(20);
      const result = await cursor.toArray();
      res.send(result);
    });

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

    // Order API
    app.post("/orders", async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    //payment api

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;

      const amount = parseInt(paymentInfo.price) * 100;
      const session = await stripe.checkout.session.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              product_data: {
                name: `order payment for ${paymentInfo.mealName}`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: paymentInfo.userEmail,
        metadata: {
          foodId: paymentInfo.parcelId,
          mealName: paymentInfo.mealName,
          trackingId: paymentInfo.trackingId,
          name: paymentInfo.userName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancled`,
      });

      res.send({ url: session.url });
    });

    //payment success status update
    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const existingPayment = await paymentCollections.findOne(query);
      if (existingPayment) {
        return res.send({
          success: true,
          message: "payment already done",
          transactionId,
          trackingId: existingPayment.trackingId,
        });
      }

      const trackingId = session.metadata.trackingId;

      if (session.payment_status === "paid") {
        const id = session.metadata.foodId;
        const filter = { _id: new ObjectId(id) };
        const update = {
          $set: {
            payment_status: "paid",
            orderStatus: "pending-pickup",
          },
        };
        const result = await mealsCollections.updateOne(filter, update);
        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          name: session.metadata.userName,
          transactionId: session.payment_intent,
          customerEmail: session.userEmail,
          foodId: session.metadata.foodId,
          paymentStatus: session.payment_status,
          mealName: session.metadata.mealName,
          paidAt: new Date().toLocaleString(),
          trackingId: trackingId,
        };

        if (session.payment_status === "paid") {
          const result = await paymentCollections.insertOne(payment);
          logTracking(trackingId, "order_paid");
          return res.send({
            success: true,
            modifiedCount: result,
            paymentInfo: resultPayment,
            transactionId: session.payment_intent,
            trackingId: trackingId,
            customerEmail: session.userEmail,
          });
        }
      }
      res.send({success: true})
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
