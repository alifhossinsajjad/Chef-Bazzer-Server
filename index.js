const express = require('express')
const cors = require("cors");
const app = express()
require("dotenv").config();



const { MongoClient, ServerApiVersion } = require('mongodb');




const port = process.env.port || 3000





// middelware
app.use(express.json());
app.use(cors());


const uri = "mongodb+srv://alifhossinsajjad123456_db_user:msmitIoNca5nBTEf@chefdb.qtrpqbo.mongodb.net/?appName=chefDB";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.get('/', (req, res) => {
  res.send('Chef bazzer server run successfully')
})

async function run() {
  try {
    
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);




app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})