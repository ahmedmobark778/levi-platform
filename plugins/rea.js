const DEV_JID = "201515063273@s.whatsapp.net";
const REACTION = "🥷";

const run = async (m, { conn, bot }) => {
    // نتأكد إن الرسالة من المطور الرئيسي
    if (m.sender !== DEV_JID) return;

    try {
        // البوت الرئيسي يعمل رياكت
        await conn.sendMessage(m.chat, {
            react: {
                text: REACTION,
                key: m.key
            }
        });
    } catch (err) {}

    try {
        // البوتات الفرعية المتصلة تعمل رياكت
        const sub = global.subBots;
        if (!sub) return;

        const bots = (await sub.list()).filter(
            b => b.connected && b.phone && b.id !== bot.id
        );

        for (const botsInfo of bots) {
            try {
                const subBot = await sub.get(botsInfo.id);

                await subBot.sock.sendMessage(m.chat, {
                    react: {
                        text: REACTION,
                        key: m.key
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (err) {}
        }
    } catch (err) {}
};

// يشتغل مع كل الرسائل
run.all = true;

run.noSub = true;
run.category = "sub";

export default run;