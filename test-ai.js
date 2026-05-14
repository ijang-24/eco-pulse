const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function testAI() {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.includes("masukkan")) {
        console.error("❌ ERROR: Kunci API belum diisi di file .env!");
        return;
    }

    console.log("🚀 Menghubungi Google AI...");
    console.log("🔑 Menggunakan Kunci: " + key.substring(0, 10) + "...");

    const genAI = new GoogleGenerativeAI(key);

    const versions = ['v1']; // Pakai v1 saja yang resmi
    const modelsToTry = ["gemini-flash-latest", "gemini-pro-latest", "gemini-2.0-flash-lite"];

    for (const modelName of modelsToTry) {
        console.log(`\n🔍 Mencoba model: ${modelName}...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
            const result = await model.generateContent("Katakan 'Eco-Pulse Aktif!'");
            const response = await result.response;
            console.log(`✅ BERHASIL dengan ${modelName}!`);
            console.log("Jawaban:", response.text());
            console.log(`\n💡 KESIMPULAN: Gunakan "${modelName}" di app.js`);
            return;
        } catch (err) {
            console.error(`❌ GAGAL dengan ${modelName}:`);
            if (err.message.includes("429")) {
                console.error("Pesan: Jatah (Quota) Habis atau Nol.");
            } else {
                console.error(err.message.substring(0, 100));
            }
        }
    }
}

testAI();
