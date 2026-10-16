/**
 * Native Push Notification Service for Shree Mata Apps
 * Reads Firebase (FCM) credentials from environment variables.
 * Never commits secrets.
 */
const User = require("../models/User");

async function sendPushNotification({ userId, title, body, data }) {
  try {
    if (!userId || !title) return;

    const user = await User.findById(userId);
    if (!user || !user.deviceTokens || user.deviceTokens.length === 0) return;

    const fcmServerKey = process.env.FCM_SERVER_KEY;
    if (!fcmServerKey) {
      console.log(`ℹ️ [Push Notification] FCM_SERVER_KEY not set. Push logged: "${title}" -> ${user.email}`);
      return;
    }

    const fetch = global.fetch || require("node-fetch");

    for (const dev of user.deviceTokens) {
      try {
        const payload = {
          to: dev.token,
          notification: {
            title,
            body,
            sound: "default"
          },
          data: data || {}
        };

        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `key=${fcmServerKey}`
          },
          body: JSON.stringify(payload)
        });

        const resData = await response.json();
        console.log(`📱 Push dispatched to ${dev.platform} device:`, resData);
      } catch (devErr) {
        console.warn(`Failed to dispatch push to token ${dev.token}:`, devErr.message);
      }
    }
  } catch (err) {
    console.error("Error in sendPushNotification:", err);
  }
}

module.exports = { sendPushNotification };
