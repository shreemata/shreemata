const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MongoDB Configuration Error: Neither MONGO_URI nor MONGODB_URI is defined in your environment (.env).");
    console.error("👉 Please set MONGO_URI in your .env file with your local or MongoDB Atlas connection string.");
    return;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`✅ MongoDB connected successfully: host=${conn.connection.host}, database=${conn.connection.name}`);
  } catch (err) {
    console.error(`❌ MongoDB connection error (${err.name}):`, err.message);
    if (err.message.includes("ECONNREFUSED")) {
      console.error("💡 Diagnosis: Connection was refused at the target host/port. If using local MongoDB, ensure the mongod service is running. If using Atlas, verify the host in MONGO_URI.");
    } else if (err.message.includes("bad auth") || err.message.includes("Authentication failed")) {
      console.error("💡 Diagnosis: MongoDB authentication failed. Please check the username and password in your MONGO_URI.");
    } else if (err.message.includes("querySrv ENOTFOUND") || err.message.includes("timed out") || err.message.includes("whitelist")) {
      console.error("💡 Diagnosis: Network/DNS timeout reaching MongoDB cluster. If using MongoDB Atlas, check your network and ensure your IP address is in Atlas Network Access whitelist.");
    }
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB connection disconnected.");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error event:", err.message);
});

module.exports = connectDB;

