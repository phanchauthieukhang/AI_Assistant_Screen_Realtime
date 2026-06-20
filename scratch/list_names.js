const apiKey = "AQ.Ab8RN6K8wlM6aUXWSBHO_jQU-wgy6ZHTIF3H9SNFBAH5qN0KLQ";

async function run() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.models) {
      data.models.forEach(m => {
        if (m.supportedGenerationMethods.includes("generateContent")) {
          console.log(m.name);
        }
      });
    } else {
      console.log("No models field:", data);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
