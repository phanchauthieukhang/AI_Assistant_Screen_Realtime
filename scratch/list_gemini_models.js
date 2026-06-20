const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = "AQ.Ab8RN6K8wlM6aUXWSBHO_jQU-wgy6ZHTIF3H9SNFBAH5qN0KLQ"; // The key from config

async function run() {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // We can't call listModels directly if it is not supported in the SDK version this way,
    // but we can try to request listModels:
    // In @google/generative-ai, listModels is not directly exposed on genAI in some versions,
    // let's check how to list models or fetch a known model.
    // Let's call the API via fetch to see what happens.
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

run();
