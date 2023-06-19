import { MongoClient, ServerApiVersion } from 'mongodb';

const mongoDBUri = process.env.MONGODBURI;
export const mongoDbName = process.env.MONGODBNAME
export const mongoDbCollection = process.env.MONGODBCOLLECTION

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
export const mongoClient = new MongoClient(mongoDBUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Start-up test connectivity to MongoDb
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await mongoClient.connect();
    // Send a ping to confirm a successful connection
    await mongoClient.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (err) {
    console.error("Unable to connect to MongoDB. Please ensure the .env file is configured correctly.")
  } finally {
    // Ensures that the client will close when you finish/error
    await mongoClient.close();
  }
}

run().catch(console.dir);
