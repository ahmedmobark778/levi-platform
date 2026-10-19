// 👑 ملف تجميعي لشخصيات الذكاء الاصطناعي (Gemini API)

const GEMINI_KEYS = [
  "AQ.Ab8RN6L6GlqGPeyJQfsvtAtMP3xAcvnW2pBGzMlqlu2k6sfFAA",
  "AQ.Ab8RN6LHRYMlFvmt82gZhvLUjPRBj0lKwoY7w53DMTgKnrok8w",
  "AQ.Ab8RN6I46W47wyC_srOaoqMgFLjZBOSKbQm-vcxfu5cYnY4rQw",
  "AQ.Ab8RN6JFR0qKhrxW_Yd5QJJVfzX3wInKGaAie-Vg8ZP5rOY1-Q"
];

async function askGemini(prompt) {
  for (const key of GEMINI_KEYS) {
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      if (data.candidates && data.candidates[0]) {
        return data.candidates[0].content.parts[0].text;
      }
    } catch(e) { continue; }
  }
  return "عذراً، الذكاء الاصطناعي مشغول حالياً. جرب تاني.";
}

const characters = {
  'إيرن': { name: 'Eren Yeager', prompt: 'أنت إيرين ييغر من انمي هجوم العمالقة. غاضب، ثائر، تحب الحرية، وبتتكلم بحماس شديد.' },
  'eren': { alias: 'إيرن' },
  'إيتاتشي': { name: 'Itachi Uchiha', prompt: 'أنت إيتاتشي أوتشيها من انمي ناروتو. هادئ جداً، عميق، قليل الكلام، وبتحلل الأمور بحكمة.' },
  'itachi': { alias: 'إيتاتشي' },
  'لوفي': { name: 'Monkey D. Luffy', prompt: 'أنت مونكي دي لوفي من انمي ون بيس. طفولي، بتحب اللحمة، ومتحمس جداً وبتحب المغامرات.' },
  'luffy': { alias: 'لوفي' },
  'ميكاسا': { name: 'Mikasa Ackerman', prompt: 'أنت ميكاسا أكرمان. جادة، قوية، بتحمي اللي بتحبهم، وكلامك قليل ومباشر.' },
  'mikasa': { alias: 'ميكاسا' }
};

const handler = async (m, { conn, text, command }) => {
  let charKey = command;
  if (characters[charKey] && characters[charKey].alias) charKey = characters[charKey].alias;
  
  const char = characters[charKey];
  if (!char) return;
  if (!text) return m.reply(`*اكتب سؤالك بعد الأمر ${command}*`);

  const loadingMsg = await conn.sendMessage(m.chat, { text: "```⏳ جـاري تـحـضـيـر الـرد...```" }, { quoted: m });

  // نجهز البرومبت (Prompt) للذكاء الاصطناعي
  const fullPrompt = `${char.prompt}\nاسم المستخدم اللي بيكلمك هو: ${m.pushName || 'صديقي'}.\nرد على رسالته دي بالعامية المصرية وبشخصيتك: ${text}`;

  const reply = await askGemini(fullPrompt);

  await conn.sendMessage(m.chat, {
    text: reply,
    edit: loadingMsg.key
  }, { quoted: m });
};

handler.command = ['إيرن', 'eren', 'إيتاتشي', 'itachi', 'لوفي', 'luffy', 'ميكاسا', 'mikasa'];

export default handler;
